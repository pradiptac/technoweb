<?php

namespace App\Console\Commands;

use App\Models\Cart;
use Illuminate\Console\Command;

/**
 * Deletes abandoned baskets.
 *
 * `carts` had nothing prune it, and it is the one table in the product that
 * grows from a plain **read**: `Cart::forToken(null)` mints and persists a row,
 * which is how a first "add to basket" gets a cart without the page that drew
 * the button having to make one. `lib/cart.ts` even claimed this command
 * existed — "The API prunes abandoned carts on its own schedule" — for as long
 * as it did not.
 *
 * Not a retention policy in the sense the activity log and the CV prune are.
 * Nothing here is evidence and nobody is entitled to see it: a row is a token,
 * a nullable customer, a coupon code and some pointers at products. So there is
 * no setting and no floor — a number in the console would be a decision nobody
 * has grounds to make.
 *
 * **Thirty days, matching the cookie.** `setCartToken` writes a 30-day cookie
 * because "a basket is a shopping list somebody comes back to". Deleting a cart
 * whose cookie is still live would empty a basket in front of somebody;
 * deleting one the browser has already forgotten cannot be noticed by anyone.
 * The two numbers are the same fact and want to stay in step.
 *
 * **A cart belonging to an order is not touched**, which needs no clause here:
 * an order snapshots its lines rather than pointing at a cart, so nothing
 * downstream reads one of these rows after checkout. `cart_items` goes with the
 * cart by foreign key.
 */
class PruneCarts extends Command
{
    protected $signature = 'technoware:prune-carts {--days=30 : How long an untouched basket is kept}';

    protected $description = 'Delete abandoned shopping baskets and their lines';

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $cutoff = now()->subDays($days);

        /*
         * `updated_at`, not `created_at`.
         *
         * A basket that was added to yesterday is thirty days old and in active
         * use; ranging on when the row was written would throw it away with
         * somebody's shopping in it.
         *
         * Deleted in chunks with a plain query rather than one model at a time:
         * unlike a media file or a CV there is no `deleting` hook and nothing on
         * disk to clean up, so model events buy nothing here and the table is
         * the one that grows fastest. Chunked so a long-neglected install does
         * not build one enormous transaction.
         */
        $deleted = 0;

        do {
            $batch = Cart::where('updated_at', '<', $cutoff)->limit(500)->delete();
            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Deleted {$deleted} basket(s) untouched for more than {$days} day(s).");

        return self::SUCCESS;
    }
}
