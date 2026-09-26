<?php

namespace App\Support\Store;

use App\Models\StoreCategory;
use App\Models\StoreProduct;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Filtering the shop by specification, and counting what each choice would
 * leave (2026-09-26, `docs/store.md` "Specification filters").
 *
 * `?spec[Ports][]=24 ports&spec[Ports][]=48 ports&spec[PoE][]=Yes` reads as
 * (24 **or** 48) **and** PoE — OR within a label, because two port counts
 * ticked is "either will do", and AND across labels, because "24-port and
 * PoE" is one switch with both. Matched on `SpecIndex::key()`, so the case
 * and spacing an editor typed never decide whether something matches.
 *
 * **A label nothing carries is ignored rather than applied.** Applied, it
 * would match nothing and empty the page — which is what a mangled bookmark
 * or a label an editor has since renamed would do to somebody who did
 * nothing wrong. The `?sort=` rule: what arrives from outside is a request.
 */
class SpecFilter
{
    /** How many labels, and values per label, a request may carry. */
    private const MAX_LABELS = 12;

    private const MAX_VALUES = 40;

    /** Five minutes: a new product or a changed sheet appears within that. */
    private const FACET_TTL = 300;

    /**
     * The request's `spec` parameter, normalised: label key => the label as
     * sent and the value keys chosen. Anything that is not a label mapped to
     * a string or a list of strings is dropped.
     *
     * @return array<string, array{label: string, values: array<int, string>}>
     */
    public static function parse(mixed $input): array
    {
        if (! is_array($input)) {
            return [];
        }

        $selected = [];

        foreach ($input as $label => $values) {
            if (! is_string($label) || count($selected) >= self::MAX_LABELS) {
                continue;
            }

            $labelKey = SpecIndex::key($label);
            $values = is_array($values) ? $values : [$values];

            $keys = collect($values)
                ->filter(fn ($v) => is_string($v) || is_numeric($v))
                ->map(fn ($v) => SpecIndex::key((string) $v))
                ->filter(fn (string $v) => $v !== '')
                ->unique()
                ->take(self::MAX_VALUES)
                ->values()
                ->all();

            if ($labelKey === '' || $keys === []) {
                continue;
            }

            $selected[$labelKey] = [
                'label' => trim($label),
                'values' => array_values(array_unique([...($selected[$labelKey]['values'] ?? []), ...$keys])),
            ];
        }

        // Labels nothing in the shop carries are dropped, not applied.
        if ($selected !== []) {
            $known = DB::table('store_product_specs')
                ->whereIn('label_key', array_keys($selected))
                ->distinct()
                ->pluck('label_key')
                ->all();

            $selected = array_intersect_key($selected, array_flip($known));
        }

        return $selected;
    }

    /**
     * Narrow a product query to the selection.
     *
     * @param  Builder<StoreProduct>  $query
     * @param  array<string, array{label: string, values: array<int, string>}>  $selected
     * @return Builder<StoreProduct>
     */
    public static function apply(Builder $query, array $selected, ?string $except = null): Builder
    {
        foreach ($selected as $labelKey => $choice) {
            if ($labelKey === $except) {
                continue;
            }

            $query->whereExists(fn (QueryBuilder $q) => $q->selectRaw('1')
                ->from('store_product_specs')
                ->whereColumn('store_product_specs.store_product_id', 'store_products.id')
                ->where('store_product_specs.label_key', $labelKey)
                ->whereIn('store_product_specs.value_key', $choice['values']));
        }

        return $query;
    }

    /**
     * The category's filters, each with the values its published products
     * carry and how many products each would leave.
     *
     * **Standard facet counting**: a label's counts are taken under every
     * *other* label's selection and not its own. Counted under its own, ticking
     * "24 ports" would report 0 against "48 ports" — which reads as "there are
     * none" when it means "you have not ticked it yet", and OR within a label
     * is exactly the choice those numbers are for.
     *
     * A value somebody has ticked stays in the list at 0 when the other
     * choices have emptied it, so it can still be unticked.
     *
     * The unfiltered answer is cached for five minutes, keyed on the category,
     * its filter list, its newest product and the index's version. **A
     * filtered one never is** — that key space is every combination somebody
     * could tick, the "never cache a user's query" rule.
     *
     * @param  array<string, array{label: string, values: array<int, string>}>  $selected
     * @return array<int, array{label: string, key: string, values: array<int, array{value: string, key: string, count: int, selected: bool}>}>
     */
    public static function facets(StoreCategory $category, array $selected = []): array
    {
        $labels = self::labels($category);

        if ($labels === []) {
            return [];
        }

        if ($selected === []) {
            $newest = (string) StoreProduct::query()
                ->where('store_category_id', $category->id)
                ->max('updated_at');
            $key = 'store:facets:'.$category->id.':'.md5(json_encode([$labels, $newest, SpecIndex::version(), $category->updated_at?->toIso8601String()]) ?: '');

            return Cache::remember($key, self::FACET_TTL, fn () => self::count($category, $labels, []));
        }

        return self::count($category, $labels, $selected);
    }

    /**
     * The category's chosen labels, de-duplicated on their keys, in order.
     *
     * @return array<string, string> label key => label as chosen
     */
    public static function labels(StoreCategory $category): array
    {
        $out = [];

        foreach ($category->filter_specs ?? [] as $label) {
            $key = SpecIndex::key((string) $label);

            if ($key !== '') {
                $out[$key] ??= trim((string) $label);
            }
        }

        return $out;
    }

    /**
     * What the console's filter picker offers: every label the category's
     * published products carry, with how many carry it, most common first —
     * plus any label already chosen that nothing carries any more, at 0, so
     * it can be taken off.
     *
     * @return array<int, array{label: string, key: string, products: int, chosen: bool}>
     */
    public static function labelsInUse(StoreCategory $category): array
    {
        $chosen = self::labels($category);

        $rows = DB::table('store_product_specs')
            ->join('store_products', 'store_products.id', '=', 'store_product_specs.store_product_id')
            ->where('store_products.store_category_id', $category->id)
            ->where('store_products.status', 'published')
            ->groupBy('store_product_specs.label_key')
            ->selectRaw('store_product_specs.label_key as label_key, MIN(store_product_specs.label) as label, COUNT(DISTINCT store_product_specs.store_product_id) as products')
            ->orderByDesc('products')
            ->orderBy('label_key')
            ->get();

        $out = [];

        foreach ($rows as $row) {
            $out[(string) $row->label_key] = [
                'label' => $chosen[(string) $row->label_key] ?? (string) $row->label,
                'key' => (string) $row->label_key,
                'products' => (int) $row->products,
                'chosen' => isset($chosen[(string) $row->label_key]),
            ];
        }

        foreach ($chosen as $key => $label) {
            $out[$key] ??= ['label' => $label, 'key' => $key, 'products' => 0, 'chosen' => true];
        }

        return array_values($out);
    }

    /**
     * @param  array<string, string>  $labels
     * @param  array<string, array{label: string, values: array<int, string>}>  $selected
     * @return array<int, array{label: string, key: string, values: array<int, array{value: string, key: string, count: int, selected: bool}>}>
     */
    private static function count(StoreCategory $category, array $labels, array $selected): array
    {
        $facets = [];

        foreach ($labels as $labelKey => $label) {
            $products = self::apply(
                StoreProduct::query()->published()->where('store_category_id', $category->id),
                $selected,
                except: $labelKey,
            )->select('store_products.id');

            $rows = DB::table('store_product_specs')
                ->where('label_key', $labelKey)
                ->whereIn('store_product_id', $products)
                ->groupBy('value_key')
                ->selectRaw('value_key, MIN(value) as value, COUNT(DISTINCT store_product_id) as products')
                ->get();

            $chosen = $selected[$labelKey]['values'] ?? [];
            $values = [];

            foreach ($rows as $row) {
                $values[(string) $row->value_key] = [
                    'value' => (string) $row->value,
                    'key' => (string) $row->value_key,
                    'count' => (int) $row->products,
                    'selected' => in_array((string) $row->value_key, $chosen, true),
                ];
            }

            // Ticked and emptied by the other choices: kept, at zero, so it
            // can be unticked. Its words come from wherever the shop has them.
            foreach ($chosen as $valueKey) {
                if (! isset($values[$valueKey])) {
                    $words = DB::table('store_product_specs')
                        ->where('label_key', $labelKey)->where('value_key', $valueKey)
                        ->value('value');

                    $values[$valueKey] = [
                        'value' => (string) ($words ?? $valueKey),
                        'key' => $valueKey,
                        'count' => 0,
                        'selected' => true,
                    ];
                }
            }

            if ($values === []) {
                continue;
            }

            $values = array_values($values);
            usort($values, fn (array $a, array $b) => self::compare($a['value'], $b['value']));

            $facets[] = ['label' => $label, 'key' => $labelKey, 'values' => $values];
        }

        return $facets;
    }

    /**
     * The order a person expects: values that start with a number by that
     * number ("8 ports" before "24 ports", "1.25 GHz" before "1.5 GHz"), ahead
     * of values that do not, and everything else naturally and without case.
     */
    public static function compare(string $a, string $b): int
    {
        $na = self::leadingNumber($a);
        $nb = self::leadingNumber($b);

        if ($na !== null && $nb !== null && $na !== $nb) {
            return $na <=> $nb;
        }

        if (($na === null) !== ($nb === null)) {
            return $na === null ? 1 : -1;
        }

        return strnatcasecmp($a, $b);
    }

    private static function leadingNumber(string $value): ?float
    {
        // "1,000" is a thousand, the way these sheets write it; a decimal is
        // a point.
        return preg_match('/^\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/', $value, $m)
            ? (float) (str_replace(',', '', $m[1]).($m[2] ?? ''))
            : null;
    }
}
