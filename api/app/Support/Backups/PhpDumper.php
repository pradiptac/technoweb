<?php

namespace App\Support\Backups;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * The database dumped by PHP, for a server that will not run `mysqldump` or a
 * database too large to dump inside one run of the worker.
 *
 * It writes what `mysqldump` would: a `DROP TABLE IF EXISTS` and the server's
 * own `SHOW CREATE TABLE` for each table, then `INSERT`s of
 * `backups.php_dump_rows` rows, one statement per line. Rows are read by
 * primary-key range — `WHERE id > ? ORDER BY id LIMIT n` — so each batch
 * costs the same however deep into a large table it is; a table without a
 * single integer key falls back to `LIMIT … OFFSET`, which is slower and
 * rare here.
 *
 * **Not one snapshot.** Each run of the worker reads inside its own
 * consistent-snapshot transaction, but a dump that spans several runs can
 * see an order written between two tables' turns. `mysqldump` cannot pause,
 * so it cannot have that problem; this can, and for a database this size
 * the dump rarely needs a second run at all.
 *
 * Binary columns go out as hex and timestamps in UTC, so the text reads back
 * the same on any server whatever its character set or time zone.
 */
final class PhpDumper
{
    private const BINARY = ['binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob', 'geometry', 'point', 'linestring', 'polygon', 'bit'];

    /** @param  array<string, mixed>  $cursor */
    public static function step(string $sql, array &$cursor, CarbonImmutable $deadline): bool
    {
        $pdo = DB::connection()->getPdo();
        $zone = DB::selectOne('SELECT @@session.time_zone AS zone')->zone ?? 'SYSTEM';
        DB::statement("SET SESSION time_zone = '+00:00'");
        // Inside a caller's transaction (a test's, say) a START would commit it.
        $own = DB::transactionLevel() === 0;

        if ($own) {
            DB::statement('START TRANSACTION WITH CONSISTENT SNAPSHOT');
        }

        $out = fopen($sql, isset($cursor['tables']) ? 'ab' : 'wb');

        if ($out === false) {
            throw new RuntimeException('The database dump could not be written to this server\'s disk.');
        }

        try {
            if (! isset($cursor['tables'])) {
                $cursor['tables'] = DatabaseDumper::tables();
                $cursor['meta'] = self::meta($cursor['tables']);
                $cursor['t'] = 0;
                $cursor['after'] = null;
                $cursor['offset'] = 0;
                $cursor['started'] = false;
                fwrite($out, "SET NAMES utf8mb4;\nSET TIME_ZONE='+00:00';\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n");
            }

            $batch = max(1, (int) config('backups.php_dump_rows', 500));

            $worked = false;

            while ($cursor['t'] < count($cursor['tables'])) {
                // At least one batch a run, however little time is left.
                if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                    return false;
                }

                $table = (string) $cursor['tables'][$cursor['t']];
                $quoted = '`'.str_replace('`', '``', $table).'`';

                if (! $cursor['started']) {
                    $create = (array) DB::selectOne("SHOW CREATE TABLE {$quoted}");
                    fwrite($out, "\nDROP TABLE IF EXISTS {$quoted};\n".rtrim((string) ($create['Create Table'] ?? array_values($create)[1]), ";\n").";\n");
                    $cursor['started'] = true;
                }

                // Read once for the whole dump, when it started; not three queries a batch.
                $meta = $cursor['meta'][$table] ?? self::meta([$table])[$table];
                $binary = $meta['binary'];
                $key = $meta['key'];
                $list = implode(',', array_map(fn ($n) => '`'.str_replace('`', '``', $n).'`', $meta['columns']));

                if ($key !== null) {
                    $rows = $cursor['after'] === null
                        ? DB::select("SELECT {$list} FROM {$quoted} ORDER BY `{$key}` LIMIT {$batch}")
                        : DB::select("SELECT {$list} FROM {$quoted} WHERE `{$key}` > ? ORDER BY `{$key}` LIMIT {$batch}", [$cursor['after']]);
                } else {
                    $orderBy = $meta['primary'] === [] ? '' : ' ORDER BY '.implode(',', array_map(fn ($c) => '`'.str_replace('`', '``', $c).'`', $meta['primary']));
                    $rows = DB::select("SELECT {$list} FROM {$quoted}{$orderBy} LIMIT {$batch} OFFSET ".(int) $cursor['offset']);
                }

                if ($rows !== []) {
                    $values = [];

                    foreach ($rows as $row) {
                        $cells = [];

                        foreach ((array) $row as $name => $value) {
                            $cells[] = match (true) {
                                $value === null => 'NULL',
                                $binary[$name] ?? false => $value === '' ? "''" : '0x'.bin2hex((string) $value),
                                is_int($value) => (string) $value,
                                is_float($value) => json_encode($value),
                                is_bool($value) => $value ? '1' : '0',
                                default => $pdo->quote((string) $value),
                            };
                        }

                        $values[] = '('.implode(',', $cells).')';
                    }

                    fwrite($out, "INSERT INTO {$quoted} ({$list}) VALUES ".implode(',', $values).";\n");

                    if ($key !== null) {
                        $cursor['after'] = ((array) end($rows))[$key];
                    } else {
                        $cursor['offset'] += count($rows);
                    }
                }

                $worked = true;

                if (count($rows) < $batch) {
                    $cursor['t']++;
                    $cursor['after'] = null;
                    $cursor['offset'] = 0;
                    $cursor['started'] = false;
                }
            }

            fwrite($out, "\nSET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n");

            return true;
        } finally {
            fclose($out);

            if ($own) {
                DB::statement('COMMIT');
            }

            DB::statement('SET SESSION time_zone = ?', [$zone]);
        }
    }

    /**
     * Each table's columns, which of them are binary, its primary key, and the
     * one integer key column a keyset read can use — two queries for the lot.
     *
     * @param  list<string>  $tables
     * @return array<string, array{columns: list<string>, binary: array<string, bool>, primary: list<string>, key: ?string}>
     */
    private static function meta(array $tables): array
    {
        $database = DB::connection()->getDatabaseName();
        $meta = array_fill_keys($tables, ['columns' => [], 'binary' => [], 'types' => [], 'primary' => [], 'key' => null]);

        foreach (DB::select('SELECT table_name AS t, column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema = ? ORDER BY table_name, ordinal_position', [$database]) as $column) {
            if (isset($meta[$column->t])) {
                $meta[$column->t]['columns'][] = (string) $column->name;
                $meta[$column->t]['binary'][(string) $column->name] = in_array(strtolower((string) $column->type), self::BINARY, true);
                $meta[$column->t]['types'][(string) $column->name] = strtolower((string) $column->type);
            }
        }

        foreach (DB::select('SELECT table_name AS t, column_name AS name FROM information_schema.key_column_usage WHERE table_schema = ? AND constraint_name = ? ORDER BY table_name, ordinal_position', [$database, 'PRIMARY']) as $key) {
            if (isset($meta[$key->t])) {
                $meta[$key->t]['primary'][] = (string) $key->name;
            }
        }

        foreach ($meta as $table => $m) {
            $only = count($m['primary']) === 1 ? $m['primary'][0] : null;
            $meta[$table]['key'] = $only !== null && in_array($m['types'][$only] ?? '', ['tinyint', 'smallint', 'mediumint', 'int', 'bigint'], true) ? $only : null;
            unset($meta[$table]['types']);
        }

        return $meta;
    }
}
