<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Setting;
use App\Models\StoreProduct;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Taking the money, against a faked Razorpay.
 *
 * The signatures are computed here with the same secrets the application is
 * given, so what is being tested is the real verification and not a stub of it
 * — the same way `OutgoingMailTest` fakes Google's token endpoint and then
 * exercises the actual exchange.
 *
 * Two rules the brief states and every test here is a way of asking about:
 * **payment is verified server-side**, and **the frontend cannot determine
 * payment success.**
 */
class PaymentTest extends TestCase
{
    use RefreshDatabase;

    private const KEY_ID = 'rzp_test_abc123';

    private const KEY_SECRET = 'test-key-secret';

    private const WEBHOOK_SECRET = 'test-webhook-secret';

    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            'payment_gateway' => 'razorpay',
            'razorpay_key_id' => self::KEY_ID,
            'razorpay_key_secret' => self::KEY_SECRET,
            'razorpay_webhook_secret' => self::WEBHOOK_SECRET,
        ] as $key => $value) {
            Setting::updateOrCreate(['key' => $key], ['group' => 'payments', 'value' => $value, 'type' => 'string']);
        }

        Setting::flushCache();
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
            'stock' => 5,
        ], $attributes));
    }

    /** @return array{0: Order, 1: string} the order and its access token */
    private function order(array $productAttributes = [], int $quantity = 1): array
    {
        $product = $this->product($productAttributes);

        $token = $this->postJson('/api/v1/cart/items', [
            'product_id' => $product->id, 'quantity' => $quantity,
        ])->assertCreated()->json('data.token');

        $created = $this->withHeaders(['X-Cart-Token' => $token])
            ->postJson('/api/v1/checkout', [
                'name' => 'Neil Basu',
                'email' => 'neil@example.test',
                'phone' => '+91 98765 43210',
                'address' => ['line1' => '12 Example Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
            ])
            ->assertCreated();

        return [
            Order::where('order_number', $created->json('data.order_number'))->firstOrFail(),
            $created->json('meta.access_token'),
        ];
    }

    // ------------------------------------------------------ opening a payment

    public function test_a_session_sends_paise_and_never_the_secret(): void
    {
        Http::fake([
            'api.razorpay.com/*' => Http::response(['id' => 'order_test123', 'amount' => 1180000], 200),
        ]);

        [$order, $access] = $this->order();

        $response = $this->postJson("/api/v1/orders/{$order->order_number}/pay", ['token' => $access])
            ->assertOk();

        $this->assertSame('order_test123', $response->json('data.gateway_order_id'));
        $this->assertSame(self::KEY_ID, $response->json('data.key_id'));
        $this->assertSame(1180000, $response->json('data.amount_paise'));

        // The browser is handed the key id, which is public by design, and
        // never the secret.
        $this->assertStringNotContainsString(self::KEY_SECRET, $response->getContent());

        // Paise on the wire, with no conversion anywhere -- which is why there
        // is nowhere for a rounding error to live.
        Http::assertSent(fn ($request) => $request['amount'] === 1180000 && $request['currency'] === 'INR');
    }

    public function test_a_session_needs_the_orders_token(): void
    {
        [$order] = $this->order();

        $this->postJson("/api/v1/orders/{$order->order_number}/pay", ['token' => str_repeat('0', 64)])
            ->assertNotFound();
    }

    /**
     * A shop with no keys says so rather than throwing.
     *
     * "We cannot take payment online at the moment, please call us" is a real
     * answer; a 500 is not.
     */
    public function test_an_unconfigured_shop_says_so(): void
    {
        Setting::where('key', 'razorpay_key_secret')->update(['value' => null]);
        Setting::flushCache();

        [$order, $access] = $this->order();

        $this->postJson("/api/v1/orders/{$order->order_number}/pay", ['token' => $access])
            ->assertStatus(503);
    }

    // ------------------------------------------------------ the browser's word

    /**
     * The single most important test in the module.
     *
     * "Payment successful" from a browser is a string somebody sent. Without
     * the signature check, this endpoint gives the shop away.
     */
    public function test_an_unsigned_success_is_refused(): void
    {
        [$order, $access] = $this->order();

        $this->postJson("/api/v1/orders/{$order->order_number}/verify", [
            'token' => $access,
            'razorpay_payment_id' => 'pay_forged',
            'razorpay_order_id' => 'order_forged',
            'razorpay_signature' => 'not-a-real-signature',
        ])->assertStatus(422);

        $this->assertSame(OrderStatus::PendingPayment, $order->fresh()->status);
        $this->assertSame(0, Payment::count());
    }

    public function test_a_signed_return_marks_the_order_paid(): void
    {
        [$order, $access] = $this->order();

        $payload = $this->signedReturn($order->order_number);

        $this->postJson("/api/v1/orders/{$order->order_number}/verify", ['token' => $access] + $payload)
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');

        $order->refresh();

        $this->assertSame(OrderStatus::Paid, $order->status);
        $this->assertNotNull($order->paid_at);
    }

    // ------------------------------------------------------ the webhook

    public function test_a_webhook_with_a_bad_signature_changes_nothing_and_answers_200(): void
    {
        [$order] = $this->order();

        /*
         * 200 on purpose. A gateway reads anything else as "try again", so
         * refusing loudly turns one delivery into a retry storm — and a bad
         * signature retried is still a bad signature.
         */
        $this->withHeaders(['X-Razorpay-Signature' => 'wrong'])
            ->postJson('/api/v1/payments/razorpay/webhook', $this->webhookBody($order->order_number))
            ->assertOk();

        $this->assertSame(OrderStatus::PendingPayment, $order->fresh()->status);
        $this->assertSame(0, Payment::count());
    }

    public function test_a_signed_webhook_settles_the_order(): void
    {
        [$order] = $this->order();

        $this->sendWebhook($order)->assertOk();

        $order->refresh();

        $this->assertSame(OrderStatus::Paid, $order->status);
        $this->assertSame(PaymentStatus::Paid, $order->payments()->first()->status);
    }

    /**
     * The same success three times is one paid order.
     *
     * Gateways retry — documented behaviour, not an edge case. Without the
     * unique index on `gateway_payment_id` the second delivery marks the order
     * paid again, takes the stock again and, once digital codes exist, issues a
     * second activation code.
     */
    public function test_a_webhook_delivered_three_times_settles_once(): void
    {
        [$order] = $this->order(['stock' => 5], 2);

        $this->sendWebhook($order)->assertOk();
        $this->sendWebhook($order)->assertOk();
        $this->sendWebhook($order)->assertOk();

        $this->assertSame(1, Payment::count(), 'the retries wrote more than one payment');

        // Stock taken once: five minus two, not five minus six.
        $this->assertSame(3, $order->items->first()->product->fresh()->stock);

        // And one line in the trail for the payment, not three.
        $this->assertSame(1, $order->history()->where('to_status', OrderStatus::Paid->value)->count());
    }

    /**
     * A payment for the wrong amount is recorded and does not settle anything.
     *
     * Either a misconfiguration or somebody replaying a cheaper order's
     * callback. It must not mark the order paid — and it must be *recorded*,
     * because money that arrived and cannot be matched is exactly what somebody
     * needs to see.
     */
    public function test_a_payment_for_the_wrong_amount_does_not_settle_the_order(): void
    {
        [$order] = $this->order();

        $this->sendWebhook($order, amount: 100)->assertOk();

        $this->assertSame(OrderStatus::PendingPayment, $order->fresh()->status);
        $this->assertSame(PaymentStatus::Failed, Payment::firstOrFail()->status);
    }

    public function test_a_failed_payment_is_recorded_without_touching_the_order(): void
    {
        [$order] = $this->order();

        $this->sendWebhook($order, event: 'payment.failed')->assertOk();

        $this->assertSame(OrderStatus::PendingPayment, $order->fresh()->status);
        $this->assertSame(PaymentStatus::Failed, Payment::firstOrFail()->status);
    }

    public function test_a_webhook_for_an_unknown_order_is_ignored_quietly(): void
    {
        $body = json_encode($this->webhookBody('ORD-2026-99999'));

        $this->call('POST', '/api/v1/payments/razorpay/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_RAZORPAY_SIGNATURE' => hash_hmac('sha256', $body, self::WEBHOOK_SECRET),
        ], $body)->assertOk();

        $this->assertSame(0, Payment::count());
    }

    // ------------------------------------------------------ what follows payment

    public function test_paying_takes_the_stock(): void
    {
        [$order] = $this->order(['stock' => 5], 3);

        $this->sendWebhook($order)->assertOk();

        $this->assertSame(2, $order->items->first()->product->fresh()->stock);
    }

    public function test_paying_creates_the_portal_account(): void
    {
        [$order] = $this->order();

        $this->assertNull($order->customer_id);

        $this->sendWebhook($order)->assertOk();

        $customer = Customer::where('email', 'neil@example.test')->firstOrFail();

        $this->assertSame(CustomerStatus::Active, $customer->status);
        $this->assertSame($customer->id, $order->fresh()->customer_id);
    }

    /**
     * A browser and a webhook reporting the same success is the ordinary case.
     *
     * Both go through the same settlement, so it produces one paid order rather
     * than two — which is what makes the browser's report a convenience rather
     * than a second source of truth.
     */
    public function test_a_browser_and_a_webhook_reporting_the_same_payment_settle_once(): void
    {
        [$order, $access] = $this->order();

        $payload = $this->signedReturn($order->order_number);

        $this->postJson("/api/v1/orders/{$order->order_number}/verify", ['token' => $access] + $payload)->assertOk();
        $this->sendWebhook($order, paymentId: $payload['razorpay_payment_id'])->assertOk();

        $this->assertSame(1, Payment::count());
        $this->assertSame(OrderStatus::Paid, $order->fresh()->status);
    }

    // ------------------------------------------------------ helpers

    /** @return array<string, string> */
    private function signedReturn(string $orderNumber, string $paymentId = 'pay_test123'): array
    {
        $gatewayOrderId = 'order_test123';

        return [
            'razorpay_payment_id' => $paymentId,
            'razorpay_order_id' => $gatewayOrderId,
            'razorpay_signature' => hash_hmac('sha256', $gatewayOrderId.'|'.$paymentId, self::KEY_SECRET),
        ];
    }

    /** @return array<string, mixed> */
    private function webhookBody(
        string $orderNumber,
        string $event = 'payment.captured',
        int $amount = 1180000,
        string $paymentId = 'pay_test123',
    ): array {
        return [
            'event' => $event,
            'payload' => ['payment' => ['entity' => [
                'id' => $paymentId,
                'order_id' => 'order_test123',
                'amount' => $amount,
                'method' => 'card',
                'notes' => ['order_number' => $orderNumber],
            ]]],
        ];
    }

    /**
     * A webhook signed the way Razorpay signs one: HMAC over the **raw body**.
     *
     * Re-encoding the decoded array would produce a different string and
     * therefore a different HMAC, which is the classic way this verification is
     * written and quietly never matches. The test signs the exact bytes it
     * sends, so it would catch that.
     */
    private function sendWebhook(
        Order $order,
        string $event = 'payment.captured',
        ?int $amount = null,
        string $paymentId = 'pay_test123',
    ) {
        // The amount defaults to the order's own total, because that is what a
        // real gateway sends. Passing a different one is how the
        // wrong-amount test asks its question, and defaulting to a constant
        // made every multi-item test ask it by accident.
        $body = json_encode($this->webhookBody(
            $order->order_number, $event, $amount ?? $order->total_paise, $paymentId,
        ));

        return $this->call(
            'POST',
            '/api/v1/payments/razorpay/webhook',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_X_RAZORPAY_SIGNATURE' => hash_hmac('sha256', $body, self::WEBHOOK_SECRET),
            ],
            $body,
        );
    }
}
