<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Store\CheckoutRequest;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\StoreProduct;
use App\Support\Store\Basket;
use App\Support\Store\CartReminders;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * The basket, addressed by a token.
 *
 * **Every line here is scoped to the cart the token resolves to**, and that is
 * the whole of the authorisation. An endpoint taking a bare `{item}` would let
 * anybody edit anybody's basket by counting upwards — the same shape as the
 * bug `EnsureUserIsCustomer` exists for, one table lower. So the cart is
 * resolved first and the item is looked up *inside* it; a line belonging to
 * somebody else is a 404, not a 403, because a 403 confirms it exists.
 *
 * Nothing is priced by the caller. The request says what and how many; the
 * server says what it costs, every time. See `Basket`.
 */
class CartController extends Controller
{
    /** A basket nobody sits and fills for ever; a sane ceiling per line. */
    private const MAX_QUANTITY = 99;

    public function show(Request $request): JsonResponse
    {
        $cart = $this->cart($request);

        return response()->json(['data' => Basket::summarise($cart)]);
    }

    public function addItem(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', Rule::exists('store_products', 'id')],
            'variation_id' => ['nullable', 'integer', Rule::exists('store_product_variations', 'id')],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_QUANTITY],
        ]);

        $product = StoreProduct::with('variations')->findOrFail($data['product_id']);

        // A draft is not for sale, and the shop does not list it — but the
        // endpoint is public, so the check lives here rather than in the page.
        if ($product->status?->value !== 'published') {
            return response()->json(['message' => 'That product is not on sale.'], 422);
        }

        $variation = null;

        if (filled($data['variation_id'] ?? null)) {
            $variation = $product->variations->firstWhere('id', $data['variation_id']);

            // Refused rather than ignored: a variation belonging to another
            // product would otherwise price this line from somebody else's row.
            if ($variation === null) {
                return response()->json(['message' => 'That option does not belong to this product.'], 422);
            }

            if (! $variation->is_active) {
                return response()->json(['message' => 'That option is no longer available.'], 422);
            }
        }

        /*
         * A product with variations cannot be bought without choosing one.
         *
         * Falling back to the product would sell "a switch" where the shop has
         * only ever offered a 24-port and a 48-port, and somebody in the
         * warehouse then has to guess which.
         */
        if ($variation === null && $product->variations->where('is_active', true)->isNotEmpty()) {
            return response()->json(['message' => 'Choose an option before adding this to your basket.'], 422);
        }

        $cart = $this->cart($request);
        $quantity = (int) ($data['quantity'] ?? 1);

        $item = DB::transaction(function () use ($cart, $product, $variation, $quantity) {
            /*
             * Adding the same thing twice increments the line.
             *
             * `firstOrNew` inside the transaction, with a unique index behind
             * it: two tabs adding the same switch at once would otherwise write
             * two identical lines the buyer has to reconcile.
             */
            $item = $cart->items()->firstOrNew([
                'store_product_id' => $product->id,
                'store_product_variation_id' => $variation?->id,
            ]);

            $item->quantity = min(self::MAX_QUANTITY, ($item->quantity ?? 0) + $quantity);
            $item->save();

            // The cart's own timestamp is what the prune reads, and adding to
            // it is activity even when the line already existed.
            $cart->touch();

            return $item;
        });

        $item->setRelation('product', $product);
        $item->setRelation('variation', $variation);

        $available = $item->availableQuantity();

        /*
         * Stock is checked *after* the line is written, and the answer is a
         * warning rather than a refusal.
         *
         * Refusing would be defensible and is worse here: somebody adding three
         * when two are left wants the two. The line carries the problem, the
         * cart shows it, and the checkout refuses — which is the place where
         * refusing costs nothing, because that is the moment the stock is
         * actually committed.
         */
        return response()->json([
            'data' => Basket::summarise($cart->fresh()),
            'warning' => $available !== null && $available < $item->quantity
                ? "Only {$available} of these are available."
                : null,
        ], 201);
    }

    public function updateItem(Request $request, int $item): JsonResponse
    {
        $data = $request->validate([
            'quantity' => ['required', 'integer', 'min:0', 'max:'.self::MAX_QUANTITY],
        ]);

        $cart = $this->cart($request);

        // Scoped to this cart. A line somebody else owns is simply not found.
        $line = $cart->items()->whereKey($item)->firstOrFail();

        // Zero is how a quantity control removes a line, and it has to be:
        // otherwise the stepper stops at one and the only way out is a
        // different control somewhere else on the row.
        if ($data['quantity'] === 0) {
            $line->delete();
        } else {
            $line->update(['quantity' => $data['quantity']]);
        }

        $cart->touch();

        return response()->json(['data' => Basket::summarise($cart->fresh())]);
    }

    public function removeItem(Request $request, int $item): JsonResponse
    {
        $cart = $this->cart($request);

        $cart->items()->whereKey($item)->firstOrFail()->delete();
        $cart->touch();

        return response()->json(['data' => Basket::summarise($cart->fresh())]);
    }

    public function clear(Request $request): JsonResponse
    {
        $cart = $this->cart($request);

        $cart->items()->delete();
        $cart->touch();

        return response()->json(['data' => Basket::summarise($cart->fresh())]);
    }

    /**
     * Put a coupon on the basket.
     *
     * The **code** is stored, never the amount: the discount is recomputed on
     * every read, so adding a line, removing one, or the coupon expiring all
     * change the answer without anybody having to remember to recalculate.
     *
     * A code that cannot be used is refused **with the reason** rather than
     * stored and quietly ignored — "that code needs an order of ₹5,000 or more"
     * is something somebody can act on, where a total that did not change is
     * a shop that looks broken.
     */
    public function applyCoupon(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
        ]);

        $cart = $this->cart($request);
        $cart->loadMissing(['items.product', 'items.variation']);

        if ($cart->items->isEmpty()) {
            return response()->json(['message' => 'Add something to your basket first.'], 422);
        }

        $coupon = Coupon::where('code', Coupon::normalise($data['code']))->first();

        // A code that is off, not started or over is "not recognised" too: to
        // somebody typing guesses, the difference is a list of real codes.
        // A code that stops while it sits on a basket still says it expired —
        // that person already knew it. See `Coupon::isLive()`.
        if ($coupon === null || ! $coupon->isLive()) {
            return response()->json(['message' => 'That code is not recognised.'], 422);
        }

        // Priced from the basket as it is now, so the minimum-order check is
        // against a subtotal the server worked out rather than one supplied.
        $subtotal = Basket::summarise($cart)['subtotal_paise'];
        $refusal = $coupon->refusalFor($subtotal, $cart->customer?->email);

        if ($refusal !== null) {
            return response()->json(['message' => $refusal], 422);
        }

        $cart->update(['coupon_code' => $coupon->code]);

        return response()->json(['data' => Basket::summarise($cart->fresh())]);
    }

    public function removeCoupon(Request $request): JsonResponse
    {
        $cart = $this->cart($request);

        $cart->update(['coupon_code' => null]);

        return response()->json(['data' => Basket::summarise($cart->fresh())]);
    }

    /**
     * What the checkout has typed so far, saved on blur.
     *
     * The basket that is abandoned is the one that never became an order, so
     * the only way to remind anybody about it is to keep the address *before*
     * the order exists. The form says so on the line under the email field,
     * and `contact_consent_at` records that it was said — stamped only while
     * reminders are switched on, because that is the only time the line is
     * drawn.
     *
     * Both fields are optional and each is written only when sent: the form
     * saves after each field loses focus, and an email typed before the mobile
     * number must not be wiped by a request that carried only the number. A
     * blank value clears its field — somebody who deletes their address has
     * withdrawn it.
     *
     * The phone is held to the checkout's own rule, so a number that would be
     * refused at "Place order" is not stored a minute earlier.
     */
    public function contact(Request $request): JsonResponse
    {
        // Runs of spaces come from pasting out of a contacts app and mean
        // nothing — collapsed before the rule reads it, as the checkout does.
        if (is_string($request->input('phone'))) {
            $request->merge(['phone' => preg_replace('/\s+/', ' ', trim($request->input('phone')))]);
        }

        $data = $request->validate([
            'email' => ['sometimes', 'nullable', 'string', 'email:rfc', 'max:190'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:'.CheckoutRequest::MOBILE_PATTERN],
        ], [
            'phone.regex' => 'That does not look like a mobile number. Ten digits starting 6 to 9, with or without +91.',
        ]);

        $cart = $this->cart($request);

        if (array_key_exists('email', $data)) {
            $email = filled($data['email']) ? Str::lower(trim($data['email'])) : null;

            if ($email !== $cart->email) {
                $cart->email = $email;
                $cart->contact_consent_at = $email !== null && CartReminders::enabled() ? now() : null;
            } elseif ($email !== null && $cart->contact_consent_at === null && CartReminders::enabled()) {
                $cart->contact_consent_at = now();
            }
        }

        if (array_key_exists('phone', $data)) {
            $cart->phone = filled($data['phone']) ? $data['phone'] : null;
        }

        $cart->save();

        return response()->json(['data' => Basket::summarise($cart->fresh())]);
    }

    /**
     * Swap a reminder's restore token for the basket's own token.
     *
     * The link in the email carries `restore_token`, never the cart token:
     * the cart token is the basket's identity and lives in an httpOnly cookie,
     * and an email is forwarded, archived and scanned by link checkers. The
     * Next route handler that calls this sets the cookie from the answer and
     * redirects to the basket.
     *
     * A basket that has become an order is a 404 — there is nothing left in it
     * to restore, and handing its token back would put somebody's next
     * shopping into a row the dashboard already counts as recovered. So is an
     * unknown token, and both answer the same, since a difference would tell a
     * guesser which tokens once existed.
     *
     * Not `touch()`ed: a person clicking the link is the reminder working, not
     * the basket being edited, and the next edit on the page moves the clock
     * anyway.
     */
    public function restore(string $token): JsonResponse
    {
        $cart = Str::length($token) === 64
            ? Cart::where('restore_token', $token)->whereNull('recovered_order_id')->first()
            : null;

        if ($cart === null) {
            return response()->json(['message' => 'That basket is no longer available.'], 404);
        }

        return response()->json(['data' => ['token' => $cart->token]]);
    }

    /**
     * The basket this request addresses, claimed for the signed-in customer.
     *
     * The route is public, so `$request->user()` is always null here and would
     * read as working — the trap `CLAUDE.md` records for comments and the
     * chatbot. The guard is named, narrowed to a `Customer`, and the Next
     * server forwards the portal token on every basket call. Only a basket
     * nobody has claimed is stamped: one person's basket must not change
     * hands because somebody else signed in on the same browser.
     *
     * A staff member's "View as" session is not a customer shopping, so it
     * claims nothing — the basket in that browser is the staff member's, and
     * stamping it would send the customer reminders about it.
     */
    private function cart(Request $request): Cart
    {
        $cart = Cart::forToken($this->token($request));
        $customer = $request->user('sanctum');

        if ($customer instanceof Customer && $cart->customer_id === null && ! $customer->isImpersonated()) {
            $cart->customer_id = $customer->id;
            $cart->timestamps = false;
            $cart->save();
            $cart->timestamps = true;
            $cart->setRelation('customer', $customer);
        }

        return $cart;
    }

    /**
     * The token, from the header the frontend sends.
     *
     * A header rather than the body, so every verb reads it the same way —
     * and a query string as a fallback for nothing but readability in a
     * `curl` while developing. It is never a cookie *here*: the API is on a
     * different origin from the site, and the cookie lives with the Next
     * server, which forwards it.
     */
    private function token(Request $request): ?string
    {
        return $request->header('X-Cart-Token') ?: $request->query('token');
    }
}
