<?php

namespace App\Support\WordPress;

use App\Support\Address;

/**
 * A WooCommerce address as `App\Support\Address`'s six keys.
 *
 * WooCommerce stores the state and country as codes (`WB`, `IN`); this site
 * stores what a person reads. Indian states are expanded from WooCommerce's
 * own table; anything else keeps its code rather than being guessed at.
 */
final class WooAddress
{
    /** WooCommerce's codes for India's states and union territories. */
    private const IN_STATES = [
        'AN' => 'Andaman and Nicobar Islands', 'AP' => 'Andhra Pradesh', 'AR' => 'Arunachal Pradesh',
        'AS' => 'Assam', 'BR' => 'Bihar', 'CH' => 'Chandigarh', 'CT' => 'Chhattisgarh',
        'DH' => 'Dadra and Nagar Haveli and Daman and Diu', 'DD' => 'Daman and Diu', 'DL' => 'Delhi',
        'GA' => 'Goa', 'GJ' => 'Gujarat', 'HR' => 'Haryana', 'HP' => 'Himachal Pradesh',
        'JK' => 'Jammu and Kashmir', 'JH' => 'Jharkhand', 'KA' => 'Karnataka', 'KL' => 'Kerala',
        'LA' => 'Ladakh', 'LD' => 'Lakshadweep', 'MP' => 'Madhya Pradesh', 'MH' => 'Maharashtra',
        'MN' => 'Manipur', 'ML' => 'Meghalaya', 'MZ' => 'Mizoram', 'NL' => 'Nagaland', 'OR' => 'Odisha',
        'PY' => 'Puducherry', 'PB' => 'Punjab', 'RJ' => 'Rajasthan', 'SK' => 'Sikkim',
        'TN' => 'Tamil Nadu', 'TS' => 'Telangana', 'TR' => 'Tripura', 'UK' => 'Uttarakhand',
        'UP' => 'Uttar Pradesh', 'WB' => 'West Bengal',
    ];

    /**
     * @param  mixed  $woo  a WooCommerce `billing`/`shipping` object
     * @return ?array<string, ?string> null when nothing is filled in
     */
    public static function from(mixed $woo): ?array
    {
        if (! is_array($woo)) {
            return null;
        }

        $country = strtoupper(trim((string) ($woo['country'] ?? '')));
        $state = trim((string) ($woo['state'] ?? ''));

        $address = Address::normalise([
            'line1' => self::clip($woo['address_1'] ?? null),
            'line2' => self::clip($woo['address_2'] ?? null),
            'city' => self::clip($woo['city'] ?? null),
            'state' => self::clip($country === 'IN' || $country === '' ? (self::IN_STATES[strtoupper($state)] ?? $state) : $state),
            'pin' => self::clip($woo['postcode'] ?? null, 20),
            'country' => $country === '' || $country === 'IN' ? 'India' : $country,
        ]);

        return Address::isBlank($address) ? null : $address;
    }

    /** A name from the first and last name, or null. */
    public static function name(mixed $woo): ?string
    {
        if (! is_array($woo)) {
            return null;
        }

        $name = trim(trim((string) ($woo['first_name'] ?? '')).' '.trim((string) ($woo['last_name'] ?? '')));

        return $name === '' ? null : mb_substr($name, 0, 190);
    }

    private static function clip(mixed $value, int $limit = 190): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : mb_substr($value, 0, $limit);
    }
}
