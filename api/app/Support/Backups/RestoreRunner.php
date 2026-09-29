<?php

namespace App\Support\Backups;

use App\Models\Backup;
use App\Models\BackupRestore;
use App\Models\Setting;
use App\Support\Backups\Destinations\Destination;
use App\Support\Backups\Destinations\Destinations;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * Puts a backup back, a step at a time.
 *
 * `pending → safety → downloading → importing → files → finishing → completed`
 *
 *  - **safety**: before a database is replaced, the current one is dumped to
 *    this server (a `pre_restore` backup), so a restore of the wrong backup
 *    is itself undoable.
 *  - **downloading**: only what is needed — the chosen backup's
 *    `database.sql.gz`, and every zip volume of its chain for files — in
 *    ranged chunks, each file checked against its sha256 before anything is
 *    replaced.
 *  - **importing**: restore mode on; every table but the preserved ones
 *    dropped; the dump run back through `SqlImporter`.
 *  - **files**: each volume of the chain extracted over the live tree, the
 *    full first, so a later backup's copy of a file wins. With
 *    `prune_missing`, files that were not in the chosen backup are removed.
 *  - **finishing**: `migrate` when the backup's schema is older than this
 *    code's, the settings cache dropped, restore mode off.
 *
 * Nothing thrown leaves `advance()`. A failure after the database started
 * being replaced says so, and names the safety copy to restore instead.
 */
final class RestoreRunner
{
    /**
     * Resolve and check a restore before anything is touched, and create its row.
     *
     * @param  array{kind: string, destination?: string, folder: string, from?: string}  $source
     */
    public static function plan(array $source, string $scope, bool $pruneMissing, ?int $userId = null, ?string $userName = null): BackupRestore
    {
        if (! in_array($scope, BackupRestore::SCOPES, true)) {
            throw new RuntimeException('Choose the database, the files, or both.');
        }

        if ($source['kind'] === 'local') {
            $backup = Backup::query()->where('folder', $source['folder'])->first() ?? throw new RuntimeException('That backup is not on record.');
            $from = $source['from'] ?? null;
            $available = $backup->restorableFrom();

            if ($available === []) {
                throw new RuntimeException('That backup cannot be restored: some part of its chain is not held complete anywhere.');
            }

            $from = in_array($from, $available, true) ? $from : $available[0];
            $chain = array_map(fn (Backup $b) => Manifest::build($b), $backup->chain());
            $source['from'] = $from;
        } else {
            $destination = Destinations::make((string) $source['destination']);
            $target = self::remoteManifest($destination, $source['folder']);
            $chain = [];

            foreach ([...(array) ($target['chain'] ?? []), $source['folder']] as $folder) {
                $chain[] = $folder === $source['folder'] ? $target : self::remoteManifest($destination, (string) $folder);
            }

            if ($chain[0]['type'] !== Backup::FULL) {
                throw new RuntimeException('That backup’s chain does not start with a full backup.');
            }

            $backup = Backup::query()->where('folder', $source['folder'])->first();
            $source['from'] = (string) $source['destination'];
        }

        $target = end($chain);
        $includes = (array) ($target['includes'] ?? []);

        if (in_array($scope, ['database', 'both'], true) && ! ($includes['database'] ?? false)) {
            throw new RuntimeException('That backup does not hold the database.');
        }

        if (in_array($scope, ['files', 'both'], true) && ! ($includes['public'] ?? false) && ! ($includes['private'] ?? false)) {
            throw new RuntimeException('That backup does not hold any files.');
        }

        if (in_array($scope, ['database', 'both'], true) && filled($target['schema'] ?? null) && strcmp((string) $target['schema'], Manifest::codeSchema()) > 0) {
            throw new RuntimeException('That backup was made by a newer version of this application (its newest migration is '.$target['schema'].'). Deploy that version first, then restore.');
        }

        if (BackupRestore::query()->inFlight()->exists() || Backup::query()->inFlight()->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)->exists()) {
            throw new RuntimeException('A backup or a restore is already running. Wait for it, or cancel it, first.');
        }

        return BackupRestore::query()->create([
            'backup_id' => $backup?->id,
            'source' => $source,
            'chain' => $chain,
            'scope' => $scope,
            'prune_missing' => $pruneMissing,
            'status' => 'pending',
            'progress' => [],
            'created_by' => $userId,
            'created_by_name' => $userName,
        ]);
    }

    /** @return array<string, mixed> */
    public static function remoteManifest(Destination $destination, string $folder): array
    {
        if (! Manifest::validFolder($folder)) {
            throw new RuntimeException('That is not a backup folder name.');
        }

        $size = $destination->size($folder, 'manifest.json');

        if ($size === null) {
            throw new RuntimeException("{$folder} has no manifest on {$destination->label()} — the upload never finished.");
        }

        return Manifest::parse($destination->read($folder, 'manifest.json', 0, min($size, 5 * 1024 * 1024)));
    }

    /** True once the restore has finished, one way or another. */
    public static function advance(BackupRestore $restore, CarbonImmutable $deadline): bool
    {
        try {
            $worked = false;

            while (in_array($restore->status, BackupRestore::IN_FLIGHT, true)) {
                if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                    return false;
                }

                if (BackupRestore::query()->whereKey($restore->id)->value('status') === 'cancelled') {
                    return true;
                }

                if (in_array($restore->status, ['importing', 'files', 'finishing'], true)) {
                    RestoreMode::on($restore->id);
                }

                $moved = match ($restore->status) {
                    'pending' => self::begin($restore),
                    'safety' => self::safety($restore, $deadline),
                    'downloading' => self::download($restore, $deadline),
                    'importing' => self::import($restore, $deadline),
                    'files' => self::files($restore, $deadline),
                    'finishing' => self::finish($restore),
                };

                $worked = true;

                if (! $moved) {
                    return false;
                }
            }

            return true;
        } catch (Throwable $e) {
            self::fail($restore, $e);

            return true;
        }
    }

    public static function fail(BackupRestore $restore, Throwable|string $why): void
    {
        $message = $why instanceof Throwable ? BackupRunner::sentence($why) : $why;

        if ($why instanceof Throwable) {
            Log::warning('A restore failed', ['restore' => $restore->id, 'error' => $why->getMessage()]);
        }

        if (in_array($restore->status, ['importing', 'files', 'finishing'], true) && $restore->restoresDatabase()) {
            $safety = $restore->safety_backup_id ? Backup::query()->find($restore->safety_backup_id) : null;
            $message .= ' The database was part-way through being replaced and may be incomplete.'
                .($safety ? ' Restore the safety copy taken just before ('.$safety->folder.') from the Backups screen.' : '');
        }

        $restore->update(['status' => 'failed', 'error' => $message, 'finished_at' => now()]);
        RestoreMode::off();

        $safety = $restore->safety_backup_id ? Backup::query()->find($restore->safety_backup_id) : null;

        if ($safety !== null && in_array($safety->status, Backup::IN_FLIGHT, true)) {
            BackupRunner::fail($safety, 'The restore it was taken for stopped.');
        }

        File::deleteDirectory(BackupPaths::restore($restore->id));
        BackupAlerts::failed('A restore failed: '.$message);
    }

    /** Stop a restore that has not replaced anything yet. No alert: somebody chose this. */
    public static function cancel(BackupRestore $restore): void
    {
        $restore->update(['status' => 'cancelled', 'error' => 'Cancelled before anything was replaced.', 'finished_at' => now()]);
        File::deleteDirectory(BackupPaths::restore($restore->id));
        $safety = $restore->safety_backup_id ? Backup::query()->find($restore->safety_backup_id) : null;

        if ($safety !== null && in_array($safety->status, Backup::IN_FLIGHT, true)) {
            $safety->update(['status' => 'cancelled', 'finished_at' => now(), 'error' => 'The restore it was taken for was cancelled.']);
            File::deleteDirectory(BackupPaths::staging($safety->uuid));
        }
    }

    private static function begin(BackupRestore $restore): bool
    {
        $restore->update(['started_at' => now()]);

        if (! $restore->restoresDatabase()) {
            $restore->update(['status' => 'downloading']);

            return true;
        }

        $safety = BackupRunner::start('full', 'pre_restore', $restore->created_by, $restore->created_by_name, ['database' => true, 'public' => false, 'private' => false], []);
        $restore->update(['status' => 'safety', 'safety_backup_id' => $safety->id]);

        return true;
    }

    private static function safety(BackupRestore $restore, CarbonImmutable $deadline): bool
    {
        $safety = Backup::query()->find($restore->safety_backup_id) ?? throw new RuntimeException('The safety copy disappeared before the restore could start.');

        if (! BackupRunner::advance($safety, $deadline)) {
            return false;
        }

        if (! in_array($safety->fresh()?->status, Backup::DONE, true)) {
            throw new RuntimeException('The safety copy of the current database could not be made ('.$safety->fresh()?->error.'). Nothing was restored.');
        }

        $restore->update(['status' => 'downloading']);

        return true;
    }

    /** @return list<array{uuid: string, folder: string, name: string, size: int, sha256: string}> */
    private static function needed(BackupRestore $restore): array
    {
        $chain = (array) $restore->chain;
        $target = end($chain);
        $needed = [];

        foreach ($chain as $manifest) {
            foreach ((array) $manifest['files'] as $file) {
                $isTarget = $manifest['folder'] === $target['folder'];
                $want = ($file['name'] === 'database.sql.gz' && $isTarget && $restore->restoresDatabase())
                    || (str_starts_with($file['name'], 'files-') && $restore->restoresFiles())
                    || ($file['name'] === 'index.json.gz' && $isTarget && $restore->restoresFiles() && $restore->prune_missing);

                if ($want) {
                    $needed[] = ['uuid' => (string) $manifest['uuid'], 'folder' => (string) $manifest['folder'], 'name' => (string) $file['name'], 'size' => (int) $file['size'], 'sha256' => (string) $file['sha256']];
                }
            }
        }

        return $needed;
    }

    /** Where a needed file is on this server: the backup's own staging copy, or the download. */
    private static function localPath(BackupRestore $restore, array $file): string
    {
        return ($restore->source['from'] ?? null) === 'local'
            ? BackupPaths::staging($file['uuid']).DIRECTORY_SEPARATOR.$file['name']
            : BackupPaths::restore($restore->id).DIRECTORY_SEPARATOR.$file['folder'].DIRECTORY_SEPARATOR.$file['name'];
    }

    private static function download(BackupRestore $restore, CarbonImmutable $deadline): bool
    {
        $progress = $restore->progress ?? [];
        $done = (array) ($progress['downloaded'] ?? []);
        $from = (string) ($restore->source['from'] ?? 'local');
        $destination = $from === 'local' ? null : Destinations::make($from);
        $worked = false;

        foreach (self::needed($restore) as $file) {
            $key = $file['folder'].'/'.$file['name'];

            if (in_array($key, $done, true)) {
                continue;
            }

            $path = self::localPath($restore, $file);

            if ($destination !== null) {
                BackupPaths::ensure(dirname($path));
                $have = is_file($path) ? (int) filesize($path) : 0;

                while ($have < $file['size']) {
                    // At least one chunk a run, however little time is left.
                    if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                        $progress['current'] = ['file' => $key, 'bytes' => $have, 'size' => $file['size']];
                        $restore->update(['progress' => $progress]);

                        return false;
                    }

                    $chunk = $destination->read($file['folder'], $file['name'], $have, min($destination->chunkBytes(), $file['size'] - $have));

                    if ($chunk === '') {
                        throw new RuntimeException("{$key} on {$destination->label()} is shorter than its manifest says.");
                    }

                    file_put_contents($path, $chunk, FILE_APPEND);
                    $have += strlen($chunk);
                    $worked = true;
                }
            }

            if (! is_file($path) || ! hash_equals($file['sha256'], (string) hash_file('sha256', $path))) {
                throw new RuntimeException("{$key} does not match its checksum, so it was not used. Nothing has been replaced.");
            }

            $done[] = $key;
            $progress['downloaded'] = $done;
            $restore->update(['progress' => $progress]);
        }

        unset($progress['current']);
        $restore->update(['progress' => $progress, 'status' => $restore->restoresDatabase() ? 'importing' : 'files']);

        return true;
    }

    private static function import(BackupRestore $restore, CarbonImmutable $deadline): bool
    {
        $progress = $restore->progress ?? [];
        $import = (array) ($progress['import'] ?? ['stage' => 'unzip']);
        $chain = (array) $restore->chain;
        $target = end($chain);
        $dumpGz = self::localPath($restore, ['uuid' => $target['uuid'], 'folder' => $target['folder'], 'name' => 'database.sql.gz']);
        $sql = BackupPaths::ensure(BackupPaths::restore($restore->id)).DIRECTORY_SEPARATOR.'database.sql';

        if ($import['stage'] === 'unzip') {
            self::gunzip($dumpGz, $sql);
            $import = ['stage' => 'drop'];
        }

        if ($import['stage'] === 'drop') {
            self::dropTables();
            $import = ['stage' => 'sql', 'cursor' => []];
            $progress['import'] = $import;
            $restore->update(['progress' => $progress]);
        }

        $cursor = (array) ($import['cursor'] ?? []);
        $done = SqlImporter::step($sql, $cursor, $deadline);
        $progress['import'] = ['stage' => 'sql', 'cursor' => $cursor, 'size' => (int) filesize($sql)];

        if (! $done) {
            $restore->update(['progress' => $progress]);

            return false;
        }

        @unlink($sql);
        $restore->update(['progress' => $progress, 'status' => $restore->restoresFiles() ? 'files' : 'finishing']);

        return true;
    }

    /** Every table and view but the preserved ones, so the dump rebuilds exactly what it holds. */
    private static function dropTables(): void
    {
        $preserve = (array) config('backups.preserve_tables');
        $rows = DB::select('SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema = ?', [DB::connection()->getDatabaseName()]);

        DB::statement('SET FOREIGN_KEY_CHECKS=0');

        try {
            foreach ($rows as $row) {
                if (in_array($row->name, $preserve, true)) {
                    continue;
                }

                $quoted = '`'.str_replace('`', '``', (string) $row->name).'`';
                DB::statement(($row->type === 'VIEW' ? 'DROP VIEW IF EXISTS ' : 'DROP TABLE IF EXISTS ').$quoted);
            }
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }
    }

    private static function files(BackupRestore $restore, CarbonImmutable $deadline): bool
    {
        $progress = $restore->progress ?? [];
        $cursor = (array) ($progress['files'] ?? ['v' => 0, 'e' => 0, 'written' => 0, 'refused' => 0]);
        $volumes = array_values(array_filter(self::needed($restore), fn ($f) => str_starts_with($f['name'], 'files-')));
        $worked = false;

        while ($cursor['v'] < count($volumes)) {
            $zip = new ZipArchive;
            $path = self::localPath($restore, $volumes[$cursor['v']]);

            if ($zip->open($path, ZipArchive::RDONLY) !== true) {
                throw new RuntimeException("{$volumes[$cursor['v']]['name']} could not be opened as a zip.");
            }

            try {
                for ($i = (int) $cursor['e']; $i < $zip->numFiles; $i++) {
                    if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                        $cursor['e'] = $i;
                        $progress['files'] = $cursor;
                        $restore->update(['progress' => $progress]);

                        return false;
                    }

                    $stat = $zip->statIndex($i);
                    $target = $stat === false ? null : BackupPaths::restoreTarget((string) $stat['name']);

                    if ($target === null || str_ends_with((string) $stat['name'], '/')) {
                        $cursor['refused']++;

                        continue;
                    }

                    BackupPaths::ensure(dirname($target));
                    $in = $zip->getStream((string) $stat['name']);
                    $out = fopen($target.'.restoring', 'wb');

                    if ($in === false || $out === false) {
                        throw new RuntimeException('Could not write '.$stat['name'].' on this server.');
                    }

                    stream_copy_to_stream($in, $out);
                    fclose($in);
                    fclose($out);
                    rename($target.'.restoring', $target);
                    @touch($target, (int) $stat['mtime']);
                    $cursor['written']++;
                    $worked = true;
                }
            } finally {
                $zip->close();
            }

            $cursor['v']++;
            $cursor['e'] = 0;
        }

        if ($restore->prune_missing && ! ($cursor['pruned'] ?? false)) {
            $cursor['removed'] = self::pruneMissing($restore);
            $cursor['pruned'] = true;
        }

        $progress['files'] = $cursor;
        $restore->update(['progress' => $progress, 'status' => 'finishing']);

        return true;
    }

    /** Delete what was not in the chosen backup, in the trees it held. */
    private static function pruneMissing(BackupRestore $restore): int
    {
        $chain = (array) $restore->chain;
        $target = end($chain);
        $index = FileIndex::read(self::localPath($restore, ['uuid' => $target['uuid'], 'folder' => $target['folder'], 'name' => 'index.json.gz']));

        if ($index === null) {
            return 0;
        }

        $trees = array_values(array_filter(['public', 'private'], fn ($t) => (bool) (($target['includes'] ?? [])[$t] ?? false)));
        $removed = 0;

        foreach (array_keys(FileIndex::build($trees)) as $path) {
            if (! isset($index[$path])) {
                @unlink(Archiver::absolute($path)) && $removed++;
            }
        }

        return $removed;
    }

    private static function finish(BackupRestore $restore): bool
    {
        $migrated = false;

        if ($restore->restoresDatabase()) {
            Setting::flushCache();
            $chain = (array) $restore->chain;
            $schema = (string) (end($chain)['schema'] ?? '');

            if ($schema === '' || strcmp($schema, Manifest::codeSchema()) < 0) {
                Artisan::call('migrate', ['--force' => true]);
                $migrated = true;
            }

            Setting::flushCache();
        }

        $progress = $restore->progress ?? [];
        $progress['migrated'] = $migrated;
        File::deleteDirectory(BackupPaths::restore($restore->id));
        RestoreMode::off();
        $restore->update(['status' => 'completed', 'finished_at' => now(), 'progress' => $progress, 'error' => null]);

        return true;
    }

    private static function gunzip(string $from, string $to): void
    {
        $in = gzopen($from, 'rb');
        $out = fopen($to, 'wb');

        if ($in === false || $out === false) {
            throw new RuntimeException('The database dump could not be unpacked on this server\'s disk.');
        }

        try {
            while (! gzeof($in)) {
                fwrite($out, (string) gzread($in, 1024 * 1024));
            }
        } finally {
            gzclose($in);
            fclose($out);
        }
    }
}
