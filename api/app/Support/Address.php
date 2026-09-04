<?php

namespace App\Support;

/**
 * The shape of a postal address, in one place.
 *
 * Two screens write one: the checkout, and the portal's own profile. They had
 * been going to hold two copies of the same six field rules and two copies of
 * the same normaliser — which is the drift this codebase has already paid for
 * twice, with `admin_path` spelled in the API's resource names and the
 * newsletter's footer address resolved three different ways.
 *
 * There is deliberately **no validation of what an address means**. A PIN code
 * is six digits here and nothing checks it against India Post, for the reason
 * `email:dns` is banned on a public form: a lookup on the request path is a
 * cost this project has measured once at 12.5 seconds, and the delivery
 * address is checked by the person carrying the parcel.
 */
class Address
{
    /** The parts, in the order the form asks for them. */
    public const FIELDS = ['line1', 'line2', 'city', 'state', 'pin', 'country'];

    /**
     * Validation rules for one address block, keyed under `$prefix`.
     *
     * Every part is nullable here. Whether an address is *required* is a
     * question about the request — the basket decides it at the checkout, and
     * the profile never requires one at all — so it belongs at the call site
     * rather than in the shape.
     */
    public static function rules(string $prefix): array
    {
        return [
            "{$prefix}.line1" => ['nullable', 'string', 'max:180'],
            "{$prefix}.line2" => ['nullable', 'string', 'max:180'],
            "{$prefix}.city" => ['nullable', 'string', 'max:120'],
            "{$prefix}.state" => ['nullable', 'string', 'max:120'],
            "{$prefix}.pin" => ['nullable', 'string', 'max:12'],
            "{$prefix}.country" => ['nullable', 'string', 'max:60'],
        ];
    }

    /**
     * Every key present, in a fixed order, whatever arrived.
     *
     * The fixed order is for the *reader* — a stored address that always has
     * the same six keys in the same sequence is one anybody can diff by eye.
     *
     * **It is not what makes two addresses comparable, and must not be relied
     * on for that.** MySQL's JSON type normalises object keys by length and
     * then alphabetically, so an address written in this order comes back as
     * `pin, city, line1, line2, state, country` — the trap `App\Casts\SpecSheet`
     * already exists for. Comparing a freshly normalised array with one read
     * back from the database using `===` therefore answers *false* for two
     * identical addresses. Use `same()`.
     */
    public static function normalise(array $address): array
    {
        return [
            'line1' => $address['line1'] ?? null,
            'line2' => $address['line2'] ?? null,
            'city' => $address['city'] ?? null,
            'state' => $address['state'] ?? null,
            'pin' => $address['pin'] ?? null,
            // The only default. This business ships within India, and asking
            // somebody to type it is a field that is right 100% of the time.
            'country' => $address['country'] ?? 'India',
        ];
    }

    /**
     * Nothing filled in is not an address, however many keys it carries.
     *
     * **`country` does not count**, and that is the whole of why this is a
     * method rather than an `array_filter`. It is the one part that is
     * defaulted, so every normalised address carries "India" whether or not a
     * person typed anything — and a check that counted it would call an empty
     * form a filled-in address.
     */
    public static function isBlank(?array $address): bool
    {
        if ($address === null) {
            return true;
        }

        foreach (self::FIELDS as $field) {
            if ($field !== 'country' && filled($address[$field] ?? null)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Are these the same address?
     *
     * Field by field, never `===` on the two arrays. They are stored in a JSON
     * column and MySQL reorders object keys, so one value straight from a form
     * and one read back from the database have different key orders and are
     * never identical — which would quietly answer "no" for two addresses that
     * are plainly the same, and store a duplicate delivery address for every
     * customer who has one.
     *
     * `country` is compared like everything else here: two addresses differing
     * only by country are two addresses. It is excluded from `isBlank` because
     * it is *defaulted*, which is a different question.
     */
    public static function same(?array $a, ?array $b): bool
    {
        if ($a === null || $b === null) {
            return $a === $b;
        }

        foreach (self::FIELDS as $field) {
            if (($a[$field] ?? null) !== ($b[$field] ?? null)) {
                return false;
            }
        }

        return true;
    }
}
