<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\V1\Admin\NotFoundHitController;
use App\Models\NotFoundHit;
use Illuminate\Console\Command;

/**
 * Deletes missing-page addresses nobody has asked for lately.
 *
 * Ranges on `last_seen_at`, never `first_seen_at`, for the reason the client
 * error prune gives: an address first requested a year ago and again this
 * morning is a current one. An ignored row ages out on the same clock — ignoring
 * says "not worth a redirect", not "remember this for ever", and an address
 * still being asked for refreshes its own row.
 *
 * Ninety days is a fixed figure rather than a setting: the list is a worklist,
 * and a month of quiet is long enough to be sure an address is dead for good.
 */
class PruneNotFoundHits extends Command
{
    protected $signature = 'technoware:prune-not-found';

    protected $description = 'Delete missing-page addresses not requested for ninety days';

    public function handle(): int
    {
        $days = NotFoundHitController::RETENTION_DAYS;

        $deleted = NotFoundHit::where('last_seen_at', '<', now()->subDays($days))->delete();

        $this->info("Deleted {$deleted} missing-page address(es) not requested for more than {$days} day(s).");

        return self::SUCCESS;
    }
}
