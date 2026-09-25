<?php

namespace App\Console\Commands;

use App\Models\Wishlist;
use Illuminate\Console\Command;

/**
 * Delete guest wishlists nobody has touched in six months.
 *
 * `POST /wishlist/items` mints a row for anybody who presses a heart, so the
 * table grows from the public internet and needs a floor under it the way
 * `carts` does. Only **guest** lists: an account's list is the customer's own
 * record and goes when the account does. 180 days matches the cookie the Next
 * server sets, so nothing is deleted while a browser still offers to remember
 * the list — the two numbers are one fact. Ranges on `updated_at`, which every
 * add, remove and move touches. Lines go with the list through the foreign key.
 */
class PruneWishlists extends Command
{
    protected $signature = 'technoware:prune-wishlists {--days=180 : How long an untouched guest wishlist is kept}';

    protected $description = 'Delete guest wishlists nobody has touched for six months';

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $cutoff = now()->subDays($days);
        $deleted = 0;

        do {
            $batch = Wishlist::guest()->where('updated_at', '<', $cutoff)->limit(500)->delete();
            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Deleted {$deleted} guest wishlist(s) untouched for more than {$days} day(s).");

        return self::SUCCESS;
    }
}
