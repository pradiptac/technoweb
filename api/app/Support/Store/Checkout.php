<?php

namespace App\Support\Store;

use App\Enums\CustomerStatus;
use App\Enums\MessageEvent;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\WebhookEvent;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Notifications\OrderPlaced;
use App\Support\Address;
use App\Support\IndianStates;
use App\Support\Messaging\OrderMessages;
use App\Support\Money;
use App\Support\Notifier;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
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
        try {
            return self::placeInTransaction($cart, $details);
        } catch (DestinationChanged $changed) {
            /*
             * The address on the form is not the one delivery was quoted for.
             *
             * Saved **outside** the transaction that refused — a rollback would
             * take the save with it — and through the query builder, so the
             * idle clock the reminders read does not move. The refusal carries
             * the new figure: nobody confirms a total they did not see.
             */
            Cart::whereKey($cart->id)->toBase()->update(['ship_state' => $changed->stateCode]);

            throw ValidationException::withMessages(['shipping' => $changed->getMessage()]);
        }
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private static function placeInTransaction(Cart $cart, array $details): Order
    {
        return DB::transaction(function () use ($cart, $details) {
            $cart->load(['items.product', 'items.variation']);

            if ($cart->items->isEmpty()) {
                throw ValidationException::withMessages([
                    'cart' => 'Your basket is empty.',
                ]);
            }

            $method = self::method($cart, $details);

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
            $quoteLines = [];
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

                /*
                 * The gate. This is the moment stock is committed, under the
                 * row lock taken above, and the only moment where refusing
                 * costs nothing — which is why the basket only *warns* about a
                 * quantity and this refuses it.
                 *
                 * Skipped entirely for a back-ordered line: `allowsOversell()`
                 * is the shop saying it will get more, and the order is taken
                 * knowing the shelf is short. Read from the variation when
                 * there is one, because that is the shelf.
                 */
                if ($product->track_stock && ! $product->allowsOversell($variation)) {
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

                // Weighed from the rows just locked, like the price.
                $quoteLines[] = [
                    'shipped' => (bool) $product->type->isShipped(),
                    'quantity' => $item->quantity,
                    'weight_grams' => ShippingQuote::unitWeight($product, $variation),
                ];
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

            $goods = max(0, $subtotal - $discount);

            /*
             * Delivery, quoted again from the address the order is going to.
             *
             * Nothing the browser sent is a charge: the figure is worked out
             * here, from the locked rows' weights and the real address, and
             * added **before** the cash-on-delivery ceiling is judged — a
             * ceiling checked against the goods alone would let delivery push
             * a COD order over it. Coupons never touched it; `free_above` is
             * judged on the goods after the discount.
             */
            $quote = self::quoteDelivery($cart, $quoteLines, $goods, $details);

            $total = $goods + $quote->addPaise();

            self::guardCodCeiling($method, $total);

            /*
             * The method decides the state the order is born in.
             *
             * Cash on delivery is `confirmed`: the shop is going to pack it, so
             * leaving it at `pending_payment` would file it in the queue beside
             * baskets nobody is ever going to pay for. Everything else waits —
             * a gateway order until the callback settles it, a bank transfer or
             * a UPI payment until somebody reads a statement.
             */
            $status = $method->fulfilsBeforePayment()
                ? OrderStatus::Confirmed
                : OrderStatus::PendingPayment;

            $order = Order::create([
                'customer_id' => $details['customer_id'] ?? null,
                'status' => $status,
                'payment_method' => $method->value,
                'subtotal_paise' => $subtotal,
                'discount_paise' => $discount,
                // Snapshotted: the charge, the zone's name as it was, and the
                // weight it was worked out from. Nothing downstream re-quotes.
                'shipping_paise' => $quote->addPaise(),
                'shipping_zone' => $quote->ships ? $quote->zone : null,
                'shipping_weight_grams' => $quote->ships ? $quote->weightGrams : null,
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
                // The buyer's own words, optional and stored as typed. Never
                // confused with `notes()`, which is the desk's and staff-only.
                'customer_note' => $details['customer_note'] ?? null,
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
                'to_status' => $status->value,
                'note' => 'Order placed. Paying by '.$method->label().'.',
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

            /*
             * The basket is marked as having become this order.
             *
             * It is what stops the reminders — an emptied basket is not
             * selected anyway, but a stamp says why — and it is what the store
             * dashboard counts as *recovered*, though only for a basket that
             * had been reminded first: an order from a basket nobody was
             * emailed about is an ordinary order. Through the query builder,
             * so the idle clock the reminders read does not move.
             */
            Cart::whereKey($cart->id)->toBase()->update(['recovered_order_id' => $order->id]);

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
            // The checkout's WhatsApp/RCS boxes, then the same news on those channels.
            OrderMessages::optIn($order, (array) ($details['message_opt_in'] ?? []));
            OrderMessages::order(MessageEvent::OrderPlaced, $order);

            // `order.placed` here rather than on `Order::created`, which fires
            // before the lines exist. Same transaction; delivered after commit.
            Webhooks::emit(WebhookEvent::OrderPlaced, fn () => WebhookPayload::order($order));

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
    /**
     * The payment method, re-checked here rather than trusted from the form.
     *
     * Every rule in this method is one the browser also enforces, and that is
     * the point: the checkout re-reads and re-prices everything for the same
     * reason, because a form is a suggestion. A method switched off between the
     * page loading and the order being placed, or one posted by hand, has to be
     * refused where the order is actually made.
     *
     * The refusals are separate messages on purpose. "That payment method is not
     * available" for a switched-off one is true and useless; a basket refused
     * for holding a licence, or for being over the cash-on-delivery ceiling, is
     * something the customer can act on.
     */
    private static function method(Cart $cart, array $details): PaymentMethod
    {
        $asked = $details['payment_method'] ?? null;
        $method = PaymentMethod::tryFrom((string) $asked) ?? PaymentMethod::Gateway;

        /*
         * Availability is checked only for a method somebody **named**.
         *
         * An order that asked for nothing gets the gateway, and that path is not
         * refused here even when no gateway is configured — placing the order is
         * worth doing regardless, and the pay step is where a missing gateway
         * has always been reported. Refusing at the checkout instead would mean
         * a shop with no keys yet could take no orders at all, which is a worse
         * failure than an order that has to be settled by hand.
         *
         * What is refused is a method the shop has switched off, or one it never
         * offered: that is somebody's stale tab or a hand-posted body, and
         * honouring it would put an order into a state with no instructions
         * behind it.
         */
        if ($asked !== null && ! $method->isAvailable()) {
            throw ValidationException::withMessages([
                'payment_method' => 'That way of paying is not available. Choose another.',
            ]);
        }

        if (! $method->permitsDigital()) {
            $digital = $cart->items->contains(fn ($item) => $item->product?->type?->needsCode());

            if ($digital) {
                throw ValidationException::withMessages([
                    'payment_method' => 'Cash on delivery is not available for a licence or a download — there is nothing for the courier to hand over. Please choose another way to pay.',
                ]);
            }
        }

        return $method;
    }

    /**
     * The ceiling on cash on delivery.
     *
     * Separate from `method()` because it cannot run there: the basket has not
     * been priced yet at that point, and the figure this has to judge is the one
     * *this transaction* worked out under a row lock — not whatever the basket
     * said a moment ago. Same reasoning as re-validating the coupon against the
     * recomputed subtotal.
     *
     * Zero means no ceiling. Cash on delivery is unsecured credit and a refused
     * parcel costs the shop both ways, so where the line sits is the shop's
     * decision rather than this file's.
     */
    private static function guardCodCeiling(PaymentMethod $method, int $total): void
    {
        if ($method !== PaymentMethod::Cod) {
            return;
        }

        $ceiling = (int) (Setting::get('cod_max_paise') ?? 0);

        if ($ceiling > 0 && $total > $ceiling) {
            throw ValidationException::withMessages([
                'payment_method' => 'Cash on delivery is available up to '.Money::format($ceiling)
                    .'. This order comes to '.Money::format($total).', so please choose another way to pay.',
            ]);
        }
    }

    /**
     * What delivering this basket costs, from the address it is going to.
     *
     * In flat mode that is the setting and no address is read. In zones mode
     * the state of the block actually used for delivery — `shipping_address`
     * when the buyer ticked "deliver somewhere else", else the billing
     * `address` — must be a state we know (free text would let a misspelling
     * dodge a dear or undelivered zone), the zone must deliver there, and it
     * must be the destination the basket was last quoted for, or the buyer
     * would be confirming a total they never saw.
     *
     * @param  array<int, array{shipped: bool, quantity: int, weight_grams: int}>  $quoteLines
     * @param  array<string, mixed>  $details
     *
     * @throws ValidationException
     * @throws DestinationChanged
     */
    private static function quoteDelivery(Cart $cart, array $quoteLines, int $goods, array $details): ShippingQuote
    {
        $ships = collect($quoteLines)->contains('shipped', true);

        if (! $ships || ! Fulfilment::usesZones()) {
            return ShippingQuote::for($quoteLines, null, $goods);
        }

        $block = filled($details['shipping_address'] ?? null) ? 'shipping_address' : 'address';
        $address = $details['shipping_address'] ?? $details['billing_address'] ?? [];
        $code = IndianStates::code($address['state'] ?? null);

        if ($code === null) {
            throw ValidationException::withMessages([
                "{$block}.state" => 'Choose your state from the list so delivery can be worked out.',
            ]);
        }

        $quote = ShippingQuote::for($quoteLines, $code, $goods);

        if (! $quote->deliverable) {
            throw ValidationException::withMessages([
                "{$block}.state" => 'We do not deliver to '.IndianStates::name($code).' yet. Please use another delivery address, or contact us.',
            ]);
        }

        if ($cart->ship_state !== $code) {
            throw new DestinationChanged($code, 'Delivery to '.IndianStates::name($code).' is '
                .($quote->chargePaise === 0 ? 'free' : Money::format($quote->chargePaise))
                .', so your total is now '.Money::format($goods + $quote->addPaise())
                .'. Please check it and place your order again.');
        }

        return $quote;
    }

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
     *
     * **An existing account is joined only once its address is confirmed.**
     * The email on a guest order is whatever was typed, and a row with that
     * email may have been made by somebody who never proved they read that
     * inbox — `/auth/register` stores a caller-chosen password on an
     * unconfirmed account. Attaching here would hand that person the buyer's
     * order the moment the real owner confirmed the address. So an
     * unconfirmed account is passed over: the order stays reachable by its
     * link, and `claimOrders()` joins it when the address is confirmed, by
     * whoever can read the mailbox.
     */
    public static function accountFor(Order $order): ?Customer
    {
        if ($order->customer_id !== null) {
            $customer = $order->customer;

            // Placed by this customer, signed in: their own choice of address
            // is the one worth offering next time.
            if ($customer !== null) {
                self::rememberDetails($customer, $order, overwrite: true);
            }

            return $customer;
        }

        $existing = Customer::where('email', $order->customer_email)->first();

        if ($existing !== null) {
            if (! $existing->hasVerifiedEmail()) {
                return null;
            }

            $order->update(['customer_id' => $existing->id]);
            // A guest order typed with this address fills a blank and never
            // replaces what the account holder saved: anybody can type an
            // email at the checkout.
            self::rememberDetails($existing, $order, overwrite: false);

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
        self::rememberDetails($customer, $order, overwrite: true);

        return $customer;
    }

    /**
     * Join the paid guest orders placed under a newly confirmed address.
     *
     * The other half of `accountFor()` passing an unconfirmed account over:
     * a confirmation proves the mailbox, which is what the email on those
     * orders claims, so they are this account's now. Paid ones only — the
     * rule `accountFor()` runs at settlement, which never sees an order
     * nobody paid for.
     */
    public static function claimOrders(Customer $customer): void
    {
        Order::query()
            ->whereNull('customer_id')
            ->where('customer_email', $customer->email)
            ->paid()
            ->update(['customer_id' => $customer->id]);
    }

    /**
     * Keep the address and GSTIN for the next order.
     *
     * Only what the order actually carries, and — for an order the customer
     * placed signed in — over whatever was there: the *last* address used is
     * the one worth offering next time, and somebody who has moved should not
     * have to correct the form twice. A guest order matched by email only
     * fills a blank (`$overwrite` false), because the email is all it proves.
     * What must never move is the order's own copy, which is what an invoice
     * reads; these columns are a convenience for a future form and the
     * migration says so.
     *
     * `shipping_address` is written **only** when the order genuinely had a
     * different one. Copying the billing address into it would turn "same as
     * billing" into two addresses that merely happen to match today, and the
     * next checkout would then have the box unticked for no reason.
     *
     * Guarded whole: this runs inside settlement, after money has arrived. A
     * customer whose convenience columns did not update is a customer who
     * retypes an address; a settlement that threw here is a paid order that
     * did not finish. The same rule `StockLedger` follows.
     */
    private static function rememberDetails(Customer $customer, Order $order, bool $overwrite): void
    {
        try {
            // Blank means "this order said nothing about it", which must not
            // wipe a perfectly good value from a previous one — a digital-only
            // order carries no address at all.
            $keep = array_filter([
                'billing_address' => $order->billing_address,
                /*
                 * A GSTIN is a fact about a business rather than a decision
                 * taken per order, so unticking "I need GST details" once is
                 * not a statement that the business no longer has one.
                 */
                'gstin' => $order->gstin,
            ], fn ($value) => filled($value));

            /*
             * The delivery address is the exception, and it is written even
             * when it is null.
             *
             * It records an *answer* — was this order delivered somewhere other
             * than where it was billed — and blank is one of the two answers.
             * Filtering it out with the rest was the first cut, and it meant a
             * separate address could be stored and never cleared: order to a
             * site once, order to the office ever after, and every later
             * checkout still opened with "Deliver to a different address"
             * ticked and an address from two orders ago in it.
             *
             * Only for an order that had an address at all, or a licence
             * bought afterwards would clear one that is still current.
             */
            if (filled($order->billing_address)) {
                /*
                 * `Address::same`, never `===`. Both sides come off the same
                 * in-memory order today, so `===` happened to work — and it is
                 * one refresh away from not, because MySQL reorders JSON object
                 * keys and an address read back from the database no longer
                 * matches one built from a form. The failure would be silent
                 * and in the wrong direction: a duplicate delivery address
                 * stored for every customer who does not have one.
                 */
                $keep['shipping_address'] = Address::same($order->shipping_address, $order->billing_address)
                    ? null
                    : $order->shipping_address;
            }

            /*
             * Only over a blank, unless this customer placed the order.
             *
             * A guest order is matched to an account by the email typed into
             * the form, which anybody can type. Letting it replace what the
             * account holder saved would let a stranger rewrite the address
             * their next checkout opens with — so it fills what is empty, and
             * the billing and delivery pair move together or not at all.
             */
            if (! $overwrite) {
                if (filled($customer->billing_address)) {
                    unset($keep['billing_address'], $keep['shipping_address']);
                }

                if (filled($customer->gstin)) {
                    unset($keep['gstin']);
                }
            }

            $customer->forceFill($keep)->save();
        } catch (\Throwable $e) {
            logger()->warning('Could not keep checkout details on the account', [
                'customer_id' => $customer->id,
                'order' => $order->order_number,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
