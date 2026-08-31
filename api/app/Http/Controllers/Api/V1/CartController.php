<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\StoreProduct;
use App\Support\Store\Basket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
        $cart = Cart::forToken($this->token($request));

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

        $cart = Cart::forToken($this->token($request));
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

        $cart = Cart::forToken($this->token($request));

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
        $cart = Cart::forToken($this->token($request));

        $cart->items()->whereKey($item)->firstOrFail()->delete();
        $cart->touch();

        return response()->json(['data' => Basket::summarise($cart->fresh())]);
    }

    public function clear(Request $request): JsonResponse
    {
        $cart = Cart::forToken($this->token($request));

        $cart->items()->delete();
        $cart->touch();

        return response()->json(['data' => Basket::summarise($cart->fresh())]);
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
