<?php

namespace App\Support\Store\Zoho;

use App\Enums\OrderStatus;
use App\Jobs\CreateZohoInvoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * An order's invoice in Zoho Books (0.134.0, docs/store.md "Zoho Books
 * invoices"): when one is due, what it says, and making it once.
 *
 * **Nothing here can fail an order.** `consider()` is called from the
 * order's own `updated` hook and swallows everything, the rule `Notifier`
 * and `Webhooks` keep: a dispatch that is already saved must not be undone
 * because an accounts system is down.
 *
 * **One invoice per order, however often it is tried.** Three things hold
 * that, each for a different way it could go wrong:
 *
 *   - `zoho_status` is claimed with a conditional UPDATE, so two workers —
 *     the queued job and the sweeper, or two presses of the button — cannot
 *     both be making it;
 *   - Zoho is asked first whether an invoice already carries this order's
 *     number as its reference, so a crash between "Zoho made it" and "we
 *     wrote that down" is adopted on the next attempt rather than repeated;
 *   - an order that already has an invoice somebody uploaded is skipped:
 *     two invoices for one sale is a question an accountant cannot answer.
 *
 * What Zoho returns is stored where an uploaded invoice always was —
 * `invoice_number`, `invoice_date`, and the PDF at `invoice_path` — so the
 * customer's order page and the console's download need to know nothing
 * about where the invoice came from.
 */
final class ZohoInvoices
{
    /** Tried this many times before it is left for a person. */
    public const MAX_ATTEMPTS = 5;

    /** How long after each failure the next attempt waits, in minutes. */
    private const BACKOFF_MINUTES = [5, 30, 120, 720];

    /** A claim older than this was abandoned by whatever held it. */
    private const CLAIM_MINUTES = 10;

    /**
     * The order has just changed: is its invoice due?
     *
     * Marks it `pending` and queues the work, once. An order nothing has
     * been asked of keeps a null status, which is what an install with the
     * integration off looks like for ever.
     */
    public static function consider(Order $order): void
    {
        try {
            if ($order->zoho_status !== null || ! ZohoSettings::ready() || ! self::due($order)) {
                return;
            }

            // Query builder, and conditional: no model event (this is called
            // from one), and only the first caller's update finds the null.
            $claimed = Order::query()->whereKey($order->id)->whereNull('zoho_status')
                ->update(['zoho_status' => 'pending', 'zoho_next_attempt_at' => now()]);

            if ($claimed === 1) {
                $order->zoho_status = 'pending';
                $order->syncOriginalAttribute('zoho_status');

                CreateZohoInvoice::dispatch($order->id)->afterCommit();
            }
        } catch (Throwable $e) {
            logger()->warning('Zoho Books: could not queue an invoice', ['order' => $order->order_number, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Whether this order has reached the point its invoice is made at.
     *
     * "When dispatched" means dispatched for an order with something in a
     * box, and paid for one with nothing to ship — a licence has no dispatch
     * to wait for. Never for an order that was cancelled or refunded, or one
     * still waiting to be paid for online.
     */
    public static function due(Order $order): bool
    {
        if (in_array($order->status, [OrderStatus::PendingPayment, OrderStatus::Cancelled, OrderStatus::Refunded], true)) {
            return false;
        }

        if (ZohoSettings::when() === 'paid') {
            return $order->paid_at !== null;
        }

        $order->loadMissing('items');

        return $order->needsShipping() ? $order->dispatched_at !== null : $order->paid_at !== null;
    }

    /**
     * Make the invoice now. The queued job, the sweeper and the console's
     * button all end here.
     *
     * `$actor` is set when somebody pressed the button: their press goes
     * ahead whatever the attempt count says, and is named in the order's
     * trail. Returns the order as it now stands; never throws.
     */
    public static function run(Order $order, ?User $actor = null): Order
    {
        $manual = $actor !== null;

        $claim = Order::query()->whereKey($order->id)
            ->where(function ($q) use ($manual) {
                $q->whereIn('zoho_status', $manual ? ['pending', 'failed', 'skipped'] : ['pending', 'failed'])
                    ->orWhere(fn ($stale) => $stale->where('zoho_status', 'creating')->where('zoho_claimed_at', '<', now()->subMinutes(self::CLAIM_MINUTES)));

                if ($manual) {
                    $q->orWhereNull('zoho_status');
                }
            })
            ->update(['zoho_status' => 'creating', 'zoho_claimed_at' => now()]);

        $order = $order->fresh(['items']) ?? $order;

        if ($claim !== 1) {
            return $order;
        }

        try {
            if (! ZohoSettings::ready()) {
                throw new ZohoRefused(ZohoSettings::enabled()
                    ? 'Zoho Books is not fully set up: '.implode(' ', ZohoSettings::missing())
                    : 'Zoho Books invoices are switched off.');
            }

            // Somebody uploaded an invoice by hand before this ran.
            if ($order->zoho_invoice_id === null && filled($order->invoice_path)) {
                self::finish($order, ['zoho_status' => 'skipped', 'zoho_error' => null]);
                self::trail($order, 'Zoho Books: no invoice made — this order already has an uploaded invoice.', $actor);

                return $order->fresh(['items']) ?? $order;
            }

            self::create($order, new ZohoBooks, $actor);
        } catch (Throwable $e) {
            self::failed($order, $e, $manual);
        }

        return $order->fresh(['items']) ?? $order;
    }

    /** Orders whose invoice is waiting or due another attempt. The scheduler calls this. */
    public static function sweep(int $limit = 20): int
    {
        if (! ZohoSettings::ready()) {
            return 0;
        }

        $due = Order::query()
            ->where(function ($q) {
                $q->where(fn ($pending) => $pending->where('zoho_status', 'pending')
                    // Two minutes' grace: the queued job normally gets there first.
                    ->where('zoho_next_attempt_at', '<=', now()->subMinutes(2)))
                    ->orWhere(fn ($failed) => $failed->where('zoho_status', 'failed')
                        ->where('zoho_attempts', '<', self::MAX_ATTEMPTS)
                        ->where('zoho_next_attempt_at', '<=', now()))
                    ->orWhere(fn ($stale) => $stale->where('zoho_status', 'creating')
                        ->where('zoho_claimed_at', '<', now()->subMinutes(self::CLAIM_MINUTES)));
            })
            ->orderBy('zoho_next_attempt_at')
            ->limit($limit)
            ->get();

        foreach ($due as $order) {
            self::run($order);
        }

        return $due->count();
    }

    /**
     * The invoice, as Zoho is asked to make it.
     *
     * Prices here include GST, so `is_inclusive_tax` is on and every rate is
     * the price the customer saw. A coupon is an order-level discount taken
     * before tax, which is how the checkout worked the GST out: extracted
     * from what was actually charged.
     *
     * @return array<string, mixed>
     */
    public static function payload(Order $order, string $customerId): array
    {
        $order->loadMissing('items');

        $place = self::placeOfSupply($order);
        $tax = ZohoSettings::taxFor($place);

        $payload = [
            'customer_id' => $customerId,
            'reference_number' => $order->order_number,
            'date' => self::invoiceDate($order)->toDateString(),
            'is_inclusive_tax' => true,
            'gst_treatment' => filled($order->gstin) ? 'business_gst' : 'consumer',
            'line_items' => $order->items->map(fn (OrderItem $item) => array_filter([
                'name' => Str::limit($item->name.(filled($item->variation_name) ? " — {$item->variation_name}" : ''), 200, ''),
                'description' => filled($item->sku) ? "SKU {$item->sku}" : null,
                'rate' => self::rupees((int) $item->unit_price_paise),
                'quantity' => (int) $item->quantity,
                'tax_id' => $tax,
            ], fn ($value) => $value !== null))->values()->all(),
            'notes' => "Order {$order->order_number}",
        ];

        if (filled($order->gstin)) {
            $payload['gst_no'] = strtoupper(trim((string) $order->gstin));
        }

        if ($place !== null) {
            $payload['place_of_supply'] = $place;
        }

        if ((int) $order->discount_paise > 0) {
            $payload['discount'] = self::rupees((int) $order->discount_paise);
            $payload['discount_type'] = 'entity_level';
            $payload['is_discount_before_tax'] = true;
        }

        return $payload;
    }

    /**
     * The customer, as Zoho is asked to make one — only when no customer
     * there already has this email address.
     *
     * @return array<string, mixed>
     */
    public static function contactPayload(Order $order, ?string $nameSuffix = null): array
    {
        $company = trim((string) $order->company_name);
        $name = ($company !== '' ? $company : trim((string) $order->customer_name)).($nameSuffix ?? '');
        $billing = (array) ($order->billing_address ?? []);
        $shipping = (array) ($order->shipping_address ?? $order->billing_address ?? []);

        $payload = [
            'contact_name' => Str::limit($name, 200, ''),
            'contact_type' => 'customer',
            'customer_sub_type' => filled($order->gstin) ? 'business' : 'individual',
            'billing_address' => self::address($order, $billing),
            'shipping_address' => self::address($order, $shipping),
            'contact_persons' => [array_filter([
                'first_name' => Str::limit(trim((string) $order->customer_name), 100, ''),
                'email' => $order->customer_email,
                'mobile' => $order->customer_phone,
                'is_primary_contact' => true,
            ], fn ($value) => filled($value) || $value === true)],
            'gst_treatment' => filled($order->gstin) ? 'business_gst' : 'consumer',
        ];

        if ($company !== '') {
            $payload['company_name'] = Str::limit($company, 200, '');
        }
        if (filled($order->gstin)) {
            $payload['gst_no'] = strtoupper(trim((string) $order->gstin));
        }
        if (($place = IndianStates::code($billing['state'] ?? null)) !== null) {
            $payload['place_of_contact'] = $place;
        }

        return $payload;
    }

    /** Where the goods go, as Zoho's two-letter code; the billing state when nothing ships. Null when unplaceable. */
    public static function placeOfSupply(Order $order): ?string
    {
        $shipping = (array) ($order->shipping_address ?? []);
        $billing = (array) ($order->billing_address ?? []);

        return IndianStates::code($shipping['state'] ?? null) ?? IndianStates::code($billing['state'] ?? null);
    }

    /* ----------------------------------------------------------- internals */

    private static function create(Order $order, ZohoBooks $zoho, ?User $actor): void
    {
        // 1. Adopt what a previous attempt made and did not get to record.
        $invoice = $order->zoho_invoice_id !== null
            ? ['invoice_id' => $order->zoho_invoice_id, 'invoice_number' => $order->invoice_number, 'date' => $order->invoice_date?->toDateString()]
            : $zoho->findInvoice($order->order_number);

        $adopted = $invoice !== null;

        if ($invoice === null) {
            $customerId = $zoho->findContact((string) $order->customer_email) ?? self::createContact($order, $zoho);
            $invoice = $zoho->createInvoice(self::payload($order, $customerId));
        }

        $invoiceId = (string) $invoice['invoice_id'];

        // 2. Written down before anything else is asked of Zoho: from here a
        //    retry adopts this invoice and can only finish the job.
        self::finish($order, [
            'zoho_invoice_id' => $invoiceId,
            'invoice_number' => filled($invoice['invoice_number'] ?? null) ? Str::limit((string) $invoice['invoice_number'], 64, '') : $order->invoice_number,
            'invoice_date' => filled($invoice['date'] ?? null) ? Carbon::parse((string) $invoice['date'])->toDateString() : $order->invoice_date,
        ], status: false);

        // 3. Sent, so it is a receivable and not a draft. An invoice this
        //    attempt adopted may already be sent — or paid, or void — and
        //    Zoho says so by refusing; that refusal is not a failure to make
        //    the invoice. An outage or a lost connection still is.
        try {
            $zoho->markSent($invoiceId);
        } catch (ZohoRefused $e) {
            if (! $adopted || $e->isAuthorisation() || $e->status === 0 || $e->status === 429 || $e->status >= 500) {
                throw $e;
            }
        }

        // 4. The PDF, where an uploaded invoice has always lived.
        if (blank($order->invoice_path) || ! Storage::disk('local')->exists((string) $order->invoice_path)) {
            $path = "orders/{$order->order_number}/zoho-{$invoiceId}.pdf";
            Storage::disk('local')->put($path, $zoho->pdf($invoiceId));
            self::finish($order, ['invoice_path' => $path], status: false);
        }

        self::finish($order, [
            'zoho_status' => 'created',
            'zoho_error' => null,
            'zoho_synced_at' => now(),
            'zoho_next_attempt_at' => null,
        ]);

        $number = filled($order->invoice_number) ? (string) $order->invoice_number : $invoiceId;
        $note = $adopted ? "Zoho Books invoice {$number} linked to this order." : "Zoho Books invoice {$number} created.";

        // What Zoho worked the total out as, against what was charged. A
        // difference is told to the desk; it is not this application's to hide.
        if (! $adopted && isset($invoice['total']) && abs((int) round(((float) $invoice['total']) * 100) - (int) $order->total_paise) > 100) {
            $note .= ' Its total in Zoho ('.number_format((float) $invoice['total'], 2).') differs from this order\'s ('.number_format($order->total_paise / 100, 2).') — check the tax and discount there.';
        }

        self::trail($order, $note, $actor);
    }

    /** Zoho wants a customer's display name to be unique; two people can share one. */
    private static function createContact(Order $order, ZohoBooks $zoho): string
    {
        try {
            return $zoho->createContact(self::contactPayload($order));
        } catch (ZohoRefused $e) {
            if (! str_contains(strtolower($e->getMessage()), 'already exist')) {
                throw $e;
            }

            return $zoho->createContact(self::contactPayload($order, " ({$order->customer_email})"));
        }
    }

    private static function failed(Order $order, Throwable $e, bool $manual): void
    {
        $attempts = min(255, (int) $order->zoho_attempts + 1);
        $wait = self::BACKOFF_MINUTES[min($attempts, count(self::BACKOFF_MINUTES)) - 1];

        self::finish($order, [
            'zoho_status' => 'failed',
            'zoho_attempts' => $attempts,
            'zoho_error' => Str::limit($e instanceof ZohoRefused ? $e->getMessage() : 'Something went wrong on this server while making the invoice.', 480, '…'),
            'zoho_next_attempt_at' => now()->addMinutes($wait),
        ]);

        if (! $e instanceof ZohoRefused) {
            logger()->warning('Zoho Books: an invoice attempt failed here', ['order' => $order->order_number, 'error' => $e->getMessage()]);
        }

        // Said once in the trail: when a person pressed the button, and when
        // the automatic attempts have run out and it is now theirs to fix.
        if ($manual || $attempts === self::MAX_ATTEMPTS) {
            self::trail($order, 'Zoho Books invoice not made: '.($e instanceof ZohoRefused ? $e->getMessage() : 'an error on this server.'));
        }
    }

    /**
     * Write columns without waking the order's own hooks — this is called
     * from inside one — and release the claim when the attempt is over.
     *
     * @param  array<string, mixed>  $attributes
     */
    private static function finish(Order $order, array $attributes, bool $status = true): void
    {
        if ($status) {
            $attributes['zoho_claimed_at'] = null;
        }

        DB::table('orders')->where('id', $order->id)->update($attributes + ['updated_at' => now()]);
        $order->forceFill($attributes)->syncOriginal();
    }

    private static function trail(Order $order, string $note, ?User $actor = null): void
    {
        $order->history()->create([
            'to_status' => $order->status->value,
            'note' => Str::limit($note, 480, '…'),
            'user_id' => $actor?->id,
            'actor_name' => $actor?->name,
        ]);
    }

    /** The day the sale became invoiceable — never the day a retry happened to succeed. */
    private static function invoiceDate(Order $order): Carbon
    {
        $at = ZohoSettings::when() === 'paid'
            ? $order->paid_at
            : ($order->dispatched_at ?? $order->paid_at);

        return Carbon::instance($at ?? now())->timezone(config('app.timezone'));
    }

    /**
     * @param  array<string, mixed>  $address
     * @return array<string, string>
     */
    private static function address(Order $order, array $address): array
    {
        return array_filter([
            'attention' => Str::limit(trim((string) $order->customer_name), 100, ''),
            'address' => Str::limit((string) ($address['line1'] ?? ''), 255, ''),
            'street2' => Str::limit((string) ($address['line2'] ?? ''), 255, ''),
            'city' => (string) ($address['city'] ?? ''),
            'state' => (string) ($address['state'] ?? ''),
            'zip' => (string) ($address['pin'] ?? ''),
            'country' => filled($address['country'] ?? null) ? (string) $address['country'] : 'India',
            'phone' => (string) ($order->customer_phone ?? ''),
        ], fn (string $value) => $value !== '');
    }

    /** Paise as the decimal Zoho takes. Two places, always exact: paise are integers. */
    private static function rupees(int $paise): float
    {
        return round($paise / 100, 2);
    }
}
