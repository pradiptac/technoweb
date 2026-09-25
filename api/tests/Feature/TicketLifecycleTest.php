<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Support\TicketMetrics;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * When a ticket was resolved, and when it was closed.
 *
 * Two timestamps nothing on a screen shows directly, and everything the
 * dashboard says about throughput is computed from them: the resolved series
 * on the volume chart, the median resolution time, and the SLA figure. They
 * are worth a test precisely because a wrong one is invisible — the numbers
 * still render, they are simply about a smaller set of tickets than they claim.
 */
class TicketLifecycleTest extends TestCase
{
    use RefreshDatabase;

    // No factories in this project; fixtures are spelled out, as they are in
    // TicketNotificationTest.
    private function staff(): User
    {
        $user = User::create([
            'name' => 'Support Engineer',
            'email' => 'engineer@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        // The status route is behind role:support_engineer. Without this the
        // request 403s and the test passes for the wrong reason.
        $role = Role::firstOrCreate(
            ['slug' => RoleEnum::SupportEngineer->value],
            ['name' => RoleEnum::SupportEngineer->label()],
        );
        $user->roles()->attach($role);

        return $user->load('roles');
    }

    private function ticket(): Ticket
    {
        $customer = Customer::create([
            'name' => 'Neil Basu',
            'email' => 'neil@example.test',
            'password' => 'password-for-tests',
            'status' => CustomerStatus::Active,
        ]);

        $category = TicketCategory::create(['name' => 'Network', 'slug' => 'network', 'is_active' => true]);

        $ticket = $customer->tickets()->make([
            'subject' => 'A switch keeps rebooting',
            'description' => 'It drops every device on it twice a day, and it started after the firmware update.',
            'ticket_category_id' => $category->id,
            'status' => TicketStatus::Open,
            'priority' => 'normal',
        ]);
        $ticket->save();

        return $ticket->fresh();
    }

    private function move(User $staff, Ticket $ticket, TicketStatus $to): void
    {
        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['status' => $to->value])
            ->assertOk();
    }

    public function test_resolving_stamps_the_moment_it_was_resolved(): void
    {
        $staff = $this->staff();
        $ticket = $this->ticket();

        $this->move($staff, $ticket, TicketStatus::Resolved);

        $this->assertNotNull($ticket->fresh()->resolved_at);
    }

    /**
     * The one this exists for. `resolved → closed` is the ordinary path, and
     * the update used to null `resolved_at` on any move that was not *to*
     * Resolved — so the tickets that had genuinely been finished were the
     * exact set the resolution metrics could not see.
     */
    public function test_closing_a_resolved_ticket_keeps_when_it_was_resolved(): void
    {
        $staff = $this->staff();
        $ticket = $this->ticket();

        $this->move($staff, $ticket, TicketStatus::Resolved);
        $resolvedAt = $ticket->fresh()->resolved_at;

        $this->move($staff, $ticket, TicketStatus::Closed);

        $ticket = $ticket->fresh();
        $this->assertNotNull($ticket->resolved_at, 'closing a ticket erased when it was resolved');
        $this->assertSame($resolvedAt->toDateTimeString(), $ticket->resolved_at->toDateTimeString());
        $this->assertNotNull($ticket->closed_at);
    }

    public function test_reopening_clears_both_stamps(): void
    {
        $staff = $this->staff();
        $ticket = $this->ticket();

        $this->move($staff, $ticket, TicketStatus::Resolved);
        $this->move($staff, $ticket, TicketStatus::Closed);
        $this->move($staff, $ticket, TicketStatus::InProgress);

        $ticket = $ticket->fresh();
        $this->assertNull($ticket->resolved_at, 'a reopened ticket is not a resolved one');
        $this->assertNull($ticket->closed_at);
    }

    /**
     * A closure is not a resolution. A ticket closed straight from in-progress
     * was never resolved, and the metrics must not count it as though it were.
     */
    public function test_closing_without_resolving_leaves_no_resolution(): void
    {
        $staff = $this->staff();
        $ticket = $this->ticket();

        $this->move($staff, $ticket, TicketStatus::InProgress);
        $this->move($staff, $ticket, TicketStatus::Closed);

        $this->assertNull($ticket->fresh()->resolved_at);
        $this->assertNotNull($ticket->fresh()->closed_at);
    }

    /** The customer's own close has always left the resolution alone. */
    public function test_a_customer_closing_a_resolved_ticket_keeps_the_resolution(): void
    {
        $staff = $this->staff();
        $ticket = $this->ticket();
        $this->move($staff, $ticket, TicketStatus::Resolved);

        $this->actingAs($ticket->customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/close")
            ->assertOk();

        $ticket = $ticket->fresh();
        $this->assertNotNull($ticket->resolved_at);
        $this->assertNotNull($ticket->closed_at);
    }

    /** A closed ticket must reach the dashboard's resolved series. */
    public function test_a_closed_ticket_still_counts_as_resolved_on_the_dashboard(): void
    {
        $staff = $this->staff();
        $ticket = $this->ticket();

        $this->move($staff, $ticket, TicketStatus::Resolved);
        $this->move($staff, $ticket, TicketStatus::Closed);

        $this->assertSame(1, collect(TicketMetrics::dailyVolume())->sum('resolved'));
        $this->assertNotNull(TicketMetrics::resolutionHours());
    }

    /**
     * The volume chart's periods: every bucket present, the right count of
     * them, and a ticket from four months ago inside the half year and the
     * year but outside the month and the quarter.
     */
    public function test_the_volume_chart_buckets_each_period(): void
    {
        $recent = $this->ticket();
        // The fixture makes one customer per call; a second ticket is a copy.
        $old = $recent->replicate(['reference']);
        $old->reference = 'TW-2026-99999';
        $old->save();
        $old->forceFill(['created_at' => now()->subMonthsNoOverflow(4)])->saveQuietly();

        $expect = ['month' => [30, 'day', 1], 'quarter' => [13, 'week', 1], 'half' => [26, 'week', 2], 'year' => [12, 'month', 2]];

        foreach ($expect as $period => [$count, $bucket, $created]) {
            $series = TicketMetrics::volume($period);
            $this->assertSame($period, $series['period']);
            $this->assertSame($bucket, $series['bucket']);
            $this->assertCount($count, $series['points'], $period);
            $this->assertSame($created, collect($series['points'])->sum('created'), $period);
            $this->assertSame(now()->toDateString(), end($series['points'])['end'], $period);
        }

        // An unknown period is a month, not an error.
        $this->assertSame('month', TicketMetrics::volume('decade')['period']);

        $this->actingAs($this->staff(), 'sanctum')
            ->getJson('/api/v1/admin/dashboard?volume=year')
            ->assertOk()
            ->assertJsonPath('data.metrics.volume_series.period', 'year')
            ->assertJsonCount(12, 'data.metrics.volume_series.points');
    }
}
