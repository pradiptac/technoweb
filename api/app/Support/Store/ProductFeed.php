<?php

namespace App\Support\Store;

use App\Enums\ProductCondition;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Support\HtmlSanitiser;
use App\Support\Money;
use Illuminate\Support\Collection;

/**
 * The shop, as Google Merchant Center reads it.
 *
 * This builds the rows; `/store/feed.xml` on the frontend turns them into RSS.
 * The split is the escaping rule this codebase already keeps for JSON-LD — the
 * markup is assembled at the sink, where the escaper lives, so a product
 * legitimately named `A <> B` cannot close the document. What crosses the wire
 * is data.
 *
 * **One row per thing somebody can buy**, which is a variation where there are
 * any and the product where there are not. A feed listing "a switch" when the
 * shop only ever sells a 24-port and a 48-port gives Google one price for two
 * products, and whichever it picks is wrong on the page it links to.
 *
 * **Nothing here is invented**, the rule `StructuredData` states at length. A
 * product with no identifier says so rather than borrowing its SKU; a product
 * with no usable photograph is left out and named, rather than fed and silently
 * disapproved at the far end.
 */
class ProductFeed
{
    /**
     * Image formats Merchant Center accepts.
     *
     * **SVG is the one that matters here.** Google rejects it outright, and
     * this media library is largely SVG placeholder art — all 33 seeded images
     * are vector — so without this check the ordinary state of a fresh install
     * would be a feed full of items disapproved for a reason nothing on our
     * side explains. A rejected item is invisible: it is not an error anybody
     * sees until they open Merchant Center and read a diagnostics page.
     */
    private const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'webp'];

    /** Merchant Center takes one main image and up to ten more. */
    private const MAX_EXTRA_IMAGES = 10;

    /**
     * Option names Google has a real attribute for.
     *
     * Everything else travels as `product_detail`, which takes any name/value
     * pair. This catalogue's dimensions are "RAM" and "Storage", which map to
     * none of them — so most products will carry an `item_group_id` with no
     * variant attribute, which Google reports as a **warning** and still groups
     * correctly. Inventing a `size` of "16 GB / 1 TB" to silence it would be a
     * false attribute on every variant in the shop, which is the worse trade.
     *
     * @var array<string, string>
     */
    private const VARIANT_ATTRIBUTES = [
        'colour' => 'color',
        'color' => 'color',
        'size' => 'size',
        'material' => 'material',
        'pattern' => 'pattern',
    ];

    /**
     * @param  Collection<int, StoreProduct>  $products
     * @return array{items: array<int, array<string, mixed>>, problems: array<int, array<string, mixed>>, skipped: array<string, int>}
     */
    public static function build(Collection $products): array
    {
        $items = [];
        $problems = [];
        $skipped = [];

        foreach ($products as $product) {
            $reason = self::skipReason($product);

            if ($reason !== null) {
                $skipped[$reason] = ($skipped[$reason] ?? 0) + 1;

                /*
                 * Only a data problem is reported as one. A product somebody
                 * deliberately withheld, or a service — which Merchant Center
                 * does not take at all — is a decision, and a warning list that
                 * includes decisions is one people learn to scroll past.
                 */
                if (in_array($reason, ['no_image', 'unsupported_image_format'], true)) {
                    $problems[] = [
                        'id' => $product->id,
                        'name' => $product->name,
                        'reason' => $reason,
                    ];
                }

                continue;
            }

            $variations = $product->variations->where('is_active', true);

            if ($variations->isEmpty()) {
                $items[] = self::row($product);

                continue;
            }

            foreach ($variations as $variation) {
                $items[] = self::row($product, $variation);
            }
        }

        return ['items' => $items, 'problems' => $problems, 'skipped' => $skipped];
    }

    /**
     * Why this product is not in the feed, or null when it is.
     *
     * Ordered so the most deliberate answer wins: somebody who unticked a
     * product should be told that, not told its photograph is the wrong format.
     *
     * Public, because the admin resource asks it per row — the console shows
     * the answer on the product where somebody can act on it, which a count
     * on the feed endpoint cannot.
     */
    public static function skipReason(StoreProduct $product): ?string
    {
        if (! $product->feed_include) {
            return 'withheld';
        }

        // A service is not a product Merchant Center accepts. Digital goods are.
        if ($product->type?->value === 'service') {
            return 'service';
        }

        if (blank($product->images)) {
            return 'no_image';
        }

        return filled(self::images($product)) ? null : 'unsupported_image_format';
    }

    /**
     * The images Google will actually accept, in the editor's own order.
     *
     * @return array<int, string>
     */
    private static function images(StoreProduct $product): array
    {
        return collect($product->images ?? [])
            ->filter(fn ($path) => self::isSupportedImage((string) $path))
            ->map(fn ($path) => asset('storage/'.$path))
            ->values()
            ->all();
    }

    private static function isSupportedImage(string $path): bool
    {
        return in_array(
            strtolower(pathinfo($path, PATHINFO_EXTENSION)),
            self::IMAGE_FORMATS,
            true,
        );
    }

    /** @return array<string, mixed> */
    private static function row(StoreProduct $product, ?StoreProductVariation $variation = null): array
    {
        $images = self::images($product);

        /*
         * A variation's own picture leads where it has one — somebody looking
         * at a feed entry for the 48-port should see the 48-port — and the
         * product's gallery follows it as the additional images.
         */
        if ($variation?->image_path && self::isSupportedImage($variation->image_path)) {
            array_unshift($images, asset('storage/'.$variation->image_path));
        }

        $identifiers = $product->identifiers($variation);
        $price = $variation?->pricePaise() ?? $product->price_paise;

        /*
         * Google's two price fields are the other way round from ours.
         *
         * `price_paise` is what is charged and `compare_at_paise` is the
         * struck-through "was"; in a feed, **`price` is the regular price and
         * `sale_price` is the reduced one being charged today**. Emitting our
         * two straight through produced `price` and `sale_price` carrying the
         * identical figure, which is not a discount — it is a claim of a
         * discount with no reduction behind it, and Merchant Center treats a
         * misrepresented saving as a policy violation rather than a mistake.
         *
         * Only when it is genuinely higher, the rule the storefront resource
         * already applies to the struck-through price it renders.
         */
        $onSale = $product->compare_at_paise > $price;

        return array_filter([
            /*
             * Stable for the life of the item, which is why it is built from
             * the ids and never from the SKU: a SKU is nullable, editable, and
             * guaranteed unique by nothing. Changing an id in a feed is
             * deleting one item and creating another, which throws away its
             * whole performance history.
             */
            'id' => self::itemId($product, $variation),
            'item_group_id' => $variation ? self::itemId($product) : null,

            'title' => $variation ? $product->name.' — '.$variation->name : $product->name,
            'description' => self::description($product),
            'link' => rtrim((string) config('app.frontend_url'), '/').'/store/products/'.$product->slug,
            'image_link' => $images[0] ?? null,
            'additional_image_link' => array_slice($images, 1, self::MAX_EXTRA_IMAGES),

            // GST-inclusive already — `Money` extracts the tax rather than
            // adding it — which is exactly what Google requires for India.
            'price' => Money::toRupeeString($onSale ? $product->compare_at_paise : $price).' INR',
            'sale_price' => $onSale ? Money::toRupeeString($price).' INR' : null,

            'availability' => $product->availability($variation),
            'condition' => ($product->condition ?? ProductCondition::New)->value,
            'brand' => $product->brand?->name,
            'gtin' => $identifiers['gtin'],
            'mpn' => $identifiers['mpn'],

            /*
             * Derived, never stored. It is "no" exactly when both identifiers
             * are blank, so a column for it would be a second answer free to
             * contradict the two that already settle it — and Google reads the
             * string "no" here rather than a boolean.
             */
            'identifier_exists' => ($identifiers['gtin'] || $identifiers['mpn']) ? null : 'no',

            'google_product_category' => $product->googleCategory(),
            'product_type' => $product->category?->name,

            'shipping_price' => Money::toRupeeString(Fulfilment::shippingPaise()).' INR',
            'shipping_country' => Fulfilment::COUNTRY,
            'shipping_weight' => self::weight($product, $variation),
            'min_handling_time' => 0,
            'max_handling_time' => Fulfilment::handlingDays(),

            'product_detail' => self::details($variation),
            ...self::variantAttributes($variation),
        ], fn ($value) => $value !== null && $value !== [] && $value !== '');
    }

    private static function itemId(StoreProduct $product, ?StoreProductVariation $variation = null): string
    {
        return 'sp-'.$product->id.($variation ? '-'.$variation->id : '');
    }

    /**
     * Google wants a description and this catalogue does not always have a
     * short one, so the body stands in — through `toText`, never `strip_tags`,
     * or the end of one paragraph runs into the start of the next.
     */
    private static function description(StoreProduct $product): string
    {
        $text = $product->short_description
            ?: HtmlSanitiser::toText($product->description ?? '');

        return mb_substr(trim($text) ?: $product->name, 0, 5000);
    }

    private static function weight(StoreProduct $product, ?StoreProductVariation $variation): ?string
    {
        $grams = $variation?->weight_grams ?? $product->weight_grams;

        return $grams ? $grams.' g' : null;
    }

    /**
     * Every option as a name/value pair, whatever it is called.
     *
     * @return array<int, array{section: string, name: string, value: string}>
     */
    private static function details(?StoreProductVariation $variation): array
    {
        $out = [];

        foreach (($variation?->options ?? []) as $name => $value) {
            $out[] = ['section' => 'Specification', 'name' => (string) $name, 'value' => (string) $value];
        }

        return $out;
    }

    /**
     * The subset of those options Google has a first-class attribute for.
     *
     * @return array<string, string>
     */
    private static function variantAttributes(?StoreProductVariation $variation): array
    {
        $out = [];

        foreach (($variation?->options ?? []) as $name => $value) {
            $key = self::VARIANT_ATTRIBUTES[strtolower(trim((string) $name))] ?? null;

            if ($key !== null) {
                $out[$key] = (string) $value;
            }
        }

        return $out;
    }
}
