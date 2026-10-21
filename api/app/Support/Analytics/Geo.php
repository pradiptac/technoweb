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
        $table = self::table($bytes === 4 ? 'country-v4.bin' : 'country-v6.bin');

        return $table === null ? null : self::search($table, $packed, $bytes);
    }

    /** Binary search over records of `$bytes * 2 + 2`. */
    public static function search(string $table, string $packed, int $bytes): ?string
    {
        $width = $bytes * 2 + 2;
        $lo = 0;
        $hi = intdiv(strlen($table), $width) - 1;
        while ($lo <= $hi) {
            $mid = intdiv($lo + $hi, 2);
            $start = substr($table, $mid * $width, $bytes);
            $end = substr($table, $mid * $width + $bytes, $bytes);
            if (strcmp($packed, $start) < 0) {
                $hi = $mid - 1;
            } elseif (strcmp($packed, $end) > 0) {
                $lo = $mid + 1;
            } else {
                return substr($table, $mid * $width + $bytes * 2, 2);
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

    private static function table(string $name): ?string
    {
        static $cache = [];
        if (! array_key_exists($name, $cache)) {
            $path = resource_path('geo/'.$name);
            $cache[$name] = is_file($path) ? (string) file_get_contents($path) : null;
        }

        return $cache[$name];
    }
}
