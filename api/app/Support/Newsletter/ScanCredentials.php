<?php

namespace App\Support\Newsletter;

use App\Support\SealedCache;

/**
 * Where a scan's one-off mailbox credentials live while the scan runs.
 *
 * Never a settings row — the client's brief is that the mailbox is not
 * needed once the addresses are collected, and a password that was typed
 * for one scan must not outlive it. Never the job payload either: a scan is
 * many chained jobs, every one of which needs the password, and a failed
 * job's payload is copied verbatim into `failed_jobs`.
 *
 * Sealed in the cache by `SealedCache` (encrypted, under a key only the job
 * chain carries) for six hours at most, and forgotten by the job's `finally`
 * the moment the scan stops being `scanning`. For a consent source the value
 * is just `{source: google}`; the token itself is minted per slice from the
 * refresh token.
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
        return SealedCache::put('newsletter-scan', $importId, $connection, self::TTL_HOURS);
    }

    /** @return ?array<string, mixed> null when expired or forgotten */
    public static function read(string $key): ?array
    {
        return SealedCache::read($key);
    }

    public static function forget(string $key): void
    {
        SealedCache::forget($key);
    }
}
