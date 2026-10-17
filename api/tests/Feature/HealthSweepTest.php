<?php

namespace Tests\Feature;

use App\Jobs\SweepHealth;
use App\Models\HealthFinding;
use App\Models\HealthLink;
use App\Models\HealthSnapshot;
use App\Models\Page;
use App\Models\Redirect;
use App\Support\Health\HealthSettings;
use App\Support\Health\Score;
use App\Support\Upgrade\Steps\FirstHealthSweep;
use App\Support\Upgrade\UpgradeSteps;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class HealthSweepTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_tables_and_settings_exist(): void
    {
        $this->seed(SettingsSeeder::class);

        $finding = HealthFinding::create([
            'subject_type' => 'page', 'subject_id' => 1, 'subject_published' => true,
            'check' => 'stale', 'severity' => 'warning', 'field' => 'record',
            'detail' => ['months' => 20], 'fingerprint' => str_repeat('a', 40),
            'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);

        $this->assertSame(['months' => 20], $finding->fresh()->detail);
        $this->assertSame(18, HealthSettings::staleMonths('page'));
        $this->assertSame(0, HealthSettings::staleMonths('blog_post'));
        $this->assertTrue(HealthSettings::externalOn());
        $this->assertNull(HealthSettings::refusalFor('health_stale_page', '24'));
        $this->assertSame('A whole number of months, 0 to 60.', HealthSettings::refusalFor('health_stale_page', '61'));
    }

    private function page(string $slug, string $body, string $status = 'published'): Page
    {
        return Page::create(['title' => ucfirst($slug), 'slug' => $slug, 'body' => $body, 'status' => $status]);
    }

    public function test_there_is_no_score_before_the_first_sweep(): void
    {
        $this->page('good', '<p>Fine.</p>');

        $this->assertNull(Score::now());

        Cache::forever(Score::LAST_SWEEP_KEY, now()->toIso8601String());
        $this->assertSame(100, Score::now());
    }

    private function finding(int $id, string $subjectType = 'page'): void
    {
        HealthFinding::create([
            'subject_type' => $subjectType, 'subject_id' => $id, 'subject_published' => true,
            'check' => 'stale', 'severity' => 'warning', 'field' => 'record',
            'detail' => [], 'fingerprint' => sha1((string) $id), 'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);
    }

    public function test_the_score_is_never_100_beside_a_problem_and_never_below_0(): void
    {
        Cache::forever(Score::LAST_SWEEP_KEY, now()->toIso8601String());
        Page::withoutEvents(function () {
            foreach (range(1, 250) as $i) {
                Page::create(['title' => "P{$i}", 'slug' => "p-{$i}", 'body' => '<p>x</p>', 'status' => 'published']);
            }
        });

        $this->finding(Page::first()->id);
        // 249 of 250 rounds to 100; the floor says 99.
        $this->assertSame(99, Score::now());

        foreach (range(1000, 1300) as $i) {
            $this->finding($i);
        }
        $this->assertSame(0, Score::now());
    }

    public function test_the_score_counts_published_records_and_ignores_notices(): void
    {
        Cache::forever(Score::LAST_SWEEP_KEY, now()->toIso8601String());
        $this->assertNull(Score::now());

        $this->page('good', '<p>Fine.</p>');
        $this->page('bad', '<p><a href="/blog">click here</a></p>');
        $this->page('draft', '<p><a href="/blog">click here</a></p>', 'draft');
        Redirect::create(['from_path' => '/old', 'to_path' => '/blog', 'status_code' => 301, 'is_active' => true, 'created_automatically' => false]);
        $this->page('notice', '<p><a href="/old">The old page</a></p>');

        // Three published, one with a warning: 2 of 3 healthy.
        $this->assertSame(67, Score::now());

        HealthFinding::where('check', 'link_text_vague')->update(['ignored_at' => now()]);
        $this->assertSame(100, Score::now());
    }

    public function test_a_sweep_paused_after_one_slice_finishes_with_the_same_findings(): void
    {
        $this->page('one', '<p><a href="/blog">here</a></p>');
        $this->page('two', '<p><a href="/blog">more</a></p>');
        HealthFinding::query()->delete();

        SweepHealth::$budgetSeconds = 0; // every slice ends after one record
        try {
            $this->artisan('technoware:health-sweep')->assertSuccessful();
        } finally {
            SweepHealth::$budgetSeconds = 40; // a static outlives the test
        }

        $this->assertSame(2, HealthFinding::count());
        $this->assertSame(1, HealthSnapshot::count());
        $this->assertNotNull(Cache::get(Score::LAST_SWEEP_KEY));
        $this->assertNotNull(HealthSnapshot::sole()->score);
    }

    public function test_an_update_starts_the_first_sweep(): void
    {
        Queue::fake();

        $this->assertContains(FirstHealthSweep::class, UpgradeSteps::STEPS);
        UpgradeSteps::run(app(FirstHealthSweep::class));

        Queue::assertPushed(SweepHealth::class);
        $this->assertDatabaseHas('system_upgrade_steps', ['step' => '2026-10-17-first-health-sweep']);
    }

    public function test_links_nothing_points_at_are_pruned_by_the_sweep(): void
    {
        $link = HealthLink::create(['url_hash' => sha1('x'), 'url' => 'https://gone.example', 'host' => 'gone.example', 'next_check_at' => now()]);
        $link->forceFill(['created_at' => now()->subDays(2)])->save();

        $this->artisan('technoware:health-sweep')->assertSuccessful();

        $this->assertSame(0, HealthLink::count());
    }

    public function test_the_score_survives_the_cache_being_cleared_by_an_update(): void
    {
        Page::withoutEvents(fn () => Page::create(['title' => 'P', 'slug' => 'p', 'body' => '<p>x</p>', 'status' => 'published']));
        HealthSnapshot::create(['date' => now()->toDateString(), 'score' => 100, 'records_checked' => 1, 'counts' => []]);
        Cache::forget(Score::LAST_SWEEP_KEY); // what optimize:clear does on every update

        $this->assertNotNull(Score::lastSweepAt());
        $this->assertSame(100, Score::now());

        HealthSnapshot::query()->delete();
        $this->assertNull(Score::now());
    }
}
