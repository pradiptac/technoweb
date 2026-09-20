<?php

namespace App\Support\Store\Payments;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Notifications\OrderPaid;
use App\Support\Money;
use App\Support\Notifier;
use App\Support\Store\DigitalFulfilment;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Recording money that arrived without a gateway.
 *
 * The one way the console may make an order paid, and it is deliberately not a
 * dropdown. `OrderStatus::allowedTransitions()` still refuses to move anything
 * into `paid`, and that rule has not been weakened — what has changed is that
 * cash on delivery, a bank transfer and a UPI payment have no signed callback,
 * so the verification *is* a person reading a statement. The difference between
 * this and a status dropdown is what it demands: an amount, a reference, and the
 * name of whoever said so.
 *
 * **A gateway order can never be settled this way.** Razorpay tells us whether
 * it was paid; typing that in by hand would be a way of marking an unpaid card
 * order paid, which is the exact hole the transition rule exists to close.
 *
 * **The reference is required and is not decorative.** It is the UTR, the UPI
 * transaction id, or the courier's receipt number, and it is the only thing that
 * ties a line on a bank statement to this order. A confirmation without one is
 * somebody's word.
 *
 * **Recording a payment stamps `paid_at` and does not touch the status.** For a
 * COD order the status is already about fulfilment — it may be `dispatched` when
 * the cash is banked — and overwriting that with `paid` would throw away where
 * the parcel is. `Order::scopePaid()` reads `paid_at`, so revenue is right
 * either way.
 */
class ManualPayment
{
    /**
     * @param  array{amount_paise: int, reference: string, note?: ?string, paid_at?: ?string}  $details
     *
     * @throws ValidationException
     */
    public static function record(Order $order, User $actor, array $details): Payment
    {
        $method = PaymentMethod::tryFrom((string) $order->payment_method) ?? PaymentMethod::Gateway;

        if ($method->settlesOnline()) {
            throw ValidationException::withMessages([
                'reference' => 'This order is being paid through the gateway, which confirms itself. Recording a payment by hand here would be a way of marking an unpaid card order paid.',
            ]);
        }

        if ($order->status === OrderStatus::Cancelled) {
            throw ValidationException::withMessages([
                'reference' => 'This order was cancelled. Reopen it before recording a payment against it.',
            ]);
        }

        if ($order->paid_at !== null) {
            throw ValidationException::withMessages([
                'reference' => 'This order is already recorded as paid. Refunding is the way back, not a second payment.',
            ]);
        }

        return DB::transaction(function () use ($order, $actor, $details, $method) {
            /*
             * Locked and re-read, because two people confirming the same
             * transfer from two screens is exactly the situation a support desk
             * produces — and the second one must find `paid_at` already set
             * rather than write a second payment row against the same money.
             */
            $fresh = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($fresh->paid_at !== null) {
                throw ValidationException::withMessages([
                    'reference' => 'Somebody recorded a payment for this order a moment ago.',
                ]);
            }

            $payment = $fresh->payments()->create([
                'gateway' => $method->value,
                'reference' => $details['reference'],
                'confirmed_by' => $actor->id,
                'amount_paise' => $details['amount_paise'],
                'currency' => 'INR',
                'status' => PaymentStatus::Paid,
                'method' => $method->label(),
                'note' => $details['note'] ?? null,
                'paid_at' => $details['paid_at'] ?? now(),
            ]);

            $fresh->forceFill(['paid_at' => $payment->paid_at])->save();

            /*
             * Said plainly in the trail, with the figure and the reference,
             * because this is the one entry somebody will come looking for when
             * a statement does not add up.
             */
            $fresh->history()->create([
                'to_status' => $fresh->status->value,
                'user_id' => $actor->id,
                'actor_name' => $actor->name,
                'note' => 'Payment recorded by hand: '.Money::format($details['amount_paise'])
                    .' by '.$method->label().', reference '.$details['reference'].'.',
            ]);

            /*
             * A short payment is recorded and said, never silently accepted.
             *
             * The money arrived and cannot be un-taken, so refusing it would be
             * worse than useless — but an order marked paid for less than it
             * cost is a figure that will not reconcile, and the trail is where
             * that has to be visible.
             */
            if ($details['amount_paise'] !== $fresh->total_paise) {
                $fresh->history()->create([
                    'to_status' => $fresh->status->value,
                    'user_id' => $actor->id,
                    'actor_name' => $actor->name,
                    'note' => 'The amount recorded does not match the order total of '
                        .Money::format($fresh->total_paise).'. Check before dispatch.',
                ]);
            }

            return $payment;
        });
    }

    /**
     * What happens after the money is recorded, outside the transaction.
     *
     * Fulfilment and mail are deliberately not inside it: issuing a licence key
     * takes its own locks, and a notification that goes out from inside a
     * transaction that later rolls back is a message about something that never
     * happened.
     */
    public static function afterwards(Order $order): void
    {
        $order->refresh()->loadMissing('items.product');

        /*
         * A bank transfer or a UPI payment for a licence leaves the order at
         * `pending_payment` until now, so this is the moment it becomes
         * fulfillable — the same moment a gateway settlement reaches.
         */
        if ($order->status === OrderStatus::PendingPayment) {
            $order->moveTo(OrderStatus::Paid, 'Payment confirmed.');
        }

        DigitalFulfilment::fulfil($order->refresh());

        Notifier::to($order->customer_email, new OrderPaid($order));
    }
}
