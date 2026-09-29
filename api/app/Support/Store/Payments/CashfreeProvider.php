<?php

namespace App\Support\Store\Payments;

use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Setting;
use App\Support\Mail\MailBrand;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Cashfree Payments (PG API 2023-08-01).
 *
 * The second gateway, built on the seam `PaymentGateway` and
 * `PaymentProvider` left for it (2026-09-18). Three things differ from
 * Razorpay, and each is a place this file is careful:
 *
 * **Cashfree wants rupees, not paise.** This application stores paise as
 * integers everywhere, deliberately, and Razorpay takes them as they are.
 * Cashfree's `order_amount` is a decimal in rupees, so there is a conversion
 * here — the one place in the payment code where money is turned into a
 * decimal and back. Both directions are done on strings and integers
 * (`rupees()` / `paise()`), never through a float: `1180000 / 100` is
 * exact, but `11799.99 * 100` in a double is 1179998.9999…, and a payment
 * that is one paisa short of the order is a payment that settles nothing.
 *
 * **The browser's return carries no signature.** Razorpay hands the page a
 * signed triple; Cashfree's checkout hands it back to the return URL with
 * nothing that proves anything. So `verifyReturn()` ignores what the browser
 * says and asks Cashfree's API, server to server with the secret, whether
 * the order has a successful payment. That is the same trust boundary the
 * webhook has, arrived at from the other side.
 *
 * **The webhook signs `timestamp + body` with the client secret**, base64,
 * not a separate webhook secret — Cashfree has no second secret to issue.
 * The raw body, never a re-encoded array, the rule Razorpay's note gives.
 *
 * Every comparison is `hash_equals`; every call has a short timeout,
 * because it is on the request path of somebody pressing Pay.
 */
class CashfreeProvider implements PaymentProvider
{
    private const VERSION = '2023-08-01';

    public function name(): string
    {
        return 'cashfree';
    }

    /** Sandbox or production, by the `cashfree_environment` setting; sandbox unless told otherwise. */
    public static function environment(): string
    {
        return Setting::get('cashfree_environment') === 'production' ? 'production' : 'sandbox';
    }

    private static function api(): string
    {
        return self::environment() === 'production'
            ? 'https://api.cashfree.com/pg'
            : 'https://sandbox.cashfree.com/pg';
    }

    private function client(): PendingRequest
    {
        $appId = (string) Setting::get('cashfree_app_id');
        $secret = (string) Setting::get('cashfree_secret_key');

        if (blank($appId) || blank($secret)) {
            throw new RuntimeException('Cashfree is not configured.');
        }

        return Http::withHeaders([
            'x-client-id' => $appId,
            'x-client-secret' => $secret,
            'x-api-version' => self::VERSION,
        ])->acceptJson()->timeout(10);
    }

    public function createSession(Order $order): array
    {
        $response = $this->client()->post(self::api().'/orders', [
            // Our order number is Cashfree's `order_id` too: the webhook and
            // the return both name it, and asking twice with the same id
            // returns the same order rather than opening a second one.
            'order_id' => $order->order_number,
            'order_amount' => self::rupees($order->total_paise),
            'order_currency' => 'INR',
            'customer_details' => [
                // Required and alphanumeric; the order number is the one
                // stable id a guest checkout has.
                'customer_id' => 'cust_'.preg_replace('/[^A-Za-z0-9_-]/', '', $order->order_number),
                'customer_name' => $order->customer_name,
                'customer_email' => $order->customer_email,
                // Cashfree refuses a phone with anything but digits in it.
                'customer_phone' => self::phone($order->customer_phone),
            ],
            'order_meta' => [
                // Through `/open`, which trades the token for a cookie (Order::url()).
                'return_url' => $order->url('cashfree'),
                'notify_url' => rtrim((string) config('app.url'), '/').'/api/v1/payments/cashfree/webhook',
            ],
            'order_note' => 'Order '.$order->order_number,
        ]);

        if (! $response->successful()) {
            $message = $response->json('message') ?? 'Cashfree refused to open a payment.';

            Log::warning('Cashfree order creation failed', [
                'order' => $order->order_number,
                'status' => $response->status(),
                'error' => $message,
            ]);

            throw new RuntimeException($message);
        }

        return [
            'gateway' => 'cashfree',
            'gateway_order_id' => (string) $response->json('cf_order_id'),
            // What the browser SDK opens the checkout with. Short-lived and
            // bound to this order; not a secret, but not reusable either.
            'payment_session_id' => (string) $response->json('payment_session_id'),
            'mode' => self::environment(),
            'key_id' => (string) Setting::get('cashfree_app_id'),
            'amount_paise' => $order->total_paise,
            'currency' => 'INR',
            'order_number' => $order->order_number,
            'name' => MailBrand::name(),
            'prefill' => [
                'name' => $order->customer_name,
                'email' => $order->customer_email,
                'contact' => $order->customer_phone,
            ],
        ];
    }

    /**
     * The browser says the checkout closed; Cashfree says whether it paid.
     *
     * Nothing in `$payload` is trusted — the return carries no signature —
     * so the answer comes from `GET /orders/{id}/payments` with the secret.
     * A successful payment there is the one thing that can settle the
     * order from this path; anything else is "not confirmed", and the
     * webhook settles it if the money did leave.
     */
    public function verifyReturn(Order $order, array $payload): ?PaymentOutcome
    {
        try {
            $response = $this->client()->get(self::api().'/orders/'.rawurlencode($order->order_number).'/payments');
        } catch (RuntimeException) {
            return null;
        }

        if (! $response->successful()) {
            Log::warning('Cashfree payment lookup failed', [
                'order' => $order->order_number,
                'status' => $response->status(),
            ]);

            return null;
        }

        $payments = collect($response->json() ?? []);
        $paid = $payments->first(fn ($p) => ($p['payment_status'] ?? null) === 'SUCCESS');

        // Rupees only: the order was opened in INR, and a payment Cashfree
        // records in anything else is not a payment of this order's total.
        if ($paid === null || ($paid['payment_currency'] ?? 'INR') !== 'INR') {
            return null;
        }

        return new PaymentOutcome(
            gateway: 'cashfree',
            status: PaymentStatus::Paid,
            paymentId: (string) $paid['cf_payment_id'],
            gatewayOrderId: $order->order_number,
            // From Cashfree's own record, not the browser: `Settlement`
            // compares it against the order's total.
            amountPaise: isset($paid['payment_amount']) ? self::paise((string) $paid['payment_amount']) : null,
            method: $paid['payment_group'] ?? null,
            orderNumber: $order->order_number,
        );
    }

    /**
     * Cashfree talking to us. `x-webhook-signature` is
     * base64(HMAC-SHA256(timestamp . rawBody, clientSecret)); the timestamp
     * rides in `x-webhook-timestamp`. Three events matter, and the dropped
     * one is a failure for our purposes: nothing was charged.
     */
    public function verifyWebhook(Request $request): ?PaymentOutcome
    {
        $secret = (string) Setting::get('cashfree_secret_key');
        $signature = (string) $request->header('x-webhook-signature', '');
        $timestamp = (string) $request->header('x-webhook-timestamp', '');

        if (blank($secret) || blank($signature) || blank($timestamp)) {
            return null;
        }

        $expected = base64_encode(hash_hmac('sha256', $timestamp.$request->getContent(), $secret, true));

        if (! hash_equals($expected, $signature)) {
            Log::warning('Cashfree webhook signature did not verify');

            return null;
        }

        $status = match ((string) $request->input('type')) {
            'PAYMENT_SUCCESS_WEBHOOK' => PaymentStatus::Paid,
            'PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK' => PaymentStatus::Failed,
            default => null,
        };

        $payment = $request->input('data.payment', []);
        $paymentId = (string) ($payment['cf_payment_id'] ?? '');

        if ($status === null || blank($paymentId)) {
            return null;
        }

        return new PaymentOutcome(
            gateway: 'cashfree',
            status: $status,
            paymentId: $paymentId,
            gatewayOrderId: $request->input('data.order.order_id'),
            amountPaise: isset($payment['payment_amount']) ? self::paise((string) $payment['payment_amount']) : null,
            method: $payment['payment_group'] ?? null,
            failureReason: $status === PaymentStatus::Failed ? ($payment['payment_message'] ?? null) : null,
            orderNumber: $request->input('data.order.order_id'),
        );
    }

    /** 1180000 → "11800.00". Integer arithmetic and a string; no float touches money. */
    public static function rupees(int $paise): string
    {
        $sign = $paise < 0 ? '-' : '';
        $paise = abs($paise);

        return sprintf('%s%d.%02d', $sign, intdiv($paise, 100), $paise % 100);
    }

    /** "11800.00" → 1180000, and "11800" → 1180000; the amount as Cashfree writes it, read without a float. */
    public static function paise(string $rupees): int
    {
        $rupees = trim($rupees);
        $sign = str_starts_with($rupees, '-') ? -1 : 1;
        $rupees = ltrim($rupees, '-+');
        [$whole, $fraction] = array_pad(explode('.', $rupees, 2), 2, '');
        $fraction = substr(str_pad($fraction, 2, '0'), 0, 2);

        return $sign * ((int) $whole * 100 + (int) $fraction);
    }

    /**
     * Digits only, an Indian country code stripped: Cashfree wants the
     * ten-digit number. Nothing is invented for a blank one — the checkout
     * requires a phone, and if one somehow is not there Cashfree's refusal
     * is the honest answer.
     */
    private static function phone(?string $phone): string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone) ?? '';

        if (strlen($digits) > 10 && str_starts_with($digits, '91')) {
            $digits = substr($digits, 2);
        }

        return $digits;
    }
}
