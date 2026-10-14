<?php

namespace App\Support\Store;

use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Money;

/**
 * GST for the shop: one rate per product, and one place that works out what
 * each line owes (0.176.0).
 *
 * **A stored price always includes GST (0.178.0).** `price_paise` is what
 * the customer pays, whatever the settings say. In 0.176.0 the basis setting
 * decided what the stored number *meant*, so switching it re-read every
 * price in the shop — ₹1,180 became ₹1,392.40 overnight. Now two settings
 * decide only how a price is typed and how it is shown, and neither can
 * change what anybody pays.
 *
 * Why the price with GST and not the base price: a figure before GST, kept
 * in paise, does not survive the trip back. ₹999 typed including GST at 18%
 * is a base of 846.61, which comes back as 998.99 or 999.01 for about one
 * typed price in seven — the gaps between the reachable inclusive figures
 * are 1.18 paise wide. The other direction is exact: a price typed before
 * GST, stored including it and read back out, is always the figure typed
 * (the error is at most 0.5 ÷ 1.18 of a paisa). The Google feed and Zoho
 * Books also read the stored price as including GST, and always did.
 *
 * Four settings, read nowhere else:
 *
 *   - **`store_gst_percent`** — the shop's rate, one of `Tax::RATES`.
 *   - **`store_products.gst_percent`** — that product's own rate, blank
 *     meaning the store-wide one.
 *   - **`store_price_basis`** — how the **website shows** a price: with
 *     GST, or before it with GST added at the checkout. Presentation only.
 *   - **`store_price_entry`** — how the **console takes** a price: typed
 *     with GST, or before it and converted on save at the product's rate.
 *
 * **Everything is computed per line and the order's figures are the sum.**
 * The original schema stored one tax figure on the order and said why:
 * apportioning it across lines means rounding each one, and rounded lines do
 * not add back to the rounding of the total. That was right while one rate
 * applied to everything. With a rate per product the arithmetic runs the
 * other way — each line's tax comes from that line's own money at that
 * line's own rate, and the order's `taxable_paise` and `gst_paise` are the
 * sums — so the figures add up by construction and nothing is apportioned
 * after rounding.
 *
 * The order-level **discount** is apportioned across the lines, because it
 * reduces the value of the goods and each line's share must be taxed at
 * that line's own rate. It is split pro-rata **in paise, by the
 * largest-remainder rule**, so the parts sum exactly to the discount and no
 * paisa is created or lost on the way in.
 *
 * **Delivery is a line of its own**, not a share added to each of the
 * goods. The first cut apportioned it the same way the discount is, which
 * is arithmetically fine and prints badly: every line on the invoice then
 * shows a value a few rupees above the price in the catalogue, and a reader
 * comparing the two concludes the invoice is wrong. It carries the
 * **highest** rate among the goods it is delivering — GST taxes a composite
 * supply at the rate of the principal supply, and where a parcel holds two
 * rates the higher is the answer that cannot under-collect.
 *
 * The arithmetic, which since 0.178.0 has one form because the money in it
 * always includes the tax:
 *
 *     taxable = gross × 10000 ÷ (10000 + rate);  tax = gross − taxable
 *
 * `taxable + tax` is the money that changes hands for that line — which is
 * the one property an invoice may not get wrong.
 */
final class Tax
{
    /** Shown, or typed, with the tax in it. The default for both settings. */
    public const BASIS_INCLUSIVE = 'inclusive';

    /** Shown, or typed, before the tax. */
    public const BASIS_EXCLUSIVE = 'exclusive';

    public const BASES = [self::BASIS_INCLUSIVE, self::BASIS_EXCLUSIVE];

    /** The rates a shop may choose: every real GST slab, and nothing else. */
    public const RATES = ['0', '0.25', '3', '5', '12', '18', '28'];

    /**
     * The shop's rate now, in basis points.
     *
     * Read from `store_gst_percent` through the memoised settings
     * repository, so a basket pricing twelve lines reads the store once
     * rather than twelve times. It lives here rather than on `Money`
     * because `Money` is pure arithmetic with no application behind it —
     * the property that lets its rounding be proved in a unit test.
     *
     * **It is the rate for what is being priced now, and never the rate for
     * something already sold.** Every order keeps its own `taxable_paise`
     * and `gst_paise`, and every line placed since 0.176.0 keeps the rate it
     * was charged at, so changing this row tomorrow cannot rewrite what was
     * charged yesterday. That is the property that makes it safe to be a
     * setting at all.
     */
    public static function rate(): int
    {
        $percent = Setting::get('store_gst_percent');

        return is_string($percent) && in_array($percent, self::RATES, true)
            ? Money::basisPointsOf($percent)
            : Money::GST_BASIS_POINTS;
    }

    /**
     * How the website shows prices: `store_price_basis`.
     *
     * Anything unrecognised is `inclusive`. Since 0.178.0 the answer moves
     * no money — a wrong value shows the right total under the wrong
     * headings — but it is the shop's own default and the safer one to show.
     */
    public static function basis(): string
    {
        return self::read('store_price_basis');
    }

    /** How the console takes prices: `store_price_entry`. */
    public static function entry(): string
    {
        return self::read('store_price_entry');
    }

    private static function read(string $key): string
    {
        $value = Setting::get($key);

        return is_string($value) && in_array($value, self::BASES, true)
            ? $value
            : self::BASIS_INCLUSIVE;
    }

    /**
     * A product's rate in basis points: its own, else the shop's.
     *
     * A blank column is "use the store's", never "zero per cent" — zero is a
     * real slab a shop may choose and is spelled `"0"`.
     */
    public static function rateFor(?StoreProduct $product): int
    {
        return self::rateForPercent($product?->gst_percent);
    }

    /** `rateFor()` for a `gst_percent` value that is not on a saved product yet. */
    public static function rateForPercent(mixed $own): int
    {
        if (is_string($own) && in_array($own, self::RATES, true)) {
            return Money::basisPointsOf($own);
        }

        return self::rate();
    }

    /** A price before tax, with the tax added: what the customer pays. */
    public static function addTo(int $net, int $rate): int
    {
        return $net + intdiv($net * $rate + 5000, 10000);
    }

    /** A price typed in the console, as it is stored: with GST. */
    public static function stored(int $entered, int $rate): int
    {
        return self::entry() === self::BASIS_EXCLUSIVE ? self::addTo($entered, $rate) : $entered;
    }

    /** A stored price as the console's price field shows it. */
    public static function entered(int $stored, int $rate): int
    {
        return self::entry() === self::BASIS_EXCLUSIVE ? Money::taxable($stored, $rate) : $stored;
    }

    /** A stored price as the website shows it. */
    public static function shown(int $stored, int $rate): int
    {
        return self::basis() === self::BASIS_EXCLUSIVE ? Money::taxable($stored, $rate) : $stored;
    }

    /**
     * What to store for a price the console sent back.
     *
     * A price with GST does not always survive the trip to "before GST" and
     * back: ₹999.00 at 18% is shown as ₹846.61, and ₹846.61 plus 18% is
     * ₹999.01. So opening a product under exclusive entry and pressing Save
     * without touching it would move its price by a paisa. When the figure
     * sent is exactly the one the form was given, and the rate under it has
     * not changed, the stored price is kept as it was.
     */
    public static function keep(int $submitted, ?int $stored, int $rate, bool $rateChanged): int
    {
        if ($stored !== null && ! $rateChanged && self::entered($stored, $rate) === $submitted) {
            return $stored;
        }

        return self::stored($submitted, $rate);
    }

    /**
     * The whole of an order's tax, line by line.
     *
     * `$lines` is a list of `['line_total_paise' => int, 'gst_basis_points'
     * => int]` — what those goods cost with GST, as stored, before the
     * order-level discount and before delivery. The two amounts after it
     * include GST too. `basis` on the result is only how the website shows
     * the figures; it moves no money.
     *
     * The returned breakdown's `lines` come back in the order they were
     * given, so a caller can zip them onto the rows it is about to write.
     */
    public static function breakdown(array $lines, int $discountPaise = 0, int $deliveryPaise = 0): TaxBreakdown
    {
        $weights = array_map(static fn (array $l) => max(0, (int) $l['line_total_paise']), $lines);
        $discounts = self::apportion($discountPaise, $weights);

        $out = [];
        $taxable = 0;
        $tax = 0;
        $top = null;

        foreach ($lines as $i => $line) {
            $rate = (int) $line['gst_basis_points'];
            // What this line is worth once the order's discount is on it.
            // Never below zero: a discount larger than a line is a coupon
            // the basket already refused, and a negative taxable value is
            // not a thing an invoice can print.
            $net = max(0, $weights[$i] - $discounts[$i]);

            [$lineTaxable, $lineTax] = self::split($net, $rate);

            $out[] = [
                'gst_basis_points' => $rate,
                'taxable_paise' => $lineTaxable,
                'gst_paise' => $lineTax,
                'gross_paise' => $lineTaxable + $lineTax,
            ];

            $taxable += $lineTaxable;
            $tax += $lineTax;
            $top = $top === null ? $rate : max($top, $rate);
        }

        $delivery = null;

        if ($deliveryPaise > 0) {
            [$deliveryTaxable, $deliveryTax] = self::split($deliveryPaise, $top ?? self::rate());

            $delivery = [
                'gst_basis_points' => $top ?? self::rate(),
                'taxable_paise' => $deliveryTaxable,
                'gst_paise' => $deliveryTax,
                'gross_paise' => $deliveryTaxable + $deliveryTax,
            ];

            $taxable += $deliveryTaxable;
            $tax += $deliveryTax;
        }

        return new TaxBreakdown(
            basis: self::basis(),
            lines: $out,
            delivery: $delivery,
            taxablePaise: $taxable,
            gstPaise: $tax,
        );
    }

    /**
     * An amount with GST in it, as `[taxable, tax]`.
     *
     * @return array{int, int}
     */
    private static function split(int $amount, int $rate): array
    {
        $taxable = Money::taxable($amount, $rate);

        return [$taxable, $amount - $taxable];
    }

    /**
     * Split an amount across weights so the parts sum **exactly** to it.
     *
     * Floor each share, then hand the leftover paise out one at a time to
     * whichever shares were cut by the most — the largest-remainder rule.
     * `(int) round($amount * $w / $total)` on each share is the obvious
     * spelling and is wrong: three equal shares of 100 paise come back as
     * 33+33+33, and the shop is a paisa short on every such order for ever.
     *
     * With nothing to weigh by — a basket of free items that still has
     * delivery on it — the split is equal, which is the only answer that
     * does not divide by zero.
     *
     * @param  list<int>  $weights
     * @return list<int>
     */
    private static function apportion(int $amount, array $weights): array
    {
        $count = count($weights);

        if ($count === 0 || $amount === 0) {
            return array_fill(0, $count, 0);
        }

        $total = array_sum($weights);

        if ($total <= 0) {
            $weights = array_fill(0, $count, 1);
            $total = $count;
        }

        $parts = [];
        $remainders = [];

        foreach ($weights as $i => $weight) {
            $exact = $amount * $weight;
            $parts[$i] = intdiv($exact, $total);
            $remainders[$i] = $exact % $total;
        }

        $left = $amount - array_sum($parts);

        // Biggest remainder first; ties go to the earlier line, so the split
        // is the same every time it is worked out.
        arsort($remainders, SORT_NUMERIC);

        foreach (array_keys($remainders) as $i) {
            if ($left <= 0) {
                break;
            }

            $parts[$i]++;
            $left--;
        }

        ksort($parts);

        return array_values($parts);
    }
}
