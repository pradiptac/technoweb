<?php

namespace App\Jobs;

use App\Enums\PublishStatus;
use App\Models\NewsletterSuppression;
use App\Models\StockNotice;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Notifications\BackInStock;
use App\Support\Notifier;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Tell everybody waiting on a shelf that something arrived on it.
 *
 * Queued from `StockLedger::record()` on every positive movement — the one
 * place stock ever goes *up*, so nothing can put something on a shelf and
 * forget to say so. It **re-checks the shelf when it runs** rather than
 * trusting the movement that queued it: an adjustment can be corrected a
 * second later, and a queue drained once a minute would otherwise announce
 * a delivery that was already sold or already typed away.
 *
 * ## Idempotent by the row, not the run
 *
 * `notified_at` is stamped per notice as it goes out, and only rows without
 * a stamp are read — so a job that runs twice for one arrival, or two jobs
 * queued by two movements in the same minute, tell each person once. A
 * person already told is not told again until they ask again, which clears
 * the stamp (`StockNotice::arm()`).
 *
 * ## What it never does
 *
 * It never writes to an address on the newsletter's suppression list —
 * that list is "do not mail this person" whatever they signed up for, and
 * an unsubscribe must hold across every kind of message the site sends.
 * And it never throws on a send: every message goes through `Notifier`,
 * which logs and swallows, because a dead mail server must not leave a
 * failed job re-sending the first half of the list on every retry.
 */
class SendStockNotices implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(public readonly int $productId, public readonly ?int $variationId = null) {}

    public function handle(): void
    {
        $product = StoreProduct::query()->with('variations')->find($this->productId);

        if ($product === null || $product->status !== PublishStatus::Published) {
            return;
        }

        $variation = null;

        if ($this->variationId !== null) {
            $variation = $product->variations->firstWhere('id', $this->variationId);

            if (! $variation instanceof StoreProductVariation) {
                return;
            }

            $variation->setRelation('product', $product);
        }

        /*
         * Which rows this arrival answers. A notice for one variation is
         * answered by that variation being buyable; a notice for the product
         * ("any of them") by the product being buyable — which, for a product
         * with variations, is any active one having stock.
         */
        $query = StockNotice::query()->waiting()->where('store_product_id', $product->id);

        $variationReady = $variation !== null && $variation->inStock() ? $variation->id : null;
        $productReady = $product->inStock();

        if ($variationReady === null && ! $productReady) {
            return;
        }

        $query->where(function ($q) use ($variationReady, $productReady) {
            if ($variationReady !== null) {
                $q->orWhere('store_product_variation_id', $variationReady);
            }

            if ($productReady) {
                $q->orWhereNull('store_product_variation_id');
            }
        });

        foreach ($query->orderBy('id')->cursor() as $notice) {
            if (NewsletterSuppression::has($notice->email)) {
                continue;
            }

            // The variation the notice was about, or none: the email names
            // the configuration somebody asked for, not the one that arrived.
            $about = $notice->store_product_variation_id === null
                ? null
                : $product->variations->firstWhere('id', $notice->store_product_variation_id);

            Notifier::to($notice->email, new BackInStock($notice, $product, $about instanceof StoreProductVariation ? $about : null));

            $notice->forceFill(['notified_at' => now()])->save();
        }
    }
}
