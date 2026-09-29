<?php

namespace App\Support\Backups;

use App\Models\Backup;
use App\Models\BackupRestore;
use App\Models\BackupUpload;
use App\Support\Backups\Destinations\Destinations;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/**
 * Makes one backup, a step at a time.
 *
 * `pending → dumping → indexing → archiving → uploading → completed`
 *
 * Every phase keeps its cursor in `progress`, and `advance()` does as much
 * as the deadline allows and returns — the backup worker calls it once a
 * minute, so a backup far larger than one minute's work simply takes several.
 * Nothing thrown leaves `advance()`: a failure is the row's `error`, the
 * `backup_error` banner and an email to whoever `backups_email` names.
 *
 * **What decides full or incremental** (`start()` with `auto` or
 * `incremental`): an incremental needs a finished backup to build on, whose
 * file index is still on this server, whose chain is no longer than
 * `backup_max_chain`, which every destination this run will upload to
 * already holds, and which no restore has happened since. Any of those
 * missing, and it is a full — an incremental that cannot be restored from
 * where it was sent is worse than the minutes a full costs.
 */
final class BackupRunner
{
    /**
     * @param  'full'|'incremental'|'auto'  $type
     * @param  array<string, bool>|null  $includes  null for the settings
     * @param  list<string>|null  $destinations  null for every enabled destination
     */
    public static function start(string $type, string $trigger, ?int $userId = null, ?string $userName = null, ?array $includes = null, ?array $destinations = null): Backup
    {
        $includes ??= BackupSettings::includes();
        $destinations ??= Destinations::enabled();

        if (! in_array(true, $includes, true)) {
            throw new RuntimeException('Nothing is chosen to back up. Switch on the database or the files in Settings.');
        }

        $parent = $type === Backup::FULL ? null : self::parentFor($destinations);
        $type = $parent === null ? Backup::FULL : Backup::INCREMENTAL;
        $uuid = (string) Str::uuid();

        return Backup::query()->create([
            'uuid' => $uuid,
            'type' => $type,
            'trigger' => $trigger,
            'status' => 'pending',
            'base_id' => $parent?->baseId(),
            'parent_id' => $parent?->id,
            'folder' => now('UTC')->format('Ymd-His').'-'.($type === Backup::FULL ? 'full' : 'incr').'-'.substr(str_replace('-', '', $uuid), 0, 8),
            'includes' => $includes,
            'destinations' => array_values($destinations),
            'progress' => [],
            'created_by' => $userId,
            'created_by_name' => $userName,
        ]);
    }

    /** The backup an incremental would build on, or null when it has to be a full. */
    public static function parentFor(array $destinations): ?Backup
    {
        $parent = Backup::query()->done()->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)->latest('id')->first();

        if ($parent === null || ! is_file(BackupPaths::indexFile($parent->uuid))) {
            return null;
        }

        $chain = $parent->chain();

        // The chain is the full and its incrementals; `backup_max_chain` counts the incrementals.
        if ($chain === [] || ! $chain[0]->isFull() || count($chain) - 1 >= BackupSettings::maxChain()) {
            return null;
        }

        $reached = $parent->restorableFrom();

        foreach ($destinations as $destination) {
            if (! in_array($destination, $reached, true)) {
                return null;
            }
        }

        // After a restore the files' dates no longer match any index; start a new chain.
        if (BackupRestore::query()->where('status', 'completed')->where('finished_at', '>', $parent->created_at)->exists()) {
            return null;
        }

        return $parent;
    }

    /** Advance as far as the deadline allows. True once the backup has finished, one way or another. */
    public static function advance(Backup $backup, CarbonImmutable $deadline): bool
    {
        try {
            $worked = false;

            while (in_array($backup->status, Backup::IN_FLIGHT, true)) {
                if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                    return false;
                }

                // Cancelled from the console since the last phase. The flag as well as the
                // column, because a phase in flight may have written its status over the column.
                if (Cache::pull('backups:cancel:'.$backup->id) || Backup::query()->whereKey($backup->id)->value('status') === 'cancelled') {
                    $backup->update(['status' => 'cancelled', 'finished_at' => now(), 'local_deleted_at' => now()]);
                    File::deleteDirectory(BackupPaths::staging($backup->uuid));
                    @unlink(BackupPaths::indexFile($backup->uuid));

                    return true;
                }

                $moved = match ($backup->status) {
                    'pending' => self::begin($backup),
                    'dumping' => self::dump($backup, $deadline),
                    'indexing' => self::index($backup),
                    'archiving' => self::archive($backup, $deadline),
                    'uploading' => self::upload($backup, $deadline),
                };

                $worked = true;

                if (! $moved) {
                    return false;
                }
            }

            return true;
        } catch (Throwable $e) {
            self::fail($backup, $e);

            return true;
        }
    }

    public static function fail(Backup $backup, Throwable|string $why): void
    {
        $message = $why instanceof Throwable ? self::sentence($why) : $why;

        if ($why instanceof Throwable) {
            Log::warning('A backup failed', ['backup' => $backup->id, 'error' => $why->getMessage()]);
        }

        $backup->update(['status' => 'failed', 'error' => $message, 'finished_at' => now()]);
        File::deleteDirectory(BackupPaths::staging($backup->uuid));
        @unlink(BackupPaths::indexFile($backup->uuid));
        $backup->update(['local_deleted_at' => now()]);

        if (! in_array($backup->trigger, Backup::SAFETY_TRIGGERS, true)) {
            BackupAlerts::failed("The {$backup->type} backup of ".$backup->created_at?->toDayDateTimeString().' failed: '.$message, $backup);
        }
    }

    private static function begin(Backup $backup): bool
    {
        BackupPaths::ensure(BackupPaths::staging($backup->uuid));
        $backup->update(['status' => $backup->includes('database') ? 'dumping' : 'indexing', 'started_at' => now()]);

        return true;
    }

    private static function dump(Backup $backup, CarbonImmutable $deadline): bool
    {
        $progress = $backup->progress ?? [];
        $cursor = (array) ($progress['dump'] ?? []);
        $done = DatabaseDumper::step(BackupPaths::staging($backup->uuid), $cursor, $deadline);
        $progress['dump'] = $cursor;

        if (! $done) {
            $backup->update(['progress' => $progress, 'dumper' => $cursor['dumper'] ?? null]);

            return false;
        }

        unset($progress['dump']);
        $backup->update([
            'status' => 'indexing',
            'progress' => $progress,
            'dumper' => $cursor['dumper'] ?? null,
            'db_bytes' => (int) filesize(BackupPaths::staging($backup->uuid).DIRECTORY_SEPARATOR.'database.sql.gz'),
            'schema' => Manifest::databaseSchema(),
        ]);

        return true;
    }

    /**
     * The file index, and from it the list of paths to archive: every path
     * for a full, the changed ones for an incremental. Fast — it reads
     * directory entries, not files — so it is one step.
     */
    private static function index(Backup $backup): bool
    {
        $trees = array_values(array_filter(['public', 'private'], fn (string $t) => $backup->includes($t)));
        $staging = BackupPaths::staging($backup->uuid);
        $progress = $backup->progress ?? [];

        if ($trees === []) {
            $backup->update(['status' => 'archiving', 'progress' => $progress + ['paths' => 0]]);
            File::put($staging.DIRECTORY_SEPARATOR.'pending.json', '[]');

            return true;
        }

        $now = FileIndex::build($trees);
        FileIndex::write($staging.DIRECTORY_SEPARATOR.'index.json.gz', $now);
        File::copy($staging.DIRECTORY_SEPARATOR.'index.json.gz', BackupPaths::ensure(dirname(BackupPaths::indexFile($backup->uuid))).DIRECTORY_SEPARATOR.basename(BackupPaths::indexFile($backup->uuid)));

        if ($backup->isFull()) {
            $paths = array_keys($now);
            $deleted = [];
        } else {
            $before = FileIndex::read(BackupPaths::indexFile((string) $backup->parent?->uuid))
                ?? throw new RuntimeException('The index of the backup this one builds on has gone from this server. Take a full backup.');
            ['changed' => $paths, 'deleted' => $deleted] = FileIndex::diff($before, $now, $trees);
        }

        File::put($staging.DIRECTORY_SEPARATOR.'pending.json', json_encode($paths, JSON_UNESCAPED_SLASHES));

        $backup->update([
            'status' => 'archiving',
            'file_count' => count($paths),
            'files_bytes' => array_sum(array_map(fn ($p) => $now[$p][0], $paths)),
            'deleted_count' => count($deleted),
            'progress' => $progress + ['deleted' => $deleted],
        ]);

        return true;
    }

    private static function archive(Backup $backup, CarbonImmutable $deadline): bool
    {
        $staging = BackupPaths::staging($backup->uuid);
        $paths = json_decode((string) File::get($staging.DIRECTORY_SEPARATOR.'pending.json'), true) ?: [];
        $progress = $backup->progress ?? [];
        $cursor = (array) ($progress['archive'] ?? []);

        if (! Archiver::step($staging, $paths, $cursor, $deadline)) {
            $progress['archive'] = $cursor;
            $backup->update(['progress' => $progress]);

            return false;
        }

        $files = [];

        foreach (array_merge(
            $backup->includes('database') ? ['database.sql.gz'] : [],
            array_map(fn (array $v) => $v['name'], (array) ($cursor['volumes'] ?? [])),
            is_file($staging.DIRECTORY_SEPARATOR.'index.json.gz') ? ['index.json.gz'] : [],
        ) as $name) {
            $path = $staging.DIRECTORY_SEPARATOR.$name;
            $files[] = ['name' => $name, 'size' => (int) filesize($path), 'sha256' => (string) hash_file('sha256', $path)];
        }

        @unlink($staging.DIRECTORY_SEPARATOR.'pending.json');
        $progress['archive'] = ['volumes' => $cursor['volumes'] ?? [], 'skipped' => $cursor['skipped'] ?? 0];

        $backup->update([
            'files' => $files,
            'total_bytes' => array_sum(array_column($files, 'size')),
            'schema' => $backup->schema ?? Manifest::databaseSchema(),
            'progress' => $progress,
        ]);

        $manifest = Manifest::write($staging, Manifest::build($backup->fresh()));
        $all = [...$files, ['name' => 'manifest.json', 'size' => (int) filesize($manifest), 'sha256' => (string) hash_file('sha256', $manifest)]];

        foreach ($backup->destinations ?? [] as $destination) {
            foreach ($all as $file) {
                BackupUpload::query()->create([
                    'backup_id' => $backup->id,
                    'destination' => $destination,
                    'file' => $file['name'],
                    'size' => $file['size'],
                    'status' => 'pending',
                ]);
            }
        }

        $backup->update(['status' => 'uploading']);

        return true;
    }

    private static function upload(Backup $backup, CarbonImmutable $deadline): bool
    {
        if (! Uploader::step($backup, $deadline)) {
            return false;
        }

        $failed = $backup->uploads()->where('status', 'failed')->pluck('destination')->unique()->values()->all();
        $backup->update([
            'status' => $failed === [] ? 'completed' : 'completed_with_errors',
            'finished_at' => now(),
            'error' => $failed === [] ? null : 'Not every file reached '.implode(', ', array_map(fn ($d) => Destinations::LABELS[$d] ?? $d, $failed)).'. The copy on this server was kept.',
        ]);

        if ($failed === []) {
            BackupAlerts::succeeded($backup);
        } else {
            BackupAlerts::failed('The backup of '.$backup->created_at?->toDayDateTimeString().' did not reach '.implode(', ', array_map(fn ($d) => Destinations::LABELS[$d] ?? $d, $failed)).'. '
                .$backup->uploads()->where('status', 'failed')->value('error'), $backup);
        }

        Retention::apply();

        return true;
    }

    /** The row's error, in words for the person at the screen. */
    public static function sentence(Throwable $e): string
    {
        return $e instanceof RuntimeException
            ? mb_substr($e->getMessage(), 0, 500)
            : 'Something went wrong making the backup. The details are in the server log.';
    }
}
