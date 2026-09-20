<?php

namespace App\Support\Newsletter;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

/**
 * Where a scan's one-off mailbox credentials live while the scan runs.
 *
 * Never a settings row — the client's brief is that the mailbox is not
 * needed once the addresses are collected, and a password that was typed
 * for one scan must not outlive it. Never the job payload either: a scan is
 * many chained jobs, every one of which needs the password, and a failed
 * job's payload is copied verbatim into `failed_jobs`.
 *
 * So: encrypted with the application key (the same protection an
 * `is_secret` setting gets — `CACHE_STORE=file` here, and a file on disk
 * must not be plaintext), under a key made of the import id and 16 random
 * bytes that only the job chain carries, for six hours at most, and
 * forgotten by the job's `finally` the moment the scan stops being
 * `scanning`. For a consent source the value is just `{source: google}`;
 * the token itself is minted per slice from the refresh token.
 */
final class ScanCredentials
{
    private const TTL_HOURS = 6;

    /**
     * @param  array<string, mixed>  $connection
     * @return string the key the job carries
     */
    public static function put(int $importId, array $connection): string
    {
        $key = "newsletter-scan:{$importId}:".bin2hex(random_bytes(16));

        Cache::put($key, Crypt::encryptString((string) json_encode($connection)), now()->addHours(self::TTL_HOURS));

        return $key;
    }

    /** @return ?array<string, mixed> null when expired or forgotten */
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
