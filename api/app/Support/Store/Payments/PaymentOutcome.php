<?php

namespace App\Support\Store\Payments;

use App\Enums\PaymentStatus;

/**
 * What a provider says happened, in words this application understands.
 *
 * A small immutable value rather than the provider's own payload, because the
 * thing that follows a payment — stock, an activation code, an email — must not
 * be written against three different shapes of JSON. Each provider translates
 * once, here, and `Settlement` reads one thing.
 *
 * `amountPaise` is carried and **checked**, not trusted: a payment for the
 * wrong amount is either a misconfiguration or somebody replaying a cheaper
 * order's callback, and both must stop before an order is marked paid.
 */
final class PaymentOutcome
{
    public function __construct(
        /** Which provider is speaking. `App\Enums\PaymentGateway`'s value. */
        public readonly string $gateway,
        public readonly PaymentStatus $status,
        /** The provider's own payment id. Unique per payment, and the idempotency key. */
        public readonly string $paymentId,
        public readonly ?string $gatewayOrderId = null,
        public readonly ?int $amountPaise = null,
        public readonly ?string $method = null,
        public readonly ?string $signature = null,
        public readonly ?string $failureReason = null,
        /** The order this is about, when the provider can say. */
        public readonly ?string $orderNumber = null,
    ) {}

    public function isPaid(): bool
    {
        return $this->status === PaymentStatus::Paid;
    }
}
