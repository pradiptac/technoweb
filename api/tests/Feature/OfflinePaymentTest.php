<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Paying without a gateway.
 *
 * Three methods, and every one of them ends with a person saying the money
 * arrived. What is worth pinning is the set of things that would each be a way
 * of giving stock away: a licence sold cash on delivery, a card order marked
 * paid by hand, a COD order counted as revenue on the day it shipped, and the
 * same transfer confirmed twice from two screens.
 */
class OfflinePaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setting('cod_enabled', '1', 'boolean');
        $this->setting('cod_max_paise', '2500000');
        $this->setting('bank_transfer_enabled', '1', 'boolean');
        $this->setting('bank_account_details', "Technoware\nA/c 123456789\nIFSC HDFC0000123", 'text');
        $this->setting('upi_enabled', '1', 'boolean');
        $this->setting('upi_id', 'technoware@hdfcbank');
    }

    private function setting(string $key, ?string $value, string $type = 'string'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => 'payments', 'value' => $value, 'type' => $type]);
        Setting::flushCache();
    }

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'offline-pay@example.test'],
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

    private function product(ProductType $type = ProductType::Physical, int $price = 1180000): StoreProduct
    {
        return StoreProduct::create([
            'name' => 'A switch', 'slug' => 'sw-'.uniqid(),
            'type' => $type, 'status' => PublishStatus::Published,
            'price_paise' => $price, 'track_stock' => true, 'stock' => 20,
        ]);
    }

    /** Places an order through the real endpoints, basket and all. */
    private function checkout(StoreProduct $product, string $method, int $quantity = 1): TestResponse
    {
        /*
         * The token is issued by the API on the first add, never invented here.
         * Making one up produces a header pointing at no cart, the API quietly
         * opens a different basket, and the checkout reports "your basket is
         * empty" — which reads as a broken checkout rather than a broken test.
         */
        $token = $this
            ->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => $quantity])
            ->assertCreated()
            ->json('data.token');

        return $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/checkout', [
            'name' => 'Neil Basu',
            'email' => 'neil@example.test',
            'phone' => '9800000000',
            'payment_method' => $method,
            'address' => [
                'line1' => '1 Road', 'city' => 'Kolkata',
                'state' => 'West Bengal', 'pin' => '700001',
            ],
        ]);
    }

    // ------------------------------------------------------ what is offered

    public function test_the_basket_lists_only_the_methods_that_are_switched_on(): void
    {
        $this->setting('upi_enabled', '0', 'boolean');

        $methods = collect($this->getJson('/api/v1/cart')->assertOk()->json('data.payment_methods'))
            ->pluck('value');

        $this->assertContains('cod', $methods);
        $this->assertContains('bank_transfer', $methods);
        $this->assertNotContains('upi', $methods);
    }

    /**
     * Switched on is not the same as usable.
     *
     * A bank transfer with no account number is instructions nobody can follow,
     * and offering it is a checkout that fails after the address has been typed.
     */
    public function test_a_method_with_nothing_to_pay_into_is_not_offered(): void
    {
        $this->setting('bank_account_details', null, 'text');

        $methods = collect($this->getJson('/api/v1/cart')->json('data.payment_methods'))->pluck('value');

        $this->assertNotContains('bank_transfer', $methods);
        $this->assertFalse(PaymentMethod::BankTransfer->isAvailable());
        $this->assertNotNull(PaymentMethod::BankTransfer->unavailableReason());
    }

    /** The list carries no account numbers — those go out with the order. */
    public function test_the_checkout_list_never_publishes_the_bank_details(): void
    {
        $body = $this->getJson('/api/v1/cart')->getContent();

        $this->assertStringNotContainsString('123456789', $body);
        $this->assertStringNotContainsString('technoware@hdfcbank', $body);
    }

    // ------------------------------------------------------ cash on delivery

    /**
     * A COD order is not an abandoned basket, and must not look like one in the
     * queue — but it is also not paid.
     */
    public function test_cash_on_delivery_confirms_the_order_without_paying_it(): void
    {
        $response = $this->checkout($this->product(), 'cod')->assertCreated();

        $order = Order::where('order_number', $response->json('data.order_number'))->firstOrFail();

        $this->assertSame(OrderStatus::Confirmed, $order->status);
        $this->assertSame('cod', $order->payment_method);
        $this->assertNull($order->paid_at);
        $this->assertFalse($order->status->isPaid());
    }

    /**
     * The figure that would otherwise be wrong on the dashboard the day it
     * shipped: a COD order is revenue when the cash is banked, not before.
     */
    public function test_a_confirmed_cod_order_is_not_revenue(): void
    {
        $this->checkout($this->product(), 'cod')->assertCreated();

        $this->assertSame(0, Order::paid()->count());
        $this->assertSame(1, Order::count());
    }

    /** There is nothing for a courier to hand over. */
    public function test_cash_on_delivery_is_refused_for_a_licence(): void
    {
        $this->checkout($this->product(ProductType::Digital), 'cod')
            ->assertStatus(422)
            ->assertJsonValidationErrors('payment_method');
    }

    /** Cash on delivery is unsecured credit, and the shop says how much of it. */
    public function test_cash_on_delivery_is_refused_over_the_ceiling(): void
    {
        $this->setting('cod_max_paise', '1000000');

        $response = $this->checkout($this->product(ProductType::Physical, 1180000), 'cod')
            ->assertStatus(422);

        $this->assertStringContainsString('Cash on delivery is available up to', $response->json('errors.payment_method.0'));
    }

    public function test_no_ceiling_when_the_setting_is_zero(): void
    {
        $this->setting('cod_max_paise', '0');

        $this->checkout($this->product(ProductType::Physical, 99900000), 'cod')->assertCreated();
    }

    /** A method switched off between the page loading and the order being placed. */
    public function test_a_switched_off_method_is_refused_at_the_checkout(): void
    {
        $this->setting('cod_enabled', '0', 'boolean');

        $this->checkout($this->product(), 'cod')
            ->assertStatus(422)
            ->assertJsonValidationErrors('payment_method');
    }

    // ------------------------------------------------------ transfer and UPI

    public function test_a_bank_transfer_order_waits_for_the_money(): void
    {
        $response = $this->checkout($this->product(), 'bank_transfer')->assertCreated();
        $order = Order::where('order_number', $response->json('data.order_number'))->firstOrFail();

        $this->assertSame(OrderStatus::PendingPayment, $order->status);
        $this->assertNull($order->paid_at);
    }

    /** The instructions reach the person who ordered, and only them. */
    public function test_the_order_carries_the_instructions_for_its_own_method(): void
    {
        $response = $this->checkout($this->product(), 'bank_transfer')->assertCreated();
        $number = $response->json('data.order_number');
        $token = $response->json('meta.access_token');

        $body = $this->getJson("/api/v1/orders/{$number}?token={$token}")->assertOk();

        $body->assertJsonPath('data.payment_instructions.method', 'bank_transfer');
        $this->assertStringContainsString('123456789', $body->json('data.payment_instructions.bank_details'));
        $this->assertNull($body->json('data.payment_instructions.upi_id'));
    }

    /** Instructions for a payment already made are how somebody pays twice. */
    public function test_the_instructions_disappear_once_the_money_has_arrived(): void
    {
        $response = $this->checkout($this->product(), 'upi')->assertCreated();
        $number = $response->json('data.order_number');
        $token = $response->json('meta.access_token');

        $order = Order::where('order_number', $number)->firstOrFail();

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$number}/payments", [
                'amount_paise' => $order->total_paise,
                'reference' => 'UPI-123456789',
            ])->assertCreated();

        $this->getJson("/api/v1/orders/{$number}?token={$token}")
            ->assertOk()
            ->assertJsonPath('data.payment_instructions', null);
    }

    // ------------------------------------------------------ recording money

    public function test_recording_a_payment_makes_the_order_paid_and_names_who_said_so(): void
    {
        $response = $this->checkout($this->product(), 'bank_transfer')->assertCreated();
        $number = $response->json('data.order_number');
        $order = Order::where('order_number', $number)->firstOrFail();

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$number}/payments", [
                'amount_paise' => $order->total_paise,
                'reference' => 'UTR-778899',
            ])->assertCreated();

        $order->refresh();

        $this->assertNotNull($order->paid_at);
        $this->assertSame(OrderStatus::Paid, $order->status);
        $this->assertSame(1, Order::paid()->count());

        $payment = $order->payments()->firstOrFail();
        $this->assertSame('UTR-778899', $payment->reference);
        $this->assertSame($this->manager()->id, $payment->confirmed_by);
    }

    /**
     * The hole the transition rule exists to close, reopened by a different
     * door and shut again.
     */
    public function test_a_gateway_order_can_never_be_settled_by_hand(): void
    {
        /*
         * The gateway is configured here on purpose.
         *
         * The first cut of this test allowed itself to return early when the
         * checkout refused a gateway order for want of keys — so the refusal it
         * exists to prove was never reached, and reverting the guard in
         * `ManualPayment` left it passing. A test with a branch that skips its
         * own assertion is testing nothing, which is the same lesson the landing
         * page's `touch()` taught.
         */
        $this->setting('payment_gateway', 'razorpay');
        $this->setting('razorpay_key_id', 'rzp_test_key');
        $this->setting('razorpay_key_secret', 'secret');

        $response = $this->checkout($this->product(), 'gateway')->assertCreated();

        $number = $response->json('data.order_number');

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$number}/payments", [
                'amount_paise' => 1180000,
                'reference' => 'MADE-UP',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reference');
    }

    /** A reference is the only thing tying this to a line on a statement. */
    public function test_a_payment_without_a_reference_is_refused(): void
    {
        $response = $this->checkout($this->product(), 'bank_transfer')->assertCreated();
        $number = $response->json('data.order_number');

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$number}/payments", ['amount_paise' => 1180000])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reference');
    }

    /** Two people confirming the same transfer from two screens. */
    public function test_the_same_money_cannot_be_recorded_twice(): void
    {
        $response = $this->checkout($this->product(), 'bank_transfer')->assertCreated();
        $number = $response->json('data.order_number');
        $order = Order::where('order_number', $number)->firstOrFail();

        $body = ['amount_paise' => $order->total_paise, 'reference' => 'UTR-1'];

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$number}/payments", $body)->assertCreated();

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$number}/payments", $body)
            ->assertStatus(422);

        $this->assertSame(1, $order->payments()->count());
    }

    /**
     * A short payment is recorded and said, never silently accepted: the money
     * arrived and cannot be un-taken, but the figure will not reconcile.
     */
    public function test_a_short_payment_is_recorded_and_flagged_in_the_trail(): void
    {
        $response = $this->checkout($this->product(), 'bank_transfer')->assertCreated();
        $number = $response->json('data.order_number');
        $order = Order::where('order_number', $number)->firstOrFail();

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$number}/payments", [
                'amount_paise' => $order->total_paise - 100000,
                'reference' => 'UTR-SHORT',
            ])->assertCreated();

        $notes = $order->history()->pluck('note')->implode(' ');

        $this->assertStringContainsString('does not match the order total', $notes);
    }

    /** Cash banked after the parcel went out must not undo where the parcel is. */
    public function test_recording_cash_does_not_overwrite_the_fulfilment_status(): void
    {
        $response = $this->checkout($this->product(), 'cod')->assertCreated();
        $number = $response->json('data.order_number');
        $order = Order::where('order_number', $number)->firstOrFail();

        $order->moveTo(OrderStatus::Dispatched, 'Handed to the courier.');

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$number}/payments", [
                'amount_paise' => $order->total_paise,
                'reference' => 'CASH-RECEIPT-42',
            ])->assertCreated();

        $order->refresh();

        $this->assertSame(OrderStatus::Dispatched, $order->status);
        $this->assertNotNull($order->paid_at);
        $this->assertSame(1, Order::paid()->count());
    }

    /** It records colleagues' decisions about money, so it is not open to everyone. */
    public function test_a_content_manager_cannot_record_a_payment(): void
    {
        $response = $this->checkout($this->product(), 'bank_transfer')->assertCreated();
        $number = $response->json('data.order_number');

        $editor = User::firstOrCreate(
            ['email' => 'cm-offline@example.test'],
            ['name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true],
        );
        $editor->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        $this->actingAs($editor, 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$number}/payments", [
                'amount_paise' => 1180000, 'reference' => 'NOPE',
            ])
            ->assertForbidden();
    }
}
