<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\InboundEmail;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Notifications\TicketAcknowledged;
use App\Notifications\TicketCreated;
use App\Notifications\TicketReplied;
use App\Support\InboundMail\IncomingAttachment;
use App\Support\InboundMail\IncomingMessage;
use App\Support\InboundMail\Mailbox;
use App\Support\InboundMail\TicketPiper;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakeMailbox;
use Tests\TestCase;

/**
 * Email becomes tickets.
 *
 * Driven through `FakeMailbox`, so every decision the piper makes — whose
 * ticket, which ticket, what to skip, what to send — runs for real against
 * the database with nothing but the IMAP socket faked. The command is what
 * the scheduler runs, so the tests that matter go through it.
 */
class InboundMailTest extends TestCase
{
    use RefreshDatabase;

    private FakeMailbox $mailbox;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        Notification::fake();
        Storage::fake('local');

        $this->mailbox = new FakeMailbox;
        $this->app->instance(Mailbox::class, $this->mailbox);

        Setting::put('support_email', 'support@technoware.in');
        Setting::put('mail_from_address', 'noreply@technoware.in');
    }

    /** Switch it on the plain-IMAP way, which needs no consent. */
    private function enable(): void
    {
        Setting::put('inbound_mail_enabled', '1');
        Setting::put('inbound_mail_provider', 'imap');
        Setting::put('inbound_imap_host', 'imap.example.test');
        Setting::put('inbound_imap_username', 'tickets@technoware.in');
        Setting::put('inbound_imap_password', 'secret');
    }

    private function customer(string $email = 'neil@example.test'): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu',
            'email' => $email,
            'password' => 'password-for-tests',
            'status' => CustomerStatus::Active,
        ]);
    }

    private function ticketFor(Customer $customer, TicketStatus $status = TicketStatus::Open): Ticket
    {
        return $customer->tickets()->create([
            'subject' => 'Switch keeps dropping',
            'description' => 'The switch drops its uplink every afternoon.',
            'priority' => 'normal',
            'status' => $status,
        ]);
    }

    private function pipe(IncomingMessage ...$messages): void
    {
        $this->mailbox->messages = array_merge($this->mailbox->messages, $messages);
        $this->artisan('technoware:pipe-inbound-mail')->assertExitCode(0);
    }

    /* ------------------------------------------------------------ the switch */

    public function test_nothing_runs_while_piping_is_off(): void
    {
        $this->mailbox->messages = [FakeMailbox::message()];
        $this->mailbox->refuse = 'the test would have failed here: the mailbox was opened';

        $this->artisan('technoware:pipe-inbound-mail')
            ->expectsOutputToContain('off')
            ->assertExitCode(0);

        $this->assertSame(0, InboundEmail::count());
        $this->assertSame(0, Ticket::count());
        Notification::assertNothingSent();
    }

    public function test_the_switch_alone_is_not_enough(): void
    {
        Setting::put('inbound_mail_enabled', '1');
        Setting::put('inbound_mail_provider', 'imap');
        $this->mailbox->messages = [FakeMailbox::message()];

        $this->artisan('technoware:pipe-inbound-mail')->assertExitCode(0);

        $this->assertSame(0, Ticket::count());
    }

    /* ------------------------------------------------------------ new tickets */

    public function test_an_email_from_a_customer_opens_a_ticket_and_acknowledges_it(): void
    {
        $this->enable();
        $customer = $this->customer();

        $this->pipe(FakeMailbox::message());

        $ticket = Ticket::sole();
        $this->assertSame($customer->id, $ticket->customer_id);
        $this->assertSame('email', $ticket->channel);
        $this->assertSame('The core switch keeps rebooting', $ticket->subject);
        $this->assertStringContainsString('reboots every few hours', $ticket->description);
        $this->assertSame(TicketStatus::Open, $ticket->status);
        $this->assertMatchesRegularExpression('/^TW-\d{4}-\d{5}$/', $ticket->reference);
        $this->assertSame('created', $ticket->events()->sole()->type);

        // The acknowledgement carries the reference — the "auto reply with
        // the ticket no" the mailbox exists for — and the desk is told.
        Notification::assertSentTo($customer, TicketAcknowledged::class, fn ($n) => $n->ticket->is($ticket));
        Notification::assertSentTo(new AnonymousNotifiable, TicketCreated::class, function ($n, $channels, $notifiable) use ($ticket) {
            return $n->ticket->is($ticket) && $notifiable->routes['mail'] === 'support@technoware.in';
        });

        $row = InboundEmail::sole();
        $this->assertSame(InboundEmail::CREATED, $row->outcome);
        $this->assertSame($ticket->id, $row->ticket_id);
        $this->assertStringStartsWith('msg-', $row->message_id);
        $this->assertStringEndsWith('@example.test', $row->message_id);
        $this->assertCount(1, $this->mailbox->processed);
    }

    public function test_the_default_category_and_priority_apply(): void
    {
        $this->enable();
        $category = TicketCategory::create(['name' => 'Network', 'slug' => 'network', 'is_active' => true]);
        Setting::put('inbound_mail_category_id', (string) $category->id);
        Setting::put('inbound_mail_priority', 'high');
        $this->customer();

        $this->pipe(FakeMailbox::message());

        $ticket = Ticket::sole();
        $this->assertSame($category->id, $ticket->ticket_category_id);
        $this->assertSame('high', $ticket->priority->value);
    }

    public function test_an_unknown_sender_gets_a_portal_account_when_asked_to(): void
    {
        $this->enable();

        $this->pipe(FakeMailbox::message(from: 'Priya.Sen@Example.test', fromName: 'Priya Sen'));

        $customer = Customer::sole();
        $this->assertSame('priya.sen@example.test', $customer->email);
        $this->assertSame('Priya Sen', $customer->name);
        $this->assertSame(CustomerStatus::Active, $customer->status);
        $this->assertNotNull($customer->email_verified_at);
        $this->assertNotNull($customer->approved_at);
        $this->assertSame($customer->id, Ticket::sole()->customer_id);
        Notification::assertSentTo($customer, TicketAcknowledged::class);
    }

    public function test_a_sender_with_no_display_name_is_named_from_the_address(): void
    {
        $this->enable();

        $this->pipe(FakeMailbox::message(from: 'ops.team@example.test', fromName: null));

        $this->assertSame('Ops Team', Customer::sole()->name);
    }

    public function test_an_unknown_sender_is_ignored_when_asked_to(): void
    {
        $this->enable();
        Setting::put('inbound_mail_unknown_sender', 'ignore');

        $this->pipe(FakeMailbox::message(from: 'stranger@example.test'));

        $this->assertSame(0, Customer::count());
        $this->assertSame(0, Ticket::count());
        $this->assertSame('skipped:unknown_sender', InboundEmail::sole()->outcome);
        $this->assertCount(1, $this->mailbox->processed);
        Notification::assertNothingSent();
    }

    public function test_the_customer_is_matched_regardless_of_case(): void
    {
        $this->enable();
        $customer = $this->customer('neil@example.test');

        $this->pipe(FakeMailbox::message(from: 'Neil@Example.TEST'));

        $this->assertSame(1, Customer::count());
        $this->assertSame($customer->id, Ticket::sole()->customer_id);
    }

    public function test_html_only_mail_is_stored_as_text(): void
    {
        $this->enable();
        $this->customer();

        $this->pipe(FakeMailbox::message(text: null, html: '<div><p>The <b>core switch</b> keeps rebooting.</p><script>alert(1)</script></div>'));

        $description = Ticket::sole()->description;
        $this->assertStringContainsString('core switch keeps rebooting', $description);
        // Plain text: the console renders a description escaped, so the
        // markup is what must not survive, not the words inside it.
        $this->assertStringNotContainsString('<', $description);
    }

    public function test_a_huge_body_is_truncated_at_the_portal_maximum(): void
    {
        $this->enable();
        $this->customer();

        $this->pipe(FakeMailbox::message(text: str_repeat('word ', 6000)));

        $description = Ticket::sole()->description;
        $this->assertLessThan(20200, mb_strlen($description));
        $this->assertStringContainsString('truncated', $description);
    }

    public function test_a_blank_subject_and_body_still_open_a_ticket(): void
    {
        $this->enable();
        $this->customer();

        $this->pipe(FakeMailbox::message(subject: '   ', text: '', html: null));

        $ticket = Ticket::sole();
        $this->assertSame('(No subject)', $ticket->subject);
        $this->assertSame('(No text.)', $ticket->description);
    }

    /* ---------------------------------------------------------------- replies */

    public function test_a_reply_carrying_the_reference_lands_on_the_ticket(): void
    {
        $this->enable();
        $customer = $this->customer();
        $ticket = $this->ticketFor($customer, TicketStatus::PendingCustomer);

        $this->pipe(FakeMailbox::message(
            subject: "Re: [{$ticket->reference}] We have your ticket: Switch keeps dropping",
            text: "It is still happening.\n\nOn Thu, 18 Sep 2026, Technoware Support wrote:\n> Your reference is {$ticket->reference}.",
        ));

        $this->assertSame(1, Ticket::count());
        $message = $ticket->messages()->sole();
        $this->assertSame('It is still happening.', $message->body);
        $this->assertSame('email', $message->channel);
        $this->assertFalse($message->is_internal);
        // The morph map: "customer", never a class name.
        $this->assertSame('customer', $message->author_type);
        $this->assertSame($customer->id, $message->author_id);

        $this->assertSame(TicketStatus::InProgress, $ticket->fresh()->status);
        $this->assertSame('status_changed', $ticket->events()->latest('id')->first()->type);

        Notification::assertSentTo(new AnonymousNotifiable, TicketReplied::class, fn ($n) => $n->toCustomer === false);
        Notification::assertNotSentTo($customer, TicketAcknowledged::class);

        $row = InboundEmail::sole();
        $this->assertSame(InboundEmail::REPLIED, $row->outcome);
        $this->assertSame($message->id, $row->ticket_message_id);
    }

    public function test_a_reply_on_a_closed_ticket_opens_a_new_one(): void
    {
        $this->enable();
        $customer = $this->customer();
        $closed = $this->ticketFor($customer, TicketStatus::Closed);

        $this->pipe(FakeMailbox::message(subject: "Re: [{$closed->reference}] We have your ticket: Switch keeps dropping"));

        $this->assertSame(2, Ticket::count());
        $new = Ticket::whereKeyNot($closed->id)->sole();
        $this->assertSame('We have your ticket: Switch keeps dropping', $new->subject);
        $this->assertStringStartsWith("Follow-up to {$closed->reference}, which is closed.", $new->description);
        $this->assertSame(0, $closed->messages()->count());
        $this->assertSame(TicketStatus::Closed, $closed->fresh()->status);
        Notification::assertSentTo($customer, TicketAcknowledged::class, fn ($n) => $n->ticket->is($new));
    }

    public function test_a_reply_quoting_a_merged_reference_lands_on_the_target(): void
    {
        $this->enable();
        $customer = $this->customer();
        $target = $this->ticketFor($customer, TicketStatus::InProgress);
        // The chain is followed to its end: old → middle → target.
        $middle = $this->ticketFor($customer, TicketStatus::Closed);
        $middle->update(['merged_into_id' => $target->id]);
        $old = $this->ticketFor($customer, TicketStatus::Closed);
        $old->update(['merged_into_id' => $middle->id]);

        $this->pipe(FakeMailbox::message(subject: "Re: [{$old->reference}] We have your ticket: Switch keeps dropping"));

        // No follow-up ticket: the reply threaded onto where the conversation went.
        $this->assertSame(3, Ticket::count());
        $this->assertSame(0, $old->messages()->count());
        $this->assertSame(0, $middle->messages()->count());
        $message = $target->messages()->sole();
        $this->assertSame('email', $message->channel);
        $this->assertSame($customer->id, $message->author_id);
        $this->assertSame(InboundEmail::REPLIED, InboundEmail::sole()->outcome);
        Notification::assertNotSentTo($customer, TicketAcknowledged::class);
    }

    public function test_a_reference_from_somebody_else_opens_their_own_ticket(): void
    {
        $this->enable();
        $owner = $this->customer('owner@example.test');
        $theirs = $this->ticketFor($owner);

        $this->pipe(FakeMailbox::message(from: 'other@example.test', subject: "Re: [{$theirs->reference}] We have your ticket"));

        $this->assertSame(0, $theirs->messages()->count());
        $new = Ticket::whereKeyNot($theirs->id)->sole();
        $this->assertSame('other@example.test', $new->customer->email);
        $this->assertStringNotContainsString($theirs->reference, $new->subject);
        $this->assertStringNotContainsString($theirs->reference, $new->description);
        Notification::assertNotSentTo($owner, TicketAcknowledged::class);
    }

    /* ----------------------------------------------------------- idempotency */

    public function test_the_same_message_id_is_processed_once(): void
    {
        $this->enable();
        $customer = $this->customer();

        $message = FakeMailbox::message(messageId: '<abc@example.test>');
        $this->pipe($message);

        // The same message, offered again by a mailbox whose flag did not
        // stick — a fresh object with a fresh uid and the same Message-ID.
        $again = FakeMailbox::message(messageId: '<ABC@example.test>', id: 'uid-again');
        $this->pipe($again);

        $this->assertSame(1, Ticket::count());
        $this->assertSame(1, InboundEmail::count());
        Notification::assertSentToTimes($customer, TicketAcknowledged::class, 1);
        $this->assertContains('uid-again', $this->mailbox->processed);
    }

    public function test_a_message_without_a_message_id_is_still_deduplicated(): void
    {
        $this->enable();
        $this->customer();

        $this->pipe(FakeMailbox::message(messageId: '', id: 'a'));
        $this->pipe(FakeMailbox::message(messageId: '', id: 'b'));

        $this->assertSame(1, Ticket::count());
        $this->assertStringEndsWith('@synthetic.technoware', InboundEmail::sole()->message_id);
    }

    public function test_a_row_abandoned_by_a_dead_run_is_taken_over(): void
    {
        $this->enable();
        $this->customer();

        // A run that died between the ledger row and the ticket.
        $stale = InboundEmail::create([
            'message_id' => 'abandoned@example.test', 'provider' => 'imap', 'from_email' => 'neil@example.test',
            'outcome' => InboundEmail::PROCESSING,
        ]);
        InboundEmail::whereKey($stale->id)->update(['updated_at' => now()->subHour()]);

        $this->pipe(FakeMailbox::message(messageId: '<abandoned@example.test>'));

        $this->assertSame(1, Ticket::count());
        $this->assertSame(InboundEmail::CREATED, InboundEmail::sole()->outcome);
    }

    /* ---------------------------------------------------------- what is skipped */

    #[DataProvider('junk')]
    public function test_auto_replies_bounces_lists_and_our_own_mail_are_skipped(string $reason, array $args): void
    {
        $this->enable();
        $this->customer();
        Setting::put('inbound_mail_address', 'tickets@technoware.in');
        User::create(['name' => 'Engineer', 'email' => 'engineer@technoware.in', 'password' => 'password-for-tests', 'is_active' => true]);

        $this->pipe(FakeMailbox::message(...$args));

        $this->assertSame(0, Ticket::count(), "{$reason} became a ticket");
        $this->assertSame("skipped:{$reason}", InboundEmail::sole()->outcome);
        $this->assertCount(1, $this->mailbox->processed);
        Notification::assertNothingSent();
    }

    /** @return array<string, array{string, array<string, mixed>}> */
    public static function junk(): array
    {
        return [
            'the desk notification, from the sender address' => ['own_address', ['from' => 'noreply@technoware.in', 'subject' => '[TW-2026-00001] New ticket: Switch']],
            'a copy from the support address' => ['own_address', ['from' => 'Support@technoware.in']],
            'the piped mailbox writing to itself' => ['own_address', ['from' => 'tickets@technoware.in']],
            'a staff member forwarding a complaint' => ['staff_sender', ['from' => 'engineer@technoware.in']],
            'auto-submitted' => ['auto_submitted', ['headers' => ['Auto-Submitted' => 'auto-replied']]],
            'exchange out-of-office' => ['auto_response_suppress', ['headers' => ['X-Auto-Response-Suppress' => 'All']]],
            'bulk precedence' => ['precedence', ['headers' => ['Precedence' => 'bulk']]],
            'a mailing list' => ['list', ['headers' => ['List-Id' => 'ops.lists.example.test']]],
            'an autoresponder header' => ['auto_reply_header', ['headers' => ['X-Autoreply' => 'yes']]],
            'a bounce by return path' => ['bounce', ['returnPath' => '<>']],
            'a bounce by sender' => ['bounce', ['from' => 'MAILER-DAEMON@example.test']],
            'a delivery report' => ['bounce', ['contentType' => 'multipart/report; report-type=delivery-status']],
            'no usable sender' => ['no_sender', ['from' => 'not an address']],
            'a forged sender the provider caught' => ['spoofed', ['headers' => ['Authentication-Results' => 'mx.google.com; dkim=fail header.i=@victim.example; spf=fail smtp.mailfrom=attacker.example; dmarc=fail (p=REJECT sp=REJECT dis=NONE) header.from=victim.example']]],
            'an exchange composite failure' => ['spoofed', ['headers' => ['Authentication-Results' => 'spf=pass (sender IP is 203.0.113.9) smtp.mailfrom=attacker.example; dkim=none; dmarc=none action=none header.from=victim.example; compauth=fail reason=001']]],
            'spf failed and nothing signed it' => ['spoofed', ['headers' => ['Authentication-Results' => 'mx.example; spf=fail smtp.mailfrom=victim.example; dkim=none']]],
        ];
    }

    /** A message that passed the provider's checks, or carries no verdict at all, is a person. */
    public function test_a_provider_pass_or_no_verdict_is_not_spoofed(): void
    {
        $this->enable();
        $this->customer();

        $this->pipe(FakeMailbox::message(headers: ['Authentication-Results' => 'mx.google.com; dkim=pass header.i=@example.test; spf=fail smtp.mailfrom=forwarder.example; dmarc=pass header.from=example.test']));
        $this->assertSame(1, Ticket::count(), 'A forwarded message that DKIM still vouches for is a person.');

        $this->pipe(FakeMailbox::message(subject: 'Second, no header'));
        $this->assertSame(2, Ticket::count(), 'A bare IMAP server stamps nothing; nothing changes for it.');
    }

    public function test_auto_submitted_no_is_a_person(): void
    {
        $this->enable();
        $this->customer();

        $this->pipe(FakeMailbox::message(headers: ['Auto-Submitted' => 'no']));

        $this->assertSame(1, Ticket::count());
    }

    /* ------------------------------------------------------------ attachments */

    public function test_attachments_follow_the_portal_rule(): void
    {
        $this->enable();
        $this->customer();

        $pdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        $neverRead = fn () => throw new \LogicException('an oversize attachment was read off the socket');

        $this->pipe(FakeMailbox::message(attachments: [
            FakeMailbox::attachment('diagram.pdf', $pdf, 'application/pdf'),
            FakeMailbox::attachment('switch.log', "Sep 18 10:00 core-sw-01 reboot\n", 'text/plain'),
            FakeMailbox::attachment('tool.exe', 'MZ', 'application/octet-stream'),
            FakeMailbox::attachment('notepad.pdf', 'MZ not a pdf at all', 'application/pdf'),
            new IncomingAttachment('dump.log', 'text/plain', 200 * 1024 * 1024, false, null, $neverRead),
            FakeMailbox::attachment('logo.png', 'PNG', 'image/png', inline: true, contentId: 'logo@sig'),
        ]));

        $ticket = Ticket::sole();
        $stored = $ticket->attachments()->orderBy('id')->get();
        $this->assertSame(['diagram.pdf', 'switch.log'], $stored->pluck('filename')->all());
        $this->assertSame('local', $stored[0]->disk);
        $this->assertStringStartsWith("tickets/{$ticket->id}/", $stored[0]->path);
        $this->assertStringEndsWith('.pdf', $stored[0]->path);
        Storage::disk('local')->assertExists($stored[0]->path);
        $this->assertSame('application/pdf', $stored[0]->mime);

        $this->assertStringContainsString('tool.exe (type)', $ticket->description);
        $this->assertStringContainsString('notepad.pdf (type)', $ticket->description);
        $this->assertStringContainsString('dump.log (over', $ticket->description);
        $this->assertStringNotContainsString('logo.png', $ticket->description);
        $this->assertStringContainsString('tool.exe', (string) InboundEmail::sole()->reason);
    }

    public function test_a_sixth_attachment_is_dropped_and_named(): void
    {
        $this->enable();
        $this->customer();

        $files = [];
        for ($i = 1; $i <= 6; $i++) {
            $files[] = FakeMailbox::attachment("log{$i}.txt", "line {$i}\n");
        }

        $this->pipe(FakeMailbox::message(attachments: $files));

        $this->assertSame(5, Ticket::sole()->attachments()->count());
        $this->assertStringContainsString('log6.txt (more than 5 files)', Ticket::sole()->description);
    }

    /* --------------------------------------------------------------- failures */

    public function test_a_refused_login_is_recorded_where_somebody_will_see_it(): void
    {
        $this->enable();
        $this->mailbox->refuse = 'AUTHENTICATIONFAILED Invalid credentials (Failure)';

        $this->artisan('technoware:pipe-inbound-mail')
            ->expectsOutputToContain('Invalid credentials')
            ->assertExitCode(0);

        $this->assertStringContainsString('Invalid credentials', (string) Setting::get('inbound_mail_error'));
        $this->assertSame(0, InboundEmail::count());
    }

    public function test_a_clean_run_clears_the_last_error_and_stamps_the_time(): void
    {
        $this->enable();
        $this->customer();
        Setting::put('inbound_mail_error', 'something earlier');

        $this->pipe(FakeMailbox::message());

        $this->assertNull(Setting::get('inbound_mail_error'));
        $this->assertNotNull(Setting::get('inbound_mail_last_run'));
    }

    public function test_a_message_that_fails_is_marked_failed_and_not_retried(): void
    {
        $this->enable();
        $this->customer();

        // A subject the column cannot take is the simplest way to make the
        // write itself fail after every check has passed.
        $poison = FakeMailbox::message(subject: str_repeat('x', 200).' still fine', text: 'body');
        Ticket::creating(fn (Ticket $t) => throw new \RuntimeException('the disk is full'));

        $this->pipe($poison);

        $row = InboundEmail::sole();
        $this->assertSame(InboundEmail::FAILED, $row->outcome);
        $this->assertStringContainsString('disk is full', (string) $row->reason);
        $this->assertStringContainsString('disk is full', (string) Setting::get('inbound_mail_error'));
        $this->assertSame(0, Ticket::count());
        $this->assertCount(1, $this->mailbox->processed);
        Notification::assertNothingSent();

        // Offered again, it is a duplicate and nothing is retried.
        $this->pipe(FakeMailbox::message(messageId: $poison->messageId, id: 'uid-retry'));
        $this->assertSame(InboundEmail::FAILED, InboundEmail::sole()->outcome);
    }

    public function test_the_piper_can_be_asked_directly(): void
    {
        $this->enable();
        $this->customer();

        $tally = app(TicketPiper::class)->run();

        $this->assertTrue($tally->ran);
        $this->assertSame(0, $tally->total());
    }
}
