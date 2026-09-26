<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

/**
 * Credentials a queued job chain needs for as long as it runs, and not a
 * minute longer.
 *
 * Never a settings row: a password typed for one run must not outlive it.
 * Never the job payload: a chain is many jobs, and a failed job's payload is
 * copied verbatim into `failed_jobs`. So the value is encrypted with the
 * application key (the cache store is a file here, and a file on disk must
 * not be plaintext), filed under a key made of a prefix, the run's id and 16
 * random bytes that only the job chain carries, with a time limit, and
 * forgotten by the job the moment the run stops needing it.
 *
 * The newsletter's mailbox scan (`ScanCredentials`) and the WordPress import
 * both keep their one-off credentials here.
 */
final class SealedCache
{
    /**
     * @param  array<string, mixed>  $value
     * @return string the key the job carries
     */
    public static function put(string $prefix, int $id, array $value, int $hours): string
    {
        $key = "{$prefix}:{$id}:".bin2hex(random_bytes(16));

        Cache::put($key, Crypt::encryptString((string) json_encode($value)), now()->addHours($hours));

        return $key;
    }

    /** @return ?array<string, mixed> null when expired, forgotten or unreadable */
    public static function read(string $key): ?array
    {
        $sealed = Cache::get($key);

        if (! is_string($sealed) || $sealed === '') {
            return null;
        }

        try {
            $decoded = json_decode(Crypt::decryptString($sealed), true);
        } catch (\Throwable) {
            return null;
        }

        return is_array($decoded) ? $decoded : null;
    }

    public static function forget(string $key): void
    {
        Cache::forget($key);
    }
}
