<?php

namespace App\Support\Backups;

use App\Models\Backup;
use App\Models\BackupUpload;
use App\Support\Backups\Destinations\Destination;
use App\Support\Backups\Destinations\Destinations;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Sends a backup's files to each of its destinations, a chunk at a time, and
 * remembers where it got to on each upload row.
 *
 * **One destination failing never stops another.** A failure is retried on
 * the next run of the worker — a network that blinked should not cost a
 * night's backup — and after `ATTEMPTS` the file is marked failed, the
 * destination's remaining files with it (a folder missing its database is
 * not a backup), and the destination's error row says why.
 *
 * A failed file starts again from its first byte: the resume state of a
 * half-sent chunk is not something any of the four protocols reports
 * reliably, and a restart costs one file, not the backup.
 */
final class Uploader
{
    public const ATTEMPTS = 3;

    /** True when every upload of this backup has finished, one way or another. */
    public static function step(Backup $backup, CarbonImmutable $deadline): bool
    {
        $staging = BackupPaths::staging($backup->uuid);
        /** @var array<string, Destination> $destinations */
        $destinations = [];
        $broken = [];

        $worked = false;
        $rows = $backup->uploads()->whereIn('status', ['pending', 'uploading'])->orderBy('id')->get();

        foreach ($rows as $row) {
            if (isset($broken[$row->destination])) {
                continue;
            }

            // At least one chunk a run, however little time is left.
            if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                return false;
            }

            try {
                $destination = $destinations[$row->destination] ??= Destinations::make($row->destination);
                $path = $staging.DIRECTORY_SEPARATOR.$row->file;

                if (! is_file($path)) {
                    throw new \RuntimeException("{$row->file} is no longer on this server.");
                }

                if ($row->state === null) {
                    $row->update(['state' => $destination->begin($backup->folder, $row->file, $row->size), 'status' => 'uploading', 'bytes_sent' => 0]);
                }

                do {
                    if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                        return false;
                    }

                    $length = min($destination->chunkBytes(), $row->size - $row->bytes_sent);
                    $state = $destination->send((array) $row->state, $path, $row->bytes_sent, $length);
                    $row->update(['state' => $state, 'bytes_sent' => $row->bytes_sent + $length]);
                    $worked = true;
                } while ($row->bytes_sent < $row->size);

                $destination->finish((array) $row->state);
                $row->update(['status' => 'done', 'completed_at' => now(), 'error' => null]);
                Destinations::clear($row->destination);
            } catch (Throwable $e) {
                $broken[$row->destination] = true;
                self::failed($backup, $row, $e);
            }
        }

        return ! $backup->uploads()->whereIn('status', ['pending', 'uploading'])->exists();
    }

    private static function failed(Backup $backup, BackupUpload $row, Throwable $e): void
    {
        $message = mb_substr(trim($e->getMessage()) ?: $e::class, 0, 400);
        Log::warning('A backup upload failed', ['backup' => $backup->id, 'destination' => $row->destination, 'file' => $row->file, 'error' => $e->getMessage()]);

        $attempts = $row->attempts + 1;

        if ($attempts < self::ATTEMPTS) {
            $row->update(['attempts' => $attempts, 'error' => $message, 'status' => 'pending', 'state' => null, 'bytes_sent' => 0]);

            return;
        }

        $row->update(['attempts' => $attempts, 'error' => $message, 'status' => 'failed', 'state' => null]);
        $backup->uploads()->where('destination', $row->destination)->whereIn('status', ['pending', 'uploading'])
            ->update(['status' => 'failed', 'error' => 'Not sent: '.$row->file.' failed first.']);
        Destinations::fail($row->destination, $message);
    }
}
