<?php

namespace Tests\Feature;

use App\Enums\DigitalCodeStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\DigitalCode;
use App\Models\Order;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Store\DigitalFulfilment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Activation codes: assigned once, released only after payment, and handed over
 * the moment the money lands unless the shop is set to do it by hand.
 *
 * The rule everything here protects is the one the brief states twice:
 * **duplicate activation-code assignment must be impossible.** Not unlikely —
 * impossible, which means a database constraint rather than care at the call
 * site.
 */
class DigitalCodeTest extends TestCase
{
    use RefreshDatabase;

    private const WEBHOOK_SECRET = 'test-webhook-secret';

    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            'payment_gateway' => 'razorpay',
            'razorpay_key_id' => 'rzp_test_abc',
            'razorpay_key_secret' => 'test-key-secret',
            'razorpay_webhook_secret' => self::WEBHOOK_SECRET,
        ] as $key => $value) {
            Setting::updateOrCreate(['key' => $key], ['group' => 'payments', 'value' => $value, 'type' => 'string']);
        }

        Setting::updateOrCreate(
            ['key' => 'digital_auto_fulfil'],
            ['group' => 'store', 'value' => '1', 'type' => 'boolean'],
        );

        Setting::flushCache();
    }

    private function licence(int $codes = 3): StoreProduct
    {
        $product = StoreProduct::create([
            'name' => 'Endpoint Security, 1 year',
            'slug' => 'endpoint-security-'.uniqid(),
            'type' => ProductType::Digital,
            'status' => PublishStatus::Published,
            'price_paise' => 236000,
            'track_stock' => false,
            'stock' => 0,
        ]);

        // `range(1, 0)` counts *down* in PHP and yields [1, 0] — so asking
        // this helper for no codes quietly created two, and three tests about
        // running out were passing against a product that had not.
        if ($codes > 0) {
            DigitalFulfilment::import(
                $product->id,
                array_map(fn ($n) => "KEY-{$product->id}-{$n}", range(1, $codes)),
            );
        }

        return $product;
    }

    /** @return array{0: Order, 1: string} */
    private function order(StoreProduct $product, int $quantity = 1): array
    {
        $token = $this->postJson('/api/v1/cart/items', [
            'product_id' => $product->id, 'quantity' => $quantity,
        ])->assertCreated()->json('data.token');

        $created = $this->withHeaders(['X-Cart-Token' => $token])
            ->postJson('/api/v1/checkout', [
                'name' => 'Neil Basu',
                'email' => 'neil@example.test',
                'phone' => '+91 98765 43210',
            ])
            ->assertCreated();

        return [
            Order::where('order_number', $created->json('data.order_number'))->firstOrFail(),
            $created->json('meta.access_token'),
        ];
    }

    private function pay(Order $order, string $paymentId = 'pay_test123')
    {
        $body = json_encode([
            'event' => 'payment.captured',
            'payload' => ['payment' => ['entity' => [
                'id' => $paymentId,
                'order_id' => 'order_test123',
                'amount' => $order->total_paise,
                'method' => 'card',
                'notes' => ['order_number' => $order->order_number],
            ]]],
        ]);

        return $this->call('POST', '/api/v1/payments/razorpay/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_RAZORPAY_SIGNATURE' => hash_hmac('sha256', $body, self::WEBHOOK_SECRET),
        ], $body);
    }

    // ------------------------------------------------------ the inventory

    /**
     * The code is encrypted at rest.
     *
     * A database read, a backup on somebody's laptop or a leaked dump is
     * otherwise a pile of licences somebody can sell. Asserted against the raw
     * column rather than the model, because the model would decrypt it and
     * prove nothing.
     */
    public function test_a_code_is_encrypted_in_the_database(): void
    {
        $product = $this->licence(1);

        $raw = DB::table('digital_codes')->value('code');

        $this->assertNotSame("KEY-{$product->id}-1", $raw);
        $this->assertStringNotContainsString('KEY-', (string) $raw);

        // And it still reads back through the model.
        $this->assertSame("KEY-{$product->id}-1", DigitalCode::first()->code);
    }

    /**
     * A duplicate import is reported, not silently dropped.
     *
     * Pasting the same block twice is an ordinary mistake, and ignoring the
     * second paste hides that the count did not rise by what somebody expected.
     * The fingerprint is what recognises it — an encrypted column differs every
     * time, so a unique index on the ciphertext would catch nothing.
     */
    public function test_a_duplicate_code_is_reported(): void
    {
        $product = $this->licence(0);

        $first = DigitalFulfilment::import($product->id, ['AAA-111', 'BBB-222']);
        $second = DigitalFulfilment::import($product->id, ['AAA-111', 'CCC-333']);

        $this->assertSame(['added' => 2, 'duplicates' => 0], $first);
        $this->assertSame(['added' => 1, 'duplicates' => 1], $second);
        $this->assertSame(3, DigitalCode::count());
    }

    // ------------------------------------------------------ fulfilment

    public function test_paying_hands_over_a_code_at_once(): void
    {
        $product = $this->licence(3);
        [$order] = $this->order($product);

        $this->pay($order)->assertOk();

        $code = DigitalCode::whereNotNull('order_item_id')->firstOrFail();

        $this->assertSame(DigitalCodeStatus::Delivered, $code->status);
        $this->assertSame($order->id, $code->order_id);
        $this->assertSame(2, DigitalCode::available()->count());
    }

    /** One code per unit, not per line: three licences means three keys. */
    public function test_a_quantity_of_three_takes_three_codes(): void
    {
        $product = $this->licence(5);
        [$order] = $this->order($product, 3);

        $this->pay($order)->assertOk();

        $this->assertSame(3, DigitalCode::whereNotNull('order_item_id')->count());
        $this->assertSame(2, DigitalCode::available()->count());
    }

    /**
     * The setting decides, and both answers are real.
     *
     * Manual is what a business wants while it is watching a new gateway
     * settle, or while codes are bought in per order.
     */
    public function test_manual_fulfilment_leaves_the_code_alone(): void
    {
        Setting::where('key', 'digital_auto_fulfil')->update(['value' => '0']);
        Setting::flushCache();

        $product = $this->licence(3);
        [$order] = $this->order($product);

        $this->pay($order)->assertOk();

        $this->assertSame(OrderStatus::Paid, $order->fresh()->status);
        $this->assertSame(3, DigitalCode::available()->count(), 'a code was issued with fulfilment set to manual');
        $this->assertTrue(DigitalFulfilment::isOutstanding($order->fresh()));

        // And a person can then do it, which is the point of the setting.
        $result = DigitalFulfilment::fulfil($order->fresh(), force: true);

        $this->assertSame(1, $result['assigned']);
    }

    /**
     * The same webhook three times issues one code.
     *
     * This is the failure the brief calls out by name. Idempotency here is the
     * unique index on `order_item_id` plus the conditional claim — not care at
     * the call site, which is exactly what does not hold when two deliveries
     * race.
     */
    public function test_a_retried_webhook_issues_one_code(): void
    {
        $product = $this->licence(3);
        [$order] = $this->order($product);

        $this->pay($order)->assertOk();
        $this->pay($order)->assertOk();
        $this->pay($order)->assertOk();

        $this->assertSame(1, DigitalCode::whereNotNull('order_item_id')->count());
        $this->assertSame(2, DigitalCode::available()->count());
    }

    /**
     * Nothing is issued for money that has not arrived.
     *
     * The one rule in the module worth no argument at all.
     */
    public function test_nothing_is_issued_before_payment(): void
    {
        $product = $this->licence(3);
        [$order] = $this->order($product);

        DigitalFulfilment::fulfil($order, force: true);

        $this->assertSame(3, DigitalCode::available()->count());
    }

    /**
     * Running out does not fail the payment.
     *
     * The order is paid and the money cannot be un-taken, so the line waits for
     * a person and the reason goes into the order's own trail. Failing here
     * would leave somebody charged for a licence the shop pretends it never
     * sold.
     */
    public function test_running_out_leaves_a_paid_order_and_a_note(): void
    {
        $product = $this->licence(0);
        [$order] = $this->order($product);

        $this->pay($order)->assertOk();

        $order->refresh();

        $this->assertSame(OrderStatus::Paid, $order->status);
        $this->assertTrue(DigitalFulfilment::isOutstanding($order));

        $notes = $order->history()->pluck('note')->filter()->implode(' ');
        $this->assertStringContainsString('no activation code was available', $notes);
    }

    // ------------------------------------------------------ revealing it

    /**
     * A code is never in an ordinary read of the order.
     *
     * The page is addressed by a link somebody may leave open on a shared
     * screen. It says a code exists; asking for it is a separate, recorded act.
     */
    public function test_an_order_read_says_a_code_exists_and_never_shows_it(): void
    {
        $product = $this->licence(3);
        [$order, $access] = $this->order($product);

        $this->pay($order)->assertOk();

        $response = $this->getJson("/api/v1/orders/{$order->order_number}?token={$access}")->assertOk();

        $this->assertTrue($response->json('data.items.0.has_codes'));
        $this->assertStringNotContainsString('KEY-', $response->getContent());
    }

    public function test_revealing_a_code_returns_it_and_records_the_reveal(): void
    {
        $product = $this->licence(3);
        [$order, $access] = $this->order($product);

        $this->pay($order)->assertOk();

        $item = $order->items()->firstOrFail();

        $response = $this->postJson(
            "/api/v1/orders/{$order->order_number}/items/{$item->id}/reveal",
            ['token' => $access],
        )->assertOk();

        $this->assertStringStartsWith('KEY-', $response->json('data.0.code'));

        $code = DigitalCode::whereNotNull('order_item_id')->firstOrFail();

        $this->assertSame(1, $code->reveal_count);
        $this->assertNotNull($code->revealed_at);

        // Counted rather than merely stamped: one look and ten are different
        // facts when somebody says they never received it.
        $this->postJson("/api/v1/orders/{$order->order_number}/items/{$item->id}/reveal", ['token' => $access])
            ->assertOk();

        $this->assertSame(2, $code->fresh()->reveal_count);
    }

    public function test_a_wrong_token_cannot_reveal_a_code(): void
    {
        $product = $this->licence(3);
        [$order] = $this->order($product);

        $this->pay($order)->assertOk();

        $item = $order->items()->firstOrFail();

        $this->postJson(
            "/api/v1/orders/{$order->order_number}/items/{$item->id}/reveal",
            ['token' => str_repeat('0', 64)],
        )->assertNotFound();
    }

    /** A code released before payment is a licence given away. */
    public function test_an_unpaid_order_cannot_reveal_anything(): void
    {
        $product = $this->licence(3);
        [$order, $access] = $this->order($product);

        $item = $order->items()->firstOrFail();

        $this->postJson(
            "/api/v1/orders/{$order->order_number}/items/{$item->id}/reveal",
            ['token' => $access],
        )->assertStatus(422);
    }

    /**
     * A line belonging to somebody else's order is not found.
     *
     * Scoped to the order the token resolves to, the same rule the basket
     * follows — and a 404 rather than a 403, because a 403 confirms it exists.
     */
    public function test_a_line_from_another_order_cannot_be_revealed(): void
    {
        $product = $this->licence(3);

        [$mine, $access] = $this->order($product);
        [$theirs] = $this->order($product);

        $this->pay($mine, 'pay_mine')->assertOk();
        $this->pay($theirs, 'pay_theirs')->assertOk();

        $strayItem = $theirs->items()->firstOrFail();

        $this->postJson(
            "/api/v1/orders/{$mine->order_number}/items/{$strayItem->id}/reveal",
            ['token' => $access],
        )->assertNotFound();
    }

    /**
     * Paid, digital, and nothing to hand over yet is not an error.
     *
     * The customer has done nothing wrong and somebody is already dealing with
     * it, so it says so rather than answering 500 or pretending there is a code.
     */
    public function test_waiting_for_a_code_says_so(): void
    {
        $product = $this->licence(0);
        [$order, $access] = $this->order($product);

        $this->pay($order)->assertOk();

        $item = $order->items()->firstOrFail();

        $this->postJson(
            "/api/v1/orders/{$order->order_number}/items/{$item->id}/reveal",
            ['token' => $access],
        )->assertStatus(202);
    }
}
