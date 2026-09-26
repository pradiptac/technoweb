<?php

namespace App\Console\Commands;

use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\NewsletterSuppression;
use App\Models\Order;
use App\Models\ProductReview;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Notifications\ReviewRequested;
use App\Support\Messaging\QuietHours;
use App\Support\Notifier;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

/**
 * "How was it?" — ask a buyer for a review, once per order.
 *
 * Hourly. An order is due when it is **paid** (`Order::paid()`, the one
 * definition), not cancelled or refunded, has a customer account to review
 * with, has not been asked before, and has had its goods for
 * `store_review_request_days` (default 7): `dispatched_at` that long ago, or
 * `paid_at` when nothing on it ships. An order that ships and has not been
 * dispatched is not due, whatever its age — asking about a parcel still in
 * the warehouse is the one message worse than not asking.
 *
 * **Stamped whether or not anything is sent**, before the send: an order with
 * nothing left to review, an address on the suppression list and a send that
 * failed are all asked about once and never again. `Notifier` logs and
 * swallows a failure, so a dead mail server cannot turn this into an hourly
 * loop over the same orders — the rule the stock notices follow.
 *
 * **Only while `QuietHours::allows()`.** A review request is a promotional
 * message, not a transactional one; a run outside the window does nothing,
 * and the orders it would have asked about are still due at nine.
 */
class RequestReviews extends Command
{
    protected $signature = 'technoware:request-reviews {--limit=200 : The most orders one run will ask about}';

    protected $description = 'Email buyers a "How was it?" review request a few days after delivery';

    public function handle(): int
    {
        if (! filter_var(Setting::get('store_review_requests_enabled', true), FILTER_VALIDATE_BOOLEAN)) {
            $this->info('Review requests are switched off.');

            return self::SUCCESS;
        }

        if (! QuietHours::allows()) {
            $this->info('Outside the sending window; nothing asked.');

            return self::SUCCESS;
        }

        $days = max(1, (int) Setting::get('store_review_request_days', 7));
        $cutoff = now()->subDays($days);
        $asked = 0;

        foreach (self::due($cutoff)->with(['items', 'customer'])->limit(max(1, (int) $this->option('limit')))->get() as $order) {
            // The stamp first: whatever happens below, this order is done.
            $order->forceFill(['review_requested_at' => now()])->saveQuietly();

            $customer = $order->customer;

            if ($customer === null || NewsletterSuppression::has($customer->email)) {
                continue;
            }

            $products = self::owed($order);

            if ($products === []) {
                continue;
            }

            Notifier::to($customer->email, new ReviewRequested($order, $products));
            $asked++;
        }

        $this->info("Asked about {$asked} order(s).");

        return self::SUCCESS;
    }

    /** @return Builder<Order> */
    public static function due(\DateTimeInterface $cutoff): Builder
    {
        $shipped = array_map(
            fn (ProductType $t) => $t->value,
            array_values(array_filter(ProductType::cases(), fn (ProductType $t) => $t->isShipped())),
        );

        return Order::query()
            ->paid()
            ->whereNotIn('status', [OrderStatus::Cancelled, OrderStatus::Refunded])
            ->whereNull('review_requested_at')
            ->whereNotNull('customer_id')
            ->where(fn (Builder $q) => $q
                ->where('dispatched_at', '<=', $cutoff)
                ->orWhere(fn (Builder $w) => $w
                    ->whereNull('dispatched_at')
                    ->where('paid_at', '<=', $cutoff)
                    ->whereDoesntHave('items', fn (Builder $i) => $i->whereIn('type', $shipped))))
            ->orderBy('id');
    }

    /**
     * The order's products that are still on sale and that this customer has
     * not reviewed — each once, however many lines it was bought on.
     *
     * @return array<int, StoreProduct>
     */
    private static function owed(Order $order): array
    {
        $ids = $order->items->pluck('store_product_id')->filter()->unique()->values();

        if ($ids->isEmpty()) {
            return [];
        }

        $reviewed = ProductReview::query()
            ->where('customer_id', $order->customer_id)
            ->whereIn('store_product_id', $ids)
            ->pluck('store_product_id')
            ->all();

        return StoreProduct::query()
            ->whereIn('id', $ids->diff($reviewed))
            ->where('status', PublishStatus::Published)
            ->orderBy('name')
            ->get()
            ->all();
    }
}
