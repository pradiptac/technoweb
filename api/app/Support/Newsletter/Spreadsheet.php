<?php

namespace App\Support\Newsletter;

/**
 * One way in for a file of contacts, whatever it happens to be.
 *
 * Chosen by the **bytes**, not by the extension. People rename files, and
 * "export from our CRM.csv" is regularly an xlsx that somebody renamed — read
 * as CSV it produces one enormous unreadable column and an import that reports
 * every row invalid, which looks like the feature is broken rather than like
 * the file being something else.
 */
class Spreadsheet
{
    /**
     * @return array{headers: array<int, string>, rows: array<int, array<int, string>>, format: string, has_header: bool}
     */
    public static function read(string $path, int $limit = Csv::MAX_ROWS): array
    {
        if (Xlsx::looksLikeXlsx($path)) {
            $parsed = Xlsx::read($path, $limit);

            return [...self::header($parsed['headers'], $parsed['rows']), 'format' => 'xlsx'];
        }

        $parsed = Csv::read($path, $limit);

        return [...self::header($parsed['headers'], $parsed['rows']), 'format' => 'csv'];
    }

    /**
     * Decide whether the first row was a header at all.
     *
     * **A file of bare addresses has no header row**, and that is not an edge
     * case — it is what somebody has when a colleague sends them a column
     * copied out of a mailbox. Treating the first line as a header there eats
     * the first address and reports "0 rows", which reads as the file being
     * empty rather than as its first line having been misunderstood. A real
     * address was lost this way on the first file anybody tried.
     *
     * The test is unambiguous in the direction that matters: **no legitimate
     * column heading is a valid email address**. So if the first row contains
     * one, it is data, and the columns are numbered instead.
     *
     * @param  array<int, string>  $headers
     * @param  array<int, array<int, string>>  $rows
     * @return array{headers: array<int, string>, rows: array<int, array<int, string>>, has_header: bool}
     */
    private static function header(array $headers, array $rows): array
    {
        foreach ($headers as $cell) {
            if (filter_var(trim($cell), FILTER_VALIDATE_EMAIL) !== false) {
                return [
                    'headers' => array_map(
                        fn (int $i) => 'Column '.($i + 1),
                        array_keys($headers),
                    ),
                    // The first line goes back to being data, where it belongs.
                    'rows' => [$headers, ...$rows],
                    'has_header' => false,
                ];
            }
        }

        return ['headers' => $headers, 'rows' => $rows, 'has_header' => true];
    }

    /**
     * The old binary `.xls`, which this cannot read and will not pretend to.
     *
     * It is a completely different format from `.xlsx` — an OLE compound
     * document rather than a zip of XML — and reading it genuinely does need a
     * library. Detected by its magic bytes so the refusal names the real
     * problem and the fix, rather than letting it through to be parsed as CSV
     * and reported as several thousand invalid rows.
     */
    public static function isLegacyExcel(string $path): bool
    {
        $handle = @fopen($path, 'rb');

        if ($handle === false) {
            return false;
        }

        $magic = fread($handle, 8);
        fclose($handle);

        return $magic === "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1";
    }
}
