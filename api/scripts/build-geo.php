<?php

use App\Support\Analytics\Geo;

/*
 * Rebuilds resources/geo/country-v{4,6}.bin from db-ip "IP to Country Lite"
 * (CC BY 4.0, https://db-ip.com). Run from api/: php scripts/build-geo.php
 * [YYYY-MM]. Adjacent ranges of one country are merged; "ZZ" rows dropped.
 */
require __DIR__.'/../vendor/autoload.php';

/** The packed address one higher (big-endian add with carry); null on overflow. No gmp needed. */
function next_address(string $packed): ?string
{
    for ($i = strlen($packed) - 1; $i >= 0; $i--) {
        if ($packed[$i] !== "\xFF") {
            $packed[$i] = chr(ord($packed[$i]) + 1);

            return $packed;
        }
        $packed[$i] = "\x00";
    }

    return null;
}

$month = $argv[1] ?? date('Y-m');
$url = "https://download.db-ip.com/free/dbip-country-lite-{$month}.csv.gz";
$gz = @file_get_contents($url) ?: exit("Could not download {$url}\n");
$csv = gzdecode($gz) ?: exit("Not a gzip file\n");

$rows = [4 => [], 16 => []];
foreach (explode("\n", trim($csv)) as $line) {
    [$start, $end, $country] = str_getcsv($line, ',', '"', '') + [null, null, null];
    if (! $start || ! $end || ! preg_match('/^[A-Z]{2}$/', (string) $country) || $country === 'ZZ') {
        continue;
    }
    $bytes = strlen((string) inet_pton($start));
    $last = array_key_last($rows[$bytes]);
    if ($last !== null && $rows[$bytes][$last][2] === $country
        && next_address((string) inet_pton($rows[$bytes][$last][1])) === inet_pton($start)) {
        $rows[$bytes][$last][1] = $end;

        continue;
    }
    $rows[$bytes][] = [$start, $end, $country];
}

@mkdir(__DIR__.'/../resources/geo', 0755, true);
foreach ([4 => 'country-v4.bin', 16 => 'country-v6.bin'] as $bytes => $file) {
    file_put_contents(__DIR__.'/../resources/geo/'.$file, Geo::pack($rows[$bytes], $bytes));
    printf("%s: %d ranges\n", $file, count($rows[$bytes]));
}
