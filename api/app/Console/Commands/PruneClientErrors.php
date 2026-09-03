<?php

namespace App\Console\Commands;

use App\Models\ClientError;
use App\Models\Setting;
use Illuminate\Console\Command;

/**
 * Deletes JavaScript failures nobody has seen for a while.
 *
 * Ranges on `last_seen_at`, never `first_seen_at`: a bug reported for the first
 * time a year ago and again this morning is a current bug, and dating it by
 * when it started would throw away the one that is actually happening. The same
 * distinction the cart prune makes between `updated_at` and `created_at`, and
 * the sales report between `placed_at` and `created_at`.
 *
 * **A resolved row is not deleted early.** Marking one dealt with is a
 * statement about the fix, not a request to forget it — and the recording path
 * re-opens a fingerprint the moment it recurs, which only works while the row
 * is still there. So both kinds age out on the same clock.
 *
 * Thirty days by default, with a **seven-day floor** so a typo cannot empty the
 * screen: the same guard the activity prune has at thirty, scaled to a list
 * that is about the present rather than about evidence.
 */
class PruneClientErrors extends Command
{
    protected $signature = 'technoware:prune-client-errors';

    protected $description = 'Delete client-side error reports past the configured retention period';

    public function handle(): int
    {
        $days = max(7, (int) (Setting::get('client_error_retention_days') ?? 30));

        $deleted = ClientError::where('last_seen_at', '<', now()->subDays($days))->delete();

        $this->info("Deleted {$deleted} client error(s) not seen for more than {$days} day(s).");

        return self::SUCCESS;
    }
}
