<?php

namespace App\Support\Store;

use App\Enums\DigitalCodeStatus;
use App\Enums\OrderStatus;
use App\Models\DigitalCode;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Setting;
use App\Notifications\ActivationProcedureIssued;
use App\Support\Notifier;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Handing over activation codes, immediately after payment.
 *
 * **Whether it happens by itself is a setting**, `digital_auto_fulfil`, and both
 * answers are real. Automatic is what a licence buyer expects — they paid for a
 * key and want it now, and a shop that makes them wait for office hours has
 * sold them a worse product than the one down the road. Manual is what a
 * business wants while it is watching a new gateway settle, or while codes are
 * bought in from a supplier per order.
 *
 * Two rules run through all of it.
 *
 * **A code is assigned once.** Not by care at the call site: by a conditional
 * `UPDATE ... WHERE status = 'available'` with the affected row count checked,
 * inside a transaction holding a lock on the order line. Two webhook deliveries
 * racing, two workers on a queue, somebody pressing a button twice — every one
 * of those issues the same licence to two customers in the naive version, and
 * only the database refusing the second write actually holds.
 *
 * A unique index on `order_item_id` looks like the obvious guarantee and is the
 * wrong one: three licences on one line need three codes, so it would enforce
 * "one code per order line" instead. It was written that way first and failed
 * the moment a test bought three.
 *
 * **Running out is not a failure.** The order is paid; the money cannot be
 * un-taken. So a product with no codes left leaves the line unfulfilled, writes
 * why into the order's trail and leaves it for a person — which is the brief's
 * own instruction, and the opposite of failing the payment or duplicating the
 * order.
 */
class DigitalFulfilment
{
    /**
     * Whether codes are handed over the moment payment lands.
     *
     * Compared against **both** shapes a setting can arrive in, and the first
     * cut got this wrong in a way that is worth writing down. `Setting::get()`
     * casts by the row's declared type, so a `boolean` row returns a real
     * `false` — and `!== '0'` is therefore true for a setting that is switched
     * off. Automatic fulfilment ran with the toggle set to manual, and the only
     * thing that caught it was a test asserting the codes were *still there*.
     *
     * The frontend has the mirror image of this trap, documented in
     * `lib/site-settings.ts`: over the wire a setting is a string, and `"0"` is
     * truthy in JavaScript.
     *
     * Absent means on. A digital order sitting untouched is the surprising
     * outcome, and this setting exists to turn that off deliberately.
     */
    public static function isAutomatic(): bool
    {
        $raw = Setting::get('digital_auto_fulfil');

        if ($raw === null) {
            return true;
        }

        return $raw !== false && $raw !== '0' && $raw !== 0;
    }

    /**
     * Assign what can be assigned for a paid order.
     *
     * Safe to call more than once: a line that already has a code is skipped,
     * which is what makes this callable from a webhook that arrives twice and
     * from a person pressing a button afterwards.
     *
     * @return array{assigned: int, short: array<int, string>}
     */
    public static function fulfil(Order $order, bool $force = false): array
    {
        if (! $order->status->isPaid()) {
            // Nothing is issued for money that has not arrived. The brief says
            // so and it is the one rule in this file worth no argument at all.
            return ['assigned' => 0, 'short' => []];
        }

        if (! $force && ! self::isAutomatic()) {
            return ['assigned' => 0, 'short' => []];
        }

        /*
         * `items.product` too: the procedure is resolved per product, and
         * `preventLazyLoading` is on outside production, so reading
         * `$item->product` in the sender would throw rather than quietly costing
         * a query — which is the point of that setting.
         */
        $order->loadMissing('items.product');

        $assigned = 0;
        $short = [];
        $issuedFor = [];

        foreach ($order->items as $item) {
            if (! $item->type?->needsCode()) {
                continue;
            }

            /*
             * One code per *unit*, not per line — and the whole line is issued
             * under a lock.
             *
             * Somebody buying three licences needs three keys, so a unique
             * index on `order_item_id` is the wrong constraint: it would
             * enforce one code per line. What makes this safe instead is the
             * row lock below plus the conditional claim inside it. Two
             * settlements racing on one order serialise here, so the count of
             * what is already held is read *after* the other one has finished
             * rather than beside it.
             */
            $issued = DB::transaction(function () use ($item, $order, &$short) {
                $line = OrderItem::whereKey($item->id)->lockForUpdate()->first();

                if ($line === null) {
                    return 0;
                }

                $held = DigitalCode::where('order_item_id', $line->id)->count();
                $taken = 0;

                for ($n = $held; $n < $line->quantity; $n++) {
                    if (self::claim($line, $order) === null) {
                        $short[] = $line->name;

                        break;
                    }

                    $taken++;
                }

                return $taken;
            });

            $assigned += $issued;

            if ($issued > 0) {
                $issuedFor[] = $item;
            }
        }

        if ($short !== []) {
            $names = implode(', ', array_unique($short));

            $order->history()->create([
                'to_status' => $order->status->value,
                'note' => "Paid, but no activation code was available for: {$names}. Add codes and fulfil by hand.",
            ]);

            /*
             * Logged at `warning` deliberately: both `.env` files ship
             * `LOG_LEVEL=warning`, so an `info` here would be discarded and the
             * only trace of a customer waiting for a licence would be a line in
             * the order's own history that nobody is watching.
             */
            Log::warning('Digital codes ran out', [
                'order' => $order->order_number,
                'products' => array_values(array_unique($short)),
            ]);
        }

        if ($assigned > 0) {
            $order->history()->create([
                'to_status' => $order->status->value,
                'note' => $assigned === 1
                    ? 'One activation code was issued.'
                    : "{$assigned} activation codes were issued.",
            ]);

            self::sendProcedures($order, $issuedFor);
        }

        return ['assigned' => $assigned, 'short' => array_values(array_unique($short))];
    }

    /**
     * The instructions that turn a code into a working licence.
     *
     * Sent **here**, when the codes exist, rather than with the receipt: under
     * manual fulfilment those are different moments and sometimes different
     * days, and telling somebody how to activate a licence nobody has issued
     * yet generates the enquiry it was written to prevent.
     *
     * Lines sharing a procedure share an email. A basket holding two licences
     * from one vendor has one set of steps, and two identical messages arriving
     * together reads as a bug in the shop rather than as thoroughness - while
     * two products with genuinely different procedures cannot be merged into a
     * single message without the customer having to work out which half applies
     * to which key.
     *
     * Through `Notifier`, so a dead mail server cannot undo an order that is
     * already paid and already fulfilled.
     *
     * @param  array<int, OrderItem>  $items
     */
    private static function sendProcedures(Order $order, array $items): void
    {
        /** @var array<string, array{procedure: array<string, mixed>, names: array<int, string>}> $groups */
        $groups = [];

        foreach ($items as $item) {
            $procedure = ActivationProcedure::for($item->product);

            if ($procedure['html'] === null && $procedure['pdf_path'] === null) {
                // Nothing predefined for this product, and nothing to invent.
                // The receipt has already said the code is ready.
                continue;
            }

            $key = md5(($procedure['html'] ?? '').'|'.($procedure['pdf_path'] ?? ''));

            $groups[$key]['procedure'] = $procedure;
            $groups[$key]['names'][] = $item->name;
        }

        foreach ($groups as $group) {
            Notifier::to($order->customer_email, new ActivationProcedureIssued(
                $order,
                array_values(array_unique($group['names'])),
                $group['procedure'],
            ));
        }
    }

    /**
     * Take one code out of stock for a line, or return null if there is none.
     *
     * The claim is a **conditional UPDATE with the affected row count checked**,
     * not a read followed by a write. The read-then-write version passes every
     * test written on one thread and is a race in production: two settlements
     * select the same row, both see `available`, both write. Same shape as
     * `SignInCodes::consume()` and the campaign claim.
     */
    private static function claim(OrderItem $item, Order $order): ?DigitalCode
    {
        // Runs inside the caller's transaction, which is already holding the
        // order line. A second transaction here would nest for no reason.
        $candidate = DigitalCode::query()
            ->where('store_product_id', $item->store_product_id)
            ->where('status', DigitalCodeStatus::Available)
            ->orderBy('id')
            ->first();

        if ($candidate === null) {
            return null;
        }

        $claimed = DigitalCode::whereKey($candidate->id)
            ->where('status', DigitalCodeStatus::Available)
            ->update([
                'status' => DigitalCodeStatus::Delivered,
                'order_id' => $order->id,
                'order_item_id' => $item->id,
                'assigned_at' => now(),
                'delivered_at' => now(),
            ]);

        // Somebody else won the race for that row. A genuinely empty pool is
        // the `null` above; this is a collision, and the caller tries again.
        return $claimed === 1 ? $candidate->refresh() : null;
    }

    /**
     * Whether an order is waiting on somebody to issue a code.
     *
     * Asked by the console's queue and by the order page, so both read one
     * answer rather than each deciding what "outstanding" means.
     */
    public static function isOutstanding(Order $order): bool
    {
        if (! $order->status->isPaid() || $order->status === OrderStatus::Cancelled) {
            return false;
        }

        $order->loadMissing('items');

        foreach ($order->items as $item) {
            if (! $item->type?->needsCode()) {
                continue;
            }

            if (DigitalCode::where('order_item_id', $item->id)->count() < $item->quantity) {
                return true;
            }
        }

        return false;
    }

    /**
     * Add codes to a product's inventory.
     *
     * Duplicates are **reported, not silently dropped**: pasting the same block
     * twice is an ordinary mistake, and quietly ignoring the second paste hides
     * the fact that the number of codes did not go up by what somebody expected.
     *
     * @param  array<int, string>  $codes
     * @return array{added: int, duplicates: int}
     */
    public static function import(int $productId, array $codes): array
    {
        $added = 0;
        $duplicates = 0;

        foreach ($codes as $raw) {
            $code = trim($raw);

            if ($code === '') {
                continue;
            }

            try {
                DigitalCode::create([
                    'store_product_id' => $productId,
                    'code' => $code,
                    'status' => DigitalCodeStatus::Available,
                ]);

                $added++;
            } catch (QueryException) {
                // The unique index on (product, fingerprint) is what recognises
                // this — the ciphertext differs every time, so nothing else can.
                $duplicates++;
            }
        }

        return ['added' => $added, 'duplicates' => $duplicates];
    }
}
