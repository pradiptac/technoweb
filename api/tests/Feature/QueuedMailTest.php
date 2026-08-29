<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\SignInAudience;
use App\Models\Customer;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Notifications\SignInCodeIssued;
use App\Notifications\TicketCreated;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\MailManager;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Mail leaves through the queue, except where somebody is waiting for it.
 *
 * `phpunit.xml` pins `QUEUE_CONNECTION=sync`, which is right for every other
 * test — a queued notification runs inline and the assertions about *what* was
 * sent stay simple. It also makes queueing invisible, so these tests set the
 * connection to `database` and then look at the `jobs` table, which is the only
 * way to tell "this left the request" from "this was sent during it".
 *
 * That distinction is the entire feature: an unreachable SMTP host was measured
 * taking a contact-form submission from 0.2s to 12.5s, and the fix is that the
 * request no longer waits for the send.
 */
class QueuedMailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // The real driver, so a queued job lands in a table this can count.
        config(['queue.default' => 'database']);
    }

    private function customer(): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu',
            'email' => 'neil@example.test',
            'password' => 'password-for-tests',
            'status' => CustomerStatus::Active,
        ]);
    }

    /**
     * The whole point: raising a ticket does not wait for the mail server.
     *
     * Two notifications go out — one to the desk, one to the customer — and
     * both should be jobs rather than sends.
     */
    public function test_a_ticket_receipt_leaves_through_the_queue(): void
    {
        Setting::updateOrCreate(
            ['key' => 'support_email'],
            ['value' => 'desk@example.test', 'group' => 'contact', 'type' => 'string', 'is_secret' => false],
        );

        $category = TicketCategory::create([
            'name' => 'Network', 'slug' => 'network', 'is_active' => true, 'default_sla_hours' => 8,
        ]);

        $this->assertSame(0, DB::table('jobs')->count());

        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/v1/tickets', [
                'subject' => 'A switch is down',
                'description' => 'The core switch in the server room is unreachable.',
                'ticket_category_id' => $category->id,
                'priority' => 'high',
            ])
            ->assertCreated();

        // Queued, not sent. Had these gone inline the table would be empty and
        // the request would have waited on SMTP for both of them.
        $this->assertSame(2, DB::table('jobs')->count());
    }

    /**
     * A sign-in code is the deliberate exception, and it has to stay one.
     *
     * The queue is drained by the scheduler once a minute, so queueing this
     * would mean waiting up to a minute for a six-digit code somebody is
     * sitting in front of a form to receive. If a refactor ever queues it, the
     * sign-in still "works" in every other test — this is what fails.
     */
    public function test_a_sign_in_code_is_sent_during_the_request(): void
    {
        $this->customer();

        Setting::updateOrCreate(
            ['key' => 'otp_login_enabled'],
            ['value' => '1', 'group' => 'auth', 'type' => 'boolean', 'is_secret' => false],
        );

        $this->postJson('/api/v1/auth/request-code', ['email' => 'neil@example.test'])
            ->assertStatus(202);

        $this->assertSame(0, DB::table('jobs')->count());
    }

    /**
     * The other half of the chain: a queued job is actually delivered.
     *
     * Dispatching proves the request no longer waits; it proves nothing about
     * the message ever leaving. Running the worker the scheduler runs — the
     * same flags — closes that, so this fails if the notification cannot be
     * serialised, if the mailer cannot be built inside a worker, or if the job
     * is dispatched to a queue nothing drains.
     *
     * `MAIL_MAILER=array` in `phpunit.xml`, so nothing is sent anywhere.
     */
    public function test_the_worker_drains_the_queue_and_the_mail_goes_out(): void
    {
        Setting::updateOrCreate(
            ['key' => 'support_email'],
            ['value' => 'desk@example.test', 'group' => 'contact', 'type' => 'string', 'is_secret' => false],
        );

        $category = TicketCategory::create([
            'name' => 'Network', 'slug' => 'network', 'is_active' => true, 'default_sla_hours' => 8,
        ]);

        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/v1/tickets', [
                'subject' => 'A switch is down',
                'description' => 'The core switch in the server room is unreachable.',
                'ticket_category_id' => $category->id,
                'priority' => 'high',
            ])
            ->assertCreated();

        $this->assertSame(2, DB::table('jobs')->count());

        Artisan::call('queue:work', ['--stop-when-empty' => true, '--tries' => 3]);

        // Drained, and nothing fell into failed_jobs on the way.
        $this->assertSame(0, DB::table('jobs')->count());
        $this->assertSame(0, DB::table('failed_jobs')->count());

        // `messages()`, not `getSentMessages()` — Laravel's ArrayTransport is
        // its own class, not Symfony's in-memory one.
        $sent = app(MailManager::class)->mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(2, $sent);
    }

    /** The split, asserted on the classes themselves, so a new notification
     *  that forgets the interface is caught next to the ones that have it. */
    public function test_the_split_is_where_it_is_meant_to_be(): void
    {
        $this->assertInstanceOf(ShouldQueue::class, new TicketCreated(
            new Ticket(['subject' => 'x'])
        ));

        $this->assertNotInstanceOf(ShouldQueue::class, new SignInCodeIssued('123456', SignInAudience::Portal));
    }

    /**
     * A queued failure must still reach the settings screen.
     *
     * This is the trap that comes with moving the send: `Notifier::guard()`
     * catches a send that throws, but a queued notification only *dispatches*
     * during the request, so the guard has nothing to catch. Without the
     * `failed()` hook a dead mail server produces a console that looks healthy
     * while every receipt silently stops.
     */
    public function test_a_failed_delivery_is_recorded_where_an_operator_will_see_it(): void
    {
        Setting::updateOrCreate(
            ['key' => 'mail_error'],
            ['value' => null, 'group' => 'mail', 'type' => 'string', 'is_secret' => false],
        );

        $notification = new TicketCreated(new Ticket(['subject' => 'x']));
        $notification->failed(new \RuntimeException('Connection could not be established'));

        $error = Setting::get('mail_error');

        $this->assertNotNull($error);
        $this->assertStringContainsString('Connection could not be established', $error);
    }
}
