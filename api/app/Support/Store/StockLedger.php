<?php

namespace App\Support\Store;

use App\Enums\ProductType;
use App\Enums\StockMovementReason;
use App\Models\Order;
use App\Models\StockMovement;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

/**
 * The one place a stock movement is written.
 *
 * Every path that moves stock calls this, for the reason `SubscriberIntake` is
 * the only way onto the newsletter list and `LeadIntake` the only way into the
 * pipeline: a second writer is a second set of rules, and the two disagree the
 * first time one of them is changed. There are two callers today —
 * `Settlement::takeStock()` and the admin product form — and the report is
 * only as honest as their being the only two.
 *
 * ## It never fails what it is recording
 *
 * A throw here would fail a **settlement**, which is money that has already
 * arrived and cannot be un-taken, or refuse a product edit that has already
 * been saved. So every write is guarded and a failure is logged rather than
 * raised — the rule `Notifier` follows for mail and `LeadIntake` follows for
 * an enquiry. A missing ledger row is a gap in a report; a thrown exception
 * here is a customer charged for an order the shop says it never received.
 */
class StockLedger
{
    /**
     * Record one movement.
     *
     * `$delta` is signed: positive arrived, negative left. Zero is not a
     * movement and is dropped rather than written — an editor saving a product
     * form without touching the stock field would otherwise fill the ledger
     * with rows saying nothing happened, which is the fastest way to make a
     * report nobody reads.
     */
    public static function record(
        StoreProduct $product,
        ?StoreProductVariation $variation,
        int $delta,
        StockMovementReason $reason,
        ?int $balanceAfter = null,
        ?Order $order = null,
        ?string $note = null,
    ): ?StockMovement {
        if ($delta === 0) {
            return null;
        }

        try {
            $actor = Auth::user();

            return StockMovement::create([
                'store_product_id' => $product->id,
                'store_product_variation_id' => $variation?->id,
                // Snapshotted, so a rename cannot rewrite a report somebody
                // has already read and acted on.
                'product_name' => $product->name,
                'variation_name' => $variation?->name,
                'sku' => $variation?->sku ?? $product->sku,
                'delta' => $delta,
                'balance_after' => $balanceAfter,
                'reason' => $reason->value,
                'order_id' => $order?->id,
                'order_number' => $order?->order_number,
                'user_id' => $actor instanceof User ? $actor->id : null,
                'actor_name' => $actor instanceof User ? $actor->name : null,
                'note' => $note,
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return null;
        }
    }

    /**
     * The stock an order took when it was paid.
     *
     * Called from `Settlement::takeStock()` **per line and only when the
     * decrement actually happened** — that method already distinguishes "not
     * tracked" from "not enough" by the affected row count, and a ledger row
     * for a decrement that did not occur is a lie about the shelf.
     *
     * The level afterwards is re-read rather than computed. `decrement()` runs
     * in the database and returns a row count, not a value, and subtracting
     * locally would be this class's opinion of what the database did rather
     * than what it did.
     */
    public static function sale(
        Order $order,
        StoreProduct $product,
        ?StoreProductVariation $variation,
        int $quantity,
    ): ?StockMovement {
        $balance = $variation !== null
            ? StoreProductVariation::whereKey($variation->id)->value('stock')
            : StoreProduct::whereKey($product->id)->value('stock');

        return self::record(
            $product,
            $variation,
            -1 * abs($quantity),
            StockMovementReason::Sale,
            $balance === null ? null : (int) $balance,
            $order,
        );
    }

    /**
     * The difference between the stock a product had and the stock it has.
     *
     * Called by the admin product form after it saves. It compares rather than
     * being told, because the form posts a level and not a change: `40` in the
     * box means "there are forty", and only the row it replaced knows whether
     * that is thirty-six arriving or four being written off.
     *
     * A product that does not track stock records nothing. Its `stock` column
     * still holds whatever was last typed into it, so a level that "changed"
     * on an untracked service is a number nobody uses moving.
     *
     * @param  array<int|string, int>  $variationsBefore  variation id => stock
     */
    public static function adjusted(
        StoreProduct $product,
        int $productBefore,
        array $variationsBefore,
        bool $creating = false,
    ): void {
        $product->refresh()->loadMissing('variations');

        if (! $product->track_stock || $product->type !== ProductType::Physical) {
            return;
        }

        $reason = $creating ? StockMovementReason::Initial : StockMovementReason::Adjustment;

        /*
         * A product with variations keeps its own `stock` column and nothing
         * reads it — `inStock()` answers from the set — so recording it as a
         * movement would put stock into the report that the shop cannot sell.
         */
        if ($product->variations->isEmpty()) {
            self::record(
                $product,
                null,
                $product->stock - $productBefore,
                $reason,
                $product->stock,
                null,
                self::describe($productBefore, $product->stock),
            );

            return;
        }

        foreach ($product->variations as $variation) {
            // A variation that did not exist before started at zero, which
            // makes its opening level an arrival rather than a change.
            $before = (int) ($variationsBefore[$variation->id] ?? 0);
            $isNew = ! array_key_exists($variation->id, $variationsBefore);

            self::record(
                $product,
                $variation,
                $variation->stock - $before,
                $isNew ? StockMovementReason::Initial : $reason,
                $variation->stock,
                null,
                $isNew ? null : self::describe($before, $variation->stock),
            );
        }
    }

    /** What the level was and what it became, for somebody reading the row later. */
    private static function describe(int $before, int $after): string
    {
        return "Changed from {$before} to {$after}.";
    }
}
