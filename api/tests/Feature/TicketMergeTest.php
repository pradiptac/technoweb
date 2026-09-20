<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use App\Models\User;
use App\Notifications\TicketMerged;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Merging one ticket into another.
 *
 * What is pinned: the whole move is one transaction — messages and
 * attachments re-pointed, the source closed with `merged_into_id`, an event
 * on each side, an internal note on the target — and every refusal is a
 * 422 with a sentence: the same ticket, another customer's ticket (merging
 * across customers would put one customer's messages on another's ticket,
 * and is refused rather than confirmable), a source already merged, a
 * target that is not open, a reference that does not exist. One
 * `TicketMerged` goes to the customer, and a portal read of the source
 * still answers 200 so the screen can link to where the conversation went.
 */
class TicketMergeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function staff(): User
    {
        $user = User::create([
            'name' => 'Priya Sharma', 'email' => 'engineer@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::SupportEngineer->value], ['name' => RoleEnum::SupportEngineer->label()],
        ));

        return $user->load('roles');
    }

    private function customer(string $email = 'neil@example.test'): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu', 'email' => $email,
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
    }

    private function ticket(Customer $customer, TicketStatus $status = TicketStatus::Open, string $subject = 'Switch keeps dropping'): Ticket
    {
        return $customer->tickets()->create([
            'subject' => $subject,
            'description' => 'The uplink drops every afternoon.',
            'priority' => 'normal',
            'status' => $status,
        ]);
    }

    private function message(Ticket $ticket, Customer $customer, string $body = 'Still happening.'): TicketMessage
    {
        $message = $ticket->messages()->make(['body' => $body, 'is_internal' => false]);
        $message->author()->associate($customer);
        $message->save();

        return $message;
    }

    private function merge(User $staff, Ticket $source, string $into)
    {
        return $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/admin/tickets/{$source->reference}/merge", ['into' => $into]);
    }

    public function test_messages_and_attachments_move_and_the_source_is_closed(): void
    {
        $staff = $this->staff();
        $customer = $this->customer();
        $source = $this->ticket($customer, subject: 'Same switch, again');
        $target = $this->ticket($customer, TicketStatus::InProgress);

        $message = $this->message($source, $customer);
        $attachment = TicketAttachment::create([
            'ticket_id' => $source->id, 'ticket_message_id' => $message->id,
            'disk' => 'local', 'path' => 'tickets/x.png', 'filename' => 'x.png', 'mime' => 'image/png', 'size' => 12,
        ]);
        $onTicket = TicketAttachment::create([
            'ticket_id' => $source->id, 'ticket_message_id' => null,
            'disk' => 'local', 'path' => 'tickets/y.pdf', 'filename' => 'y.pdf', 'mime' => 'application/pdf', 'size' => 34,
        ]);

        $this->merge($staff, $source, $target->reference)
            ->assertOk()
            ->assertJsonPath('data.reference', $target->reference)
            ->assertJsonPath('data.status', 'in_progress');

        // Everything the customer wrote is on the target now.
        $this->assertSame($target->id, $message->fresh()->ticket_id);
        $this->assertSame($target->id, $attachment->fresh()->ticket_id);
        $this->assertSame($target->id, $onTicket->fresh()->ticket_id);
        $this->assertSame(0, $source->messages()->count());
        $this->assertSame(0, $source->attachments()->count());

        // The source is closed, whatever state it was in, and points at the target.
        $source->refresh();
        $this->assertSame(TicketStatus::Closed, $source->status);
        $this->assertNotNull($source->closed_at);
        $this->assertSame($target->id, $source->merged_into_id);

        // One event each side, naming the other.
        $this->assertDatabaseHas('ticket_events', [
            'ticket_id' => $source->id, 'type' => 'merged_into', 'to_value' => $target->reference, 'user_id' => $staff->id,
        ]);
        $this->assertDatabaseHas('ticket_events', [
            'ticket_id' => $target->id, 'type' => 'merged_from', 'from_value' => $source->reference, 'user_id' => $staff->id,
        ]);

        // The note: internal, by the staff member, naming the source and its subject.
        $note = $target->messages()->where('is_internal', true)->sole();
        $this->assertStringStartsWith("Merged from {$source->reference} — Same switch, again", $note->body);
        // The morph map: "user", never a class name.
        $this->assertSame('user', $note->author_type);
        $this->assertSame($staff->id, $note->author_id);

        // Exactly one message to the customer, naming both and linking to the target.
        Notification::assertSentTo($customer, TicketMerged::class, function (TicketMerged $n) use ($source, $target) {
            $mail = $n->toMail($target->customer);
            $rendered = (string) $mail->render();

            return $n->source->is($source) && $n->target->is($target)
                && str_contains($rendered, $source->reference)
                && str_contains($rendered, $target->reference)
                && str_contains($rendered, "/portal/tickets/{$target->reference}");
        });
        Notification::assertSentTimes(TicketMerged::class, 1);

        // Both reads carry `merged_into`: the source names the target, the target nothing.
        $this->actingAs($staff, 'sanctum')
            ->getJson("/api/v1/admin/tickets/{$source->reference}")
            ->assertOk()
            ->assertJsonPath('data.merged_into', $target->reference)
            ->assertJsonPath('data.status', 'closed');
        $this->actingAs($staff, 'sanctum')
            ->getJson("/api/v1/admin/tickets/{$target->reference}")
            ->assertOk()
            ->assertJsonPath('data.merged_into', null)
            ->assertJsonCount(2, 'data.messages');
    }

    public function test_the_target_is_read_case_insensitively_and_trimmed(): void
    {
        $staff = $this->staff();
        $customer = $this->customer();
        $source = $this->ticket($customer);
        $target = $this->ticket($customer);

        $this->merge($staff, $source, '  '.strtolower($target->reference).' ')
            ->assertOk()
            ->assertJsonPath('data.reference', $target->reference);
    }

    public function test_merging_a_ticket_into_itself_is_refused(): void
    {
        $staff = $this->staff();
        $source = $this->ticket($this->customer());

        $this->merge($staff, $source, $source->reference)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['into']);

        $this->assertSame(TicketStatus::Open, $source->fresh()->status);
        Notification::assertNothingSent();
    }

    public function test_merging_across_customers_is_refused(): void
    {
        $staff = $this->staff();
        $source = $this->ticket($this->customer('neil@example.test'));
        $theirs = $this->ticket($this->customer('other@example.test'));
        $this->message($source, $source->customer);

        $response = $this->merge($staff, $source, $theirs->reference)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['into']);

        $this->assertStringContainsString('customer', $response->json('errors.into.0'));
        $this->assertSame(1, $source->messages()->count());
        $this->assertSame(0, $theirs->messages()->count());
        $this->assertNull($source->fresh()->merged_into_id);
        Notification::assertNothingSent();
    }

    public function test_a_source_already_merged_is_refused(): void
    {
        $staff = $this->staff();
        $customer = $this->customer();
        $source = $this->ticket($customer);
        $first = $this->ticket($customer);
        $second = $this->ticket($customer);

        $this->merge($staff, $source, $first->reference)->assertOk();
        $this->merge($staff, $source, $second->reference)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['into']);

        $this->assertSame($first->id, $source->fresh()->merged_into_id);
        Notification::assertSentTimes(TicketMerged::class, 1);
    }

    public function test_a_closed_or_resolved_target_is_refused(): void
    {
        $staff = $this->staff();
        $customer = $this->customer();
        $source = $this->ticket($customer);

        foreach ([TicketStatus::Closed, TicketStatus::Resolved] as $status) {
            $target = $this->ticket($customer, $status);
            $this->merge($staff, $source, $target->reference)
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['into']);
        }

        $this->assertNull($source->fresh()->merged_into_id);
        Notification::assertNothingSent();
    }

    public function test_an_unknown_reference_is_refused_with_a_sentence(): void
    {
        $staff = $this->staff();
        $source = $this->ticket($this->customer());

        $this->merge($staff, $source, 'TW-2026-99999')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['into'])
            ->assertJsonPath('errors.into.0', 'There is no ticket TW-2026-99999.');

        $this->merge($staff, $source, '')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['into']);
    }

    public function test_a_merged_source_cannot_be_moved_out_of_closed(): void
    {
        $staff = $this->staff();
        $customer = $this->customer();
        $source = $this->ticket($customer);
        $target = $this->ticket($customer);
        $this->merge($staff, $source, $target->reference)->assertOk();

        // The desk: a status change on the source is refused, naming the target.
        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/admin/tickets/{$source->reference}", ['status' => 'in_progress'])
            ->assertUnprocessable();

        // The customer: a reopen is refused too. The conversation is elsewhere.
        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$source->reference}/reopen")
            ->assertUnprocessable();

        $this->assertSame(TicketStatus::Closed, $source->fresh()->status);
    }

    public function test_the_portal_reads_a_merged_source_and_is_told_where_it_went(): void
    {
        $staff = $this->staff();
        $customer = $this->customer();
        $source = $this->ticket($customer);
        $target = $this->ticket($customer);
        $this->message($source, $customer);
        $this->merge($staff, $source, $target->reference)->assertOk();

        $this->actingAs($customer, 'sanctum')
            ->getJson("/api/v1/tickets/{$source->reference}")
            ->assertOk()
            ->assertJsonPath('data.merged_into', $target->reference)
            ->assertJsonPath('data.status', 'closed')
            ->assertJsonCount(0, 'data.messages');

        // The target carries the moved message and never the internal note.
        $this->actingAs($customer, 'sanctum')
            ->getJson("/api/v1/tickets/{$target->reference}")
            ->assertOk()
            ->assertJsonPath('data.merged_into', null)
            ->assertJsonCount(1, 'data.messages')
            ->assertJsonPath('data.messages.0.body', 'Still happening.');
    }

    public function test_a_content_manager_cannot_merge(): void
    {
        $editor = User::create([
            'name' => 'Editor', 'email' => 'editor@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $editor->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()],
        ));
        $customer = $this->customer();
        $source = $this->ticket($customer);
        $target = $this->ticket($customer);

        $this->merge($editor->load('roles'), $source, $target->reference)->assertForbidden();
        $this->assertNull($source->fresh()->merged_into_id);
    }
}
