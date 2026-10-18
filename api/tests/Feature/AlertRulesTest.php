<?php

namespace Tests\Feature;

use App\Enums\LeadStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Backup;
use App\Models\Customer;
use App\Models\HealthSnapshot;
use App\Models\Lead;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\Rules;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class AlertRulesTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function rule(string $key): AlertRule
    {
        return collect(Rules::all())->first(fn (AlertRule $r) => $r->key() === $key);
    }

    /** @return list<string> */
    private function hits(string $key): array
    {
        return $this->rule($key)->current()->map(fn ($h) => $h->subject)->all();
    }

    private function ticket(array $attrs): Ticket
    {
        $customer = Customer::query()->first();
        if ($customer === null) {
            $customer = new Customer;
            $customer->forceFill(['name' => 'C', 'email' => 'c@example.test', 'password' => 'x', 'status' => 'active', 'email_verified_at' => now()])->save();
        }
        $cat = TicketCategory::firstOrCreate(['slug' => 'general'], ['name' => 'General', 'sort_order' => 1]);
        $created = $attrs['created_at'] ?? null;
        unset($attrs['created_at']);
        $ticket = Ticket::create(array_merge([
            'customer_id' => $customer->id, 'ticket_category_id' => $cat->id, 'subject' => 'S', 'description' => 'D',
            'status' => TicketStatus::Open, 'priority' => TicketPriority::Normal,
        ], $attrs));
        if ($created !== null) {
            DB::table('tickets')->where('id', $ticket->id)->update(['created_at' => $created]);
        }

        return $ticket->fresh();
    }

    private function order(OrderStatus $status, ?int $paidDaysAgo): Order
    {
        return Order::create([
            'order_number' => Order::nextNumber(), 'status' => $status,
            'subtotal_paise' => 100, 'taxable_paise' => 85, 'gst_paise' => 15, 'total_paise' => 100,
            'customer_name' => 'N', 'customer_email' => 'n@example.test', 'placed_at' => now(),
            'paid_at' => $paidDaysAgo === null ? null : now()->subDays($paidDaysAgo),
        ]);
    }

    private function backup(string $status, ?string $finished = null): Backup
    {
        return Backup::create([
            'uuid' => (string) Str::uuid(), 'type' => 'full', 'trigger' => 'schedule', 'status' => $status,
            'folder' => 'f-'.Str::random(6), 'includes' => [], 'destinations' => [],
            'finished_at' => $finished ?? now(),
        ]);
    }

    public function test_the_list_has_eight_rules_with_distinct_keys(): void
    {
        $this->assertSame([
            'ticket_critical_unassigned', 'ticket_overdue', 'lead_hot_untouched', 'order_not_dispatched',
            'return_waiting', 'mail_stalled', 'backup_failed', 'health_drop',
        ], Rules::keys());
    }

    public function test_a_critical_ticket_unassigned_past_the_threshold(): void
    {
        $old = $this->ticket(['priority' => TicketPriority::Critical, 'created_at' => now()->subMinutes(31)]);
        $this->ticket(['priority' => TicketPriority::Critical, 'created_at' => now()->subMinutes(29)]);
        $this->ticket(['priority' => TicketPriority::High, 'created_at' => now()->subHour()]);

        $this->assertSame(['ticket:'.$old->id], $this->hits('ticket_critical_unassigned'));
        $hit = $this->rule('ticket_critical_unassigned')->current()->first();
        $this->assertStringContainsString($old->reference, $hit->line);
        $this->assertSame('/admin/tickets/'.$old->reference, $hit->href);
    }

    public function test_an_overdue_ticket_is_the_overdue_scope(): void
    {
        $late = $this->ticket(['due_at' => now()->subMinute()]);
        $this->ticket(['due_at' => now()->addHour()]);

        $this->assertSame(['ticket:'.$late->id], $this->hits('ticket_overdue'));
    }

    public function test_a_hot_lead_still_new_past_the_threshold(): void
    {
        $lead = Lead::create(['name' => 'A', 'email' => 'a@example.test', 'status' => LeadStatus::New, 'channel' => 'contact', 'score_band' => 'hot']);
        DB::table('leads')->where('id', $lead->id)->update(['created_at' => now()->subHours(3)]);
        Lead::create(['name' => 'B', 'email' => 'b@example.test', 'status' => LeadStatus::New, 'channel' => 'contact', 'score_band' => 'hot']);
        $warm = Lead::create(['name' => 'C', 'email' => 'c@example.test', 'status' => LeadStatus::New, 'channel' => 'contact', 'score_band' => 'warm']);
        DB::table('leads')->where('id', $warm->id)->update(['created_at' => now()->subHours(3)]);

        $this->assertSame(['lead:'.$lead->id], $this->hits('lead_hot_untouched'));
        $this->assertStringNotContainsString('a@example.test', $this->rule('lead_hot_untouched')->current()->first()->line);
    }

    public function test_a_paid_order_not_dispatched_that_ships(): void
    {
        $with = function (ProductType $type, int $days): Order {
            $order = $this->order(OrderStatus::Paid, $days);
            $order->items()->create([
                'name' => 'Thing', 'type' => $type, 'quantity' => 1, 'unit_price_paise' => 100, 'line_total_paise' => 100, 'returnable' => true,
            ]);

            return $order;
        };

        $late = $with(ProductType::Physical, 3);
        $with(ProductType::Physical, 1);
        $with(ProductType::Digital, 5);

        $this->assertSame(['order:'.$late->id], $this->hits('order_not_dispatched'));
        $this->assertSame('/admin/store/orders/'.$late->order_number, $this->rule('order_not_dispatched')->current()->first()->href);
    }

    public function test_an_undispatched_parcel_is_found_behind_many_digital_orders_and_a_completed_one_is_not(): void
    {
        $with = function (OrderStatus $status, ProductType $type, int $days): Order {
            $order = $this->order($status, $days);
            $order->items()->create([
                'name' => 'Thing', 'type' => $type, 'quantity' => 1, 'unit_price_paise' => 100, 'line_total_paise' => 100, 'returnable' => true,
            ]);

            return $order;
        };
        foreach (range(1, 55) as $i) {
            $with(OrderStatus::Paid, ProductType::Digital, 20);
        }
        $with(OrderStatus::Completed, ProductType::Physical, 10);
        $parcel = $with(OrderStatus::Paid, ProductType::Physical, 5);

        $this->assertSame(['order:'.$parcel->id], $this->hits('order_not_dispatched'));
    }

    public function test_a_return_waiting_past_the_threshold(): void
    {
        $order = $this->order(OrderStatus::Dispatched, 0);
        $old = OrderReturn::create(['order_id' => $order->id, 'reason' => 'faulty']);
        DB::table('order_returns')->where('id', $old->id)->update(['created_at' => now()->subDays(3)]);
        OrderReturn::create(['order_id' => $order->id, 'reason' => 'faulty']);

        $this->assertSame(['return:'.$old->id], $this->hits('return_waiting'));
    }

    public function test_mail_waiting_too_long(): void
    {
        config(['queue.default' => 'database']);
        $this->assertSame([], $this->hits('mail_stalled'));
        DB::table('jobs')->insert(['queue' => 'default', 'payload' => '{}', 'attempts' => 0, 'available_at' => time() - 11 * 60, 'created_at' => time() - 11 * 60]);
        $this->assertSame(['system'], $this->hits('mail_stalled'));
    }

    public function test_a_failed_backup_or_none_in_36_hours(): void
    {
        $this->assertSame([], $this->hits('backup_failed'), 'Backups switched off: no alert.');
        Setting::put('backup_enabled', '1');
        Setting::flushCache();
        $this->assertSame([], $this->hits('backup_failed'), 'Just switched on: no run has been due yet.');
        $this->travel(37)->hours();
        $this->assertSame(['stale'], $this->hits('backup_failed'), 'On and never completed.');

        $this->backup('completed');
        $this->assertSame([], $this->hits('backup_failed'));

        $bad = $this->backup('failed');
        $this->assertSame(['backup:'.$bad->id], $this->hits('backup_failed'));
    }

    public function test_a_weekly_schedule_is_stale_only_after_its_week(): void
    {
        foreach (['backup_enabled' => '1', 'backup_full_day' => 'sun', 'backup_incremental_every' => 'off'] as $key => $value) {
            $this->assertTrue(Setting::put($key, $value));
        }
        Setting::flushCache();
        $this->backup('completed', now()->subDays(5)->toDateTimeString());
        $this->assertSame([], $this->hits('backup_failed'), 'Five days after a weekly backup is on time.');

        $this->travel(4)->days();
        $this->assertSame(['stale'], $this->hits('backup_failed'), 'Nine days is a missed week.');
    }

    public function test_the_health_score_falls_by_the_threshold(): void
    {
        HealthSnapshot::create(['date' => now()->subDays(3)->toDateString(), 'score' => 92, 'records_checked' => 10, 'counts' => []]);
        $today = HealthSnapshot::create(['date' => now()->toDateString(), 'score' => 83, 'records_checked' => 10, 'counts' => []]);
        $this->assertSame([], $this->hits('health_drop'), 'Nine points is under ten.');

        $today->update(['score' => 82]);
        $this->assertSame(['system'], $this->hits('health_drop'));
    }

    public function test_an_administrator_holds_every_rule_and_a_role_only_its_own(): void
    {
        $this->assertCount(8, Rules::forUser($this->staff(RoleEnum::Admin)));
        $support = array_map(fn (AlertRule $r) => $r->key(), Rules::forUser($this->staff(RoleEnum::SupportEngineer)));
        $this->assertSame(['ticket_critical_unassigned', 'ticket_overdue'], $support);
        $this->assertSame([], Rules::forUser($this->staff(RoleEnum::ContentManager)));
    }
}
