<?php

namespace App\Console\Commands;

use App\Models\Backup as BackupModel;
use App\Support\Backups\BackupRunner;
use App\Support\Backups\BackupWorker;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * Take a backup now, from a terminal.
 *
 * Without `--wait` it is queued for the worker the scheduler runs, exactly
 * like the console's "Back up now". With `--wait` this process works it
 * through to the end — for a server with no scheduler yet, or before a
 * deploy somebody is nervous about.
 */
class Backup extends Command
{
    protected $signature = 'technoware:backup
        {--type=auto : full, incremental or auto}
        {--wait : Work the backup through here instead of leaving it to the scheduler}';

    protected $description = 'Take a backup of the database and uploaded files';

    public function handle(): int
    {
        $type = (string) $this->option('type');

        if (! in_array($type, ['full', 'incremental', 'auto'], true)) {
            $this->error('--type is full, incremental or auto.');

            return self::INVALID;
        }

        if (BackupModel::query()->inFlight()->exists()) {
            $this->error('A backup is already running.');

            return self::FAILURE;
        }

        $backup = BackupRunner::start($type, 'manual', userName: 'Command line');
        $this->info("Started a {$backup->type} backup: {$backup->folder}");

        if (! $this->option('wait')) {
            $this->line('The scheduler will work it through within a minute.');

            return self::SUCCESS;
        }

        while (in_array($backup->fresh()?->status, BackupModel::IN_FLIGHT, true)) {
            $this->line(BackupWorker::run(CarbonImmutable::now()->addSeconds(30)));
        }

        $backup->refresh();
        $this->line("{$backup->status}: ".($backup->error ?? ($backup->destinations === []
            ? 'kept on this server only — no destination is switched on.'
            : 'every file reached every destination.')));

        return $backup->status === 'completed' ? self::SUCCESS : self::FAILURE;
    }
}
