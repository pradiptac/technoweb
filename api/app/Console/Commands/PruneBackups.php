<?php

namespace App\Console\Commands;

use App\Models\Backup;
use App\Models\BackupRestore;
use App\Support\Backups\BackupRunner;
use App\Support\Backups\RestoreMode;
use App\Support\Backups\RestoreRunner;
use App\Support\Backups\Retention;
use Illuminate\Console\Command;

/**
 * Marks a backup or restore whose worker stopped coming back as failed —
 * a server rebooted mid-run, a cron entry removed — so the screen stops
 * waiting and the next scheduled backup can start. Then applies retention,
 * which an interrupted backup never reached.
 */
class PruneBackups extends Command
{
    public const STUCK_MINUTES = 30;

    protected $signature = 'technoware:prune-backups';

    protected $description = 'Fail backups and restores whose worker stopped, and apply retention';

    public function handle(): int
    {
        $stuck = 0;

        Backup::query()->inFlight()->where('updated_at', '<', now()->subMinutes(self::STUCK_MINUTES))->get()
            ->each(function (Backup $backup) use (&$stuck) {
                BackupRunner::fail($backup, 'The backup stopped without finishing — the backup worker was interrupted. The next scheduled backup will start afresh.');
                $stuck++;
            });

        BackupRestore::query()->inFlight()->where('updated_at', '<', now()->subMinutes(self::STUCK_MINUTES))->get()
            ->each(function (BackupRestore $restore) use (&$stuck) {
                RestoreRunner::fail($restore, 'The restore stopped without finishing — the backup worker was interrupted.');
                $stuck++;
            });

        if (RestoreMode::active() && ! BackupRestore::query()->inFlight()->exists()) {
            RestoreMode::off();
        }

        Retention::apply();
        $this->info("Marked {$stuck} stalled backup(s) or restore(s) as failed.");

        return self::SUCCESS;
    }
}
