<?php

namespace App\Support\WordPress\Steps;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Support\Store\SpecIndex;
use App\Support\Store\StockLedger;
use App\Support\Store\Tags;
use App\Support\WordPress\AcfValues;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use App\Support\WordPress\Prices;
use App\Support\WordPress\Seo;
use Illuminate\Support\Str;

/**
 * WooCommerce products, as the store's products.
 *
 * **What maps.** A simple product is physical; a virtual one is a service.
 * The price is WooCommerce's current `price` — which already applies a sale
 * running today — and the regular price becomes the struck-through
 * `compare_at_paise` only when it is genuinely higher (the storefront's own
 * rule). `manage_stock` is `track_stock`, `backorders` other than "no" is
 * `allow_oversell`, weight is converted to grams from the shop's unit, the
 * barcode (`global_unique_id`, WooCommerce 9.2+) is the GTIN, attributes that
 * are not variations become the spec sheet, the gallery comes into the media
 * library (twelve pictures at most, the console's limit), the first
 * category (or Yoast's primary one) is the product's category and the first
 * brand its brand. Opening stock is a ledger movement, as a console-created
 * product's is.
 *
 * **Variable products** become a product with variations: each variation's
 * attributes are its options, its price its own, and its id kept on a second
 * run so orders already pointing at it stay pointed. A variation defined by
 * "any value of Colour" cannot be enumerated and is skipped by name.
 *
 * **What does not map, and is skipped by name**: grouped and external
 * products, subscriptions, bundles and composites (the brief rules out
 * subscriptions, and the others have no shape here), and downloadable
 * products — the store's digital products are activation codes, not files
 * to download.
 */
class ProductsStep extends Step
{
    private const UNSUPPORTED_TYPES = [
        'grouped' => 'A grouped product; the store has no product made of other products.',
        'external' => 'An external (affiliate) product; the store only sells what it ships.',
        'subscription' => 'A subscription; the store does not sell subscriptions.',
        'variable-subscription' => 'A subscription; the store does not sell subscriptions.',
        'bundle' => 'A bundle; the store has no product made of other products.',
        'composite' => 'A composite product; the store has no product made of other products.',
        'booking' => 'A booking; the store does not take bookings.',
    ];

    public function key(): string
    {
        return 'products';
    }

    public function label(): string
    {
        return 'Products';
    }

    public function section(): string
    {
        return 'catalogue';
    }

    public function mapType(): ?string
    {
        return 'product';
    }

    public function applies(Context $ctx): bool
    {
        return parent::applies($ctx) && ! $this->foreignCurrency($ctx);
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $name = self::raw($record['name'] ?? '') ?: '(unnamed #'.($record['id'] ?? '?').')';
        $type = (string) ($record['type'] ?? 'simple');

        if (isset(self::UNSUPPORTED_TYPES[$type])) {
            return Outcome::skip($name, self::UNSUPPORTED_TYPES[$type]);
        }

        if (! in_array($type, ['simple', 'variable'], true)) {
            return Outcome::skip($name, "A \"{$type}\" product, which a plugin added and the store has no shape for.");
        }

        if (! empty($record['downloadable'])) {
            return Outcome::skip($name, 'Downloadable: the store delivers activation codes, not files.');
        }

        if (($record['status'] ?? '') === 'trash') {
            return Outcome::skip($name, 'In the bin on the old site.');
        }

        $variations = $type === 'variable' ? $this->variations($ctx, $record) : ['rows' => [], 'skipped' => []];

        if ($type === 'variable' && $variations['rows'] === []) {
            return Outcome::skip($name, 'A variable product with no option that can be brought across.');
        }

        $price = $type === 'variable'
            ? min(array_column($variations['rows'], 'price_paise'))
            : Prices::paise($ctx, ($record['price'] ?? '') ?: ($record['regular_price'] ?? ''));

        if ($price === null) {
            return Outcome::skip($name, 'Its price could not be read ("'.Str::limit((string) ($record['price'] ?? ''), 20).'").');
        }

        $existing = $ctx->map->model('product', $record['id'], StoreProduct::class);
        $outcome = Outcome::upsert($existing !== null, $name, [
            'existing' => $existing?->id,
            'price' => $price,
            'variations' => $variations['rows'],
        ]);

        foreach ($variations['skipped'] as $reason) {
            $outcome->warn($reason);
        }

        if ($existing === null) {
            $outcome->data['slug'] = $this->freeSlug(self::slug($record['slug'] ?? null, $name));

            if ($outcome->data['slug'] !== self::slug($record['slug'] ?? null, $name)) {
                $outcome->warn('Its address was already used here, so it was given the next free one.');
            }
        }

        if (count((array) ($record['categories'] ?? [])) > 1) {
            $outcome->warn('Was in more than one category; a product here has one.');
        }

        // Shop tags (0.141.0) come across; only a name a tag cannot be
        // (over 32 characters, no letter or number) or a thirteenth is named.
        $tagNames = $this->tagNames($record);

        if (count($tagNames) > count(array_slice(Tags::clean($tagNames), 0, Tags::MAX_PER_PRODUCT))) {
            $outcome->warn('Had tags the store could not keep (longer than '.Tags::NAME_MAX.' characters, or more than '.Tags::MAX_PER_PRODUCT.').');
        }

        if (count((array) ($record['images'] ?? [])) > 12) {
            $outcome->warn('Had more than twelve pictures; the first twelve are kept.');
        }

        if (! empty($record['date_on_sale_to'])) {
            $outcome->warn('Had a sale with an end date; here the sale price stays until it is changed.');
        }

        if (in_array($record['status'] ?? '', ['private', 'pending'], true) || ($record['catalog_visibility'] ?? 'visible') === 'hidden') {
            $outcome->warn('Was hidden or private; imported as a draft.');
        }

        if (($record['manage_stock'] ?? false) === false && ($record['stock_status'] ?? 'instock') === 'outofstock') {
            $outcome->warn('Was marked out of stock without a count; imported tracked at nought.');
        }

        if ($ctx->import->wants('custom')) {
            AcfValues::plan($ctx, 'store_product', $record, $outcome);
        }

        return $outcome;
    }

    public function media(Context $ctx, array $record): array
    {
        $sources = array_slice(array_values(array_filter(array_map(
            fn ($image) => is_array($image) ? ($image['src'] ?? null) : null,
            (array) ($record['images'] ?? []),
        ))), 0, 12);

        foreach ($this->variations($ctx, $record)['rows'] as $row) {
            if ($row['image'] !== null) {
                $sources[] = $row['image'];
            }
        }

        $sources = array_merge($sources, self::bodyUploads($ctx, (string) ($record['description'] ?? '')));

        return array_merge($sources, AcfValues::media($ctx, 'store_product', $record));
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $label = $outcome->label;
        $product = $outcome->data['existing'] ? StoreProduct::query()->find($outcome->data['existing']) : null;
        $stockBefore = $product === null ? 0 : (int) $product->stock;
        $variationsBefore = $product?->variations()->pluck('stock', 'id')->all() ?? [];

        $trackStock = (bool) ($record['manage_stock'] ?? false)
            || ($record['stock_status'] ?? 'instock') === 'outofstock'
            || collect($outcome->data['variations'])->contains('tracked', true);

        $images = [];
        foreach (array_slice((array) ($record['images'] ?? []), 0, 12) as $image) {
            if (is_array($image) && ($path = $ctx->media($image['src'] ?? null, $label)) !== null) {
                $images[] = $path;
            }
        }

        $regular = Prices::paise($ctx, $record['regular_price'] ?? '');
        $unit = (string) $ctx->wc('woocommerce_weight_unit', 'kg');

        $values = [
            'name' => Str::limit($label, 250, ''),
            'type' => ! empty($record['virtual']) ? ProductType::Service : ProductType::Physical,
            'sku' => Str::limit((string) ($record['sku'] ?? ''), 190, '') ?: null,
            'short_description' => self::text($record['short_description'] ?? '', 500) ?: null,
            'description' => self::body($ctx, (string) ($record['description'] ?? ''), $label),
            'images' => $images,
            'specifications' => $this->specifications($record),
            'price_paise' => $outcome->data['price'],
            'compare_at_paise' => $regular !== null && $regular > $outcome->data['price'] && ($record['type'] ?? '') !== 'variable' ? $regular : null,
            'track_stock' => $trackStock,
            'stock' => max(0, (int) ($record['stock_quantity'] ?? 0)),
            'allow_oversell' => ($record['backorders'] ?? 'no') !== 'no',
            'gtin' => $this->gtin($record),
            'weight_grams' => Prices::grams($record['weight'] ?? null, $unit),
            'status' => $this->status($record),
            'is_featured' => (bool) ($record['featured'] ?? false),
            'sort_order' => (int) ($record['menu_order'] ?? 0),
            'store_category_id' => $this->category($ctx, $record),
            'brand_id' => $this->brand($ctx, $record),
        ];

        if ($product === null) {
            $product = StoreProduct::query()->create($values + ['slug' => $outcome->data['slug']]);
        } else {
            $product->update($values);
        }

        $this->saveVariations($ctx, $product, $outcome->data['variations']);
        SpecIndex::queue((int) $product->id);

        Seo::save($product, $this->seo($record));

        if ($ctx->import->wants('custom')) {
            AcfValues::write($ctx, $product, 'store_product', $record);
        }

        $source = 'WordPress import #'.$ctx->import->id;
        $outcome->action === Outcome::CREATE
            ? StockLedger::adjusted($product, 0, [], true, $source)
            : StockLedger::adjusted($product, $stockBefore, $variationsBefore, false, $source);

        // The product's own tags, or the automatic rule for one that had none.
        $tagNames = $this->tagNames($record);
        $tagNames !== [] ? Tags::sync($product, $tagNames) : Tags::autoTag($product);

        $ctx->map->put('product', $record['id'], $product, $record['permalink'] ?? null);
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function saveVariations(Context $ctx, StoreProduct $product, array $rows): void
    {
        foreach ($rows as $i => $row) {
            $variation = $ctx->map->model('variation', $row['source_id'], StoreProductVariation::class);

            $values = [
                'name' => Str::limit($row['name'], 190, ''),
                'sku' => $row['sku'],
                'gtin' => $row['gtin'],
                'options' => $row['options'],
                'price_paise' => $row['price_paise'] === $product->price_paise ? null : $row['price_paise'],
                'stock' => $row['stock'],
                'allow_oversell' => $row['allow_oversell'],
                'weight_grams' => $row['weight_grams'],
                'image_path' => $row['image'] !== null ? $ctx->media($row['image'], $product->name) : null,
                'is_active' => $row['active'],
                'sort_order' => $i,
            ];

            if ($variation !== null && $variation->store_product_id === $product->id) {
                $variation->update($values);
            } else {
                $variation = $product->variations()->create($values);
            }

            $ctx->map->put('variation', $row['source_id'], $variation);
        }
    }

    /**
     * The variations that can be brought across, and why the others cannot.
     *
     * @param  array<string, mixed>  $record
     * @return array{rows: list<array<string, mixed>>, skipped: list<string>}
     */
    private function variations(Context $ctx, array $record): array
    {
        return $ctx->memo('variations:'.($record['id'] ?? ''), function () use ($ctx, $record) {
            $rows = [];
            $skipped = [];
            $unit = (string) $ctx->wc('woocommerce_weight_unit', 'kg');
            $parentStock = max(0, (int) ($record['stock_quantity'] ?? 0));

            foreach ($ctx->children('variations', $record['id'] ?? 0) as $variation) {
                $options = [];

                foreach ((array) ($variation['attributes'] ?? []) as $attribute) {
                    $option = trim((string) ($attribute['option'] ?? ''));

                    if ($option === '') {
                        $skipped[] = 'An option defined by "any '.($attribute['name'] ?? 'value').'" cannot be listed, so it is not kept.';

                        continue 2;
                    }

                    $options[(string) ($attribute['name'] ?? 'Option')] = $option;
                }

                $price = Prices::paise($ctx, ($variation['price'] ?? '') ?: ($variation['regular_price'] ?? ''));

                if ($price === null || $options === []) {
                    $skipped[] = 'An option with no price or no attributes is not kept.';

                    continue;
                }

                $managed = $variation['manage_stock'] ?? false;
                $tracked = $managed === true || $managed === 'parent' || ($variation['stock_status'] ?? 'instock') === 'outofstock';

                if ($managed === 'parent') {
                    $skipped[] = 'Its options shared one stock count; each option here keeps its own, set to the shared figure.';
                }

                $rows[] = [
                    'source_id' => (int) $variation['id'],
                    'name' => implode(' / ', $options),
                    'options' => $options,
                    'sku' => Str::limit((string) ($variation['sku'] ?? ''), 190, '') ?: null,
                    'gtin' => $this->gtin($variation),
                    'price_paise' => $price,
                    'stock' => $managed === 'parent' ? $parentStock : max(0, (int) ($variation['stock_quantity'] ?? 0)),
                    'tracked' => $tracked,
                    'allow_oversell' => ($variation['backorders'] ?? 'no') !== 'no',
                    'weight_grams' => Prices::grams($variation['weight'] ?? null, $unit),
                    'image' => is_array($variation['image'] ?? null) && ! empty($variation['image']['src']) ? (string) $variation['image']['src'] : null,
                    'active' => ($variation['status'] ?? 'publish') === 'publish',
                ];
            }

            return ['rows' => $rows, 'skipped' => array_values(array_unique($skipped))];
        });
    }

    /** @return array<string, string> attributes that are not variations, as the spec sheet */
    /**
     * A WooCommerce product's tag names (`tags: [{id, name, slug}]`), decoded —
     * WooCommerce sends `Wi-Fi &amp; PoE` for `Wi-Fi & PoE`.
     *
     * @return array<int, string>
     */
    private function tagNames(array $record): array
    {
        $names = [];

        foreach ((array) ($record['tags'] ?? []) as $tag) {
            $name = is_array($tag) ? ($tag['name'] ?? null) : null;

            if (is_string($name) && trim($name) !== '') {
                $names[] = html_entity_decode($name, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }

        return $names;
    }

    private function specifications(array $record): array
    {
        $specs = [];

        foreach ((array) ($record['attributes'] ?? []) as $attribute) {
            if (! is_array($attribute) || ! empty($attribute['variation']) || empty($attribute['visible'])) {
                continue;
            }

            $values = array_filter(array_map('strval', (array) ($attribute['options'] ?? [])));

            if ($values !== []) {
                $specs[Str::limit((string) ($attribute['name'] ?? 'Detail'), 80, '')] = Str::limit(implode(', ', $values), 250, '');
            }
        }

        return $specs;
    }

    private function status(array $record): PublishStatus
    {
        return ($record['status'] ?? '') === 'publish' && ($record['catalog_visibility'] ?? 'visible') !== 'hidden'
            ? PublishStatus::Published
            : PublishStatus::Draft;
    }

    private function category(Context $ctx, array $record): ?int
    {
        $primary = collect((array) ($record['meta_data'] ?? []))->firstWhere('key', '_yoast_wpseo_primary_product_cat')['value'] ?? null;
        $ids = array_column((array) ($record['categories'] ?? []), 'id');

        foreach (array_filter([$primary, ...$ids]) as $id) {
            if (($target = $ctx->map->targetId('product_cat', $id)) !== null) {
                return $target;
            }
        }

        return null;
    }

    private function brand(Context $ctx, array $record): ?int
    {
        foreach ((array) ($record['brands'] ?? []) as $brand) {
            if (is_array($brand) && ($target = $ctx->map->targetId('brand', $brand['id'] ?? 0)) !== null) {
                return $target;
            }
        }

        return null;
    }

    private function gtin(array $record): ?string
    {
        $meta = collect((array) ($record['meta_data'] ?? []));
        $candidate = (string) ($record['global_unique_id'] ?? $meta->firstWhere('key', '_gtin')['value'] ?? $meta->firstWhere('key', '_wpm_gtin_code')['value'] ?? '');
        $digits = preg_replace('/\D/', '', $candidate);

        return preg_match('/^\d{8}$|^\d{12,14}$/', (string) $digits) ? $digits : null;
    }

    /**
     * SEO out of WooCommerce's `meta_data`: the API has no `yoast_head_json`
     * for products, but it carries Yoast's stored description. A value still
     * holding Yoast's `%%variables%%` is a template, not a description, and
     * is left for the store to derive.
     *
     * @return array<string, string>
     */
    private function seo(array $record): array
    {
        $meta = collect((array) ($record['meta_data'] ?? []));
        $description = trim((string) ($meta->firstWhere('key', '_yoast_wpseo_metadesc')['value'] ?? $meta->firstWhere('key', 'rank_math_description')['value'] ?? ''));

        return $description !== '' && ! str_contains($description, '%%')
            ? ['description' => Str::limit($description, 320, '')]
            : [];
    }

    private function freeSlug(string $wanted): string
    {
        $slug = $wanted;
        $i = 2;

        while (StoreProduct::query()->where('slug', $slug)->exists()) {
            $slug = $wanted.'-'.$i++;
        }

        return $slug;
    }

    private function foreignCurrency(Context $ctx): bool
    {
        $currency = (string) $ctx->wc('woocommerce_currency', 'INR');

        return $currency !== '' && $currency !== 'INR';
    }
}
