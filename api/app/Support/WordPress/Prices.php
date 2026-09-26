<?php

namespace App\Support\WordPress;

use App\Support\Money;

/**
 * WooCommerce's prices as paise.
 *
 * The REST API sends a price as a decimal string (`"1179.99"`), which
 * `Money::fromRupeeString()` reads exactly — no float ever holds it. A
 * number it cannot read (three decimal places, a locale's comma) is null,
 * and the product is skipped and named rather than priced at zero.
 *
 * **Catalogue prices, and only those, follow the review's tax decision.**
 * This shop's prices include GST. When WooCommerce added tax on top, the
 * review chose `add_gst` (every price grows by 18%) or `keep` (the numbers
 * stay, so each price now includes the tax it used to have added). Order
 * totals are history and are never adjusted: an order is what was charged.
 */
final class Prices
{
    public static function paise(Context $ctx, mixed $price): ?int
    {
        $text = trim((string) $price);

        if ($text === '') {
            return null;
        }

        $paise = Money::fromRupeeString($text);

        if ($paise === null || $paise < 0) {
            return null;
        }

        return $ctx->decision('tax_basis') === 'add_gst'
            ? intdiv($paise * (10000 + Money::GST_BASIS_POINTS) + 5000, 10000)
            : $paise;
    }

    /** An amount recorded on an order, exactly as WooCommerce recorded it. */
    public static function recorded(mixed $amount): ?int
    {
        $text = trim((string) $amount);

        if ($text === '') {
            return 0;
        }

        // Refunds and discounts arrive negative in places; the sign is the caller's business.
        $negative = str_starts_with($text, '-');
        $paise = Money::fromRupeeString(ltrim($text, '-'));

        return $paise === null ? null : ($negative ? -$paise : $paise);
    }

    /** Grams from a weight in the shop's unit. */
    public static function grams(mixed $weight, string $unit): ?int
    {
        $value = trim((string) $weight);

        if ($value === '' || ! is_numeric($value)) {
            return null;
        }

        $grams = (float) $value * match (strtolower($unit)) {
            'kg' => 1000,
            'lbs' => 453.59237,
            'oz' => 28.349523125,
            default => 1,
        };

        return $grams > 0 ? (int) round($grams) : null;
    }
}
