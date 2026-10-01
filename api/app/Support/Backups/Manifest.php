<?php

namespace App\Support\Backups;

use App\Models\Backup;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;

/**
 * `manifest.json`: what a backup folder holds and how it fits in its chain,
 * written **last** on every destination so a folder without one is an
 * upload that never finished.
 *
 * It is the only thing a restore on a fresh server has to go on — the
 * database that remembered the backups is the thing being restored — so it
 * carries the chain by folder name (`chain`, the full first), each file's
 * sha256, and the newest migration the database had (`schema`), which a
 * restore compares with this code's to refuse a backup from the future and
 * to know when to run `migrate` after an older one.
 */
final class Manifest
{
    public const FORMAT = 1;

    /** @return array<string, mixed> */
    public static function build(Backup $backup): array
    {
        $chain = array_map(fn (Backup $b) => $b->folder, $backup->chain());
        array_pop($chain);

        return [
            'format' => self::FORMAT,
            'application' => 'technoware',
            'uuid' => $backup->uuid,
            'folder' => $backup->folder,
            'type' => $backup->type,
            'trigger' => $backup->trigger,
            'created_at' => ($backup->started_at ?? $backup->created_at)?->toIso8601String(),
            'base' => $backup->isFull() ? null : $backup->base?->folder,
            'parent' => $backup->parent?->folder,
            'chain' => $chain,
            'includes' => $backup->includes,
            'schema' => $backup->schema,
            'dumper' => $backup->dumper,
            'file_count' => $backup->file_count,
            'files_bytes' => $backup->files_bytes,
            'deleted' => ($backup->progress ?? [])['deleted'] ?? [],
            'files' => $backup->files ?? [],
        ];
    }

    /** @param  array<string, mixed>  $manifest */
    public static function write(string $directory, array $manifest): string
    {
        $path = $directory.DIRECTORY_SEPARATOR.'manifest.json';
        File::put($path, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

        return $path;
    }

    /**
     * A manifest read from somewhere this application does not control,
     * checked for the shape a restore relies on.
     *
     * @return array<string, mixed>
     */
    public static function parse(string $json): array
    {
        $manifest = json_decode($json, true);

        if (! is_array($manifest) || ($manifest['application'] ?? null) !== 'technoware' || ! in_array($manifest['type'] ?? null, [Backup::FULL, Backup::INCREMENTAL], true)) {
            throw new RuntimeException('That folder does not hold a backup made by this application.');
        }

        if ((int) ($manifest['format'] ?? 0) > self::FORMAT) {
            throw new RuntimeException('That backup was made by a newer version of this application.');
        }

        foreach ((array) ($manifest['files'] ?? []) as $file) {
            if (! is_array($file) || ! preg_match('/^(database\.sql\.gz|files-\d{3}\.zip|index\.json\.gz)$/', (string) ($file['name'] ?? '')) || ! preg_match('/^[a-f0-9]{64}$/', (string) ($file['sha256'] ?? ''))) {
                throw new RuntimeException('That backup’s manifest lists a file this application would not have written.');
            }
        }

        foreach ((array) ($manifest['chain'] ?? []) as $folder) {
            if (! self::validFolder((string) $folder)) {
                throw new RuntimeException('That backup’s manifest names a folder this application would not have written.');
            }
        }

        return $manifest;
    }

    public static function validFolder(string $folder): bool
    {
        return (bool) preg_match('/^\d{8}-\d{6}-(full|incr)-[a-f0-9]{8}$/', $folder);
    }

    /** The newest migration this code has, by file name. */
    public static function codeSchema(): string
    {
        $files = glob(database_path('migrations/*.php')) ?: [];
        sort($files, SORT_STRING);

        return $files === [] ? '' : basename((string) end($files), '.php');
    }

    /** The newest migration the database has run. */
    public static function databaseSchema(): string
    {
        try {
            return (string) DB::table('migrations')->orderByDesc('migration')->value('migration');
        } catch (\Throwable) {
            return '';
        }
    }
}
