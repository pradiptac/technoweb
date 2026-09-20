<?php

namespace Tests\Feature;

use App\Enums\CampaignStatus;
use App\Enums\EmailVerification;
use App\Enums\Role as RoleEnum;
use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Jobs\SendCampaignBatch;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\NewsletterVerification;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Newsletter\AudienceResolver;
use App\Support\Newsletter\CampaignSender;
use App\Support\Newsletter\SubscriberVerifier;
use Carbon\Carbon;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Hunter verification of subscriber addresses.
 *
 * The rules worth pinning are the ones about money and about mail: the
 * month's allowance is never overspent, an address is never paid for twice,
 * and a verdict — which is a prediction — excludes an address from a send
 * without ever touching the suppression list, which records facts.
 *
 * Every test names the rule it holds, so reverting that rule fails exactly
 * that test.
 */
class NewsletterVerificationTest extends TestCase
{
    use RefreshDatabase;

    private const ACCOUNT_URL = 'api.hunter.io/v2/account*';

    private const VERIFY_URL = 'api.hunter.io/v2/email-verifier*';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        Setting::put('hunter_api_key', 'test-key');
        Cache::flush();
    }

    // ------------------------------------------------------------- verdicts

    public function test_valid_and_webmail_become_verified_and_the_score_is_kept(): void
    {
        $this->fake(['a@example.test' => ['valid', 97], 'b@gmail.test' => ['webmail', 50]]);

        $a = $this->subscriber('a@example.test');
        $b = $this->subscriber('b@gmail.test');

        $this->verifier()->run(10);

        $this->assertSame(EmailVerification::Verified, $a->fresh()->verification);
        $this->assertSame(97, $a->fresh()->verification_score);
        $this->assertSame('valid', $a->fresh()->verification_result);
        $this->assertSame(EmailVerification::Verified, $b->fresh()->verification);
        $this->assertSame('webmail', $b->fresh()->verification_result);
        $this->assertSame(2, NewsletterVerification::where('http_status', 200)->count());
    }

    public function test_accept_all_becomes_risky_and_is_still_sent_to(): void
    {
        $this->fake(['corp@example.test' => ['accept_all', 65]]);

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $s = $this->subscriber('corp@example.test', $group);

        $this->verifier()->run(10);

        $this->assertSame(EmailVerification::Risky, $s->fresh()->verification);
        $this->assertTrue(AudienceResolver::eligible([$group->id])->contains('id', $s->id));
        $this->assertSame(0, AudienceResolver::preview([$group->id])['unverifiable_removed']);
    }

    /**
     * The rule with the most at stake. An address Hunter is sure about is
     * left out of the send and named in the review — and is **not**
     * suppressed, because a prediction is not a bounce and staff can
     * overrule it with Re-check.
     */
    public function test_invalid_and_disposable_are_excluded_from_the_audience_and_never_suppressed(): void
    {
        $this->fake([
            'nobody@example.test' => ['invalid', 0],
            'temp@mailinator.test' => ['disposable', 0],
            'real@example.test' => ['valid', 100],
        ]);

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $invalid = $this->subscriber('nobody@example.test', $group);
        $disposable = $this->subscriber('temp@mailinator.test', $group);
        $real = $this->subscriber('real@example.test', $group);

        $this->verifier()->run(10);

        $eligible = AudienceResolver::eligible([$group->id])->pluck('id');
        $this->assertSame([$real->id], $eligible->all());

        $preview = AudienceResolver::preview([$group->id]);
        $this->assertSame(2, $preview['unverifiable_removed']);
        $this->assertSame(1, $preview['final_recipients']);

        $this->assertSame(0, NewsletterSuppression::count());
        $this->assertSame(SubscriberStatus::Active, $invalid->fresh()->status);
        $this->assertSame(SubscriberStatus::Active, $disposable->fresh()->status);
        $this->assertFalse($invalid->fresh()->canReceive());
        $this->assertTrue($real->fresh()->canReceive());
    }

    /** A verdict that lands between the freeze and the batch still counts. */
    public function test_a_recipient_that_fails_verification_after_freezing_is_skipped(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $s = $this->subscriber('late@example.test', $group);

        $campaign = $this->readyCampaign($group);
        CampaignSender::queue($campaign->fresh());
        $recipient = $campaign->recipients()->firstOrFail();

        $s->forceFill(['verification' => EmailVerification::Invalid])->save();

        (new SendCampaignBatch($campaign->id, [$recipient->id]))->handle();

        $this->assertSame('skipped', $recipient->fresh()->status);
        $this->assertStringContainsString('verification', $recipient->fresh()->failure_reason);
    }

    // ---------------------------------------------------------- never twice

    public function test_unknown_is_retried_and_becomes_risky_on_the_third_attempt(): void
    {
        $this->fake(['shy@example.test' => ['unknown', null]]);
        $s = $this->subscriber('shy@example.test');

        $this->verifier()->run(10);
        $this->assertSame(EmailVerification::Pending, $s->fresh()->verification);
        $this->assertSame(1, $s->fresh()->verification_attempts);

        $this->verifier()->run(10);
        $this->assertSame(EmailVerification::Pending, $s->fresh()->verification);
        $this->assertSame(2, $s->fresh()->verification_attempts);

        $this->verifier()->run(10);
        $this->assertSame(EmailVerification::Risky, $s->fresh()->verification);
        $this->assertSame(3, $s->fresh()->verification_attempts);

        // The fourth pass has nothing to ask about.
        $this->verifier()->run(10);
        $this->assertSame(3, $this->verifyCalls());
    }

    public function test_a_settled_address_is_never_asked_again(): void
    {
        $this->fake(['once@example.test' => ['valid', 90]]);
        $this->subscriber('once@example.test');

        $this->verifier()->run(10);
        $this->verifier()->run(10);
        $this->verifier()->run(10);

        $this->assertSame(1, $this->verifyCalls());
    }

    /** Deleted and re-imported is the same mailbox, and the ledger knows it. */
    public function test_a_reimported_address_reuses_the_ledger_verdict_without_a_call(): void
    {
        $this->fake(['back@example.test' => ['invalid', 0]]);
        $s = $this->subscriber('back@example.test');

        $this->verifier()->run(10);
        $this->assertSame(1, $this->verifyCalls());

        $s->delete();
        $again = $this->subscriber('Back@Example.test');

        $tally = $this->verifier()->run(10);

        $this->assertSame(1, $this->verifyCalls());
        $this->assertSame(1, $tally['copied']);
        $this->assertSame(EmailVerification::Invalid, $again->fresh()->verification);
        $this->assertSame(1, NewsletterVerification::where('source', 'ledger')->count());
        // And the copy did not cost anything.
        $this->assertSame(1, NewsletterVerification::usedThisMonth());
    }

    // ------------------------------------------------------------- the cap

    public function test_the_daily_share_is_what_is_left_spread_over_the_days_left(): void
    {
        Carbon::setTestNow('2026-09-13 03:55:00');
        Setting::put('hunter_monthly_cap', '100');

        $this->ledger(37, 200);

        $budget = $this->verifier()->budget();

        $this->assertSame(37, $budget['used']);
        $this->assertSame(63, $budget['remaining']);
        $this->assertSame(18, $budget['days_left']);
        $this->assertSame((int) ceil(63 / 18), $budget['per_day']);
        $this->assertSame('2026-10-01', $budget['resets_on']);

        // And a run takes exactly that many of a bigger queue.
        $this->fake([], ['valid', 80]);
        foreach (range(1, 12) as $i) {
            $this->subscriber("s{$i}@example.test");
        }

        $tally = $this->verifier()->run();

        $this->assertSame($budget['per_day'], $tally['calls']);
        $this->assertSame($budget['per_day'], $this->verifyCalls());

        Carbon::setTestNow();
    }

    public function test_the_cap_counts_only_calls_that_reached_hunter(): void
    {
        $this->ledger(2, 200);
        $this->ledger(1, 202);
        $this->ledger(1, 222);
        $this->ledger(3, 401);
        $this->ledger(3, 429);
        $this->ledger(2, 0);

        $this->assertSame(4, NewsletterVerification::usedThisMonth());
    }

    public function test_nothing_is_spent_once_the_month_is_used_up(): void
    {
        Setting::put('hunter_monthly_cap', '5');
        $this->ledger(5, 200);
        $this->fake([], ['valid', 80]);
        $this->subscriber('one@example.test');

        $tally = $this->verifier()->run();

        $this->assertSame(0, $tally['calls']);
        $this->assertSame(0, $this->verifyCalls());
    }

    /** Hunter's own figure is the truth, and it is read before spending. */
    public function test_the_run_stops_at_hunters_own_available_figure(): void
    {
        Setting::put('hunter_monthly_cap', '60');
        $this->fake([], ['valid', 80], available: 2);
        foreach (range(1, 6) as $i) {
            $this->subscriber("s{$i}@example.test");
        }

        $tally = $this->verifier()->run(10);

        $this->assertSame(2, $tally['calls']);
        $this->assertSame(2, $this->verifyCalls());
    }

    // ------------------------------------------------------------- failure

    public function test_a_bad_key_stops_the_run_and_writes_the_error(): void
    {
        Http::fake([
            self::ACCOUNT_URL => Http::response($this->account(), 200),
            self::VERIFY_URL => Http::response(['errors' => [['details' => 'Invalid API key']]], 401),
        ]);
        foreach (range(1, 5) as $i) {
            $this->subscriber("s{$i}@example.test");
        }

        $tally = $this->verifier()->run(10);

        $this->assertSame(1, $this->verifyCalls());
        $this->assertStringContainsString('Invalid API key', (string) $tally['stopped']);
        $this->assertStringContainsString('Invalid API key', (string) SubscriberVerifier::error());
        $this->assertSame(5, NewsletterSubscriber::where('verification', 'unverified')->count());
        $this->assertSame(0, NewsletterVerification::usedThisMonth());
    }

    public function test_a_spent_plan_stops_the_run_and_writes_the_error(): void
    {
        Http::fake([
            self::ACCOUNT_URL => Http::response($this->account(available: 50), 200),
            self::VERIFY_URL => Http::response(['errors' => [['details' => 'Usage limit reached']]], 429),
        ]);
        $this->subscriber('a@example.test');
        $this->subscriber('b@example.test');

        $tally = $this->verifier()->run(10);

        $this->assertSame(1, $this->verifyCalls());
        $this->assertStringContainsString('Usage limit', (string) $tally['stopped']);
        $this->assertStringContainsString('Usage limit', (string) SubscriberVerifier::error());
    }

    public function test_the_next_successful_call_clears_the_error(): void
    {
        SubscriberVerifier::fail('Invalid API key');
        $this->fake(['ok@example.test' => ['valid', 90]]);
        $this->subscriber('ok@example.test');

        $this->verifier()->run(10);

        $this->assertNull(SubscriberVerifier::error());
    }

    /** A network that was down must not cost an address one of its attempts. */
    public function test_a_transport_failure_burns_no_attempt(): void
    {
        Http::fake([
            self::ACCOUNT_URL => Http::response($this->account(), 200),
            self::VERIFY_URL => fn (Request $r) => throw new ConnectionException('cURL error 28'),
        ]);
        foreach (range(1, 5) as $i) {
            $this->subscriber("s{$i}@example.test");
        }

        $tally = $this->verifier()->run(10);

        // A request that threw is not recorded by the fake, so the ledger is
        // the count: three rows at http 0, and it stopped there.
        $this->assertSame(3, NewsletterVerification::where('http_status', 0)->count());
        $this->assertStringContainsString('three times', (string) $tally['stopped']);
        $this->assertSame(0, NewsletterSubscriber::where('verification_attempts', '>', 0)->count());
        $this->assertSame(0, NewsletterVerification::usedThisMonth());
    }

    /** The scheduler must never see a failed event for a Hunter outage. */
    public function test_the_command_exits_zero_whatever_hunter_does(): void
    {
        Http::fake([self::ACCOUNT_URL => Http::response(['errors' => [['details' => 'Invalid API key']]], 401)]);
        $this->subscriber('a@example.test');

        $this->artisan('technoware:verify-subscribers')->assertExitCode(0);

        $this->assertStringContainsString('Invalid API key', (string) SubscriberVerifier::error());
        $this->assertSame(0, $this->verifyCalls());
    }

    // ---------------------------------------------------------------- queue

    public function test_only_active_unsuppressed_subscribers_are_queued(): void
    {
        $this->fake([], ['valid', 80]);
        $this->subscriber('active@example.test');
        $this->subscriber('left@example.test', null, ['status' => SubscriberStatus::Unsubscribed]);
        $this->subscriber('bounced@example.test', null, ['status' => SubscriberStatus::Bounced]);
        $this->subscriber('suppressed@example.test');
        NewsletterSuppression::add('suppressed@example.test', SuppressionReason::Manual);

        $this->assertSame(['active@example.test'], $this->verifier()->queue()->pluck('email')->all());

        $this->verifier()->run(10);

        $this->assertSame(1, $this->verifyCalls());
    }

    public function test_nothing_runs_without_a_key_or_with_the_cap_at_zero(): void
    {
        $this->fake([], ['valid', 80]);
        $this->subscriber('a@example.test');

        Setting::put('hunter_api_key', null);
        $this->assertSame('no key', $this->verifier()->run(10)['skipped']);

        Setting::put('hunter_api_key', 'test-key');
        Setting::put('hunter_monthly_cap', '0');
        $this->assertSame('paused', $this->verifier()->run(10)['skipped']);

        Http::assertNothingSent();
    }

    public function test_a_dry_run_calls_nothing_and_reports_the_queue(): void
    {
        $this->fake([], ['valid', 80]);
        $this->subscriber('waiting@example.test');

        $this->artisan('technoware:verify-subscribers', ['--dry-run' => true])
            ->expectsOutputToContain('1 waiting')
            ->expectsOutputToContain('waiting@example.test')
            ->assertExitCode(0);

        $this->assertSame(0, $this->verifyCalls());
    }

    // ------------------------------------------------------------ endpoints

    public function test_the_verification_report(): void
    {
        $this->fake([], ['valid', 80], available: 63, used: 37);
        $manager = $this->staffWith(RoleEnum::CampaignManager, 'nl@example.test');

        $this->subscriber('v@example.test', null, ['verification' => EmailVerification::Verified]);
        $this->subscriber('r@example.test', null, ['verification' => EmailVerification::Risky]);
        $this->subscriber('i@example.test', null, ['verification' => EmailVerification::Invalid]);
        $this->subscriber('u@example.test');
        $this->ledger(3, 200);
        SubscriberVerifier::fail('Something earlier');

        $res = $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/verification')
            ->assertOk()
            ->assertJsonPath('data.configured', true)
            ->assertJsonPath('data.paused', false)
            ->assertJsonPath('data.breakdown.verified', 1)
            ->assertJsonPath('data.breakdown.risky', 1)
            ->assertJsonPath('data.breakdown.invalid', 1)
            ->assertJsonPath('data.breakdown.unverified', 1)
            ->assertJsonPath('data.month.cap', 100)
            ->assertJsonPath('data.month.used', 3)
            ->assertJsonPath('data.hunter.available', 63)
            ->assertJsonPath('data.hunter.used', 37)
            ->assertJsonPath('data.queue.waiting', 1);

        $this->assertStringContainsString('Something earlier', $res->json('data.error'));
        $this->assertCount(3, $res->json('data.recent'));

        // Without a key: not configured, and no Hunter figures, but the facts stay.
        Setting::put('hunter_api_key', null);
        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/verification')
            ->assertOk()
            ->assertJsonPath('data.configured', false)
            ->assertJsonPath('data.hunter', null)
            ->assertJsonPath('data.breakdown.verified', 1);

        // Content managers cannot see it.
        $content = $this->staffWith(RoleEnum::ContentManager, 'cm@example.test');
        $this->actingAs($content, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/verification')
            ->assertForbidden();
    }

    public function test_a_manual_recheck_asks_hunter_about_a_settled_row_and_respects_the_cap(): void
    {
        $this->fake(['done@example.test' => ['invalid', 0]]);
        $manager = $this->staffWith(RoleEnum::CampaignManager, 'nl@example.test');
        $s = $this->subscriber('done@example.test', null, [
            'verification' => EmailVerification::Risky, 'verification_attempts' => 3,
        ]);

        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/v1/admin/newsletter/subscribers/{$s->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.verification', 'invalid')
            ->assertJsonPath('data.verification_attempts', 1);

        $this->assertSame(1, $this->verifyCalls());

        // The month is used up: refused, and nothing asked.
        Setting::put('hunter_monthly_cap', '1');
        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/v1/admin/newsletter/subscribers/{$s->id}/verify")
            ->assertStatus(422);
        $this->assertSame(1, $this->verifyCalls());

        // No key: refused with a sentence that says where to put one.
        Setting::put('hunter_monthly_cap', '100');
        Setting::put('hunter_api_key', null);
        $res = $this->actingAs($manager, 'sanctum')
            ->postJson("/api/v1/admin/newsletter/subscribers/{$s->id}/verify")
            ->assertStatus(422);
        $this->assertStringContainsString('API key', $res->json('message'));
        $this->assertSame(1, $this->verifyCalls());
    }

    public function test_the_key_test_endpoint_is_admin_only_and_returns_hunters_own_words(): void
    {
        $admin = $this->staffWith(RoleEnum::Admin, 'admin@example.test');
        $manager = $this->staffWith(RoleEnum::CampaignManager, 'nl@example.test');

        // The first stub registered wins for the life of the test, so the two
        // answers are a sequence rather than two fakes: 200, then 401.
        Http::fake([self::ACCOUNT_URL => Http::sequence()
            ->push($this->account(63, 37), 200)
            ->push(['errors' => [['details' => 'Invalid API key']]], 401)]);
        SubscriberVerifier::fail('Earlier failure');

        $this->actingAs($manager, 'sanctum')
            ->postJson('/api/v1/admin/settings/integrations/hunter/test')
            ->assertForbidden();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/settings/integrations/hunter/test')
            ->assertOk()
            ->assertJsonPath('data.available', 63)
            ->assertJsonPath('data.used', 37)
            ->assertJsonPath('data.plan_name', 'Free');

        $this->assertNull(SubscriberVerifier::error());

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/settings/integrations/hunter/test')
            ->assertStatus(422);
        $this->assertSame('Invalid API key', $res->json('message'));

        Setting::put('hunter_api_key', null);
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/settings/integrations/hunter/test')
            ->assertStatus(422);
    }

    public function test_the_index_filters_by_verification_and_lists_the_options(): void
    {
        $manager = $this->staffWith(RoleEnum::CampaignManager, 'nl@example.test');
        $this->subscriber('v@example.test', null, ['verification' => EmailVerification::Verified]);
        $this->subscriber('i@example.test', null, ['verification' => EmailVerification::Invalid]);

        $res = $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/subscribers?verification=invalid')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.email', 'i@example.test')
            ->assertJsonPath('data.0.verification_label', 'Invalid');

        $this->assertCount(count(EmailVerification::cases()), $res->json('meta.verifications'));

        $csv = $this->actingAs($manager, 'sanctum')
            ->get('/api/v1/admin/newsletter/subscribers/export?verification=verified')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('Verification', $csv);
        $this->assertStringContainsString('v@example.test', $csv);
        $this->assertStringNotContainsString('i@example.test', $csv);
    }

    public function test_the_dashboard_carries_the_verification_counts(): void
    {
        $manager = $this->staffWith(RoleEnum::CampaignManager, 'nl@example.test');
        $this->subscriber('v@example.test', null, ['verification' => EmailVerification::Verified]);
        $this->subscriber('i@example.test', null, ['verification' => EmailVerification::Invalid]);
        $this->subscriber('d@example.test', null, ['verification' => EmailVerification::Disposable]);
        $this->subscriber('u@example.test');

        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/newsletter/dashboard')
            ->assertOk()
            ->assertJsonPath('data.subscribers.verification.verified', 1)
            ->assertJsonPath('data.subscribers.verification.unsendable', 2)
            ->assertJsonPath('data.subscribers.verification.waiting', 1);
    }

    public function test_the_key_is_never_returned(): void
    {
        $admin = $this->staffWith(RoleEnum::Admin, 'admin@example.test');

        $rows = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/settings')
            ->assertOk()
            ->json('data.integrations');

        $row = collect($rows)->firstWhere('key', 'hunter_api_key');

        $this->assertNotNull($row);
        $this->assertTrue($row['is_secret']);
        $this->assertTrue($row['is_set']);
        $this->assertNull($row['value']);

        $this->assertStringNotContainsString('test-key', json_encode($rows));
    }

    // -------------------------------------------------------------- helpers

    /**
     * Fake Hunter. `$byEmail` maps an address to `[status, score]`; anything
     * else gets `$default`.
     *
     * @param  array<string, array{0: string, 1: ?int}>  $byEmail
     */
    private function fake(array $byEmail, ?array $default = null, int $available = 100, int $used = 0): void
    {
        Http::fake([
            self::ACCOUNT_URL => Http::response($this->account($available, $used), 200),
            self::VERIFY_URL => function (Request $request) use ($byEmail, $default) {
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
                $email = mb_strtolower($query['email'] ?? '');
                [$status, $score] = $byEmail[$email] ?? $default ?? ['unknown', null];

                return Http::response(['data' => [
                    'status' => $status,
                    'score' => $score,
                    'email' => $email,
                ]], 200);
            },
        ]);
    }

    private function account(int $available = 100, int $used = 0): array
    {
        return ['data' => [
            'plan_name' => 'Free',
            'reset_date' => '2026-10-01',
            'requests' => ['verifications' => ['used' => $used, 'available' => $available]],
        ]];
    }

    private function verifyCalls(): int
    {
        $n = 0;
        Http::assertSent(function (Request $r) use (&$n) {
            if (str_contains($r->url(), 'email-verifier')) {
                $n++;
            }

            return true;
        });

        return $n;
    }

    private function ledger(int $count, int $http): void
    {
        foreach (range(1, $count) as $i) {
            NewsletterVerification::create([
                'email' => "old{$http}-{$i}@example.test",
                'http_status' => $http,
                'status' => $http === 200 ? 'valid' : null,
                'score' => null,
                'source' => 'scheduled',
                'created_at' => now(),
            ]);
        }
    }

    private function verifier(): SubscriberVerifier
    {
        return new SubscriberVerifier;
    }

    private function subscriber(string $email, ?NewsletterGroup $group = null, array $attributes = []): NewsletterSubscriber
    {
        $s = NewsletterSubscriber::create(['email' => $email, ...$attributes]);

        if ($group) {
            $s->groups()->attach($group->id);
        }

        return $s;
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

    private function staffWith(RoleEnum $role, string $email): User
    {
        $user = User::create([
            'name' => $role->label(), 'email' => $email,
            'password' => 'password-for-tests', 'is_active' => true,
        ]);

        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => $role->value],
            ['name' => $role->label()],
        ));

        return $user;
    }
}
