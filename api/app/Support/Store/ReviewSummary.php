<?php

namespace App\Support\Store;

use App\Models\ProductReview;
use App\Models\StoreProduct;

/**
 * A product's rating, as every card and list reads it.
 *
 * Stored on `store_products` (`rating_average`, `rating_count`) rather than
 * aggregated per read: a grid of twenty-four cards would otherwise run
 * twenty-four `AVG()`s, and the storefront index is the most-read list in
 * the shop. The cost is that the two columns are a second answer to "what
 * do the published reviews say" — so there is exactly one writer, this
 * class, and exactly one caller, `ProductReview`'s own `saved` and
 * `deleted` hooks, which fire on every path a review takes in or out of
 * `published`.
 *
 * Written with a base query rather than a model save: the product's
 * `updated_at` is its own editorial change and the sitemap's `lastmod`, and
 * a customer's review arriving is neither; model events on the product
 * (SEO pings, webhooks) have no business firing for it either.
 */
final class ReviewSummary
{
    public static function refresh(StoreProduct $product): void
    {
        [$average, $count] = self::measure($product->id);

        StoreProduct::query()->whereKey($product->id)->toBase()->update([
            'rating_average' => $average,
            'rating_count' => $count,
        ]);

        // The caller's copy agrees with the row, so a resource built from it
        // in the same request says what the database now says.
        $product->forceFill(['rating_average' => $average, 'rating_count' => $count])->syncOriginal();
    }

    public static function refreshById(int $productId): void
    {
        [$average, $count] = self::measure($productId);

        StoreProduct::query()->whereKey($productId)->toBase()->update([
            'rating_average' => $average,
            'rating_count' => $count,
        ]);
    }

    /**
     * How many published reviews give each number of stars, five first.
     *
     * Every key is present, zeros included, so a breakdown drawn from it has
     * five rows whatever has been said — a bar chart with a missing row reads
     * as a rendering fault.
     *
     * @return array<int, int>
     */
    public static function distribution(int $productId): array
    {
        $counts = ProductReview::query()->published()
            ->where('store_product_id', $productId)
            ->selectRaw('rating, count(*) as n')
            ->groupBy('rating')
            ->pluck('n', 'rating');

        $out = [];

        foreach ([5, 4, 3, 2, 1] as $stars) {
            $out[$stars] = (int) ($counts[$stars] ?? 0);
        }

        return $out;
    }

    /** @return array{0: ?string, 1: int} */
    private static function measure(int $productId): array
    {
        $row = ProductReview::query()->published()
            ->where('store_product_id', $productId)
            ->toBase()
            ->selectRaw('count(*) as n, avg(rating) as a')
            ->first();

        $count = (int) ($row->n ?? 0);

        // One decimal, the column's own precision; null rather than 0.0 when
        // nothing has been said, because "rated 0" is a claim and "not rated"
        // is the truth — the rule every dashboard figure here follows.
        $average = $count > 0 ? number_format(round((float) $row->a, 1), 1, '.', '') : null;

        return [$average, $count];
    }

    /**
     * The `{average, count}` a resource publishes, or null with no reviews.
     *
     * @return array{average: float, count: int}|null
     */
    public static function publicShape(StoreProduct $product): ?array
    {
        $count = (int) ($product->rating_count ?? 0);

        if ($count === 0 || $product->rating_average === null) {
            return null;
        }

        return ['average' => (float) $product->rating_average, 'count' => $count];
    }
}
