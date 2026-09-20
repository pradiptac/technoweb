<?php

namespace App\Support\Store;

use App\Enums\OrderStatus;
use App\Models\Order;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * What sold, over a range somebody chose.
 *
 * The dashboard answers "how are we doing"; this answers "what happened between
 * these two dates", which is a different question with different rules — it is
 * read to reconcile against a bank statement, to file a GST return, and to
 * decide what to reorder. So:
 *
 * **The range is echoed back, always.** A report that quietly covered something
 * other than what was asked for is worse than one that refuses, because the
 * figure gets written down.
 *
 * **Revenue is `Order::scopePaid()`**, the same definition the dashboard and the
 * order queue use. Three screens, one word — and that word means `paid_at` is
 * set, not that the status has moved past payment. A cash-on-delivery order is
 * dispatched before the money exists, so the two stopped being the same fact.
 *
 * **GST is read, never recomputed.** It is extracted at checkout and stored on
 * the order — `taxable = total × 10000 ÷ 11800`, `gst = total − taxable`, so the
 * two halves add back to what was charged. Recomputing it here from the total
 * would agree most of the time and, on the roundings where it did not, produce a
 * return that disagrees with the money taken.
 *
 * **A day with no sales is still a row.** Same reason the dashboard's series is
 * zero-filled: a table that skips quiet days reads as though they never
 * happened.
 */
class SalesReport
{
    /** Beyond this a report is a data export, and the range is refused. */
    public const MAX_DAYS = 366;

    public const GROUPS = ['day', 'week', 'month'];

    /** @return array<string, mixed> */
    public static function read(Carbon $from, Carbon $to, string $group = 'day'): array
    {
        $group = in_array($group, self::GROUPS, true) ? $group : 'day';

        $from = $from->copy()->startOfDay();
        $to = $to->copy()->endOfDay();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'group' => $group,
            /*
             * Measured between two midnights, and cast.
             *
             * `diffInDays` returns a **float** in Carbon 3, and `$to` is the
             * end of its day — so the obvious expression yields 31.999999 for
             * a calendar month. Harmless-looking in a JSON figure, and the same
             * expression guards `MAX_DAYS`, where being a hair under a whole
             * day is an off-by-one on a limit.
             */
            'days' => self::spanInDays($from, $to),
            'totals' => self::totals($from, $to),
            'series' => self::series($from, $to, $group),
            'products' => self::products($from, $to),
            'statuses' => self::statuses($from, $to),
        ];
    }

    /**
     * Whole days, inclusive of both ends.
     *
     * One helper because the figure and the limit have to be the same number:
     * a report that says it covers 366 days and a guard that refuses 366 days
     * would disagree about the same range.
     */
    public static function spanInDays(Carbon $from, Carbon $to): int
    {
        return (int) $from->copy()->startOfDay()->diffInDays($to->copy()->startOfDay()) + 1;
    }

    private static function inRange(Carbon $from, Carbon $to)
    {
        /*
         * Ranged on `placed_at`, not `created_at`.
         *
         * They are the same to the second today, and they are not the same
         * fact: `created_at` is when the row was written and `placed_at` is
         * when the order was placed. A report is read against dates a person
         * recognises, so it has to follow the business field — and if an order
         * is ever backfilled or imported, the row's age is not the sale's date.
         */
        return Order::paid()->whereBetween('placed_at', [$from, $to]);
    }

    /** @return array<string, mixed> */
    private static function totals(Carbon $from, Carbon $to): array
    {
        $row = self::inRange($from, $to)
            ->selectRaw('count(*) as orders, sum(total_paise) as total, sum(taxable_paise) as taxable,
                         sum(gst_paise) as gst, sum(discount_paise) as discount, sum(subtotal_paise) as subtotal')
            ->first();

        $orders = (int) ($row->orders ?? 0);
        $total = (int) ($row->total ?? 0);

        $units = (int) DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereNotNull('orders.paid_at')
            ->whereBetween('orders.placed_at', [$from, $to])
            ->sum('order_items.quantity');

        return [
            'orders' => $orders,
            'units' => $units,
            'subtotal_paise' => (int) ($row->subtotal ?? 0),
            'discount_paise' => (int) ($row->discount ?? 0),
            'taxable_paise' => (int) ($row->taxable ?? 0),
            'gst_paise' => (int) ($row->gst ?? 0),
            'total_paise' => $total,
            /*
             * Reported, never subtracted. A refund is a separate movement of
             * money and the gateway reports it separately; a revenue figure
             * with refunds silently netted off matches neither the gateway nor
             * the invoices.
             */
            'refunded_paise' => (int) Order::where('status', OrderStatus::Refunded)
                ->whereBetween('placed_at', [$from, $to])
                ->sum('total_paise'),
            // An average of nothing is not zero rupees.
            'average_paise' => $orders > 0 ? intdiv($total, $orders) : null,
        ];
    }

    /**
     * The range, by period, with the quiet ones present.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function series(Carbon $from, Carbon $to, string $group): array
    {
        /*
         * `%x-%v` for weeks, not `%Y-%u`: the first pairs ISO week with the ISO
         * *week-year*, and the two disagree at every new year — 31 December
         * 2024 is week 1 of 2025, so a plain year would file it under 2024 and
         * put two "week 1" rows in the same table.
         */
        $format = match ($group) {
            'month' => '%Y-%m',
            'week' => '%x-W%v',
            default => '%Y-%m-%d',
        };

        $rows = self::inRange($from, $to)
            ->selectRaw("date_format(placed_at, '{$format}') as period,
                         count(*) as orders, sum(total_paise) as total, sum(gst_paise) as gst,
                         sum(discount_paise) as discount")
            ->groupBy('period')
            ->get()
            ->keyBy('period');

        $series = [];
        $cursor = $from->copy();

        while ($cursor->lte($to)) {
            $period = match ($group) {
                'month' => $cursor->format('Y-m'),
                'week' => $cursor->isoFormat('GGGG-[W]WW'),
                default => $cursor->toDateString(),
            };

            $row = $rows->get($period);

            $series[] = [
                'period' => $period,
                'label' => match ($group) {
                    'month' => $cursor->format('M Y'),
                    'week' => 'w/c '.$cursor->copy()->startOfWeek()->format('j M'),
                    default => $cursor->format('j M Y'),
                },
                'orders' => (int) ($row->orders ?? 0),
                'revenue_paise' => (int) ($row->total ?? 0),
                'gst_paise' => (int) ($row->gst ?? 0),
                'discount_paise' => (int) ($row->discount ?? 0),
            ];

            $cursor = match ($group) {
                'month' => $cursor->addMonthNoOverflow()->startOfMonth(),
                'week' => $cursor->addWeek()->startOfWeek(),
                default => $cursor->addDay(),
            };
        }

        return $series;
    }

    /**
     * What sold, by product.
     *
     * Grouped on `store_product_id` and labelled from the **order item's own
     * snapshot**, which is the name the thing was sold under. A product renamed
     * since, or deleted, still has to appear: an order item is a snapshot
     * precisely so that what an invoice says was sold cannot change afterwards,
     * and a report that dropped deleted products would quietly stop adding up
     * to the revenue figure above it.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function products(Carbon $from, Carbon $to): array
    {
        return DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereNotNull('orders.paid_at')
            ->whereBetween('orders.placed_at', [$from, $to])
            ->groupBy('order_items.store_product_id')
            ->selectRaw('order_items.store_product_id as id,
                         max(order_items.name) as name,
                         max(order_items.sku) as sku,
                         max(order_items.type) as type,
                         sum(order_items.quantity) as units,
                         sum(order_items.line_total_paise) as revenue,
                         count(distinct orders.id) as orders')
            ->orderByDesc('revenue')
            ->orderBy('order_items.store_product_id')
            ->limit(50)
            ->get()
            ->map(fn ($r) => [
                'id' => $r->id === null ? null : (int) $r->id,
                'name' => $r->name,
                'sku' => $r->sku,
                'type' => $r->type,
                'units' => (int) $r->units,
                'orders' => (int) $r->orders,
                'revenue_paise' => (int) $r->revenue,
            ])
            ->all();
    }

    /**
     * Every order in the range by status, paid or not.
     *
     * Deliberately *not* `paid()`: this is the one figure on the report that
     * answers "what happened to the orders", and an abandoned basket is part of
     * that answer even though it is not part of revenue.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function statuses(Carbon $from, Carbon $to): array
    {
        $rows = Order::whereBetween('placed_at', [$from, $to])
            ->selectRaw('status, count(*) as orders, sum(total_paise) as total')
            ->groupBy('status')
            ->get();

        return $rows
            ->map(fn ($r) => [
                'status' => $r->status instanceof OrderStatus ? $r->status->value : $r->status,
                'label' => ($r->status instanceof OrderStatus ? $r->status : OrderStatus::from($r->status))->label(),
                'orders' => (int) $r->orders,
                'total_paise' => (int) $r->total,
            ])
            ->sortByDesc('orders')
            ->values()
            ->all();
    }

    /**
     * The orders themselves, for the CSV.
     *
     * A generator rather than a collection: an export is the one place here
     * that can legitimately be tens of thousands of rows, and building the
     * whole thing in memory to hand it to a streamed response defeats the
     * streaming.
     */
    public static function orderRows(Carbon $from, Carbon $to): \Generator
    {
        $query = Order::with('items')
            ->whereBetween('placed_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])
            ->orderBy('placed_at')
            ->orderBy('id');

        foreach ($query->lazy(200) as $order) {
            yield $order;
        }
    }
}
