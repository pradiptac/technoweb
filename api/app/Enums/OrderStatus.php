<?php

namespace App\Enums;

/**
 * Where an order is.
 *
 * A PHP enum with the permitted moves written down, exactly as `TicketStatus`
 * does — and for a stronger reason. A ticket in the wrong state is a support
 * queue that reads oddly; an order in the wrong state is stock committed twice,
 * an activation code issued for a payment that failed, or a parcel sent for
 * money nobody received.
 *
 * The two fulfilment paths in the brief share the same states rather than
 * branching, because they differ in *who does the work* rather than in what has
 * happened: a digital order is paid and then complete, a physical one is paid,
 * picked, dispatched and then complete. The states in between are simply skipped.
 */
enum OrderStatus: string
{
    case PendingPayment = 'pending_payment';
    /**
     * Accepted, and the money has not arrived yet.
     *
     * Cash on delivery, and only that. It exists because a COD order left at
     * `pending_payment` is indistinguishable in the queue from a basket
     * somebody walked away from at the payment screen — and one of those is to
     * be packed this afternoon while the other is to be ignored.
     */
    case Confirmed = 'confirmed';

    case Paid = 'paid';
    case Processing = 'processing';
    case ReadyForDispatch = 'ready_for_dispatch';
    case Dispatched = 'dispatched';
    case Completed = 'completed';
    case Cancelled = 'cancelled';
    case RefundRequested = 'refund_requested';
    case Refunded = 'refunded';

    public function label(): string
    {
        return match ($this) {
            self::PendingPayment => 'Pending payment',
            self::Confirmed => 'Confirmed, unpaid',
            self::Paid => 'Paid',
            self::Processing => 'Processing',
            self::ReadyForDispatch => 'Ready for dispatch',
            self::Dispatched => 'Dispatched',
            self::Completed => 'Completed',
            self::Cancelled => 'Cancelled',
            self::RefundRequested => 'Refund requested',
            self::Refunded => 'Refunded',
        };
    }

    /**
     * Whether the order has progressed past the point of payment.
     *
     * **Not the same question as "did we get paid", and the difference is why
     * `Order::scopePaid()` reads `paid_at` instead of this.** For a gateway
     * order the two coincide exactly — it leaves `pending_payment` because a
     * signed callback settled it. Cash on delivery broke the equivalence: such
     * an order is packed and dispatched before any money exists, so it is past
     * the point of payment and unpaid at the same time.
     *
     * What this still decides, correctly, is fulfilment: no licence key is
     * issued and none is revealed while an order sits at `pending_payment`.
     * `Confirmed` is excluded for exactly that reason — a COD order may be
     * packed, and may not have a code issued against it, which is also why
     * `PaymentMethod::permitsDigital()` refuses that combination at the
     * checkout rather than relying on this.
     */
    public function isPaid(): bool
    {
        return ! in_array($this, [self::PendingPayment, self::Confirmed, self::Cancelled], true);
    }

    /** Whether anybody is still waiting for anything. */
    public function isOpen(): bool
    {
        return ! in_array($this, [self::Completed, self::Cancelled, self::Refunded], true);
    }

    /**
     * The moves staff may make, and the ones they may not.
     *
     * Deliberately *not* including anything into `Paid`: an order becomes paid
     * because a payment was verified server-side, never because somebody chose
     * it from a dropdown. That is the difference between a shop and a way of
     * giving stock away, and it is enforced here rather than trusted to the
     * console.
     *
     * @return array<int, self>
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            // Only a payment moves it out of here. Cancelling is the one thing
            // a person may do -- an order nobody paid for is abandoned, and
            // that is a real outcome rather than a failure.
            self::PendingPayment => [self::Cancelled],

            /*
             * Cash on delivery, so the shop works before it is paid. It may be
             * packed and sent and finished; what it may not do is become `paid`
             * from a dropdown, because that is still a claim about money.
             * Recording the cash is a separate act with a reference against it.
             */
            self::Confirmed => [self::Processing, self::ReadyForDispatch, self::Dispatched, self::Completed, self::Cancelled],

            self::Paid => [self::Processing, self::ReadyForDispatch, self::Completed, self::RefundRequested],
            self::Processing => [self::ReadyForDispatch, self::Dispatched, self::Completed, self::RefundRequested],
            self::ReadyForDispatch => [self::Processing, self::Dispatched, self::RefundRequested],
            self::Dispatched => [self::Completed, self::RefundRequested],

            // Reopening a completed order for a refund request is real: a
            // customer comes back a fortnight later.
            self::Completed => [self::RefundRequested],

            self::RefundRequested => [self::Refunded, self::Completed],

            // Terminal. A refund reversed is a new order, not a status change.
            self::Cancelled, self::Refunded => [],
        };
    }

    public function canTransitionTo(self $next): bool
    {
        return in_array($next, $this->allowedTransitions(), true);
    }

    /** @return array<int, array<string, mixed>> For the console's selects. */
    public static function options(): array
    {
        return array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label()],
            self::cases(),
        );
    }
}
