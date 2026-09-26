<?php

namespace App\Support\Store\Payments;

use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Razorpay.
 *
 * Amounts go over the wire in **paise**, which is what this application stores
 * anyway — so there is no conversion here and therefore no place for one to be
 * wrong. That is worth saying out loud, because a gateway that wanted rupees
 * would need a multiply, and a multiply is where money becomes 1179.9999.
 *
 * Two secrets, and they are not interchangeable. The **key secret** signs the
 * browser's return; the **webhook secret** signs a server-to-server callback,
 * and is set separately in the Razorpay dashboard. Using one where the other
 * belongs produces a signature that never matches, which reads as "payments
 * silently stopped working" rather than as a configuration mistake — the same
 * shape as Mailgun's `secret` against Brevo's `key`.
 *
 * Every comparison is `hash_equals`. These are secrets being checked against
 * attacker-supplied values, which is the definition of a timing-attack target,
 * and the cost of getting it right is one function call.
 */
class RazorpayProvider implements PaymentProvider
{
    private const API = 'https://api.razorpay.com/v1';

    public function name(): string
    {
        return 'razorpay';
    }

    public function createSession(Order $order): array
    {
        $keyId = (string) Setting::get('razorpay_key_id');
        $secret = (string) Setting::get('razorpay_key_secret');

        if (blank($keyId) || blank($secret)) {
            throw new RuntimeException('Razorpay is not configured.');
        }

        $response = Http::withBasicAuth($keyId, $secret)
            ->acceptJson()
            /*
             * A short timeout, deliberately.
             *
             * This call is on the request path of somebody pressing Pay. An
             * unreachable host has already cost this project 12.5 seconds once,
             * on a contact form; here it would cost a sale. Ten seconds is
             * generous for one API call and short enough to fail visibly.
             */
            ->timeout(10)
            ->post(self::API.'/orders', [
                // Already paise. No conversion, and therefore no rounding.
                'amount' => $order->total_paise,
                'currency' => 'INR',
                'receipt' => $order->order_number,
                /*
                 * Razorpay's own idempotency, on top of ours: asking twice with
                 * the same receipt returns the same order rather than creating
                 * a second one. Somebody pressing Pay, going back and pressing
                 * again is the ordinary case, not the exotic one.
                 */
                'notes' => ['order_number' => $order->order_number],
            ]);

        if (! $response->successful()) {
            // The provider's own words, because "payment failed" tells an
            // operator nothing about which key is wrong.
            $message = $response->json('error.description') ?? 'Razorpay refused to open a payment.';

            Log::warning('Razorpay order creation failed', [
                'order' => $order->order_number,
                'status' => $response->status(),
                'error' => $message,
            ]);

            throw new RuntimeException($message);
        }

        /*
         * Remember which Razorpay order this is.
         *
         * The browser's return is signed over `order_id|payment_id`, which
         * proves Razorpay issued the pair and says nothing about which of
         * *our* orders it was opened for. Without this a ₹1 order's signed
         * triple, posted to a dear order's verify, paid the dear one. The
         * latest session wins: a browser coming back from an older dialog is
         * refused here and settled by the webhook, which carries the order
         * number Razorpay was given.
         */
        $order->forceFill(['gateway_order_id' => (string) $response->json('id')])->save();

        return [
            'gateway' => 'razorpay',
            'gateway_order_id' => $response->json('id'),
            // The key id is public by design -- it is in the browser's script
            // tag on every Razorpay checkout in the world. The secret is not
            // here, and must never be.
            'key_id' => $keyId,
            'amount_paise' => $order->total_paise,
            'currency' => 'INR',
            'order_number' => $order->order_number,
            'name' => (string) (Setting::get('company_name') ?: 'Technoware'),
            'prefill' => [
                'name' => $order->customer_name,
                'email' => $order->customer_email,
                'contact' => $order->customer_phone,
            ],
        ];
    }

    /**
     * What the browser hands back after the Razorpay dialog closes.
     *
     * Three checks, and each closes a different way of being lied to:
     *
     * 1. **The signature** — HMAC-SHA256 of `order_id|payment_id` with the key
     *    secret. Without it "payment successful" is a string a browser sent.
     * 2. **The binding** — the `order_id` must be the Razorpay order *this*
     *    order opened (`orders.gateway_order_id`). The signature is valid for
     *    any pair Razorpay ever issued, so without this a cheap order's
     *    triple paid a dear one.
     * 3. **Razorpay's own record** — `GET /payments/{id}`, server to server:
     *    captured or authorised, against that same order, in rupees, and its
     *    `amount` is handed to `Settlement`, which compares it with the
     *    order's total. The browser carries no amount, so before this the
     *    comparison was skipped and the payment recorded at whatever the
     *    order said it cost.
     *
     * Any doubt is `null`: "not confirmed", never "not paid". The webhook
     * settles the order if the money did leave.
     */
    public function verifyReturn(Order $order, array $payload): ?PaymentOutcome
    {
        $keyId = (string) Setting::get('razorpay_key_id');
        $secret = (string) Setting::get('razorpay_key_secret');

        $paymentId = (string) ($payload['razorpay_payment_id'] ?? '');
        $gatewayOrderId = (string) ($payload['razorpay_order_id'] ?? '');
        $signature = (string) ($payload['razorpay_signature'] ?? '');

        if (blank($keyId) || blank($secret) || blank($paymentId) || blank($gatewayOrderId) || blank($signature)) {
            return null;
        }

        $expected = hash_hmac('sha256', $gatewayOrderId.'|'.$paymentId, $secret);

        if (! hash_equals($expected, $signature)) {
            Log::warning('Razorpay return signature did not verify', [
                'order' => $order->order_number,
                'payment' => $paymentId,
            ]);

            return null;
        }

        $opened = (string) $order->gateway_order_id;

        if ($opened === '' || ! hash_equals($opened, $gatewayOrderId)) {
            Log::warning('Razorpay return names a gateway order this order did not open', [
                'order' => $order->order_number,
                'gateway_order' => $gatewayOrderId,
            ]);

            return null;
        }

        $payment = $this->fetchPayment($keyId, $secret, $paymentId);

        if ($payment === null
            || ! in_array($payment['status'] ?? null, ['captured', 'authorized'], true)
            || ! hash_equals($opened, (string) ($payment['order_id'] ?? ''))
            || ($payment['currency'] ?? null) !== 'INR'
            || ! is_numeric($payment['amount'] ?? null)) {
            Log::warning('Razorpay does not confirm the returned payment', [
                'order' => $order->order_number,
                'payment' => $paymentId,
                'status' => $payment['status'] ?? null,
            ]);

            return null;
        }

        return new PaymentOutcome(
            gateway: 'razorpay',
            status: PaymentStatus::Paid,
            paymentId: $paymentId,
            gatewayOrderId: $gatewayOrderId,
            // Razorpay's figure, in paise, never the browser's. `Settlement`
            // compares it with the order's total.
            amountPaise: (int) $payment['amount'],
            method: $payment['method'] ?? null,
            signature: $signature,
            orderNumber: $order->order_number,
        );
    }

    /**
     * Razorpay's record of one payment, or null when it cannot be read.
     *
     * @return array<string, mixed>|null
     */
    private function fetchPayment(string $keyId, string $secret, string $paymentId): ?array
    {
        try {
            $response = Http::withBasicAuth($keyId, $secret)
                ->acceptJson()
                ->timeout(10)
                ->get(self::API.'/payments/'.rawurlencode($paymentId));
        } catch (\Throwable $e) {
            Log::warning('Razorpay payment lookup failed', ['payment' => $paymentId, 'error' => $e->getMessage()]);

            return null;
        }

        if (! $response->successful() || ! is_array($response->json())) {
            Log::warning('Razorpay payment lookup refused', ['payment' => $paymentId, 'status' => $response->status()]);

            return null;
        }

        return $response->json();
    }

    /**
     * The half that actually settles an order.
     *
     * A browser can close, lose signal or be a bot; the webhook arrives anyway,
     * and it arrives **more than once** — that is documented behaviour, not an
     * edge case. Idempotency is the unique index on `gateway_payment_id`, and
     * everything here is written so a second delivery is a no-op rather than a
     * second sale.
     *
     * The signature is over the **raw body**, so `$request->getContent()` and
     * never a re-encoded array: `json_encode` of the decoded payload is a
     * different string, and the HMAC of a different string is a different HMAC.
     * That is the classic way webhook verification is written and quietly never
     * matches.
     */
    public function verifyWebhook(Request $request): ?PaymentOutcome
    {
        $secret = (string) Setting::get('razorpay_webhook_secret');
        $signature = (string) $request->header('X-Razorpay-Signature', '');

        if (blank($secret) || blank($signature)) {
            return null;
        }

        $expected = hash_hmac('sha256', $request->getContent(), $secret);

        if (! hash_equals($expected, $signature)) {
            Log::warning('Razorpay webhook signature did not verify');

            return null;
        }

        $event = (string) $request->input('event');
        $payment = $request->input('payload.payment.entity', []);
        $paymentId = (string) ($payment['id'] ?? '');

        if (blank($paymentId)) {
            return null;
        }

        // Only the two events that change anything here. A genuine webhook
        // about something else is a no-op, which the caller cannot distinguish
        // from a bad signature and must not need to.
        $status = match ($event) {
            'payment.captured' => PaymentStatus::Paid,
            'payment.failed' => PaymentStatus::Failed,
            default => null,
        };

        if ($status === null) {
            return null;
        }

        return new PaymentOutcome(
            gateway: 'razorpay',
            status: $status,
            paymentId: $paymentId,
            gatewayOrderId: $payment['order_id'] ?? null,
            amountPaise: isset($payment['amount']) ? (int) $payment['amount'] : null,
            method: $payment['method'] ?? null,
            failureReason: $payment['error_description'] ?? null,
            orderNumber: $payment['notes']['order_number'] ?? null,
        );
    }
}
