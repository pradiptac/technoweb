<?php

namespace App\Support\Backups;

use Illuminate\Support\Facades\Cache;

/**
 * "The database is being replaced": while it is on, every API route except
 * the backup screens and signing in answers 503 (`EnsureNotRestoring`), and
 * every scheduled command except the backup worker and the heartbeat skips
 * its turn (`routes/console.php`), so nothing writes into a database half-way
 * through being rebuilt.
 *
 * A cache flag, not a setting — the settings table is one of the things
 * being replaced — on the `file` store this deployment ships, with a
 * fifteen-minute life the worker renews every step. A worker that dies
 * mid-restore therefore cannot hold the site closed for good; the flag ages
 * out, and `technoware:prune-backups` marks the restore failed.
 */
final class RestoreMode
{
    public const KEY = 'backups:restoring';

    public static function on(int $restoreId): void
    {
        Cache::put(self::KEY, $restoreId, now()->addMinutes(15));
    }

    public static function off(): void
    {
        Cache::forget(self::KEY);
    }

    public static function active(): bool
    {
        try {
            return Cache::has(self::KEY);
        } catch (\Throwable) {
            return false;
        }
    }
}
