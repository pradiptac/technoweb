<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Models\Setting;
use App\Models\Ticket;
use App\Notifications\TicketAcknowledged;
use App\Notifications\TicketCreated;
use App\Notifications\TicketReplied;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * What the ticket notifications say about being machine mail, and where a
 * reply to them goes.
 *
 * `Auto-Submitted` is on every one of them whatever Settings → Ticketing
 * says — it is what stops two auto-responders answering each other. The
 * Reply-To and the closing sentence follow the switch: with the mailbox
 * being read a reply is invited, without it the receipt still says to use
 * the portal. The headers are added by a callback on the Symfony message,
 * so the test runs the callbacks against a real `Email` rather than
 * reading a property.
 */
class TicketMailHeadersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function ticket(): Ticket
    {
        $customer = Customer::create([
            'name' => 'Neil Basu', 'email' => 'neil@example.test',
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);

        return $customer->tickets()->create([
            'subject' => 'Switch keeps dropping', 'description' => 'It drops every afternoon.',
            'priority' => 'normal', 'status' => 'open',
        ]);
    }

    private function pipingOn(): void
    {
        Setting::put('inbound_mail_enabled', '1');
        Setting::put('inbound_mail_provider', 'imap');
        Setting::put('inbound_imap_host', 'imap.example.test');
        Setting::put('inbound_imap_username', 'tickets@technoware.in');
        Setting::put('inbound_imap_password', 'secret');
    }

    /** @return array{email: Email, mail: MailMessage} */
    private function render(MailMessage $mail): array
    {
        $email = new Email;
        foreach ($mail->callbacks as $callback) {
            $callback($email);
        }

        return ['email' => $email, 'mail' => $mail];
    }

    public function test_the_acknowledgement_invites_a_reply_only_while_the_mailbox_is_read(): void
    {
        $ticket = $this->ticket();

        $off = $this->render((new TicketAcknowledged($ticket))->toMail($ticket->customer));
        $this->assertSame([], $off['mail']->replyTo);
        $this->assertStringContainsString('will not reach us', $off['mail']->render());
        $this->assertSame('auto-replied', $off['email']->getHeaders()->get('Auto-Submitted')?->getBodyAsString());
        $this->assertSame('All', $off['email']->getHeaders()->get('X-Auto-Response-Suppress')?->getBodyAsString());

        $this->pipingOn();

        $on = $this->render((new TicketAcknowledged($ticket))->toMail($ticket->customer));
        $this->assertSame([['tickets@technoware.in', 'Technoware Support']], $on['mail']->replyTo);
        $rendered = $on['mail']->render();
        $this->assertStringContainsString('Reply to this email', $rendered);
        $this->assertStringNotContainsString('will not reach us', $rendered);
        $this->assertSame('auto-replied', $on['email']->getHeaders()->get('Auto-Submitted')?->getBodyAsString());
    }

    public function test_the_typed_address_wins_over_the_login(): void
    {
        $ticket = $this->ticket();
        $this->pipingOn();
        Setting::put('inbound_mail_address', 'Support@Technoware.in');

        $mail = (new TicketAcknowledged($ticket))->toMail($ticket->customer);

        $this->assertSame([['support@technoware.in', 'Technoware Support']], $mail->replyTo);
    }

    public function test_reply_notifications_are_machine_mail_and_only_the_customers_copy_points_back(): void
    {
        $ticket = $this->ticket();
        $this->pipingOn();
        $message = $ticket->messages()->make(['body' => 'Try the other uplink.', 'is_internal' => false]);
        $message->author()->associate($ticket->customer);
        $message->save();

        $toCustomer = $this->render((new TicketReplied($ticket, $message, toCustomer: true))->toMail($ticket->customer));
        $this->assertSame('auto-replied', $toCustomer['email']->getHeaders()->get('Auto-Submitted')?->getBodyAsString());
        $this->assertSame([['tickets@technoware.in', 'Technoware Support']], $toCustomer['mail']->replyTo);

        $toDesk = $this->render((new TicketReplied($ticket, $message, toCustomer: false))->toMail($ticket->customer));
        $this->assertSame('auto-generated', $toDesk['email']->getHeaders()->get('Auto-Submitted')?->getBodyAsString());
        $this->assertSame([], $toDesk['mail']->replyTo);

        $created = $this->render((new TicketCreated($ticket))->toMail($ticket->customer));
        $this->assertSame('auto-generated', $created['email']->getHeaders()->get('Auto-Submitted')?->getBodyAsString());
    }
}
