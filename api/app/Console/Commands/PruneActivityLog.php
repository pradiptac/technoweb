<?php

namespace App\Console\Commands;

use App\Models\Activity;
use App\Models\Setting;
use Illuminate\Console\Command;

/**
 * Deletes activity older than the configured retention period.
 *
 * The period is a setting rather than a constant because retention is a legal
 * and policy decision the client owns — this log is personal data about named
 * staff, and how long to keep it is not a developer's call.
 *
 * It is also the only thing in the product that removes rows from this table.
 * There is no delete endpoint and no screen offering one: a log the console can
 * prune to taste is not a log.
 */
class PruneActivityLog extends Command
{
    protected $signature = 'technoware:prune-activity {--dry-run : Count what would go, delete nothing}';

    protected $description = 'Delete activity log entries past the configured retention period';

    /**
     * Below this, the setting is ignored and this is used instead.
     *
     * A retention of zero would delete the log on the next run, and somebody
     * typing 0 into a settings field should not be able to destroy the audit
     * trail by accident. Thirty days is a floor, not a recommendation.
     */
    public const MINIMUM_DAYS = 30;

    public function handle(): int
    {
        $configured = (int) Setting::get('activity_retention_days', 90);
        $days = max(self::MINIMUM_DAYS, $configured);

        if ($configured < self::MINIMUM_DAYS) {
            $this->warn("Retention is set to {$configured} days; using the {$days}-day floor instead.");
        }

        $cutoff = now()->subDays($days);
        $query = Activity::where('created_at', '<', $cutoff);

        if ($this->option('dry-run')) {
            $this->line("{$query->count()} entries are older than {$cutoff->toDateString()}.");

            return self::SUCCESS;
        }

        // Chunked, because one unbounded DELETE on a table this append-heavy
        // is a lock held for as long as it takes.
        $deleted = 0;
        do {
            $batch = $query->limit(1000)->delete();
            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Pruned {$deleted} activity entries older than {$days} days.");

        return self::SUCCESS;
    }
}
