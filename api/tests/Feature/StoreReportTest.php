<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\Role;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * What sold, between two dates.
 *
 * A report is read to reconcile against a bank statement and to file a return,
 * so the rules worth pinning are the ones where a plausible-looking number
 * would be wrong: the range covering something other than what was asked for,
 * GST recomputed rather than read, a deleted product quietly dropping revenue
 * out of the total, and a CSV that Excel executes.
 */
class StoreReportTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'store-report@example.test'],
            ['name' => 'Store Manager', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::StoreManager->value],
                ['name' => RoleEnum::StoreManager->label()],
            ));
        }

        return $user;
    }

    private function product(string $name = 'A switch'): StoreProduct
    {
        return StoreProduct::create([
            'name' => $name, 'slug' => 'p-'.uniqid(), 'sku' => 'SKU-'.uniqid(),
            'type' => ProductType::Physical, 'status' => PublishStatus::Published,
            'price_paise' => 1180000, 'track_stock' => true, 'stock' => 50,
        ]);
    }

    private function order(
        string $placedAt,
        int $total = 1180000,
        OrderStatus $status = OrderStatus::Completed,
        ?StoreProduct $product = null,
        int $quantity = 1,
    ): Order {
        $product ??= $this->product();
        $taxable = Money::taxable($total);

        $order = Order::create([
            'order_number' => Order::nextNumber(),
            'status' => $status,
            'subtotal_paise' => $total, 'taxable_paise' => $taxable,
            'gst_paise' => $total - $taxable, 'total_paise' => $total,
            'customer_name' => 'Neil Basu', 'customer_email' => 'neil@example.test',
            'placed_at' => $placedAt, 'paid_at' => $status->isPaid() ? $placedAt : null,
        ]);

        $order->items()->create([
            'store_product_id' => $product->id,
            'name' => $product->name, 'sku' => $product->sku, 'type' => $product->type,
            'quantity' => $quantity, 'unit_price_paise' => intdiv($total, $quantity),
            'line_total_paise' => $total, 'returnable' => true,
        ]);

        return $order;
    }

    private function read(string $query = ''): array
    {
        return $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/reports'.$query)
            ->assertOk()
            ->json('data');
    }

    // ------------------------------------------------------ the role

    public function test_it_is_not_reachable_by_a_content_manager(): void
    {
        $editor = User::firstOrCreate(
            ['email' => 'cm-report@example.test'],
            ['name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true],
        );

        $editor->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        $this->actingAs($editor, 'sanctum')
            ->getJson('/api/v1/admin/store/reports')
            ->assertForbidden();
    }

    // ------------------------------------------------------ the range

    /**
     * The range is the whole contract.
     *
     * A report that quietly covered something other than what was asked for is
     * worse than one that refuses, because the figure gets written down.
     */
    public function test_it_covers_exactly_the_range_it_was_given(): void
    {
        $this->order('2026-07-31 23:00:00');   // the evening before
        $this->order('2026-08-01 00:30:00');   // the first minute
        $this->order('2026-08-15 12:00:00');
        $this->order('2026-08-31 23:30:00');   // the last minute
        $this->order('2026-09-01 00:10:00');   // the morning after

        $data = $this->read('?from=2026-08-01&to=2026-08-31');

        $this->assertSame('2026-08-01', $data['from']);
        $this->assertSame('2026-08-31', $data['to']);
        $this->assertSame(31, $data['days']);
        $this->assertSame(3, $data['totals']['orders']);
    }

    /** Swapping two dates in a form is a slip, not a question. */
    public function test_a_backwards_range_is_corrected_rather_than_refused(): void
    {
        $data = $this->read('?from=2026-08-31&to=2026-08-01');

        $this->assertSame('2026-08-01', $data['from']);
        $this->assertSame('2026-08-31', $data['to']);
    }

    /** A range nobody meant to ask for, which would scan the whole table. */
    public function test_an_over_long_range_is_refused_by_name(): void
    {
        $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/reports?from=2020-01-01&to=2026-08-31')
            ->assertStatus(422)
            ->assertJsonValidationErrors('from');
    }

    public function test_it_answers_the_last_thirty_days_with_no_parameters(): void
    {
        $data = $this->read();

        $this->assertSame(30, $data['days']);
        $this->assertSame(today()->toDateString(), $data['to']);
    }

    // ------------------------------------------------------ the figures

    /**
     * GST is read from the order, never recomputed.
     *
     * It is extracted at checkout so that the two halves add back to what was
     * charged. Recomputing here would agree most of the time and, on the
     * roundings where it did not, file a return that disagrees with the money
     * taken.
     */
    public function test_the_halves_add_back_up_to_what_was_charged(): void
    {
        $this->order('2026-08-10 10:00:00', 1180010);
        $this->order('2026-08-11 10:00:00', 999999);

        $t = $this->read('?from=2026-08-01&to=2026-08-31')['totals'];

        $this->assertSame($t['total_paise'], $t['taxable_paise'] + $t['gst_paise']);
        $this->assertSame(1180010 + 999999, $t['total_paise']);
    }

    public function test_revenue_ignores_an_abandoned_basket(): void
    {
        $this->order('2026-08-10 10:00:00', 1180000);
        $this->order('2026-08-11 10:00:00', 9999999, OrderStatus::PendingPayment);

        $data = $this->read('?from=2026-08-01&to=2026-08-31');

        $this->assertSame(1180000, $data['totals']['total_paise']);
        $this->assertSame(1, $data['totals']['orders']);

        // ...but it is still part of what happened to the orders.
        $statuses = collect($data['statuses'])->keyBy('status');
        $this->assertSame(1, $statuses['pending_payment']['orders']);
        $this->assertSame(1, $statuses['completed']['orders']);
    }

    public function test_the_average_is_null_when_nothing_sold_in_the_range(): void
    {
        $t = $this->read('?from=2026-01-01&to=2026-01-31')['totals'];

        $this->assertNull($t['average_paise']);
        $this->assertSame(0, $t['orders']);
    }

    // ------------------------------------------------------ the series

    /** A table that skips quiet days reads as though they never happened. */
    public function test_the_series_keeps_the_days_that_sold_nothing(): void
    {
        $this->order('2026-08-03 10:00:00', 1180000);

        $series = $this->read('?from=2026-08-01&to=2026-08-05')['series'];

        $this->assertCount(5, $series);
        $this->assertSame('2026-08-01', $series[0]['period']);
        $this->assertSame(0, $series[0]['revenue_paise']);
        $this->assertSame(1180000, $series[2]['revenue_paise']);
    }

    public function test_it_groups_by_month(): void
    {
        $this->order('2026-07-05 10:00:00', 1180000);
        $this->order('2026-07-20 10:00:00', 1180000);
        $this->order('2026-08-05 10:00:00', 2360000);

        $series = $this->read('?from=2026-07-01&to=2026-08-31&group=month')['series'];

        $this->assertCount(2, $series);
        $this->assertSame('2026-07', $series[0]['period']);
        $this->assertSame(2360000, $series[0]['revenue_paise']);
        $this->assertSame(2360000, $series[1]['revenue_paise']);
    }

    /**
     * ISO week with the ISO week-year, not the calendar year.
     *
     * 31 December 2024 is in week 1 of 2025, so pairing a week number with a
     * plain year files it under 2024 and puts two "week 1" rows in one table.
     */
    public function test_a_week_at_a_year_boundary_is_one_row(): void
    {
        $this->order('2024-12-30 10:00:00', 1180000);
        $this->order('2025-01-02 10:00:00', 1180000);

        $series = collect($this->read('?from=2024-12-30&to=2025-01-05&group=week')['series'])
            ->filter(fn ($r) => $r['orders'] > 0);

        $this->assertCount(1, $series, 'One calendar week must be one row.');
        $this->assertSame(2360000, $series->first()['revenue_paise']);
    }

    /** An unknown grouping falls back rather than 422ing — it arrives from a link. */
    public function test_an_unknown_grouping_falls_back_to_days(): void
    {
        $this->assertSame('day', $this->read('?group=fortnight')['group']);
    }

    // ------------------------------------------------------ products

    public function test_it_ranks_products_by_revenue(): void
    {
        $cheap = $this->product('Cheap thing');
        $dear = $this->product('Dear thing');

        $this->order('2026-08-02 10:00:00', 100000, OrderStatus::Completed, $cheap, 2);
        $this->order('2026-08-03 10:00:00', 900000, OrderStatus::Completed, $dear, 1);

        $products = $this->read('?from=2026-08-01&to=2026-08-31')['products'];

        $this->assertSame('Dear thing', $products[0]['name']);
        $this->assertSame(900000, $products[0]['revenue_paise']);
        $this->assertSame('Cheap thing', $products[1]['name']);
        $this->assertSame(2, $products[1]['units']);
    }

    /**
     * A deleted product still sold what it sold.
     *
     * An order item is a snapshot precisely so what an invoice says cannot
     * change afterwards. Dropping deleted products would leave the product
     * table quietly failing to add up to the revenue figure above it.
     */
    public function test_a_deleted_product_still_appears_and_still_totals(): void
    {
        $product = $this->product('Discontinued thing');
        $this->order('2026-08-02 10:00:00', 500000, OrderStatus::Completed, $product);

        $product->delete();

        $data = $this->read('?from=2026-08-01&to=2026-08-31');

        $this->assertSame('Discontinued thing', $data['products'][0]['name']);
        $this->assertSame(
            $data['totals']['total_paise'],
            collect($data['products'])->sum('revenue_paise'),
            'The product breakdown must add up to the revenue above it.',
        );
    }

    // ------------------------------------------------------ the export

    /**
     * Excel executes a cell beginning `=`, and an export is a file somebody
     * opens in Excel.
     */
    public function test_the_csv_escapes_a_formula(): void
    {
        $product = $this->product('=HYPERLINK("http://attacker.test")');
        $this->order('2026-08-02 10:00:00', 100000, OrderStatus::Completed, $product);

        $csv = $this->actingAs($this->manager(), 'sanctum')
            ->get('/api/v1/admin/store/reports/export?type=products&from=2026-08-01&to=2026-08-31')
            ->assertOk()
            ->streamedContent();

        $this->assertStringNotContainsString(',=HYPERLINK', $csv);
        $this->assertStringContainsString('HYPERLINK', $csv);
    }

    /**
     * Money in the file is a number, not a currency string.
     *
     * `₹1,18,000` is text to Excel — it cannot be summed, which is the one
     * thing anybody opens this file to do.
     */
    public function test_the_csv_writes_money_a_spreadsheet_can_add_up(): void
    {
        $this->order('2026-08-02 10:00:00', 1180050);

        $csv = $this->actingAs($this->manager(), 'sanctum')
            ->get('/api/v1/admin/store/reports/export?from=2026-08-01&to=2026-08-31')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('11800.50', $csv);
        $this->assertStringNotContainsString('₹', $csv);
        $this->assertStringContainsString('Total (INR)', $csv);
    }

    /** The export covers what the screen that offered it covered. */
    public function test_the_export_holds_the_orders_in_the_range_and_no_others(): void
    {
        $inside = $this->order('2026-08-02 10:00:00');
        $outside = $this->order('2026-09-02 10:00:00');

        $csv = $this->actingAs($this->manager(), 'sanctum')
            ->get('/api/v1/admin/store/reports/export?from=2026-08-01&to=2026-08-31')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString($inside->order_number, $csv);
        $this->assertStringNotContainsString($outside->order_number, $csv);
    }
}
