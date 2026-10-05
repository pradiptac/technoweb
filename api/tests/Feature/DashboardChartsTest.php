<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Role;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * The dashboard's chart series (2026-10-05): the previous period beside the
 * volume series, the arrivals heatmap, and the lead sparkline and funnel.
 *
 * Each pins the rule that makes the chart honest rather than the shape
 * alone — no gaps, buckets aligned with the period they compare to, a funnel
 * that counts what happened to the leads that arrived, spam left out.
 */
class DashboardChartsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    private function staff(RoleEnum ...$roles): User
    {
        static $n = 0;
        $user = User::create([
            'name' => 'Staff '.(++$n),
            'email' => "charts{$n}@example.test",
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        foreach ($roles as $role) {
            $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));
        }

        return $user->load('roles');
    }

    private function ticketAt(CarbonImmutable $at): Ticket
    {
        $customer = Customer::firstOrCreate(['email' => 'neil@example.test'], [
            'name' => 'Neil Basu', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);

        $ticket = $customer->tickets()->make([
            'subject' => 'A ticket', 'description' => 'Enough words to be a description.',
            'ticket_category_id' => $category->id, 'status' => TicketStatus::Open, 'priority' => 'normal',
        ]);
        $ticket->save();
        $ticket->forceFill(['created_at' => $at])->saveQuietly();

        return $ticket;
    }

    private function lead(string $status, ?CarbonImmutable $contacted = null, ?CarbonImmutable $created = null): Lead
    {
        $lead = Lead::create([
            'name' => 'A lead', 'email' => 'buyer@example.test', 'message' => 'Switches, please.',
            'source_type' => 'enquiry', 'source_id' => 1, 'channel' => 'enquiry',
            'status' => $status, 'score' => 0, 'score_band' => 'cold', 'score_reasons' => [],
        ]);
        $lead->forceFill([
            'contacted_at' => $contacted,
            'created_at' => $created ?? CarbonImmutable::now(),
        ])->saveQuietly();

        return $lead;
    }

    public function test_the_volume_series_carries_the_period_before_it_aligned_by_position(): void
    {
        $this->ticketAt(CarbonImmutable::today()->setTime(10, 0));
        $this->ticketAt(CarbonImmutable::today()->subDays(30)->setTime(10, 0));
        $this->ticketAt(CarbonImmutable::today()->subDays(30)->setTime(11, 0));

        $series = $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->json('data.metrics.volume_series');

        $this->assertCount(30, $series['points']);
        $this->assertCount(30, $series['previous']);
        // The last bucket is today; the one it compares to is thirty days back.
        $this->assertSame(CarbonImmutable::today()->toDateString(), $series['points'][29]['date']);
        $this->assertSame(1, $series['points'][29]['created']);
        $this->assertSame(CarbonImmutable::today()->subDays(30)->toDateString(), $series['previous'][29]['date']);
        $this->assertSame(2, $series['previous'][29]['created']);
        // Nothing double-counted across the seam.
        $this->assertSame(1, array_sum(array_column($series['points'], 'created')));
        $this->assertSame(2, array_sum(array_column($series['previous'], 'created')));
    }

    public function test_a_quarter_compares_to_the_thirteen_weeks_before_it(): void
    {
        $series = $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/dashboard?volume=quarter')
            ->assertOk()
            ->json('data.metrics.volume_series');

        $this->assertSame('week', $series['bucket']);
        $this->assertCount(13, $series['previous']);
        $this->assertSame(
            CarbonImmutable::parse($series['points'][0]['date'])->subWeek()->toDateString(),
            $series['previous'][12]['date'],
        );
    }

    public function test_arrivals_is_a_full_weekday_by_hour_grid(): void
    {
        // A Monday at 09:00, twice, and nothing else.
        $monday = CarbonImmutable::today()->startOfWeek(CarbonImmutable::MONDAY)->setTime(9, 15);
        $this->ticketAt($monday);
        $this->ticketAt($monday->addMinutes(20));
        // Outside the ninety days: not counted.
        $this->ticketAt(CarbonImmutable::today()->subDays(120)->setTime(9, 0));

        $arrivals = $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->json('data.metrics.arrivals');

        $this->assertSame(90, $arrivals['days']);
        $this->assertCount(7, $arrivals['cells']);
        foreach ($arrivals['cells'] as $row) {
            $this->assertCount(24, $row);
        }
        $this->assertSame(2, $arrivals['cells'][0][9]);
        $this->assertSame(2, $arrivals['peak']);
        $this->assertSame(2, $arrivals['total']);
    }

    public function test_the_lead_funnel_counts_what_happened_to_the_leads_that_arrived(): void
    {
        $this->lead('new');
        $this->lead('contacted', CarbonImmutable::now());
        $this->lead('won', CarbonImmutable::now());
        $this->lead('spam');
        // Arrived before the window: no part of it.
        $this->lead('won', CarbonImmutable::now(), CarbonImmutable::today()->subDays(120));

        $leads = $this->actingAs($this->staff(RoleEnum::SalesManager, RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->json('data.leads');

        $this->assertSame(['days' => 90, 'received' => 3, 'contacted' => 2, 'won' => 1], $leads['funnel']);
        $this->assertCount(30, $leads['series']);
        $this->assertSame(3, $leads['series'][29]);
    }

    public function test_a_role_without_the_pipeline_gets_no_lead_charts(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.leads', null);
    }
}
