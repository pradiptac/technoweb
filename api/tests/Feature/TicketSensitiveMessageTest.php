<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\TicketMessage;
use App\Models\User;
use App\Models\Webhook;
use App\Models\WebhookDelivery;
use App\Notifications\TicketCreated;
use App\Notifications\TicketReplied;
use App\Support\Webhooks\WebhookPayload;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * "This reply contains sensitive data, encrypt its contents" — on a reply
 * and on the ticket's own description — and the first attachment posted
 * through the reply endpoint in this suite.
 *
 * The sensitive switch is one column and three consequences: the body is
 * ciphertext in the table and plain text on both principals' reads, the
 * notification email announces the reply without quoting it, and no
 * webhook is emitted. Each is pinned on its own, and the last two are the
 * ones that matter — the email and the webhook are the two places a body
 * ever left this system in clear.
 */
class TicketSensitiveMessageTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'The firewall admin password is Hunter2-Rotated-2026.';

    private function customer(): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu', 'email' => 'neil@example.test',
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
    }

    private function staff(): User
    {
        $user = User::create([
            'name' => 'Support Engineer', 'email' => 'engineer@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::SupportEngineer->value], ['name' => RoleEnum::SupportEngineer->label()],
        ));

        return $user->load('roles');
    }

    private function ticket(Customer $customer): Ticket
    {
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);

        return Ticket::create([
            'customer_id' => $customer->id,
            'ticket_category_id' => $category->id,
            'subject' => 'Firewall access',
            'description' => 'We need the console credentials rotated.',
            'status' => TicketStatus::Open,
            'priority' => 'normal',
        ]);
    }

    public function test_a_sensitive_reply_is_ciphertext_in_the_table_and_plain_on_both_reads(): void
    {
        Notification::fake();
        $customer = $this->customer();
        $ticket = $this->ticket($customer);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages", ['body' => self::SECRET, 'is_sensitive' => true])
            ->assertCreated()
            ->assertJsonPath('data.is_sensitive', true)
            ->assertJsonPath('data.body', self::SECRET);

        $stored = DB::table('ticket_messages')->where('ticket_id', $ticket->id)->value('body');
        $this->assertNotSame(self::SECRET, $stored);
        $this->assertStringNotContainsString('Hunter2', $stored);
        $this->assertTrue(TicketMessage::isSealed($stored));
        $this->assertSame(self::SECRET, Crypt::decryptString($stored));

        // The customer's own read, and the desk's.
        $this->actingAs($customer, 'sanctum')
            ->getJson("/api/v1/tickets/{$ticket->reference}")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', self::SECRET)
            ->assertJsonPath('data.messages.0.is_sensitive', true);

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(), 'sanctum')
            ->getJson("/api/v1/admin/tickets/{$ticket->reference}")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', self::SECRET)
            ->assertJsonPath('data.messages.0.is_sensitive', true);
    }

    public function test_a_plain_reply_is_stored_as_written_and_reads_false(): void
    {
        Notification::fake();
        $customer = $this->customer();
        $ticket = $this->ticket($customer);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages", ['body' => 'Still happening this morning.'])
            ->assertCreated()
            ->assertJsonPath('data.is_sensitive', false);

        $this->assertSame('Still happening this morning.', DB::table('ticket_messages')->value('body'));
    }

    public function test_a_staff_reply_may_be_sensitive_too(): void
    {
        Notification::fake();
        $ticket = $this->ticket($this->customer());
        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => self::SECRET, 'is_sensitive' => true])
            ->assertCreated()
            ->assertJsonPath('data.is_sensitive', true)
            ->assertJsonPath('data.body', self::SECRET);

        $this->assertTrue(TicketMessage::isSealed(DB::table('ticket_messages')->value('body')));
    }

    public function test_the_notification_email_announces_a_sensitive_reply_without_quoting_it(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $staff = $this->staff();

        $sensitive = $ticket->messages()->make(['body' => self::SECRET, 'is_sensitive' => true]);
        $sensitive->author()->associate($staff);
        $sensitive->save();

        $rendered = (new TicketReplied($ticket, $sensitive, toCustomer: true))->toMail($customer)->render();
        $this->assertStringContainsString(TicketReplied::SENSITIVE_LINE, $rendered);
        $this->assertStringNotContainsString('Hunter2', $rendered);

        // The control: a plain reply is still quoted.
        $plain = $ticket->messages()->make(['body' => 'We have rotated it; check your inbox.', 'is_sensitive' => false]);
        $plain->author()->associate($staff);
        $plain->save();

        $rendered = (new TicketReplied($ticket, $plain, toCustomer: true))->toMail($customer)->render();
        $this->assertStringContainsString('We have rotated it', $rendered);
        $this->assertStringNotContainsString(TicketReplied::SENSITIVE_LINE, $rendered);
    }

    public function test_a_sensitive_reply_emits_no_webhook_and_a_plain_one_still_does(): void
    {
        Queue::fake();
        Webhook::create([
            'name' => 'CRM', 'url' => 'https://crm.example.com/hooks/technoware',
            'secret' => 'whsec_test', 'events' => ['ticket.replied'], 'is_active' => true,
        ]);
        $ticket = $this->ticket($this->customer());
        $staff = $this->staff();

        $sensitive = $ticket->messages()->make(['body' => self::SECRET, 'is_sensitive' => true]);
        $sensitive->author()->associate($staff);
        $sensitive->save();

        $this->assertSame(0, WebhookDelivery::count());

        $plain = $ticket->messages()->make(['body' => 'We will check and update you.', 'is_sensitive' => false]);
        $plain->author()->associate($staff);
        $plain->save();

        $delivery = WebhookDelivery::where('event', 'ticket.replied')->sole();
        $this->assertSame($plain->id, $delivery->payload['message']['id']);
        $this->assertStringNotContainsString('Hunter2', json_encode($delivery->payload));
    }

    public function test_a_sensitive_body_survives_a_read_modify_write(): void
    {
        $ticket = $this->ticket($this->customer());
        $staff = $this->staff();

        $message = $ticket->messages()->make(['body' => self::SECRET, 'is_sensitive' => true]);
        $message->author()->associate($staff);
        $message->save();

        // The piper's own move: append to the body of a saved row.
        $message->update(['body' => $message->body."\n\n(One attachment was left out.)"]);

        $fresh = TicketMessage::findOrFail($message->id);
        $this->assertSame(self::SECRET."\n\n(One attachment was left out.)", $fresh->body);
        $this->assertTrue(TicketMessage::isSealed(DB::table('ticket_messages')->where('id', $message->id)->value('body')));
    }

    public function test_a_row_that_will_not_decrypt_answers_a_sentence_not_a_500(): void
    {
        Notification::fake();
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $staff = $this->staff();

        $message = $ticket->messages()->make(['body' => self::SECRET, 'is_sensitive' => true]);
        $message->author()->associate($staff);
        $message->save();

        // Ciphertext sealed under another key — APP_KEY having changed.
        $other = base64_encode(json_encode([
            'iv' => base64_encode(random_bytes(16)), 'value' => base64_encode(random_bytes(32)),
            'mac' => str_repeat('0', 64), 'tag' => '',
        ]));
        DB::table('ticket_messages')->where('id', $message->id)->update(['body' => $other]);

        $this->actingAs($customer, 'sanctum')
            ->getJson("/api/v1/tickets/{$ticket->reference}")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', TicketMessage::UNREADABLE);
    }

    public function test_a_sensitive_ticket_s_description_is_sealed_and_read_plain_by_both_sides(): void
    {
        Notification::fake();
        $customer = $this->customer();
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);
        $request = self::SECRET.' Please rotate it once the engineer has finished.';

        $reference = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/tickets', [
                'subject' => 'Firewall access',
                'description' => $request,
                'ticket_category_id' => $category->id,
                'priority' => 'normal',
                'is_sensitive' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.is_sensitive', true)
            ->json('data.reference');

        $stored = DB::table('tickets')->where('reference', $reference)->value('description');
        $this->assertStringNotContainsString('Hunter2', $stored);
        $this->assertTrue(Ticket::isSealed($stored));

        $this->actingAs($customer, 'sanctum')
            ->getJson("/api/v1/tickets/{$reference}")
            ->assertOk()
            ->assertJsonPath('data.is_sensitive', true)
            ->assertJsonPath('data.description', $request);

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(), 'sanctum')
            ->getJson("/api/v1/admin/tickets/{$reference}")
            ->assertOk()
            ->assertJsonPath('data.description', $request);
    }

    public function test_the_new_ticket_email_and_the_webhooks_announce_a_sensitive_ticket_without_its_request(): void
    {
        Queue::fake();
        Webhook::create([
            'name' => 'CRM', 'url' => 'https://crm.example.com/hooks/technoware',
            'secret' => 'whsec_test', 'events' => ['ticket.created'], 'is_active' => true,
        ]);
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $ticket->update(['description' => self::SECRET, 'is_sensitive' => true]);

        $rendered = (new TicketCreated($ticket->fresh()))->toMail($customer)->render();
        $this->assertStringContainsString(TicketCreated::SENSITIVE_LINE, $rendered);
        $this->assertStringNotContainsString('Hunter2', $rendered);

        // The webhook still says a ticket exists — reference, subject, customer —
        // and carries the redaction where the request was. A message is withheld
        // outright; a ticket is not, and the two rules are documented together.
        $sensitive = Ticket::create([
            'customer_id' => $customer->id, 'ticket_category_id' => $ticket->ticket_category_id,
            'subject' => 'Console credentials', 'description' => self::SECRET, 'is_sensitive' => true,
            'status' => TicketStatus::Open, 'priority' => 'normal',
        ]);
        $delivery = WebhookDelivery::where('event', 'ticket.created')->latest('id')->first();
        $this->assertNotNull($delivery);
        $this->assertSame($sensitive->reference, $delivery->payload['reference']);
        $this->assertSame(WebhookPayload::REDACTED, $delivery->payload['description']);
        $this->assertStringNotContainsString('Hunter2', json_encode($delivery->payload));
    }

    public function test_merging_a_sensitive_ticket_seals_the_note_that_quotes_it(): void
    {
        Notification::fake();
        $customer = $this->customer();
        $source = $this->ticket($customer);
        $source->update(['description' => self::SECRET, 'is_sensitive' => true]);
        $target = $this->ticket($customer);
        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/admin/tickets/{$source->reference}/merge", ['into' => $target->reference])
            ->assertOk();

        $note = $target->messages()->where('is_internal', true)->sole();
        $this->assertTrue((bool) $note->is_sensitive);
        $this->assertStringContainsString('Hunter2', $note->body);
        $this->assertStringNotContainsString('Hunter2', DB::table('ticket_messages')->where('id', $note->id)->value('body'));
    }

    /**
     * The first attachment posted through the reply endpoint in this suite —
     * `docs/media.md` records that none existed, and the paste feature is the
     * reason to have one: a clipboard screenshot arrives as a PNG the client
     * has named, and the API keeps that name and sniffs the type.
     */
    public function test_a_pasted_screenshot_is_stored_under_the_name_the_client_gave_it(): void
    {
        Notification::fake();
        Storage::fake('private');
        $customer = $this->customer();
        $ticket = $this->ticket($customer);

        $this->actingAs($customer, 'sanctum')
            ->post("/api/v1/tickets/{$ticket->reference}/messages", [
                'body' => 'Here is what the console shows.',
                'attachments' => [UploadedFile::fake()->image('pasted-20260921-140000.png', 640, 400)],
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.attachments.0.filename', 'pasted-20260921-140000.png')
            ->assertJsonPath('data.attachments.0.mime', 'image/png');

        $this->assertSame(1, $ticket->messages()->sole()->attachments()->count());
    }
}
