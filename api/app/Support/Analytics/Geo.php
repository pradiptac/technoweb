<?php

namespace App\Support\Analytics;

use Illuminate\Http\Request;

/**
 * A visitor's country (C3): the edge's own header when the site sits behind a
 * CDN, else the vendored table — db-ip "IP to Country Lite", CC BY 4.0
 * (https://db-ip.com), rebuilt by `php scripts/build-geo.php`. Each table is
 * sorted fixed-width records `start(n) end(n) country(2)` searched in place;
 * the address itself is never kept.
 */
final class Geo
{
    private const HEADERS = ['cf-ipcountry', 'cloudfront-viewer-country', 'x-vercel-ip-country'];

    public static function country(Request $request): ?string
    {
        foreach (self::HEADERS as $name) {
            $value = strtoupper(trim((string) $request->header($name)));
            if (preg_match('/^[A-Z]{2}$/', $value) === 1 && $value !== 'XX' && $value !== 'T1') {
                return $value;
            }
        }

        return self::lookup((string) $request->ip());
    }

    public static function lookup(string $ip): ?string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return null;
        }
        $packed = inet_pton($ip);
        if ($packed === false) {
            return null;
        }
        $bytes = strlen($packed);

        return self::searchFile(resource_path('geo/'.($bytes === 4 ? 'country-v4.bin' : 'country-v6.bin')), $packed, $bytes);
    }

    /** Binary search over records of `$bytes * 2 + 2` in a packed string. */
    public static function search(string $table, string $packed, int $bytes): ?string
    {
        $width = $bytes * 2 + 2;

        return self::find(intdiv(strlen($table), $width), fn (int $i): string => substr($table, $i * $width, $width), $packed, $bytes);
    }

    /** The same search over a file, one record read per probe; the handle is opened once per process. A missing file is null. */
    public static function searchFile(string $path, string $packed, int $bytes): ?string
    {
        static $handles = [];
        if (! array_key_exists($path, $handles)) {
            $handles[$path] = is_file($path) ? (fopen($path, 'rb') ?: null) : null;
        }
        $fh = $handles[$path];
        if ($fh === null) {
            return null;
        }
        $width = $bytes * 2 + 2;
        $size = fstat($fh)['size'] ?? 0;

        return self::find(intdiv($size, $width), function (int $i) use ($fh, $width): string {
            fseek($fh, $i * $width);

            return (string) fread($fh, $width);
        }, $packed, $bytes);
    }

    /** @param \Closure(int): string $record record i as raw bytes */
    private static function find(int $count, \Closure $record, string $packed, int $bytes): ?string
    {
        $lo = 0;
        $hi = $count - 1;
        while ($lo <= $hi) {
            $mid = intdiv($lo + $hi, 2);
            $row = $record($mid);
            if (strcmp($packed, substr($row, 0, $bytes)) < 0) {
                $hi = $mid - 1;
            } elseif (strcmp($packed, substr($row, $bytes, $bytes)) > 0) {
                $lo = $mid + 1;
            } else {
                return substr($row, $bytes * 2, 2);
            }
        }

        return null;
    }

    /** @param list<array{0: string, 1: string, 2: string}> $rows sorted by start */
    public static function pack(array $rows, int $bytes): string
    {
        $out = '';
        foreach ($rows as [$start, $end, $country]) {
            $out .= inet_pton($start).inet_pton($end).strtoupper($country);
        }

        return $out;
    }
}
