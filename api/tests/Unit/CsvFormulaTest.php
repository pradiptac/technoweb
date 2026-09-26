<?php

namespace Tests\Unit;

use App\Support\Newsletter\Csv;
use PHPUnit\Framework\TestCase;

/**
 * No cell a spreadsheet opens from our exports begins a formula.
 *
 * `Csv::escape()` guards every value it is given — and with PHP's default
 * backslash escape, a value could smuggle a *new* cell past it: `\"` ends the
 * quoted field for Excel, which reads RFC 4180 where a backslash means
 * nothing, and whatever follows the comma is a cell the guard never saw.
 */
class CsvFormulaTest extends TestCase
{
    private const PAYLOAD = 'Bob\\",=HYPERLINK("https://evil.example","Click"),"';

    /** @return list<list<string>> the file read the way Excel reads it */
    private function asExcelReadsIt(array $row): array
    {
        $handle = fopen('php://memory', 'r+');
        Csv::write($handle, ['name', 'email'], [$row]);
        rewind($handle);
        $bytes = stream_get_contents($handle);
        fclose($handle);

        $bytes = preg_replace('/^\xEF\xBB\xBF/', '', (string) $bytes);

        $rows = [];
        foreach (preg_split('/\r?\n/', trim((string) $bytes)) as $line) {
            $rows[] = str_getcsv($line, ',', '"', '');
        }

        return $rows;
    }

    public function test_a_backslash_quote_cannot_open_a_formula_cell(): void
    {
        $rows = $this->asExcelReadsIt([self::PAYLOAD, 'bob@example.test']);

        foreach ($rows as $row) {
            foreach ($row as $cell) {
                $this->assertFalse(
                    $cell !== '' && str_contains("=+-@\t\r", $cell[0]),
                    'A cell begins a formula: '.$cell,
                );
            }
        }

        // And the value survives whole, in its own cell.
        $this->assertCount(2, $rows[1]);
        $this->assertSame(self::PAYLOAD, $rows[1][0]);
    }

    /** What the importer reads back is what the exporter wrote. */
    public function test_the_reader_and_the_writer_agree(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'csv');
        $handle = fopen($path, 'w');
        Csv::write($handle, ['name', 'email'], [[self::PAYLOAD, 'bob@example.test']], escape: false);
        fclose($handle);

        $read = Csv::read($path);
        @unlink($path);

        $this->assertSame([self::PAYLOAD, 'bob@example.test'], $read['rows'][0]);
    }
}
