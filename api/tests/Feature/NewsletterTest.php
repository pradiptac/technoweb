<?php

namespace Tests\Feature;

use App\Enums\CampaignStatus;
use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Jobs\SendCampaignBatch;
use App\Mail\CampaignMessage;
use App\Models\Customer;
use App\Models\Media;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterCampaignRecipient;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\NewsletterTemplate;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Newsletter\AudienceResolver;
use App\Support\Newsletter\Branding;
use App\Support\Newsletter\CampaignSender;
use App\Support\Newsletter\Csv;
use App\Support\Newsletter\CustomerGroupSync;
use App\Support\Newsletter\EmailRenderer;
use App\Support\Newsletter\HealthCheck;
use App\Support\Newsletter\Spreadsheet;
use App\Support\Newsletter\SubscriberIntake;
use App\Support\Newsletter\TrackingRewriter;
use App\Support\QueueHealth;
use Database\Seeders\NewsletterTemplateSeeder;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Events\Looping;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The newsletter module.
 *
 * The tests worth having here are not the CRUD ones. This module mails
 * thousands of real people and keeps a do-not-mail list with legal weight, so
 * the failures worth engineering against are: mailing somebody who asked not
 * to be, mailing somebody twice, and losing an unsubscribe.
 */
class NewsletterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'nell-newsletter@example.test'],
            ['name' => 'Nell Admin', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if (! $user->roles()->count()) {
            $role = Role::firstOrCreate(
                ['slug' => RoleEnum::Admin->value],
                ['name' => RoleEnum::Admin->label()],
            );
            $user->roles()->attach($role);
        }

        return $user;
    }

    private function subscriber(string $email, ?NewsletterGroup $group = null, array $attributes = []): NewsletterSubscriber
    {
        $s = NewsletterSubscriber::create(['email' => $email, ...$attributes]);

        if ($group) {
            $s->groups()->attach($group->id);
        }

        return $s;
    }

    // ---------------------------------------------------------------- intake

    /**
     * The rule with legal weight, and the one every path must obey.
     *
     * Somebody who unsubscribed is on a spreadsheet a colleague uploads six
     * months later. If the import puts them back, the company mails a person
     * who asked it not to — which is the complaint this whole module is shaped
     * around avoiding.
     */
    public function test_a_suppressed_address_is_refused_however_it_arrives(): void
    {
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        foreach (['import', 'manual', 'signup', 'customer'] as $source) {
            $result = SubscriberIntake::take('GONE@Example.test', ['first_name' => 'Back'], [], $source);

            $this->assertSame(SubscriberIntake::SUPPRESSED, $result['outcome'], "source: {$source}");
        }

        $this->assertSame(0, NewsletterSubscriber::count());
    }

    /** Case is not identity. */
    public function test_addresses_are_matched_without_regard_to_case(): void
    {
        SubscriberIntake::take('John@Example.TEST', ['first_name' => 'John']);
        $second = SubscriberIntake::take('john@example.test', []);

        $this->assertSame(SubscriberIntake::DUPLICATE, $second['outcome']);
        $this->assertSame(1, NewsletterSubscriber::count());
        $this->assertSame('john@example.test', NewsletterSubscriber::first()->email);
    }

    /**
     * An import adds what it knows and never clears what it does not.
     *
     * A second spreadsheet with the address but no company column must not
     * erase a company somebody typed in — treating a missing column as an
     * instruction to blank the field is how a list quietly loses everything.
     */
    public function test_an_import_enriches_and_never_blanks(): void
    {
        SubscriberIntake::take('a@example.test', ['first_name' => 'Ann', 'company' => 'ABC Ltd']);
        SubscriberIntake::take('a@example.test', ['first_name' => '', 'company' => '', 'last_name' => 'Lee']);

        $s = NewsletterSubscriber::first();

        $this->assertSame('Ann', $s->first_name);
        $this->assertSame('ABC Ltd', $s->company);
        $this->assertSame('Lee', $s->last_name);
    }

    // -------------------------------------------------------------- audience

    /**
     * Who a campaign reaches, and everything that must be removed first.
     *
     * The one that is easy to get wrong is the duplicate: somebody in two of
     * the chosen groups is one contact and must receive one email.
     */
    public function test_the_audience_excludes_the_unmailable_and_deduplicates(): void
    {
        $a = NewsletterGroup::create(['name' => 'Group A']);
        $b = NewsletterGroup::create(['name' => 'Group B']);

        $both = $this->subscriber('both@example.test', $a);
        $both->groups()->attach($b->id);

        $this->subscriber('ok@example.test', $a);
        $this->subscriber('left@example.test', $a, ['status' => SubscriberStatus::Unsubscribed]);
        $this->subscriber('dead@example.test', $a, ['status' => SubscriberStatus::Bounced]);

        // Active, in the group, and suppressed anyway — the case a status
        // filter alone would let through, and the one a hard bounce creates.
        $this->subscriber('hidden@example.test', $a);
        NewsletterSuppression::add('hidden@example.test', SuppressionReason::HardBounce);

        $eligible = AudienceResolver::eligible([$a->id, $b->id]);

        $this->assertEqualsCanonicalizing(
            ['both@example.test', 'ok@example.test'],
            $eligible->pluck('email')->all(),
        );

        $preview = AudienceResolver::preview([$a->id, $b->id]);

        $this->assertSame(6, $preview['group_contacts']);
        $this->assertSame(1, $preview['duplicates_removed']);
        $this->assertSame(1, $preview['unsubscribed_removed']);
        $this->assertSame(1, $preview['bounced_removed']);
        $this->assertSame(1, $preview['suppressed_removed']);
        $this->assertSame(2, $preview['final_recipients']);
    }

    // ---------------------------------------------------------------- sending

    /**
     * A campaign is never sent twice.
     *
     * The worst mistake this module can make, and there is no undo. Two
     * requests arriving together — a double-click, a retried POST — must
     * produce one send.
     */
    public function test_a_campaign_cannot_be_queued_twice(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('one@example.test', $group);

        $campaign = $this->readyCampaign($group);

        $first = CampaignSender::queue($campaign->fresh());
        $second = CampaignSender::queue($campaign->fresh());

        $this->assertTrue($first['queued']);
        $this->assertFalse($second['queued']);
        $this->assertSame(1, $campaign->fresh()->recipients()->count());
    }

    /**
     * Somebody who unsubscribes mid-send does not get the rest of it.
     *
     * The list is frozen when the campaign is queued, and a large one takes
     * minutes to work through — so the recipient's eligibility is checked
     * again inside the batch, immediately before the send.
     */
    public function test_a_recipient_suppressed_after_freezing_is_skipped(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('leaver@example.test', $group);

        $campaign = $this->readyCampaign($group);
        CampaignSender::queue($campaign->fresh());

        $recipient = $campaign->recipients()->firstOrFail();

        // They unsubscribe between the freeze and the batch running.
        NewsletterSuppression::add('leaver@example.test', SuppressionReason::Unsubscribed);

        (new SendCampaignBatch($campaign->id, [$recipient->id]))->handle();

        $this->assertSame('skipped', $recipient->fresh()->status);
    }

    // ----------------------------------------------------------- unsubscribe

    /** No login, no confirmation step, and safe to call twice. */
    public function test_unsubscribing_is_idempotent_and_suppresses_the_address(): void
    {
        $s = $this->subscriber('bye@example.test');
        $token = $s->unsubscribe_token;

        $this->postJson("/api/v1/newsletter/unsubscribe/{$token}")->assertOk();
        $this->postJson("/api/v1/newsletter/unsubscribe/{$token}")->assertOk();

        $this->assertSame(SubscriberStatus::Unsubscribed, $s->fresh()->status);
        $this->assertSame(1, NewsletterSuppression::count());
    }

    /**
     * The suppression outlives the subscriber row.
     *
     * That is the entire reason suppressions are keyed on the address. Delete
     * somebody and re-import them, and they must stay off the list.
     */
    public function test_a_suppression_survives_deleting_the_subscriber(): void
    {
        $s = $this->subscriber('bye@example.test');
        $this->postJson("/api/v1/newsletter/unsubscribe/{$s->unsubscribe_token}")->assertOk();

        $s->delete();

        $this->assertSame(
            SubscriberIntake::SUPPRESSED,
            SubscriberIntake::take('bye@example.test', [], [], 'import')['outcome'],
        );
    }

    /** Staff may undo a bounce; they may not undo somebody's decision. */
    public function test_staff_cannot_lift_a_suppression_the_person_chose(): void
    {
        $theirs = NewsletterSuppression::add('left@example.test', SuppressionReason::Unsubscribed);
        $ours = NewsletterSuppression::add('dead@example.test', SuppressionReason::HardBounce);

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/suppressions/{$theirs->id}")
            ->assertStatus(422);

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/suppressions/{$ours->id}")
            ->assertNoContent();
    }

    /** The signup form must not reveal who is already on the list. */
    public function test_signing_up_answers_identically_for_every_address(): void
    {
        $this->subscriber('known@example.test');
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        $responses = collect(['new@example.test', 'known@example.test', 'gone@example.test'])
            ->map(fn ($email) => $this->postJson('/api/v1/newsletter/subscribe', ['email' => $email]));

        foreach ($responses as $response) {
            $response->assertStatus(202);
        }

        // Byte-identical, not merely all-successful — the distinction
        // `CustomerRegistrationTest` already makes for the same reason.
        $this->assertCount(1, $responses->map(fn ($r) => $r->getContent())->unique());
    }

    // --------------------------------------------------------- health check

    /**
     * A campaign with no way out is refused, whatever it scores.
     *
     * The blocking checks are the legal ones, and they are re-run on the
     * server at the moment of sending rather than read from a stored number.
     */
    public function test_a_campaign_without_an_unsubscribe_link_cannot_be_sent(): void
    {
        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('one@example.test', $group);

        $campaign = NewsletterCampaign::create([
            'name' => 'No way out',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>'.str_repeat('Words that fill the body. ', 20).'</p></body></html>',
            'text_content' => str_repeat('Words that fill the body. ', 20),
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Draft,
        ]);
        $campaign->groups()->attach($group->id);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/send")
            ->assertStatus(422);

        $this->assertContains('An unsubscribe link', $response->json('errors.health'));
        $this->assertSame(CampaignStatus::Draft, $campaign->fresh()->status);
    }

    /** Scored out of what applies, so a text-only campaign is not punished
     *  for the image checks it can never satisfy. */
    public function test_image_checks_do_not_apply_to_a_campaign_with_no_images(): void
    {
        $campaign = new NewsletterCampaign([
            'subject' => 'A subject of reasonable length',
            'html_content' => '<html><body><p>'.str_repeat('Plenty of readable words here. ', 20)
                .'</p><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>',
            'text_content' => str_repeat('Plenty of readable words here. ', 20),
        ]);

        $keys = array_column(HealthCheck::run($campaign)['checks'], 'key');

        $this->assertNotContains('alt_text', $keys);
        $this->assertNotContains('image_ratio', $keys);
    }

    /**
     * A created campaign comes back shaped like every read of one.
     *
     * `response()->json($resource)` serialises through `jsonSerialize()`,
     * which drops the `data` wrapper — so the client's `res.data` is undefined
     * and the console reports "could not be created" for a campaign that was
     * created. It has happened twice in this codebase now, on two different
     * modules, which is what earns a test rather than a comment.
     */
    public function test_a_created_campaign_is_wrapped_like_every_other_read(): void
    {
        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/newsletter/campaigns', [
                'name' => 'Wrapped',
                'subject' => 'A subject long enough to pass',
            ])
            ->assertCreated();

        $this->assertIsInt($response->json('data.id'));
        $this->assertSame('Wrapped', $response->json('data.name'));
    }

    /**
     * A campaign starts from a shipped template without a fatal error.
     *
     * The seeded footer block carries a company and a line of text and **no
     * address at all**, so reading `$b['address']` to decide whether the block
     * overrides the configured value is an "Undefined array key" rather than a
     * fallback -- and creating from any of the ten templates answered
     * "Not created". `?:` reads its left operand and `??` does not, which is
     * the whole of the difference, and the reason the fix for one bug caused
     * this one.
     *
     * Driven through the endpoint with the **real seeder**, not a hand-made
     * block: what broke was a template shipped in this repository, and a
     * fixture written here would have carried the key the shipped one omits.
     */
    public function test_a_campaign_starts_from_a_shipped_template(): void
    {
        $this->seed(NewsletterTemplateSeeder::class);

        $template = NewsletterTemplate::where('is_system', true)->firstOrFail();

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/newsletter/campaigns', [
                'name' => 'From a template',
                'subject' => 'A subject long enough to pass',
                'newsletter_template_id' => $template->id,
            ])
            ->assertCreated();

        // The blocks are copied rather than referenced, and the HTML is
        // rendered from them on save -- which is the step that was throwing.
        $this->assertNotEmpty($response->json('data.blocks'));

        $campaign = NewsletterCampaign::findOrFail($response->json('data.id'));
        $this->assertStringContainsString('Unsubscribe from these emails', (string) $campaign->html_content);
    }

    /**
     * The send screen is told whether anything will deliver the send.
     *
     * The backlog cannot answer this and that is the whole point of the
     * endpoint: before a send there is nothing queued to be late, so
     * `pending: 0` describes a healthy install and an install with no cron
     * entry identically. Somebody presses Send, the campaign sits at "Sending"
     * for an afternoon, and nothing anywhere says why.
     *
     * So the scheduler records a pulse and this reads it. Note the third case:
     * a heartbeat that exists and is old is *worse* news than none, and must
     * not read as running.
     */
    public function test_the_send_screen_is_told_whether_anything_is_delivering(): void
    {
        $admin = $this->admin();

        /*
         * phpunit.xml pins QUEUE_CONNECTION=sync, which `QueueHealth` returns
         * early for -- so without this the assertions below would pass against
         * the "cannot inspect this driver" branch and prove nothing about the
         * one every deployment runs. Removing the scheduler from the database
         * branch was invisible to this test until it said so out loud.
         */
        config(['queue.default' => 'database']);

        Cache::forget(QueueHealth::HEARTBEAT_KEY);

        $never = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/queue')
            ->assertOk();

        $this->assertSame('database', $never->json('data.driver'));
        $this->assertTrue($never->json('data.known'));
        $this->assertTrue($never->json('data.scheduler.known'));
        $this->assertNull($never->json('data.scheduler.last_run_seconds'));
        $this->assertFalse($never->json('data.scheduler.running'));

        Cache::put(QueueHealth::HEARTBEAT_KEY, time() - 20);

        $running = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/queue')
            ->assertOk();

        $this->assertTrue($running->json('data.scheduler.running'));
        $this->assertLessThanOrEqual(30, $running->json('data.scheduler.last_run_seconds'));

        // Stopped an hour ago, which the queue would still describe as idle.
        Cache::put(QueueHealth::HEARTBEAT_KEY, time() - 3600);

        $stopped = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/queue')
            ->assertOk();

        $this->assertFalse($stopped->json('data.scheduler.running'));
        $this->assertGreaterThan(QueueHealth::HEARTBEAT_SECONDS, $stopped->json('data.scheduler.last_run_seconds'));
    }

    /**
     * The pixel and every tracked link point at a URL that exists.
     *
     * They did not. Both were built from `frontend_url` while both endpoints
     * live on the **API** — one returns a GIF, the other a redirect — so every
     * campaign ever sent carried a pixel that answered 404 and links that
     * answered 404. Opens read 0% for a message that had been opened, which is
     * how it was reported; the worse half is that a reader clicking anything
     * in a delivered campaign landed on a missing page.
     *
     * So this fetches what the rewriter generates rather than asserting on the
     * string. A test that matched the URL against a pattern would have passed
     * against the broken version the whole time — the URL was well-formed, it
     * just pointed at nothing.
     */
    public function test_the_tracking_urls_resolve_to_routes_that_exist(): void
    {
        $campaign = NewsletterCampaign::create([
            'name' => 'Tracked', 'subject' => 'Tracked',
            'status' => CampaignStatus::Sent,
        ]);

        $recipient = NewsletterCampaignRecipient::create([
            'newsletter_campaign_id' => $campaign->id,
            'newsletter_subscriber_id' => NewsletterSubscriber::create([
                'email' => 'reader@example.test', 'status' => SubscriberStatus::Active,
            ])->id,
            'email' => 'reader@example.test',
        ]);

        $html = TrackingRewriter::prepare(
            $campaign,
            '<html><body><a href="https://example.com/datasheet">Read it</a></body></html>',
        );

        preg_match('/<img src="([^"]+)"/', $html, $pixel);
        preg_match('/<a href="([^"]+)"/', $html, $link);

        $fill = fn (string $url) => parse_url(
            str_replace('{{token}}', $recipient->token, html_entity_decode($url)),
            PHP_URL_PATH,
        );

        $this->get($fill($pixel[1]))
            ->assertOk()
            ->assertHeader('content-type', 'image/gif');

        $this->get($fill($link[1]))
            ->assertRedirect('https://example.com/datasheet');

        $recipient->refresh();

        $this->assertNotNull($recipient->opened_at, 'the pixel recorded no open');
        $this->assertNotNull($recipient->clicked_at, 'the redirect recorded no click');
    }

    /**
     * A running worker counts, and the scheduler is not the only answer.
     *
     * `php artisan queue:work` — by hand on a development machine, or under
     * supervisor on a server — delivers mail perfectly well and touches the
     * scheduler's heartbeat not at all. A check that knew only about the
     * scheduler told somebody with a worker running that nothing was
     * delivering, and sent them to fix a cron entry they did not need.
     */
    public function test_a_running_worker_counts_as_delivering(): void
    {
        Cache::forget(QueueHealth::HEARTBEAT_KEY);
        Cache::forget(QueueHealth::WORKER_KEY);

        $this->assertFalse(QueueHealth::delivering(), 'nothing running should not read as delivering');

        Cache::put(QueueHealth::WORKER_KEY, time() - 5);

        $this->assertTrue(QueueHealth::worker()['running']);
        $this->assertTrue(QueueHealth::delivering(), 'a worker alone must count');
        $this->assertFalse(QueueHealth::scheduler()['running'], 'the worker must not be mistaken for the scheduler');

        // A worker that stopped an hour ago is worse news than none, and must
        // not read as running.
        Cache::put(QueueHealth::WORKER_KEY, time() - 3600);

        $this->assertFalse(QueueHealth::worker()['running']);
        $this->assertFalse(QueueHealth::delivering());
    }

    /**
     * The worker's pulse is actually wired to the worker.
     *
     * Wiring, not mechanism: `QueueHealth` reading a cache key proves nothing
     * about anything writing it, and the failure is silent in the direction
     * that costs an afternoon — a healthy deployment reporting that nothing is
     * delivering mail. Firing the queue's own `Looping` event is as close to
     * `queue:work` as a test can stand without starting one.
     */
    public function test_the_worker_pulse_is_written_by_the_queue_itself(): void
    {
        Cache::forget(QueueHealth::WORKER_KEY);

        event(new Looping('database', 'default'));

        $this->assertNotNull(Cache::get(QueueHealth::WORKER_KEY), 'the looping worker wrote no pulse');
        $this->assertTrue(QueueHealth::worker()['running']);
    }

    /**
     * The heartbeat is actually scheduled.
     *
     * Wiring, not mechanism. `QueueHealth` reading a cache key proves nothing
     * about anything writing it, and the failure is silent in the worst
     * direction: with the schedule entry gone the key is never renewed, so a
     * perfectly healthy deployment reports "nothing is delivering mail" and
     * hands its operator a cron line they already have.
     */
    public function test_the_scheduler_heartbeat_runs_every_minute(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($e) => $e->description === 'scheduler-heartbeat');

        $this->assertCount(1, $events, 'the scheduler heartbeat is not scheduled');
        $this->assertSame('* * * * *', $events->first()->expression);
    }

    // ------------------------------------------------------ ways in

    /**
     * A spreadsheet is read by its bytes, not its extension.
     *
     * People rename files, and "contacts.csv" is regularly an xlsx somebody
     * renamed. Read as text it produces one unreadable column and reports every
     * row invalid, which looks like the importer being broken.
     */
    public function test_an_xlsx_is_read_whatever_it_is_called(): void
    {
        $path = $this->xlsx();

        // Deliberately named `.csv`, which is the case that used to fail.
        $renamed = str_replace('.xlsx', '.csv', $path);
        copy($path, $renamed);

        $parsed = Spreadsheet::read($renamed);

        $this->assertSame('xlsx', $parsed['format']);
        $this->assertSame(['email', 'first_name', 'company'], $parsed['headers']);

        @unlink($path);
        @unlink($renamed);
    }

    /**
     * A missing cell keeps its column.
     *
     * The bug this reader would otherwise have: a row with an empty column
     * simply omits that `<c>` element, so `A,C` arrives as two cells and a
     * reader that appends them in order shifts everything left from the gap.
     * The company column silently becomes the first-name column for some rows
     * and not others — which is not a crash, it is bad data.
     */
    public function test_a_gap_in_a_spreadsheet_row_does_not_shift_the_columns(): void
    {
        $path = $this->xlsx();
        $rows = Spreadsheet::read($path)['rows'];

        // Row two has no first name: A and C only.
        $this->assertSame('bob@sheet.test', $rows[1][0]);
        $this->assertSame('', $rows[1][1]);
        $this->assertSame('Gap Ltd', $rows[1][2]);

        @unlink($path);
    }

    /**
     * A file of bare addresses has no header row, and must not lose its first
     * one.
     *
     * The first real file anybody uploaded was exactly this — a `.txt` holding
     * one address — and the importer ate it as a column heading and reported
     * "0 rows", which reads as the file being empty. No legitimate heading is a
     * valid email address, so a first row containing one is data.
     */
    public function test_a_file_with_no_header_row_keeps_its_first_address(): void
    {
        $path = $this->csv("pradiptac@example.test\n");
        $parsed = Spreadsheet::read($path);

        $this->assertFalse($parsed['has_header']);
        $this->assertSame(['Column 1'], $parsed['headers']);
        $this->assertSame([['pradiptac@example.test']], $parsed['rows']);

        // And the email column is found from the data, so the wizard opens
        // ready to import rather than saying "Not in this file" for the one
        // field that is required.
        $mapping = Csv::guessMapping($parsed['headers'], $parsed['rows']);
        $this->assertSame(0, $mapping['email']);

        @unlink($path);
    }

    /** A real header row is still treated as one. */
    public function test_a_header_row_is_not_mistaken_for_data(): void
    {
        $path = $this->csv("email,first_name\nann@example.test,Ann\n");
        $parsed = Spreadsheet::read($path);

        $this->assertTrue($parsed['has_header']);
        $this->assertSame(['email', 'first_name'], $parsed['headers']);
        $this->assertCount(1, $parsed['rows']);

        @unlink($path);
    }

    /**
     * A heading nobody anticipated still finds its column.
     *
     * "Contact e-mail 1" matches none of the candidate names, and before this
     * the mapping came back empty for a file that is otherwise perfectly
     * ordinary.
     */
    public function test_the_email_column_is_found_when_the_heading_is_unusual(): void
    {
        $path = $this->csv("Full Name,Contact e-mail 1\nAnn Lee,ann@example.test\nBob Roy,bob@example.test\n");
        $parsed = Spreadsheet::read($path);

        $mapping = Csv::guessMapping($parsed['headers'], $parsed['rows']);

        $this->assertSame(1, $mapping['email']);

        @unlink($path);
    }

    /**
     * A column that merely mentions an address is not the address column.
     *
     * The majority of sampled values must parse, or a notes column containing
     * one address would be chosen over the real one.
     */
    public function test_a_notes_column_is_not_mistaken_for_the_address_column(): void
    {
        $path = $this->csv(
            "Notes,Contact e-mail 1\n"
            ."rang on Tuesday,ann@example.test\n"
            ."forwarded from bob@example.test,bob@example.test\n"
            ."no answer,carol@example.test\n"
        );

        $mapping = Csv::guessMapping(
            Spreadsheet::read($path)['headers'],
            Spreadsheet::read($path)['rows'],
        );

        $this->assertSame(1, $mapping['email']);

        @unlink($path);
    }

    /** The legacy binary `.xls` is named rather than parsed as gibberish. */
    public function test_a_legacy_xls_is_recognised(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'nl').'.xls';
        file_put_contents($path, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1".str_repeat("\x00", 64));

        $this->assertTrue(Spreadsheet::isLegacyExcel($path));
        $this->assertFalse(Spreadsheet::isLegacyExcel($this->csv("email\na@b.test\n")));

        @unlink($path);
    }

    /**
     * Pasting a list is the third way in, and it takes what a paste looks like.
     *
     * Newlines, commas, semicolons and `Name <address>` as a mail client
     * writes it — because the alternative is telling somebody with eleven
     * addresses in an email to type them into a four-field form eleven times.
     */
    public function test_pasting_a_list_adds_everybody_and_keeps_the_names(): void
    {
        NewsletterSuppression::add('gone@paste.test', SuppressionReason::Unsubscribed);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/newsletter/subscribers/paste', [
                'text' => "ann@paste.test\n"
                    ."Priya Nair <priya@paste.test>, bob@paste.test;carol@paste.test\n"
                    ."ANN@paste.test\n"
                    ."gone@paste.test\n"
                    ."not-an-address\n",
            ])
            ->assertOk();

        $this->assertSame(4, $response->json('data.added'));
        // The repeat inside the paste itself, which is the common case when
        // two lists are copied together.
        $this->assertSame(1, $response->json('data.already'));
        $this->assertSame(1, $response->json('data.suppressed'));
        $this->assertSame(1, $response->json('data.invalid'));

        // The name in angle brackets is kept — the difference between "Hello
        // there" and "Hello Priya" in the first campaign.
        $priya = NewsletterSubscriber::where('email', 'priya@paste.test')->firstOrFail();
        $this->assertSame('Priya', $priya->first_name);
        $this->assertSame('Nair', $priya->last_name);

        // Named, not just counted: "1 invalid" with no way to see which one
        // means retyping the paste to find the typo.
        $this->assertNotEmpty($response->json('data.rejected'));
    }

    // ---------------------------------------------------------------- safety

    /** An export is opened in Excel, and Excel executes a leading `=`. */
    public function test_csv_export_escapes_formula_injection(): void
    {
        $this->assertSame("'=HYPERLINK(\"http://x\")", Csv::escape('=HYPERLINK("http://x")'));
        $this->assertSame("'+1", Csv::escape('+1'));
        $this->assertSame("'@x", Csv::escape('@x'));
        $this->assertSame('ABC Ltd', Csv::escape('ABC Ltd'));
    }

    /** A mail merge that leaves `{{firstname}}` in somebody's inbox is the
     *  most obviously amateur thing a mailing can do. */
    public function test_unknown_placeholders_are_removed_rather_than_sent(): void
    {
        $out = EmailRenderer::personalise('Hi {{first_name}}, {{firstname}} {{nonsense}}', null);

        $this->assertStringContainsString('Hi there,', $out);
        $this->assertStringNotContainsString('{{', $out);
    }

    /** A test send must not touch the figures the report is drawn from. */
    public function test_a_test_send_creates_no_recipient_and_no_events(): void
    {
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => 'Kolkata', 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);

        $campaign = NewsletterCampaign::create([
            'name' => 'Test only',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>Hello {{first_name}}</p><a href="{{unsubscribe_url}}">Out</a></body></html>',
            'text_content' => 'Hello',
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Draft,
        ]);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/test");

        $response->assertOk();

        $this->assertSame(0, $campaign->recipients()->count());
        $this->assertSame(0, $campaign->events()->count());
        $this->assertNotNull($campaign->fresh()->test_sent_at);
    }

    /** The pixel answers identically whatever the token, so nothing can be
     *  probed with it — and records the open once. */
    public function test_the_open_pixel_is_constant_and_stamps_once(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('reader@example.test', $group);
        $campaign = $this->readyCampaign($group);
        CampaignSender::queue($campaign->fresh());

        $recipient = $campaign->recipients()->firstOrFail();

        $real = $this->get("/api/v1/newsletter/open/{$recipient->token}")->assertOk();
        $fake = $this->get('/api/v1/newsletter/open/not-a-real-token')->assertOk();

        $this->assertSame($real->getContent(), $fake->getContent());
        $this->assertSame('image/gif', $real->headers->get('Content-Type'));

        $first = $recipient->fresh()->opened_at;
        $this->get("/api/v1/newsletter/open/{$recipient->token}");

        // Stamped once; the second open is an event, not a new timestamp.
        $this->assertEquals($first, $recipient->fresh()->opened_at);
        $this->assertSame(2, $campaign->events()->where('event_type', 'opened')->count());
    }

    /** A real xlsx, written here so the test does not depend on a fixture file. */
    private function xlsx(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'nl').'.xlsx';

        $shared = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<si><t>email</t></si><si><t>first_name</t></si><si><t>company</t></si>'
            .'<si><t>ann@sheet.test</t></si><si><r><t>An</t></r><r><t>n</t></r></si>'
            .'<si><t>Ridge &amp; Co</t></si><si><t>bob@sheet.test</t></si><si><t>Gap Ltd</t></si>'
            .'</sst>';

        // Row 3 omits column B entirely — the gap this reader must survive.
        $sheet = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
            .'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
            .'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>'
            .'<row r="3"><c r="A3" t="s"><v>6</v></c><c r="C3" t="s"><v>7</v></c></row>'
            .'</sheetData></worksheet>';

        self::writeZip($path, [
            'xl/sharedStrings.xml' => $shared,
            'xl/worksheets/sheet1.xml' => $sheet,
        ]);

        return $path;
    }

    /**
     * An attachment is stored by path, and its name and size are copied.
     *
     * Copied rather than joined, for the reason the activity log copies its
     * actor: the media row can be renamed or deleted afterwards, and what was
     * sent must not change. The stored filename is a hash, so without the human
     * name the recipient's downloads folder fills with `a8f3c1....pdf`.
     */
    public function test_an_attachment_is_stored_with_the_name_and_size_of_the_file(): void
    {
        $media = Media::create([
            'filename' => 'Company brochure.pdf',
            'path' => 'media/brochure-test.pdf',
            'disk' => 'public',
            'mime' => 'application/pdf',
            'size' => 348_112,
        ]);

        $campaign = NewsletterCampaign::create([
            'name' => 'With a brochure', 'subject' => 'Our brochure',
            'status' => CampaignStatus::Draft,
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}", [
                'attachment_path' => 'media/brochure-test.pdf',
            ])
            ->assertOk()
            ->assertJsonPath('data.attachment_name', 'Company brochure.pdf')
            ->assertJsonPath('data.attachment_bytes', 348_112);

        $media->forceDelete();
    }

    /**
     * A path with no media row behind it is refused rather than stored.
     *
     * Storing it would be an attachment that silently fails to attach: the
     * campaign reports one, the mailable finds no file, and every recipient
     * gets the message without the thing it refers to.
     */
    public function test_an_attachment_path_with_no_file_behind_it_is_not_stored(): void
    {
        $campaign = NewsletterCampaign::create([
            'name' => 'Phantom', 'subject' => 'Phantom',
            'status' => CampaignStatus::Draft,
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}", [
                'attachment_path' => 'media/does-not-exist.pdf',
            ])
            ->assertOk()
            ->assertJsonPath('data.attachment_path', null);
    }

    /**
     * The mailable attaches the file, under its human name.
     *
     * Built for real rather than asserted about, the same reasoning
     * `OutgoingMailTest` follows for the API transports: whether an attachment
     * is actually on the message is not something a stored column can tell you.
     */
    public function test_the_message_carries_the_attachment(): void
    {
        Storage::disk('public')->put('media/brochure-test.pdf', '%PDF-1.4 test');

        $campaign = NewsletterCampaign::create([
            'name' => 'With a brochure', 'subject' => 'Our brochure',
            'status' => CampaignStatus::Draft,
            'attachment_path' => 'media/brochure-test.pdf',
            'attachment_name' => 'Company brochure.pdf',
            'attachment_bytes' => 13,
        ]);

        $recipient = NewsletterCampaignRecipient::create([
            'newsletter_campaign_id' => $campaign->id,
            'newsletter_subscriber_id' => NewsletterSubscriber::create([
                'email' => 'reader@example.test', 'status' => SubscriberStatus::Active,
            ])->id,
            'email' => 'reader@example.test',
        ]);

        $built = (new CampaignMessage($campaign, '<p>Hello</p>', 'Hello', $recipient))->attachments();

        $this->assertCount(1, $built);
        $this->assertSame('Company brochure.pdf', $built[0]->as);

        Storage::disk('public')->delete('media/brochure-test.pdf');
    }

    /**
     * A file deleted after the campaign was queued is skipped, not thrown on.
     *
     * The message is worth sending without its brochure; a campaign that fails
     * wholesale part-way through a list because somebody tidied the media
     * library is the worse outcome, and it is unrecoverable — the sender has
     * already delivered to everyone before the failure.
     */
    public function test_a_missing_attachment_file_does_not_stop_the_send(): void
    {
        $campaign = NewsletterCampaign::create([
            'name' => 'Gone', 'subject' => 'Gone',
            'status' => CampaignStatus::Draft,
            'attachment_path' => 'media/deleted-since.pdf',
            'attachment_name' => 'Gone.pdf',
        ]);

        $recipient = NewsletterCampaignRecipient::create([
            'newsletter_campaign_id' => $campaign->id,
            'newsletter_subscriber_id' => NewsletterSubscriber::create([
                'email' => 'reader2@example.test', 'status' => SubscriberStatus::Active,
            ])->id,
            'email' => 'reader2@example.test',
        ]);

        $this->assertSame([], (new CampaignMessage($campaign, '<p>Hi</p>', 'Hi', $recipient))->attachments());
    }

    /**
     * The customers group is derived, and it is derived on every run.
     *
     * A one-off import is right on the day it is pressed and wrong from the
     * next approval onwards — and nobody notices, because a stale group looks
     * exactly like a current one.
     */
    public function test_the_customers_group_follows_the_customer_list(): void
    {
        Customer::create([
            'name' => 'Ann Lee', 'email' => 'ann@example.test',
            'password' => bcrypt('x'), 'status' => CustomerStatus::Active,
        ]);

        CustomerGroupSync::run();

        $group = CustomerGroupSync::group();
        $this->assertTrue($group->subscribers()->where('email', 'ann@example.test')->exists());
    }

    /**
     * A pending customer is not mailed.
     *
     * `pending` is somebody waiting on a human and `rejected` is somebody a
     * human turned down; mailing either answers a question the support desk
     * has not answered yet.
     */
    public function test_only_active_customers_are_in_the_group(): void
    {
        Customer::create([
            'name' => 'Waiting', 'email' => 'waiting@example.test',
            'password' => bcrypt('x'), 'status' => CustomerStatus::Pending,
        ]);

        CustomerGroupSync::run();

        $this->assertFalse(
            CustomerGroupSync::group()->subscribers()->where('email', 'waiting@example.test')->exists(),
        );
    }

    /**
     * **Being a customer is not a way back onto a list somebody left.**
     *
     * The whole risk in a group that re-derives itself: an unsubscribe is
     * undone on the next pass, silently, and the person receives mail they
     * explicitly declined. Every addition goes through `SubscriberIntake`,
     * which checks the suppression list before it looks the subscriber up.
     */
    public function test_the_sync_cannot_resurrect_an_unsubscribe(): void
    {
        $customer = Customer::create([
            'name' => 'Gone Away', 'email' => 'gone@example.test',
            'password' => bcrypt('x'), 'status' => CustomerStatus::Active,
        ]);

        CustomerGroupSync::run();
        $this->assertTrue(CustomerGroupSync::group()->subscribers()->where('email', 'gone@example.test')->exists());

        // They unsubscribe.
        NewsletterSuppression::create([
            'email' => 'gone@example.test',
            'reason' => SuppressionReason::Unsubscribed,
        ]);
        NewsletterSubscriber::where('email', 'gone@example.test')
            ->update(['status' => SubscriberStatus::Unsubscribed]);

        // Every route back in: the sweep, the model hook, and a fresh save.
        CustomerGroupSync::run();
        CustomerGroupSync::syncOne($customer);
        $customer->touch();

        $this->assertSame(
            SubscriberStatus::Unsubscribed,
            NewsletterSubscriber::where('email', 'gone@example.test')->first()->status,
            'An unsubscribed customer was reactivated by the group sync.',
        );
    }

    /**
     * Suspending an account takes somebody out of the group and nothing else.
     *
     * Out of the *group* only. A suspended customer has not asked to stop
     * hearing from the company, so unsubscribing them would be the sync making
     * a decision that belongs to them.
     */
    public function test_a_suspended_customer_leaves_the_group_but_keeps_their_subscription(): void
    {
        $customer = Customer::create([
            'name' => 'Sus Pended', 'email' => 'sus@example.test',
            'password' => bcrypt('x'), 'status' => CustomerStatus::Active,
        ]);

        CustomerGroupSync::run();
        $this->assertTrue(CustomerGroupSync::group()->subscribers()->where('email', 'sus@example.test')->exists());

        $customer->update(['status' => CustomerStatus::Suspended]);

        $this->assertFalse(
            CustomerGroupSync::group()->subscribers()->where('email', 'sus@example.test')->exists(),
            'A suspended customer was left in the group.',
        );
        $this->assertSame(
            SubscriberStatus::Active,
            NewsletterSubscriber::where('email', 'sus@example.test')->first()->status,
            'Suspending an account should not unsubscribe anybody.',
        );
    }

    /** Approving a customer puts them in the group without waiting for the sweep. */
    public function test_the_model_hook_adds_a_newly_active_customer(): void
    {
        $customer = Customer::create([
            'name' => 'New Person', 'email' => 'new@example.test',
            'password' => bcrypt('x'), 'status' => CustomerStatus::Pending,
        ]);

        $this->assertFalse(CustomerGroupSync::group()->subscribers()->where('email', 'new@example.test')->exists());

        $customer->update(['status' => CustomerStatus::Active]);

        $this->assertTrue(
            CustomerGroupSync::group()->subscribers()->where('email', 'new@example.test')->exists(),
            'Approving a customer did not add them to the group.',
        );
    }

    /**
     * The derived group refuses to be deleted or hand-edited.
     *
     * Both would appear to work: the group would come back on the next sync
     * under a new id having lost every campaign's record of it, and a hand
     * edit would survive until the next run and then vanish.
     */
    public function test_the_customers_group_cannot_be_deleted_or_edited_by_hand(): void
    {
        $group = CustomerGroupSync::group();
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/groups/{$group->id}")
            ->assertStatus(422);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/newsletter/groups/{$group->id}/members", [
                'action' => 'add', 'subscriber_ids' => [1],
            ])
            ->assertStatus(422);

        $this->assertDatabaseHas('newsletter_groups', ['id' => $group->id]);
    }

    /**
     * The list and the report must agree about the same send.
     *
     * They came from two definitions of "delivered": the report counts a
     * recipient row that reached status `sent`, and the index was written
     * against `delivered_at` — a column set by a provider webhook this
     * deployment does not have. So the report said 4 delivered and the list
     * said 3, about one campaign, on two screens one click apart. Whichever
     * number somebody quotes is then wrong somewhere else.
     */
    public function test_the_campaign_list_and_its_report_agree(): void
    {
        $campaign = NewsletterCampaign::create([
            'name' => 'Measured', 'subject' => 'Measured',
            'status' => CampaignStatus::Sent, 'recipient_count' => 3, 'completed_at' => now(),
        ]);

        foreach ([['a', 'sent', true], ['b', 'sent', false], ['c', 'failed', false]] as [$k, $status, $opened]) {
            $subscriber = NewsletterSubscriber::create([
                'email' => "agree-{$k}@example.test", 'status' => SubscriberStatus::Active,
            ]);

            (new NewsletterCampaignRecipient)->forceFill([
                'newsletter_campaign_id' => $campaign->id,
                'newsletter_subscriber_id' => $subscriber->id,
                'email' => $subscriber->email,
                'status' => $status,
                'token' => 'agree'.$k.bin2hex(random_bytes(8)),
                'sent_at' => now(),
                'opened_at' => $opened ? now() : null,
            ])->save();
        }

        $admin = $this->admin();

        $list = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/campaigns')
            ->assertOk()
            ->json('data.0.performance');

        $report = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/report")
            ->assertOk()
            ->json('data.counts');

        $this->assertSame($report['recipients'], $list['recipients']);
        $this->assertSame($report['sent'], $list['delivered'], 'The list and the report disagree about delivered.');
        $this->assertSame($report['opened'], $list['opened']);
    }

    /**
     * The postal-address check must read the message, not the setting.
     *
     * This is a legal check, and it was able to pass for a message that does
     * not contain an address. The footer is rendered from `newsletter_address`
     * when the campaign is **saved**, and `html_content` is stored — sending
     * uses the stored copy and never re-renders. So: write a campaign while the
     * setting is blank, fill the setting in afterwards, and the check flips to
     * a tick while the message that will actually go out still has no address
     * anywhere in it.
     *
     * Reading the rendered HTML is the same test the unsubscribe-link check
     * three lines above it already applies, and it is the honest one: what
     * matters is what the recipient receives.
     */
    public function test_the_address_check_reads_the_message_not_the_setting(): void
    {
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => null, 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);
        Setting::flushCache();

        // Written while no address was configured, so the footer has none.
        $campaign = NewsletterCampaign::create([
            'name' => 'No address', 'subject' => 'A subject long enough',
            'status' => CampaignStatus::Draft,
            'html_content' => '<p>Hello</p><p>{{unsubscribe_url}}</p>',
            'text_content' => str_repeat('Some real words here. ', 5),
        ]);

        // The address is filled in afterwards, on a different screen.
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => '12 Example Road, Kolkata 700001', 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);
        Setting::flushCache();

        $checks = collect(HealthCheck::run($campaign)['checks'])->keyBy('key');

        $this->assertFalse(
            $checks['address']['passed'],
            'The address check passed for a message whose footer contains no address.',
        );

        // Re-rendered with the setting in place, it passes.
        $campaign->update([
            'html_content' => '<p>Hello</p><p>12 Example Road, Kolkata 700001</p><p>{{unsubscribe_url}}</p>',
        ]);

        $after = collect(HealthCheck::run($campaign->fresh())['checks'])->keyBy('key');
        $this->assertTrue($after['address']['passed']);
    }

    /**
     * The site's own postal address counts as the newsletter's.
     *
     * Two settings asked for one fact under two names, and only one of them was
     * read here — so a site with its address filled in on the Contact screen had
     * a newsletter insisting there was no address anywhere, on a check that
     * blocks sending. The branding array already fell back from
     * `newsletter_company` to `company_name`; not doing the same for the address
     * was the whole of the bug.
     *
     * `newsletter_address` still wins where it is set: a business may want mail
     * to carry a registered office or a PO box rather than the office address on
     * the contact page.
     */
    public function test_the_footer_address_falls_back_to_the_site_address(): void
    {
        Setting::updateOrCreate(['key' => 'address'],
            ['value' => 'Technoware, 12 Example Road, Kolkata 700001', 'group' => 'contact', 'type' => 'string', 'is_secret' => false]);
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => null, 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);
        Setting::flushCache();

        $this->assertSame('Technoware, 12 Example Road, Kolkata 700001', Branding::address());

        // And the override wins where it is set.
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => 'PO Box 9, Kolkata 700002', 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);
        Setting::flushCache();

        $this->assertSame('PO Box 9, Kolkata 700002', Branding::address());
    }

    /**
     * A multi-line address in the settings box still matches the one-line footer.
     *
     * People type an address across three lines, and the renderer escapes it and
     * puts it in a single paragraph — so a literal comparison against the raw
     * HTML matches neither the newlines nor the escaping.
     */
    public function test_a_multi_line_address_is_recognised_in_the_footer(): void
    {
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => 'Technoware
12 Example Road
Kolkata 700001', 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);
        Setting::flushCache();

        $campaign = NewsletterCampaign::create([
            'name' => 'Wrapped', 'subject' => 'A subject long enough',
            'status' => CampaignStatus::Draft,
            'html_content' => '<p>Hello</p><p>Technoware 12 Example Road Kolkata 700001</p><p>{{unsubscribe_url}}</p>',
            'text_content' => str_repeat('Some real words here. ', 5),
        ]);

        $checks = collect(HealthCheck::run($campaign)['checks'])->keyBy('key');

        $this->assertTrue($checks['address']['passed'], 'A wrapped address was not recognised in the footer.');
    }

    /**
     * An address typed into the campaign's own footer counts.
     *
     * This is the one somebody actually hit: the footer block carried
     * "7/A dakshinpara Road. Kolkata-28." and the Checks tab said there was no
     * postal address, because the check read a *setting* the editor had never
     * been asked to fill in. From the editor's side the console was insisting
     * they had not done the thing they had just done — and it blocks sending.
     *
     * The check resolves the address the way the renderer does: the block
     * first, then the configured one.
     */
    public function test_an_address_in_the_footer_block_satisfies_the_check(): void
    {
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => null, 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);
        Setting::updateOrCreate(['key' => 'address'],
            ['value' => null, 'group' => 'contact', 'type' => 'string', 'is_secret' => false]);
        Setting::flushCache();

        $blocks = [
            ['type' => 'text', 'html' => '<p>'.str_repeat('Real words for a real message. ', 6).'</p>'],
            ['type' => 'footer', 'company' => 'Technoware', 'address' => '7/A dakshinpara Road. Kolkata-28.',
                'text' => 'You asked us to keep you up to date.'],
        ];

        $campaign = NewsletterCampaign::create([
            'name' => 'Footer address', 'subject' => 'A subject long enough',
            'status' => CampaignStatus::Draft,
            'blocks' => $blocks,
            'html_content' => EmailRenderer::render($blocks, []),
            'text_content' => str_repeat('Real words for a real message. ', 6),
        ]);

        $checks = collect(HealthCheck::run($campaign)['checks'])->keyBy('key');

        $this->assertTrue(
            $checks['address']['passed'],
            'An address written into the campaign footer was not counted.',
        );
    }

    /**
     * A footer block that says nothing falls back to the configured address.
     *
     * The editor stores `address => ''` for a field somebody left alone, and
     * `??` falls through on null but not on an empty string — so the blank
     * block beat the configured value and the footer rendered with no address
     * at all.
     */
    public function test_a_blank_footer_block_falls_back_to_the_configured_address(): void
    {
        $html = EmailRenderer::render(
            [['type' => 'footer', 'company' => '', 'address' => '']],
            ['company' => 'Technoware', 'address' => '12 Example Road, Kolkata 700001'],
        );

        $this->assertStringContainsString('12 Example Road, Kolkata 700001', $html);
        $this->assertStringContainsString('Technoware', $html);
    }

    /**
     * A campaign stuck on an undrained queue says so.
     *
     * This is the failure somebody actually hit: the test message arrived and
     * the campaign did not. A test send goes out inside the request; a campaign
     * is sent by queued jobs. With nothing draining the queue the campaign sits
     * at `sending`, every recipient stays `pending`, and **nothing is written
     * anywhere** — no exception, no log line, no `mail_error` — so the screen
     * looks like a send in progress, which is exactly what it is minus the part
     * that does the sending.
     *
     * The report carries the queue's age so the screen can say so.
     */
    public function test_the_report_reports_a_stalled_queue(): void
    {
        // phpunit.xml pins QUEUE_CONNECTION=sync, which cannot have a backlog.
        config(['queue.default' => 'database']);

        $campaign = NewsletterCampaign::create([
            'name' => 'Stuck', 'subject' => 'Stuck',
            'status' => CampaignStatus::Sending, 'recipient_count' => 1,
        ]);

        // A job queued ten minutes ago and never picked up.
        DB::table('jobs')->insert([
            'queue' => 'default',
            'payload' => json_encode(['displayName' => 'App\Jobs\SendCampaignBatch']),
            'attempts' => 0,
            'available_at' => time() - 600,
            'created_at' => time() - 600,
        ]);

        $queue = $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/report")
            ->assertOk()
            ->json('data.queue');

        $this->assertTrue($queue['known']);
        $this->assertSame(1, $queue['pending']);
        $this->assertGreaterThanOrEqual(600, $queue['oldest_seconds']);
        $this->assertTrue($queue['stalled'], 'A ten-minute-old job was not reported as stalled.');
    }

    /** A queue that is merely busy is not reported as broken. */
    public function test_a_fresh_job_is_not_a_stalled_queue(): void
    {
        config(['queue.default' => 'database']);

        $campaign = NewsletterCampaign::create([
            'name' => 'Busy', 'subject' => 'Busy',
            'status' => CampaignStatus::Sending, 'recipient_count' => 1,
        ]);

        DB::table('jobs')->insert([
            'queue' => 'default',
            'payload' => json_encode(['displayName' => 'App\Jobs\SendCampaignBatch']),
            'attempts' => 0,
            'available_at' => time(),
            'created_at' => time(),
        ]);

        $queue = $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/report")
            ->assertOk()
            ->json('data.queue');

        $this->assertFalse($queue['stalled'], 'A job queued a moment ago was reported as a broken deployment.');
    }

    /**
     * The newsletter is behind `campaign_manager`, not `content_manager`.
     *
     * The route block sat inside the content-manager group for months while the
     * comment above it and API.md both claimed `role:admin` — so anybody who
     * could edit a blog post could also mail the entire list, which is exactly
     * what that comment argued against. The role makes the claim and the code
     * the same thing.
     *
     * Both directions, because a gate is only as good as what it refuses.
     */
    public function test_the_newsletter_is_gated_on_the_campaign_manager_role(): void
    {
        $content = $this->staffWith(RoleEnum::ContentManager, 'content@example.test');

        $this->actingAs($content, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/subscribers')
            ->assertForbidden();

        $campaign = $this->staffWith(RoleEnum::CampaignManager, 'campaigns@example.test');

        $this->actingAs($campaign, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/subscribers')
            ->assertOk();
    }

    /** An administrator passes every role check implicitly, here as everywhere. */
    public function test_an_administrator_still_reaches_the_newsletter(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/newsletter/subscribers')
            ->assertOk();
    }

    /**
     * A campaign manager is not thereby a content manager.
     *
     * The point of a separate role is that it is *narrower*, so the test that
     * matters is the one asserting it does not spill sideways.
     */
    public function test_a_campaign_manager_cannot_edit_content(): void
    {
        $campaign = $this->staffWith(RoleEnum::CampaignManager, 'campaigns2@example.test');

        $this->actingAs($campaign, 'sanctum')
            ->getJson('/api/v1/admin/blog-posts')
            ->assertForbidden();
    }

    /** A staff account holding exactly one role. */
    private function staffWith(RoleEnum $role, string $email): User
    {
        $user = User::create([
            'name' => $role->label(), 'email' => $email,
            'password' => 'password-for-tests', 'is_active' => true,
        ]);

        // Roles are not seeded in tests; admin() creates its own the same way.
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => $role->value],
            ['name' => $role->label()],
        ));

        return $user;
    }

    private function csv(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'nl').'.csv';
        file_put_contents($path, $contents);

        return $path;
    }

    /**
     * A minimal ZIP writer, so the test builds the same kind of container the
     * reader has to open — `ext-zip` is not available here, which is the whole
     * reason `Xlsx` reads the format itself.
     *
     * @param  array<string, string>  $files
     */
    private static function writeZip(string $path, array $files): void
    {
        $local = '';
        $central = '';
        $offset = 0;

        foreach ($files as $name => $contents) {
            $crc = crc32($contents);
            $deflated = gzdeflate($contents);
            $header = pack('VvvvvvVVVvv', 0x04034B50, 20, 0, 8, 0, 0, $crc,
                strlen($deflated), strlen($contents), strlen($name), 0).$name;

            $local .= $header.$deflated;

            $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014B50, 20, 20, 0, 8, 0, 0, $crc,
                strlen($deflated), strlen($contents), strlen($name), 0, 0, 0, 0, 0, $offset).$name;

            $offset += strlen($header) + strlen($deflated);
        }

        $eocd = pack('VvvvvVVv', 0x06054B50, 0, 0, count($files), count($files),
            strlen($central), $offset, 0);

        file_put_contents($path, $local.$central.$eocd);
    }

    private function readyCampaign(NewsletterGroup $group): NewsletterCampaign
    {
        $campaign = NewsletterCampaign::create([
            'name' => 'A campaign',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>'.str_repeat('Readable words. ', 20)
                .'</p><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>',
            'text_content' => str_repeat('Readable words. ', 20),
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Ready,
        ]);

        $campaign->groups()->attach($group->id);

        return $campaign;
    }
}
