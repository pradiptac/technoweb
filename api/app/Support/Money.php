<?php

namespace App\Support;

/**
 * Money, in paise, as integers — and the GST split that goes with it.
 *
 * Every amount in the store is an integer number of paise. Not a float, which
 * cannot represent 11800.10 and will eventually produce a total that is one
 * paisa off in a way nobody can reproduce; and not a `decimal` column either,
 * which is exact in the database and comes back as a *string* that the first
 * arithmetic anybody writes converts to float anyway.
 *
 * **The GST arithmetic is integer arithmetic.** Prices are GST-inclusive by the
 * brief, so the tax is extracted rather than added:
 *
 *     taxable = total × 10000 ÷ (10000 + rate)
 *     gst     = total − taxable
 *
 * Written that way round on purpose. Computing the GST first and subtracting it
 * to get the taxable value gives the same two numbers most of the time and,
 * on the roundings where it does not, produces a taxable value and a GST that
 * **do not add up to what the customer paid** — which is the one thing an
 * invoice may not do. Here they add up by construction, because one of them is
 * defined as the difference.
 *
 * The division rounds half up without ever touching a float:
 * `intdiv($n * 10000 + $half, 10000 + $rate)`.
 */
class Money
{
    /**
     * 18%, in basis points, and it is not configurable.
     *
     * The brief states one rate for everything sold here. A settings row would
     * be a promise this system cannot keep — a real multi-rate catalogue needs
     * a rate *per product*, HSN codes and place-of-supply rules, which is the
     * "complex tax engine" the brief rules out. One constant, named, is honest
     * about that; a configurable single rate would not be.
     */
    public const GST_BASIS_POINTS = 1800;

    /** The taxable value inside a GST-inclusive total. */
    public static function taxable(int $inclusivePaise, int $basisPoints = self::GST_BASIS_POINTS): int
    {
        $divisor = 10000 + $basisPoints;

        return intdiv($inclusivePaise * 10000 + intdiv($divisor, 2), $divisor);
    }

    /** The GST inside a GST-inclusive total. */
    public static function gst(int $inclusivePaise, int $basisPoints = self::GST_BASIS_POINTS): int
    {
        return $inclusivePaise - self::taxable($inclusivePaise, $basisPoints);
    }

    /**
     * A percentage of an amount, rounded half up.
     *
     * Used by percentage coupons. `(int) round($a * $p / 100)` is the obvious
     * spelling and goes through a float to get there.
     */
    public static function percentage(int $paise, int $percent): int
    {
        return intdiv($paise * $percent + 50, 100);
    }

    /**
     * For email and anywhere else with no browser.
     *
     * Indian digit grouping — 1,18,000 rather than 118,000 — because this is
     * an Indian storefront and the western grouping reads as a typo to the
     * people using it. The frontend uses `Intl.NumberFormat('en-IN')`, which
     * does the same thing natively; this exists for the places that cannot.
     */
    public static function format(int $paise, bool $withPaise = false): string
    {
        $negative = $paise < 0;
        $paise = abs($paise);

        $rupees = intdiv($paise, 100);
        $remainder = $paise % 100;

        $digits = (string) $rupees;

        if (strlen($digits) > 3) {
            $last = substr($digits, -3);
            $rest = substr($digits, 0, -3);
            // Every two digits from the right, which is the whole of the
            // lakh/crore grouping.
            $rest = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest);
            $digits = $rest.','.$last;
        }

        $out = '₹'.$digits;

        if ($withPaise || $remainder !== 0) {
            $out .= '.'.str_pad((string) $remainder, 2, '0', STR_PAD_LEFT);
        }

        return ($negative ? '-' : '').$out;
    }
}
