<?php

namespace App\Console\Commands;

use App\Models\EditPresence;
use Illuminate\Console\Command;

/** Hourly (docs/notifications.md). A row unseen for a minute is already ignored; an hour is just tidying. */
class PruneEditPresence extends Command
{
    protected $signature = 'technoware:prune-edit-presence';

    protected $description = 'Delete edit-presence rows unseen for an hour';

    public function handle(): int
    {
        $n = EditPresence::query()->where('last_seen_at', '<', now()->subHour())->delete();
        $this->info("{$n} deleted.");

        return self::SUCCESS;
    }
}
