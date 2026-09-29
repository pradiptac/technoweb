<?php

namespace App\Console\Commands;

use App\Support\Backups\BackupWorker;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * One run of the backup worker: a restore, a backup, or starting one the
 * schedule wants. Every minute from `routes/console.php`; see `BackupWorker`
 * for why this is the scheduler's job and not the queue's.
 */
class BackupsWork extends Command
{
    protected $signature = 'technoware:backups-work {--seconds= : How long to keep starting new work}';

    protected $description = 'Advance any running backup or restore, and start a scheduled backup when one is due';

    public function handle(): int
    {
        $seconds = (int) ($this->option('seconds') ?: config('backups.budget_seconds', 40));
        $this->line(BackupWorker::run(CarbonImmutable::now()->addSeconds(max(5, $seconds))));

        return self::SUCCESS;
    }
}
