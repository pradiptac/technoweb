<?php

namespace Tests\Feature;

use App\Enums\PaymentMethod;
use App\Enums\PublishStatus;
use App\Models\Order;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Notifications\OrderPaid;
use App\Notifications\OrderPlaced;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * The sales order, and the second half that follows the payment method.
 *
 * It used to say "nothing has been charged" with a Pay button to every order
 * — right for a card somebody abandoned, wrong for the customer who had just
 * chosen to pay the courier, and useless to the one who needed our account
 * number. What is pinned here is the thing each method must and must not
 * say, read off the rendered email rather than off the class.
 */
class OrderPlacedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            ['cod_enabled', '1', 'boolean'], ['cod_max_paise', '2500000', 'string'],
            ['bank_transfer_enabled', '1', 'boolean'],
            ['bank_account_details', "Technoware Pvt Ltd\nA/c 123456789\nIFSC HDFC0000123", 'text'],
            ['upi_enabled', '1', 'boolean'], ['upi_id', 'technoware@hdfcbank', 'string'],
        ] as [$key, $value, $type]) {
            Setting::updateOrCreate(['key' => $key], ['group' => 'payments', 'value' => $value, 'type' => $type]);
        }
        Setting::flushCache();
    }

    private function order(PaymentMethod $method): Order
    {
        $order = Order::create([
            // Unique per call: the "every method" test builds four.
            'order_number' => 'TWO-2026-05'.str_pad((string) (Order::count() + 1), 2, '0', STR_PAD_LEFT),
            'access_token' => bin2hex(random_bytes(32)),
            'status' => $method->fulfilsBeforePayment() ? 'confirmed' : 'pending_payment',
            'payment_method' => $method->value,
            'customer_name' => 'Neil Basu', 'customer_email' => 'neil@example.test', 'customer_phone' => '9800000000',
            'billing_address' => ['line1' => '1 Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001', 'country' => 'India'],
            'shipping_address' => ['line1' => '1 Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001', 'country' => 'India'],
            'subtotal_paise' => 1180000, 'discount_paise' => 0, 'taxable_paise' => 1000000, 'gst_paise' => 180000, 'total_paise' => 1180000,
            'placed_at' => now(),
        ]);

        $order->items()->create([
            'name' => 'Aruba 2930F 24G', 'variation_name' => null, 'sku' => 'JL259A', 'type' => 'physical',
            'quantity' => 2, 'unit_price_paise' => 490000, 'line_total_paise' => 980000, 'returnable' => true,
        ]);
        $order->items()->create([
            'name' => 'Installation', 'variation_name' => 'Half day', 'sku' => null, 'type' => 'service',
            'quantity' => 1, 'unit_price_paise' => 200000, 'line_total_paise' => 200000, 'returnable' => false,
        ]);

        return $order->fresh();
    }

    private function render(Order $order): string
    {
        return (string) (new OrderPlaced($order))->toMail(new AnonymousNotifiable)->render();
    }

    private function subject(Order $order): string
    {
        return (new OrderPlaced($order))->toMail(new AnonymousNotifiable)->subject;
    }

    /** Every method: it is an itemised order, not a total. */
    public function test_every_line_is_listed_whatever_the_method(): void
    {
        foreach (PaymentMethod::cases() as $method) {
            $html = $this->render($this->order($method));

            $this->assertStringContainsString('2 x Aruba 2930F 24G', $html, $method->value);
            $this->assertStringContainsString('1 x Installation (Half day)', $html, $method->value);
            $this->assertStringContainsString('₹11,800', $html, $method->value);
            $this->assertStringContainsString('/order/TWO-2026-05', $html, $method->value);
        }
    }

    public function test_a_gateway_order_asks_to_be_paid(): void
    {
        $order = $this->order(PaymentMethod::Gateway);

        $this->assertStringEndsWith('payment not yet made', $this->subject($order));
        $html = $this->render($order);
        $this->assertStringContainsString('Nothing has been charged yet', $html);
        $this->assertStringContainsString('Pay for this order', $html);
        $this->assertStringNotContainsString('IFSC', $html);
    }

    /**
     * The case that was wrong. A COD order is confirmed, not pending, and the
     * customer has chosen to pay the courier — telling them nothing has been
     * charged and offering a Pay button contradicts the choice they just made.
     */
    public function test_a_cash_on_delivery_order_is_confirmed_and_does_not_ask_for_payment(): void
    {
        $order = $this->order(PaymentMethod::Cod);

        $this->assertStringEndsWith('confirmed, pay on delivery', $this->subject($order));
        $html = $this->render($order);
        $this->assertStringContainsString('Pay when it arrives', $html);
        $this->assertStringContainsString('Cash on delivery', $html);
        $this->assertStringNotContainsString('Pay for this order', $html);
        $this->assertStringNotContainsString('Nothing has been charged yet', $html);
        $this->assertStringContainsString('View your order', $html);
    }

    /** The account details, verbatim from the setting, one line each. */
    public function test_a_bank_transfer_order_carries_the_account_details_and_the_reference(): void
    {
        $order = $this->order(PaymentMethod::BankTransfer);

        $this->assertStringEndsWith('awaiting your transfer', $this->subject($order));
        $html = $this->render($order);
        $this->assertStringContainsString('Transfer the amount to this account', $html);
        $this->assertStringContainsString('A/c 123456789', $html);
        $this->assertStringContainsString('IFSC HDFC0000123', $html);
        $this->assertStringContainsString($order->order_number.'</strong> as the reference', $html);
        $this->assertStringNotContainsString('Pay for this order', $html);
    }

    public function test_a_upi_order_carries_the_id_and_the_code_only_when_there_is_one(): void
    {
        $order = $this->order(PaymentMethod::Upi);

        $this->assertStringEndsWith('awaiting your UPI payment', $this->subject($order));
        $html = $this->render($order);
        $this->assertStringContainsString('technoware@hdfcbank', $html);
        $this->assertStringNotContainsString('QR code', $html, 'no upi_qr_path, so no link to nothing');

        Setting::updateOrCreate(['key' => 'upi_qr_path'], ['group' => 'payments', 'value' => 'media/upi.png', 'type' => 'string']);
        Setting::flushCache();

        $this->assertStringContainsString('Open the UPI QR code', $this->render($order));
    }

    /**
     * The order page and the email read one array, so they cannot disagree
     * about an account number. Asserted by rendering both from the same row.
     */
    public function test_the_email_says_what_the_order_page_says(): void
    {
        $order = $this->order(PaymentMethod::BankTransfer);

        $page = $this->getJson("/api/v1/orders/{$order->order_number}?token={$order->access_token}")
            ->assertOk()
            ->json('data.payment_instructions');

        $html = $this->render($order);
        $this->assertStringContainsString($page['heading'], $html);
        $this->assertStringContainsString($page['body'], $html);
    }

    /**
     * Through the real path — the wiring, not the mechanism.
     */
    public function test_a_checkout_sends_the_sales_order_with_its_lines(): void
    {
        Notification::fake();

        $product = StoreProduct::create([
            'name' => 'A switch', 'slug' => 'a-switch', 'status' => PublishStatus::Published,
            'price_paise' => 1180000, 'track_stock' => true, 'stock' => 20,
        ]);
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])
            ->assertCreated()->json('data.token');

        $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/checkout', [
            'name' => 'Neil Basu', 'email' => 'neil@example.test', 'phone' => '9800000000',
            'payment_method' => 'cod',
            'address' => ['line1' => '1 Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
        ])->assertCreated();

        Notification::assertSentOnDemand(OrderPlaced::class, function (OrderPlaced $n, $channels, $notifiable) {
            $html = (string) $n->toMail($notifiable)->render();

            return $notifiable->routes['mail'] === 'neil@example.test'
                && str_contains($html, '1 x A switch')
                && str_contains($html, 'Pay when it arrives');
        });
    }

    /** The receipt lists its lines through the same helper, and still does. */
    public function test_the_receipt_still_lists_its_lines(): void
    {
        $html = (string) (new OrderPaid($this->order(PaymentMethod::Gateway)))->toMail(new AnonymousNotifiable)->render();

        $this->assertStringContainsString('2 x Aruba 2930F 24G', $html);
        $this->assertStringContainsString('1 x Installation (Half day)', $html);
    }
}
