<?php

namespace Tests\Feature;

use App\Enums\CampaignStatus;
use App\Enums\CustomerStatus;
use App\Enums\SignInAudience;
use App\Models\Customer;
use App\Models\MailTemplate;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Notifications\SignInCodeIssued;
use App\Notifications\TicketCreated;
use App\Support\Newsletter\CampaignSender;
use App\Support\QueueHealth;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\MailManager;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
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

        /*
         * And a scheduler that is running, because queueing is now conditional
         * on something being there to drain it.
         *
         * Without this the suite would be measuring the *fallback* while
         * claiming to measure the queue: `Notifier` sends immediately when no
         * heartbeat and no worker pulse can be found, which on a fresh test
         * database is exactly the state. The tests that assert a job count are
         * asserting the queued path, so the precondition for that path has to
         * be established rather than assumed — the same rule this project
         * already applies to `queue.default`, one line above.
         *
         * `idleQueue()` is the other half, for the tests that want the
         * fallback.
         */
        $this->drainingQueue();
    }

    /** A scheduler that ran a moment ago, so notifications queue. */
    private function drainingQueue(): void
    {
        Cache::put(QueueHealth::HEARTBEAT_KEY, time());
        app()->forgetInstance('notifier.queue.draining');
    }

    /** No scheduler, no worker — the state that loses mail, and rescues it. */
    private function idleQueue(): void
    {
        Cache::forget(QueueHealth::HEARTBEAT_KEY);
        Cache::forget(QueueHealth::WORKER_KEY);
        app()->forgetInstance('notifier.queue.draining');
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

    /**
     * A message switched off in the console is skipped when the job runs.
     *
     * The switch is `shouldSend()` on the trait, which the framework asks at
     * *delivery* — so it is read when the worker picks the job up, not when
     * the ticket was raised. Two jobs queue (the receipt and the desk copy),
     * one is switched off, one message goes out, and nothing falls into
     * `failed_jobs`: skipped is not failed.
     */
    public function test_a_switched_off_message_is_skipped_by_the_worker(): void
    {
        Setting::updateOrCreate(
            ['key' => 'support_email'],
            ['value' => 'desk@example.test', 'group' => 'contact', 'type' => 'string', 'is_secret' => false],
        );
        MailTemplate::create(['key' => 'ticket_created', 'sends' => false]);

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

        $this->assertSame(2, DB::table('jobs')->count(), 'the switch is read at delivery, not at dispatch');

        Artisan::call('queue:work', ['--stop-when-empty' => true, '--tries' => 3]);

        $this->assertSame(0, DB::table('jobs')->count());
        $this->assertSame(0, DB::table('failed_jobs')->count());

        $sent = app(MailManager::class)->mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(1, $sent, 'the acknowledgement went, the desk copy did not');
        $this->assertStringContainsString('We have your ticket', $sent[0]->getOriginalMessage()->getSubject());
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

    /**
     * The rescue: with nothing draining the queue, the mail goes now.
     *
     * This is the failure the whole rule exists for, and it is not a
     * hypothetical one. A contact form sent no email for two days while ten
     * jobs sat in this table, because the scheduler had stopped — and a queued
     * send reports success to everybody: nothing throws, nothing is logged, no
     * `mail_error` is written, and the console looks perfectly healthy.
     * Queueing is an optimisation, and an optimisation that loses the message
     * is worse than the cost it avoids.
     */
    public function test_nothing_draining_means_the_mail_is_sent_during_the_request(): void
    {
        $this->idleQueue();
        $this->deskAndCategory();

        $this->raiseTicket();

        // Nothing queued, because nothing would have come back for it.
        $this->assertSame(0, DB::table('jobs')->count());

        // And actually delivered, which is the half that matters: dispatching
        // nothing and sending nothing look identical in a job count.
        $this->assertCount(2, $this->sentMessages());
    }

    /**
     * A bare `queue:work` counts, not only the scheduler.
     *
     * The same correction `QueueHealth` already had to make once: a worker
     * started by hand or under supervisor delivers mail perfectly well and
     * touches the cron entry not at all, so a rule that knew only about the
     * scheduler would put every send on the request path of an install that is
     * draining its queue faster than the cron could.
     */
    public function test_a_worker_pulse_is_enough_to_keep_queueing(): void
    {
        $this->idleQueue();
        Cache::put(QueueHealth::WORKER_KEY, time());
        app()->forgetInstance('notifier.queue.draining');

        $this->deskAndCategory();
        $this->raiseTicket();

        $this->assertSame(2, DB::table('jobs')->count());
    }

    /**
     * A stale heartbeat is not a running scheduler.
     *
     * The threshold is `QueueHealth::HEARTBEAT_SECONDS`, deliberately the
     * existing one rather than a second number invented for this rule — two
     * definitions of "delivering" one click apart is how the newsletter ended
     * up with two definitions of "delivered".
     */
    public function test_a_stale_heartbeat_falls_back_to_sending_now(): void
    {
        $this->idleQueue();
        Cache::put(QueueHealth::HEARTBEAT_KEY, time() - (QueueHealth::HEARTBEAT_SECONDS + 60));
        app()->forgetInstance('notifier.queue.draining');

        $this->deskAndCategory();
        $this->raiseTicket();

        $this->assertSame(0, DB::table('jobs')->count());
    }

    /**
     * A campaign queues whatever the queue is doing, and must.
     *
     * The one rule here about what *cannot* happen. A campaign is thousands of
     * recipients in batches deliberately spaced out to keep the relay happy;
     * putting that on a request path would hang the browser and defeat the rate
     * limiting at the same time. It is safe structurally rather than by
     * remembering — campaigns go out as `SendCampaignBatch` jobs sent with
     * `Mail::to()->send()` and never touch `Notifier` — and this is what fails
     * if somebody ever routes them through it.
     */
    public function test_a_campaign_is_queued_even_when_nothing_is_draining(): void
    {
        $this->idleQueue();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        NewsletterSubscriber::create(['email' => 'reader@example.test'])
            ->groups()->attach($group->id);

        $campaign = NewsletterCampaign::create([
            'name' => 'Autumn note',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>'.str_repeat('Readable words. ', 20)
                .'</p><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>',
            'text_content' => str_repeat('Readable words. ', 20),
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Ready,
        ]);
        $campaign->groups()->attach($group->id);

        CampaignSender::queue($campaign->fresh());

        // A job, not a send — with no scheduler and no worker anywhere.
        $this->assertGreaterThan(0, DB::table('jobs')->count());
        $this->assertCount(0, $this->sentMessages());
    }

    /**
     * A synchronous send that fails still tells the operator.
     *
     * `sendNow` runs no job, so `QueuedMail::failed()` never fires — which
     * means the fallback would otherwise have quietly deleted the one signal
     * that survives a swallowed failure. `mail_error` is what the settings
     * screen renders as a banner and what a successful test send clears, and
     * without it a broken mail server looks exactly like a working one.
     */
    public function test_a_failed_immediate_send_is_recorded_for_the_operator(): void
    {
        $this->idleQueue();

        /*
         * The row has to exist to be written to.
         *
         * `Setting::put()` only updates keys that are already there — the
         * settings table is defined by its seeder, and that is what stops the
         * endpoint being turned into an arbitrary key/value store. Deleting
         * the row here made this test fail against perfectly good code, which
         * is the same trap in miniature: on a real install `mail_error` is
         * seeded (`SettingsSeeder`, group `mail`), so the write lands.
         */
        Setting::updateOrCreate(
            ['key' => 'mail_error'],
            ['value' => null, 'group' => 'mail', 'type' => 'string', 'is_secret' => false],
        );

        // A port nothing is listening on, so the send throws inside the request.
        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => 1,
            'mail.mailers.smtp.timeout' => 1,
        ]);
        Mail::purge('smtp');

        $this->deskAndCategory();

        // The ticket is still created: a mail failure may never undo work that
        // is already committed.
        $this->raiseTicket();

        $this->assertNotNull(Setting::where('key', 'mail_error')->value('value'));
    }

    /** The desk address and a category, which raising a ticket needs. */
    private function deskAndCategory(): TicketCategory
    {
        Setting::updateOrCreate(
            ['key' => 'support_email'],
            ['value' => 'desk@example.test', 'group' => 'contact', 'type' => 'string', 'is_secret' => false],
        );

        return TicketCategory::create([
            'name' => 'Network', 'slug' => 'network', 'is_active' => true, 'default_sla_hours' => 8,
        ]);
    }

    /** One ticket, which sends two notifications: the desk and the customer. */
    private function raiseTicket(): void
    {
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/v1/tickets', [
                'subject' => 'A switch is down',
                'description' => 'The core switch in the server room is unreachable.',
                'ticket_category_id' => TicketCategory::query()->value('id'),
                'priority' => 'high',
            ])
            ->assertCreated();
    }

    /**
     * What actually left.
     *
     * `messages()`, not `getSentMessages()` — Laravel's ArrayTransport is its
     * own class rather than Symfony's in-memory one.
     */
    private function sentMessages(): Collection
    {
        return app(MailManager::class)->mailer('array')->getSymfonyTransport()->messages();
    }
}
