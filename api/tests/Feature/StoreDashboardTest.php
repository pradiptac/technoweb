<?php

namespace Tests\Feature;

use App\Enums\DigitalCodeStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\DigitalCode;
use App\Models\Order;
use App\Models\Role;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The shop at a glance.
 *
 * What is worth testing about a dashboard is not that it renders — it is that
 * every figure means what its label says. The three that can silently lie are
 * pinned here: revenue counting an abandoned basket, an average of nothing
 * reported as zero, and a paid order waiting on a licence that appears in no
 * status column at all.
 */
class StoreDashboardTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'store-dash@example.test'],
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

    private function product(ProductType $type = ProductType::Physical, int $stock = 20): StoreProduct
    {
        return StoreProduct::create([
            'name' => 'A switch', 'slug' => 'switch-'.uniqid(),
            'type' => $type, 'status' => PublishStatus::Published,
            'price_paise' => 1180000, 'track_stock' => true, 'stock' => $stock,
        ]);
    }

    private function order(OrderStatus $status, int $total = 1180000, ?StoreProduct $product = null, int $quantity = 1): Order
    {
        $product ??= $this->product();

        $order = Order::create([
            'order_number' => Order::nextNumber(),
            'status' => $status,
            'subtotal_paise' => $total, 'taxable_paise' => (int) round($total * 10000 / 11800),
            'gst_paise' => $total - (int) round($total * 10000 / 11800), 'total_paise' => $total,
            'customer_name' => 'Neil Basu', 'customer_email' => 'neil@example.test',
            'placed_at' => now(),
            'paid_at' => $status->isPaid() ? now() : null,
        ]);

        $order->items()->create([
            'store_product_id' => $product->id,
            'name' => $product->name, 'type' => $product->type,
            'quantity' => $quantity, 'unit_price_paise' => $total, 'line_total_paise' => $total,
            'returnable' => true,
        ]);

        return $order->fresh('items');
    }

    private function read(): array
    {
        return $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/dashboard')
            ->assertOk()
            ->json('data');
    }

    // ------------------------------------------------------ the role

    public function test_it_is_not_reachable_by_a_content_manager(): void
    {
        $editor = User::firstOrCreate(
            ['email' => 'cm-dash@example.test'],
            ['name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true],
        );

        $editor->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        $this->actingAs($editor, 'sanctum')
            ->getJson('/api/v1/admin/store/dashboard')
            ->assertForbidden();
    }

    // ------------------------------------------------------ revenue

    /**
     * The figure that has to be reconcilable against a bank statement.
     *
     * An order sitting at `pending_payment` is a basket somebody walked away
     * from at the payment screen. Counting it is how a dashboard becomes a
     * screen people stop believing.
     */
    public function test_revenue_counts_paid_orders_and_not_abandoned_ones(): void
    {
        $this->order(OrderStatus::Paid, 1180000);
        $this->order(OrderStatus::Completed, 2360000);
        $this->order(OrderStatus::PendingPayment, 9999999);
        $this->order(OrderStatus::Cancelled, 8888888);

        $data = $this->read();

        $this->assertSame(3540000, $data['revenue']['total_paise']);
        $this->assertSame(2, $data['revenue']['sample']);
        $this->assertSame(4, $data['orders']['total']);
        $this->assertSame(1, $data['orders']['pending_payment']);
    }

    /**
     * Refunded money is reported beside revenue, never netted off silently.
     *
     * The gateway reports gross and refunds separately. A headline matching
     * neither is one somebody has to reverse engineer before they can use it.
     */
    public function test_a_refund_is_reported_separately_rather_than_subtracted(): void
    {
        $this->order(OrderStatus::Completed, 1180000);
        $this->order(OrderStatus::Refunded, 590000);

        $data = $this->read();

        $this->assertSame(1770000, $data['revenue']['total_paise']);
        $this->assertSame(590000, $data['revenue']['refunded_paise']);
    }

    /** An average of nothing is not zero rupees. */
    public function test_the_average_is_null_when_nothing_has_sold(): void
    {
        $data = $this->read();

        $this->assertNull($data['revenue']['average_paise']);
        $this->assertSame(0, $data['revenue']['sample']);
        $this->assertSame(0, $data['revenue']['total_paise']);
    }

    public function test_the_average_carries_the_sample_it_was_taken_from(): void
    {
        $this->order(OrderStatus::Paid, 1000000);
        $this->order(OrderStatus::Paid, 2000000);

        $data = $this->read();

        $this->assertSame(1500000, $data['revenue']['average_paise']);
        $this->assertSame(2, $data['revenue']['sample']);
    }

    // ------------------------------------------------------ attention

    /**
     * The figure the screen exists for.
     *
     * A paid order whose licence nobody has issued appears in no status column:
     * it reads as `paid`, exactly like an order with nothing outstanding. The
     * customer has paid and is waiting, and until this counted it nothing said
     * so anywhere in the console.
     */
    public function test_a_paid_order_short_of_codes_is_counted_as_waiting(): void
    {
        $product = $this->product(ProductType::Digital);
        $order = $this->order(OrderStatus::Paid, 118000, $product, 2);

        $this->assertSame(1, $this->read()['attention']['awaiting_codes']);

        // One of the two issued is still short.
        DigitalCode::create([
            'store_product_id' => $product->id,
            'code' => 'AAAA-BBBB-CCCC',
            'status' => DigitalCodeStatus::Delivered,
            'order_id' => $order->id,
            'order_item_id' => $order->items->first()->id,
        ]);

        $this->assertSame(1, $this->read()['attention']['awaiting_codes']);

        DigitalCode::create([
            'store_product_id' => $product->id,
            'code' => 'DDDD-EEEE-FFFF',
            'status' => DigitalCodeStatus::Delivered,
            'order_id' => $order->id,
            'order_item_id' => $order->items->first()->id,
        ]);

        $this->assertSame(0, $this->read()['attention']['awaiting_codes']);
    }

    /** An unpaid order is not waiting on us. Nobody should be issuing for it. */
    public function test_an_unpaid_order_is_never_counted_as_waiting_for_codes(): void
    {
        $product = $this->product(ProductType::Digital);
        $this->order(OrderStatus::PendingPayment, 118000, $product, 1);

        $this->assertSame(0, $this->read()['attention']['awaiting_codes']);
    }

    public function test_only_a_shippable_order_is_counted_as_awaiting_dispatch(): void
    {
        // A digital order has no shipping address, so there is nothing to pack.
        $this->order(OrderStatus::Paid, 118000, $this->product(ProductType::Digital));

        $this->assertSame(0, $this->read()['attention']['awaiting_dispatch']);

        $order = $this->order(OrderStatus::Paid);
        $order->update(['shipping_address' => ['line1' => '1 Road', 'city' => 'Kolkata', 'pin' => '700001']]);

        $this->assertSame(1, $this->read()['attention']['awaiting_dispatch']);
    }

    /**
     * A published listing with a dead Buy button.
     *
     * Worse than a listing that is not there: somebody arrives from a search,
     * finds the thing they wanted, and leaves.
     */
    public function test_a_published_product_with_no_stock_is_counted_as_out_of_stock(): void
    {
        $this->product(ProductType::Physical, stock: 0);
        $this->product(ProductType::Physical, stock: 9);

        $this->assertSame(1, $this->read()['attention']['out_of_stock']);
    }

    /**
     * A product with variations answers for the set.
     *
     * Its own counter is not consulted — `inStock()` says so — so a plain
     * `stock <= 0` reports the 48-port as unavailable because the 24-port ran
     * out. The figure and the list it links to have to agree about this, which
     * is why both go through one scope.
     */
    public function test_a_product_is_in_stock_while_any_variation_is(): void
    {
        $product = $this->product(ProductType::Physical, stock: 0);

        $product->variations()->create([
            'name' => '24-port', 'price_paise' => 1180000, 'stock' => 0, 'is_active' => true,
        ]);
        $product->variations()->create([
            'name' => '48-port', 'price_paise' => 2360000, 'stock' => 4, 'is_active' => true,
        ]);

        $this->assertSame(0, $this->read()['attention']['out_of_stock']);

        $product->variations()->update(['stock' => 0]);

        $this->assertSame(1, $this->read()['attention']['out_of_stock']);
    }

    /** The tile links to this list, so the two must return the same records. */
    public function test_the_out_of_stock_figure_matches_the_list_it_links_to(): void
    {
        $withVariations = $this->product(ProductType::Physical, stock: 0);
        $withVariations->variations()->create([
            'name' => '48-port', 'price_paise' => 2360000, 'stock' => 4, 'is_active' => true,
        ]);
        $this->product(ProductType::Physical, stock: 0);

        $counted = $this->read()['attention']['out_of_stock'];

        $listed = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/products?out_of_stock=1')
            ->assertOk()
            ->json('data');

        $this->assertSame(1, $counted);
        $this->assertCount($counted, $listed);
    }

    /**
     * A digital product with no codes is out of stock, silently.
     *
     * Nothing about the listing says so, so it takes the money and puts the
     * order into the queue of people waiting for something we cannot issue.
     */
    public function test_a_digital_product_with_no_codes_left_is_counted(): void
    {
        $product = $this->product(ProductType::Digital);

        $this->assertSame(1, $this->read()['attention']['codes_exhausted']);

        DigitalCode::create([
            'store_product_id' => $product->id,
            'code' => 'ONE-LEFT',
            'status' => DigitalCodeStatus::Available,
        ]);

        $this->assertSame(0, $this->read()['attention']['codes_exhausted']);
    }

    // ------------------------------------------------------ the lists

    public function test_it_names_the_products_running_out(): void
    {
        $this->product(ProductType::Physical, stock: 2);
        $this->product(ProductType::Physical, stock: 40);

        $low = $this->read()['low_stock'];

        $this->assertCount(1, $low);
        $this->assertSame(2, $low[0]['stock']);
    }

    /**
     * The one figure that predicts a problem instead of reporting one.
     *
     * Running out of codes is invisible everywhere else until somebody has
     * already paid and is waiting, which is the worst moment to discover it.
     */
    public function test_it_names_digital_products_running_low_on_codes(): void
    {
        $product = $this->product(ProductType::Digital);

        foreach (range(1, 3) as $i) {
            DigitalCode::create([
                'store_product_id' => $product->id,
                'code' => 'CODE-'.$i,
                'status' => DigitalCodeStatus::Available,
            ]);
        }

        $low = $this->read()['codes_low'];

        $this->assertCount(1, $low);
        $this->assertSame(3, $low[0]['available']);
        $this->assertSame($product->id, $low[0]['id']);
    }

    /** A code already sold is not stock. */
    public function test_a_delivered_code_does_not_count_as_available(): void
    {
        $product = $this->product(ProductType::Digital);

        DigitalCode::create([
            'store_product_id' => $product->id,
            'code' => 'SOLD-ONE',
            'status' => DigitalCodeStatus::Delivered,
        ]);

        $this->assertSame(0, $this->read()['codes_low'][0]['available']);
    }

    // ------------------------------------------------------ the series

    /**
     * A chart drawn only from days that had an order puts a busy Tuesday beside
     * a busy Friday as though they were consecutive.
     */
    public function test_the_daily_series_is_zero_filled_and_covers_the_window(): void
    {
        $this->order(OrderStatus::Paid, 1180000);

        $data = $this->read();

        $this->assertCount(30, $data['series']);
        $this->assertSame(today()->toDateString(), end($data['series'])['day']);
        $this->assertSame(1180000, end($data['series'])['revenue_paise']);

        // Yesterday had nothing, and says so rather than being absent.
        $this->assertSame(0, $data['series'][28]['revenue_paise']);
        $this->assertSame(today()->subDay()->toDateString(), $data['series'][28]['day']);
    }

    /** An unrecognised window falls back rather than 422ing. It arrives from a bookmark. */
    public function test_an_unknown_window_falls_back_to_thirty_days(): void
    {
        $data = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/dashboard?days=4000')
            ->assertOk()
            ->json('data');

        $this->assertSame(30, $data['days']);
        $this->assertCount(30, $data['series']);
    }

    public function test_a_shorter_window_is_honoured(): void
    {
        $data = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/dashboard?days=7')
            ->assertOk()
            ->json('data');

        $this->assertSame(7, $data['days']);
        $this->assertCount(7, $data['series']);
    }

    /**
     * An order holding both a switch and a licence is in both counts.
     *
     * Deliberate, and the reason the screen labels them "involving" rather than
     * presenting them as a split of the total.
     */
    public function test_the_type_counts_overlap_rather_than_partitioning(): void
    {
        $order = $this->order(OrderStatus::Paid, 118000, $this->product(ProductType::Physical));

        $digital = $this->product(ProductType::Digital);
        $order->items()->create([
            'store_product_id' => $digital->id,
            'name' => $digital->name, 'type' => ProductType::Digital,
            'quantity' => 1, 'unit_price_paise' => 118000, 'line_total_paise' => 118000,
            'returnable' => false,
        ]);

        $data = $this->read();

        $this->assertSame(1, $data['orders']['total']);
        $this->assertSame(1, $data['orders']['with_physical']);
        $this->assertSame(1, $data['orders']['with_digital']);
    }
}
