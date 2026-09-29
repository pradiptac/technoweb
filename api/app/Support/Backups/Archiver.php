<?php

namespace App\Support\Backups;

use Carbon\CarbonImmutable;
use RuntimeException;
use ZipArchive;

/**
 * The files of a backup, as numbered zip volumes: `files-001.zip`, …
 *
 * **A volume is opened and closed inside one step.** Re-opening a zip to add
 * to it makes libzip rewrite the whole archive on close, so an archive grown
 * a slice at a time would be copied once per slice — quadratic in the size of
 * the media library. Instead each volume is capped (`backups.volume_bytes`,
 * `backups.volume_files`) and finished before the step checks the clock; a
 * single file larger than the cap gets a volume to itself.
 *
 * Pictures, video, PDFs and archives are **stored**, not deflated: they are
 * compressed already, and deflating them again costs the CPU time the budget
 * is measured in to save a percent.
 *
 * Entries are named `public/...` and `private/...`, the index's own keys, and
 * a restore refuses any other shape (`BackupPaths::restoreTarget`).
 */
final class Archiver
{
    private const STORED = [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'mp4', 'webm', 'mov', 'm4v', 'mp3', 'm4a', 'ogg',
        'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'pdf', 'docx', 'xlsx', 'pptx', 'woff', 'woff2',
    ];

    /**
     * Archive `$paths` from `$cursor['pos']` on. True when every path is in a
     * volume.
     *
     * @param  list<string>  $paths  index keys
     * @param  array<string, mixed>  $cursor  `pos`, `volumes` [{name, entries}], `skipped`
     */
    public static function step(string $directory, array $paths, array &$cursor, CarbonImmutable $deadline): bool
    {
        $cursor['pos'] ??= 0;
        $cursor['volumes'] ??= [];
        $cursor['skipped'] ??= 0;
        $capBytes = max(1, (int) config('backups.volume_bytes'));
        $capFiles = max(1, (int) config('backups.volume_files'));

        $worked = false;

        while ($cursor['pos'] < count($paths)) {
            // At least one volume a run, however little time is left.
            if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                return false;
            }

            $number = count($cursor['volumes']) + 1;
            $name = sprintf('files-%03d.zip', $number);
            $target = $directory.DIRECTORY_SEPARATOR.$name;

            // Which paths go in this volume, decided before the zip is touched,
            // so a retry after a failed close takes the same set.
            $take = [];
            $bytes = 0;

            for ($i = $cursor['pos']; $i < count($paths); $i++) {
                $absolute = self::absolute($paths[$i]);
                $size = is_file($absolute) ? (int) filesize($absolute) : 0;

                if ($take !== [] && ($bytes + $size > $capBytes || count($take) >= $capFiles)) {
                    break;
                }

                $take[] = $paths[$i];
                $bytes += $size;
            }

            $entries = self::write($target, $take);
            $worked = true;
            $cursor['skipped'] += count($take) - $entries;
            $cursor['pos'] += count($take);

            if ($entries > 0) {
                $cursor['volumes'][] = ['name' => $name, 'entries' => $entries];
            } else {
                @unlink($target);
            }
        }

        return true;
    }

    /** The absolute path of an index key. */
    public static function absolute(string $key): string
    {
        [$tree, $rest] = explode('/', $key, 2);

        return BackupPaths::root($tree).DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $rest);
    }

    /**
     * One volume. A file that disappears between the index and the zip —
     * somebody deleted a picture a second ago — makes `close()` fail for the
     * whole volume, so it is written again without whatever has gone.
     *
     * @param  list<string>  $keys
     * @return int how many entries it holds
     */
    private static function write(string $target, array $keys): int
    {
        for ($attempt = 0; $attempt < 2; $attempt++) {
            @unlink($target);
            $zip = new ZipArchive;

            if ($zip->open($target, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new RuntimeException('A zip volume could not be created on this server\'s disk.');
            }

            $entries = 0;

            foreach ($keys as $key) {
                $absolute = self::absolute($key);

                if (! is_file($absolute) || ! is_readable($absolute)) {
                    continue;
                }

                $zip->addFile($absolute, $key);

                if (in_array(strtolower(pathinfo($key, PATHINFO_EXTENSION)), self::STORED, true)) {
                    $zip->setCompressionName($key, ZipArchive::CM_STORE);
                }

                $entries++;
            }

            if ($entries === 0) {
                $zip->close();

                return 0;
            }

            if (@$zip->close()) {
                return $entries;
            }
        }

        throw new RuntimeException('A zip volume could not be written: '.basename($target).'. Check the free space on this server.');
    }
}
