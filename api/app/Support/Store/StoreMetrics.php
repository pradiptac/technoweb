<?php

namespace App\Support\Store;

use App\Enums\DigitalCodeStatus;
use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Cart;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\ProductReview;
use App\Models\StoreProduct;
use App\Models\WishlistItem;
use App\Support\Seo\GoogleAnalytics;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * What the shop is doing, in figures.
 *
 * Four rules, every one of them something this codebase has already had to be
 * taught somewhere else.
 *
 * **"Paid" has one definition**, `Order::scopePaid()`, derived from
 * `OrderStatus::isPaid()`. The newsletter shipped two definitions of
 * "delivered" — one screen reading a column, another counting rows — and they
 * disagreed by one on screens a single click apart, so whichever figure
 * somebody quoted was wrong somewhere else.
 *
 * **A figure is null, never zero, when nothing has been measured.** Zero reads
 * as "we sold nothing"; null reads as "there is nothing to say yet", which is
 * what is true of a shop that opened on Tuesday. The ticket dashboard's medians
 * follow the same rule, and for the same reason.
 *
 * **Revenue counts paid orders only.** An order at `pending_payment` is a
 * basket abandoned at the payment screen. Counting it would make the headline a
 * number nobody can reconcile against a bank statement, which is the fastest
 * way to make a dashboard something people stop believing.
 *
 * **The daily series is zero-filled.** A chart drawn only from days that had an
 * order puts a busy Tuesday beside a busy Friday as though they were
 * consecutive — a different shape from the truth, drawn confidently.
 */
class StoreMetrics
{
    /** At or below this, somebody should be ordering more. */
    public const LOW_STOCK = 5;

    /** @return array<string, mixed> */
    public static function read(int $days = 30): array
    {
        $since = Carbon::today()->subDays($days - 1);

        return [
            'days' => $days,
            /*
             * Sent rather than restated in TypeScript. The console says "above
             * five in stock" in a sentence, and a threshold spelled out on both
             * sides of the wire is the drift `schema_type_options` and
             * `meta.locations` are both sent to avoid.
             */
            'low_stock_threshold' => self::LOW_STOCK,
            'orders' => self::orders($since),
            'revenue' => self::revenue($since),
            'catalogue' => self::catalogue(),
            'attention' => self::attention($since),
            'funnel' => self::funnel($since),
            'recovered' => self::recovered($since),
            'series' => self::series($since, $days),
            'recent' => self::recent(),
            'low_stock' => self::lowStock(),
            'codes_low' => self::codesRunningLow(),
            'most_wished' => self::mostWished(),
        ];
    }

    /** @return array<string, int> */
    private static function orders(Carbon $since): array
    {
        $byStatus = Order::query()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return [
            'total' => (int) $byStatus->sum(),
            'paid' => Order::paid()->count(),
            'pending_payment' => (int) ($byStatus[OrderStatus::PendingPayment->value] ?? 0),
            'cancelled' => (int) ($byStatus[OrderStatus::Cancelled->value] ?? 0),
            'period' => Order::where('created_at', '>=', $since)->count(),
            /*
             * Counted by what an order *contains*, never by a column on it. An
             * order can hold a switch and a licence at once, and the two
             * questions a shop actually asks — how much do we pack, how much do
             * we issue — are about lines. So these two overlap deliberately and
             * do not sum to the total, which is why they are labelled
             * "involving" on the screen rather than left to look like a split.
             */
            'with_physical' => Order::whereHas('items', fn ($q) => $q->where('type', ProductType::Physical->value))->count(),
            'with_digital' => Order::whereHas('items', fn ($q) => $q->where('type', ProductType::Digital->value))->count(),
        ];
    }

    /** @return array<string, mixed> */
    private static function revenue(Carbon $since): array
    {
        $totals = Order::paid()
            ->selectRaw('count(*) as orders, sum(total_paise) as total, sum(gst_paise) as gst, sum(discount_paise) as discount')
            ->first();

        $count = (int) ($totals->orders ?? 0);
        $total = (int) ($totals->total ?? 0);

        return [
            'total_paise' => $total,
            'period_paise' => (int) Order::paid()->where('created_at', '>=', $since)->sum('total_paise'),
            'gst_paise' => (int) ($totals->gst ?? 0),
            'discount_paise' => (int) ($totals->discount ?? 0),
            /*
             * Reported beside revenue rather than subtracted from it. Netting it
             * off silently would leave a headline that cannot be checked against
             * anything: the gateway reports gross and refunds separately, and a
             * figure that matches neither is a figure somebody has to reverse
             * engineer before they can trust it.
             */
            'refunded_paise' => (int) Order::where('status', OrderStatus::Refunded)->sum('total_paise'),
            // An average of nothing is not zero rupees.
            'average_paise' => $count > 0 ? intdiv($total, $count) : null,
            // The sample travels with the average: ₹11,800 across two orders and
            // across two hundred are not the same claim.
            'sample' => $count,
        ];
    }

    /** @return array<string, int> */
    private static function catalogue(): array
    {
        return [
            'products' => StoreProduct::count(),
            'published' => StoreProduct::where('status', PublishStatus::Published)->count(),
            // One scope, shared with the products list this figure links to.
            'out_of_stock' => StoreProduct::where('status', PublishStatus::Published)->outOfStock()->count(),
        ];
    }

    /**
     * What somebody has to do something about.
     *
     * The reason this screen gets opened, and the only part of it that is not
     * just reporting. "Awaiting codes" is a paid order with a licence nobody has
     * issued — a customer actively waiting, who has paid — and it appears in no
     * status column at all, which is precisely why it is counted here rather
     * than left to be noticed.
     *
     * @return array<string, int>
     */
    private static function attention(Carbon $since): array
    {
        return [
            'awaiting_payment' => Order::where('status', OrderStatus::PendingPayment)->count(),
            /*
             * Published and unsellable. Not a shortage — a listing on the shop
             * with a dead Buy button, which is worse than a listing that is not
             * there: somebody arrives from a search, finds the thing they
             * wanted, and leaves.
             */
            'out_of_stock' => StoreProduct::where('status', PublishStatus::Published)->outOfStock()->count(),
            /*
             * A digital product with no codes left is out of stock too, and
             * silently: nothing about the listing says so, so it takes money
             * and puts the order into the queue above.
             */
            'codes_exhausted' => StoreProduct::where('type', ProductType::Digital)
                ->where('status', PublishStatus::Published)
                ->whereDoesntHave('digitalCodes', fn ($q) => $q->where('status', DigitalCodeStatus::Available))
                ->count(),
            'awaiting_dispatch' => Order::whereIn('status', [
                OrderStatus::Paid->value,
                OrderStatus::Processing->value,
                OrderStatus::ReadyForDispatch->value,
            ])->whereNotNull('shipping_address')->count(),
            'awaiting_codes' => self::awaitingCodes(),
            /*
             * Products somebody has asked to hear about and nobody has told
             * — the same `waiting` scope the products list filters on with
             * `?notices=1`, which is where this figure links. A shelf with
             * people waiting on it is the one worth reordering first.
             */
            'awaiting_stock' => StoreProduct::whereHas('stockNotices', fn ($q) => $q->waiting())->count(),
            /*
             * Reviews nobody has read yet — `ProductReview::waiting()`, the
             * scope the review queue opens on, which is where this links.
             */
            'reviews_pending' => ProductReview::waiting()->count(),
            'refund_requested' => Order::where('status', OrderStatus::RefundRequested)->count(),
            // Returns nobody has answered — `OrderReturn::waiting()`, the
            // scope the returns desk opens on, which is where this links.
            'returns_requested' => OrderReturn::waiting()->count(),
            // Orders whose Zoho Books invoice was refused and is waiting on a
            // person — the list `?zoho=failed` opens. Zero while it is off.
            'zoho_failed' => Order::where('zoho_status', 'failed')->count(),
            /*
             * Failed payments are counted over the window rather than for ever.
             * A card declined last March is not something anybody is going to
             * act on, and a headline that only ever grows stops being read.
             */
            'failed_payments' => DB::table('payments')
                ->where('status', PaymentStatus::Failed->value)
                ->where('created_at', '>=', $since)
                ->count(),
        ];
    }

    /**
     * How many people looked, against how many bought.
     *
     * Product views come from Google Analytics for the window — read only,
     * one cached call — and give the paid orders the denominator nothing
     * in this database can. Both are **null** when GA4 is not configured
     * or refused: a shop that has not connected analytics has not measured
     * zero views, and a rate of orders over an unmeasured figure is not a
     * rate. A measured zero stays zero, and then the rate is null again,
     * because two orders over no views is not 200%.
     *
     * @return array{product_views: int|null, paid_orders: int, views_to_orders: float|null}
     */
    private static function funnel(Carbon $since): array
    {
        $views = GoogleAnalytics::productViews($since, Carbon::today());
        $paid = Order::paid()->where('created_at', '>=', $since)->count();

        return [
            'product_views' => $views,
            'paid_orders' => $paid,
            'views_to_orders' => $views !== null && $views > 0 ? round($paid / $views, 4) : null,
        ];
    }

    /**
     * What the basket reminders brought back over the window.
     *
     * `reminded` is baskets that had a reminder in the window; `recovered`
     * those of them that went on to become an order — the checkout stamps
     * `recovered_order_id` on every basket it orders from, and it counts here
     * only because a reminder had gone first. `revenue_paise` is those orders'
     * totals **when paid**, the one definition of paid, so an order placed
     * from a reminder and never paid for is a recovery and not revenue.
     *
     * **Null, not zeros, when nothing was reminded** — reminders switched off,
     * or nobody left a basket with an address on it. "0 of 0 recovered" reads
     * as a feature that failed; null reads as one that has not run.
     *
     * @return array{reminded: int, recovered: int, revenue_paise: int, rate: float}|null
     */
    private static function recovered(Carbon $since): ?array
    {
        $reminded = Cart::where('reminders_sent', '>', 0)->where('last_reminded_at', '>=', $since);
        $count = (clone $reminded)->count();

        if ($count === 0) {
            return null;
        }

        $orderIds = (clone $reminded)->whereNotNull('recovered_order_id')->pluck('recovered_order_id');

        return [
            'reminded' => $count,
            'recovered' => $orderIds->count(),
            'revenue_paise' => $orderIds->isEmpty() ? 0 : (int) Order::paid()->whereIn('id', $orderIds)->sum('total_paise'),
            'rate' => round($orderIds->count() / $count, 4),
        ];
    }

    /**
     * Paid orders holding a digital line short of codes.
     *
     * One query, not `DigitalFulfilment::isOutstanding()` per order — that is
     * the right method for one order and is N queries for a dashboard.
     */
    private static function awaitingCodes(): int
    {
        return (int) DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.type', ProductType::Digital->value)
            ->whereNotNull('orders.paid_at')
            ->whereRaw('order_items.quantity > (
                select count(*) from digital_codes where digital_codes.order_item_id = order_items.id
            )')
            ->distinct()
            ->count('orders.id');
    }

    /**
     * Revenue and orders per day, zero-filled.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function series(Carbon $since, int $days): array
    {
        $rows = Order::paid()
            ->where('created_at', '>=', $since)
            ->selectRaw('date(created_at) as day, count(*) as orders, sum(total_paise) as revenue')
            ->groupBy('day')
            ->get()
            ->keyBy('day');

        $series = [];

        for ($i = 0; $i < $days; $i++) {
            $day = $since->copy()->addDays($i)->toDateString();
            $row = $rows->get($day);

            $series[] = [
                'day' => $day,
                'revenue_paise' => (int) ($row->revenue ?? 0),
                'orders' => (int) ($row->orders ?? 0),
            ];
        }

        return $series;
    }

    /** @return array<int, array<string, mixed>> */
    private static function recent(): array
    {
        return Order::query()
            ->latest('id')
            ->limit(6)
            ->get(['order_number', 'customer_name', 'status', 'total_paise', 'placed_at'])
            ->map(fn (Order $o) => [
                'order_number' => $o->order_number,
                'customer_name' => $o->customer_name,
                'status' => $o->status?->value,
                'status_label' => $o->status?->label(),
                'total_paise' => $o->total_paise,
                'placed_at' => $o->placed_at?->toIso8601String(),
            ])
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    private static function lowStock(): array
    {
        return StoreProduct::query()
            ->where('status', PublishStatus::Published)
            ->where('track_stock', true)
            ->whereDoesntHave('variations')
            ->where('stock', '<=', self::LOW_STOCK)
            ->orderBy('stock')
            ->orderBy('id')
            ->limit(6)
            ->get(['id', 'name', 'stock'])
            ->map(fn (StoreProduct $p) => [
                'id' => $p->id,
                'name' => $p->name,
                'stock' => $p->stock,
            ])
            ->all();
    }

    /**
     * Digital products with few codes left.
     *
     * The one figure here that predicts a problem instead of reporting one.
     * Running out is invisible everywhere else until somebody has already paid
     * and is waiting, which is the worst moment to discover it.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function codesRunningLow(): array
    {
        return StoreProduct::query()
            ->where('type', ProductType::Digital)
            ->where('status', PublishStatus::Published)
            ->withCount(['digitalCodes as available_codes' => fn ($q) => $q->where('status', DigitalCodeStatus::Available)])
            ->having('available_codes', '<=', self::LOW_STOCK)
            ->orderBy('available_codes')
            ->orderBy('id')
            ->limit(6)
            ->get(['id', 'name'])
            ->map(fn (StoreProduct $p) => [
                'id' => $p->id,
                'name' => $p->name,
                'available' => (int) $p->available_codes,
            ])
            ->all();
    }

    /**
     * The five products on the most wishlists (2026-09-25).
     *
     * Counted by list, not by line — a list holding the 24-port and the
     * 48-port of one switch is one person wanting it — and over every list,
     * guest or account, since both are somebody who would like to buy it.
     * All time rather than the window: a wish is standing demand, not an
     * event in a period. Empty rather than zeroes when nobody has saved
     * anything.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function mostWished(): array
    {
        return WishlistItem::query()
            ->join('store_products', 'store_products.id', '=', 'wishlist_items.store_product_id')
            ->selectRaw('store_products.id, store_products.name, count(distinct wishlist_items.wishlist_id) as wishes')
            ->groupBy('store_products.id', 'store_products.name')
            ->orderByDesc('wishes')
            ->orderBy('store_products.id')
            ->limit(5)
            ->toBase()
            ->get()
            ->map(fn (object $row) => [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
                'wishes' => (int) $row->wishes,
            ])
            ->all();
    }
}
