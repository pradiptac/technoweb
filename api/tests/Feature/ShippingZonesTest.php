<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\ShippingZone;
use App\Models\StoreProduct;
use App\Models\User;
use App\Notifications\CartReminder;
use App\Notifications\OrderPlaced;
use App\Support\IndianStates;
use App\Support\Money;
use App\Support\Store\Fulfilment;
use App\Support\Store\OrderMail;
use App\Support\Store\ShippingQuote;
use App\Support\Store\Zoho\ZohoInvoices;
use App\Support\Store\Zoho\ZohoPayments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Delivery charges and shipping zones (0.142.0, docs/store.md "Delivery
 * charges and shipping zones").
 *
 * The behaviour change this release makes is that the delivery charge shown is
 * the delivery charge taken, so most of what is pinned here is about money
 * ending up in the right place: the slab edges, a coupon that never touches
 * delivery, a free-delivery line judged after the discount, a destination
 * changed after the quote, and a total that every gateway, refund and report
 * reads as one figure.
 *
 * The zones used throughout, unless a test says otherwise:
 *
 *   Rest of India (default)  500g ₹60 · 1000g ₹90 · 2000g ₹140 · +₹50 per started kg
 *   East (WB, OD)            1000g ₹40 · +₹30 per started kg · free from ₹10,000
 *   Islands (AN, LD)         does not deliver
 */
class ShippingZonesTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------ helpers */

    private function setting(string $key, ?string $value, string $group = 'store', string $type = 'string'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => $group, 'value' => $value, 'type' => $type]);
        Setting::flushCache();
    }

    /** @param  array<int, array{0: int, 1: int}>  $rates  [up_to_grams, charge_paise] */
    private function zone(string $name, array $states, array $rates, ?int $extra = null, array $attributes = []): ShippingZone
    {
        $zone = ShippingZone::create(array_merge([
            'name' => $name, 'states' => $states, 'extra_per_kg_paise' => $extra,
        ], $attributes));

        foreach ($rates as [$grams, $charge]) {
            $zone->rates()->create(['up_to_grams' => $grams, 'charge_paise' => $charge]);
        }

        return $zone->fresh('rates');
    }

    private function rest(): ShippingZone
    {
        return $this->zone('Rest of India', [], [[500, 6000], [1000, 9000], [2000, 14000]], 5000, ['is_default' => true]);
    }

    private function east(): ShippingZone
    {
        return $this->zone('East', ['WB', 'OD'], [[1000, 4000]], 3000, ['free_above_paise' => 1000000, 'sort_order' => 1]);
    }

    private function islands(): ShippingZone
    {
        return $this->zone('Islands', ['AN', 'LD'], [], null, ['delivers' => false, 'sort_order' => 2]);
    }

    private function zonesOn(): void
    {
        $this->rest();
        $this->east();
        $this->islands();
        $this->setting('store_shipping_mode', 'zones');
    }

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A switch',
            'slug' => 'a-switch-'.uniqid(),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 100000,
            'weight_grams' => 400,
            'track_stock' => true,
            'stock' => 50,
        ], $attributes));
    }

    private function basket(StoreProduct $product, int $quantity = 1, ?string $token = null): string
    {
        // `withHeaders` is sticky across requests: an explicit blank is how a
        // second basket starts a new cart instead of joining the first.
        return $this->withHeaders(['X-Cart-Token' => $token ?? ''])
            ->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => $quantity])
            ->assertCreated()->json('data.token');
    }

    private function cartAt(string $token, ?string $state): TestResponse
    {
        return $this->withHeaders(['X-Cart-Token' => $token])->patchJson('/api/v1/cart/destination', ['state' => $state]);
    }

    private function summary(string $token): array
    {
        return $this->withHeaders(['X-Cart-Token' => $token])->getJson('/api/v1/cart')->assertOk()->json('data');
    }

    private function place(string $token, string $state = 'Karnataka', array $overrides = []): TestResponse
    {
        return $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/checkout', array_merge([
            'name' => 'Neil Basu',
            'email' => 'neil@example.test',
            'phone' => '+91 98765 43210',
            'address' => ['line1' => '12 Example Road', 'city' => 'Somewhere', 'state' => $state, 'pin' => '560001'],
        ], $overrides));
    }

    /** Quoted for a state and then placed for it, the way the checkout form does. */
    private function quotedAndPlaced(string $token, string $state = 'Karnataka', array $overrides = []): TestResponse
    {
        $this->cartAt($token, $state)->assertOk();

        return $this->place($token, $state, $overrides);
    }

    private function asRole(RoleEnum $role): static
    {
        $user = User::create([
            'name' => ucfirst($role->value), 'email' => $role->value.'-'.uniqid().'@example.test',
            'phone' => '9800000001', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin')->plainTextToken);
    }

    /** @return list<array{shipped: bool, quantity: int, weight_grams: int}> */
    private function lines(int $grams, int $quantity = 1): array
    {
        return [['shipped' => true, 'quantity' => $quantity, 'weight_grams' => $grams]];
    }

    /* ------------------------------------------------- flat mode (default) */

    public function test_a_flat_charge_is_added_to_an_order_that_ships(): void
    {
        $this->setting('store_shipping_paise', '5000');

        $token = $this->basket($this->product());
        $summary = $this->summary($token);

        $this->assertSame('flat', $summary['shipping_mode']);
        $this->assertSame(5000, $summary['shipping_paise']);
        $this->assertSame('₹50', $summary['shipping_label']);
        $this->assertSame(105000, $summary['total_paise']);

        $response = $this->place($token)->assertCreated();

        $order = Order::where('order_number', $response->json('data.order_number'))->firstOrFail();
        $this->assertSame(105000, $order->total_paise);
        $this->assertSame(5000, $order->shipping_paise);
        $this->assertNull($order->shipping_zone);
        // Delivery is GST-inclusive like everything else: extracted over the whole total.
        $this->assertSame(Money::gst(105000), $order->gst_paise);
        $this->assertSame(Money::taxable(105000), $order->taxable_paise);
        $this->assertSame(5000, $response->json('data.shipping_paise'));
    }

    public function test_a_zero_flat_charge_changes_nothing(): void
    {
        $token = $this->basket($this->product());
        $summary = $this->summary($token);

        $this->assertSame(0, $summary['shipping_paise']);
        $this->assertSame('Free', $summary['shipping_label']);
        $this->assertSame(100000, $summary['total_paise']);

        $this->place($token)->assertCreated();
        $order = Order::firstOrFail();

        $this->assertSame(100000, $order->total_paise);
        $this->assertSame(0, $order->shipping_paise);
    }

    public function test_a_digital_only_basket_has_no_delivery_and_no_destination_question(): void
    {
        $this->setting('store_shipping_paise', '5000');
        $this->zonesOn();

        $token = $this->basket($this->product(['type' => ProductType::Digital, 'weight_grams' => null]));
        $summary = $this->summary($token);

        $this->assertFalse($summary['has_shippable']);
        $this->assertSame(0, $summary['shipping_paise']);
        $this->assertNull($summary['shipping_label']);
        $this->assertSame(100000, $summary['total_paise']);

        // No address at all, and no state to choose: nothing is delivered.
        $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/checkout', [
            'name' => 'Neil Basu', 'email' => 'neil@example.test', 'phone' => '+91 98765 43210',
        ])->assertCreated();

        $order = Order::firstOrFail();
        $this->assertSame(0, $order->shipping_paise);
        $this->assertNull($order->shipping_zone);
        $this->assertNull($order->shipping_weight_grams);
    }

    /* ------------------------------------------------------------- the quote */

    public function test_slab_edges_are_inside_the_slab_and_the_excess_is_per_started_kilogram(): void
    {
        $this->zonesOn();

        $cases = [
            1 => 6000, 500 => 6000,
            501 => 9000, 1000 => 9000,
            1001 => 14000, 2000 => 14000,
            // Above the top slab: ₹140 + ₹50 for every started kilogram.
            2001 => 19000, 3000 => 19000,
            3001 => 24000, 4000 => 24000,
        ];

        foreach ($cases as $grams => $expected) {
            $quote = ShippingQuote::for($this->lines($grams), 'KA', 0);

            $this->assertSame($expected, $quote->chargePaise, "{$grams}g");
            $this->assertSame('Rest of India', $quote->zone);
            $this->assertSame($grams, $quote->weightGrams);
        }
    }

    public function test_a_basket_is_weighed_by_quantity_and_by_the_most_specific_weight(): void
    {
        $this->zonesOn();

        // 3 × 400g = 1200g: the third slab.
        $token = $this->basket($this->product(), 3);
        $summary = $this->cartAt($token, 'Karnataka')->assertOk()->json('data');

        $this->assertSame(1200, $summary['shipping_weight_grams']);
        $this->assertSame(14000, $summary['shipping_paise']);

        // Variation, else product, else the shop's default.
        $product = $this->product(['weight_grams' => 400]);
        $variation = $product->variations()->create(['name' => 'Heavy', 'weight_grams' => 700, 'stock' => 5]);
        $plain = $product->variations()->create(['name' => 'Plain', 'stock' => 5]);

        $this->assertSame(700, ShippingQuote::unitWeight($product, $variation));
        $this->assertSame(400, ShippingQuote::unitWeight($product, $plain));

        $unweighed = $this->product(['weight_grams' => null]);
        $this->assertSame(500, ShippingQuote::unitWeight($unweighed));
        $this->assertTrue(ShippingQuote::weightIsDefault($unweighed));

        $this->setting('store_default_weight_grams', '1200');
        $this->assertSame(1200, ShippingQuote::unitWeight($unweighed));

        // Zero is how a weight says "unset", at either level.
        $zero = $this->product(['weight_grams' => 0]);
        $this->assertSame(1200, ShippingQuote::unitWeight($zero, $zero->variations()->create(['name' => 'Z', 'weight_grams' => 0, 'stock' => 1])));
    }

    public function test_only_the_physical_lines_are_weighed_in_a_mixed_basket(): void
    {
        $this->zonesOn();

        $token = $this->basket($this->product());
        $this->basket($this->product(['type' => ProductType::Digital, 'weight_grams' => 5000]), 1, $token);
        $this->basket($this->product(['type' => ProductType::Service, 'weight_grams' => 5000]), 1, $token);

        $summary = $this->cartAt($token, 'Karnataka')->assertOk()->json('data');

        $this->assertTrue($summary['has_shippable']);
        $this->assertSame(400, $summary['shipping_weight_grams']);
        $this->assertSame(6000, $summary['shipping_paise']);
    }

    public function test_the_basket_does_not_pretend_to_know_delivery_before_a_state_is_chosen(): void
    {
        $this->zonesOn();
        $token = $this->basket($this->product());

        $summary = $this->summary($token);
        $this->assertSame('zones', $summary['shipping_mode']);
        $this->assertNull($summary['shipping_paise']);
        $this->assertSame('Worked out at checkout', $summary['shipping_label']);
        // Not free: simply not in the total yet.
        $this->assertSame(100000, $summary['total_paise']);

        $rest = $this->cartAt($token, 'Karnataka')->assertOk()->json('data');
        $this->assertSame(6000, $rest['shipping_paise']);
        $this->assertSame('Rest of India', $rest['shipping_zone']);
        $this->assertSame('KA', $rest['shipping_state']);
        $this->assertSame(106000, $rest['total_paise']);
        $this->assertSame(Money::gst(106000), $rest['gst_paise']);

        $east = $this->cartAt($token, 'West Bengal')->assertOk()->json('data');
        $this->assertSame(4000, $east['shipping_paise']);
        $this->assertSame('East', $east['shipping_zone']);
        $this->assertSame('₹40', $east['shipping_label']);

        $islands = $this->cartAt($token, 'AN')->assertOk()->json('data');
        $this->assertFalse($islands['shipping_deliverable']);
        $this->assertStringContainsString('do not deliver to Andaman', $islands['shipping_label']);
        $this->assertSame(100000, $islands['total_paise']);

        // A blank clears it, a misspelling is refused rather than guessed.
        $this->assertNull($this->cartAt($token, '')->assertOk()->json('data.shipping_paise'));
        $this->cartAt($token, 'Atlantis')->assertStatus(422)->assertJsonValidationErrors('state');
    }

    /* ------------------------------------------------------------- checkout */

    public function test_zones_checkout_charges_the_quoted_figure_and_snapshots_it(): void
    {
        $this->zonesOn();
        $token = $this->basket($this->product());

        $response = $this->quotedAndPlaced($token, 'Karnataka')->assertCreated();

        $order = Order::where('order_number', $response->json('data.order_number'))->firstOrFail();
        $this->assertSame(106000, $order->total_paise);
        $this->assertSame(6000, $order->shipping_paise);
        $this->assertSame('Rest of India', $order->shipping_zone);
        $this->assertSame(400, $order->shipping_weight_grams);
        $this->assertSame(Money::gst(106000), $order->gst_paise);

        // The customer's order, the console's, and the sales CSV all carry it.
        $access = $response->json('meta.access_token');
        $this->getJson("/api/v1/orders/{$order->order_number}?token={$access}")
            ->assertOk()
            ->assertJsonPath('data.shipping_paise', 6000)
            ->assertJsonPath('data.shipping_zone', 'Rest of India')
            ->assertJsonMissingPath('data.shipping_weight_grams');

        $this->asRole(RoleEnum::StoreManager)
            ->getJson("/api/v1/admin/store/orders/{$order->order_number}")
            ->assertOk()
            ->assertJsonPath('data.shipping_paise', 6000)
            ->assertJsonPath('data.shipping_weight_grams', 400);

        // Renaming or deleting the zone afterwards changes nothing on the order.
        ShippingZone::where('is_default', true)->update(['name' => 'Elsewhere']);
        $this->assertSame('Rest of India', $order->fresh()->shipping_zone);
    }

    public function test_a_hundred_percent_coupon_still_pays_for_delivery(): void
    {
        $this->zonesOn();
        Coupon::create(['code' => 'FREEBIE', 'type' => 'percentage', 'value' => 100]);

        $token = $this->basket($this->product());
        $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/cart/coupon', ['code' => 'FREEBIE'])->assertOk();

        $order = Order::where('order_number', $this->quotedAndPlaced($token, 'Karnataka')->assertCreated()->json('data.order_number'))->firstOrFail();

        $this->assertSame(100000, $order->discount_paise);
        $this->assertSame(6000, $order->shipping_paise);
        $this->assertSame(6000, $order->total_paise);
    }

    public function test_free_delivery_is_judged_on_the_goods_after_the_discount(): void
    {
        $this->zonesOn();
        Coupon::create(['code' => 'TWENTY', 'type' => 'percentage', 'value' => 20]);

        // ₹11,000 is over East's ₹10,000 line: delivery is free.
        $token = $this->basket($this->product(['price_paise' => 1100000]));
        $free = $this->cartAt($token, 'West Bengal')->assertOk()->json('data');
        $this->assertSame(0, $free['shipping_paise']);
        $this->assertSame('Free', $free['shipping_label']);
        $this->assertSame('East', $free['shipping_zone']);

        // 20% off takes it to ₹8,800: under the line, so it is charged.
        $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/cart/coupon', ['code' => 'TWENTY'])->assertOk();
        $charged = $this->summary($token);
        $this->assertSame(4000, $charged['shipping_paise']);
        $this->assertSame(884000, $charged['total_paise']);

        $order = Order::firstWhere('order_number', $this->place($token, 'West Bengal')->assertCreated()->json('data.order_number'));
        $this->assertSame(884000, $order->total_paise);
        $this->assertSame(4000, $order->shipping_paise);
    }

    public function test_the_free_line_itself_counts_as_free(): void
    {
        $this->zonesOn();

        $this->assertSame(0, ShippingQuote::for($this->lines(400), 'WB', 1000000)->chargePaise);
        $this->assertSame(4000, ShippingQuote::for($this->lines(400), 'WB', 999999)->chargePaise);
    }

    public function test_a_zone_that_is_not_delivered_to_is_refused_on_the_address_in_use(): void
    {
        $this->zonesOn();
        $token = $this->basket($this->product());
        $this->cartAt($token, 'Andaman and Nicobar Islands')->assertOk();

        // Billing and delivery are the same address: the billing block's state.
        $this->place($token, 'Andaman and Nicobar Islands')
            ->assertStatus(422)->assertJsonValidationErrors('address.state');

        // Delivered elsewhere: it is the delivery address that is judged.
        $this->place($token, 'Karnataka', [
            'shipping_same' => false,
            'shipping_address' => ['line1' => 'Jetty Road', 'city' => 'Port Blair', 'state' => 'Andaman and Nicobar Islands', 'pin' => '744101'],
        ])->assertStatus(422)->assertJsonValidationErrors('shipping_address.state');

        // The other way round the billing address is not what is delivered to.
        $this->cartAt($token, 'Karnataka')->assertOk();
        $this->place($token, 'Andaman and Nicobar Islands', [
            'shipping_same' => false,
            'shipping_address' => ['line1' => '12 Example Road', 'city' => 'Bengaluru', 'state' => 'Karnataka', 'pin' => '560001'],
        ])->assertCreated();
        $this->assertSame(1, Order::count());
    }

    public function test_free_text_that_is_no_state_is_refused_in_zones_mode(): void
    {
        $this->zonesOn();
        $token = $this->basket($this->product());

        $this->place($token, 'Atlantis')->assertStatus(422)->assertJsonValidationErrors('address.state');
        $this->place($token, '')->assertStatus(422);
        $this->assertSame(0, Order::count());

        // A state's code and its usual spellings resolve.
        $this->cartAt($token, 'Orissa')->assertOk()->assertJsonPath('data.shipping_state', 'OD');
        $this->place($token, 'orissa')->assertCreated();
    }

    public function test_delivery_alone_can_push_a_cash_on_delivery_order_over_the_ceiling(): void
    {
        $this->zonesOn();
        $this->setting('cod_enabled', '1', 'payments', 'boolean');
        $this->setting('cod_max_paise', '100000', 'payments');

        // ₹970 of goods is under the ₹1,000 ceiling; with ₹60 delivery it is not.
        $token = $this->basket($this->product(['price_paise' => 97000]));
        $this->cartAt($token, 'Karnataka')->assertOk();

        $response = $this->place($token, 'Karnataka', ['payment_method' => 'cod'])
            ->assertStatus(422)->assertJsonValidationErrors('payment_method');
        $this->assertStringContainsString('Cash on delivery is available up to', $response->json('errors.payment_method.0'));
        $this->assertSame(0, Order::count());

        // Under a higher ceiling the same goods and delivery are taken.
        $token = $this->basket($this->product(['price_paise' => 97000, 'weight_grams' => 400]));
        $this->setting('cod_max_paise', '110000', 'payments');
        $this->quotedAndPlaced($token, 'Karnataka', ['payment_method' => 'cod'])->assertCreated();
        $this->assertSame(103000, Order::sole()->total_paise);
    }

    public function test_a_destination_that_differs_from_the_quoted_one_is_saved_and_refused_with_the_new_figure(): void
    {
        $this->zonesOn();
        $token = $this->basket($this->product());

        // Quoted for Karnataka (₹60), placed for West Bengal (₹40).
        $this->cartAt($token, 'Karnataka')->assertOk();

        $response = $this->place($token, 'West Bengal')->assertStatus(422)->assertJsonValidationErrors('shipping');
        $this->assertStringContainsString('Delivery to West Bengal is ₹40', $response->json('errors.shipping.0'));
        $this->assertStringContainsString('₹1,040', $response->json('errors.shipping.0'));

        $this->assertSame(0, Order::count());
        // The new destination was saved even though the order was refused.
        $this->assertSame('WB', Cart::where('token', $token)->sole()->ship_state);

        // Seen now, so the second press is taken at that figure.
        $order = Order::firstWhere('order_number', $this->place($token, 'West Bengal')->assertCreated()->json('data.order_number'));
        $this->assertSame(104000, $order->total_paise);
    }

    public function test_a_basket_never_quoted_is_not_charged_a_figure_nobody_saw(): void
    {
        $this->zonesOn();
        $token = $this->basket($this->product());

        $this->place($token, 'Karnataka')->assertStatus(422)->assertJsonValidationErrors('shipping');
        $this->assertSame(0, Order::count());
    }

    public function test_the_request_can_never_supply_the_charge(): void
    {
        $this->zonesOn();
        $token = $this->basket($this->product());
        $this->cartAt($token, 'Karnataka')->assertOk();

        $this->place($token, 'Karnataka', ['shipping_paise' => 0, 'total_paise' => 1, 'shipping_zone' => 'free'])->assertCreated();

        $order = Order::sole();
        $this->assertSame(6000, $order->shipping_paise);
        $this->assertSame(106000, $order->total_paise);
        $this->assertSame('Rest of India', $order->shipping_zone);
    }

    public function test_the_gateway_is_asked_for_the_total_with_delivery(): void
    {
        foreach ([
            'payment_gateway' => 'razorpay', 'razorpay_key_id' => 'rzp_test_abc', 'razorpay_key_secret' => 's3cret',
            'razorpay_webhook_secret' => 'whsec',
        ] as $key => $value) {
            $this->setting($key, $value, 'payments');
        }

        $this->zonesOn();
        Http::fake(['api.razorpay.com/*' => Http::response(['id' => 'order_test123', 'amount' => 106000], 200)]);

        $token = $this->basket($this->product());
        $created = $this->quotedAndPlaced($token, 'Karnataka')->assertCreated();

        $this->postJson("/api/v1/orders/{$created->json('data.order_number')}/pay", ['token' => $created->json('meta.access_token')])
            ->assertOk()->assertJsonPath('data.amount_paise', 106000);

        Http::assertSent(fn ($request) => $request['amount'] === 106000);
    }

    /* --------------------------------------------- what reads the order back */

    public function test_the_sales_report_and_csv_carry_delivery_as_its_own_figure(): void
    {
        $this->zonesOn();
        $token = $this->basket($this->product());
        $number = $this->quotedAndPlaced($token, 'Karnataka')->assertCreated()->json('data.order_number');
        Order::where('order_number', $number)->firstOrFail()->moveTo(OrderStatus::Paid);

        $manager = $this->asRole(RoleEnum::StoreManager);

        $manager->getJson('/api/v1/admin/store/reports')
            ->assertOk()
            ->assertJsonPath('data.totals.delivery_paise', 6000)
            ->assertJsonPath('data.totals.total_paise', 106000);

        $csv = $manager->get('/api/v1/admin/store/reports/export?type=orders')->assertOk()->streamedContent();
        $this->assertStringContainsString('Delivery (INR)', $csv);
        $this->assertStringContainsString('60.00', $csv);
    }

    public function test_the_order_emails_list_delivery_and_a_free_install_reads_as_before(): void
    {
        $this->zonesOn();
        $token = $this->basket($this->product());
        $order = Order::firstWhere('order_number', $this->quotedAndPlaced($token, 'Karnataka')->assertCreated()->json('data.order_number'));

        $html = (string) (new OrderPlaced($order))->toMail(new AnonymousNotifiable)->render();
        $this->assertStringContainsString('Delivery (Rest of India)', $html);
        $this->assertStringContainsString('₹60', $html);

        // No delivery row at all for an order that was never charged one.
        $plain = Order::create([
            'status' => OrderStatus::PendingPayment, 'payment_method' => 'gateway', 'subtotal_paise' => 100000,
            'taxable_paise' => 84746, 'gst_paise' => 15254, 'total_paise' => 100000, 'customer_name' => 'A', 'customer_email' => 'a@example.test', 'placed_at' => now(),
        ]);
        $this->assertNull(OrderMail::delivery($plain));
    }

    public function test_zoho_gets_a_delivery_line_that_keeps_the_totals_matching(): void
    {
        $this->setting('zoho_books_tax_intra', '460000000017001', 'zoho_books');
        $this->setting('zoho_books_tax_inter', '460000000017002', 'zoho_books');
        $this->setting('zoho_books_home_state', 'KA', 'zoho_books');

        $order = $this->orderWithDelivery(6000, 'Rest of India');
        $lines = ZohoInvoices::payload($order, '7001')['line_items'];

        $this->assertCount(2, $lines);
        $this->assertSame('Delivery — Rest of India', $lines[1]['name']);
        $this->assertEquals(60, $lines[1]['rate']);
        $this->assertSame(1, $lines[1]['quantity']);
        $this->assertSame($lines[0]['tax_id'], $lines[1]['tax_id']);
        $this->assertEquals($order->total_paise / 100, array_sum(array_map(fn ($l) => $l['rate'] * $l['quantity'], $lines)));

        // A whole refund lists everything the invoice did, delivery included.
        $payment = $order->payments()->create([
            'gateway' => 'razorpay', 'gateway_payment_id' => 'pay_x', 'amount_paise' => $order->total_paise, 'currency' => 'INR',
            'status' => PaymentStatus::Refunded, 'method' => 'card', 'paid_at' => now(),
        ]);
        $note = ZohoPayments::creditNotePayload($payment, $order, '7001');
        $this->assertCount(2, $note['line_items']);
        $this->assertSame('Delivery — Rest of India', $note['line_items'][1]['name']);

        // No delivery, no extra line: what was sent before is what is sent now.
        $free = $this->orderWithDelivery(0, null);
        $this->assertCount(1, ZohoInvoices::payload($free, '7001')['line_items']);
    }

    private function orderWithDelivery(int $delivery, ?string $zone): Order
    {
        $order = Order::create([
            'status' => OrderStatus::PendingPayment, 'payment_method' => 'gateway',
            'subtotal_paise' => 100000, 'discount_paise' => 0, 'shipping_paise' => $delivery, 'shipping_zone' => $zone,
            'taxable_paise' => Money::taxable(100000 + $delivery), 'gst_paise' => Money::gst(100000 + $delivery),
            'total_paise' => 100000 + $delivery,
            'customer_name' => 'Priya Das', 'customer_email' => 'priya@acme.co.in',
            'billing_address' => ['line1' => '1 Park Street', 'city' => 'Bengaluru', 'state' => 'Karnataka', 'pin' => '560001'],
            'shipping_address' => ['line1' => '1 Park Street', 'city' => 'Bengaluru', 'state' => 'Karnataka', 'pin' => '560001'],
            'placed_at' => now(),
        ]);
        $order->items()->create([
            'name' => 'A switch', 'sku' => 'SW-1', 'type' => ProductType::Physical, 'quantity' => 1,
            'unit_price_paise' => 100000, 'line_total_paise' => 100000,
        ]);

        return $order->fresh();
    }

    public function test_a_reminder_quotes_the_goods_and_never_a_half_typed_destination(): void
    {
        $this->zonesOn();
        $this->setting('store_cart_reminders_enabled', '1', 'store_reminders', 'boolean');

        $token = $this->basket($this->product());
        $this->cartAt($token, 'Karnataka')->assertOk();
        $cart = Cart::where('token', $token)->sole();
        $cart->forceFill(['email' => 'neil@example.test', 'contact_consent_at' => now()])->save();

        $html = (string) (new CartReminder($cart->fresh(), 1))->toMail(new AnonymousNotifiable)->render();

        $this->assertStringContainsString(Money::format(100000), $html);
        $this->assertStringNotContainsString(Money::format(106000), $html);
        // The summary itself did include delivery; the reminder just does not use it.
        $this->assertSame(106000, $this->summary($token)['total_paise']);
    }

    public function test_the_feed_and_markup_make_no_shipping_claim_in_zones_mode(): void
    {
        $product = $this->product(['images' => ['media/shop/switch.jpg'], 'short_description' => 'A switch.']);
        $this->setting('store_shipping_paise', '5000');

        $flat = $this->getJson('/api/v1/store/feed')->assertOk()->json('data.0');
        $this->assertSame('50.00 INR', $flat['shipping_price']);
        $this->assertSame('IN', $flat['shipping_country']);
        $this->assertArrayHasKey('shippingDetails', $this->getJson("/api/v1/store/products/{$product->slug}")->json('data.schema.offers'));

        $this->zonesOn();

        $zoned = $this->getJson('/api/v1/store/feed')->assertOk()->json('data.0');
        foreach (['shipping_price', 'shipping_country', 'shipping_service', 'min_transit_time', 'max_transit_time'] as $key) {
            $this->assertArrayNotHasKey($key, $zoned);
        }
        // Handling time is not a price, and stays.
        $this->assertArrayHasKey('max_handling_time', $zoned);
        $this->assertArrayNotHasKey('shippingDetails', $this->getJson("/api/v1/store/products/{$product->slug}")->json('data.schema.offers'));
    }

    /* ------------------------------------------------------ the console */

    public function test_the_console_screen_is_a_store_managers(): void
    {
        $this->asRole(RoleEnum::ContentManager)->getJson('/api/v1/admin/store/shipping')->assertForbidden();
        $this->asRole(RoleEnum::StoreManager)->getJson('/api/v1/admin/store/shipping')
            ->assertOk()
            ->assertJsonPath('data.mode', 'flat')
            ->assertJsonPath('data.zones_ready', false)
            ->assertJsonPath('data.default_weight_grams', 500);
    }

    public function test_zones_cannot_be_chosen_until_a_default_zone_with_a_rate_exists(): void
    {
        $manager = $this->asRole(RoleEnum::StoreManager);

        $manager->putJson('/api/v1/admin/store/shipping/settings', ['mode' => 'zones'])
            ->assertStatus(422)->assertJsonValidationErrors('mode');

        // Neither does the generic settings door get round it.
        $this->setting('store_shipping_mode', 'flat');
        $this->asRole(RoleEnum::Admin)->patchJson('/api/v1/admin/settings', [
            'settings' => [['key' => 'store_shipping_mode', 'value' => 'zones']],
        ])->assertStatus(422);

        // A default zone with no slab is not enough.
        $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'Rest of India', 'is_default' => true, 'rates' => [],
        ])->assertStatus(422)->assertJsonValidationErrors('rates');

        $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'Rest of India', 'is_default' => true, 'extra_per_kg_paise' => 5000,
            'rates' => [['up_to_grams' => 500, 'charge_paise' => 6000]],
        ])->assertCreated();

        $manager->putJson('/api/v1/admin/store/shipping/settings', ['mode' => 'zones', 'flat_paise' => 0, 'default_weight_grams' => 750])
            ->assertOk()
            ->assertJsonPath('data.mode', 'zones')
            ->assertJsonPath('data.default_weight_grams', 750);

        $this->assertTrue(Fulfilment::usesZones());
        $this->assertSame(750, Fulfilment::defaultWeightGrams());
    }

    public function test_there_is_one_default_zone_and_a_state_is_in_one_active_zone(): void
    {
        $this->rest();
        $this->east();
        $manager = $this->asRole(RoleEnum::StoreManager);

        $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'Another default', 'is_default' => true, 'extra_per_kg_paise' => 0,
            'rates' => [['up_to_grams' => 500, 'charge_paise' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('is_default');

        // Odisha is in East already.
        $response = $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'Odisha only', 'states' => ['OD'], 'extra_per_kg_paise' => 0,
            'rates' => [['up_to_grams' => 500, 'charge_paise' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('states');
        $this->assertStringContainsString('already in “East”', $response->json('errors.states.0'));

        // Switched off, it may share: only active zones compete for a state.
        $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'Odisha draft', 'states' => ['OD'], 'is_active' => false, 'extra_per_kg_paise' => 0,
            'rates' => [['up_to_grams' => 500, 'charge_paise' => 1]],
        ])->assertCreated();

        // Names and codes both resolve; a stranger is refused.
        $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'South', 'states' => ['Kerala', 'TN'], 'extra_per_kg_paise' => 0,
            'rates' => [['up_to_grams' => 500, 'charge_paise' => 1]],
        ])->assertCreated()->assertJsonPath('data.states', ['KL', 'TN']);

        $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'Nowhere', 'states' => ['Atlantis'], 'extra_per_kg_paise' => 0,
            'rates' => [['up_to_grams' => 500, 'charge_paise' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('states');

        // A zone that is not the default needs states.
        $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'Empty', 'states' => [], 'extra_per_kg_paise' => 0,
            'rates' => [['up_to_grams' => 500, 'charge_paise' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('states');
    }

    public function test_slabs_need_an_extra_per_kilogram_and_no_two_end_at_one_weight(): void
    {
        $manager = $this->asRole(RoleEnum::StoreManager);
        $payload = ['name' => 'East', 'states' => ['WB'], 'rates' => [['up_to_grams' => 1000, 'charge_paise' => 4000]]];

        $manager->postJson('/api/v1/admin/store/shipping/zones', $payload)
            ->assertStatus(422)->assertJsonValidationErrors('extra_per_kg_paise');

        $manager->postJson('/api/v1/admin/store/shipping/zones', $payload + ['extra_per_kg_paise' => 0])->assertCreated();

        $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'North', 'states' => ['PB'], 'extra_per_kg_paise' => 0,
            'rates' => [['up_to_grams' => 500, 'charge_paise' => 1], ['up_to_grams' => 500, 'charge_paise' => 2]],
        ])->assertStatus(422)->assertJsonValidationErrors('rates.1.up_to_grams');

        // A zone that does not deliver carries no slabs and needs none.
        $manager->postJson('/api/v1/admin/store/shipping/zones', [
            'name' => 'Islands', 'states' => ['AN'], 'delivers' => false, 'rates' => [['up_to_grams' => 500, 'charge_paise' => 1]],
        ])->assertCreated()->assertJsonPath('data.rates', []);
    }

    public function test_the_zone_zones_mode_stands_on_cannot_be_removed_from_under_it(): void
    {
        $this->zonesOn();
        $manager = $this->asRole(RoleEnum::StoreManager);
        $default = ShippingZone::where('is_default', true)->sole();

        $manager->deleteJson("/api/v1/admin/store/shipping/zones/{$default->id}")
            ->assertStatus(422)->assertJsonValidationErrors('zone');
        $manager->patchJson("/api/v1/admin/store/shipping/zones/{$default->id}", ['is_default' => false, 'states' => ['KA']])
            ->assertStatus(422)->assertJsonValidationErrors('zone');
        $manager->patchJson("/api/v1/admin/store/shipping/zones/{$default->id}", ['rates' => []])
            ->assertStatus(422)->assertJsonValidationErrors('rates');

        $this->assertTrue($default->fresh()->is_default);
        $this->assertCount(3, $default->fresh()->rates);

        // A switched-off default is a contradiction in terms: it stays on.
        $manager->patchJson("/api/v1/admin/store/shipping/zones/{$default->id}", ['is_active' => false])
            ->assertOk()->assertJsonPath('data.is_active', true);

        // Back on flat, it can go.
        $manager->putJson('/api/v1/admin/store/shipping/settings', ['mode' => 'flat'])->assertOk();
        $manager->deleteJson("/api/v1/admin/store/shipping/zones/{$default->id}")->assertOk();
        $this->assertFalse(ShippingQuote::zonesReady());
    }

    public function test_zones_can_be_moved_and_a_stored_zones_mode_with_nothing_to_quote_from_reads_as_flat(): void
    {
        $this->zonesOn();
        $manager = $this->asRole(RoleEnum::StoreManager);
        $east = ShippingZone::where('name', 'East')->sole();

        $manager->postJson("/api/v1/admin/store/shipping/zones/{$east->id}/move", ['direction' => 'up'])->assertOk();
        $names = collect($manager->getJson('/api/v1/admin/store/shipping')->json('data.zones'))->pluck('name')->all();
        $this->assertSame('East', $names[0]);

        // A database edit that leaves zones on with no default reads as flat, not as free.
        ShippingZone::where('is_default', true)->delete();
        $this->assertSame('flat', Fulfilment::shippingMode());
    }

    public function test_products_without_a_weight_are_counted_and_listed(): void
    {
        $weighed = $this->product(['name' => 'Weighed']);
        $bare = $this->product(['name' => 'Bare', 'weight_grams' => null]);
        $optioned = $this->product(['name' => 'Optioned', 'weight_grams' => null]);
        $optioned->variations()->create(['name' => 'Big', 'weight_grams' => 900, 'stock' => 1]);
        $this->product(['name' => 'Licence', 'type' => ProductType::Digital, 'weight_grams' => null]);

        $manager = $this->asRole(RoleEnum::StoreManager);

        $manager->getJson('/api/v1/admin/store/shipping')->assertJsonPath('data.products_without_weight', 1);

        $listed = $manager->getJson('/api/v1/admin/store/products?no_weight=1')->assertOk()->json('data');
        $this->assertSame(['Bare'], array_column($listed, 'name'));
        $this->assertNotContains($weighed->id, array_column($listed, 'id'));
    }

    public function test_saving_a_product_does_not_wipe_a_variation_weight_the_form_never_sent(): void
    {
        $product = $this->product();
        $variation = $product->variations()->create(['name' => '24-Port', 'weight_grams' => 900, 'stock' => 5]);
        $manager = $this->asRole(RoleEnum::StoreManager);

        $manager->patchJson("/api/v1/admin/store/products/{$product->id}", [
            'variations' => [['id' => $variation->id, 'name' => '24-Port', 'stock' => 2]],
        ])->assertOk();
        $this->assertSame(900, $variation->fresh()->weight_grams);

        // Sending it, even to change it, still works.
        $manager->patchJson("/api/v1/admin/store/products/{$product->id}", [
            'variations' => [['id' => $variation->id, 'name' => '24-Port', 'stock' => 2, 'weight_grams' => 1100]],
        ])->assertOk();
        $this->assertSame(1100, $variation->fresh()->weight_grams);
    }

    public function test_telangana_and_ladakh_are_states_of_their_own(): void
    {
        $this->assertSame('TS', IndianStates::code('Telangana'));
        $this->assertSame('LA', IndianStates::code('Ladakh'));
        // The old import path still resolves.
        $this->assertSame('KA', \App\Support\Store\Zoho\IndianStates::code('karnataka'));
    }
}
