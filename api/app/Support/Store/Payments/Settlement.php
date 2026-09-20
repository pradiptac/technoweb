<?php

namespace App\Support\Store\Payments;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Notifications\OrderPaid;
use App\Notifications\OrderReceived;
use App\Support\Notifier;
use App\Support\Store\Checkout;
use App\Support\Store\DigitalFulfilment;
use App\Support\Store\StockLedger;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * What happens once a payment is known to be real.
 *
 * One place for all of it, for all providers: record the payment, mark the
 * order paid, take the stock, make the account. A provider says *whether* money
 * arrived; nothing that follows from the answer belongs to any one of them.
 *
 * **Everything here is idempotent, and it has to be.** Gateways retry webhooks —
 * that is documented behaviour, not an edge case — so the same success arrives
 * two or three times. Without that, the second delivery marks the order paid
 * again, reduces stock again and, once digital codes exist, issues a second
 * activation code. The guard is the unique index on `gateway_payment_id`: the
 * duplicate insert cannot happen, and this recognises the payment it already
 * holds and stops.
 */
class Settlement
{
    /**
     * Record an outcome against an order.
     *
     * @return Payment the payment row, new or the one already held
     */
    public static function record(Order $order, PaymentOutcome $outcome): Payment
    {
        /*
         * The amount is checked before anything is believed.
         *
         * A payment for the wrong sum is either a misconfiguration or somebody
         * replaying a cheaper order's callback. Either way it must not mark
         * this order paid — but it must be *recorded*, because money that
         * arrived and cannot be matched is exactly what somebody needs to see.
         */
        if ($outcome->amountPaise !== null && $outcome->amountPaise !== $order->total_paise) {
            Log::warning('Payment amount does not match the order', [
                'order' => $order->order_number,
                'expected' => $order->total_paise,
                'received' => $outcome->amountPaise,
            ]);

            return self::write($order, $outcome, PaymentStatus::Failed, 'The amount paid does not match this order.');
        }

        if (! $outcome->isPaid()) {
            return self::write($order, $outcome, $outcome->status, $outcome->failureReason);
        }

        return DB::transaction(function () use ($order, $outcome) {
            $payment = self::write($order, $outcome, PaymentStatus::Paid, null);

            /*
             * Already settled: stop here.
             *
             * `wasRecentlyCreated` is the question being asked — was this
             * arrival the first one. A second webhook finds the row, this is
             * false, and nothing below runs. Reading the *order* status instead
             * would be nearly right and wrong in the one case that matters: two
             * deliveries racing each other would both see `pending_payment`.
             */
            if (! $payment->wasRecentlyCreated) {
                return $payment;
            }

            $order->refresh();

            if ($order->status->isPaid()) {
                return $payment;
            }

            self::takeStock($order);

            $order->moveTo(OrderStatus::Paid, 'Payment received.');

            // The account is made now rather than at checkout: somebody who
            // never paid should not acquire a portal login by filling a form.
            Checkout::accountFor($order);

            /*
             * Activation codes, immediately, if the shop is set that way.
             *
             * Inside the same transaction as the payment: a code assigned
             * against a payment that then rolls back is a licence given away
             * for nothing, and the assignment is a conditional UPDATE that
             * belongs with the row it settles.
             *
             * Running out does not fail anything — the order is paid, the money
             * cannot be un-taken, and the line waits for a person with the
             * reason written into the order's trail.
             */
            DigitalFulfilment::fulfil($order);

            /*
             * The receipt, and the desk alert.
             *
             * **After** fulfilment, so both messages can say truthfully whether
             * an activation code is ready — sent before it, the receipt would
             * promise a code that had not been claimed yet and the desk alert
             * would report work that had already been done.
             *
             * Queued and swallowed by `Notifier`, so a dead mail server cannot
             * roll back a payment that has already been taken.
             */
            $order->refresh()->loadMissing('items');

            Notifier::to($order->customer_email, new OrderPaid($order));
            Notifier::to(Setting::get('support_email'), new OrderReceived($order));

            return $payment;
        });
    }

    /**
     * The payment row, written once.
     *
     * A duplicate `gateway_payment_id` is caught rather than checked for. The
     * check-then-insert version passes every test written on one thread and is
     * a race in production — two webhook deliveries land within milliseconds of
     * each other, both see no row, and both insert. The unique index is the
     * only thing that is actually true under concurrency; this reads it as the
     * answer rather than as an error.
     */
    private static function write(Order $order, PaymentOutcome $outcome, PaymentStatus $status, ?string $failure): Payment
    {
        try {
            return $order->payments()->create([
                // The provider, not the instrument. `method` is "card" or
                // "upi" and belongs in its own column; conflating them makes
                // "which gateway took this money" unanswerable at reconciliation.
                'gateway' => $outcome->gateway,
                'gateway_order_id' => $outcome->gatewayOrderId,
                'gateway_payment_id' => $outcome->paymentId,
                'signature' => $outcome->signature,
                'amount_paise' => $outcome->amountPaise ?? $order->total_paise,
                'status' => $status,
                'method' => $outcome->method,
                'failure_reason' => $failure,
                'paid_at' => $status === PaymentStatus::Paid ? now() : null,
            ]);
        } catch (QueryException $e) {
            $existing = Payment::where('gateway_payment_id', $outcome->paymentId)->first();

            if ($existing !== null) {
                return $existing;
            }

            throw $e;
        }
    }

    /**
     * Take the stock, and never refuse a payment over it.
     *
     * A conditional `UPDATE ... WHERE stock >= quantity` per line, so two orders
     * settling at once cannot both take the last unit — the second affects no
     * rows and knows it.
     *
     * When it does fail, the order is still paid. **Money has arrived and
     * cannot be un-taken**, so the honest outcome is an order that is paid and a
     * line in its trail saying somebody has to sort it out; refusing here would
     * leave a customer charged for an order the shop is pretending it never
     * received. The checkout's lock makes this rare; this is what happens when
     * it is not.
     */
    private static function takeStock(Order $order): void
    {
        // Loaded here rather than assumed: this is reached from a webhook that
        // found the order by number and from a browser return that found it by
        // token, and neither has any reason to have loaded the lines.
        $order->loadMissing('items');

        $short = [];

        foreach ($order->items as $item) {
            /*
             * A back-ordered line comes off the shelf whatever the shelf says,
             * and the level goes **negative** — which is the honest record of
             * it: the shop owes that many. Without dropping the guard the
             * decrement would silently do nothing, and the stock report would
             * show a paid order that took no stock, which is the one thing it
             * must never say.
             */
            $oversells = self::oversells($item);

            if ($item->store_product_variation_id !== null) {
                $taken = StoreProductVariation::whereKey($item->store_product_variation_id)
                    ->when(! $oversells, fn ($q) => $q->where('stock', '>=', $item->quantity))
                    ->whereHas('product', fn ($q) => $q->where('track_stock', true))
                    ->decrement('stock', $item->quantity);
            } else {
                $taken = StoreProduct::whereKey($item->store_product_id)
                    ->where('track_stock', true)
                    ->when(! $oversells, fn ($q) => $q->where('stock', '>=', $item->quantity))
                    ->decrement('stock', $item->quantity);
            }

            /*
             * The ledger records what actually happened, so it is written on
             * the affected row count and not on having tried. A movement for a
             * decrement that did not occur — an untracked product, or one that
             * was short — is a lie about the shelf, and the stock report is
             * read to decide what to order.
             */
            if ($taken > 0) {
                self::recordMovement($order, $item);
            }

            // Zero rows can mean "not tracked" as well as "not enough", so the
            // difference is asked about rather than assumed. A back-ordered
            // line is never short — going below zero is what was agreed to.
            if ($taken === 0 && ! $oversells && self::tracksStock($item->store_product_id)) {
                $short[] = $item->name;
            }
        }

        if ($short !== []) {
            $order->history()->create([
                'to_status' => OrderStatus::Paid->value,
                'note' => 'Paid, but stock could not be taken for: '.implode(', ', $short).'. Check before dispatch.',
            ]);

            Log::warning('Order paid with insufficient stock', [
                'order' => $order->order_number,
                'items' => $short,
            ]);
        }
    }

    /**
     * Is this line one the shop agreed to back-order?
     *
     * Asked of the product and variation as they are **now** rather than of the
     * order item, which snapshots what was sold and not what the shop's policy
     * was. That is the right way round: this decides whether to take stock into
     * the negative, which is a question about the shelf today.
     */
    private static function oversells(OrderItem $item): bool
    {
        $product = StoreProduct::find($item->store_product_id);

        if ($product === null) {
            return false;
        }

        return $product->allowsOversell(
            $item->store_product_variation_id === null
                ? null
                : StoreProductVariation::find($item->store_product_variation_id),
        );
    }

    /**
     * One line of an order, in the stock ledger.
     *
     * The models are loaded here rather than in the loop above, because that
     * loop deliberately works in query builders — the decrement has to be a
     * single conditional `UPDATE` for the same reason the digital code claim
     * is, and reading a model first would open the read-then-write race the
     * whole method is written to avoid.
     */
    private static function recordMovement(Order $order, OrderItem $item): void
    {
        $product = StoreProduct::find($item->store_product_id);

        if ($product === null) {
            return;
        }

        StockLedger::sale(
            $order,
            $product,
            $item->store_product_variation_id === null
                ? null
                : StoreProductVariation::find($item->store_product_variation_id),
            (int) $item->quantity,
        );
    }

    private static function tracksStock(?int $productId): bool
    {
        return $productId !== null
            && StoreProduct::whereKey($productId)->where('track_stock', true)->exists();
    }
}
