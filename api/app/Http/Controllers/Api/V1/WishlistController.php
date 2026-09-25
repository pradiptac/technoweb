<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PublishStatus;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\StoreProduct;
use App\Models\Wishlist;
use App\Models\WishlistItem;
use App\Support\Store\Basket;
use App\Support\Store\Wishlists;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The wishlist, addressed by `X-Wishlist-Token` for a guest and by the portal
 * bearer for an account (see `Wishlists` for which one a request reaches and
 * when two merge).
 *
 * **Every line is looked up inside the list the request reaches**, and that
 * is the whole of the authorisation — the basket's rule. A line in somebody
 * else's list is a 404, never a 403, because a 403 confirms it exists.
 *
 * Unlike `GET /cart`, a read here never writes: a visitor with no list gets
 * an empty summary and no row. A list is made by the first heart pressed.
 */
class WishlistController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => Wishlists::summarise(Wishlists::resolve($request))]);
    }

    public function addItem(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', Rule::exists('store_products', 'id')],
            'variation_id' => ['nullable', 'integer', Rule::exists('store_product_variations', 'id')],
        ]);

        $product = StoreProduct::with('variations')->findOrFail($data['product_id']);

        if ($product->status !== PublishStatus::Published) {
            return response()->json(['message' => 'That product is not on sale.'], 422);
        }

        $variation = null;

        if (filled($data['variation_id'] ?? null)) {
            $variation = $product->variations->firstWhere('id', $data['variation_id']);

            // Refused rather than ignored, the basket's reason: a variation of
            // another product would price this line from somebody else's row.
            if ($variation === null || ! $variation->is_active) {
                return response()->json(['message' => 'That option is not available.'], 422);
            }
        }

        $list = Wishlists::resolve($request, create: true);

        if ($list === null) {
            return response()->json(['message' => 'We could not open your wishlist.'], 422);
        }

        $already = $list->items()->where('store_product_id', $product->id)
            ->where('variation_key', $variation->id ?? 0)->exists();

        if (! $already && $list->items()->count() >= Wishlists::MAX_ITEMS) {
            return response()->json(['message' => 'Your wishlist is full. Remove something first.'], 422);
        }

        Wishlists::add($list, $product, $variation);

        return response()->json(['data' => Wishlists::summarise($list->fresh())], 201);
    }

    public function removeItem(Request $request, int $item): JsonResponse
    {
        [$list, $line] = $this->line($request, $item);

        $line->delete();
        $list->touch();

        return response()->json(['data' => Wishlists::summarise($list->fresh())]);
    }

    /**
     * Put a saved thing in the basket, and take it off the list.
     *
     * Checked the way `POST /cart/items` checks, because it *is* one: a draft
     * is not for sale, and a product with options cannot go in without one
     * chosen — that line answers 422 and stays on the list, and the page
     * sends somebody to choose. The basket is the one in `X-Cart-Token`, or a
     * new one whose token comes back for the Next server to keep.
     */
    public function moveToBasket(Request $request, int $item): JsonResponse
    {
        [$list, $line] = $this->line($request, $item);

        $product = StoreProduct::with('variations')->find($line->store_product_id);

        if ($product === null || $product->status !== PublishStatus::Published) {
            return response()->json(['message' => 'That product is no longer on sale.'], 422);
        }

        $variation = $line->store_product_variation_id !== null
            ? $product->variations->firstWhere('id', $line->store_product_variation_id)
            : null;

        if ($line->store_product_variation_id !== null && ($variation === null || ! $variation->is_active)) {
            return response()->json(['message' => 'That option is no longer available.'], 422);
        }

        if ($variation === null && $product->variations->where('is_active', true)->isNotEmpty()) {
            return response()->json(['message' => 'Choose an option before adding this to your basket.'], 422);
        }

        $token = $request->header('X-Cart-Token');
        $cart = Cart::forToken(is_string($token) ? $token : null);

        DB::transaction(function () use ($cart, $product, $variation, $line, $list) {
            $cartLine = $cart->items()->firstOrNew([
                'store_product_id' => $product->id,
                'store_product_variation_id' => $variation?->id,
            ]);

            // One, like a heart pressed into a basket — and never past the
            // basket's own ceiling on a line.
            $cartLine->quantity = min(99, ($cartLine->quantity ?? 0) + 1);
            $cartLine->save();
            $cart->touch();

            $line->delete();
            $list->touch();
        });

        return response()->json([
            'data' => Wishlists::summarise($list->fresh()),
            'cart' => Basket::summarise($cart->fresh()),
        ]);
    }

    /**
     * A guest's address for the two notices, and whether they are on at all.
     *
     * `email` is a guest's alone — an account's messages go to the account,
     * so sending one for an account list is a 422 that says so. Giving an
     * address, or switching alerts on, is an explicit request to be written
     * to and clears a stop link pressed earlier.
     */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['sometimes', 'nullable', 'email:rfc', 'max:190'],
            'alerts' => ['sometimes', 'boolean'],
        ]);

        $list = Wishlists::resolve($request);

        if ($list === null) {
            abort(404);
        }

        if (array_key_exists('email', $data)) {
            if ($list->customer_id !== null) {
                return response()->json([
                    'message' => 'Messages about this list go to your account’s address.',
                    'errors' => ['email' => ['Messages about this list go to your account’s address.']],
                ], 422);
            }

            $list->email = $data['email'];

            if (filled($data['email'])) {
                $list->alerts_off_at = null;
            }
        }

        if (array_key_exists('alerts', $data)) {
            $list->alerts_off_at = $data['alerts'] ? null : CarbonImmutable::now();
        }

        $list->save();

        return response()->json(['data' => Wishlists::summarise($list->fresh())]);
    }

    /**
     * The stop link in a back-in-stock or price-drop email.
     *
     * One sentence and a 200 for every token — used, unknown or real — so the
     * endpoint cannot be used to test which exist; the stock notice's cancel
     * link follows the same rule. It switches the list's emails off and
     * nothing else: not an unsubscribe from the newsletter, and not the list
     * itself, which is still there to be looked at.
     */
    public function stopAlerts(string $token): JsonResponse
    {
        if (strlen($token) === 64) {
            Wishlist::where('alerts_token', $token)->whereNull('alerts_off_at')->update(['alerts_off_at' => now()]);
        }

        return response()->json(['message' => 'Done. We will not email you about your wishlist again. Your list is still there.']);
    }

    /**
     * The list the request reaches and one line inside it, or a 404 — for a
     * visitor with no list, a line that does not exist and a line in somebody
     * else's list alike.
     *
     * @return array{Wishlist, WishlistItem}
     */
    private function line(Request $request, int $item): array
    {
        $list = Wishlists::resolve($request);

        if ($list === null) {
            abort(404);
        }

        /** @var WishlistItem $line */
        $line = $list->items()->whereKey($item)->firstOrFail();

        return [$list, $line];
    }
}
