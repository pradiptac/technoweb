<?php

namespace App\Support;

/**
 * An Indian state or union territory by its two-letter code: what Zoho Books'
 * `place_of_supply` takes (0.134.0, docs/store.md "Zoho Books invoices") and
 * what a shipping zone lists (0.142.0, docs/store.md "Delivery charges and
 * shipping zones"). It lived under `Store\Zoho` until the second reader
 * arrived; `App\Support\Store\Zoho\IndianStates` remains as a subclass so
 * nothing that imported it broke.
 *
 * An address here holds the state's *name* — typed, or filled from the PIN
 * directory — so this is the one translation between the two. Names are
 * compared with everything but letters removed, and the spellings people
 * still use for a renamed state are listed beside the current one.
 *
 * A name this cannot place answers null, and the caller leaves the place of
 * supply off the invoice rather than guess: a wrong state is the wrong tax.
 */
class IndianStates
{
    /** @var array<string, string> code => name */
    public const NAMES = [
        'AN' => 'Andaman and Nicobar Islands',
        'AP' => 'Andhra Pradesh',
        'AR' => 'Arunachal Pradesh',
        'AS' => 'Assam',
        'BR' => 'Bihar',
        'CH' => 'Chandigarh',
        'CG' => 'Chhattisgarh',
        'DN' => 'Dadra and Nagar Haveli and Daman and Diu',
        'DL' => 'Delhi',
        'GA' => 'Goa',
        'GJ' => 'Gujarat',
        'HR' => 'Haryana',
        'HP' => 'Himachal Pradesh',
        'JK' => 'Jammu and Kashmir',
        'JH' => 'Jharkhand',
        'KA' => 'Karnataka',
        'KL' => 'Kerala',
        'LA' => 'Ladakh',
        'LD' => 'Lakshadweep',
        'MP' => 'Madhya Pradesh',
        'MH' => 'Maharashtra',
        'MN' => 'Manipur',
        'ML' => 'Meghalaya',
        'MZ' => 'Mizoram',
        'NL' => 'Nagaland',
        'OD' => 'Odisha',
        'PY' => 'Puducherry',
        'PB' => 'Punjab',
        'RJ' => 'Rajasthan',
        'SK' => 'Sikkim',
        'TN' => 'Tamil Nadu',
        'TS' => 'Telangana',
        'TR' => 'Tripura',
        'UP' => 'Uttar Pradesh',
        'UK' => 'Uttarakhand',
        'WB' => 'West Bengal',
    ];

    /** Other spellings in circulation, already reduced to letters. */
    private const ALIASES = [
        'andamannicobar' => 'AN',
        'andamanandnicobar' => 'AN',
        'chattisgarh' => 'CG',
        'dadraandnagarhaveli' => 'DN',
        'damananddiu' => 'DN',
        'dadranagarhavelidamandiu' => 'DN',
        'newdelhi' => 'DL',
        'nctofdelhi' => 'DL',
        'jammukashmir' => 'JK',
        'orissa' => 'OD',
        'pondicherry' => 'PY',
        'tamilnadu' => 'TN',
        'telengana' => 'TS',
        'uttaranchal' => 'UK',
        'westbengal' => 'WB',
    ];

    public static function code(?string $name): ?string
    {
        $key = self::key((string) $name);

        if ($key === '') {
            return null;
        }

        // Somebody who typed the code itself is as clear as it gets.
        if (isset(self::NAMES[strtoupper(trim((string) $name))])) {
            return strtoupper(trim((string) $name));
        }

        foreach (self::NAMES as $code => $full) {
            if (self::key($full) === $key) {
                return $code;
            }
        }

        return self::ALIASES[$key] ?? null;
    }

    public static function isCode(?string $code): bool
    {
        return isset(self::NAMES[(string) $code]);
    }

    /** The state's name for a code, or null for a code that is not one. */
    public static function name(?string $code): ?string
    {
        return self::NAMES[(string) $code] ?? null;
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        $options = [];

        foreach (self::NAMES as $code => $name) {
            $options[] = ['value' => $code, 'label' => $name];
        }

        usort($options, fn (array $a, array $b) => strcmp($a['label'], $b['label']));

        return $options;
    }

    private static function key(string $name): string
    {
        return (string) preg_replace('/[^a-z]/', '', strtolower(str_replace('&', 'and', $name)));
    }
}
