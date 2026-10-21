<?php

namespace Tests\Feature;

use App\Models\AnalyticsDaily;
use App\Models\AnalyticsHit;
use App\Support\Analytics\Report;
use App\Support\Analytics\Rollup;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AnalyticsReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-21 12:00', 'Asia/Kolkata'));
    }

    /** @param array<string, mixed> $extra */
    private function hit(string $day, string $visitor, string $path, array $extra = []): void
    {
        AnalyticsHit::create(['day' => $day, 'at' => $day.' 10:00:00', 'kind' => 'pageview', 'path' => $path, 'visitor' => str_pad($visitor, 16, "\0"),
            'entry' => false, 'channel' => 'direct', 'device' => 'desktop', ...$extra]);
    }

    public function test_the_rollup_counts_views_visits_entries_and_bounces(): void
    {
        $this->hit('2026-10-20', 'a', '/', ['entry' => true, 'channel' => 'search', 'source' => 'Google']);
        $this->hit('2026-10-20', 'a', '/about');
        $this->hit('2026-10-20', 'b', '/', ['entry' => true]);

        Rollup::day('2026-10-20');
        $total = AnalyticsDaily::where(['day' => '2026-10-20', 'dimension' => 'total', 'kind' => 'pageview'])->sole();
        $this->assertSame([3, 2, 2, 1], [$total->views, $total->visitors, $total->entries, $total->bounces]);

        Rollup::day('2026-10-20');
        $this->assertSame(1, AnalyticsDaily::where(['day' => '2026-10-20', 'dimension' => 'total', 'kind' => 'pageview'])->count(), 'a rebuild replaces, never adds');
    }

    public function test_today_is_merged_and_a_rolled_day_is_not_counted_twice(): void
    {
        $this->hit('2026-10-20', 'a', '/', ['entry' => true]);
        Rollup::day('2026-10-20');
        $this->hit('2026-10-21', 'c', '/', ['entry' => true]);
        $this->hit('2026-10-21', 'c', '/x');

        $s = Report::summary(Carbon::parse('2026-10-20'), Carbon::parse('2026-10-21'), 'none');
        $this->assertSame(3, $s['views']['value']);
        $this->assertSame(2, $s['visits']['value']);
    }

    public function test_figures_over_no_data_are_null(): void
    {
        $s = Report::summary(Carbon::parse('2026-10-01'), Carbon::parse('2026-10-07'), 'previous');
        $this->assertSame(0, $s['views']['value']);
        $this->assertNull($s['bounce_share']['value']);
        $this->assertNull($s['views_per_visit']['value']);
        $this->assertNull($s['views']['change']);
    }

    public function test_the_comparison_is_the_same_length_before(): void
    {
        $this->hit('2026-10-13', 'a', '/', ['entry' => true]);
        $this->hit('2026-10-20', 'b', '/', ['entry' => true]);
        $this->hit('2026-10-20', 'c', '/', ['entry' => true]);
        Rollup::day('2026-10-13');
        Rollup::day('2026-10-20');

        $s = Report::summary(Carbon::parse('2026-10-15'), Carbon::parse('2026-10-21'), 'previous');
        $this->assertSame(2, $s['visits']['value']);
        $this->assertSame(1, $s['visits']['previous']);
        $this->assertSame(100.0, $s['visits']['change']);
    }

    public function test_the_prune_drops_raw_hits_after_ninety_days_and_keeps_totals(): void
    {
        $this->hit('2026-07-01', 'a', '/', ['entry' => true]);
        Rollup::day('2026-07-01');
        $this->artisan('technoware:prune-analytics-hits')->assertSuccessful();
        $this->assertSame(0, AnalyticsHit::count());
        $this->assertSame(1, AnalyticsDaily::where(['day' => '2026-07-01', 'dimension' => 'total'])->count());
    }

    public function test_the_rollup_command_rolls_every_closed_day_not_yet_rolled(): void
    {
        $this->hit('2026-10-19', 'a', '/', ['entry' => true]);
        $this->hit('2026-10-20', 'b', '/', ['entry' => true]);
        $this->hit('2026-10-21', 'c', '/', ['entry' => true]);
        $this->artisan('technoware:analytics-rollup')->assertSuccessful();
        $this->assertSame(['2026-10-19', '2026-10-20'], AnalyticsDaily::where('dimension', 'total')->orderBy('day')->pluck('day')->map->toDateString()->all());
    }

    public function test_pages_answer_in_the_seo_overviews_shape(): void
    {
        $this->hit('2026-10-20', 'a', '/solutions/wifi', ['entry' => true]);
        $this->hit('2026-10-20', 'b', '/solutions/wifi', ['entry' => true]);
        Rollup::day('2026-10-20');
        $this->assertSame(['views' => 2, 'users' => 2], Report::pages(28)['/solutions/wifi']);
    }
}
