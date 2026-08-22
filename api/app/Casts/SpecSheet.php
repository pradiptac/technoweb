<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * A product spec sheet: an ordered `label => value` map in PHP, stored as an
 * ordered list of pairs in the database.
 *
 * The indirection exists because **MySQL's JSON type does not preserve object
 * key order**. It normalises keys by length and then lexicographically, so a
 * sheet written as Ports, Uplinks, Switching capacity, Rack units, PoE,
 * Warranty comes back as PoE, Ports, Uplinks, Warranty, Rack units, Switching
 * capacity — which is what every seeded product was rendering. An editor
 * reordering rows in the admin had no way to make it stick.
 *
 * JSON *arrays* are order-preserving, so the pairs go in as a list. PHP
 * associative arrays keep insertion order and json_encode follows it, so the
 * API still returns a plain `{"Ports": "24 × 1G"}` object and neither the
 * public site nor the mock API had to change.
 */
class SpecSheet implements CastsAttributes
{
    /** @return array<string, string> */
    public function get(Model $model, string $key, mixed $value, array $attributes): array
    {
        if (blank($value)) {
            return [];
        }

        $decoded = is_array($value) ? $value : json_decode((string) $value, true);

        if (! is_array($decoded)) {
            return [];
        }

        $sheet = [];

        foreach ($decoded as $index => $row) {
            // The pair form this cast writes.
            if (is_array($row) && array_key_exists('label', $row)) {
                $label = trim((string) $row['label']);

                if ($label !== '') {
                    $sheet[$label] = (string) ($row['value'] ?? '');
                }

                continue;
            }

            // Rows written before this cast existed are a plain map. They are
            // read as they are — their order was already lost, and re-saving
            // the product converts them.
            if (is_string($index)) {
                $sheet[$index] = is_scalar($row) ? (string) $row : '';
            }
        }

        return $sheet;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): array
    {
        if (blank($value)) {
            return [$key => null];
        }

        $pairs = [];

        foreach ((array) $value as $label => $entry) {
            // Accept the pair form too, so a caller that already has one does
            // not have to flatten it first.
            if (is_array($entry) && array_key_exists('label', $entry)) {
                $label = $entry['label'];
                $entry = $entry['value'] ?? '';
            }

            $label = trim((string) $label);

            if ($label === '') {
                continue;
            }

            $pairs[] = ['label' => $label, 'value' => is_scalar($entry) ? (string) $entry : ''];
        }

        return [$key => json_encode($pairs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)];
    }
}
