<?php

namespace App\Support\Store\Payments;

use App\Models\Order;
use Illuminate\Http\Request;

/**
 * What every payment provider has to be able to do.
 *
 * Three things, and the shape of them is what keeps order logic out of any one
 * provider's idea of the world:
 *
 * **Open a session.** Whatever the provider needs the browser to have — an
 * order id, a public key, an amount — as a plain array the checkout hands
 * straight to the provider's own script.
 *
 * **Verify a return.** The browser comes back claiming success; that claim is
 * worth nothing until the signature is checked *here*, against a secret the
 * browser never had.
 *
 * **Verify a webhook.** The same again from the other direction, with a
 * different secret, arriving whether or not anybody's browser survived the
 * redirect — which is why it is the half that actually settles an order.
 *
 * A provider never touches stock, never writes an order status and never sends
 * an email. It answers "did this payment happen, and for how much"; everything
 * that follows from the answer is `Settlement`'s, once, for all providers.
 */
interface PaymentProvider
{
    /** The provider's own name, matching `App\Enums\PaymentGateway`. */
    public function name(): string;

    /**
     * Open a payment session for an order.
     *
     * @return array<string, mixed> everything the browser needs, and nothing secret
     */
    public function createSession(Order $order): array;

    /**
     * Check what the browser came back with.
     *
     * @param  array<string, mixed>  $payload
     * @return PaymentOutcome|null null when the signature does not check out
     */
    public function verifyReturn(Order $order, array $payload): ?PaymentOutcome;

    /**
     * Check a webhook and say what it means.
     *
     * Returns null for a request whose signature fails **and** for one that is
     * genuine but about something this application does not act on — a refund
     * notification, say. The caller cannot tell those apart and must not: both
     * mean "do nothing", and the difference is the provider's business.
     */
    public function verifyWebhook(Request $request): ?PaymentOutcome;
}
