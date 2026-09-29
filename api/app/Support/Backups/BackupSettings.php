<?php

namespace App\Support\Backups;

use App\Models\Setting;
use App\Support\Net\PublicHost;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * The one reader of the private `backups` settings group, and the checks a
 * save has to pass. Every value falls back per field, so a row that was never
 * seeded reads as its default rather than as off.
 */
final class BackupSettings
{
    public const DAYS = ['daily', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    public const INCREMENTAL_EVERY = ['off', '24', '12', '6'];

    public const FTP_PROTOCOLS = ['ftp', 'ftps', 'sftp'];

    /** The ports each protocol is ordinarily served on; anything above 1023 is allowed too. */
    public const FTP_PORTS = ['ftp' => 21, 'ftps' => 21, 'sftp' => 22];

    /** Host key → the secret a stored host must never be moved away from. */
    public const SECRETS = [
        'backup_ftp_host' => ['backup_ftp_password', 'backup_ftp_private_key'],
        'backup_s3_endpoint' => ['backup_s3_secret'],
    ];

    /** @var array<string, list<array{value: string, label: string, description: string}>> */
    public const OPTIONS = [
        'backup_full_day' => [
            ['value' => 'daily', 'label' => 'Every day', 'description' => 'A full backup every day; incrementals in between if they are switched on.'],
            ['value' => 'mon', 'label' => 'Monday', 'description' => ''],
            ['value' => 'tue', 'label' => 'Tuesday', 'description' => ''],
            ['value' => 'wed', 'label' => 'Wednesday', 'description' => ''],
            ['value' => 'thu', 'label' => 'Thursday', 'description' => ''],
            ['value' => 'fri', 'label' => 'Friday', 'description' => ''],
            ['value' => 'sat', 'label' => 'Saturday', 'description' => ''],
            ['value' => 'sun', 'label' => 'Sunday', 'description' => 'The quietest day for most businesses.'],
        ],
        'backup_incremental_every' => [
            ['value' => 'off', 'label' => 'Off', 'description' => 'Only the full backups.'],
            ['value' => '24', 'label' => 'Daily', 'description' => 'Once a day at the backup time, on the days without a full.'],
            ['value' => '12', 'label' => 'Every 12 hours', 'description' => 'At the backup time and twelve hours later.'],
            ['value' => '6', 'label' => 'Every 6 hours', 'description' => 'Four a day, starting at the backup time.'],
        ],
        'backup_enabled' => [
            ['value' => '0', 'label' => 'Off', 'description' => 'Nothing is backed up by itself. “Back up now” on the Backups screen still works.'],
            ['value' => '1', 'label' => 'On', 'description' => 'Backups run on the schedule below, to every destination that is switched on.'],
        ],
        'backup_include_db' => [
            ['value' => '1', 'label' => 'Included', 'description' => 'The whole database, dumped in full every time.'],
            ['value' => '0', 'label' => 'Left out', 'description' => 'No database in the backups — only worth it if something else backs it up.'],
        ],
        'backup_include_public' => [
            ['value' => '1', 'label' => 'Included', 'description' => 'The media library: every picture, document and video, and their earlier versions.'],
            ['value' => '0', 'label' => 'Left out', 'description' => 'The media library is not backed up.'],
        ],
        'backup_include_private' => [
            ['value' => '1', 'label' => 'Included', 'description' => 'Ticket attachments, CVs and invoices — the files only signed-in people can reach.'],
            ['value' => '0', 'label' => 'Left out', 'description' => 'Ticket attachments, CVs and invoices are not backed up.'],
        ],
        'backup_s3_enabled' => [
            ['value' => '0', 'label' => 'Off', 'description' => 'Backups are not sent to S3.'],
            ['value' => '1', 'label' => 'On', 'description' => 'Every backup is sent to this bucket.'],
        ],
        'backup_s3_path_style' => [
            ['value' => '0', 'label' => 'Virtual-hosted (bucket.host)', 'description' => 'What Amazon, Backblaze B2, Wasabi and DigitalOcean expect.'],
            ['value' => '1', 'label' => 'Path-style (host/bucket)', 'description' => 'What MinIO and some self-hosted servers need.'],
        ],
        'backup_gdrive_enabled' => [
            ['value' => '0', 'label' => 'Off', 'description' => 'Backups are not sent to Google Drive.'],
            ['value' => '1', 'label' => 'On', 'description' => 'Every backup is sent to the connected Drive.'],
        ],
        'backup_ftp_enabled' => [
            ['value' => '0', 'label' => 'Off', 'description' => 'Backups are not sent to this server.'],
            ['value' => '1', 'label' => 'On', 'description' => 'Every backup is sent to this server.'],
        ],
        'backup_ftp_passive' => [
            ['value' => '1', 'label' => 'Passive', 'description' => 'What almost every server behind a firewall needs. Ignored for SFTP.'],
            ['value' => '0', 'label' => 'Active', 'description' => 'Only if the server’s administrator says so. Ignored for SFTP.'],
        ],
        'backup_ftp_protocol' => [
            ['value' => 'sftp', 'label' => 'SFTP (SSH)', 'description' => 'Encrypted, and the host key is pinned on the first connection.'],
            ['value' => 'ftps', 'label' => 'FTPS (explicit TLS)', 'description' => 'FTP over TLS. The certificate is not checked — PHP’s FTP extension cannot.'],
            ['value' => 'ftp', 'label' => 'FTP', 'description' => 'Unencrypted: the password and the backups cross the network in the clear.'],
        ],
    ];

    public static function enabled(): bool
    {
        return self::bool('backup_enabled', false);
    }

    public static function time(): string
    {
        $time = (string) Setting::get('backup_time', '02:15');

        return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time) ? $time : '02:15';
    }

    public static function fullDay(): string
    {
        $day = (string) Setting::get('backup_full_day', 'sun');

        return in_array($day, self::DAYS, true) ? $day : 'sun';
    }

    /** Hours between incrementals, or null when they are off. */
    public static function incrementalEvery(): ?int
    {
        $every = (string) Setting::get('backup_incremental_every', '24');

        return in_array($every, self::INCREMENTAL_EVERY, true) && $every !== 'off' ? (int) $every : null;
    }

    /** How many incrementals a chain may hold before the next backup is a full anyway. */
    public static function maxChain(): int
    {
        return self::int('backup_max_chain', 14, 1, 60);
    }

    public static function keepChains(): int
    {
        return self::int('backup_keep_chains', 4, 1, 52);
    }

    public static function keepLocal(): int
    {
        return self::int('backup_keep_local', 1, 0, 10);
    }

    /** @return array{database: bool, public: bool, private: bool} */
    public static function includes(): array
    {
        return [
            'database' => self::bool('backup_include_db', true),
            'public' => self::bool('backup_include_public', true),
            'private' => self::bool('backup_include_private', true),
        ];
    }

    public static function bool(string $key, bool $default): bool
    {
        $value = Setting::get($key);

        return $value === null || $value === '' ? $default : in_array((string) $value, ['1', 'true'], true) || $value === true;
    }

    private static function int(string $key, int $default, int $min, int $max): int
    {
        $value = Setting::get($key);

        return is_numeric($value) ? max($min, min($max, (int) $value)) : $default;
    }

    /**
     * Refuse what would parse to nothing, or point a stored secret somewhere
     * new. Called from `SettingController::update()` with the rows as sent.
     *
     * @param  Collection<string, Setting>  $existing
     */
    public static function validate(array $rows, Collection $existing): void
    {
        $sent = collect($rows)->mapWithKeys(fn ($row, $i) => [(string) ($row['key'] ?? '') => ['i' => $i, 'value' => $row['value'] ?? null]]);
        $fail = fn (string $key, string $message) => throw ValidationException::withMessages(["settings.{$sent[$key]['i']}.value" => $message]);

        foreach (self::OPTIONS as $key => $options) {
            $value = $sent[$key]['value'] ?? null;

            if (filled($value) && ! in_array((string) $value, array_column($options, 'value'), true)) {
                $fail($key, 'That is not one of the choices offered.');
            }
        }

        if (filled($sent['backup_time']['value'] ?? null) && ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string) $sent['backup_time']['value'])) {
            $fail('backup_time', 'Write the time as HH:MM, on the 24-hour clock — 02:15, say.');
        }

        foreach (['backup_max_chain' => [1, 60], 'backup_keep_chains' => [1, 52], 'backup_keep_local' => [0, 10]] as $key => [$min, $max]) {
            $value = $sent[$key]['value'] ?? null;

            if (filled($value) && (! ctype_digit((string) $value) || (int) $value < $min || (int) $value > $max)) {
                $fail($key, "A whole number from {$min} to {$max}.");
            }
        }

        $protocol = (string) ($sent['backup_ftp_protocol']['value'] ?? $existing->get('backup_ftp_protocol')->value ?? 'sftp');
        $port = $sent['backup_ftp_port']['value'] ?? null;

        if (filled($port) && (! ctype_digit((string) $port) || ((int) $port !== (self::FTP_PORTS[$protocol] ?? 21) && ((int) $port < 1024 || (int) $port > 65535)))) {
            $fail('backup_ftp_port', 'Use '.(self::FTP_PORTS[$protocol] ?? 21).' for '.strtoupper($protocol).', or a port from 1024 to 65535.');
        }

        $host = trim((string) ($sent['backup_ftp_host']['value'] ?? ''));

        if ($host !== '' && ! config('backups.allow_private_hosts') && ($refusal = PublicHost::refusal($host))) {
            $fail('backup_ftp_host', $refusal.' A backup server has to be a public host, unless BACKUP_ALLOW_PRIVATE_HOSTS is set on this server.');
        }

        $endpoint = trim((string) ($sent['backup_s3_endpoint']['value'] ?? ''));

        if ($endpoint !== '') {
            $parts = parse_url($endpoint);

            if (($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['query'])) {
                $fail('backup_s3_endpoint', 'An https:// address with no path — https://s3.eu-central-003.backblazeb2.com, say. Leave it blank for Amazon S3.');
            }

            if (! config('backups.allow_private_hosts') && ($refusal = PublicHost::refusal((string) $parts['host']))) {
                $fail('backup_s3_endpoint', $refusal);
            }
        }

        $bucket = trim((string) ($sent['backup_s3_bucket']['value'] ?? ''));

        if ($bucket !== '' && ! preg_match('/^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$/', $bucket)) {
            $fail('backup_s3_bucket', 'A bucket name is 3 to 63 lower-case letters, digits, dots and hyphens.');
        }

        // A new host with the stored secret still in place would send the
        // secret to the new host on the next test; the smtp_host rule.
        foreach (self::SECRETS as $hostKey => $secretKeys) {
            if (! isset($sent[$hostKey])) {
                continue;
            }

            $before = strtolower(trim((string) $existing->get($hostKey)?->value));
            $after = strtolower(trim((string) $sent[$hostKey]['value']));

            if ($after === $before || ($after === '' && $hostKey !== 'backup_s3_endpoint')) {
                continue;
            }

            foreach ($secretKeys as $secretKey) {
                if (filled($existing->get($secretKey)?->value) && ! filled($sent[$secretKey]['value'] ?? null)) {
                    $fail($hostKey, 'Type the password or key again with the new server — a stored one is only ever sent to the server it was saved for.');
                }
            }
        }
    }
}
