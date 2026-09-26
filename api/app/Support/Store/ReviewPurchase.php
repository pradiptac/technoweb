<?php

namespace App\Support\Store;

use App\Models\Customer;
use App\Models\OrderItem;
use App\Models\StoreProduct;

/**
 * Whether a reviewer bought what they are reviewing — what makes a review
 * **Verified**.
 *
 * A line for this product on one of the customer's orders that
 * `Order::paid()` counts: the module's one definition of paid, keyed on
 * `paid_at`, so a cash-on-delivery order is verified once the cash is banked
 * and not the moment it was placed. Refunded orders are included, the way
 * `paid()` includes them — the buyer had the thing in their hands, which is
 * what a review is about.
 *
 * The newest such line wins, because it is the variant somebody most
 * recently had experience of.
 */
final class ReviewPurchase
{
    public static function for(Customer $customer, StoreProduct $product): ?OrderItem
    {
        return OrderItem::query()
            ->where('store_product_id', $product->id)
            ->whereHas('order', fn ($q) => $q->paid()->where('customer_id', $customer->id))
            ->orderByDesc('id')
            ->first();
    }

    /**
     * "Black / XL", from the line's own snapshot.
     *
     * The variation's name as it was sold when there is one, the chosen
     * options joined when there is not, and null for a product that came in
     * one shape — never read off the live variation, which the shop may have
     * renamed since.
     */
    public static function variantLabel(OrderItem $line): ?string
    {
        if (filled($line->variation_name)) {
            return mb_substr((string) $line->variation_name, 0, 190);
        }

        $options = collect($line->options ?? [])->filter(fn ($v) => filled($v))->values();

        return $options->isEmpty() ? null : mb_substr($options->implode(' / '), 0, 190);
    }
}
