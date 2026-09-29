<?php

namespace App\Support\Backups\Destinations;

use App\Models\Setting;
use App\Support\Backups\BackupSettings;
use App\Support\OAuth\OAuthConnection;
use InvalidArgumentException;

/**
 * The three kinds of destination and which of them are switched on.
 *
 * A test swaps one for a `FakeDestination` by binding
 * `backups.destination.<key>` in the container; nothing else here knows it
 * is being tested.
 */
final class Destinations
{
    public const KEYS = ['s3', 'gdrive', 'ftp'];

    public const LABELS = ['s3' => 'S3 / S3-compatible', 'gdrive' => 'Google Drive', 'ftp' => 'FTP / FTPS / SFTP'];

    public static function make(string $key): Destination
    {
        if (app()->bound("backups.destination.{$key}")) {
            return app("backups.destination.{$key}");
        }

        return match ($key) {
            's3' => new S3Destination,
            'gdrive' => new DriveDestination,
            'ftp' => Setting::get('backup_ftp_protocol', 'sftp') === 'sftp' ? new SftpDestination : new FtpDestination,
            default => throw new InvalidArgumentException("There is no backup destination called {$key}."),
        };
    }

    /** Switched on and holding what it needs to connect. @return list<string> */
    public static function enabled(): array
    {
        return array_values(array_filter(self::KEYS, fn (string $key) => self::switchedOn($key) && self::configured($key)));
    }

    public static function switchedOn(string $key): bool
    {
        return BackupSettings::bool("backup_{$key}_enabled", false);
    }

    public static function configured(string $key): bool
    {
        if (app()->bound("backups.destination.{$key}")) {
            return true;
        }

        return match ($key) {
            's3' => filled(Setting::get('backup_s3_bucket')) && filled(Setting::get('backup_s3_key')) && filled(Setting::get('backup_s3_secret')),
            'gdrive' => OAuthConnection::backupDrive()->isConnected(),
            'ftp' => filled(Setting::get('backup_ftp_host')) && filled(Setting::get('backup_ftp_username'))
                && (filled(Setting::get('backup_ftp_password')) || filled(Setting::get('backup_ftp_private_key'))),
            default => false,
        };
    }

    /** The `backup_<key>_error` row a refusal is written to, cleared by a success. */
    public static function errorKey(string $key): string
    {
        return $key === 'gdrive' ? 'backup_gdrive_error' : "backup_{$key}_error";
    }

    public static function fail(string $key, string $message): void
    {
        Setting::put(self::errorKey($key), mb_substr(trim($message), 0, 400).' — '.now()->toDayDateTimeString());
    }

    public static function clear(string $key): void
    {
        if (filled(Setting::get(self::errorKey($key)))) {
            Setting::put(self::errorKey($key), null);
        }
    }

    /** @return list<array<string, mixed>> what the console shows for each */
    public static function describe(): array
    {
        return array_map(fn (string $key) => [
            'key' => $key,
            'label' => self::LABELS[$key],
            'enabled' => self::switchedOn($key),
            'configured' => self::configured($key),
            'error' => Setting::get(self::errorKey($key)),
            'detail' => match ($key) {
                's3' => array_filter([
                    'bucket' => Setting::get('backup_s3_bucket'),
                    'endpoint' => Setting::get('backup_s3_endpoint') ?: 'Amazon S3',
                ]),
                'gdrive' => array_filter(['account' => Setting::get('backup_gdrive_oauth_account')]),
                'ftp' => array_filter([
                    'protocol' => strtoupper((string) Setting::get('backup_ftp_protocol', 'sftp')),
                    'host' => Setting::get('backup_ftp_host'),
                    'fingerprint' => Setting::get('backup_ftp_sftp_fingerprint'),
                ]),
            },
        ], self::KEYS);
    }
}
