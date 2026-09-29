<?php

namespace App\Support\Backups;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use RuntimeException;
use Symfony\Component\Process\ExecutableFinder;

/**
 * The database as one `database.sql.gz`.
 *
 * Two ways to produce it, one format out:
 *
 *  - **`mysqldump`**, when this server has the binary and PHP may start it.
 *    One consistent snapshot (`--single-transaction`), fast, and done in one
 *    step — so `auto` uses it only for a database that dumps comfortably
 *    inside one run of the worker.
 *  - **The PHP dumper** (`PhpDumper`) everywhere else. Shared hosting often
 *    disables `proc_open`, and a backup feature that needs a binary the host
 *    will not run is one that does not run. It pauses between tables and
 *    between batches of rows, which the binary cannot.
 *
 * The password never reaches a command line — `ps` shows arguments to
 * every user on the box — but a `--defaults-extra-file` readable only by
 * this process's user, deleted in `finally`.
 *
 * Both leave out `backups.preserve_tables`: the queue, the cache and the
 * backup machinery itself, which a restore must not overwrite.
 */
final class DatabaseDumper
{
    /**
     * Advance the dump. True when `database.sql.gz` is complete.
     *
     * @param  array<string, mixed>  $cursor  kept by the caller between steps
     */
    public static function step(string $directory, array &$cursor, CarbonImmutable $deadline): bool
    {
        $sql = $directory.DIRECTORY_SEPARATOR.'database.sql';
        $cursor['dumper'] ??= self::choose();

        $done = $cursor['dumper'] === 'mysqldump'
            ? self::viaBinary($sql)
            : PhpDumper::step($sql, $cursor, $deadline);

        if (! $done) {
            return false;
        }

        self::compress($sql, $sql.'.gz');
        @unlink($sql);

        return true;
    }

    /** `mysqldump` or `php`, by configuration and what this server has. */
    public static function choose(): string
    {
        $wanted = (string) config('backups.dumper', 'auto');

        if ($wanted === 'php' || self::binary() === null) {
            return 'php';
        }

        if ($wanted === 'mysqldump') {
            return 'mysqldump';
        }

        return self::estimatedBytes() <= (int) config('backups.binary_max_bytes') ? 'mysqldump' : 'php';
    }

    /** The `mysqldump` this server can run, or null. */
    public static function binary(): ?string
    {
        if (! function_exists('proc_open')) {
            return null;
        }

        $configured = trim((string) config('backups.mysqldump'));

        if ($configured !== '') {
            if (is_dir($configured)) {
                $configured = rtrim($configured, '/\\').DIRECTORY_SEPARATOR.'mysqldump'.(PHP_OS_FAMILY === 'Windows' ? '.exe' : '');
            }

            return is_file($configured) ? $configured : null;
        }

        return (new ExecutableFinder)->find('mysqldump');
    }

    /** What `information_schema` says the dumped tables hold. */
    public static function estimatedBytes(): int
    {
        try {
            return (int) DB::table('information_schema.tables')
                ->where('table_schema', DB::connection()->getDatabaseName())
                ->whereNotIn('table_name', (array) config('backups.preserve_tables'))
                ->sum(DB::raw('data_length + index_length'));
        } catch (\Throwable) {
            return 0;
        }
    }

    /**
     * The base tables a dump covers, in name order.
     *
     * @return list<string>
     */
    public static function tables(): array
    {
        $database = DB::connection()->getDatabaseName();
        $rows = DB::select('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = ? ORDER BY table_name', [$database, 'BASE TABLE']);
        $preserve = (array) config('backups.preserve_tables');

        return array_values(array_filter(
            array_map(fn ($row) => (string) $row->name, $rows),
            fn (string $table) => ! in_array($table, $preserve, true),
        ));
    }

    private static function viaBinary(string $sql): bool
    {
        $connection = config('database.connections.'.config('database.default'));
        $binary = self::binary() ?? throw new RuntimeException('mysqldump is no longer available on this server.');
        $defaults = tempnam(sys_get_temp_dir(), 'twbk');

        try {
            @chmod($defaults, 0600);
            file_put_contents($defaults, "[client]\n"
                .'user="'.addcslashes((string) $connection['username'], '"\\')."\"\n"
                .'password="'.addcslashes((string) $connection['password'], '"\\')."\"\n"
                .(filled($connection['unix_socket'] ?? null)
                    ? 'socket="'.addcslashes((string) $connection['unix_socket'], '"\\')."\"\n"
                    : 'host="'.addcslashes((string) $connection['host'], '"\\')."\"\nport=".(int) ($connection['port'] ?? 3306)."\n"));

            $database = (string) $connection['database'];
            $args = [
                $binary,
                '--defaults-extra-file='.$defaults,
                '--single-transaction', '--quick', '--skip-lock-tables', '--no-tablespaces', '--hex-blob',
                '--default-character-set=utf8mb4', '--skip-comments', '--skip-add-locks',
                '--result-file='.$sql,
            ];

            // mysqldump 8 asks a server for column statistics a MariaDB or
            // 5.7 server does not have, and fails; MariaDB's refuses the flag.
            $version = (string) Process::run([$binary, '--version'])->output();

            if (! str_contains(strtolower($version), 'mariadb') && preg_match('/Ver 8|Distrib 8|\s8\.\d+\.\d+/', $version)) {
                $args[] = '--column-statistics=0';
            }

            foreach ((array) config('backups.preserve_tables') as $table) {
                $args[] = '--ignore-table='.$database.'.'.$table;
            }

            $args[] = $database;

            $result = Process::timeout((int) config('backups.budget_seconds', 40) + 30)->run($args);

            if (! $result->successful()) {
                throw new RuntimeException('mysqldump refused: '.mb_substr(trim($result->errorOutput() ?: $result->output()), 0, 400));
            }

            return true;
        } finally {
            @unlink($defaults);
        }
    }

    private static function compress(string $from, string $to): void
    {
        $in = fopen($from, 'rb');
        $out = gzopen($to, 'wb6');

        if ($in === false || $out === false) {
            throw new RuntimeException('The database dump could not be compressed on this server\'s disk.');
        }

        try {
            while (! feof($in)) {
                gzwrite($out, (string) fread($in, 1024 * 1024));
            }
        } finally {
            fclose($in);
            gzclose($out);
        }
    }
}
