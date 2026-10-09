<?php

namespace App\Support\Store\Zoho;

use App\Enums\PaymentStatus;
use App\Jobs\SyncZohoPayment;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Payment;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * An order's money in Zoho Books (0.136.0, docs/store.md "Zoho Books:
 * payments and credit notes").
 *
 * Every row in `payments` that says money moved is told to Zoho once: a
 * `paid` row becomes a **customer payment** applied to the order's invoice,
 * a `refunded` row becomes a **credit note** against that invoice — set
 * against what is still owed on it, and anything beyond that paid back out
 * of the account the money went into.
 *
 * It is `ZohoInvoices` again, on a different row, and keeps the same three
 * promises:
 *
 *   - **Nothing here can fail a payment.** `consider()` is called from the
 *     payment's own `created` hook and swallows everything.
 *   - **Once, however often it is tried.** The row's `zoho_status` is
 *     claimed by a conditional UPDATE; Zoho is asked first whether a payment
 *     or credit note already carries this row's reference; and what Zoho
 *     made is written down before the next thing is asked of it, so a retry
 *     resumes rather than repeats.
 *   - **Zoho's books are the truth about Zoho.** What is still owed on the
 *     invoice, and what of a credit note is still unused, are read from Zoho
 *     each time rather than remembered — an accountant may have recorded the
 *     payment by hand, and then there is nothing to record.
 *
 * A payment waits for its invoice: nothing is sent for an order Zoho holds no
 * invoice for, and when the invoice is made every row already on the order
 * follows it (`forOrder()`).
 */
final class ZohoPayments
{
    /** How long after each failure the next attempt waits, in minutes. `ZohoInvoices`' own schedule. */
    private const BACKOFF_MINUTES = [5, 30, 120, 720];

    /** A claim older than this was abandoned by whatever held it. */
    private const CLAIM_MINUTES = 10;

    /** The reference a row carries in Zoho, which is how a second attempt finds the first. */
    public static function reference(Payment $payment, Order $order): string
    {
        return $order->order_number.($payment->status === PaymentStatus::Refunded ? '-R' : '-P').$payment->id;
    }

    /** Whether this row is money that moved: a payment that arrived, or one that went back. */
    public static function sendable(Payment $payment): bool
    {
        return in_array($payment->status, [PaymentStatus::Paid, PaymentStatus::Refunded], true) && (int) $payment->amount_paise > 0;
    }

    /**
     * A payment row has just been written, or its order's invoice has just
     * been made: is it to be sent? Marks it `pending` and queues the work,
     * once. Never throws.
     */
    public static function consider(Payment $payment): void
    {
        try {
            if ($payment->zoho_status !== null || ! self::sendable($payment)) {
                return;
            }

            $order = $payment->order;

            if ($order === null || $order->zoho_status !== 'created' || blank($order->zoho_invoice_id)
                || ! ZohoSettings::paymentsReady((string) $order->payment_method)) {
                return;
            }

            $claimed = Payment::query()->whereKey($payment->id)->whereNull('zoho_status')
                ->update(['zoho_status' => 'pending', 'zoho_next_attempt_at' => now()]);

            if ($claimed === 1) {
                $payment->zoho_status = 'pending';
                $payment->syncOriginalAttribute('zoho_status');

                SyncZohoPayment::dispatch($payment->id)->afterCommit();
            }
        } catch (Throwable $e) {
            logger()->warning('Zoho Books: could not queue a payment', ['payment' => $payment->id, 'error' => $e->getMessage()]);
        }
    }

    /** Every row on this order nothing has been asked of yet, oldest first — the money in before the money out. */
    public static function forOrder(Order $order): void
    {
        try {
            $order->payments()->whereNull('zoho_status')
                ->whereIn('status', [PaymentStatus::Paid->value, PaymentStatus::Refunded->value])
                ->orderBy('id')->get()
                ->each(fn (Payment $payment) => self::consider($payment->setRelation('order', $order)));
        } catch (Throwable $e) {
            logger()->warning('Zoho Books: could not queue an order\'s payments', ['order' => $order->order_number, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Send one row now. The queued job, the sweeper and the console's button
     * all end here. `$actor` is whoever pressed the button: their press goes
     * ahead whatever the attempt count says. Returns the row as it now
     * stands; never throws.
     */
    public static function run(Payment $payment, ?User $actor = null): Payment
    {
        $manual = $actor !== null;

        $claim = Payment::query()->whereKey($payment->id)
            ->where(function ($q) use ($manual) {
                $q->whereIn('zoho_status', $manual ? ['pending', 'failed', 'skipped'] : ['pending', 'failed'])
                    ->orWhere(fn ($stale) => $stale->where('zoho_status', 'sending')->where('zoho_claimed_at', '<', now()->subMinutes(self::CLAIM_MINUTES)));

                if ($manual) {
                    $q->orWhereNull('zoho_status');
                }
            })
            ->update(['zoho_status' => 'sending', 'zoho_claimed_at' => now()]);

        $payment = $payment->fresh(['order.items']) ?? $payment;

        if ($claim !== 1) {
            return $payment;
        }

        $order = $payment->order;

        try {
            if ($order === null || ! self::sendable($payment)) {
                throw new ZohoRefused('There is no payment here to send.');
            }

            if ($refusal = self::refusal($order)) {
                throw new ZohoRefused($refusal);
            }

            $zoho = new ZohoBooks;

            $payment->status === PaymentStatus::Refunded
                ? self::creditNote($payment, $order, $zoho, $actor)
                : self::customerPayment($payment, $order, $zoho, $actor);
        } catch (Throwable $e) {
            self::failed($payment, $order, $e, $manual);
        }

        return $payment->fresh() ?? $payment;
    }

    /** Rows waiting, due another attempt, or never asked about because their account was chosen later. */
    public static function sweep(int $limit = 20): int
    {
        if (! ZohoSettings::ready() || ! ZohoSettings::sendsPayments() || ! ZohoSettings::scopeCurrent()) {
            return 0;
        }

        $due = Payment::query()
            ->where(function ($q) {
                $q->where(fn ($pending) => $pending->where('zoho_status', 'pending')
                    ->where('zoho_next_attempt_at', '<=', now()->subMinutes(2)))
                    ->orWhere(fn ($failed) => $failed->where('zoho_status', 'failed')
                        ->where('zoho_attempts', '<', ZohoInvoices::MAX_ATTEMPTS)
                        ->where('zoho_next_attempt_at', '<=', now()))
                    ->orWhere(fn ($stale) => $stale->where('zoho_status', 'sending')
                        ->where('zoho_claimed_at', '<', now()->subMinutes(self::CLAIM_MINUTES)));
            })
            ->orderBy('zoho_next_attempt_at')->orderBy('id')
            ->limit($limit)
            ->get();

        foreach ($due as $payment) {
            self::run($payment);
        }

        // Rows nothing was ever asked of, on invoiced orders, for a way of
        // paying that has an account now — it may have been chosen since.
        // Narrowed to those ways in SQL, or rows that can never be sent
        // would fill the window and starve the ones that can.
        $methods = ZohoSettings::methodsWithAccounts();
        $late = $methods === [] ? collect() : Payment::query()
            ->whereNull('zoho_status')
            ->whereIn('status', [PaymentStatus::Paid->value, PaymentStatus::Refunded->value])
            ->whereHas('order', fn ($order) => $order->where('zoho_status', 'created')->whereIn('payment_method', $methods))
            // Eager: `consider()` reads the order, and a lazy load on a row
            // from a collection throws outside production.
            ->with('order')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        $late->each(fn (Payment $payment) => self::consider($payment));

        return $due->count() + $late->count();
    }

    /**
     * Why a row on this order cannot be sent now, or null. The words the
     * console's button answers with.
     */
    public static function refusal(Order $order): ?string
    {
        $method = (string) $order->payment_method;

        return match (true) {
            ! ZohoSettings::ready() => ZohoSettings::enabled()
                ? 'Zoho Books is not fully set up: '.implode(' ', ZohoSettings::missing())
                : 'Zoho Books invoices are switched off.',
            ! ZohoSettings::sendsPayments() => 'Sending payments to Zoho Books is switched off.',
            ! ZohoSettings::scopeCurrent() => 'Zoho was connected before this site recorded payments there. Disconnect and connect it again under Store → Settings.',
            $order->zoho_status !== 'created' || blank($order->zoho_invoice_id) => 'This order has no Zoho Books invoice yet. Its payments follow once the invoice is made.',
            ZohoSettings::accountFor($method) === '' => 'No Zoho Books account is chosen for '.(ZohoSettings::ACCOUNT_METHODS[$method] ?? 'this way of paying').'. Choose one under Store → Settings.',
            default => null,
        };
    }

    /* ------------------------------------------------------ what Zoho is sent */

    /**
     * A payment that arrived, as Zoho is asked to record it.
     *
     * @return array<string, mixed>
     */
    public static function paymentPayload(Payment $payment, Order $order, string $customerId, float $applied): array
    {
        return [
            'customer_id' => $customerId,
            'payment_mode' => self::mode($payment, $order),
            'amount' => ZohoInvoices::rupees((int) $payment->amount_paise),
            'date' => self::date($payment)->toDateString(),
            'reference_number' => self::reference($payment, $order),
            'description' => self::description($payment, $order),
            'account_id' => ZohoSettings::accountFor((string) $order->payment_method),
            'invoices' => [['invoice_id' => (string) $order->zoho_invoice_id, 'amount_applied' => $applied]],
        ];
    }

    /**
     * A refund, as the credit note Zoho is asked to make for it.
     *
     * What it lists depends on what is known about what came back:
     *
     *   - the whole order refunded in one go — the invoice's own lines and
     *     its discount, so the note cancels the invoice line for line;
     *   - a refund that came from a return whose received items add up to
     *     exactly what was refunded — those items;
     *   - anything else (a partial refund by agreement, a return refunded at
     *     a different figure) — one line for the amount, taxed as the order
     *     was. An honest total with no invented item list.
     *
     * @return array<string, mixed>
     */
    public static function creditNotePayload(Payment $payment, Order $order, string $customerId): array
    {
        $order->loadMissing('items');

        $place = ZohoInvoices::placeOfSupply($order);
        $tax = ZohoSettings::taxFor($place);
        $amount = (int) $payment->amount_paise;

        $payload = [
            'customer_id' => $customerId,
            'date' => self::date($payment)->toDateString(),
            'reference_number' => self::reference($payment, $order),
            'is_inclusive_tax' => true,
            'gst_treatment' => filled($order->gstin) ? 'business_gst' : 'consumer',
            'notes' => self::description($payment, $order),
        ];

        if (filled($order->gstin)) {
            $payload['gst_no'] = strtoupper(trim((string) $order->gstin));
        }
        if ($place !== null) {
            $payload['place_of_supply'] = $place;
        }

        if ($amount === (int) $order->total_paise) {
            $payload['line_items'] = $order->items->map(fn ($item) => ZohoInvoices::line($item, (int) $item->quantity, $tax))->values()->all();

            return $payload + ZohoInvoices::discount($order);
        }

        if (($returned = self::returnedLines($payment, $order, $tax)) !== null) {
            $payload['line_items'] = $returned;

            return $payload;
        }

        $payload['line_items'] = [[
            'name' => "Refund — order {$order->order_number}",
            'rate' => ZohoInvoices::rupees($amount),
            'quantity' => 1,
            'tax_id' => $tax,
        ]];

        return $payload;
    }

    /* ----------------------------------------------------------- internals */

    private static function customerPayment(Payment $payment, Order $order, ZohoBooks $zoho, ?User $actor): void
    {
        $reference = self::reference($payment, $order);
        $amount = ZohoInvoices::rupees((int) $payment->amount_paise);

        $id = $payment->zoho_id ?: $zoho->findPayment($reference);
        $adopted = filled($id);

        if (! $adopted) {
            $invoice = $zoho->invoice((string) $order->zoho_invoice_id);
            $owed = round((float) ($invoice['balance'] ?? 0), 2);

            // Nothing owed: somebody recorded this payment in Zoho by hand.
            // Recording it again would leave the customer in credit there.
            if ($owed <= 0) {
                self::finish($payment, ['zoho_status' => 'skipped', 'zoho_error' => null, 'zoho_next_attempt_at' => null]);
                ZohoInvoices::trail($order, 'Zoho Books: the payment of '.Money::format((int) $payment->amount_paise).' was not recorded — the invoice is already paid there.', $actor);

                return;
            }

            $id = $zoho->createPayment(self::paymentPayload($payment, $order, (string) $invoice['customer_id'], min($amount, $owed)));
        }

        self::finish($payment, [
            'zoho_status' => 'sent', 'zoho_id' => (string) $id, 'zoho_error' => null,
            'zoho_synced_at' => now(), 'zoho_next_attempt_at' => null,
        ]);

        ZohoInvoices::trail($order, 'Zoho Books: payment of '.Money::format((int) $payment->amount_paise)
            .($adopted ? ' linked to the one already recorded there.' : ' recorded against invoice '.($order->invoice_number ?: $order->zoho_invoice_id).'.'), $actor);
    }

    private static function creditNote(Payment $payment, Order $order, ZohoBooks $zoho, ?User $actor): void
    {
        // The money in before the money out: a payment on this order that
        // has not reached Zoho yet is sent first, so the invoice is paid
        // there before a credit note is set against it. Whatever becomes of
        // those attempts, the refund still goes ahead — Zoho's own balance
        // decides below how the credit is used.
        $order->payments()->where('status', PaymentStatus::Paid->value)
            ->where('id', '<', $payment->id)
            ->where(fn ($q) => $q->whereNull('zoho_status')->orWhereIn('zoho_status', ['pending', 'failed']))
            ->orderBy('id')->get()
            ->each(function (Payment $earlier) use ($order) {
                self::consider($earlier->setRelation('order', $order));
                self::run($earlier->fresh() ?? $earlier);
            });

        $invoiceId = (string) $order->zoho_invoice_id;

        // 1. The credit note: the one already made, or a new one.
        $noteId = $payment->zoho_id;
        $number = $payment->zoho_number;
        $adopted = filled($noteId);

        if (! $adopted) {
            $existing = $zoho->findCreditNote(self::reference($payment, $order));
            $adopted = $existing !== null;

            $note = $existing ?? $zoho->createCreditNote(
                self::creditNotePayload($payment, $order, (string) $zoho->invoice($invoiceId)['customer_id']),
            );

            $noteId = (string) $note['creditnote_id'];
            $number = filled($note['creditnote_number'] ?? null) ? Str::limit((string) $note['creditnote_number'], 64, '') : null;

            // Written down before anything else is asked: from here a retry
            // finds this note and can only finish using it.
            self::finish($payment, ['zoho_id' => $noteId, 'zoho_number' => $number], status: false);
        }

        // 2. What of it is still unused, by Zoho's own count.
        $unused = round((float) ($zoho->creditNote((string) $noteId)['balance'] ?? 0), 2);
        $appliedNow = 0.0;
        $refundedNow = 0.0;

        // 3. Against what is still owed on the invoice.
        if ($unused > 0) {
            $owed = round((float) ($zoho->invoice($invoiceId)['balance'] ?? 0), 2);

            if ($owed > 0) {
                $appliedNow = min($unused, $owed);
                $zoho->applyCreditNote((string) $noteId, $invoiceId, $appliedNow);
                $unused = round($unused - $appliedNow, 2);
            }
        }

        // 4. The rest went back to the customer, out of the account it came into.
        if ($unused > 0) {
            $refundId = $zoho->refundCreditNote((string) $noteId, [
                'date' => self::date($payment)->toDateString(),
                'refund_mode' => self::mode($payment, $order),
                'reference_number' => Str::limit((string) ($payment->reference ?: self::reference($payment, $order)), 100, ''),
                'amount' => $unused,
                'from_account_id' => ZohoSettings::accountFor((string) $order->payment_method),
                'description' => self::description($payment, $order),
            ]);
            $refundedNow = $unused;

            self::finish($payment, ['zoho_refund_id' => $refundId !== '' ? $refundId : null], status: false);
        }

        self::finish($payment, [
            'zoho_status' => 'sent', 'zoho_error' => null, 'zoho_synced_at' => now(), 'zoho_next_attempt_at' => null,
        ]);

        $what = match (true) {
            $appliedNow > 0 && $refundedNow > 0 => ', part set against the invoice and '.number_format($refundedNow, 2).' paid back',
            $appliedNow > 0 => ', set against the invoice',
            $refundedNow > 0 => ', paid back from the account',
            default => '',
        };

        ZohoInvoices::trail($order, 'Zoho Books: credit note '.($number ?: $noteId).' for '.Money::format((int) $payment->amount_paise)
            .($adopted ? ' linked' : ' made').$what.'.', $actor);
    }

    /**
     * The items a return sent back, when they add up to exactly this refund.
     *
     * @return list<array<string, mixed>>|null
     */
    private static function returnedLines(Payment $payment, Order $order, string $tax): ?array
    {
        if ((int) $order->discount_paise > 0) {
            return null; // A discounted order's lines do not add up to what was paid.
        }

        $return = OrderReturn::query()->where('refund_payment_id', $payment->id)->with('items')->first();

        if ($return === null) {
            return null;
        }

        $lines = [];
        $sum = 0;

        foreach ($return->items as $returned) {
            $item = $order->items->firstWhere('id', $returned->order_item_id);
            $quantity = (int) ($returned->received_quantity ?? $returned->quantity);

            if ($item === null || $quantity < 1) {
                continue;
            }

            $lines[] = ZohoInvoices::line($item, $quantity, $tax);
            $sum += $quantity * (int) $item->unit_price_paise;
        }

        return $lines !== [] && $sum === (int) $payment->amount_paise ? $lines : null;
    }

    /** Zoho's own names for how money moved. */
    private static function mode(Payment $payment, Order $order): string
    {
        return match ((string) $order->payment_method) {
            'cod' => 'cash',
            'bank_transfer' => 'banktransfer',
            'gateway' => str_contains(strtolower((string) $payment->method), 'card') ? 'creditcard' : 'others',
            default => 'others',
        };
    }

    /** What an accountant reconciling the bank statement would look for. */
    private static function description(Payment $payment, Order $order): string
    {
        $parts = ["Order {$order->order_number}"];

        if (filled($payment->gateway_payment_id)) {
            $parts[] = ucfirst((string) $payment->gateway).' '.$payment->gateway_payment_id;
        }
        if (filled($payment->reference)) {
            $parts[] = 'Reference '.$payment->reference;
        }
        if (filled($payment->method) && (string) $order->payment_method !== 'gateway') {
            $parts[] = (string) $payment->method;
        }
        // What whoever recorded it wrote — a return's refund names the return.
        if (filled($payment->note)) {
            $parts[] = Str::limit(trim((string) $payment->note), 120, '…');
        }

        return Str::limit(implode(' · ', $parts), 240, '…');
    }

    /** The day the money moved — never the day a retry happened to succeed. */
    private static function date(Payment $payment): Carbon
    {
        return Carbon::instance($payment->paid_at ?? $payment->created_at ?? now())->timezone(config('app.timezone'));
    }

    private static function failed(Payment $payment, ?Order $order, Throwable $e, bool $manual): void
    {
        $attempts = min(255, (int) $payment->zoho_attempts + 1);
        $wait = self::BACKOFF_MINUTES[min($attempts, count(self::BACKOFF_MINUTES)) - 1];
        $words = $e instanceof ZohoRefused ? $e->getMessage() : 'Something went wrong on this server while sending it.';

        self::finish($payment, [
            'zoho_status' => 'failed',
            'zoho_attempts' => $attempts,
            'zoho_error' => Str::limit($words, 480, '…'),
            'zoho_next_attempt_at' => now()->addMinutes($wait),
        ]);

        if (! $e instanceof ZohoRefused) {
            logger()->warning('Zoho Books: a payment attempt failed here', ['payment' => $payment->id, 'error' => $e->getMessage()]);
        }

        // Said once in the order's trail: when a person pressed the button,
        // and when the automatic attempts have run out.
        if ($order !== null && ($manual || $attempts === ZohoInvoices::MAX_ATTEMPTS)) {
            $what = $payment->status === PaymentStatus::Refunded ? 'credit note' : 'payment';
            ZohoInvoices::trail($order, "Zoho Books {$what} for ".Money::format((int) $payment->amount_paise).' not recorded: '.$words);
        }
    }

    /**
     * Write columns without a model event, and release the claim when the
     * attempt is over.
     *
     * @param  array<string, mixed>  $attributes
     */
    private static function finish(Payment $payment, array $attributes, bool $status = true): void
    {
        if ($status) {
            $attributes['zoho_claimed_at'] = null;
        }

        DB::table('payments')->where('id', $payment->id)->update($attributes + ['updated_at' => now()]);
        $payment->forceFill($attributes)->syncOriginal();
    }
}
