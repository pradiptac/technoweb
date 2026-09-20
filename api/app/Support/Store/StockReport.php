<?php

namespace App\Support\Store;

use App\Enums\StockMovementReason;
use App\Models\StockMovement;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * What came in and what went out, between two dates.
 *
 * The read half of `StockLedger`. Same shape as `SalesReport` — a range echoed
 * back, totals, a per-product breakdown — because a report is read against
 * dates a person recognises and two report screens in one console must not
 * answer the same question differently.
 *
 * ## What it deliberately does not report
 *
 * **No opening or closing balance.** They can be computed exactly for any
 * range that lies entirely after the ledger was added and cannot be computed
 * at all for one that does not, because the movements backfilled from historic
 * orders carry no `balance_after` — the levels they left behind stopped
 * existing before anybody wrote them down. A column that is right for recent
 * months and quietly wrong for older ones is worse than no column: the figure
 * gets written down either way. What is reported instead is `stock_now`, which
 * is the level today and is a fact.
 *
 * That is the same call `SalesReport` makes with a null average and the ticket
 * dashboard makes with a null median. A figure nobody measured is not zero.
 */
class StockReport
{
    /** The same ceiling `SalesReport` enforces, and for the same reason. */
    public const MAX_DAYS = SalesReport::MAX_DAYS;

    /**
     * @param  array{product?: int|null, reason?: string|null, direction?: string|null}  $filters
     * @return array<string, mixed>
     */
    public static function read(Carbon $from, Carbon $to, array $filters = []): array
    {
        $to = $to->copy()->endOfDay();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'days' => (int) ceil(SalesReport::spanInDays($from, $to)),
            'totals' => self::totals($from, $to, $filters),
            'products' => self::byProduct($from, $to, $filters),
            'by_reason' => self::byReason($from, $to, $filters),
        ];
    }

    /**
     * The range, and every filter the screen is showing, in one place.
     *
     * Written once and reused by the totals, the breakdown and the CSV, so a
     * filtered screen and its export cannot disagree about what they cover —
     * the mistake `/admin/leads/export` was built to avoid by sharing
     * `filtered()` with its index.
     */
    public static function query(Carbon $from, Carbon $to, array $filters = []): Builder
    {
        $query = StockMovement::query()
            ->whereBetween('created_at', [$from, $to->copy()->endOfDay()]);

        if (filled($filters['product'] ?? null)) {
            $query->where('store_product_id', (int) $filters['product']);
        }

        if (filled($filters['reason'] ?? null) && StockMovementReason::tryFrom((string) $filters['reason'])) {
            $query->where('reason', $filters['reason']);
        }

        // `in` and `out` are the two questions this report exists to answer, so
        // they are a filter rather than something to read off a sign column.
        if (($filters['direction'] ?? null) === 'in') {
            $query->incoming();
        } elseif (($filters['direction'] ?? null) === 'out') {
            $query->outgoing();
        }

        return $query;
    }

    /** @return array<string, int|null> */
    private static function totals(Carbon $from, Carbon $to, array $filters): array
    {
        $row = self::query($from, $to, $filters)
            ->selectRaw('
                count(*) as movements,
                coalesce(sum(case when delta > 0 then delta else 0 end), 0) as stock_in,
                coalesce(sum(case when delta < 0 then -delta else 0 end), 0) as stock_out,
                count(distinct store_product_id) as products
            ')
            ->first();

        $in = (int) ($row->stock_in ?? 0);
        $out = (int) ($row->stock_out ?? 0);

        return [
            'movements' => (int) ($row->movements ?? 0),
            'products' => (int) ($row->products ?? 0),
            'stock_in' => $in,
            'stock_out' => $out,
            // Stated rather than left to the reader to subtract, because the
            // sign is the whole point and a minus in a table is easy to miss.
            'net' => $in - $out,
        ];
    }

    /**
     * What moved, per product.
     *
     * Grouped on the **snapshotted name** as well as the id, so a product
     * deleted since still appears as itself — the rule `SalesReport` follows
     * for its product breakdown, and the reason an order item snapshots at
     * all. Its `id` comes back null, which is how the console knows not to
     * link to a screen that is not there.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function byProduct(Carbon $from, Carbon $to, array $filters): array
    {
        $rows = self::query($from, $to, $filters)
            ->selectRaw('
                store_product_id,
                min(product_name) as product_name,
                min(sku) as sku,
                count(*) as movements,
                coalesce(sum(case when delta > 0 then delta else 0 end), 0) as stock_in,
                coalesce(sum(case when delta < 0 then -delta else 0 end), 0) as stock_out
            ')
            ->groupBy('store_product_id')
            ->orderByRaw('sum(case when delta < 0 then -delta else 0 end) desc')
            ->orderBy('product_name')
            ->get();

        $levels = self::levels($rows->pluck('store_product_id')->filter()->all());

        return $rows->map(function ($row) use ($levels) {
            $in = (int) $row->stock_in;
            $out = (int) $row->stock_out;

            return [
                'id' => $row->store_product_id === null ? null : (int) $row->store_product_id,
                'name' => $row->product_name,
                'sku' => $row->sku,
                'movements' => (int) $row->movements,
                'stock_in' => $in,
                'stock_out' => $out,
                'net' => $in - $out,
                /*
                 * The level today, not at the end of the range — and null for a
                 * product that has been deleted, because "0 in stock" is a
                 * claim about a shelf and there is no shelf.
                 */
                'stock_now' => $row->store_product_id === null
                    ? null
                    : (int) ($levels[$row->store_product_id] ?? 0),
            ];
        })->all();
    }

    /**
     * The split by why, which is the question behind the question.
     *
     * "We are 40 down this month" means one thing if it is all sales and quite
     * another if half of it is somebody correcting a miscount.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function byReason(Carbon $from, Carbon $to, array $filters): array
    {
        $rows = self::query($from, $to, $filters)
            ->selectRaw('
                reason,
                count(*) as movements,
                coalesce(sum(case when delta > 0 then delta else 0 end), 0) as stock_in,
                coalesce(sum(case when delta < 0 then -delta else 0 end), 0) as stock_out
            ')
            ->groupBy('reason')
            ->get()
            ->keyBy('reason');

        // Every reason, including the ones with nothing against them: a row
        // reading zero says the question was asked, and an absent row reads as
        // the report having forgotten to ask it.
        return array_map(function (StockMovementReason $reason) use ($rows) {
            $row = $rows->get($reason->value);

            return [
                'reason' => $reason->value,
                'label' => $reason->label(),
                'movements' => (int) ($row->movements ?? 0),
                'stock_in' => (int) ($row->stock_in ?? 0),
                'stock_out' => (int) ($row->stock_out ?? 0),
            ];
        }, StockMovementReason::cases());
    }

    /**
     * How many of each product are actually on the shelf.
     *
     * **A product with variations is counted from its variations**, because
     * its own `stock` column is dead for it — `StoreProduct::inStock()`
     * answers from the set, which is why a 48-port switch is not called
     * unavailable when the 24-port runs out. Reading the parent's column would
     * report a figure nothing in the shop uses: the first browser run of this
     * report showed "4 in stock" for a product whose only variation held
     * eleven, and 4 was a number left in a column nobody writes to any more.
     *
     * Only **active** variations count. An inactive one cannot be bought, so
     * including it would report stock the shop will not sell — the same
     * distinction `inStock()` makes.
     *
     * Two queries for the whole page rather than one per row, the trade
     * `MediaAlt` documents for its path map.
     *
     * @param  array<int, int>  $ids
     * @return array<int, int>
     */
    private static function levels(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $own = DB::table('store_products')->whereIn('id', $ids)->pluck('stock', 'id')->all();

        $variations = DB::table('store_product_variations')
            ->whereIn('store_product_id', $ids)
            ->selectRaw('store_product_id, count(*) as rows_total, coalesce(sum(case when is_active = 1 then stock else 0 end), 0) as active_stock')
            ->groupBy('store_product_id')
            ->get();

        foreach ($variations as $row) {
            // Having *any* variation is what makes the parent's column dead,
            // so the switch is on the count and not on the active sum: a
            // product whose variations are all switched off holds nothing
            // sellable, which is 0 rather than whatever the parent last said.
            if ((int) $row->rows_total > 0) {
                $own[$row->store_product_id] = (int) $row->active_stock;
            }
        }

        return $own;
    }
}
