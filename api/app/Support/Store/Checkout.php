<?php

namespace App\Support\Store;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\Order;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Notifications\OrderPlaced;
use App\Support\Money;
use App\Support\Notifier;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Turning a basket into an order.
 *
 * The rule the brief states three times and this class exists to honour: **the
 * frontend is not the authority for anything that costs money.** Nothing that
 * arrives in the request is priced, totalled or discounted here — the basket is
 * re-read from the database, every line is re-priced from the product as it is
 * at this instant, and the total is worked out again. What the browser sends is
 * a name, an address and an intent.
 *
 * Stock is checked **inside the transaction, with the rows locked**, and that
 * is the whole of what stops two people buying the last switch. A check made
 * before the transaction is a check made against a number that may have changed
 * by the time the row is written, which is not a rare case at all — it is
 * exactly what happens when something is nearly sold out and therefore exactly
 * when it matters.
 */
class Checkout
{
    /**
     * @param  array<string, mixed>  $details  the validated customer details
     *
     * @throws ValidationException when the basket cannot be sold as it stands
     */
    public static function place(Cart $cart, array $details): Order
    {
        return DB::transaction(function () use ($cart, $details) {
            $cart->load(['items.product', 'items.variation']);

            if ($cart->items->isEmpty()) {
                throw ValidationException::withMessages([
                    'cart' => 'Your basket is empty.',
                ]);
            }

            /*
             * Locked, in a stable order.
             *
             * `lockForUpdate` on the products and variations this basket
             * touches, sorted by id: two baskets holding the same two products
             * in opposite orders would otherwise be a deadlock, which is the
             * classic way this goes wrong under exactly the load it is meant to
             * survive.
             */
            $productIds = $cart->items->pluck('store_product_id')->unique()->sort()->values();
            $variationIds = $cart->items->pluck('store_product_variation_id')->filter()->unique()->sort()->values();

            $products = StoreProduct::whereIn('id', $productIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $variations = $variationIds->isEmpty()
                ? collect()
                : StoreProductVariation::whereIn('id', $variationIds)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy('id');

            $lines = [];
            $subtotal = 0;
            $problems = [];

            foreach ($cart->items as $item) {
                $product = $products[$item->store_product_id] ?? null;
                $variation = $item->store_product_variation_id
                    ? ($variations[$item->store_product_variation_id] ?? null)
                    : null;

                if ($product === null || $product->status?->value !== 'published') {
                    $problems[] = 'Something in your basket is no longer on sale.';

                    continue;
                }

                if ($item->store_product_variation_id !== null && $variation === null) {
                    $problems[] = "An option you chose for “{$product->name}” is no longer available.";

                    continue;
                }

                if ($variation !== null && ! $variation->is_active) {
                    $problems[] = "“{$variation->name}” is no longer available.";

                    continue;
                }

                // Priced from the row that was just locked, never from the cart
                // and never from the request.
                $unit = (int) ($variation?->price_paise ?? $product->price_paise);

                if ($product->track_stock) {
                    $available = $variation !== null ? $variation->stock : $product->stock;

                    if ($available < $item->quantity) {
                        $problems[] = $available <= 0
                            ? "“{$product->name}” is out of stock."
                            : "Only {$available} of “{$product->name}” are available.";

                        continue;
                    }
                }

                $lines[] = [
                    'store_product_id' => $product->id,
                    'store_product_variation_id' => $variation?->id,
                    'name' => $product->name,
                    'variation_name' => $variation?->name,
                    'sku' => $variation?->sku ?? $product->sku,
                    'options' => $variation?->options,
                    'type' => $product->type?->value ?? 'physical',
                    'quantity' => $item->quantity,
                    'unit_price_paise' => $unit,
                    'line_total_paise' => $unit * $item->quantity,
                    'returnable' => (bool) $product->returnable,
                ];

                $subtotal += $unit * $item->quantity;
            }

            /*
             * Refused whole, never part-filled.
             *
             * Placing an order for what happened to still be in stock, and
             * telling somebody afterwards, means they paid for a basket they
             * did not assemble. The brief's own rule for the coupon and the
             * price applies here too: they see what is wrong and decide.
             */
            if ($problems !== []) {
                throw ValidationException::withMessages(['cart' => array_values(array_unique($problems))]);
            }

            /*
             * The coupon is validated **again**, here, against the subtotal
             * this transaction just worked out.
             *
             * Not because the basket did not check — because the basket checked
             * a moment ago, against a different subtotal, possibly before
             * somebody removed a line or the code expired. The brief's rule is
             * that the backend recalculates at every step, and this is the step
             * where the number becomes what somebody is charged.
             *
             * A code that has stopped being usable does not fail the order: it
             * is dropped and the order is placed at full price. Refusing here
             * would lose a basket over a discount, and the total on the screen
             * before this point was the discounted one — so the refusal is
             * carried back in the response for the checkout to say.
             */
            $coupon = filled($cart->coupon_code)
                ? Coupon::where('code', Coupon::normalise($cart->coupon_code))->lockForUpdate()->first()
                : null;

            $discount = 0;

            if ($coupon !== null && $coupon->refusalFor($subtotal, $details['email'] ?? null) === null) {
                $discount = $coupon->discountFor($subtotal);
            } else {
                $coupon = null;
            }

            $total = max(0, $subtotal - $discount);

            $order = Order::create([
                'customer_id' => $details['customer_id'] ?? null,
                'status' => OrderStatus::PendingPayment,
                'subtotal_paise' => $subtotal,
                'discount_paise' => $discount,
                'coupon_id' => $coupon?->id,
                // Copied, not joined: a coupon renamed or deleted afterwards
                // must not change what this order says was applied.
                'coupon_code' => $coupon?->code,
                'taxable_paise' => Money::taxable($total),
                'gst_paise' => Money::gst($total),
                'total_paise' => $total,
                'customer_name' => $details['name'],
                'customer_email' => $details['email'],
                'customer_phone' => $details['phone'] ?? null,
                'billing_address' => $details['billing_address'] ?? null,
                /*
                 * Null when nothing travels, rather than a copy of the billing
                 * address. A digital licence has no delivery address, and
                 * filling one in would put a courier label on something that
                 * never moves.
                 */
                'shipping_address' => self::shippingAddress($lines, $details),
                'gst_required' => (bool) ($details['gst_required'] ?? false),
                'gstin' => $details['gstin'] ?? null,
                'company_name' => $details['company_name'] ?? null,
                'placed_at' => now(),
            ]);

            foreach ($lines as $line) {
                $order->items()->create($line);
            }

            $order->history()->create([
                'to_status' => OrderStatus::PendingPayment->value,
                'note' => 'Order placed.',
            ]);

            /*
             * The usage is recorded here, at checkout, not at payment.
             *
             * A single-use code has to stop working the moment it is spent, and
             * the gap between placing an order and paying for it is exactly
             * where somebody would otherwise open a second tab and use it
             * again. The cost is that an abandoned order holds a use — which is
             * the safer direction, and is recoverable by hand.
             *
             * The unique index on `(coupon_id, order_id)` is what makes this
             * safe against a retried request rather than merely unlikely.
             */
            if ($coupon !== null) {
                $coupon->usages()->create([
                    'order_id' => $order->id,
                    'email' => $order->customer_email,
                    'discount_paise' => $discount,
                ]);
            }

            /*
             * The basket is emptied now rather than on payment.
             *
             * The order is the record from here on, and a basket that still
             * held its contents would offer to sell them again while the
             * payment page is open — which is how somebody ends up with two of
             * everything after one failed card.
             */
            $cart->items()->delete();

            $order->load('items');

            /*
             * The "we have your order, nothing is charged" email.
             *
             * Sent here rather than after payment because the link in it is
             * the *only* way back to an order somebody abandoned by closing
             * the payment tab — without it a lost tab is a lost order, and the
             * first the shop hears of it is a telephone call.
             *
             * Through `Notifier`, which logs and swallows: an order that is
             * already committed must still answer 201 when the mail server is
             * down. Telling somebody their order failed while it sits in the
             * database is how you get two of them.
             */
            Notifier::to($order->customer_email, new OrderPlaced($order));

            return $order;
        });
    }

    /**
     * Where it is going, or null when nothing is going anywhere.
     *
     * @param  array<int, array<string, mixed>>  $lines
     * @param  array<string, mixed>  $details
     * @return array<string, mixed>|null
     */
    private static function shippingAddress(array $lines, array $details): ?array
    {
        $shipped = collect($lines)->contains(fn (array $l) => $l['type'] === 'physical');

        if (! $shipped) {
            return null;
        }

        return $details['shipping_address'] ?? $details['billing_address'] ?? null;
    }

    /**
     * The account a paid order belongs to, created if there is not one.
     *
     * Guest checkout is a requirement and an account is created automatically on
     * payment — which raises a question the portal's own rules answer badly: a
     * customer registering through the front door is `pending` until a human
     * approves them. **Somebody who has paid is not waiting for approval.**
     * Having taken their money is a stronger statement than anything the
     * approval queue exists to establish, and making them wait to see their own
     * order would be absurd.
     *
     * An address that already has an account keeps whatever status it has. This
     * does not promote a rejected or suspended account, because that decision
     * was made by a person about a person and a purchase does not overturn it —
     * the order is still reachable by its own link either way.
     */
    public static function accountFor(Order $order): ?Customer
    {
        if ($order->customer_id !== null) {
            return $order->customer;
        }

        $existing = Customer::where('email', $order->customer_email)->first();

        if ($existing !== null) {
            $order->update(['customer_id' => $existing->id]);

            return $existing;
        }

        $customer = Customer::create([
            'name' => $order->customer_name,
            'email' => $order->customer_email,
            'phone' => $order->customer_phone,
            'company' => $order->company_name,
            // A password nobody knows: they sign in with a one-time code, which
            // is the default way in anyway. Inventing one and emailing it would
            // be a credential in an inbox for no reason.
            'password' => bin2hex(random_bytes(16)),
            'status' => CustomerStatus::Active,
        ]);

        $order->update(['customer_id' => $customer->id]);

        return $customer;
    }
}
