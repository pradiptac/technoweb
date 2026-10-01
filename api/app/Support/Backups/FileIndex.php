<?php

namespace App\Support\Backups;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;

/**
 * What files exist, as `tree/relative/path => [size, mtime]`, and the
 * difference between two of those.
 *
 * An incremental is "what changed since the backup before it", and the only
 * record of the tree as it was is that backup's index — so every backup
 * writes one, and it is kept after the staging copy is deleted. Size and
 * modification time decide "changed": hashing every file on every run would
 * read the whole media library to find the three that moved, and an edit
 * through the media library always changes one or the other.
 */
final class FileIndex
{
    /**
     * @param  list<string>  $trees  `public`, `private`
     * @return array<string, array{0: int, 1: int}>
     */
    public static function build(array $trees): array
    {
        $index = [];

        foreach ($trees as $tree) {
            $root = BackupPaths::root($tree);

            if (! is_dir($root)) {
                continue;
            }

            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS | FilesystemIterator::UNIX_PATHS),
                RecursiveIteratorIterator::LEAVES_ONLY,
                RecursiveIteratorIterator::CATCH_GET_CHILD,
            );

            foreach ($iterator as $file) {
                /** @var \SplFileInfo $file */
                if (! $file->isFile() || $file->isLink()) {
                    continue;
                }

                $relative = $tree.'/'.ltrim(str_replace('\\', '/', substr($file->getPathname(), strlen($root))), '/');

                if (BackupPaths::excluded($relative)) {
                    continue;
                }

                $index[$relative] = [(int) $file->getSize(), (int) $file->getMTime()];
            }
        }

        ksort($index, SORT_STRING);

        return $index;
    }

    /**
     * What an incremental holds: the paths new or changed since `$before`,
     * and the paths `$before` had that are gone. Only trees in `$trees`
     * count as deleted — a tree left out of this run has not been emptied.
     *
     * @param  array<string, array{0: int, 1: int}>  $before
     * @param  array<string, array{0: int, 1: int}>  $now
     * @param  list<string>  $trees
     * @return array{changed: list<string>, deleted: list<string>}
     */
    public static function diff(array $before, array $now, array $trees): array
    {
        $changed = [];

        foreach ($now as $path => $meta) {
            if (! isset($before[$path]) || $before[$path][0] !== $meta[0] || $before[$path][1] !== $meta[1]) {
                $changed[] = (string) $path;
            }
        }

        $deleted = [];

        foreach ($before as $path => $_) {
            if (! isset($now[$path]) && in_array(explode('/', (string) $path, 2)[0], $trees, true)) {
                $deleted[] = (string) $path;
            }
        }

        return ['changed' => $changed, 'deleted' => $deleted];
    }

    /** @param  array<string, array{0: int, 1: int}>  $index */
    public static function write(string $path, array $index): void
    {
        BackupPaths::ensure(dirname($path));

        if (file_put_contents($path, gzencode(json_encode($index, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), 6)) === false) {
            throw new RuntimeException('The file index could not be written to this server\'s disk.');
        }
    }

    /** @return array<string, array{0: int, 1: int}>|null null when there is no such index */
    public static function read(string $path): ?array
    {
        if (! is_file($path)) {
            return null;
        }

        $json = gzdecode((string) file_get_contents($path));
        $index = $json === false ? null : json_decode($json, true);

        return is_array($index) ? $index : null;
    }
}
