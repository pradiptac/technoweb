<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Cart;
use App\Models\Order;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Store\Payments\PaymentOutcome;
use App\Support\Store\Payments\Settlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Selling what is not on the shelf yet.
 *
 * Off by default and off for everything that existed before it — overselling is
 * a promise the shop then has to keep, and a default that makes promises is the
 * wrong one. Switched on, the whole chain has to agree: the listing offers it,
 * the basket does not warn about it, the checkout does not refuse it, and
 * settlement takes the stock into the negative, because the shop owes that many
 * and a paid order that took no stock is the one thing the ledger must not say.
 */
class OversellTest extends TestCase
{
    use RefreshDatabase;

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A switch',
            'slug' => 'a-switch-'.uniqid(),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
            'track_stock' => true,
            'stock' => 1,
        ], $attributes));
    }

    /** A basket holding more than the shelf does, ready for the checkout. */
    private function basketFor(StoreProduct $product, int $quantity, ?int $variationId = null): string
    {
        $cart = Cart::create(['token' => Cart::newToken()]);

        $cart->items()->create([
            'store_product_id' => $product->id,
            'store_product_variation_id' => $variationId,
            'quantity' => $quantity,
        ]);

        return $cart->token;
    }

    private function checkout(string $token): TestResponse
    {
        return $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/checkout', [
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.test',
            'phone' => '9831100758',
            'address' => [
                'line1' => '12 Engine Road', 'city' => 'Kolkata',
                'state' => 'West Bengal', 'pin' => '700001', 'country' => 'India',
            ],
        ]);
    }

    // ------------------------------------------------------------- the default

    /**
     * Off unless somebody switched it on, which is what the shop did yesterday.
     */
    public function test_overselling_is_off_by_default(): void
    {
        $product = $this->product();

        $this->assertFalse($product->allow_oversell);
        $this->assertFalse($product->allowsOversell());
    }

    public function test_a_short_basket_is_refused_when_overselling_is_off(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 1]);

        $this->checkout($this->basketFor($product, 3))
            ->assertStatus(422)
            ->assertJsonValidationErrors('cart');

        $this->assertSame(0, Order::count(), 'Nothing is part-filled: the whole order is refused.');
    }

    // ------------------------------------------------------------ switched on

    public function test_a_short_basket_goes_through_when_overselling_is_on(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 1, 'allow_oversell' => true]);

        $this->checkout($this->basketFor($product, 3))->assertCreated();

        $this->assertSame(1, Order::count());
    }

    /**
     * Settling a back-ordered line takes the stock below zero.
     *
     * That is the honest record: the shop owes three and has one. Leaving the
     * guard in place would silently decrement nothing, and the stock report
     * would show a paid order that moved no stock.
     */
    public function test_settling_a_back_ordered_line_takes_stock_negative(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 1, 'allow_oversell' => true]);
        $this->checkout($this->basketFor($product, 3))->assertCreated();

        $order = Order::sole();
        Settlement::record($order, new PaymentOutcome(
            gateway: 'razorpay',
            status: PaymentStatus::Paid,
            paymentId: 'pay_'.uniqid(),
            amountPaise: $order->total_paise,
        ));

        $this->assertSame(-2, $product->fresh()->stock);
    }

    /**
     * And it is not reported as short.
     *
     * "Paid, but stock could not be taken" is a warning for the desk to act on
     * before dispatch. Going below zero on a line the shop agreed to
     * back-order is not that, and saying so would train people to ignore it.
     */
    public function test_a_back_ordered_line_is_not_flagged_as_short(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 1, 'allow_oversell' => true]);
        $this->checkout($this->basketFor($product, 3))->assertCreated();

        $order = Order::sole();
        Settlement::record($order, new PaymentOutcome(
            gateway: 'razorpay',
            status: PaymentStatus::Paid,
            paymentId: 'pay_'.uniqid(),
            amountPaise: $order->total_paise,
        ));

        $this->assertSame(
            0,
            $order->history()->where('note', 'like', '%stock could not be taken%')->count(),
        );
    }

    // ------------------------------------------------- the shop has to agree

    /**
     * A back-ordered product is in stock, on the listing and in the query.
     *
     * `inStock()` and `scopeOutOfStock()` are the same sentence asked of one
     * record and of a set — the dashboard's "3 out of stock" tile links to the
     * list the scope builds, so a tile that counts a product the listing sells
     * is a figure somebody has to reverse engineer.
     */
    public function test_a_back_ordered_product_is_neither_out_of_stock_nor_counted_as_such(): void
    {
        $short = $this->product(['stock' => 0]);
        $backordered = $this->product(['stock' => 0, 'allow_oversell' => true]);

        $this->assertFalse($short->inStock());
        $this->assertTrue($backordered->inStock());

        $counted = StoreProduct::outOfStock()->pluck('id');

        $this->assertTrue($counted->contains($short->id));
        $this->assertFalse($counted->contains($backordered->id), 'The tile and the listing must agree.');
    }

    /** The basket stops warning, because the warning would no longer be true. */
    public function test_the_basket_does_not_warn_about_a_back_ordered_line(): void
    {
        $product = $this->product(['stock' => 1, 'allow_oversell' => true]);
        $token = $this->basketFor($product, 5);

        $line = $this->withHeaders(['X-Cart-Token' => $token])
            ->getJson('/api/v1/cart')
            ->assertOk()
            ->json('data.items.0');

        $this->assertNull($line['available_quantity'] ?? null);
    }

    // ------------------------------------------------------- per variation

    /**
     * The variation answers for itself, and does not inherit.
     *
     * A product with variations counts per variation, so the flag has to as
     * well — "the 24-port is back-ordered and the 48-port is not" is the case
     * somebody actually has, and a flag read off the parent cannot say it.
     */
    public function test_the_flag_is_per_variation_and_is_not_inherited(): void
    {
        $product = $this->product(['stock' => 0, 'allow_oversell' => true]);
        $open = $product->variations()->create(['name' => '24-port', 'stock' => 0, 'allow_oversell' => true, 'sort_order' => 0]);
        $closed = $product->variations()->create(['name' => '48-port', 'stock' => 0, 'allow_oversell' => false, 'sort_order' => 1]);

        $this->assertTrue($product->allowsOversell($open));
        $this->assertFalse(
            $product->allowsOversell($closed),
            'The parent being switched on must not switch a variation on.',
        );

        $this->assertTrue($open->inStock());
        $this->assertFalse($closed->inStock());
    }

    public function test_a_short_variation_is_refused_unless_that_variation_allows_it(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 0]);
        $closed = $product->variations()->create(['name' => '48-port', 'stock' => 1, 'sort_order' => 0]);

        $this->checkout($this->basketFor($product, 3, $closed->id))
            ->assertStatus(422)
            ->assertJsonValidationErrors('cart');

        $open = $product->variations()->create(['name' => '24-port', 'stock' => 1, 'allow_oversell' => true, 'sort_order' => 1]);

        $this->checkout($this->basketFor($product, 3, $open->id))->assertCreated();
    }

    // ------------------------------------------------------------ the order

    /** A cash-on-delivery order back-orders the same way a gateway one does. */
    public function test_the_switch_is_about_stock_and_not_about_how_it_is_paid_for(): void
    {
        Notification::fake();

        // COD is offered only when the shop has switched it on — availability
        // is a separate question from stock, which is the point of this test.
        Setting::updateOrCreate(['key' => 'cod_enabled'], ['group' => 'payments', 'value' => '1', 'type' => 'boolean']);
        Setting::flushCache();

        $product = $this->product(['stock' => 1, 'allow_oversell' => true]);
        $token = $this->basketFor($product, 4);

        $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/checkout', [
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.test',
            'phone' => '9831100758',
            'payment_method' => PaymentMethod::Cod->value,
            'address' => [
                'line1' => '12 Engine Road', 'city' => 'Kolkata',
                'state' => 'West Bengal', 'pin' => '700001', 'country' => 'India',
            ],
        ])->assertCreated();

        $this->assertSame(OrderStatus::Confirmed, Order::sole()->status);
    }
}
