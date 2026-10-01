<?php

namespace App\Support\Backups\Destinations;

use App\Models\Setting;
use App\Support\Backups\BackupPaths;
use App\Support\Net\PublicHost;
use RuntimeException;

/**
 * What the FTP and SFTP destinations share: where the backups live on the
 * server, and the checked address to connect to.
 */
final class Remote
{
    /** `technoware-backups` under the configured folder, absolute when that was. */
    public static function root(): string
    {
        $path = trim(str_replace('\\', '/', (string) Setting::get('backup_ftp_folder')));
        $base = trim($path, '/');

        return ($base === '' ? '' : (str_starts_with($path, '/') ? '/' : '').$base.'/').BackupPaths::REMOTE_ROOT;
    }

    public static function path(string $folder, string $file): string
    {
        return self::root().'/'.$folder.'/'.$file;
    }

    /**
     * The address to connect to: the host resolved once, every answer public
     * (unless `BACKUP_ALLOW_PRIVATE_HOSTS`), the first answer used — so the
     * connection is made to the address that was checked.
     */
    public static function address(string $host): string
    {
        if ($host === '') {
            throw new RuntimeException('No server is saved for FTP / SFTP.');
        }

        if (config('backups.allow_private_hosts')) {
            return $host;
        }

        if ($refusal = PublicHost::refusal($host, requireResolution: true)) {
            throw new RuntimeException($refusal.' A backup server has to be a public host, unless BACKUP_ALLOW_PRIVATE_HOSTS is set on this server.');
        }

        if (filter_var(trim($host, '[]'), FILTER_VALIDATE_IP) !== false) {
            return trim($host, '[]');
        }

        $addresses = PublicHost::resolve($host);

        // IPv4 first: the FTP extension's passive mode is IPv4-shaped.
        usort($addresses, fn ($a, $b) => (int) str_contains($a, ':') <=> (int) str_contains($b, ':'));

        return $addresses[0];
    }
}
