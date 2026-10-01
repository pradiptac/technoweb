<?php

namespace App\Support\Backups;

use Illuminate\Support\Facades\File;

/**
 * Where things are on this server: the two trees a backup can hold, the
 * staging folder a backup is built in, and the folder a restore downloads
 * into.
 *
 * The roots are `config('backups.roots')` when a test sets it and
 * `storage/app/public` / `storage/app/private` otherwise — a test must never
 * archive, or worse restore over, the developer's real uploads.
 */
final class BackupPaths
{
    /** The folder every destination keeps its backups under. */
    public const REMOTE_ROOT = 'technoware-backups';

    /** @return array{public: string, private: string} */
    public static function roots(): array
    {
        $configured = (array) config('backups.roots', []);

        return [
            'public' => rtrim((string) ($configured['public'] ?? storage_path('app/public')), '/\\'),
            'private' => rtrim((string) ($configured['private'] ?? storage_path('app/private')), '/\\'),
        ];
    }

    public static function root(string $which): string
    {
        return self::roots()[$which];
    }

    /** `storage/app/private/backups` — excluded from every archive. */
    public static function stagingRoot(): string
    {
        return self::root('private').DIRECTORY_SEPARATOR.'backups';
    }

    public static function staging(string $uuid): string
    {
        return self::stagingRoot().DIRECTORY_SEPARATOR.$uuid;
    }

    /**
     * The file index of every backup still in a chain. Kept apart from the
     * staging copy, which may be deleted after upload: the next incremental
     * has to diff against it either way. A few hundred KB each.
     */
    public static function indexFile(string $uuid): string
    {
        return self::stagingRoot().DIRECTORY_SEPARATOR.'_index'.DIRECTORY_SEPARATOR.$uuid.'.json.gz';
    }

    public static function restore(int $restoreId): string
    {
        return self::root('private').DIRECTORY_SEPARATOR.'restore'.DIRECTORY_SEPARATOR.$restoreId;
    }

    public static function ensure(string $directory): string
    {
        File::ensureDirectoryExists($directory, 0755);

        return $directory;
    }

    /**
     * Whether a relative path is inside the private tree's excluded folders
     * (`private/backups/...`, `private/restore/...`, the import scratch).
     */
    public static function excluded(string $relative): bool
    {
        $relative = str_replace('\\', '/', $relative);

        if (str_starts_with($relative, 'private/')) {
            $first = explode('/', substr($relative, 8), 2)[0];

            if (in_array($first, (array) config('backups.exclude_private', []), true)) {
                return true;
            }
        }

        // `.gitignore` placeholders ship with the repository, not with the site.
        return str_ends_with($relative, '/.gitignore') || str_contains($relative, '/.git/');
    }

    /**
     * The absolute path a relative archive entry restores to, or null when the
     * entry is not one this application could have written: anything outside
     * `public/` and `private/`, anything climbing with `..`, anything absolute.
     * A zip is data from a destination somebody else controls, and
     * "zip slip" is the whole reason this check exists.
     */
    public static function restoreTarget(string $entry): ?string
    {
        $entry = str_replace('\\', '/', $entry);

        if ($entry === '' || str_starts_with($entry, '/') || preg_match('#(^|/)\.\.(/|$)#', $entry) || str_contains($entry, ':') || str_contains($entry, "\0")) {
            return null;
        }

        [$tree, $rest] = array_pad(explode('/', $entry, 2), 2, '');

        if (! in_array($tree, ['public', 'private'], true) || $rest === '' || self::excluded($entry)) {
            return null;
        }

        return self::root($tree).DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $rest);
    }
}
