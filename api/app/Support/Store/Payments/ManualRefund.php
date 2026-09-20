<?php

namespace App\Support\Store\Payments;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A refund, recorded — the counterpart of `ManualPayment`.
 *
 * "Refunds are a status, not an action" was the open item: an order could be
 * moved to `refunded` from the dropdown and nothing said how much went back,
 * to whom, or with what reference — the one figure a statement is checked
 * against. This does not move money. Nothing here calls a gateway, and the
 * brief does not ask for it; whoever returns the money does so in Razorpay's
 * or Cashfree's dashboard or at the bank, and comes here with the reference.
 * What this does is make that act a **row** — a `payments` entry with status
 * `refunded`, the amount, who confirmed it and the gateway's or bank's
 * reference — and lets the order's status follow the money rather than the
 * other way round.
 *
 * Three rules, each mirroring the payment side. Only a paid order can be
 * refunded, because a refund of nothing is a bookkeeping error. A refund can
 * be partial — a damaged item out of three — and partial refunds accumulate;
 * the sum can never exceed what was paid. Once the sum reaches the order's
 * total the order is `refunded` (terminal) and the stock is not put back:
 * "there is no `Cancellation` reason because nothing puts stock back", and a
 * refund is money, not goods. A partial refund leaves the status alone and
 * is said in the trail, which is where a figure that will not reconcile has
 * to be visible.
 *
 * The console's status dropdown still offers `refund_requested → refunded`
 * for an install that records refunds elsewhere; this is the path that
 * carries an amount.
 */
class ManualRefund
{
    /**
     * @param  array{amount_paise:int, reference:string, note?:?string}  $details
     */
    public static function record(Order $order, User $actor, array $details): Payment
    {
        if ($order->paid_at === null) {
            throw ValidationException::withMessages([
                'amount_paise' => 'This order has not been paid, so there is nothing to refund.',
            ]);
        }

        if ($order->status === OrderStatus::Refunded) {
            throw ValidationException::withMessages([
                'amount_paise' => 'This order is already refunded in full.',
            ]);
        }

        return DB::transaction(function () use ($order, $actor, $details) {
            $fresh = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            $already = (int) $fresh->payments()->where('status', PaymentStatus::Refunded)->sum('amount_paise');
            $paid = (int) $fresh->payments()->where('status', PaymentStatus::Paid)->sum('amount_paise');
            // A gateway order's paid rows carry the amount; a cash order recorded
            // by hand does too. If somehow neither exists, the order total is the
            // ceiling, because that is what the customer was charged.
            $ceiling = max($paid, $fresh->total_paise) - $already;

            if ($details['amount_paise'] > $ceiling) {
                throw ValidationException::withMessages([
                    'amount_paise' => sprintf(
                        'That is more than is left to refund: %s was paid and %s has already gone back, so at most %s can be returned.',
                        Money::format(max($paid, $fresh->total_paise)), Money::format($already), Money::format($ceiling),
                    ),
                ]);
            }

            $method = PaymentMethod::tryFrom((string) $fresh->payment_method) ?? PaymentMethod::Gateway;

            $refund = $fresh->payments()->create([
                'gateway' => $method->value,
                'reference' => $details['reference'],
                'confirmed_by' => $actor->id,
                'amount_paise' => $details['amount_paise'],
                'currency' => 'INR',
                'status' => PaymentStatus::Refunded,
                'method' => $method->label(),
                'note' => $details['note'] ?? null,
                'paid_at' => now(),
            ]);

            $total = $already + $details['amount_paise'];
            $full = $total >= max($paid, $fresh->total_paise);

            if ($full) {
                $fresh->forceFill(['status' => OrderStatus::Refunded])->save();
            }

            $fresh->history()->create([
                'to_status' => $fresh->status->value,
                'user_id' => $actor->id,
                'actor_name' => $actor->name,
                'note' => ($full ? 'Refunded in full: ' : 'Partial refund: ')
                    .Money::format($details['amount_paise']).' by '.$method->label()
                    .', reference '.$details['reference'].'.'
                    .($full ? '' : ' '.Money::format($total).' of '.Money::format(max($paid, $fresh->total_paise)).' returned so far.'),
            ]);

            return $refund;
        });
    }
}
