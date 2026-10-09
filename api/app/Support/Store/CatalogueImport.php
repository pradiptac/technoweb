<?php

namespace App\Support\Store;

use App\Enums\ProductCondition;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Brand;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\StoreProductImport;
use App\Models\StoreProductVariation;
use App\Support\Money;
use App\Support\Newsletter\Csv;
use App\Support\Newsletter\Spreadsheet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A spreadsheet of prices and stock, applied to the shop's catalogue.
 *
 * Two passes over one file, the newsletter importer's shape and for the same
 * reason: a **dry run** that writes nothing and says what each line would do,
 * then a **commit** of the same file and the same mapping. Reporting
 * afterwards means the moment somebody notices they mapped the cost column
 * onto the price is the moment after two hundred prices went live.
 *
 * ## Matching is by SKU
 *
 * A line whose SKU is a variation's updates that variation; one whose SKU is
 * a product's updates that product; one matching nothing **creates a
 * product**, which needs a name and a price and nothing else. A line that
 * names a `parent_sku` is a variation's line and can only ever update: the
 * import never creates a variation, because a variation is a set of options
 * a buyer picks from and a spreadsheet cell cannot say what those are — the
 * product form can. A SKU that matches more than one row is refused rather
 * than guessed at.
 *
 * ## A blank cell leaves the field alone
 *
 * A file exported to change forty prices carries every other column too, and
 * a blank in one of them means "I did not fill this in", never "clear it".
 * So only a mapped, non-blank cell writes, and clearing a value stays a job
 * for the edit form — an importer that could blank a hundred descriptions
 * because a column was empty would do it on the first file anybody tried.
 *
 * ## Money and enums are refused, never coerced
 *
 * A price is parsed from the text through `Money::fromRupeeString()` and a
 * cell it cannot read makes the line `invalid` — "call for price" must not
 * become ₹0. A status or a condition outside its enum is refused the same
 * way; a category or brand slug nobody has is refused rather than created,
 * because a typo in a spreadsheet would otherwise mint a category.
 */
class CatalogueImport
{
    /** The columns, in the order the export writes them. */
    public const FIELDS = [
        'sku', 'parent_sku', 'name', 'slug', 'type', 'category', 'brand',
        'price', 'compare_at', 'stock', 'track_stock', 'allow_oversell',
        'gtin', 'mpn', 'condition', 'weight_grams', 'status', 'feed_include',
        'short_description', 'tags',
    ];

    /** Refused lines reported per file. The fifty-first says nothing the first fifty did not. */
    public const MAX_PROBLEMS = 50;

    public const CREATE = 'create';

    public const UPDATE_PRODUCT = 'update_product';

    public const UPDATE_VARIATION = 'update_variation';

    public const INVALID = 'invalid';

    /**
     * Guess which column is which from the headings.
     *
     * Its own guesser rather than a branch in `Csv::guessMapping()`: that one
     * reads "name" as a first name and "address" as an email, which is right
     * for a list of people and wrong for a list of products. The two share
     * nothing but the idea, and a shared table would need every entry to say
     * which importer it was for.
     *
     * @param  array<int, string>  $headers
     * @return array<string, int|null>
     */
    public static function guessMapping(array $headers): array
    {
        $normalised = array_map(
            fn ($h) => Str::of($h)->lower()->replaceMatches('/[^a-z0-9]/', '')->value(),
            $headers,
        );

        $candidates = [
            'sku' => ['sku', 'code', 'productcode', 'itemcode', 'partnumber', 'partno'],
            'parent_sku' => ['parentsku', 'parent', 'productsku', 'parentcode'],
            'name' => ['name', 'productname', 'title', 'product', 'item', 'description'],
            'slug' => ['slug', 'url', 'handle'],
            'type' => ['type', 'producttype', 'kind'],
            'category' => ['category', 'categoryslug', 'storecategory', 'collection'],
            'brand' => ['brand', 'brandslug', 'manufacturer', 'make', 'vendor'],
            'price' => ['price', 'sellingprice', 'saleprice', 'rate', 'mrp', 'priceinr', 'pricerupees'],
            'compare_at' => ['compareat', 'compareatprice', 'wasprice', 'listprice', 'rrp', 'strikeprice'],
            'stock' => ['stock', 'quantity', 'qty', 'onhand', 'inventory', 'available'],
            'track_stock' => ['trackstock', 'tracked', 'trackinventory'],
            'allow_oversell' => ['allowoversell', 'oversell', 'backorder', 'allowbackorder'],
            'gtin' => ['gtin', 'ean', 'upc', 'barcode', 'isbn'],
            'mpn' => ['mpn', 'manufacturerpartnumber', 'mfrpart', 'mfgpart'],
            'condition' => ['condition'],
            'weight_grams' => ['weightgrams', 'weight', 'weightg', 'grams'],
            'status' => ['status', 'published', 'visibility'],
            'feed_include' => ['feedinclude', 'infeed', 'googlefeed', 'feed'],
            'short_description' => ['shortdescription', 'summary', 'blurb', 'tagline', 'excerpt'],
            'tags' => ['tags', 'tag', 'producttags', 'labels'],
        ];

        $mapping = [];
        /** @var array<int, true> columns already claimed by an earlier field */
        $taken = [];

        foreach ($candidates as $field => $names) {
            $mapping[$field] = null;

            foreach ($names as $name) {
                $index = array_search($name, $normalised, true);

                if ($index !== false && ! isset($taken[$index])) {
                    $mapping[$field] = $index;
                    $taken[$index] = true;
                    break;
                }
            }
        }

        return $mapping;
    }

    /**
     * Read the file and say what would happen. Writes nothing.
     *
     * @param  array<string, int|null>  $mapping
     * @return array<string, mixed>
     */
    public static function dryRun(string $path, array $mapping): array
    {
        $parsed = Spreadsheet::read($path);
        $counts = self::emptyCounts(count($parsed['rows']));
        $problems = [];
        $preview = [];

        foreach (self::plan($parsed['rows'], $mapping) as $line) {
            $counts[$line['outcome']]++;

            if ($line['outcome'] === self::INVALID && count($problems) < self::MAX_PROBLEMS) {
                $problems[] = self::problem($line);
            }

            if (count($preview) < 5) {
                $preview[] = ['line' => $line['line'], 'outcome' => $line['outcome']] + $line['cells'];
            }
        }

        return [
            'headers' => $parsed['headers'],
            'format' => $parsed['format'],
            'counts' => $counts,
            'problems' => $problems,
            'preview' => $preview,
        ];
    }

    /**
     * Commit the file, one line at a time.
     *
     * A line's write is its own transaction, so a refused line — an unknown
     * category, a database refusal — costs that line and nothing else; the
     * rest of the file goes through and the line is named in `problems`.
     *
     * @param  array<string, int|null>  $mapping
     */
    public static function run(StoreProductImport $import, string $path, array $mapping): StoreProductImport
    {
        $parsed = Spreadsheet::read($path);
        $counts = self::emptyCounts(count($parsed['rows']));
        $problems = [];
        $source = "Import #{$import->id}";

        foreach (self::plan($parsed['rows'], $mapping) as $line) {
            if ($line['outcome'] !== self::INVALID) {
                try {
                    DB::transaction(fn () => self::apply($line, $source));
                } catch (\Throwable $e) {
                    report($e);
                    $line['outcome'] = self::INVALID;
                    $line['reason'] = 'Could not be saved: '.mb_substr($e->getMessage(), 0, 160);
                }
            }

            $counts[$line['outcome']]++;

            if ($line['outcome'] === self::INVALID && count($problems) < self::MAX_PROBLEMS) {
                $problems[] = self::problem($line);
            }
        }

        $import->update([
            'status' => 'completed',
            'mapping' => $mapping,
            'counts' => $counts,
            'problems' => $problems,
        ]);

        return $import->fresh();
    }

    /**
     * Decide what every line would do, without doing it.
     *
     * Shared by the dry run and the commit, so the counts somebody approved
     * are the counts the commit produces — two walks over the file with two
     * sets of rules is how a preview says "40 updated" and a commit does 38.
     *
     * @param  array<int, array<int, string>>  $rows
     * @param  array<string, int|null>  $mapping
     * @return \Generator<int, array<string, mixed>>
     */
    private static function plan(array $rows, array $mapping): \Generator
    {
        $categories = StoreCategory::query()->pluck('id', 'slug')->all();
        $brands = Brand::query()->pluck('id', 'slug')->all();

        $cells = array_map(fn (array $row) => self::cells($row, $mapping), $rows);

        /*
         * Every SKU the file names, asked about in batches rather than a
         * query per line — a catalogue export of a thousand rows would
         * otherwise be two thousand round trips inside one request.
         */
        $skus = array_values(array_unique(array_filter(array_merge(
            array_column($cells, 'sku'),
            array_column($cells, 'parent_sku'),
        ))));

        $lookup = ['products' => [], 'variations' => []];

        foreach (array_chunk($skus, 500) as $chunk) {
            foreach (StoreProduct::query()->whereIn('sku', $chunk)->get() as $product) {
                $lookup['products'][$product->sku][] = $product;
            }

            foreach (StoreProductVariation::query()->whereIn('sku', $chunk)->get() as $variation) {
                $lookup['variations'][$variation->sku][] = $variation;
            }
        }

        /** @var array<string, int> SKU => the line that first carried it */
        $seen = [];

        foreach ($cells as $i => $row) {
            $line = $i + 2; // +1 for the header, +1 because people count from 1

            /*
             * A SKU twice in one file is two instructions for one shelf, and
             * the second would silently win. Refused, naming the first line —
             * a spreadsheet joined from two sources routinely repeats.
             */
            if ($row['sku'] !== null && isset($seen[$row['sku']])) {
                yield [
                    'line' => $line, 'sku' => $row['sku'], 'cells' => $row, 'outcome' => self::INVALID,
                    'reason' => "The SKU {$row['sku']} is repeated in this file (first on line {$seen[$row['sku']]}).",
                ];

                continue;
            }

            if ($row['sku'] !== null) {
                $seen[$row['sku']] = $line;
            }

            yield self::decide($line, $row, $categories, $brands, $lookup);
        }
    }

    /**
     * @param  array<string, string|null>  $cells
     * @param  array<string, int>  $categories
     * @param  array<string, int>  $brands
     * @param  array{products: array<string, list<StoreProduct>>, variations: array<string, list<StoreProductVariation>>}  $lookup
     * @return array<string, mixed>
     */
    private static function decide(int $line, array $cells, array $categories, array $brands, array $lookup): array
    {
        $sku = $cells['sku'];
        $parentSku = $cells['parent_sku'];
        $base = ['line' => $line, 'sku' => $sku, 'cells' => $cells, 'reason' => null];

        $invalid = fn (string $reason) => ['outcome' => self::INVALID, 'reason' => $reason] + $base;

        /*
         * Which row this line is about. A SKU matching both a product and a
         * variation, or two of either, is bad data the shop should hear about
         * rather than have guessed at.
         */
        $variations = $sku === null ? [] : ($lookup['variations'][$sku] ?? []);
        $products = $sku === null ? [] : ($lookup['products'][$sku] ?? []);

        if (count($variations) + count($products) > 1) {
            return $invalid("The SKU {$sku} matches more than one row in the catalogue, so this line cannot be applied.");
        }

        if ($parentSku !== null) {
            $parent = $lookup['products'][$parentSku] ?? [];

            if (count($parent) !== 1) {
                return $invalid($parent === []
                    ? "No product has the SKU {$parentSku}, so this variation line has nothing to belong to."
                    : "The parent SKU {$parentSku} matches more than one product.");
            }

            if ($variations === []) {
                return $invalid($sku === null
                    ? 'A variation line needs a SKU. The import never creates a variation — add it on the product form first.'
                    : "No variation has the SKU {$sku}. The import never creates a variation — add it on the product form first.");
            }

            if ((int) $variations[0]->store_product_id !== (int) $parent[0]->id) {
                return $invalid("The variation {$sku} does not belong to the product {$parentSku}.");
            }
        }

        // The values every outcome shares, parsed once and refused once.
        $parsed = self::parse($cells, $categories, $brands);

        if ($parsed['error'] !== null) {
            return $invalid($parsed['error']);
        }

        if ($variations !== []) {
            return $base + ['outcome' => self::UPDATE_VARIATION, 'variation' => $variations[0], 'values' => $parsed['values']];
        }

        if ($products !== []) {
            return $base + ['outcome' => self::UPDATE_PRODUCT, 'product' => $products[0], 'values' => $parsed['values']];
        }

        if ($cells['name'] === null) {
            return $invalid($sku === null
                ? 'Nothing matches and there is no name, so there is nothing to create.'
                : "Nothing has the SKU {$sku}, and a new product needs a name.");
        }

        if (! array_key_exists('price_paise', $parsed['values'])) {
            return $invalid('Nothing has the SKU '.($sku ?? '(blank)').', and a new product needs a price.');
        }

        return $base + ['outcome' => self::CREATE, 'values' => $parsed['values']];
    }

    /**
     * The mapped cells, trimmed, with a blank as `null`.
     *
     * @param  array<int, string>  $row
     * @param  array<string, int|null>  $mapping
     * @return array<string, string|null>
     */
    private static function cells(array $row, array $mapping): array
    {
        $cells = [];

        foreach (self::FIELDS as $field) {
            $index = $mapping[$field] ?? null;
            $value = $index === null ? '' : trim((string) ($row[$index] ?? ''));
            $cells[$field] = $value === '' ? null : $value;
        }

        return $cells;
    }

    /**
     * Every filled cell as the column value it becomes, or the first reason
     * one of them cannot be.
     *
     * @param  array<string, string|null>  $cells
     * @param  array<string, int>  $categories
     * @param  array<string, int>  $brands
     * @return array{values: array<string, mixed>, error: ?string}
     */
    private static function parse(array $cells, array $categories, array $brands): array
    {
        $values = [];

        foreach (['price' => 'price_paise', 'compare_at' => 'compare_at_paise'] as $cell => $column) {
            if ($cells[$cell] === null) {
                continue;
            }

            $paise = Money::fromRupeeString($cells[$cell]);

            if ($paise === null || $paise < 0) {
                return ['values' => [], 'error' => "\"{$cells[$cell]}\" is not a price. Write rupees as a plain number, like 1179.00."];
            }

            $values[$column] = $paise;
        }

        foreach (['stock', 'weight_grams'] as $cell) {
            if ($cells[$cell] === null) {
                continue;
            }

            if (preg_match('/^\d+$/', $cells[$cell]) !== 1) {
                return ['values' => [], 'error' => "\"{$cells[$cell]}\" is not a whole number for {$cell}."];
            }

            $values[$cell] = (int) $cells[$cell];
        }

        foreach (['track_stock', 'allow_oversell', 'feed_include'] as $cell) {
            if ($cells[$cell] === null) {
                continue;
            }

            $flag = self::flag($cells[$cell]);

            if ($flag === null) {
                return ['values' => [], 'error' => "\"{$cells[$cell]}\" is not a yes or a no for {$cell}. Use 1 or 0."];
            }

            $values[$cell] = $flag;
        }

        if ($cells['status'] !== null) {
            $status = PublishStatus::tryFrom(strtolower($cells['status']));

            if ($status === null) {
                return ['values' => [], 'error' => "\"{$cells['status']}\" is not a status. Use draft, published or archived."];
            }

            $values['status'] = $status;
        }

        if ($cells['condition'] !== null) {
            $condition = ProductCondition::tryFrom(strtolower($cells['condition']));

            if ($condition === null) {
                return ['values' => [], 'error' => "\"{$cells['condition']}\" is not a condition. Use new, refurbished or used."];
            }

            $values['condition'] = $condition;
        }

        if ($cells['type'] !== null) {
            $type = ProductType::tryFrom(strtolower($cells['type']));

            if ($type === null) {
                return ['values' => [], 'error' => "\"{$cells['type']}\" is not a product type. Use physical, digital or service."];
            }

            $values['type'] = $type;
        }

        if ($cells['category'] !== null) {
            $slug = Str::lower($cells['category']);

            if (! isset($categories[$slug])) {
                return ['values' => [], 'error' => "No store category has the slug \"{$cells['category']}\"."];
            }

            $values['store_category_id'] = $categories[$slug];
        }

        if ($cells['brand'] !== null) {
            $slug = Str::lower($cells['brand']);

            if (! isset($brands[$slug])) {
                return ['values' => [], 'error' => "No brand has the slug \"{$cells['brand']}\"."];
            }

            $values['brand_id'] = $brands[$slug];
        }

        if ($cells['gtin'] !== null && preg_match('/^\d{8}$|^\d{12,14}$/', $cells['gtin']) !== 1) {
            return ['values' => [], 'error' => "\"{$cells['gtin']}\" is not a GTIN — the barcode number, 8, 12, 13 or 14 digits."];
        }

        foreach (['name', 'slug', 'gtin', 'mpn', 'short_description'] as $cell) {
            if ($cells[$cell] !== null) {
                $values[$cell] = $cells[$cell];
            }
        }

        /*
         * Shop tags, separated by `;` (a comma is common inside a name). A
         * blank cell leaves a product's tags alone like every other column;
         * a filled one replaces them. A name the tags cannot hold is
         * refused, not trimmed: "Wi-Fi 6E Access Points And Controllers For
         * Large Estates" cut to 32 characters is a different tag.
         */
        if ($cells['tags'] !== null) {
            $names = array_values(array_filter(array_map('trim', explode(';', $cells['tags'])), fn ($n) => $n !== ''));

            foreach ($names as $name) {
                if (mb_strlen($name) > Tags::NAME_MAX || Str::slug($name) === '') {
                    return ['values' => [], 'error' => "\"{$name}\" cannot be a tag — a tag is 1 to ".Tags::NAME_MAX.' characters with at least one letter or number.'];
                }
            }

            if (count(Tags::clean($names)) > Tags::MAX_PER_PRODUCT) {
                return ['values' => [], 'error' => 'A product can carry up to '.Tags::MAX_PER_PRODUCT.' tags.'];
            }

            $values['tags'] = $names;
        }

        return ['values' => $values, 'error' => null];
    }

    /** "1", "yes", "true", "y" and their opposites; anything else is null. */
    private static function flag(string $value): ?bool
    {
        return match (strtolower($value)) {
            '1', 'yes', 'y', 'true' => true,
            '0', 'no', 'n', 'false' => false,
            default => null,
        };
    }

    /**
     * Write one decided line. Stock changes go through the ledger, so a
     * spreadsheet that puts forty on a shelf is a movement somebody can read.
     *
     * @param  array<string, mixed>  $line
     */
    private static function apply(array $line, string $source): void
    {
        /** @var array<string, mixed> $values */
        $values = $line['values'];

        if ($line['outcome'] === self::UPDATE_VARIATION) {
            /** @var StoreProductVariation $variation */
            $variation = $line['variation'];
            $product = $variation->product()->firstOrFail();
            $before = $product->variations()->pluck('stock', 'id')->all();

            $variation->update(array_intersect_key($values, array_flip([
                'price_paise', 'stock', 'gtin', 'mpn', 'weight_grams', 'allow_oversell',
            ])));

            StockLedger::adjusted($product, (int) $product->stock, $before, false, $source);

            return;
        }

        if ($line['outcome'] === self::UPDATE_PRODUCT) {
            /** @var StoreProduct $product */
            $product = $line['product'];
            $stockBefore = (int) $product->stock;
            $variationsBefore = $product->variations()->pluck('stock', 'id')->all();

            // Everything a product line may set except the two the import
            // uses to find it: a SKU is the key here, and a slug changed by a
            // spreadsheet cell would move a live URL without anybody meaning to.
            $product->update(array_diff_key($values, array_flip(['sku', 'slug', 'tags'])));

            StockLedger::adjusted($product, $stockBefore, $variationsBefore, false, $source);
            self::tag($product, $values['tags'] ?? null);

            return;
        }

        $product = StoreProduct::create([
            'type' => ProductType::Physical,
            'status' => PublishStatus::Draft,
            'sku' => $line['sku'],
            ...array_diff_key($values, ['tags' => true]),
        ]);

        StockLedger::adjusted($product, 0, [], true, $source);
        self::tag($product, $values['tags'] ?? null);
    }

    /**
     * Tags for a line: the cell's, when it had one; otherwise the automatic
     * rule, which is a no-op for a product that has tags or was decided.
     *
     * @param  array<int, string>|null  $names
     */
    private static function tag(StoreProduct $product, ?array $names): void
    {
        if ($names !== null) {
            Tags::sync($product, $names);
        } else {
            Tags::autoTag($product);
        }
    }

    /** @return array<string, int> */
    private static function emptyCounts(int $total): array
    {
        return [
            'total' => $total,
            self::CREATE => 0,
            self::UPDATE_PRODUCT => 0,
            self::UPDATE_VARIATION => 0,
            self::INVALID => 0,
        ];
    }

    /**
     * @param  array<string, mixed>  $line
     * @return array{line: int, sku: ?string, outcome: string, reason: ?string}
     */
    private static function problem(array $line): array
    {
        return [
            'line' => $line['line'],
            'sku' => $line['sku'] === null ? null : mb_substr((string) $line['sku'], 0, 120),
            'outcome' => $line['outcome'],
            'reason' => $line['reason'],
        ];
    }

    /** The row limit the file is read under, named so the controller and this agree. */
    public static function maxRows(): int
    {
        return Csv::MAX_ROWS;
    }
}
