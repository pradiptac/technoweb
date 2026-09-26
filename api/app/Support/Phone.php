<?php

namespace App\Support;

/**
 * A telephone number as a messaging provider wants it: E.164, `+` and the
 * country code and nothing else.
 *
 * The shop is Indian, so a bare mobile is read as one — the checkout's own
 * rule: ten digits opening 6–9, with an optional `91`, `+91` or leading `0`
 * and separators anywhere. A number already written with a `+` is kept as
 * typed (digits only after it), because a customer abroad who typed their
 * own country code knows it better than we do. Anything else — a landline
 * without a code, letters, too few digits — is null, never a guess: a guess
 * sends somebody's order update to a stranger.
 */
final class Phone
{
    public static function e164(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }

        $raw = trim($raw);

        if ($raw === '' || preg_match('/[^\d\s\-().+]/', $raw) === 1) {
            return null;
        }

        $international = str_starts_with($raw, '+');
        $digits = (string) preg_replace('/\D/', '', $raw);

        if ($international) {
            // E.164 allows up to fifteen digits; eight is the shortest real
            // international number worth accepting.
            if (strlen($digits) < 8 || strlen($digits) > 15 || $digits[0] === '0') {
                return null;
            }

            // +91 is held to the Indian mobile rule, since that is the case
            // this shop can check.
            if (str_starts_with($digits, '91') && ! preg_match('/^91[6-9]\d{9}$/', $digits)) {
                return null;
            }

            return '+'.$digits;
        }

        if (preg_match('/^(?:0|91)?([6-9]\d{9})$/', $digits, $m) === 1) {
            return '+91'.$m[1];
        }

        return null;
    }

    /** The E.164 number without its `+` — what Meta and Gupshup want in a `to` field. */
    public static function digits(string $e164): string
    {
        return ltrim($e164, '+');
    }

    /** A number for a screen that is not the owner's: `+91 98••• ••210`. */
    public static function masked(string $e164): string
    {
        $len = strlen($e164);

        if ($len < 8) {
            return $e164;
        }

        return substr($e164, 0, 5).str_repeat('•', $len - 8).substr($e164, -3);
    }
}
