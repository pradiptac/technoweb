<?php

namespace Tests\Unit;

use App\Support\Backups\BackupPaths;
use App\Support\Backups\Manifest;
use App\Support\Backups\SqlImporter;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

/**
 * The parts of backup and restore that are pure logic: where a statement
 * ends, which archive entries may be written, and which manifests are
 * believed. Each case is one a naive version gets wrong.
 */
class BackupSqlTest extends TestCase
{
    /** @return list<string> every statement in `$sql`, as `split()` walks it */
    private static function statements(string $sql): array
    {
        $out = [];
        $delimiter = ';';
        $pos = 0;

        while (($found = SqlImporter::split($sql, $pos, $delimiter, true)) !== null) {
            if (isset($found['delimiter'])) {
                $delimiter = $found['delimiter'];
            } else {
                $out[] = $found['sql'];
            }

            $pos = $found['end'];
        }

        return $out;
    }

    /** @return iterable<string, array{string, list<string>}> */
    public static function cases(): iterable
    {
        yield 'plain' => ["SELECT 1;\nSELECT 2;\n", ['SELECT 1', 'SELECT 2']];
        yield 'a semicolon inside a string' => ["INSERT INTO t VALUES ('a;b');SELECT 2;", ["INSERT INTO t VALUES ('a;b')", 'SELECT 2']];
        yield 'a backslash-escaped quote' => ["INSERT INTO t VALUES ('it\\'s; here');", ["INSERT INTO t VALUES ('it\\'s; here')"]];
        yield 'a doubled quote' => ["INSERT INTO t VALUES ('it''s; here');", ["INSERT INTO t VALUES ('it''s; here')"]];
        yield 'a line break inside a string' => ["INSERT INTO t VALUES ('one\ntwo;');\n", ["INSERT INTO t VALUES ('one\ntwo;')"]];
        yield 'double quotes' => ['INSERT INTO t VALUES ("a;\"b");', ['INSERT INTO t VALUES ("a;\"b")']];
        yield 'a backticked name with a semicolon' => ['CREATE TABLE `we;ird` (id int);', ['CREATE TABLE `we;ird` (id int)']];
        yield 'an apostrophe in a line comment' => ["-- it's a comment; really\nSELECT 1;", ['SELECT 1']];
        yield 'an apostrophe in a hash comment' => ["# don't split here;\nSELECT 1;", ['SELECT 1']];
        yield 'a block comment' => ["/* it's; fine */ SELECT 1;", ["/* it's; fine */ SELECT 1"]];
        yield 'a mysqldump conditional' => ["/*!40101 SET NAMES utf8mb4 */;\n", ['/*!40101 SET NAMES utf8mb4 */']];
        yield 'a DELIMITER block' => ["DELIMITER ;;\nCREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW BEGIN SET @a = 1; SET @b = 2; END ;;\nDELIMITER ;\nSELECT 1;", ['CREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW BEGIN SET @a = 1; SET @b = 2; END', 'SELECT 1']];
        yield 'no final semicolon' => ["SELECT 1;\nSELECT 2", ['SELECT 1', 'SELECT 2']];
        yield 'a minus that is not a comment' => ['SELECT 5-3;', ['SELECT 5-3']];
    }

    #[DataProvider('cases')]
    public function test_a_statement_ends_where_the_sql_says_it_does(string $sql, array $expected): void
    {
        $this->assertSame($expected, self::statements($sql));
    }

    public function test_a_statement_cut_by_the_end_of_the_buffer_waits_for_more(): void
    {
        // The read stopped inside a string: not a statement yet.
        $this->assertNull(SqlImporter::split("INSERT INTO t VALUES ('half;", 0, ';', false));
        // Nor is a quote at the very end, which may be the first of two.
        $this->assertNull(SqlImporter::split("INSERT INTO t VALUES ('a'", 0, ';', false));
        $this->assertSame(['sql' => 'SELECT 1', 'end' => 9], SqlImporter::split('SELECT 1;SELECT', 0, ';', false));
    }

    /** @return iterable<string, array{string, bool}> */
    public static function entries(): iterable
    {
        yield 'a media file' => ['public/media/2026/09/logo.png', true];
        yield 'a ticket attachment' => ['private/tickets/7/log.txt', true];
        yield 'climbing out' => ['public/../../escaped.php', false];
        yield 'climbing out at the start' => ['../public/x', false];
        yield 'absolute' => ['/etc/passwd', false];
        yield 'a drive letter' => ['C:/Windows/x', false];
        yield 'another tree' => ['vendor/autoload.php', false];
        yield 'a tree with nothing under it' => ['public/', false];
        yield 'the staging area' => ['private/backups/x/manifest.json', false];
        yield 'the restore area' => ['private/restore/3/database.sql', false];
        yield 'import scratch' => ['private/wordpress-imports/1/h.jsonl', false];
        yield 'backslashes climbing' => ['public\\..\\..\\escaped.php', false];
        yield 'a NUL byte' => ["public/a\0.php", false];
    }

    #[DataProvider('entries')]
    public function test_an_archive_entry_is_written_only_inside_the_two_trees(string $entry, bool $allowed): void
    {
        config(['backups.roots' => ['public' => '/srv/app/public', 'private' => '/srv/app/private']]);

        $this->assertSame($allowed, BackupPaths::restoreTarget($entry) !== null);
    }

    public function test_a_manifest_from_elsewhere_is_not_believed(): void
    {
        $good = ['application' => 'technoware', 'format' => 1, 'type' => 'full', 'chain' => [], 'files' => [['name' => 'database.sql.gz', 'size' => 1, 'sha256' => str_repeat('a', 64)]]];
        $this->assertSame('full', Manifest::parse(json_encode($good))['type']);

        foreach ([
            'not ours' => ['application' => 'wordpress'] + $good,
            'a newer format' => ['format' => 99] + $good,
            'a file we never write' => ['files' => [['name' => '../../.env', 'size' => 1, 'sha256' => str_repeat('a', 64)]]] + $good,
            'a checksum that is not one' => ['files' => [['name' => 'database.sql.gz', 'size' => 1, 'sha256' => 'x']]] + $good,
            'a chain folder climbing out' => ['chain' => ['../other']] + $good,
        ] as $why => $manifest) {
            try {
                Manifest::parse(json_encode($manifest));
                $this->fail("Believed a manifest with {$why}.");
            } catch (RuntimeException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->assertTrue(Manifest::validFolder('20260927-103159-full-5d6cf26e'));
        $this->assertFalse(Manifest::validFolder('../20260927-103159-full-5d6cf26e'));
    }
}
