<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Coupon;
use App\Models\CouponUsage;
use App\Models\Order;
use App\Models\StoreProduct;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Discount codes.
 *
 * The rule underneath every test here is the brief's: **the backend
 * recalculates.** The basket stores the code and never the amount, and the
 * checkout validates it again against the subtotal it has just worked out —
 * because the basket checked a moment ago, against a different subtotal.
 */
class CouponTest extends TestCase
{
    use RefreshDatabase;

    private function product(int $pricePaise = 1180000): StoreProduct
    {
        return StoreProduct::create([
            'name' => 'A switch', 'slug' => 'a-switch-'.uniqid(),
            'type' => ProductType::Physical, 'status' => PublishStatus::Published,
            'price_paise' => $pricePaise, 'track_stock' => true, 'stock' => 20,
        ]);
    }

    private function basket(StoreProduct $product, int $quantity = 1): string
    {
        return $this->postJson('/api/v1/cart/items', [
            'product_id' => $product->id, 'quantity' => $quantity,
        ])->assertCreated()->json('data.token');
    }

    private function apply(string $token, string $code)
    {
        return $this->withHeaders(['X-Cart-Token' => $token])
            ->postJson('/api/v1/cart/coupon', ['code' => $code]);
    }

    private function checkout(string $token, string $email = 'neil@example.test')
    {
        return $this->withHeaders(['X-Cart-Token' => $token])
            ->postJson('/api/v1/checkout', [
                'name' => 'Neil Basu',
                'email' => $email,
                'phone' => '+91 98765 43210',
                'address' => ['line1' => '12 Example Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
            ]);
    }

    // ------------------------------------------------------ the arithmetic

    public function test_a_percentage_comes_off_and_the_gst_follows(): void
    {
        Coupon::create(['code' => 'welcome10', 'type' => 'percentage', 'value' => 10]);

        $token = $this->basket($this->product(1180000));

        $response = $this->apply($token, 'WELCOME10')->assertOk();

        $this->assertSame(118000, $response->json('data.discount_paise'));
        $this->assertSame(1062000, $response->json('data.total_paise'));

        // The GST follows the *payable* total, not the subtotal — the brief's
        // own worked example does the same.
        $this->assertSame(Money::taxable(1062000), $response->json('data.taxable_paise'));
        $this->assertSame(
            $response->json('data.total_paise'),
            $response->json('data.taxable_paise') + $response->json('data.gst_paise'),
        );
    }

    /** The brief's second worked example: ₹11,800 less ₹500 is ₹11,300. */
    public function test_a_fixed_amount_matches_the_briefs_example(): void
    {
        Coupon::create(['code' => 'FLAT500', 'type' => 'fixed', 'value' => 50000]);

        $token = $this->basket($this->product(1180000));

        $response = $this->apply($token, 'FLAT500')->assertOk();

        $this->assertSame(1130000, $response->json('data.total_paise'));
        $this->assertSame(957627, $response->json('data.taxable_paise'));
        $this->assertSame(172373, $response->json('data.gst_paise'));
    }

    /**
     * A fixed amount larger than the basket cannot make a negative total.
     *
     * The ordinary way this happens is a ₹500 code on a ₹299 order, and a
     * negative total is a refund nobody authorised.
     */
    public function test_a_discount_can_never_exceed_the_basket(): void
    {
        Coupon::create(['code' => 'BIG', 'type' => 'fixed', 'value' => 500000]);

        $token = $this->basket($this->product(29900));

        $response = $this->apply($token, 'BIG')->assertOk();

        $this->assertSame(29900, $response->json('data.discount_paise'));
        $this->assertSame(0, $response->json('data.total_paise'));
    }

    /** The ceiling on a percentage — "20% off" a rack is not what was meant. */
    public function test_a_maximum_discount_is_honoured(): void
    {
        Coupon::create([
            'code' => 'TWENTY', 'type' => 'percentage', 'value' => 20,
            'maximum_discount_paise' => 100000,
        ]);

        $token = $this->basket($this->product(1180000), 5);

        $this->apply($token, 'TWENTY')
            ->assertOk()
            ->assertJsonPath('data.discount_paise', 100000);
    }

    // ------------------------------------------------------ what it refuses

    public function test_an_unknown_code_is_refused_by_name(): void
    {
        $token = $this->basket($this->product());

        $this->apply($token, 'NOPE')
            ->assertStatus(422)
            ->assertJsonPath('message', 'That code is not recognised.');
    }

    public function test_an_expired_code_says_so(): void
    {
        Coupon::create(['code' => 'OLD', 'type' => 'percentage', 'value' => 10, 'ends_at' => now()->subDay()]);

        $token = $this->basket($this->product());

        $this->apply($token, 'OLD')
            ->assertStatus(422)
            ->assertJsonPath('message', 'That code has expired.');
    }

    /**
     * The minimum is quoted in the refusal.
     *
     * "Spend more" is not an instruction somebody can act on.
     */
    public function test_a_minimum_order_is_quoted_in_the_refusal(): void
    {
        Coupon::create([
            'code' => 'BIGSPEND', 'type' => 'fixed', 'value' => 50000,
            'minimum_order_paise' => 5000000,
        ]);

        $token = $this->basket($this->product(1180000));

        $this->apply($token, 'BIGSPEND')
            ->assertStatus(422)
            ->assertJsonPath('message', 'That code needs an order of ₹50,000 or more.');
    }

    public function test_an_inactive_code_is_refused(): void
    {
        Coupon::create(['code' => 'OFF', 'type' => 'percentage', 'value' => 10, 'is_active' => false]);

        $token = $this->basket($this->product());

        $this->apply($token, 'OFF')->assertStatus(422);
    }

    // ------------------------------------------------------ the basket is live

    /**
     * The basket stores the code, never the amount.
     *
     * So adding a line changes the discount — which is what "the backend
     * recalculates" means in practice, and is not a feature that had to be
     * built.
     */
    public function test_the_discount_follows_the_basket(): void
    {
        Coupon::create(['code' => 'TEN', 'type' => 'percentage', 'value' => 10]);

        $product = $this->product(1180000);
        $token = $this->basket($product);

        $this->apply($token, 'TEN')->assertOk()->assertJsonPath('data.discount_paise', 118000);

        /*
         * One add, not two. An earlier version of this test had a header-less
         * call above as well — and `withHeaders` is **sticky** across requests
         * in a Laravel test, so it went into the same basket rather than a new
         * one and the quantity came out at three.
         */
        $this->withHeaders(['X-Cart-Token' => $token])
            ->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])
            ->assertCreated()
            ->assertJsonPath('data.discount_paise', 236000);
    }

    /**
     * A code that stops being valid while a basket sits open is dropped and
     * **said**, not silently ignored.
     *
     * Somebody who typed a code and then sees the old total with no explanation
     * assumes the shop is broken.
     */
    public function test_a_code_that_expires_mid_basket_is_reported(): void
    {
        $coupon = Coupon::create(['code' => 'SOON', 'type' => 'percentage', 'value' => 10]);

        $token = $this->basket($this->product());
        $this->apply($token, 'SOON')->assertOk();

        $coupon->update(['ends_at' => now()->subMinute()]);

        $response = $this->withHeaders(['X-Cart-Token' => $token])
            ->getJson('/api/v1/cart')
            ->assertOk();

        $this->assertSame(0, $response->json('data.discount_paise'));
        $this->assertContains('That code has expired.', $response->json('data.problems'));
    }

    public function test_a_coupon_can_be_taken_off(): void
    {
        Coupon::create(['code' => 'TEN', 'type' => 'percentage', 'value' => 10]);

        $token = $this->basket($this->product());
        $this->apply($token, 'TEN')->assertOk();

        $this->withHeaders(['X-Cart-Token' => $token])
            ->deleteJson('/api/v1/cart/coupon')
            ->assertOk()
            ->assertJsonPath('data.discount_paise', 0);
    }

    // ------------------------------------------------------ at the checkout

    public function test_the_order_records_the_discount_and_the_code(): void
    {
        Coupon::create(['code' => 'TEN', 'type' => 'percentage', 'value' => 10]);

        $token = $this->basket($this->product(1180000));
        $this->apply($token, 'TEN')->assertOk();

        $this->checkout($token)->assertCreated();

        $order = Order::firstOrFail();

        $this->assertSame(118000, $order->discount_paise);
        $this->assertSame(1062000, $order->total_paise);
        // Copied, so renaming or deleting the coupon later cannot change what
        // this order says was applied.
        $this->assertSame('TEN', $order->coupon_code);
        $this->assertSame(1, CouponUsage::count());
    }

    /**
     * A single-use code stops working the moment it is spent.
     *
     * Recorded at checkout rather than at payment, because the gap between
     * placing an order and paying for it is exactly where a second tab would
     * otherwise use it again.
     */
    public function test_a_usage_limit_is_enforced_across_orders(): void
    {
        Coupon::create(['code' => 'ONCE', 'type' => 'fixed', 'value' => 10000, 'usage_limit' => 1]);

        $product = $this->product();

        $first = $this->basket($product);
        $this->apply($first, 'ONCE')->assertOk();
        $this->checkout($first)->assertCreated();

        $second = $this->basket($product);

        $this->apply($second, 'ONCE')
            ->assertStatus(422)
            ->assertJsonPath('message', 'That code has been fully used.');
    }

    /**
     * The per-customer limit is keyed on the **address**, not an account.
     *
     * Guest checkout means most orders have no account when the coupon is used,
     * so keying it on a customer id would let one person use a "once each" code
     * as often as they liked simply by not signing in.
     */
    public function test_a_per_customer_limit_follows_the_email(): void
    {
        Coupon::create(['code' => 'EACH', 'type' => 'fixed', 'value' => 10000, 'per_customer_limit' => 1]);

        $product = $this->product();

        $first = $this->basket($product);
        $this->apply($first, 'EACH')->assertOk();
        $this->checkout($first, 'neil@example.test')->assertCreated();

        // The same person: refused, even though the overall limit is unset.
        $second = $this->basket($product);
        $this->apply($second, 'EACH')->assertOk();
        $this->checkout($second, 'NEIL@example.test')->assertCreated();

        $this->assertSame(0, Order::orderByDesc('id')->first()->discount_paise);

        // Somebody else: still fine.
        $third = $this->basket($product);
        $this->apply($third, 'EACH')->assertOk();
        $this->checkout($third, 'someone-else@example.test')->assertCreated();

        $this->assertSame(10000, Order::orderByDesc('id')->first()->discount_paise);
    }

    /**
     * A code that has become unusable does not fail the order.
     *
     * Losing a basket over a discount is the wrong trade — the order is placed
     * at full price and the coupon is simply not applied.
     */
    public function test_an_order_still_places_when_the_code_has_gone(): void
    {
        $coupon = Coupon::create(['code' => 'GONE', 'type' => 'percentage', 'value' => 10]);

        $token = $this->basket($this->product(1180000));
        $this->apply($token, 'GONE')->assertOk();

        $coupon->update(['is_active' => false]);

        $this->checkout($token)->assertCreated();

        $order = Order::firstOrFail();

        $this->assertSame(0, $order->discount_paise);
        $this->assertSame(1180000, $order->total_paise);
        $this->assertNull($order->coupon_code);
    }

    /** Codes are matched however they are typed. */
    public function test_a_code_is_matched_whatever_the_case(): void
    {
        Coupon::create(['code' => 'MixedCase', 'type' => 'percentage', 'value' => 10]);

        $token = $this->basket($this->product());

        $this->apply($token, '  mixedcase  ')->assertOk();
    }
}
