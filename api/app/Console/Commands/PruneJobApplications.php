<?php

namespace App\Console\Commands;

use App\Models\JobApplication;
use App\Models\Setting;
use Illuminate\Console\Command;

/**
 * Deletes applications, and their CVs, past the retention period.
 *
 * This is the most sensitive personal data the product holds: a name, a phone
 * number, an employment history and a CV, given by somebody who is not a
 * customer and has no account to come back and remove it themselves. Keeping it
 * indefinitely is a decision nobody took; this makes the deletion the default.
 *
 * The file goes with the row — enforced by the model's `deleting` hook rather
 * than here, so it holds however a record is removed. A pruned application that
 * leaves a CV on disk has not been deleted, it has been hidden.
 */
class PruneJobApplications extends Command
{
    protected $signature = 'technoware:prune-applications {--dry-run : Count what would go, delete nothing}';

    protected $description = 'Delete job applications and their CVs past the configured retention period';

    /** A hiring round takes months. Below this the log would delete live candidates. */
    public const MINIMUM_DAYS = 30;

    public function handle(): int
    {
        $configured = (int) Setting::get('application_retention_days', 180);
        $days = max(self::MINIMUM_DAYS, $configured);

        if ($configured < self::MINIMUM_DAYS) {
            $this->warn("Retention is set to {$configured} days; using the {$days}-day floor instead.");
        }

        $cutoff = now()->subDays($days);
        $stale = JobApplication::where('created_at', '<', $cutoff);

        if ($this->option('dry-run')) {
            $this->line("{$stale->count()} applications are older than {$cutoff->toDateString()}.");

            return self::SUCCESS;
        }

        /*
         * Deleted one at a time, not with a mass `delete()`.
         *
         * A mass delete skips model events, and the model event is what removes
         * the CV from disk. Fast and wrong here means a folder of strangers'
         * CVs that no record points at any more.
         */
        $deleted = 0;
        $stale->chunkById(200, function ($applications) use (&$deleted) {
            foreach ($applications as $application) {
                $application->delete();
                $deleted++;
            }
        });

        $this->info("Pruned {$deleted} applications, and their CVs, older than {$days} days.");

        return self::SUCCESS;
    }
}
