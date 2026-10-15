<?php

namespace App\Console\Commands;

use App\Support\Revisions;
use Illuminate\Console\Command;

/**
 * Sweeps page history (0.145.0): revisions whose record is gone, and any
 * older than a year beyond each record's newest few. The cap of thirty per
 * record is enforced on insert; this is the part an insert cannot see.
 */
class PruneRevisions extends Command
{
    protected $signature = 'technoware:prune-revisions';

    protected $description = 'Delete revisions of records that no longer exist, and very old ones';

    public function handle(): int
    {
        [$orphans, $aged] = Revisions::prune();

        $this->info("Deleted {$orphans} orphaned revision(s) and {$aged} older than ".Revisions::MAX_AGE_DAYS.' day(s).');

        return self::SUCCESS;
    }
}
