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
     * 18%, in basis points — the default, not the law.
     *
     * This was a constant and nothing else until 0.176.0, under a docblock
     * arguing that a settings row "would be a promise this system cannot
     * keep", because a real multi-rate catalogue needs a rate *per product*,
     * HSN codes and place-of-supply rules.
     *
     * Half of that is still true and half of it was never the question. A
     * single rate genuinely cannot serve a shop selling garments at 5%
     * beside air conditioners at 28% — that remains the "complex tax engine"
     * the brief rules out, and is still not built. What the constant also
     * did, though, was hard-code **eighteen**: a shop selling nothing but
     * garments is single-rate at 5% and a shop selling nothing but air
     * conditioners is single-rate at 28%, and neither could be installed.
     * One store-wide rate is exactly as honest as one fixed rate and serves
     * every single-rate business rather than one of them.
     *
     * So this is the fallback, and it lives here rather than in `Tax`
     * because this class must stay pure: `Money` is arithmetic over integers
     * with no application behind it, which is what lets `MoneyTest` be a
     * unit test and what makes the rounding provable. Reading the shop's
     * chosen rate is `Tax::rate()`'s job, and every production caller passes
     * the answer in.
     */
    public const GST_BASIS_POINTS = 1800;

    /**
     * One of `Tax::RATES` as basis points: "18" → 1800, "0.25" → 25.
     *
     * The slabs are all quarters of a per cent, so a string of digits and at
     * most two decimals maps across without touching a float — which is the
     * whole reason this file exists.
     */
    public static function basisPointsOf(string $percent): int
    {
        [$whole, $fraction] = array_pad(explode('.', $percent, 2), 2, '0');

        return ((int) $whole) * 100 + ((int) str_pad($fraction, 2, '0'));
    }

    /**
     * The rate an order was charged at, in basis points, from its own figures.
     *
     * Derived rather than stored, and that is the point: `gst ÷ taxable` is
     * arithmetic over two columns every order has carried since the store
     * shipped, so an invoice for an order placed under the old constant
     * prints 18% without a backfill, and one placed after a rate change
     * prints the rate it was actually charged. A stored `gst_rate` column
     * would be a third figure free to disagree with the two that settle it.
     *
     * Snapped to the nearest quarter of a per cent, because every real slab
     * is one and the division carries a paisa of rounding on small amounts.
     * A taxable value of zero — an order of nothing, or a fully discounted
     * one — has no rate to report and answers null.
     */
    public static function rateOf(int $taxablePaise, int $gstPaise): ?int
    {
        if ($taxablePaise <= 0) {
            return null;
        }

        $exact = intdiv($gstPaise * 20000 + $taxablePaise, $taxablePaise * 2);

        return intdiv($exact + 12, 25) * 25;
    }

    /** The taxable value inside a GST-inclusive total. */
    public static function taxable(int $inclusivePaise, ?int $basisPoints = null): int
    {
        $divisor = 10000 + ($basisPoints ?? self::GST_BASIS_POINTS);

        return intdiv($inclusivePaise * 10000 + intdiv($divisor, 2), $divisor);
    }

    /** The GST inside a GST-inclusive total. */
    public static function gst(int $inclusivePaise, ?int $basisPoints = null): int
    {
        return $inclusivePaise - self::taxable($inclusivePaise, $basisPoints);
    }

    /**
     * Basis points as a percentage for a person: 1800 → "18", 25 → "0.25".
     *
     * Trailing zeroes trimmed, because "18.00%" on an invoice line reads as a
     * figure somebody calculated rather than a slab somebody chose.
     */
    public static function ratePercent(int $basisPoints): string
    {
        return rtrim(rtrim(number_format($basisPoints / 100, 2, '.', ''), '0'), '.');
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
     * Rupees as a plain decimal, for a spreadsheet cell.
     *
     * Not `format()`, and the difference is the whole point of the method: a
     * cell containing `₹1,18,000` is **text** to Excel — it cannot be summed,
     * averaged or charted, and an export whose money column will not add up is
     * an export nobody can use. `118000.00` is a number. The column heading
     * carries the unit instead.
     *
     * Always two decimal places, because a column mixing `118000` and
     * `118000.50` is one Excel may read as two different types.
     */
    public static function toRupeeString(int $paise): string
    {
        $negative = $paise < 0;
        $paise = abs($paise);

        return ($negative ? '-' : '').intdiv($paise, 100).'.'.str_pad((string) ($paise % 100), 2, '0', STR_PAD_LEFT);
    }

    /**
     * A rupee figure typed into a spreadsheet cell, read back as paise.
     *
     * The other direction of `toRupeeString()`, and it parses the **text**
     * rather than multiplying: `(int) round("1179.99" * 100)` goes through a
     * double on the way and 117998.99999… is a paisa short exactly often
     * enough to be a reconciliation nobody can explain. The cell may carry
     * what a person writes — a currency sign, Indian grouping commas, a
     * space — and none of that is a number, so it is stripped before the
     * digits are read. Anything else is `null`, never zero: a cell reading
     * "call for price" must be refused by the importer, not stored as a free
     * product.
     */
    public static function fromRupeeString(?string $rupees): ?int
    {
        $text = preg_replace('/[₹\s,]|Rs\.?|INR/iu', '', (string) $rupees) ?? '';

        if ($text === '' || preg_match('/^(-?)(\d+)(?:\.(\d{1,2}))?$/', $text, $m) !== 1) {
            return null;
        }

        $fraction = str_pad($m[3] ?? '', 2, '0');
        $paise = (int) $m[2] * 100 + (int) $fraction;

        return $m[1] === '-' ? -$paise : $paise;
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
