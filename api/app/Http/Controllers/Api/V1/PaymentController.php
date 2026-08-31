<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PaymentGateway;
use App\Http\Controllers\Controller;
use App\Http\Resources\Store\OrderResource;
use App\Models\Order;
use App\Support\Store\Payments\PaymentProvider;
use App\Support\Store\Payments\RazorpayProvider;
use App\Support\Store\Payments\Settlement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Taking the money.
 *
 * Three endpoints and they are not equal in importance. `session` opens a
 * payment; `verify` is what the browser reports and is a **convenience**, so
 * the person sees the right page immediately; `webhook` is what actually
 * settles the order, because it arrives whether or not the browser survived the
 * redirect.
 *
 * Both of the last two go through the same `Settlement`, which is idempotent —
 * so a browser and a webhook reporting the same success is the ordinary case
 * and produces one paid order, not two.
 */
class PaymentController extends Controller
{
    public function session(Request $request, string $orderNumber): JsonResponse
    {
        $order = $this->order($request, $orderNumber);

        if ($order->status->isPaid()) {
            return response()->json(['message' => 'This order has already been paid.'], 422);
        }

        $gateway = PaymentGateway::active();

        if ($gateway === null) {
            // A shop with no keys yet says so rather than throwing. The
            // storefront renders "we cannot take payment online at the moment"
            // and the telephone number, which is a real answer.
            return response()->json([
                'message' => 'Online payment is not set up. Please contact us to pay for this order.',
            ], 503);
        }

        try {
            return response()->json(['data' => $this->provider($gateway)->createSession($order)]);
        } catch (RuntimeException $e) {
            // The provider's own words. "Payment failed" tells an operator
            // nothing about which key is wrong.
            return response()->json(['message' => $e->getMessage()], 502);
        }
    }

    /**
     * What the browser says happened, checked against a secret it never had.
     *
     * Without the signature check this endpoint is "tell me you paid and I will
     * believe you", which is the single most common way a shop is robbed. The
     * brief says so twice and it is worth a third: **never trust the frontend
     * payment-success callback.**
     */
    public function verify(Request $request, string $orderNumber): JsonResponse
    {
        $order = $this->order($request, $orderNumber);

        $gateway = PaymentGateway::active();

        if ($gateway === null) {
            return response()->json(['message' => 'Online payment is not set up.'], 503);
        }

        $outcome = $this->provider($gateway)->verifyReturn($order, $request->all());

        if ($outcome === null) {
            /*
             * A failed signature is not "payment failed" — the money may well
             * have left. It is "this application will not act on what you said",
             * and the webhook is what settles it either way. So the person is
             * told to wait rather than told they were not charged.
             */
            return response()->json([
                'message' => 'We could not confirm that payment. If money has left your account, the order will update shortly.',
            ], 422);
        }

        Settlement::record($order, $outcome);

        return response()->json(['data' => new OrderResource($order->fresh()->load(['items', 'payments']))]);
    }

    /**
     * The provider talking to us directly.
     *
     * **Always 200, whatever happens.** A gateway reads a non-2xx as "try
     * again", so an exception here turns one delivery into an escalating retry
     * storm — and a bad signature retried is still a bad signature. Refusing
     * loudly would also tell whoever is probing which of their guesses parsed.
     *
     * There is no authentication middleware on this route and there cannot be:
     * the caller is Razorpay's servers. The signature *is* the authentication.
     */
    public function webhook(Request $request, string $gateway): JsonResponse
    {
        $chosen = PaymentGateway::tryFrom($gateway);

        if ($chosen === null || ! $chosen->isImplemented()) {
            return response()->json(['received' => true]);
        }

        $outcome = $this->provider($chosen)->verifyWebhook($request);

        if ($outcome === null) {
            return response()->json(['received' => true]);
        }

        /*
         * The order is found from the note the session put on it, not from
         * anything a caller can choose. A webhook that names an order it has no
         * payment for is a webhook for somebody else's system.
         */
        $order = filled($outcome->orderNumber)
            ? Order::where('order_number', $outcome->orderNumber)->first()
            : null;

        if ($order === null && filled($outcome->gatewayOrderId)) {
            $order = Order::whereHas(
                'payments',
                fn ($q) => $q->where('gateway_order_id', $outcome->gatewayOrderId)
            )->first();
        }

        if ($order === null) {
            Log::warning('Payment webhook for an unknown order', [
                'gateway' => $gateway,
                'payment' => $outcome->paymentId,
            ]);

            return response()->json(['received' => true]);
        }

        Settlement::record($order, $outcome);

        return response()->json(['received' => true]);
    }

    /**
     * The order, by number and token.
     *
     * `hash_equals`, and a 404 rather than a 403 for a wrong token — a 403
     * confirms the order number exists, and the numbers are sequential.
     */
    private function order(Request $request, string $orderNumber): Order
    {
        $order = Order::where('order_number', $orderNumber)->firstOrFail();

        abort_unless(hash_equals($order->access_token, (string) $request->input('token', '')), 404);

        return $order;
    }

    private function provider(PaymentGateway $gateway): PaymentProvider
    {
        return match ($gateway) {
            PaymentGateway::Razorpay => new RazorpayProvider,
            // Unreachable while `isImplemented()` guards the callers, and
            // stated rather than left to a null: an unimplemented provider
            // chosen somehow must fail here rather than three layers down.
            default => throw new RuntimeException($gateway->label().' is not implemented.'),
        };
    }
}
