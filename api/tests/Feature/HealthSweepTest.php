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
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
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

    public function test_the_score_counts_published_records_and_ignores_notices(): void
    {
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
    }

    public function test_links_nothing_points_at_are_pruned_by_the_sweep(): void
    {
        $link = HealthLink::create(['url_hash' => sha1('x'), 'url' => 'https://gone.example', 'host' => 'gone.example', 'next_check_at' => now()]);
        $link->forceFill(['created_at' => now()->subDays(2)])->save();

        $this->artisan('technoware:health-sweep')->assertSuccessful();

        $this->assertSame(0, HealthLink::count());
    }
}
