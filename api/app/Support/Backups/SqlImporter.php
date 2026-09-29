<?php

namespace App\Support\Backups;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Runs a dump back into the database a statement at a time, from a byte
 * offset, so a dump of any size can be restored across as many runs of the
 * worker as it takes — nothing here waits on one long `mysql < dump.sql`
 * that the worker's own time limit would kill half-way.
 *
 * The cursor is always a statement boundary, and finding one means reading
 * the SQL rather than splitting on `;`: a semicolon inside a string, a
 * quoted identifier or a comment is not the end of anything. `split()`
 * tracks `'…'`, `"…"` and `` `…` `` (with backslash escapes and doubled
 * quotes), `-- ` and `#` line comments, `/* … *\/` blocks, and
 * `DELIMITER` lines.
 *
 * **Each run of the worker is a new connection**, and a dump's header sets
 * session state — foreign-key checks off, the time zone, the SQL mode — that
 * the next connection does not have. So every step sets them itself, and the
 * statements `mysqldump` writes to *restore* its own saved state
 * (`SET SQL_MODE=@OLD_SQL_MODE`, `@saved_cs_client`) are skipped: in a later run `@OLD_SQL_MODE`
 * is null and MySQL refuses the assignment. So are the few a shared host
 * never grants (`SQL_LOG_BIN`, `GTID_PURGED`), `LOCK TABLES` — a pause between
 * a lock and its unlock left the connection holding the table, and the next
 * run's first query failed while every `migrate` after it waited for ever — and anything naming a database
 * (`CREATE DATABASE`, `USE`) — a restore goes into this application's
 * database, whatever the dump was taken from.
 */
final class SqlImporter
{
    private const READ = 1024 * 1024;

    private const SKIP = [
        '/@OLD_[A-Z_]+/i',
        '/@saved_cs_client/i',
        '/^\s*(LOCK|UNLOCK)\s+TABLES/i',
        '/SQL_LOG_BIN/i',
        '/GTID_PURGED/i',
        '/^\s*(\/\*!\d+\s*)?(CREATE\s+DATABASE|USE\s)/i',
        '/rocksdb/i',
    ];

    /**
     * Run statements until the deadline or the end of the file. True when
     * every statement has been run.
     *
     * @param  array<string, mixed>  $cursor  `offset`, `delimiter`, `statements`
     */
    public static function step(string $file, array &$cursor, CarbonImmutable $deadline): bool
    {
        $cursor['offset'] ??= 0;
        $cursor['delimiter'] ??= ';';
        $cursor['statements'] ??= 0;
        $size = filesize($file);

        $handle = fopen($file, 'rb');

        if ($handle === false || $size === false) {
            throw new RuntimeException('The database dump could not be read from this server\'s disk.');
        }

        $saved = (array) DB::selectOne('SELECT @@session.sql_mode AS sql_mode, @@session.time_zone AS time_zone, @@session.foreign_key_checks AS fk, @@session.unique_checks AS uq');
        DB::unprepared("SET NAMES utf8mb4; SET FOREIGN_KEY_CHECKS=0; SET UNIQUE_CHECKS=0; SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO'; SET TIME_ZONE='+00:00'");
        $preserve = (array) config('backups.preserve_tables');

        try {
            fseek($handle, (int) $cursor['offset']);
            $buffer = '';
            // Where the buffer's first byte sits in the file, and how far into the buffer we are.
            $base = (int) $cursor['offset'];
            $pos = 0;
            $eof = false;

            $worked = false;

            while (true) {
                // At least one statement a run, however little time is left.
                if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                    return false;
                }

                $found = self::split($buffer, $pos, (string) $cursor['delimiter'], $eof);

                if ($found === null) {
                    if ($eof) {
                        $cursor['offset'] = $size;

                        return true;
                    }

                    // Drop what has been run before reading more, so the buffer holds one statement's worth.
                    $buffer = substr($buffer, $pos);
                    $base += $pos;
                    $pos = 0;

                    $chunk = fread($handle, self::READ);
                    $eof = $chunk === false || $chunk === '' || feof($handle);
                    $buffer .= (string) $chunk;

                    continue;
                }

                if (isset($found['delimiter'])) {
                    $cursor['delimiter'] = $found['delimiter'];
                } elseif (! self::skipped($found['sql'], $preserve)) {
                    try {
                        DB::unprepared($found['sql']);
                    } catch (\Throwable $e) {
                        throw new RuntimeException('Statement '.($cursor['statements'] + 1).' of the dump was refused: '.mb_substr($e->getMessage(), 0, 300));
                    }

                    $cursor['statements']++;
                }

                $worked = true;
                $pos = $found['end'];
                $cursor['offset'] = $base + $pos;
            }
        } finally {
            fclose($handle);
            DB::statement('SET SESSION sql_mode = ?', [$saved['sql_mode'] ?? '']);
            DB::statement('SET SESSION time_zone = ?', [$saved['time_zone'] ?? 'SYSTEM']);
            DB::statement('SET SESSION foreign_key_checks = '.((int) ($saved['fk'] ?? 1)));
            DB::statement('SET SESSION unique_checks = '.((int) ($saved['uq'] ?? 1)));
        }
    }

    /**
     * The next statement in `$buffer` from `$start`: its text without the
     * delimiter, and the offset just past it — or a `DELIMITER` change — or
     * null when the buffer ends first (at end of file, whatever is left is
     * the last statement).
     *
     * @return array{sql: string, end: int}|array{delimiter: string, end: int}|null
     */
    public static function split(string $buffer, int $start, string $delimiter, bool $eof): ?array
    {
        $length = strlen($buffer);
        $i = $start;

        // Whitespace and whole-line comments before the statement.
        while ($i < $length) {
            if (ctype_space($buffer[$i])) {
                $i++;

                continue;
            }

            if ($buffer[$i] === '#' || substr($buffer, $i, 3) === '-- ' || substr($buffer, $i, 3) === "--\n" || substr($buffer, $i, 4) === "--\r\n") {
                $newline = strpos($buffer, "\n", $i);

                if ($newline === false) {
                    return null;
                }

                $i = $newline + 1;

                continue;
            }

            break;
        }

        if ($i >= $length) {
            return null;
        }

        if (preg_match('/\GDELIMITER[ \t]+(\S+)[ \t]*(\r?\n|$)/i', $buffer, $m, 0, $i)) {
            if ($m[2] === '' && ! $eof) {
                return null;
            }

            return ['delimiter' => $m[1], 'end' => $i + strlen($m[0])];
        }

        $from = $i;
        $first = $delimiter[0];
        $stops = "'\"`#-/".$first;

        while ($i < $length) {
            $i += strcspn($buffer, $stops, $i);

            if ($i >= $length) {
                break;
            }

            $char = $buffer[$i];

            if ($char === $first && substr($buffer, $i, strlen($delimiter)) === $delimiter) {
                return ['sql' => trim(substr($buffer, $from, $i - $from)), 'end' => $i + strlen($delimiter)];
            }

            if ($char === '\'' || $char === '"' || $char === '`') {
                $close = self::closing($buffer, $i + 1, $char);

                if ($close === null) {
                    return $eof ? self::rest($buffer, $from, $length) : null;
                }

                $i = $close + 1;

                continue;
            }

            if ($char === '#' || ($char === '-' && substr($buffer, $i, 2) === '--' && ($i + 2 >= $length || ctype_space($buffer[$i + 2])))) {
                $newline = strpos($buffer, "\n", $i);

                if ($newline === false) {
                    return $eof ? self::rest($buffer, $from, $length) : null;
                }

                $i = $newline + 1;

                continue;
            }

            if ($char === '/' && substr($buffer, $i, 2) === '/*') {
                $end = strpos($buffer, '*/', $i + 2);

                if ($end === false) {
                    return $eof ? self::rest($buffer, $from, $length) : null;
                }

                $i = $end + 2;

                continue;
            }

            $i++;
        }

        return $eof ? self::rest($buffer, $from, $length) : null;
    }

    /** @return array{sql: string, end: int}|null */
    private static function rest(string $buffer, int $from, int $length): ?array
    {
        $sql = trim(substr($buffer, $from));

        return $sql === '' ? null : ['sql' => $sql, 'end' => $length];
    }

    /** The offset of the quote closing one opened just before `$i`, or null. */
    private static function closing(string $buffer, int $i, string $quote): ?int
    {
        $length = strlen($buffer);

        while ($i < $length) {
            $next = strcspn($buffer, $quote === '`' ? '`' : $quote.'\\', $i) + $i;

            if ($next >= $length) {
                return null;
            }

            if ($buffer[$next] === '\\') {
                $i = $next + 2;

                continue;
            }

            // A doubled quote is an escaped one.
            if ($next + 1 < $length && $buffer[$next + 1] === $quote) {
                $i = $next + 2;

                continue;
            }

            if ($next + 1 >= $length) {
                // Cannot tell a closing quote from the first half of a doubled one yet.
                return null;
            }

            return $next;
        }

        return null;
    }

    /** @param  list<string>  $preserve */
    private static function skipped(string $sql, array $preserve): bool
    {
        if ($sql === '') {
            return true;
        }

        foreach (self::SKIP as $pattern) {
            if (preg_match($pattern, $sql)) {
                return true;
            }
        }

        // A dump made elsewhere may carry the tables a restore must leave alone.
        if (preg_match('/^\s*(?:DROP\s+TABLE(?:\s+IF\s+EXISTS)?|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|INSERT\s+INTO|LOCK\s+TABLES|\/\*!\d+\s+ALTER\s+TABLE|ALTER\s+TABLE)\s+`?([A-Za-z0-9_$]+)`?/i', $sql, $m)) {
            return in_array($m[1], $preserve, true);
        }

        return false;
    }
}
