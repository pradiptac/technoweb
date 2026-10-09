<?php

namespace App\Support\Store;

use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Support\Money;

/**
 * The shop's catalogue as a spreadsheet: one row per product and one per
 * variation, in the columns `CatalogueImport` reads back.
 *
 * The two share `CatalogueImport::FIELDS` so that a file exported here,
 * edited in Excel and uploaded again maps itself — which is the ordinary
 * use: "change forty prices" is a spreadsheet job, not forty edit forms.
 *
 * **A variation row carries its product's SKU in `parent_sku`** and its own
 * in `sku`; a product row leaves `parent_sku` blank. That is the whole of
 * how the importer tells the two apart, and it is why a product without a
 * SKU exports with an empty cell rather than an invented one — a SKU is the
 * shop's filing code, and inventing one here would be writing data the
 * console never showed anybody.
 *
 * Money is `Money::toRupeeString()`, a plain decimal, for the reason
 * `docs/store.md` gives: a formatted amount is text to Excel and cannot be
 * summed. Every cell goes through `Csv::escape` on the way out.
 */
class CatalogueExport
{
    /**
     * The rows, one at a time, products in catalogue order and each
     * product's variations directly under it.
     *
     * @return \Generator<int, array<int, string>>
     */
    public static function rows(): \Generator
    {
        $products = StoreProduct::query()
            ->with(['category:id,slug', 'brand:id,slug', 'variations', 'tags'])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->orderBy('id')
            ->lazyById(200);

        foreach ($products as $product) {
            yield self::productRow($product);

            foreach ($product->variations as $variation) {
                yield self::variationRow($product, $variation);
            }
        }
    }

    /** @return array<int, string> */
    private static function productRow(StoreProduct $product): array
    {
        return [
            (string) ($product->sku ?? ''),
            '',
            $product->name,
            $product->slug,
            $product->type->value,
            $product->category->slug ?? '',
            $product->brand->slug ?? '',
            Money::toRupeeString((int) $product->price_paise),
            $product->compare_at_paise === null ? '' : Money::toRupeeString((int) $product->compare_at_paise),
            (string) (int) $product->stock,
            $product->track_stock ? '1' : '0',
            $product->allow_oversell ? '1' : '0',
            (string) ($product->gtin ?? ''),
            (string) ($product->mpn ?? ''),
            $product->condition->value,
            $product->weight_grams === null ? '' : (string) $product->weight_grams,
            $product->status->value,
            $product->feed_include ? '1' : '0',
            (string) ($product->short_description ?? ''),
            // Shop tags, `;` between them (a comma is common inside a name).
            $product->tags->pluck('name')->implode('; '),
        ];
    }

    /**
     * A variation's row. The columns it has no say in — slug, type, category,
     * brand, status, feed, the blurb — are left blank rather than copied from
     * the product: a filled cell on an import means "set this", and a
     * variation cannot be given a slug.
     *
     * @return array<int, string>
     */
    private static function variationRow(StoreProduct $product, StoreProductVariation $variation): array
    {
        return [
            (string) ($variation->sku ?? ''),
            (string) ($product->sku ?? ''),
            $variation->name,
            '',
            '',
            '',
            '',
            Money::toRupeeString((int) ($variation->price_paise ?? $product->price_paise)),
            '',
            (string) (int) $variation->stock,
            '',
            $variation->allow_oversell ? '1' : '0',
            (string) ($variation->gtin ?? ''),
            (string) ($variation->mpn ?? ''),
            '',
            $variation->weight_grams === null ? '' : (string) $variation->weight_grams,
            '',
            '',
            '',
            '',
        ];
    }
}
