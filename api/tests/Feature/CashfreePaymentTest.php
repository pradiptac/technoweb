<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\PaymentGateway;
use App\Enums\PaymentStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Store\Payments\CashfreeProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Cashfree, the second gateway (2026-09-18).
 *
 * The same shape as `PaymentTest` for Razorpay, with the three places
 * Cashfree differs each pinned: rupees on the wire from paise in the
 * database, the browser's return confirmed by asking Cashfree rather than
 * by a signature, and a webhook signed over `timestamp . body` with the
 * client secret. Every call to Cashfree is faked; nothing here reaches a
 * network.
 */
class CashfreePaymentTest extends TestCase
{
    use RefreshDatabase;

    private const APP_ID = 'TEST1234567890abcdef';

    private const SECRET = 'cfsk_test_secret_key';

    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            'payment_gateway' => 'cashfree',
            'cashfree_app_id' => self::APP_ID,
            'cashfree_secret_key' => self::SECRET,
            'cashfree_environment' => 'sandbox',
        ] as $key => $value) {
            Setting::updateOrCreate(['key' => $key], ['group' => 'payments', 'value' => $value, 'type' => 'string']);
        }

        Setting::flushCache();
    }

    private function order(int $quantity = 1): array
    {
        $product = StoreProduct::create([
            'name' => 'A switch',
            'slug' => 'a-switch-'.uniqid(),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
            'track_stock' => true,
            'stock' => 5,
        ]);

        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => $quantity])
            ->assertCreated()->json('data.token');

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

    private function webhookBody(Order $order, string $type = 'PAYMENT_SUCCESS_WEBHOOK', ?string $amount = null, string $paymentId = '1490004'): string
    {
        return json_encode([
            'type' => $type,
            'data' => [
                'order' => ['order_id' => $order->order_number, 'order_amount' => CashfreeProvider::rupees($order->total_paise), 'order_currency' => 'INR'],
                'payment' => [
                    'cf_payment_id' => $paymentId,
                    'payment_status' => $type === 'PAYMENT_SUCCESS_WEBHOOK' ? 'SUCCESS' : 'FAILED',
                    'payment_amount' => $amount ?? CashfreeProvider::rupees($order->total_paise),
                    'payment_group' => 'upi',
                    'payment_message' => $type === 'PAYMENT_SUCCESS_WEBHOOK' ? 'Transaction successful' : 'Declined by the bank',
                ],
            ],
        ]);
    }

    private function sendWebhook(Order $order, string $type = 'PAYMENT_SUCCESS_WEBHOOK', ?string $amount = null, string $secret = self::SECRET)
    {
        $body = $this->webhookBody($order, $type, $amount);
        $timestamp = (string) time();
        $signature = base64_encode(hash_hmac('sha256', $timestamp.$body, $secret, true));

        return $this->call('POST', '/api/v1/payments/cashfree/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_WEBHOOK_SIGNATURE' => $signature,
            'HTTP_X_WEBHOOK_TIMESTAMP' => $timestamp,
            'HTTP_X_WEBHOOK_VERSION' => '2023-08-01',
        ], $body);
    }

    public function test_money_crosses_to_rupees_and_back_without_a_float(): void
    {
        $this->assertSame('11800.00', CashfreeProvider::rupees(1180000));
        $this->assertSame('11799.99', CashfreeProvider::rupees(1179999));
        $this->assertSame('0.05', CashfreeProvider::rupees(5));
        $this->assertSame(1180000, CashfreeProvider::paise('11800.00'));
        $this->assertSame(1180000, CashfreeProvider::paise('11800'));
        // The case a double gets wrong: 11799.99 * 100 is 1179998.9999999998.
        $this->assertSame(1179999, CashfreeProvider::paise('11799.99'));
        $this->assertSame(1179990, CashfreeProvider::paise('11799.9'));
    }

    public function test_a_session_sends_rupees_and_never_the_secret(): void
    {
        Http::fake([
            'sandbox.cashfree.com/pg/orders' => Http::response([
                'cf_order_id' => '2149460581', 'order_id' => 'x', 'payment_session_id' => 'session_abc123', 'order_status' => 'ACTIVE',
            ], 200),
        ]);

        [$order, $access] = $this->order();

        $response = $this->postJson("/api/v1/orders/{$order->order_number}/pay", ['token' => $access])->assertOk();

        $this->assertSame('cashfree', $response->json('data.gateway'));
        $this->assertSame('session_abc123', $response->json('data.payment_session_id'));
        $this->assertSame('sandbox', $response->json('data.mode'));
        $this->assertSame($order->total_paise, $response->json('data.amount_paise'));
        $this->assertStringNotContainsString(self::SECRET, $response->getContent());

        Http::assertSent(fn ($request) => $request->hasHeader('x-client-id', self::APP_ID)
            && $request->hasHeader('x-client-secret', self::SECRET)
            && $request['order_id'] === $order->order_number
            && $request['order_amount'] === CashfreeProvider::rupees($order->total_paise)
            && $request['order_currency'] === 'INR'
            // Digits only, the country code stripped.
            && $request['customer_details']['customer_phone'] === '9876543210'
            // Back through the handler that trades the token for a cookie.
            && $request['order_meta']['return_url'] === $order->url('cashfree'));
    }

    public function test_production_keys_go_to_the_production_host(): void
    {
        Setting::updateOrCreate(['key' => 'cashfree_environment'], ['group' => 'payments', 'value' => 'production', 'type' => 'string']);
        Setting::flushCache();
        Http::fake(['api.cashfree.com/pg/orders' => Http::response(['cf_order_id' => '1', 'payment_session_id' => 's'], 200)]);

        [$order, $access] = $this->order();
        $this->postJson("/api/v1/orders/{$order->order_number}/pay", ['token' => $access])->assertOk()->assertJsonPath('data.mode', 'production');

        Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://api.cashfree.com/'));
    }

    public function test_the_browsers_word_settles_nothing_until_cashfree_confirms_it(): void
    {
        Http::fake(['sandbox.cashfree.com/pg/orders/*/payments' => Http::response([], 200)]);

        [$order, $access] = $this->order();

        $this->postJson("/api/v1/orders/{$order->order_number}/verify", ['token' => $access, 'gateway' => 'cashfree', 'paid' => 'yes'])
            ->assertStatus(422);

        $this->assertSame(OrderStatus::PendingPayment, $order->fresh()->status);
        $this->assertSame(0, Payment::count());
    }

    public function test_a_return_confirmed_by_cashfree_marks_the_order_paid(): void
    {
        [$order, $access] = $this->order();

        Http::fake(['sandbox.cashfree.com/pg/orders/*/payments' => Http::response([
            ['cf_payment_id' => 1490004, 'payment_status' => 'SUCCESS', 'payment_amount' => CashfreeProvider::rupees($order->total_paise), 'payment_group' => 'upi'],
        ], 200)]);

        $this->postJson("/api/v1/orders/{$order->order_number}/verify", ['token' => $access, 'gateway' => 'cashfree'])
            ->assertOk()
            ->assertJsonPath('data.status', OrderStatus::Paid->value);

        $payment = Payment::firstOrFail();
        $this->assertSame('cashfree', $payment->gateway);
        $this->assertSame('1490004', $payment->gateway_payment_id);
        $this->assertSame(PaymentStatus::Paid, $payment->status);
    }

    public function test_a_webhook_with_a_bad_signature_changes_nothing_and_answers_200(): void
    {
        [$order] = $this->order();

        $this->sendWebhook($order, secret: 'not-the-secret')->assertOk();

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
        $this->assertSame('upi', $order->payments()->first()->method);
    }

    public function test_a_webhook_delivered_three_times_settles_once(): void
    {
        [$order] = $this->order(2);

        $this->sendWebhook($order)->assertOk();
        $this->sendWebhook($order)->assertOk();
        $this->sendWebhook($order)->assertOk();

        $this->assertSame(1, Payment::count());
        $this->assertSame(3, $order->items->first()->product->fresh()->stock);
    }

    public function test_a_payment_for_the_wrong_amount_does_not_settle_the_order(): void
    {
        [$order] = $this->order();

        $this->sendWebhook($order, amount: '1.00')->assertOk();

        $this->assertSame(OrderStatus::PendingPayment, $order->fresh()->status);
        $this->assertSame(PaymentStatus::Failed, Payment::firstOrFail()->status);
    }

    public function test_a_dropped_payment_is_recorded_as_failed_without_touching_the_order(): void
    {
        [$order] = $this->order();

        $this->sendWebhook($order, type: 'PAYMENT_USER_DROPPED_WEBHOOK')->assertOk();

        $this->assertSame(OrderStatus::PendingPayment, $order->fresh()->status);
        $this->assertSame(PaymentStatus::Failed, Payment::firstOrFail()->status);
    }

    public function test_the_console_is_told_cashfree_is_ready_and_paytm_is_not(): void
    {
        $gateways = collect(PaymentGateway::options())->keyBy('value');

        $this->assertTrue($gateways['cashfree']['implemented']);
        $this->assertTrue($gateways['cashfree']['configured']);
        $this->assertSame(['cashfree_app_id', 'cashfree_secret_key', 'cashfree_environment'], array_column($gateways['cashfree']['fields'], 'key'));
        $this->assertFalse($gateways['paytm']['implemented']);
    }
}
