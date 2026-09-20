<?php

namespace App\Support\Newsletter;

/**
 * Reading an `.xlsx` without a spreadsheet library and without `ext-zip`.
 *
 * **Why not a library.** `phpoffice/phpspreadsheet` is tens of megabytes of
 * vendor and a general-purpose engine for formulas, charts and styling, to
 * answer one question: what is in this grid of contacts. That is the same
 * trade this project already refused for `aws/aws-sdk-php`.
 *
 * **Why not `ZipArchive`.** It is not compiled in on the development machine
 * here, and whether it is present on a given Plesk host is not something the
 * application can decide. An import that works for one deployment and reports
 * "please save as CSV" on another is worse than one that simply works — so the
 * container is read directly. An xlsx is a ZIP of XML, ZIP is a published
 * format, and `gzinflate` is in zlib, which is effectively universal.
 *
 * What this deliberately does **not** do: formulas beyond their cached result,
 * styles, dates as dates rather than as the serial numbers they are stored as,
 * or the legacy binary `.xls`. A contact list has none of those, and the
 * importer's mapping step shows the first rows so anything odd is visible
 * before a single row is written.
 */
class Xlsx
{
    /** The magic bytes every ZIP — and so every xlsx — starts with. */
    public const SIGNATURE = "PK\x03\x04";

    public static function looksLikeXlsx(string $path): bool
    {
        $handle = @fopen($path, 'rb');

        if ($handle === false) {
            return false;
        }

        $magic = fread($handle, 4);
        fclose($handle);

        return $magic === self::SIGNATURE;
    }

    /**
     * The first worksheet, as headers and rows.
     *
     * @return array{headers: array<int, string>, rows: array<int, array<int, string>>}
     */
    public static function read(string $path, int $limit = Csv::MAX_ROWS): array
    {
        $zip = @file_get_contents($path);

        if ($zip === false || ! str_starts_with($zip, self::SIGNATURE)) {
            return ['headers' => [], 'rows' => []];
        }

        $entries = self::entries($zip);
        $sheet = self::sheetName($entries);

        if ($sheet === null) {
            return ['headers' => [], 'rows' => []];
        }

        $strings = self::sharedStrings(self::extract($zip, $entries, 'xl/sharedStrings.xml') ?? '');
        $rows = self::rows(self::extract($zip, $entries, $sheet) ?? '', $strings, $limit);

        $headers = array_shift($rows) ?? [];

        return ['headers' => $headers, 'rows' => array_values($rows)];
    }

    /**
     * The ZIP central directory: name => [method, compressed size, offset].
     *
     * Read from the end, which is how ZIP is meant to be read — the directory
     * is authoritative and the local headers are not, because a local header
     * may carry zero sizes with the real ones in a trailing data descriptor.
     *
     * @return array<string, array{int, int, int}>
     */
    private static function entries(string $zip): array
    {
        // The end-of-central-directory record, scanning back from the tail.
        // Its comment field can be 64KB, so that is how far back to look.
        $eocd = strrpos($zip, "PK\x05\x06");

        if ($eocd === false) {
            return [];
        }

        $count = unpack('v', substr($zip, $eocd + 10, 2))[1] ?? 0;
        $offset = unpack('V', substr($zip, $eocd + 16, 4))[1] ?? 0;

        $entries = [];
        $cursor = $offset;

        for ($i = 0; $i < $count; $i++) {
            if (substr($zip, $cursor, 4) !== "PK\x01\x02") {
                break;
            }

            $method = unpack('v', substr($zip, $cursor + 10, 2))[1];
            $compressed = unpack('V', substr($zip, $cursor + 20, 4))[1];
            $nameLength = unpack('v', substr($zip, $cursor + 28, 2))[1];
            $extraLength = unpack('v', substr($zip, $cursor + 30, 2))[1];
            $commentLength = unpack('v', substr($zip, $cursor + 32, 2))[1];
            $local = unpack('V', substr($zip, $cursor + 42, 4))[1];

            $name = substr($zip, $cursor + 46, $nameLength);
            $entries[$name] = [$method, $compressed, $local];

            $cursor += 46 + $nameLength + $extraLength + $commentLength;
        }

        return $entries;
    }

    /**
     * One entry's bytes.
     *
     * The local header's own name and extra lengths are read rather than the
     * directory's — they are allowed to differ, and using the wrong one starts
     * the read a few bytes into the compressed data, which inflates to
     * nothing with no error worth the name.
     */
    private static function extract(string $zip, array $entries, string $name): ?string
    {
        if (! isset($entries[$name])) {
            return null;
        }

        [$method, $size, $offset] = $entries[$name];

        if (substr($zip, $offset, 4) !== self::SIGNATURE) {
            return null;
        }

        $nameLength = unpack('v', substr($zip, $offset + 26, 2))[1];
        $extraLength = unpack('v', substr($zip, $offset + 28, 2))[1];
        $start = $offset + 30 + $nameLength + $extraLength;

        $bytes = substr($zip, $start, $size);

        // 0 is stored, 8 is deflate. Nothing else appears in an xlsx written
        // by Excel, LibreOffice or Google Sheets.
        if ($method === 0) {
            return $bytes;
        }

        if ($method !== 8) {
            return null;
        }

        $inflated = @gzinflate($bytes);

        return $inflated === false ? null : $inflated;
    }

    /**
     * The first worksheet's path.
     *
     * Resolved through the workbook's relationships rather than assuming
     * `sheet1.xml`: a file whose first tab was deleted and re-added can have
     * its first sheet stored as `sheet3.xml`, and guessing reads the wrong tab
     * silently — which is worse than failing, because the columns still look
     * plausible.
     */
    private static function sheetName(array $entries): ?string
    {
        foreach (['xl/worksheets/sheet1.xml', 'xl/worksheets/Sheet1.xml'] as $common) {
            if (isset($entries[$common])) {
                return $common;
            }
        }

        foreach (array_keys($entries) as $name) {
            if (str_starts_with($name, 'xl/worksheets/') && str_ends_with($name, '.xml')) {
                return $name;
            }
        }

        return null;
    }

    /**
     * The shared string table.
     *
     * Excel stores every repeated string once and refers to it by index, so a
     * sheet full of `t="s"` cells is meaningless without this. A string can be
     * split across several `<t>` runs when part of it is formatted
     * differently — the runs are joined, or a name in bold arrives cut in
     * half.
     *
     * @return array<int, string>
     */
    private static function sharedStrings(string $xml): array
    {
        if ($xml === '') {
            return [];
        }

        $doc = @simplexml_load_string($xml);

        if ($doc === false) {
            return [];
        }

        $strings = [];

        foreach ($doc->si as $item) {
            $text = '';

            foreach ($item->xpath('.//*[local-name()="t"]') ?: [] as $run) {
                $text .= (string) $run;
            }

            $strings[] = $text;
        }

        return $strings;
    }

    /**
     * The sheet's rows, positioned by their cell references.
     *
     * **`r="C1"` is read rather than counting cells**, and that is the bug
     * this whole class would otherwise have. A row with an empty column simply
     * omits that `<c>` element — so `A,C,D` arrives as three cells, and a
     * reader that appends them in order shifts every column left from the gap
     * onwards. The email column silently becomes the company column for some
     * rows and not others.
     *
     * @param  array<int, string>  $strings
     * @return array<int, array<int, string>>
     */
    private static function rows(string $xml, array $strings, int $limit): array
    {
        if ($xml === '') {
            return [];
        }

        $doc = @simplexml_load_string($xml);

        if ($doc === false || ! isset($doc->sheetData)) {
            return [];
        }

        $rows = [];

        foreach ($doc->sheetData->row as $row) {
            $cells = [];
            $widest = -1;

            foreach ($row->c as $cell) {
                $column = self::columnIndex((string) $cell['r']);
                $type = (string) $cell['t'];

                $value = match ($type) {
                    's' => $strings[(int) $cell->v] ?? '',
                    // Written by Google Sheets and by some exporters: the text
                    // sits inline rather than in the shared table.
                    'inlineStr' => implode('', array_map(
                        'strval',
                        $cell->xpath('.//*[local-name()="t"]') ?: [],
                    )),
                    // A formula's cached result. The formula itself is in <f>
                    // and is deliberately ignored.
                    'str' => (string) $cell->v,
                    'b' => ((string) $cell->v) === '1' ? 'TRUE' : 'FALSE',
                    default => (string) $cell->v,
                };

                $cells[$column] = trim($value);
                $widest = max($widest, $column);
            }

            if ($widest < 0) {
                // An entirely empty row. Kept as empty rather than skipped, so
                // the line numbers the importer reports match what somebody
                // sees in Excel.
                $rows[] = [];

                continue;
            }

            // Filled to the widest cell, so a missing column is an empty
            // string at the right index rather than an absent key.
            $ordered = [];

            for ($i = 0; $i <= $widest; $i++) {
                $ordered[$i] = $cells[$i] ?? '';
            }

            $rows[] = $ordered;

            if (count($rows) > $limit + 1) {
                break;
            }
        }

        // Trailing blank rows are ordinary in a spreadsheet somebody has
        // scrolled through, and every one of them would report as an invalid
        // address.
        while ($rows !== [] && implode('', end($rows)) === '') {
            array_pop($rows);
        }

        return $rows;
    }

    /** `AB12` -> 27. Zero-based, so column A is 0. */
    private static function columnIndex(string $reference): int
    {
        $letters = rtrim($reference, '0123456789');

        if ($letters === '') {
            return 0;
        }

        $index = 0;

        foreach (str_split(strtoupper($letters)) as $letter) {
            $index = $index * 26 + (ord($letter) - 64);
        }

        return $index - 1;
    }
}
