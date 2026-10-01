<?php

namespace App\Support\System;

use Illuminate\Support\Facades\Cache;

/**
 * "The application is being replaced": `RestoreMode`'s twin for an update.
 *
 * While it is on, every API route except the updater's own, the system
 * status and signing in answers 503 (`EnsureNotRestoring`), and every
 * scheduled command except the heartbeat skips its turn (`routes/console.php`)
 * — nothing may write into a database whose migrations are half run, or run
 * code whose files are half unpacked. The public site keeps serving the
 * pages the frontend has cached.
 *
 * A cache flag on the shared `storage/` (bootstrap/home.php), so the old code
 * and the new one both see it across the swap. Thirty minutes of life, renewed
 * by every step of the update, so a browser closed half-way cannot hold the
 * site closed for good: the flag ages out, and the Updates screen offers to
 * carry on or roll back.
 */
final class UpdateMode
{
    public const KEY = 'system:updating';

    public static function on(string $runId): void
    {
        Cache::put(self::KEY, $runId, now()->addMinutes(30));
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
