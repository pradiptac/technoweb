<?php

namespace App\Support\Store;

use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Coupon;
use App\Support\Money;

/**
 * What a cart adds up to, worked out on the server every single time.
 *
 * The brief states the rule and it is the only rule here that matters: **the
 * frontend is never the authority for a price, a discount, the GST or the
 * total.** Not on add, not at the checkout, not when the payment is created,
 * and not when it is verified. So nothing is stored on a cart line except what
 * was chosen and how many, and every figure below is derived from the product
 * as it is right now.
 *
 * GST is *extracted* rather than added, because displayed prices include it —
 * see `Money`. It is computed once on the payable total rather than per line
 * and summed: rounding each line and adding the results gives a GST figure that
 * does not match the GST of the total, and the invoice has to balance against
 * what was actually charged.
 */
class Basket
{
    /**
     * @return array{
     *     token: string,
     *     items: array<int, array<string, mixed>>,
     *     item_count: int,
     *     subtotal_paise: int,
     *     discount_paise: int,
     *     coupon_code: ?string,
     *     coupon_label: ?string,
     *     total_paise: int,
     *     taxable_paise: int,
     *     gst_paise: int,
     *     gst_rate: string,
     *     has_shippable: bool,
     *     problems: array<int, string>,
     * }
     */
    public static function summarise(Cart $cart, ?int $discountPaise = null): array
    {
        $cart->loadMissing(['items.product', 'items.variation']);

        $items = [];
        $subtotal = 0;
        $count = 0;
        $problems = [];
        $shippable = false;

        foreach ($cart->items as $item) {
            $line = self::line($item);

            if ($line === null) {
                continue;
            }

            $items[] = $line;
            $subtotal += $line['line_total_paise'];
            $count += $line['quantity'];

            if ($line['problem'] !== null) {
                $problems[] = $line['problem'];
            }

            if ($line['shipped']) {
                $shippable = true;
            }
        }

        /*
         * The coupon is re-read and re-applied on every summary.
         *
         * The cart stores the *code*, never the amount — an amount stored on
         * the basket goes stale the moment somebody adds a line, and stale in
         * the customer's favour is a discount the shop did not agree to. It
         * also means a coupon that expires while a basket sits open stops
         * applying, which is the honest behaviour.
         *
         * A code that has stopped being valid is dropped and **said**, not
         * silently ignored: somebody who typed a code and then sees the old
         * total with no explanation assumes the shop is broken.
         */
        $coupon = null;
        $discount = 0;

        if ($discountPaise !== null) {
            $discount = $discountPaise;
        } elseif (filled($cart->coupon_code)) {
            $coupon = Coupon::where('code', Coupon::normalise($cart->coupon_code))->first();

            $refusal = $coupon?->refusalFor($subtotal, $cart->customer?->email)
                ?? ($coupon === null ? 'That code is not recognised.' : null);

            if ($refusal !== null) {
                $problems[] = $refusal;
                $coupon = null;
            } else {
                $discount = $coupon->discountFor($subtotal);
            }
        }

        // Clamped rather than trusted, whichever way it arrived: a negative
        // total is a refund nobody authorised.
        $discount = max(0, min($discount, $subtotal));
        $total = $subtotal - $discount;

        return [
            'token' => $cart->token,
            'items' => $items,
            'item_count' => $count,
            'subtotal_paise' => $subtotal,
            'discount_paise' => $discount,
            'coupon_code' => $coupon?->code,
            'coupon_label' => $coupon?->label(),
            'total_paise' => $total,
            'taxable_paise' => Money::taxable($total),
            'gst_paise' => Money::gst($total),
            // Sent as a string so the shop states the rate it is actually
            // applying rather than hard-coding "18%" in a template.
            'gst_rate' => number_format(Money::GST_BASIS_POINTS / 100, 0).'%',
            'has_shippable' => $shippable,
            'problems' => $problems,
        ];
    }

    /**
     * One line, and whatever is wrong with it.
     *
     * A problem is reported rather than silently corrected. Quietly dropping a
     * line that has gone out of stock means somebody reaches the payment page
     * with a different basket from the one they built, and the first they know
     * of it is the total.
     *
     * @return array<string, mixed>|null
     */
    private static function line(CartItem $item): ?array
    {
        $product = $item->product;

        if ($product === null) {
            return null;
        }

        $unit = $item->unitPricePaise();
        $available = $item->availableQuantity();
        $variation = $item->variation;

        $problem = match (true) {
            $product->status?->value !== 'published' => "“{$product->name}” is no longer on sale.",
            $variation !== null && ! $variation->is_active => "“{$variation->name}” is no longer available.",
            $available !== null && $available <= 0 => "“{$product->name}” is out of stock.",
            $available !== null && $available < $item->quantity => "Only {$available} of “{$product->name}” are available.",
            default => null,
        };

        return [
            'id' => $item->id,
            'product_id' => $product->id,
            'variation_id' => $variation?->id,
            'name' => $product->name,
            'variation_name' => $variation?->name,
            'slug' => $product->slug,
            'sku' => $variation?->sku ?? $product->sku,
            'type' => $product->type?->value,
            'image_url' => filled($product->images) ? asset('storage/'.$product->images[0]) : null,
            'quantity' => $item->quantity,
            'unit_price_paise' => $unit,
            'line_total_paise' => $unit * $item->quantity,
            /*
             * Carried on the line rather than looked up later, because it is a
             * term of the sale and has to be visible in the cart — the brief
             * asks for it on the product page, in the cart and at the checkout,
             * which is to say everywhere before somebody pays.
             */
            'returnable' => (bool) $product->returnable,
            'shipped' => (bool) $product->type?->isShipped(),
            'problem' => $problem,
        ];
    }
}
