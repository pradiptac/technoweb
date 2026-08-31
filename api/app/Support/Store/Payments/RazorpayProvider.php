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
     * The signature is HMAC-SHA256 of `order_id|payment_id` with the key
     * secret. Without checking it, "payment successful" is a string a browser
     * sent — which is the single most common way a shop is robbed, and the
     * brief says so twice.
     */
    public function verifyReturn(Order $order, array $payload): ?PaymentOutcome
    {
        $secret = (string) Setting::get('razorpay_key_secret');

        $paymentId = (string) ($payload['razorpay_payment_id'] ?? '');
        $gatewayOrderId = (string) ($payload['razorpay_order_id'] ?? '');
        $signature = (string) ($payload['razorpay_signature'] ?? '');

        if (blank($secret) || blank($paymentId) || blank($gatewayOrderId) || blank($signature)) {
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

        return new PaymentOutcome(
            gateway: 'razorpay',
            status: PaymentStatus::Paid,
            paymentId: $paymentId,
            gatewayOrderId: $gatewayOrderId,
            /*
             * The amount is *not* taken from the browser.
             *
             * Razorpay's return payload does not carry one, and if it did it
             * would be the last thing to believe. `Settlement` compares against
             * the order's own total; the webhook, which is server-to-server,
             * is where a real amount arrives.
             */
            amountPaise: null,
            signature: $signature,
            orderNumber: $order->order_number,
        );
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
