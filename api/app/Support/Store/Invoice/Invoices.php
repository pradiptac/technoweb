<?php

namespace App\Support\Store\Invoice;

use App\Models\Media;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Support\Store\Zoho\ZohoSettings;
use Carbon\CarbonInterface;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\View;
use Throwable;

/**
 * Issuing the shop's own GST invoice (0.176.0, `docs/store.md` "The GST
 * invoice").
 *
 * The product shipped with the invoice **uploaded**, or made in the
 * customer's own Zoho Books, and `CLAUDE.md`'s scope limits said so in as
 * many words: "never generated here, a decision about GST compliance rather
 * than about scope." The client asked for it on 2026-10-14. What that
 * decision was protecting against is worth keeping written down, because
 * two thirds of it still bite:
 *
 *   - **The CGST/SGST against IGST split** was the easy part and is safe:
 *     arithmetic over a figure already stored, no new number anywhere.
 *   - **A single rate** was the real hazard, and is why `store_gst_percent`
 *     and a rate per product were built first. A shop still cannot price at
 *     two rates inside one *product*, and nothing here pretends it can.
 *   - **HSN codes** were absent entirely, and an invoice without them is not
 *     a tax invoice. `store_products.hsn` and `invoice_hsn_default` are the
 *     answer, and a line with neither prints a dash rather than a guess.
 *
 * Three things this will not do, each deliberate:
 *
 *   - **It never overwrites an uploaded invoice.** Somebody who attached a
 *     PDF has made a decision, and a machine quietly replacing it would be
 *     the worst failure available here.
 *   - **It never runs while Zoho Books is on.** Two systems issuing numbers
 *     into one series is two series, and the one that files the return is
 *     Zoho's.
 *   - **It never fails the order.** `consider()` is guarded like `Notifier`
 *     and `Webhooks`: a paid order must still be paid when the PDF library
 *     throws.
 */
final class Invoices
{
    /** Written onto `orders.invoice_source` so the three ways are told apart. */
    public const SOURCE = 'generated';

    /**
     * Switched on, configured, and not standing on Zoho's toes.
     *
     * Zoho wins when it is ready, because an install with both switched on
     * has told us twice where its books live and the answer that files the
     * return is the accounting system's.
     */
    public static function ready(): bool
    {
        return InvoiceSettings::ready() && ! ZohoSettings::ready();
    }

    /**
     * An order is due its invoice once it is paid.
     *
     * Paid, not dispatched, and not placed: an invoice is a demand for money
     * that has been met, `paid_at` is this application's one definition of
     * met, and a cash-on-delivery order that nobody has banked yet is not
     * one. A shop that wants the invoice in the parcel has the button.
     */
    public static function due(Order $order): bool
    {
        return $order->paid_at !== null;
    }

    /**
     * Called from the order's own `updated` hook. Never throws, ever.
     *
     * Everything below runs inside whatever transaction moved the order, so
     * every write it makes goes through the query builder — a model save
     * here would re-enter this method through the same hook.
     */
    public static function consider(Order $order): void
    {
        try {
            if (! self::ready() || ! self::due($order) || filled($order->invoice_number)) {
                return;
            }

            self::issue($order);
        } catch (Throwable $e) {
            // The order stands. The console's button is the way to try
            // again, and this line is the only trace there is — at warning,
            // because both `.env` files ship `LOG_LEVEL=warning` and an
            // `info` would be discarded.
            Log::warning('Could not issue the GST invoice for order '.$order->order_number.': '.$e->getMessage());
        }
    }

    /**
     * Issue it: claim a number, render the PDF, store it.
     *
     * Returns the order as it now stands. `$force` is a person pressing the
     * button on an order that already has a generated invoice — it keeps the
     * number and re-renders the file, which is what somebody wants after
     * correcting the registered address. It does **not** re-issue over an
     * uploaded invoice, whoever is asking.
     */
    public static function issue(Order $order, ?User $actor = null, bool $force = false): Order
    {
        if (filled($order->invoice_path) && $order->invoice_source !== self::SOURCE) {
            return $order;
        }

        $number = $order->invoice_number;
        $issued = false;

        if (blank($number)) {
            $number = self::claim($order);
            $issued = $number !== null;
        } elseif (! $force) {
            return $order;
        }

        if (blank($number)) {
            // Somebody else claimed it between the check and the claim.
            return $order->fresh(['items']) ?? $order;
        }

        $order = $order->fresh(['items.product']) ?? $order;

        $path = "orders/{$order->order_number}/".self::fileName($number);

        Storage::disk('local')->put($path, self::pdf($order));

        // Through the query builder: this runs inside the `updated` hook
        // that called it, and a model save would fire the hook again.
        Order::whereKey($order->id)->toBase()->update([
            'invoice_path' => $path,
            'invoice_source' => self::SOURCE,
            'updated_at' => now(),
        ]);

        $order = $order->fresh(['items.product']) ?? $order;

        if ($issued || $actor !== null) {
            $order->history()->create([
                'to_status' => $order->status->value,
                'note' => $issued
                    ? "Tax invoice {$number} issued."
                    : "Tax invoice {$number} re-made.",
                'user_id' => $actor?->id,
                'actor_name' => $actor?->name,
            ]);
        }

        return $order;
    }

    /**
     * Take the next number in the series, atomically.
     *
     * Two things have to hold and they are different problems. **One invoice
     * per order** is the conditional update — `whereNull('invoice_number')`
     * with the affected row count checked, the shape every claim in this
     * codebase uses, so two simultaneous calls produce one invoice rather
     * than two. **No number issued twice** is the row lock on the read of
     * the highest one: inside the transaction, with an index on the column,
     * MySQL holds the range and the second claimant waits.
     *
     * Returns the number, or null when somebody else got there first.
     */
    private static function claim(Order $order): ?string
    {
        return DB::transaction(function () use ($order) {
            $prefix = InvoiceSettings::prefix();
            $year = self::financialYear(now());
            $series = "{$prefix}/{$year}/";

            $last = Order::query()
                ->where('invoice_number', 'like', $series.'%')
                ->orderByDesc('invoice_number')
                ->lockForUpdate()
                ->value('invoice_number');

            $next = $last === null ? 1 : ((int) substr((string) $last, strlen($series))) + 1;
            $number = $series.str_pad((string) $next, 5, '0', STR_PAD_LEFT);

            $claimed = Order::whereKey($order->id)
                ->whereNull('invoice_number')
                ->toBase()
                ->update([
                    'invoice_number' => $number,
                    'invoice_date' => now()->toDateString(),
                    'updated_at' => now(),
                ]);

            return $claimed === 1 ? $number : null;
        });
    }

    /**
     * The Indian financial year an instant falls in: `2026-27`.
     *
     * April to March, not January to December. A tax invoice series runs by
     * the financial year and restarts at one on the first of April, which is
     * the only reason this is not `now()->year`.
     */
    public static function financialYear(CarbonInterface $at): string
    {
        $start = $at->month >= 4 ? $at->year : $at->year - 1;

        return $start.'-'.substr((string) ($start + 1), -2);
    }

    /** A filename somebody can find in a folder: `INV-2026-27-00001.pdf`. */
    private static function fileName(string $number): string
    {
        return 'invoice-'.str_replace(['/', '\\', ' '], '-', $number).'.pdf';
    }

    /** The invoice as HTML — the console's print view, and what the PDF renders. */
    public static function html(Order $order): string
    {
        $invoice = GstInvoice::for($order);

        return View::make('invoice.tax-invoice', [
            'invoice' => $invoice,
            'logo' => self::image(Setting::get('logo_path')),
            'signature' => self::image(InvoiceSettings::signaturePath()),
            'signatory' => InvoiceSettings::signatory(),
            'bank' => InvoiceSettings::bankDetails(),
            'terms' => InvoiceSettings::terms(),
            'declaration' => InvoiceSettings::declaration(),
        ])->render();
    }

    /** The same document, as PDF bytes. */
    public static function pdf(Order $order): string
    {
        $options = new Options;
        // The logo and the signature are files on this server's own public
        // disk, and dompdf will not read a local path unless told it may.
        // Nothing user-supplied reaches `src`: both are media-library paths
        // resolved through `image()` below.
        $options->set('isRemoteEnabled', true);
        $options->set('defaultFont', 'DejaVu Sans');
        $options->set('chroot', [public_path(), storage_path('app/public')]);

        $pdf = new Dompdf($options);
        $pdf->loadHtml(self::html($order), 'UTF-8');
        $pdf->setPaper('A4');
        $pdf->render();

        return (string) $pdf->output();
    }

    /**
     * A media-library path as something dompdf can load.
     *
     * An absolute file path rather than a URL: dompdf fetching its own
     * server over HTTP is a request that has to resolve, authenticate and
     * come back before a PDF can be written, and on a host whose own domain
     * does not resolve from inside it never does. A path that is not in the
     * library, or whose file has gone, yields null and the invoice prints
     * without the picture — never a broken image box on a tax document.
     */
    private static function image(mixed $path): ?string
    {
        if (! is_string($path) || blank($path)) {
            return null;
        }

        if (! Media::withTrashed()->where('path', $path)->exists()) {
            return null;
        }

        $absolute = Storage::disk('public')->path($path);

        return is_file($absolute) ? $absolute : null;
    }

    /** Why this order has no generated invoice, as a sentence, or null. */
    public static function refusalFor(Order $order): ?string
    {
        if (ZohoSettings::ready()) {
            return 'Zoho Books is making this shop’s invoices, so one is not generated here.';
        }

        if (! InvoiceSettings::enabled()) {
            return 'GST invoices are switched off.';
        }

        $missing = InvoiceSettings::missing();

        if ($missing !== []) {
            return 'Invoicing is not fully set up: '.implode(' ', $missing);
        }

        if (filled($order->invoice_path) && $order->invoice_source !== self::SOURCE) {
            return 'This order already has an invoice that was uploaded by hand.';
        }

        if (! self::due($order)) {
            return 'This order has not been paid yet.';
        }

        return null;
    }
}
