<?php

namespace App\Jobs;

use App\Enums\MessageEvent;
use App\Models\StoreProduct;
use App\Models\WishlistItem;
use App\Notifications\WishlistBackInStock;
use App\Support\Messaging\Messenger;
use App\Support\Messaging\QuietHours;
use App\Support\Money;
use App\Support\Notifier;
use App\Support\Store\WishlistMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Keep a product's wishlist lines in step with its shelf, and tell whoever is
 * owed a "back in stock".
 *
 * Queued from `StockLedger::record()` on **every** movement, in either
 * direction — the one place stock changes — and it trusts nothing the
 * movement said: it re-reads the shelf when it runs. A line whose shelf is
 * empty is *armed* (`awaiting_stock_at`); a line armed and now buyable is
 * told once and disarmed. That is the whole of "once, re-arming when it goes
 * out again": a sale that empties the shelf arms the line for the next
 * arrival, and a restock of something that never ran out tells nobody.
 *
 * ## Once, even with two jobs
 *
 * Each line is **claimed** with a conditional update before anything is sent
 * — the row that goes from armed to told is the row that gets an email — so
 * two movements a second apart, two jobs, or a job re-dispatched at nine
 * o'clock beside another tell each person once.
 *
 * ## Quiet hours
 *
 * A back-in-stock note is promotional. Outside the window the lines are still
 * armed, and the job re-dispatches itself delayed to `QuietHours::nextOpening()`
 * instead of sending; whatever is still owed then goes out. The suppression
 * list is read at send time, and a line whose list cannot be written to is left
 * armed rather than stamped — a lifted suppression, or an address a guest gives
 * later, is still owed its notice.
 */
class SyncWishlistStock implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(public readonly int $productId) {}

    public function handle(): void
    {
        $product = StoreProduct::query()->with('variations')->find($this->productId);

        if ($product === null) {
            return;
        }

        $lines = WishlistItem::query()
            ->where('store_product_id', $product->id)
            ->with(['variation', 'wishlist.customer'])
            ->orderBy('id')
            ->get()
            ->each(fn (WishlistItem $line) => $line->setRelation('product', $product));

        $owed = [];

        foreach ($lines as $line) {
            if (! $line->buyable()) {
                if ($line->awaiting_stock_at === null) {
                    WishlistItem::whereKey($line->id)->whereNull('awaiting_stock_at')->update(['awaiting_stock_at' => now()]);
                }

                continue;
            }

            if ($line->awaiting_stock_at !== null) {
                $owed[] = $line;
            }
        }

        if ($owed === []) {
            return;
        }

        if (! QuietHours::allows()) {
            self::dispatch($this->productId)->delay(QuietHours::nextOpening());

            return;
        }

        foreach ($owed as $line) {
            $list = $line->wishlist;
            $address = $list !== null ? WishlistMail::address($list) : null;

            if ($list === null || $address === null) {
                continue;
            }

            $claimed = WishlistItem::whereKey($line->id)
                ->whereNotNull('awaiting_stock_at')
                ->update(['awaiting_stock_at' => null, 'back_in_stock_notified_at' => now()]);

            if ($claimed !== 1) {
                continue;
            }

            Notifier::to($address, new WishlistBackInStock($line));

            self::guard(fn () => Messenger::notify(
                MessageEvent::WishlistBackInStock,
                WishlistMail::recipient($list),
                WishlistMail::baseVars($list) + [
                    'product_name' => WishlistMail::productName($line),
                    'product_url' => WishlistMail::productUrl($line),
                    'price' => Money::format($line->currentPricePaise()),
                ],
            ));
        }
    }

    /** The other channels must never undo an email already sent, the `Notifier` rule. */
    private static function guard(callable $send): void
    {
        try {
            $send();
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
