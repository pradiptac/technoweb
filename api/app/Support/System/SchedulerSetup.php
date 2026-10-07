<?php

namespace App\Support\System;

use Illuminate\Support\Facades\Cache;
use Symfony\Component\Process\Process;

/**
 * The scheduler's one scheduled task, as the exact command for this server
 * (0.128.0, docs/distribution.md "The scheduler's command").
 *
 * Everything that happens without somebody pressing a button — mail,
 * backups, reminders, imports, messages — hangs off one line run every
 * minute, and the line differs per server in the one part nobody can guess:
 * the path to the **command-line** PHP. The setup wizard worked it out and
 * showed it once, on a screen that cannot be reopened; five other screens
 * printed `cd /path/to/api && php artisan schedule:run` for somebody to
 * rewrite by hand. This is the one definition, read by the wizard and by
 * System → Status.
 *
 * Two halves. `phpCli()` is a pure mapping from what a web request knows
 * (`PHP_BINARY` there is the FPM or CGI binary — or Apache itself — never
 * the CLI a cron line needs) to where each kind of host keeps the CLI.
 * `verify()` is the diagnosis: it runs that binary and reads back its
 * version and SAPI, so the screen can say "checked" rather than "probably".
 * Where the host forbids running a program (shared hosting often disables
 * `proc_open`) the answer is null — *could not be checked* — never a guess
 * dressed as a result.
 */
final class SchedulerSetup
{
    /**
     * @return array{os: string, panel: ?string, php: string, php_checked: ?bool, php_version: ?string, artisan: string, user: ?string, command: string, cron: ?string, work: string, windows_task: ?string, dev: bool}
     */
    public static function report(): array
    {
        $windows = PHP_OS_FAMILY === 'Windows';
        $php = self::phpCli(PHP_BINARY, PHP_SAPI, PHP_OS_FAMILY, PHP_BINDIR);
        $check = self::verify($php);
        $artisan = base_path('artisan');
        $run = self::quote($php, $windows).' '.self::quote($artisan, $windows).' schedule:run';
        // Cron mails whatever a job prints to the account's owner, once a minute.
        $quiet = $run.' >> /dev/null 2>&1';
        $home = require base_path('bootstrap/home.php');

        return [
            'os' => strtolower(PHP_OS_FAMILY),
            'panel' => self::panel(PHP_BINARY),
            'php' => $php,
            'php_checked' => $check === null ? null : $check['ok'],
            'php_version' => $check['version'] ?? null,
            'artisan' => $artisan,
            'user' => self::owner(),
            // What a control panel's "command" box takes, and the whole line a crontab takes.
            'command' => $windows ? $run : $quiet,
            'cron' => $windows ? null : '* * * * * '.$quiet,
            // The foreground version: what a development machine leaves running.
            'work' => self::quote($php, $windows).' '.self::quote($artisan, $windows).' schedule:work',
            'windows_task' => $windows
                ? 'schtasks /Create /SC MINUTE /MO 1 /TN "Website scheduler" /TR "'.str_replace('"', '\\"', $run).'"'
                : null,
            'dev' => ! (is_string($home) && is_file($home.'/config/install.json')),
        ];
    }

    /**
     * The command-line PHP on this host, as well as it can be worked out.
     *
     * In order: a request already served by the CLI (`artisan serve`) names
     * it; Plesk, cPanel and CloudLinux each keep a CLI beside every version
     * at a fixed path; on Windows it is the `php.exe` beside `php-cgi.exe`;
     * otherwise the versioned and then the plain binary in PHP's own bin
     * directory, when one is there. Plain `php` is the last answer, and
     * `verify()` then says whether that happens to be the right one.
     *
     * @param  (callable(string): bool)|null  $exists  The filesystem check, replaceable in a test
     */
    public static function phpCli(string $binary, string $sapi, string $family, string $bindir = '', ?callable $exists = null, ?string $minor = null): string
    {
        $exists ??= static fn (string $path): bool => @is_file($path);
        $minor ??= PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;
        $unix = str_replace('\\', '/', $binary);

        if ($binary !== '' && in_array($sapi, ['cli', 'cli-server', 'phpdbg'], true)) {
            return $binary;
        }

        if (preg_match('#^(/opt/plesk/php/\d+\.\d+)/#', $unix, $m)) {
            return $m[1].'/bin/php';
        }
        if (preg_match('#^(/opt/cpanel/ea-php\d+)/#', $unix, $m)) {
            return $m[1].'/root/usr/bin/php';
        }
        if (preg_match('#^/opt/alt/php(\d+)/#', $unix, $m)) {
            return '/opt/alt/php'.$m[1].'/usr/bin/php';
        }

        if ($family === 'Windows') {
            // Beside the CGI binary; under Apache's module the binary is httpd.exe, and PHP's own folder is the bin directory.
            foreach (array_filter([preg_match('#/php(-cgi|-win)?\.exe$#i', $unix) ? dirname($binary) : null, $bindir]) as $dir) {
                $candidate = rtrim($dir, '\\/').'\\php.exe';

                if ($exists($candidate)) {
                    return $candidate;
                }
            }

            return 'php';
        }

        foreach (array_filter([$bindir, $unix !== '' ? dirname($unix) : null]) as $dir) {
            foreach ([rtrim($dir, '/').'/php'.$minor, rtrim($dir, '/').'/php'] as $candidate) {
                if ($exists($candidate)) {
                    return $candidate;
                }
            }
        }

        return 'php';
    }

    /**
     * Run the binary and read back what it is. Null when this server will
     * not let a web request start a program, or the run could not be made at
     * all; `ok` only for a command-line PHP new enough to run the site.
     *
     * The command is fixed — nothing from a request reaches it — and the
     * answer is kept ten minutes, since a status page is reloaded while
     * somebody waits for the card to turn green.
     *
     * @return array{ok: bool, version: ?string, sapi: ?string}|null
     */
    public static function verify(string $php): ?array
    {
        if (! function_exists('proc_open')) {
            return null;
        }

        return Cache::remember('system:scheduler-php:'.md5($php), 600, static function () use ($php): ?array {
            try {
                $process = new Process([$php, '-r', 'echo PHP_VERSION, "|", PHP_SAPI;']);
                $process->setTimeout(3);
                $process->run();
            } catch (\Throwable) {
                return null;
            }

            if (! $process->isSuccessful() || ! preg_match('/^(\d+\.\d+\.\d+)\S*\|(\w[\w-]*)$/', trim($process->getOutput()), $m)) {
                return ['ok' => false, 'version' => null, 'sapi' => null];
            }

            return [
                'ok' => $m[2] === 'cli' && version_compare($m[1], Requirements::PHP_MIN, '>='),
                'version' => $m[1],
                'sapi' => $m[2],
            ];
        });
    }

    /** The control panel this server runs, where it can be told; the steps differ by it. */
    private static function panel(string $binary): ?string
    {
        $unix = str_replace('\\', '/', $binary);

        return match (true) {
            str_starts_with($unix, '/opt/plesk/') || @is_dir('/usr/local/psa') => 'plesk',
            str_starts_with($unix, '/opt/cpanel/') || @is_dir('/usr/local/cpanel') => 'cpanel',
            default => null,
        };
    }

    /** Who owns the code: the user whose crontab the line belongs in. */
    private static function owner(): ?string
    {
        if (! function_exists('posix_getpwuid')) {
            return null;
        }

        $owner = @fileowner(base_path());
        $name = $owner === false ? null : (posix_getpwuid($owner)['name'] ?? null);

        return is_string($name) && $name !== '' ? $name : null;
    }

    /** A path as a shell reads it: quoted only when it has to be, so the common line stays readable. */
    private static function quote(string $path, bool $windows): string
    {
        if (preg_match('#^[\w./:\\\\-]+$#', $path)) {
            return $path;
        }

        return $windows ? '"'.$path.'"' : "'".str_replace("'", "'\\''", $path)."'";
    }
}
