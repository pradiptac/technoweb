<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Cart;
use App\Models\Customer;
use App\Models\Order;
use App\Models\StoreProduct;
use App\Support\Money;
use App\Support\Store\Checkout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Turning a basket into an order.
 *
 * The rule the brief states three times, and every test here is a way of asking
 * whether it holds: **the frontend is not the authority for anything that costs
 * money.** The request carries a name and an address; the price, the total and
 * the GST are worked out on the server from the products as they are at that
 * instant.
 */
class CheckoutTest extends TestCase
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
            'stock' => 5,
        ], $attributes));
    }

    private function basketWith(StoreProduct $product, int $quantity = 1): string
    {
        return $this->postJson('/api/v1/cart/items', [
            'product_id' => $product->id, 'quantity' => $quantity,
        ])->assertCreated()->json('data.token');
    }

    /** @return array<string, mixed> */
    private function details(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Neil Basu',
            'email' => 'neil@example.test',
            'phone' => '+91 98765 43210',
            'address' => [
                'line1' => '12 Example Road',
                'city' => 'Kolkata',
                'state' => 'West Bengal',
                'pin' => '700001',
            ],
        ], $overrides);
    }

    private function checkout(string $token, array $overrides = [])
    {
        return $this->withHeaders(['X-Cart-Token' => $token])
            ->postJson('/api/v1/checkout', $this->details($overrides));
    }

    // ------------------------------------------------------ the happy path

    public function test_an_order_is_priced_by_the_server(): void
    {
        $product = $this->product(['price_paise' => 1180000]);
        $token = $this->basketWith($product, 2);

        $response = $this->checkout($token)->assertCreated();

        $this->assertSame(2360000, $response->json('data.total_paise'));
        $this->assertSame(2000000, $response->json('data.taxable_paise'));
        $this->assertSame(360000, $response->json('data.gst_paise'));
        $this->assertSame(
            $response->json('data.total_paise'),
            $response->json('data.taxable_paise') + $response->json('data.gst_paise'),
        );

        $this->assertMatchesRegularExpression('/^ORD-\d{4}-\d{5}$/', $response->json('data.order_number'));
        $this->assertSame('pending_payment', $response->json('data.status'));
    }

    /**
     * A price sent by the browser is ignored, not honoured.
     *
     * This is the attack the whole design exists to make impossible, so it is
     * asserted rather than assumed: everything about money is recomputed, and
     * there is nowhere for a supplied figure to land.
     */
    public function test_a_price_in_the_request_changes_nothing(): void
    {
        $product = $this->product(['price_paise' => 1180000]);
        $token = $this->basketWith($product);

        $response = $this->checkout($token, [
            'total_paise' => 1,
            'price_paise' => 1,
            'discount_paise' => 1179999,
        ])->assertCreated();

        $this->assertSame(1180000, $response->json('data.total_paise'));
    }

    /** The line is frozen: renaming the product afterwards changes nothing. */
    public function test_the_line_is_a_snapshot(): void
    {
        $product = $this->product(['name' => 'CBS350-24T', 'price_paise' => 1180000]);
        $token = $this->basketWith($product);

        $this->checkout($token)->assertCreated();

        $product->update(['name' => 'Renamed entirely', 'price_paise' => 9900]);

        $item = Order::firstOrFail()->items()->firstOrFail();

        $this->assertSame('CBS350-24T', $item->name);
        $this->assertSame(1180000, $item->unit_price_paise);
    }

    /** The basket is emptied, or the payment page would offer to sell it again. */
    public function test_the_basket_is_emptied(): void
    {
        $product = $this->product();
        $token = $this->basketWith($product);

        $this->checkout($token)->assertCreated();

        $this->withHeaders(['X-Cart-Token' => $token])
            ->getJson('/api/v1/cart')
            ->assertOk()
            ->assertJsonPath('data.item_count', 0);
    }

    // ------------------------------------------------------ what it refuses

    /**
     * Stock is committed under a lock, and short stock refuses the whole order.
     *
     * Placing an order for whatever happened to still be available, and telling
     * somebody afterwards, means they paid for a basket they did not assemble.
     */
    public function test_an_order_is_refused_whole_when_stock_is_short(): void
    {
        $product = $this->product(['stock' => 5]);
        $token = $this->basketWith($product, 3);

        $product->update(['stock' => 1]);

        $this->checkout($token)
            ->assertStatus(422)
            ->assertJsonValidationErrors('cart');

        $this->assertSame(0, Order::count());
    }

    public function test_a_product_withdrawn_from_sale_refuses_the_order(): void
    {
        $product = $this->product();
        $token = $this->basketWith($product);

        $product->update(['status' => PublishStatus::Draft]);

        $this->checkout($token)->assertStatus(422);
        $this->assertSame(0, Order::count());
    }

    public function test_an_empty_basket_cannot_be_checked_out(): void
    {
        $cart = Cart::create(['token' => Cart::newToken()]);

        $this->withHeaders(['X-Cart-Token' => $cart->token])
            ->postJson('/api/v1/checkout', $this->details())
            ->assertStatus(422);
    }

    /**
     * The address is required by the basket, not by the form.
     *
     * Something being shipped needs somewhere to send it; a licence does not,
     * and asking for a delivery address to sell one is a form arguing with
     * itself.
     */
    public function test_a_shipped_order_needs_an_address(): void
    {
        $product = $this->product();
        $token = $this->basketWith($product);

        $this->withHeaders(['X-Cart-Token' => $token])
            ->postJson('/api/v1/checkout', $this->details(['address' => []]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('address.line1');
    }

    public function test_a_digital_only_order_needs_no_address(): void
    {
        $product = $this->product([
            'type' => ProductType::Digital, 'track_stock' => false, 'stock' => 0,
        ]);
        $token = $this->basketWith($product);

        $response = $this->withHeaders(['X-Cart-Token' => $token])
            ->postJson('/api/v1/checkout', $this->details(['address' => []]))
            ->assertCreated();

        // Null rather than a copy of the billing address: nothing travels, so a
        // delivery address would be a courier label on something that does not.
        $this->assertNull($response->json('data.shipping_address'));
    }

    public function test_a_malformed_gstin_is_refused(): void
    {
        $product = $this->product();
        $token = $this->basketWith($product);

        $this->checkout($token, ['gst_required' => true, 'gstin' => 'NOT-A-GSTIN', 'company_name' => 'Meridian'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('gstin');
    }

    public function test_a_real_gstin_is_kept_for_the_invoice(): void
    {
        $product = $this->product();
        $token = $this->basketWith($product);

        $response = $this->checkout($token, [
            'gst_required' => true, 'gstin' => '27aapfu0939f1zv', 'company_name' => 'Meridian Foods',
        ])->assertCreated();

        // Upper-cased on the way in: it is typed in lower case as often as not.
        $this->assertSame('27AAPFU0939F1ZV', $response->json('data.gstin'));
        $this->assertTrue($response->json('data.gst_required'));
    }

    // ------------------------------------------------------ reading it back

    /**
     * The order is reached by its token, never by its number alone.
     *
     * The number is printed on paperwork and sequential, so anything it
     * unlocked would be unlocked for whoever counted upwards. A wrong token is
     * a 404 rather than a 403, because a 403 confirms the order exists.
     */
    public function test_an_order_is_read_by_its_token(): void
    {
        $product = $this->product();
        $token = $this->basketWith($product);

        $created = $this->checkout($token)->assertCreated();

        $number = $created->json('data.order_number');
        $access = $created->json('meta.access_token');

        $this->assertSame(64, strlen($access));

        $this->getJson("/api/v1/orders/{$number}?token={$access}")
            ->assertOk()
            ->assertJsonPath('data.order_number', $number);

        $this->getJson("/api/v1/orders/{$number}?token=".str_repeat('0', 64))->assertNotFound();
        $this->getJson("/api/v1/orders/{$number}")->assertNotFound();
    }

    /**
     * The token is returned once and never again.
     *
     * Echoing it in every read would put the key to the page into a browser
     * history, a proxy log and an analytics referrer.
     */
    public function test_the_access_token_is_not_echoed_on_a_read(): void
    {
        $product = $this->product();
        $token = $this->basketWith($product);

        $created = $this->checkout($token)->assertCreated();
        $number = $created->json('data.order_number');
        $access = $created->json('meta.access_token');

        $read = $this->getJson("/api/v1/orders/{$number}?token={$access}")->assertOk();

        $this->assertArrayNotHasKey('access_token', $read->json('data'));
        $this->assertNull($read->json('meta.access_token'));
    }

    // ------------------------------------------------------ the account

    /**
     * A guest who pays gets an account, and it is active.
     *
     * Registering through the front door leaves somebody `pending` until a
     * human approves them. Having taken their money is a stronger statement
     * than anything that queue exists to establish, and making them wait to see
     * their own order would be absurd.
     */
    public function test_paying_creates_an_active_account_for_a_guest(): void
    {
        $product = $this->product();
        $token = $this->basketWith($product);

        $this->checkout($token)->assertCreated();

        $order = Order::firstOrFail();
        $this->assertNull($order->customer_id, 'the account is created on payment, not on checkout');

        $customer = Checkout::accountFor($order);

        $this->assertSame('neil@example.test', $customer->email);
        $this->assertSame(CustomerStatus::Active, $customer->status);
        $this->assertSame($customer->id, $order->fresh()->customer_id);
    }

    /**
     * An address that already has an account keeps whatever status it has.
     *
     * A purchase does not overturn a decision a person made about a person —
     * the order is reachable by its own link either way.
     */
    public function test_an_existing_account_is_linked_and_not_promoted(): void
    {
        $existing = Customer::create([
            'name' => 'Neil Basu', 'email' => 'neil@example.test',
            'password' => 'password-for-tests', 'status' => CustomerStatus::Suspended,
        ]);

        $product = $this->product();
        $token = $this->basketWith($product);

        $this->checkout($token)->assertCreated();

        $customer = Checkout::accountFor(Order::firstOrFail());

        $this->assertSame($existing->id, $customer->id);
        $this->assertSame(CustomerStatus::Suspended, $customer->fresh()->status);
    }

    // ------------------------------------------------------ the trail

    public function test_placing_an_order_writes_the_first_line_of_its_trail(): void
    {
        $product = $this->product();
        $token = $this->basketWith($product);

        $this->checkout($token)->assertCreated();

        $order = Order::with('history')->firstOrFail();

        $this->assertCount(1, $order->history);
        $this->assertSame(OrderStatus::PendingPayment->value, $order->history->first()->to_status);
    }

    /** Order numbers are sequential within a year, and unique. */
    public function test_order_numbers_are_sequential(): void
    {
        $product = $this->product(['stock' => 20]);

        $first = $this->checkout($this->basketWith($product))->assertCreated()->json('data.order_number');
        $second = $this->checkout($this->basketWith($product))->assertCreated()->json('data.order_number');

        $this->assertNotSame($first, $second);
        $this->assertSame(
            ((int) substr($first, -5)) + 1,
            (int) substr($second, -5),
        );
    }

    /** The GST split holds on an awkward total, as it must on every invoice. */
    public function test_the_gst_split_holds_on_an_awkward_total(): void
    {
        $product = $this->product(['price_paise' => 87533, 'stock' => 9]);
        $token = $this->basketWith($product, 3);

        $response = $this->checkout($token)->assertCreated();

        $total = 87533 * 3;

        $this->assertSame($total, $response->json('data.total_paise'));
        $this->assertSame(Money::taxable($total), $response->json('data.taxable_paise'));
        $this->assertSame($total, $response->json('data.taxable_paise') + $response->json('data.gst_paise'));
    }

    /* ------------------------------------ a delivery address of its own */

    /**
     * Shipping defaults to the billing address, and the order stores one.
     *
     * `shipping_same` absent means the same, which is both the common case
     * and what every caller that predates the field meant.
     */
    public function test_shipping_defaults_to_the_billing_address(): void
    {
        $token = $this->basketWith($this->product());
        $this->checkout($token)->assertCreated();

        $order = Order::latest('id')->firstOrFail();

        $this->assertSame('12 Example Road', $order->billing_address['line1']);
        /*
          A *copy* of the billing address, not null — `Checkout::shippingAddress`
          has always resolved it that way for anything that ships, and the order
          is the immutable record of where the parcel was actually sent. Null is
          reserved for an order with nothing to deliver.
        */
        $this->assertSame($order->billing_address, $order->shipping_address);
    }

    /** Unticked, the parcel goes somewhere else and the order says so. */
    public function test_a_separate_shipping_address_is_kept(): void
    {
        $token = $this->basketWith($this->product());

        $this->checkout($token, [
            'shipping_same' => false,
            'shipping_address' => [
                'line1' => 'Unit 4, Sector V',
                'city' => 'Salt Lake',
                'state' => 'West Bengal',
                'pin' => '700091',
            ],
        ])->assertCreated();

        $order = Order::latest('id')->firstOrFail();

        $this->assertSame('12 Example Road', $order->billing_address['line1']);
        $this->assertSame('Unit 4, Sector V', $order->shipping_address['line1']);
        $this->assertSame('700091', $order->shipping_address['pin']);
    }

    /**
     * With a separate delivery address, it is *that* one that has to be
     * complete — and the error lands on the field the person left blank
     * rather than on the billing block they filled in correctly.
     */
    public function test_an_incomplete_shipping_address_is_refused_on_its_own_fields(): void
    {
        $token = $this->basketWith($this->product());

        $this->checkout($token, [
            'shipping_same' => false,
            'shipping_address' => ['line1' => 'Unit 4, Sector V'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['shipping_address.city', 'shipping_address.pin']);
    }

    /**
     * A blank billing address is refused even when the parcel goes elsewhere.
     *
     * The first cut checked "whichever address the parcel is going to", which
     * made the invoice address optional the moment somebody ticked the box —
     * an order with nothing to put on the invoice. The form marks both
     * required and the form is not the boundary.
     */
    public function test_the_billing_address_is_required_even_when_shipping_elsewhere(): void
    {
        $token = $this->basketWith($this->product());

        $this->checkout($token, [
            'address' => [],
            'shipping_same' => false,
            'shipping_address' => [
                'line1' => 'Unit 4, Sector V',
                'city' => 'Salt Lake',
                'state' => 'West Bengal',
                'pin' => '700091',
            ],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['address.line1', 'address.city', 'address.pin']);
    }

    /* -------------------------------- kept for the next order */

    /**
     * The address and GSTIN are kept on the account once the order is paid.
     *
     * This is the whole point of the columns: a returning customer should not
     * retype an address the shop already has. Written at `accountFor`, which
     * is where the order is attached to an account in the first place.
     */
    public function test_the_address_and_gstin_are_kept_on_the_account(): void
    {
        $token = $this->basketWith($this->product());

        $this->checkout($token, [
            'gst_required' => true,
            'gstin' => '27AAPFU0939F1ZV',
            'company_name' => 'Meridian Foods',
        ])->assertCreated();

        $order = Order::latest('id')->firstOrFail();
        $customer = Checkout::accountFor($order);

        $this->assertNotNull($customer);
        $this->assertSame('12 Example Road', $customer->billing_address['line1']);
        $this->assertSame('27AAPFU0939F1ZV', $customer->gstin);
        // Not copied from billing: "same as billing" must not become two
        // addresses that merely match today.
        $this->assertNull($customer->shipping_address);
    }

    /** A second, different delivery address is kept as one. */
    public function test_a_separate_shipping_address_is_kept_on_the_account(): void
    {
        $token = $this->basketWith($this->product());

        $this->checkout($token, [
            'shipping_same' => false,
            'shipping_address' => [
                'line1' => 'Unit 4, Sector V',
                'city' => 'Salt Lake',
                'state' => 'West Bengal',
                'pin' => '700091',
            ],
        ])->assertCreated();

        $customer = Checkout::accountFor(Order::latest('id')->firstOrFail());

        $this->assertSame('Unit 4, Sector V', $customer->shipping_address['line1']);
    }

    /**
     * The order's own copy never moves when the account's does.
     *
     * An invoice reads the order, and a customer who moves must not silently
     * rewrite what an old one says they were billed at.
     */
    public function test_a_later_order_does_not_rewrite_an_earlier_ones_address(): void
    {
        $first = $this->basketWith($this->product());
        $this->checkout($first)->assertCreated();
        $firstOrder = Order::latest('id')->firstOrFail();
        Checkout::accountFor($firstOrder);

        $second = $this->basketWith($this->product());
        $this->checkout($second, [
            'address' => [
                'line1' => '90 New Street',
                'city' => 'Howrah',
                'state' => 'West Bengal',
                'pin' => '711101',
            ],
        ])->assertCreated();

        $customer = Checkout::accountFor(Order::latest('id')->firstOrFail());

        // The account follows the move…
        $this->assertSame('90 New Street', $customer->fresh()->billing_address['line1']);
        // …and the first order does not.
        $this->assertSame('12 Example Road', $firstOrder->fresh()->billing_address['line1']);
    }
}
