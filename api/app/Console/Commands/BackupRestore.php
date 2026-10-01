<?php

namespace App\Console\Commands;

use App\Models\Backup;
use App\Models\BackupRestore as RestoreModel;
use App\Support\Backups\BackupWorker;
use App\Support\Backups\Destinations\Destinations;
use App\Support\Backups\Manifest;
use App\Support\Backups\RestoreRunner;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * Restore from a terminal — the disaster-recovery door.
 *
 * On a fresh server the database that remembered the backups is the thing
 * that is gone, so this reads the destination directly: `--list` shows the
 * backup folders it holds (newest first), and naming one restores its whole
 * chain. The destination's credentials come from Settings, so on a fresh
 * install run `migrate --seed`, save the destination under Backups → Settings
 * (or `php artisan tinker` the rows), then run this.
 */
class BackupRestore extends Command
{
    protected $signature = 'technoware:backup-restore
        {destination? : s3, gdrive, ftp — or local, to restore a backup this server remembers}
        {folder? : The backup folder, as --list prints it}
        {--list : List the backups the destination holds}
        {--scope=both : database, files or both}
        {--prune : Delete files that were not in the backup}
        {--force : Do not ask for confirmation}';

    protected $description = 'Restore the database and files from a backup';

    public function handle(): int
    {
        $destination = (string) $this->argument('destination');

        if ($destination === '' || ($destination !== 'local' && ! in_array($destination, Destinations::KEYS, true))) {
            $this->error('Name a destination: local, '.implode(', ', Destinations::KEYS).'.');

            return self::INVALID;
        }

        if ($this->option('list') || ! $this->argument('folder')) {
            return $this->list($destination);
        }

        $folder = (string) $this->argument('folder');
        $scope = (string) $this->option('scope');

        if (! $this->option('force') && ! $this->confirm("Replace the {$scope} on this server with {$folder}? A safety copy of the database is taken first.")) {
            return self::FAILURE;
        }

        try {
            $restore = RestoreRunner::plan(
                $destination === 'local' ? ['kind' => 'local', 'folder' => $folder] : ['kind' => 'remote', 'destination' => $destination, 'folder' => $folder],
                $scope,
                (bool) $this->option('prune'),
                userName: 'Command line',
            );
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        while (in_array($restore->fresh()?->status, RestoreModel::IN_FLIGHT, true)) {
            $this->line(BackupWorker::run(CarbonImmutable::now()->addSeconds(30)));
        }

        $restore->refresh();
        $this->line($restore->status === 'completed' ? 'Restored.' : "{$restore->status}: {$restore->error}");

        return $restore->status === 'completed' ? self::SUCCESS : self::FAILURE;
    }

    private function list(string $destination): int
    {
        if ($destination === 'local') {
            $rows = Backup::query()->done()->latest('id')->limit(50)->get()
                ->map(fn ($b) => [$b->folder, $b->type, $b->created_at?->toDateTimeString(), implode(', ', $b->restorableFrom())]);
            $this->table(['Folder', 'Type', 'Made', 'Restorable from'], $rows);

            return self::SUCCESS;
        }

        $dest = Destinations::make($destination);
        $folders = array_filter($dest->folders(), [Manifest::class, 'validFolder']);
        rsort($folders);
        $rows = [];

        foreach (array_slice($folders, 0, 50) as $folder) {
            $complete = $dest->size($folder, 'manifest.json') !== null;
            $rows[] = [$folder, str_contains($folder, '-full-') ? 'full' : 'incremental', $complete ? 'complete' : 'unfinished upload'];
        }

        $this->table(['Folder', 'Type', 'State'], $rows);

        return self::SUCCESS;
    }
}
