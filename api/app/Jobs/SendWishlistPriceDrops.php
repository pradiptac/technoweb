<?php

namespace App\Jobs;

use App\Enums\MessageEvent;
use App\Models\StoreProduct;
use App\Models\WishlistItem;
use App\Notifications\WishlistPriceDrop;
use App\Support\Messaging\Messenger;
use App\Support\Messaging\QuietHours;
use App\Support\Money;
use App\Support\Notifier;
use App\Support\Store\WishlistMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Tell wishlist holders a price came down.
 *
 * Queued when a store product's or a variation's `price_paise` falls (the
 * models' `updated` hooks, after commit). It re-reads every line of the
 * product rather than trusting the edit that queued it, because a product's
 * price reaches every line that has no variation price of its own.
 *
 * ## The rule, and "once per drop"
 *
 * A line is told when the price now is at least `store_price_drop_min_percent`
 * (default 5) below its **reference**: the price when it was saved, or the
 * price the holder was last told about, whichever is lower. Telling somebody
 * records the price told (`price_drop_notified_paise`), so the same drop is
 * never news twice — a price wobbling back up and down to the same figure
 * tells nobody — and only a further fall from there is. Claimed with a
 * conditional update on that column, so two jobs cannot both send.
 *
 * A drop on something that cannot be bought right now waits: "cheaper, and
 * you cannot have it" is not good news, and the line is left unclaimed so the
 * next price change after it is back still measures from the same reference.
 * Quiet hours, the suppression list and a list nobody can be written to are
 * the back-in-stock job's rules exactly.
 */
class SendWishlistPriceDrops implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(public readonly int $productId) {}

    /**
     * Queue a check for a product whose price moved, if anybody saved it.
     *
     * Guarded, because it runs inside a model's `updated` hook: a product
     * edit that has been saved must not be refused over a wishlist. After
     * commit, because the product form saves inside a transaction and a
     * worker can be faster than the commit.
     */
    public static function watch(int $productId): void
    {
        try {
            if (WishlistItem::where('store_product_id', $productId)->exists()) {
                self::dispatch($productId)->afterCommit();
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    public function handle(): void
    {
        $product = StoreProduct::query()->with('variations')->find($this->productId);

        if ($product === null) {
            return;
        }

        $percent = WishlistMail::minimumDropPercent();

        $due = WishlistItem::query()
            ->where('store_product_id', $product->id)
            ->with(['variation', 'wishlist.customer'])
            ->orderBy('id')
            ->get()
            ->each(fn (WishlistItem $line) => $line->setRelation('product', $product))
            ->filter(function (WishlistItem $line) use ($percent) {
                $reference = self::reference($line);

                // Whole paise, no floats: now × 100 ≤ reference × (100 − p).
                return $line->currentPricePaise() * 100 <= $reference * (100 - $percent) && $line->buyable();
            });

        if ($due->isEmpty()) {
            return;
        }

        if (! QuietHours::allows()) {
            self::dispatch($this->productId)->delay(QuietHours::nextOpening());

            return;
        }

        foreach ($due as $line) {
            $list = $line->wishlist;
            $address = $list !== null ? WishlistMail::address($list) : null;

            if ($list === null || $address === null) {
                continue;
            }

            $old = self::reference($line);
            $new = $line->currentPricePaise();

            $query = WishlistItem::whereKey($line->id);
            if ($line->price_drop_notified_paise === null) {
                $query->whereNull('price_drop_notified_paise');
            } else {
                $query->where('price_drop_notified_paise', $line->price_drop_notified_paise);
            }

            if ($query->update(['price_drop_notified_paise' => $new, 'price_drop_notified_at' => now()]) !== 1) {
                continue;
            }

            Notifier::to($address, new WishlistPriceDrop($line, $old, $new));

            try {
                Messenger::notify(
                    MessageEvent::WishlistPriceDrop,
                    WishlistMail::recipient($list),
                    WishlistMail::baseVars($list) + [
                        'product_name' => WishlistMail::productName($line),
                        'product_url' => WishlistMail::productUrl($line),
                        'old_price' => Money::format($old),
                        'new_price' => Money::format($new),
                    ],
                );
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    /** What a drop is measured from: the price saved, or the price last told, whichever is lower. */
    private static function reference(WishlistItem $line): int
    {
        return min($line->price_at_save, $line->price_drop_notified_paise ?? PHP_INT_MAX);
    }
}
