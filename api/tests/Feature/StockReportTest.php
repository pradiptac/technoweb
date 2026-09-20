<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\StockMovementReason;
use App\Models\Order;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Store\Payments\PaymentOutcome;
use App\Support\Store\Payments\Settlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Stock in and out.
 *
 * The half of this that did not exist is **in**: nothing recorded a level
 * changing, so a product going from 4 to 40 was indistinguishable from one
 * that was always 40, and no amount of querying could have answered "what
 * arrived this month". These tests are mostly about that half.
 */
class StockReportTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'store-manager@example.test'],
            ['name' => 'Sam Manager', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::StoreManager->value],
                ['name' => RoleEnum::StoreManager->label()],
            ));
        }

        return $user;
    }

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A switch',
            'slug' => 'a-switch-'.uniqid(),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
            'track_stock' => true,
            'stock' => 10,
        ], $attributes));
    }

    // --------------------------------------------------------------- in

    public function test_creating_a_product_records_its_opening_stock(): void
    {
        $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', [
                'name' => 'A new switch',
                'type' => ProductType::Physical->value,
                'status' => PublishStatus::Published->value,
                'price_paise' => 1180000,
                'track_stock' => true,
                'stock' => 25,
            ])
            ->assertCreated();

        $movement = StockMovement::sole();

        $this->assertSame(25, $movement->delta);
        $this->assertSame(25, $movement->balance_after);
        $this->assertSame(StockMovementReason::Initial, $movement->reason);
        $this->assertSame('Sam Manager', $movement->actor_name);
    }

    /**
     * The form posts a level, so the ledger has to work out the change.
     *
     * "40" in the box means "there are forty", and only the row it replaced
     * knows whether that is thirty arriving or nothing at all.
     */
    public function test_raising_the_stock_records_what_arrived(): void
    {
        $product = $this->product(['stock' => 10]);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", ['stock' => 40])
            ->assertOk();

        $movement = StockMovement::sole();

        $this->assertSame(30, $movement->delta);
        $this->assertSame(40, $movement->balance_after);
        $this->assertSame(StockMovementReason::Adjustment, $movement->reason);
        $this->assertStringContainsString('from 10 to 40', (string) $movement->note);
    }

    public function test_lowering_the_stock_records_what_left(): void
    {
        $product = $this->product(['stock' => 10]);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", ['stock' => 4])
            ->assertOk();

        $this->assertSame(-6, StockMovement::sole()->delta);
    }

    /**
     * A save that did not touch the stock field writes nothing.
     *
     * Otherwise every edit to a description fills the ledger with rows saying
     * nothing happened, which is the fastest way to make a report nobody reads.
     */
    public function test_a_save_that_does_not_change_the_stock_records_nothing(): void
    {
        $product = $this->product(['stock' => 10]);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", [
                'name' => 'A switch, renamed',
                'stock' => 10,
            ])
            ->assertOk();

        $this->assertSame(0, StockMovement::count());
    }

    /**
     * An untracked product has a `stock` column nobody reads.
     *
     * A service does not run out because nobody counted it, so a number moving
     * in a column that decides nothing is not a stock movement.
     */
    public function test_an_untracked_product_records_nothing(): void
    {
        $product = $this->product(['track_stock' => false, 'stock' => 0]);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", ['stock' => 99])
            ->assertOk();

        $this->assertSame(0, StockMovement::count());
    }

    /**
     * A product with variations is counted per variation, and only there.
     *
     * Its own `stock` column still exists and nothing reads it — `inStock()`
     * answers from the set, which is why a 48-port switch is not called
     * unavailable when the 24-port runs out. So a movement recorded against
     * the parent would put stock into the report that the shop cannot sell.
     *
     * This is not a corner case here: every real product in this catalogue has
     * variations, and the first browser run of the report recorded nothing for
     * exactly this reason and looked like a broken feature.
     */
    public function test_a_variation_records_its_own_movement_and_the_parent_records_none(): void
    {
        $product = $this->product(['stock' => 4]);
        $a = $product->variations()->create(['name' => '24-port', 'stock' => 5, 'sort_order' => 0]);
        $b = $product->variations()->create(['name' => '48-port', 'stock' => 2, 'sort_order' => 1]);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", [
                // The parent's own level moves too, and must be ignored.
                'stock' => 99,
                'variations' => [
                    ['id' => $a->id, 'name' => '24-port', 'stock' => 12],
                    ['id' => $b->id, 'name' => '48-port', 'stock' => 2],
                ],
            ])
            ->assertOk();

        $movement = StockMovement::sole();

        $this->assertSame($a->id, $movement->store_product_variation_id);
        $this->assertSame('24-port', $movement->variation_name);
        $this->assertSame(7, $movement->delta);
        $this->assertSame(12, $movement->balance_after);
    }

    /** A variation that did not exist before opens at whatever it arrived with. */
    public function test_a_new_variation_opens_rather_than_adjusts(): void
    {
        $product = $this->product(['stock' => 0]);
        $existing = $product->variations()->create(['name' => '24-port', 'stock' => 5, 'sort_order' => 0]);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", [
                'variations' => [
                    ['id' => $existing->id, 'name' => '24-port', 'stock' => 5],
                    ['name' => '48-port', 'stock' => 3],
                ],
            ])
            ->assertOk();

        $movement = StockMovement::sole();

        $this->assertSame('48-port', $movement->variation_name);
        $this->assertSame(3, $movement->delta);
        $this->assertSame(StockMovementReason::Initial, $movement->reason);
    }

    // -------------------------------------------------------------- out

    public function test_paying_an_order_records_the_stock_it_took(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 10]);
        $order = $this->paidOrder($product, 3);

        $movement = StockMovement::where('reason', StockMovementReason::Sale->value)->sole();

        $this->assertSame(-3, $movement->delta);
        // Re-read from the database rather than computed, so it is what the
        // decrement actually left behind.
        $this->assertSame(7, $movement->balance_after);
        $this->assertSame($order->order_number, $movement->order_number);
        $this->assertNull($movement->actor_name, 'A sale has no person behind it.');
    }

    /**
     * A decrement that did not happen is not a movement.
     *
     * `takeStock` already tells "not tracked" from "not enough" by the affected
     * row count. A ledger row written on having *tried* is a lie about the
     * shelf, and the report is read to decide what to order.
     */
    public function test_a_sale_that_could_not_take_stock_records_nothing(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 1]);
        $this->paidOrder($product, 5);

        $this->assertSame(
            0,
            StockMovement::where('reason', StockMovementReason::Sale->value)->count(),
            'Stock was short, so nothing came off the shelf and nothing should be recorded.',
        );
    }

    // ----------------------------------------------------------- report

    public function test_the_report_separates_what_came_in_from_what_went_out(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 10]);          // no movement: created directly
        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", ['stock' => 30]);   // +20
        $this->paidOrder($product, 4);                                                      // -4

        $body = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/stock')
            ->assertOk()
            ->json();

        $this->assertSame(20, $body['data']['totals']['stock_in']);
        $this->assertSame(4, $body['data']['totals']['stock_out']);
        $this->assertSame(16, $body['data']['totals']['net']);

        $row = $body['data']['products'][0];
        $this->assertSame($product->id, $row['id']);
        $this->assertSame(20, $row['stock_in']);
        $this->assertSame(4, $row['stock_out']);
        $this->assertSame(26, $row['stock_now'], 'The level today, which is a fact, not a reconstruction.');
    }

    /**
     * "In stock now" is what the shop can actually sell.
     *
     * A product with variations keeps its own `stock` column and nothing reads
     * it, so reporting that column is reporting a number left behind. The
     * first browser run of this report said "4 in stock" for a product whose
     * only variation held eleven — 4 being the parent's dead column.
     */
    public function test_stock_now_counts_the_variations_when_there_are_any(): void
    {
        $product = $this->product(['stock' => 4]);
        $a = $product->variations()->create(['name' => '24-port', 'stock' => 5, 'sort_order' => 0]);
        $product->variations()->create(['name' => 'discontinued', 'stock' => 99, 'is_active' => false, 'sort_order' => 1]);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", [
                'variations' => [['id' => $a->id, 'name' => '24-port', 'stock' => 11]],
            ])
            ->assertOk();

        $row = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/stock')
            ->assertOk()
            ->json('data.products.0');

        // 11 from the one active variation. Not 4 (the parent's dead column)
        // and not 110 (which would count one that cannot be bought).
        $this->assertSame(11, $row['stock_now']);
    }

    /** The range is echoed back, so a figure is never quoted against dates nobody chose. */
    public function test_the_report_echoes_the_range_and_corrects_a_backwards_one(): void
    {
        $body = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/stock?from=2026-08-31&to=2026-08-01')
            ->assertOk()
            ->json('data');

        $this->assertSame('2026-08-01', $body['from']);
        $this->assertSame('2026-08-31', $body['to']);
    }

    public function test_an_over_long_range_is_refused_by_name(): void
    {
        $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/stock?from=2020-01-01&to=2026-01-01')
            ->assertStatus(422)
            ->assertJsonValidationErrors('from');
    }

    /**
     * Every reason is reported, including the ones with nothing against them.
     *
     * A row reading zero says the question was asked; an absent row reads as
     * the report having forgotten to ask it.
     */
    public function test_every_reason_is_reported_even_at_zero(): void
    {
        $body = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/stock')
            ->assertOk()
            ->json('data.by_reason');

        $this->assertCount(count(StockMovementReason::cases()), $body);
    }

    public function test_the_movements_carry_a_direction_and_the_reasons_come_from_the_api(): void
    {
        $product = $this->product(['stock' => 10]);
        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", ['stock' => 12]);

        $row = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/stock/movements')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('in', $row['direction']);
        $this->assertSame(2, $row['quantity']);
        $this->assertSame(2, $row['delta']);

        $this->assertNotEmpty(
            $this->actingAs($this->manager(), 'sanctum')
                ->getJson('/api/v1/admin/store/stock')->json('meta.reasons'),
        );
    }

    /**
     * Excel executes a cell beginning with a minus sign.
     *
     * Every outgoing change in this file is negative, which makes it the one
     * export in the product where the escaping rule is load-bearing rather
     * than defensive.
     */
    public function test_the_export_escapes_the_negative_change_column(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 10]);
        $this->paidOrder($product, 2);

        $response = $this->actingAs($this->manager(), 'sanctum')
            ->get('/api/v1/admin/store/stock/export')
            ->assertOk();

        $csv = $response->streamedContent();

        $this->assertStringContainsString('Balance after', $csv);
        // A leading apostrophe is Excel's own escape and is not displayed.
        // `Csv::escape` prefixes any cell starting `=`, `+`, `-`, `@`, tab or
        // carriage return; without it `-2` is a formula.
        $this->assertStringContainsString("'-2", $csv, 'A leading minus must be escaped, or Excel reads it as a formula.');
    }

    // -------------------------------------------------- one rule, two sums

    /**
     * "How many are on the shelf" has one definition, and three screens read it.
     *
     * The products list, the edit form and this report all quote a stock
     * figure. Before `stockOnHand()` the first two read the product's raw
     * `stock` column, which is a leftover for a product with variations — so a
     * product holding four 24-ports and two 48-ports read as **4** on the list
     * and **6** on the report, one click apart. Reported as "the total stock
     * value showing is wrong", and the wrong one was the older one.
     *
     * The same argument as `OrderStatus::isPaid()` against `Order::scopePaid()`:
     * restating a rule is how two screens end up disagreeing by one.
     */
    public function test_stock_on_hand_counts_what_can_actually_be_bought(): void
    {
        $plain = $this->product(['stock' => 7]);
        $this->assertSame(7, $plain->stockOnHand(), 'No variations: its own column.');

        $varied = $this->product(['stock' => 4]);
        $varied->variations()->create(['name' => '24-port', 'stock' => 4, 'sort_order' => 0]);
        $varied->variations()->create(['name' => '48-port', 'stock' => 2, 'sort_order' => 1]);
        $this->assertSame(6, $varied->fresh()->stockOnHand(), 'Variations: their sum, not the leftover 4.');

        $varied->variations()->create(['name' => 'discontinued', 'stock' => 99, 'is_active' => false, 'sort_order' => 2]);
        $this->assertSame(6, $varied->fresh()->stockOnHand(), 'An inactive row cannot be bought.');

        $untracked = $this->product(['track_stock' => false, 'stock' => 0]);
        $this->assertNull(
            $untracked->stockOnHand(),
            '"Nobody is counting" and "there are none" are opposite answers.',
        );
    }

    /**
     * The report's bulk query and the model's rule must agree.
     *
     * They are two implementations of one sentence — the model answers per
     * record and the report answers for a whole page in two queries, because
     * a hundred products would otherwise be a hundred round trips. Two
     * implementations is exactly where drift lives, so this compares them
     * rather than trusting that they were written on the same afternoon.
     */
    public function test_the_reports_bulk_levels_agree_with_the_model(): void
    {
        $plain = $this->product(['stock' => 7]);

        $varied = $this->product(['stock' => 4]);
        $varied->variations()->create(['name' => '24-port', 'stock' => 4, 'sort_order' => 0]);
        $varied->variations()->create(['name' => 'off', 'stock' => 99, 'is_active' => false, 'sort_order' => 1]);

        $allOff = $this->product(['stock' => 50]);
        $allOff->variations()->create(['name' => 'gone', 'stock' => 3, 'is_active' => false, 'sort_order' => 0]);

        // Each product needs a movement to appear in the report at all.
        foreach ([$plain, $varied, $allOff] as $product) {
            $this->actingAs($this->manager(), 'sanctum')
                ->patchJson("/api/v1/admin/store/products/{$product->id}", ['name' => $product->name.' x']);
            StockMovement::create([
                'store_product_id' => $product->id,
                'product_name' => $product->name,
                'delta' => 1,
                'reason' => StockMovementReason::Adjustment->value,
                'created_at' => now(),
            ]);
        }

        $rows = collect($this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/stock')
            ->assertOk()
            ->json('data.products'))
            ->keyBy('id');

        foreach ([$plain, $varied, $allOff] as $product) {
            $this->assertSame(
                $product->fresh()->load('variations')->stockOnHand(),
                $rows[$product->id]['stock_now'],
                "The report and the model disagree about {$product->name}.",
            );
        }
    }

    // ------------------------------------------------------------- role

    public function test_the_stock_report_is_not_reachable_by_a_content_manager(): void
    {
        $user = User::create([
            'name' => 'Cass Content', 'email' => 'content@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/admin/store/stock')
            ->assertForbidden();
    }

    // ----------------------------------------------------------- helper

    /** An order that has been paid for, so `Settlement` has taken the stock. */
    private function paidOrder(StoreProduct $product, int $quantity): Order
    {
        $order = Order::create([
            'order_number' => 'ORD-TEST-'.str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'status' => OrderStatus::PendingPayment,
            'payment_method' => PaymentMethod::Gateway,
            'subtotal_paise' => $product->price_paise * $quantity,
            'discount_paise' => 0,
            'taxable_paise' => 0,
            'gst_paise' => 0,
            'total_paise' => $product->price_paise * $quantity,
            'customer_name' => 'Ada Lovelace',
            'customer_email' => 'ada@example.test',
            'customer_phone' => '9831100758',
            'billing_address' => ['line1' => '12 Engine Road', 'city' => 'Kolkata', 'pin' => '700001'],
            'placed_at' => now(),
        ]);

        $order->items()->create([
            'store_product_id' => $product->id,
            'name' => $product->name,
            'sku' => $product->sku,
            'type' => ProductType::Physical,
            'quantity' => $quantity,
            'unit_price_paise' => $product->price_paise,
            'line_total_paise' => $product->price_paise * $quantity,
            'returnable' => true,
        ]);

        Settlement::record($order, new PaymentOutcome(
            gateway: 'razorpay',
            status: PaymentStatus::Paid,
            paymentId: 'pay_'.uniqid(),
            amountPaise: $order->total_paise,
        ));

        return $order->fresh();
    }
}
