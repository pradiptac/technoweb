<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Models\Solution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Site-wide search, and specifically the one number on it that used to cost
 * a query per group whether or not there was anything to count.
 */
class SearchTest extends TestCase
{
    use RefreshDatabase;

    private function solutions(int $n): void
    {
        for ($i = 1; $i <= $n; $i++) {
            Solution::create([
                'title' => "Quantum tunnelling {$i}",
                'slug' => "quantum-{$i}",
                'summary' => 'A summary that says quantum too.',
                'status' => PublishStatus::Published,
            ]);
        }
    }

    /**
     * "Showing 5 of 7" has to say 7. The count is the one thing a real total
     * is for, and dropping it to save a query would make the page a lie.
     */
    public function test_a_full_group_reports_the_real_total(): void
    {
        $this->solutions(7);

        $res = $this->getJson('/api/v1/search?q=quantum')->assertOk();

        $group = collect($res->json('data.groups'))->firstWhere('type', 'solution');

        $this->assertSame(7, $group['total']);
        $this->assertCount(5, $group['results']);
    }

    /**
     * Three rows against a limit of five have already said how many there
     * are, so no second query is spent asking. Pinned by counting queries
     * rather than by reading the code: the whole point of the change is the
     * query that is *not* run, and only the log can see one of those.
     */
    public function test_a_partial_group_is_not_counted_twice(): void
    {
        $this->solutions(3);

        DB::flushQueryLog();
        DB::enableQueryLog();

        $res = $this->getJson('/api/v1/search?q=quantum')->assertOk();

        $log = DB::getQueryLog();
        DB::disableQueryLog();

        $group = collect($res->json('data.groups'))->firstWhere('type', 'solution');
        $this->assertSame(3, $group['total']);

        $counts = array_filter($log, fn ($q) => str_contains(strtolower($q['query']), 'count(*)'));
        $this->assertCount(0, $counts, 'No group came back full, so nothing should have been counted.');
    }

    public function test_a_term_under_the_floor_searches_nothing(): void
    {
        $this->solutions(1);

        $this->getJson('/api/v1/search?q=q')
            ->assertOk()
            ->assertJsonPath('data.total', 0)
            ->assertJsonPath('meta.min_length', 2);
    }
}
