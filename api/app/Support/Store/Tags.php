<?php

namespace App\Support\Store;

use App\Enums\ProductType;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\StoreTag;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Shop tags: the one implementation (0.141.0, `docs/store.md` "Tags").
 *
 * The product form, the CSV import, the WordPress import, the seeder and the
 * Tags screen's "Tag untagged products" all come through here, so there is one
 * answer to what a tag is, how two spellings meet, and when the machine may
 * tag a product.
 *
 * **A slug is the identity.** "Wi-Fi 6", "wi-fi 6" and " WI-FI  6 " are one
 * tag; the first spelling seen is kept as its display name. A name whose slug
 * is empty (`"!!!"`) is no tag at all and is dropped.
 *
 * **The automatic rule runs once.** `store_products.tags_set_at` is stamped the
 * first time tags are decided for a product — by a person saving the form with
 * a `tags` key (even an empty one) or by the rule applying some — and the rule
 * only ever runs while it is null. So a product somebody cleared is never
 * tagged again behind their back. A product the rule found nothing for is
 * *not* stamped: nothing was decided, and the rule may try again when a brand
 * or a category is added later.
 *
 * **It never fails what it is tagging.** `autoTag()` is guarded and logs at
 * `warning`; a product that saved and went untagged is better than a save
 * refused over a label.
 */
class Tags
{
    public const MAX_PER_PRODUCT = 12;

    /** The longest tag name, in characters. */
    public const NAME_MAX = 32;

    /** The longest tag the rule will make. */
    public const RULE_NAME_MAX = 24;

    /** How many tags the rule proposes at most. */
    public const RULE_MAX = 6;

    /** How many of a category's filter specifications the rule reads. */
    private const RULE_SPECS = 4;

    public static function enabled(): bool
    {
        return (bool) Setting::get('store_tags_enabled', true);
    }

    public static function autoEnabled(): bool
    {
        return (bool) Setting::get('store_tags_auto', true);
    }

    /** How many tags the shop front's row shows, 4–30. */
    public static function limit(): int
    {
        return min(30, max(4, (int) Setting::get('store_tags_limit', 12)));
    }

    /**
     * Names as typed to the tags they stand for: trimmed, whitespace
     * collapsed, one per slug (first spelling wins), none with an empty slug
     * or over {@see NAME_MAX} characters.
     *
     * @param  array<int, mixed>  $names
     * @return array<string, string> slug => name
     */
    public static function clean(array $names): array
    {
        $clean = [];

        foreach ($names as $name) {
            if (! is_string($name)) {
                continue;
            }

            $name = trim(preg_replace('/\s+/u', ' ', $name) ?? $name);

            if ($name === '' || mb_strlen($name) > self::NAME_MAX) {
                continue;
            }

            $slug = mb_substr(Str::slug($name), 0, 64);

            if ($slug === '') {
                continue;
            }

            $clean[$slug] ??= $name;
        }

        return $clean;
    }

    /**
     * Make the product carry exactly these tags: existing ones matched by
     * slug, the rest created. Stamps `tags_set_at`; `$auto` says whether the
     * rule (and not a person) chose them.
     *
     * @param  array<int, mixed>  $names
     */
    public static function sync(StoreProduct $product, array $names, bool $auto = false): void
    {
        $wanted = array_slice(self::clean($names), 0, self::MAX_PER_PRODUCT, true);

        DB::transaction(function () use ($product, $wanted, $auto) {
            $ids = [];

            foreach ($wanted as $slug => $name) {
                $tag = StoreTag::query()->where('slug', $slug)->first()
                    // New tags are unordered (0): the shop front puts curated
                    // ones first and the rest by how many products carry them.
                    ?? StoreTag::query()->create(['name' => $name, 'slug' => $slug, 'is_visible' => true, 'sort_order' => 0]);

                $ids[] = $tag->id;
            }

            // A person saving the form with the rule's tags exactly as they
            // were has not changed them: they stay "added automatically".
            $current = $product->tags()->pluck('store_tags.id')->map(fn ($id) => (int) $id)->all();
            $unchanged = $current !== [] && count($current) === count($ids) && array_diff($current, $ids) === [];

            $product->tags()->sync($ids);

            self::stamp($product, $auto || ($unchanged && (bool) $product->tags_auto));
        });
    }

    /**
     * The tags the rule would give this product, as names: its brand, its
     * category, `Digital` for a licence or a download, and the values of the
     * specifications its category offers as filters (the first four) — a bare
     * number takes its label ("24 Ports"), yes/no values are skipped, nothing
     * over 24 characters; six at most.
     *
     * @return array<int, string>
     */
    public static function suggestByRules(StoreProduct $product): array
    {
        $product->loadMissing(['brand', 'category']);

        $candidates = [];

        if (filled($product->brand?->name)) {
            $candidates[] = (string) $product->brand->name;
        }

        if (filled($product->category?->name)) {
            $candidates[] = (string) $product->category->name;
        }

        if ($product->type === ProductType::Digital) {
            $candidates[] = 'Digital';
        }

        $sheet = [];
        foreach ($product->specifications ?? [] as $label => $value) {
            $sheet[SpecIndex::key((string) $label)] ??= [(string) $label, (string) $value];
        }

        $filters = $product->category !== null ? (array) $product->category->filter_specs : [];
        $labels = array_slice(array_values($filters), 0, self::RULE_SPECS);

        foreach ($labels as $label) {
            [$shownLabel, $value] = $sheet[SpecIndex::key((string) $label)] ?? [null, null];
            $value = trim((string) $value);

            if ($shownLabel === null || $value === '' || self::isYesNo($value)) {
                continue;
            }

            // "24" alone says nothing; "24 Ports" does.
            $candidates[] = is_numeric($value) ? $value.' '.trim($shownLabel) : $value;
        }

        $names = [];

        foreach ($candidates as $candidate) {
            $candidate = trim(preg_replace('/\s+/u', ' ', $candidate) ?? $candidate);

            if ($candidate !== '' && mb_strlen($candidate) <= self::RULE_NAME_MAX) {
                $names[] = $candidate;
            }
        }

        return array_values(array_slice(self::clean($names), 0, self::RULE_MAX));
    }

    /**
     * Tag a product by the rule — once. Runs only while `tags_set_at` is null,
     * the product has no tags and `store_tags_auto` is on (`$force` skips the
     * switch for the Tags screen's explicit button). Returns whether it tagged.
     * Guarded: never throws.
     */
    public static function autoTag(StoreProduct $product, bool $force = false): bool
    {
        try {
            if (! $force && ! self::autoEnabled()) {
                return false;
            }

            if ($product->tags_set_at !== null || $product->tags()->exists()) {
                return false;
            }

            $names = self::suggestByRules($product);

            if ($names === []) {
                return false;
            }

            self::sync($product, $names, auto: true);

            return true;
        } catch (Throwable $e) {
            Log::warning('A product could not be tagged automatically', ['product' => $product->id, 'error' => mb_substr($e->getMessage(), 0, 200)]);

            return false;
        }
    }

    /** @return Builder<StoreProduct> products the rule may still tag */
    public static function untagged(): Builder
    {
        return StoreProduct::query()->whereNull('tags_set_at')->whereDoesntHave('tags');
    }

    /** Run the rule over every product that has no tags and was never decided. Returns how many it tagged. */
    public static function autoTagUntagged(): int
    {
        $tagged = 0;

        self::untagged()->with(['brand', 'category'])->orderBy('id')->chunkById(100, function ($products) use (&$tagged) {
            foreach ($products as $product) {
                if (self::autoTag($product, force: true)) {
                    $tagged++;
                }
            }
        });

        return $tagged;
    }

    /**
     * Move every product of `$from` onto `$into`, then delete `$from`. A
     * product holding both ends with one row. One transaction. Returns how
     * many products moved.
     */
    public static function merge(StoreTag $from, StoreTag $into): int
    {
        return DB::transaction(function () use ($from, $into) {
            $have = DB::table('store_product_tag')->where('store_tag_id', $into->id)->pluck('store_product_id')->all();

            $move = DB::table('store_product_tag')
                ->where('store_tag_id', $from->id)
                ->whereNotIn('store_product_id', $have ?: [0])
                ->pluck('store_product_id')
                ->all();

            foreach (array_chunk($move, 500) as $chunk) {
                DB::table('store_product_tag')->insert(array_map(
                    fn ($id) => ['store_product_id' => $id, 'store_tag_id' => $into->id],
                    $chunk,
                ));
            }

            // The source's pivot rows go with it (cascade).
            $from->delete();

            return count($move);
        });
    }

    /** True while `$product`'s tags are the rule's, untouched. */
    public static function isAuto(StoreProduct $product): bool
    {
        return (bool) $product->tags_auto && $product->tags_set_at !== null;
    }

    /**
     * Written through the query builder: a model `save()` would fire the
     * `saved`/`updated` hooks (the spec index, the price-drop watch, IndexNow)
     * and move `updated_at` for a bookkeeping stamp.
     */
    private static function stamp(StoreProduct $product, bool $auto): void
    {
        $now = now();

        DB::table('store_products')->where('id', $product->id)->update(['tags_set_at' => $now, 'tags_auto' => $auto]);

        $product->setAttribute('tags_set_at', $now)->setAttribute('tags_auto', $auto);
        $product->syncOriginalAttribute('tags_set_at');
        $product->syncOriginalAttribute('tags_auto');
    }

    private static function isYesNo(string $value): bool
    {
        return in_array(mb_strtolower($value), ['yes', 'no', 'true', 'false', 'y', 'n', 'none', 'n/a', '-', '—'], true);
    }
}
