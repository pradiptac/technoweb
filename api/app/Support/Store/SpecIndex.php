<?php

namespace App\Support\Store;

use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * `store_product_specs`: every product's spec sheet and its active
 * variations' options, one row per label and value, for filtering.
 *
 * **Derived, and rebuilt whole.** The sheet lives on the product as ordered
 * pairs and the options on each variation the same way; this table is a copy
 * in a shape a query can use, so a rebuild is "delete the product's rows,
 * write what the product says now" rather than a diff that could drift.
 *
 * **A product matches when any active variation has the value.** A switch
 * sold as a 24-port and a 48-port is a switch somebody filtering by "48" wants
 * to see, and an inactive variation cannot be bought, so it offers nothing.
 *
 * **Queued after commit, once per product.** The admin form saves the product
 * and then each variation inside one transaction, and every one of those saves
 * asks for a rebuild. Rebuilt on the first ask the index would read the
 * variations before they were written; so each ask is deferred to the commit
 * (`DB::afterCommit`, which runs at once outside a transaction) and the first
 * callback to run stamps the product, so the rest — all scheduled before that
 * stamp — skip. A rolled-back transaction discards its callbacks and touches
 * nothing, which is why the guard is a timestamp rather than a "pending" set
 * that a rollback would leave set for the life of a queue worker.
 *
 * **It never fails what it is indexing** — the `StockLedger` rule. A product
 * that saved and an index that did not is a filter briefly out of date, and
 * `technoware:rebuild-store-specs` puts it right; a product edit refused over
 * a filter would be the worse failure.
 */
class SpecIndex
{
    /** The longest key the index stores; `value_key` is a 191-character column. */
    private const KEY_LENGTH = 191;

    /** @var array<int, int> product id => hrtime of the last rebuild */
    private static array $rebuiltAt = [];

    /**
     * The form a label or a value is matched on: trimmed, runs of whitespace
     * collapsed to one space, lower-cased. "24 Ports", " 24  ports " and
     * "24 ports" are one value to somebody filtering, and three to a string
     * comparison.
     */
    public static function key(string $text): string
    {
        $text = preg_replace('/\s+/u', ' ', trim($text)) ?? trim($text);

        return mb_substr(mb_strtolower($text), 0, self::KEY_LENGTH);
    }

    /** Ask for a rebuild once the current transaction commits (or now, outside one). */
    public static function queue(int $productId): void
    {
        $asked = hrtime(true);

        DB::afterCommit(function () use ($productId, $asked) {
            if ((self::$rebuiltAt[$productId] ?? 0) > $asked) {
                return;
            }

            self::$rebuiltAt[$productId] = hrtime(true);
            self::rebuild($productId);
        });
    }

    /**
     * Write the product's rows from what it says now. Guarded: logged, never
     * thrown.
     */
    public static function rebuild(int $productId): void
    {
        try {
            $product = StoreProduct::query()->with('variations')->find($productId);

            DB::transaction(function () use ($product, $productId) {
                DB::table('store_product_specs')->where('store_product_id', $productId)->delete();

                if ($product !== null) {
                    $rows = self::rowsFor($product);

                    if ($rows !== []) {
                        DB::table('store_product_specs')->insert($rows);
                    }
                }
            });

            self::touch();
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * The rows a product contributes: its own sheet first, then each active
     * variation's options, one row per distinct label and value.
     *
     * @return array<int, array{store_product_id: int, label: string, value: string, label_key: string, value_key: string}>
     */
    public static function rowsFor(StoreProduct $product): array
    {
        $pairs = [];

        foreach ($product->specifications ?? [] as $label => $value) {
            $pairs[] = [(string) $label, (string) $value];
        }

        foreach ($product->variations as $variation) {
            /** @var StoreProductVariation $variation */
            if (! $variation->is_active) {
                continue;
            }

            foreach ($variation->options ?? [] as $label => $value) {
                $pairs[] = [(string) $label, (string) $value];
            }
        }

        $rows = [];

        foreach ($pairs as [$label, $value]) {
            $labelKey = self::key($label);
            $valueKey = self::key($value);

            // A label with no value says nothing a filter can offer.
            if ($labelKey === '' || $valueKey === '') {
                continue;
            }

            $rows[$labelKey."\0".$valueKey] ??= [
                'store_product_id' => $product->id,
                'label' => mb_substr(trim($label), 0, 255),
                'value' => mb_substr(trim($value), 0, 255),
                'label_key' => $labelKey,
                'value_key' => $valueKey,
            ];
        }

        return array_values($rows);
    }

    /**
     * A version the facet cache is keyed on, moved by every rebuild and every
     * product deleted — the two changes that alter the counts without moving
     * any product's `updated_at` (a variation's options, a row that is gone).
     */
    public static function touch(): void
    {
        Cache::forever('store:specs:version', (string) hrtime(true));
    }

    public static function version(): string
    {
        return (string) Cache::get('store:specs:version', '0');
    }
}
