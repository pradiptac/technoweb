<?php

namespace App\Support\Store;

use App\Enums\PublishStatus;
use App\Models\Customer;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Models\Wishlist;
use App\Models\WishlistItem;
use App\Support\MediaMeta;
use App\Support\MediaUrl;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Which wishlist a request reaches, and the one place two of them merge.
 *
 * ## The rules
 *
 * - **A token reaches a guest list and nothing else.** An account's list is
 *   addressed by the account; a cookie left on a shared computer after the
 *   customer signed out must not hand the next person their list. So the
 *   lookup by token is scoped to `customer_id IS NULL`, and once a list
 *   belongs to somebody the summary sends no token back — the Next server
 *   reads that as "forget the cookie".
 * - **Signing in merges.** A guest's list is folded into the account's on the
 *   first request that carries both (and at `/auth/login` and
 *   `/auth/verify-code` when the Next server forwards the token). The guest
 *   row is deleted afterwards; a line both lists hold keeps the account's
 *   row, whose `price_at_save` is the older and so the fairer measure of a
 *   drop.
 * - **A staff member's "View as" never merges.** That token is the customer's
 *   account in a staff member's browser, and the guest cookie beside it is
 *   the *staff member's* shopping — folding it in would put somebody else's
 *   list into a customer's account.
 * - **Nothing here fails a sign-in.** The merge is guarded the `Notifier`
 *   way: a failure is reported and the login answers as it would have.
 */
final class Wishlists
{
    /** A list is a list of wishes, not an inventory; a ceiling keeps a public endpoint from filling a table. */
    public const MAX_ITEMS = 200;

    /** The token the request carries, from the header the Next server forwards. */
    public static function token(Request $request): ?string
    {
        $token = $request->header('X-Wishlist-Token');

        return is_string($token) && Str::length($token) === 64 ? $token : null;
    }

    /**
     * The signed-in customer, read from the guard by name — the route is
     * public, so `$request->user()` is always null there and reads as working.
     * Only an account that may sign in counts; a staff token is not a
     * customer at all.
     */
    public static function customer(Request $request): ?Customer
    {
        $user = $request->user('sanctum');

        return $user instanceof Customer && $user->status->canSignIn() ? $user : null;
    }

    /**
     * The list this request reaches, merging a guest's into the account's
     * when both are in hand. With `$create` a missing list is made — the first
     * heart pressed — and without it a visitor with nothing gets null, so a
     * crawler reading the shop never mints a row.
     */
    public static function resolve(Request $request, bool $create = false): ?Wishlist
    {
        $customer = self::customer($request);
        $token = self::token($request);

        if ($customer !== null) {
            if ($token !== null && ! $customer->isImpersonated()) {
                self::claim($customer, $token);
            }

            $list = Wishlist::where('customer_id', $customer->id)->first();

            if ($list === null && $create) {
                $list = self::createFor($customer);
            }

            return $list;
        }

        $list = $token !== null ? Wishlist::guest()->where('token', $token)->first() : null;

        return $list ?? ($create ? Wishlist::create([]) : null);
    }

    /**
     * Fold the guest list behind `$token` into the customer's, once.
     *
     * Called from the sign-in endpoints and from `resolve()`. A token that
     * reaches nothing — already merged, pruned, invented — is a no-op; a
     * guest list with no account list to join simply becomes the account's.
     */
    public static function claim(Customer $customer, ?string $token): void
    {
        if ($token === null || Str::length($token) !== 64) {
            return;
        }

        try {
            DB::transaction(function () use ($customer, $token) {
                $guest = Wishlist::guest()->where('token', $token)->lockForUpdate()->first();

                if ($guest === null) {
                    return;
                }

                $account = Wishlist::where('customer_id', $customer->id)->lockForUpdate()->first();

                if ($account === null) {
                    // The guest's list becomes the account's. Its email goes:
                    // the account's own address is where its messages go now.
                    $guest->forceFill(['customer_id' => $customer->id, 'email' => null, 'token' => Wishlist::newToken()])->save();

                    return;
                }

                $keys = $account->items()->get(['store_product_id', 'variation_key'])
                    ->map(fn (WishlistItem $i) => $i->store_product_id.':'.$i->variation_key)
                    ->all();

                foreach ($guest->items()->get() as $item) {
                    if (in_array($item->store_product_id.':'.$item->variation_key, $keys, true)) {
                        continue;
                    }

                    $item->forceFill(['wishlist_id' => $account->id])->save();
                }

                $guest->delete();
                $account->touch();
            });
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * Save something, idempotently. A second press on a heart that is already
     * full is the same line, not a second one — the unique index is the
     * guard, and a race that loses to it reads the winner back.
     */
    public static function add(Wishlist $list, StoreProduct $product, ?StoreProductVariation $variation): WishlistItem
    {
        $existing = self::find($list, $product->id, $variation?->id);

        if ($existing !== null) {
            return $existing;
        }

        if ($variation !== null) {
            $variation->setRelation('product', $product);
        }

        $price = (int) ($variation->price_paise ?? $product->price_paise);
        $buyable = $variation !== null ? $variation->inStock() : $product->inStock();

        try {
            $item = $list->items()->create([
                'store_product_id' => $product->id,
                'store_product_variation_id' => $variation?->id,
                'price_at_save' => $price,
                // Saved while the shelf is empty: armed at once, so the first
                // arrival tells them.
                'awaiting_stock_at' => $buyable ? null : now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            $item = self::find($list, $product->id, $variation?->id);

            if ($item === null) {
                throw new \RuntimeException('A wishlist line vanished between its insert and its read.');
            }
        }

        $list->touch();

        return $item;
    }

    /**
     * What the list holds, priced now.
     *
     * `token` only for a guest list — see the class note — and `email` only
     * for a guest, since an account's messages go to the account.
     *
     * @return array<string, mixed>
     */
    public static function summarise(?Wishlist $list): array
    {
        if ($list === null) {
            return [
                'token' => null,
                'account' => false,
                'items' => [],
                'item_count' => 0,
                'email' => null,
                'alerts' => false,
            ];
        }

        $list->loadMissing(['items.product.variations', 'items.variation', 'customer']);

        $items = $list->items
            ->filter(fn (WishlistItem $item) => $item->product !== null && $item->product->status === PublishStatus::Published)
            ->map(fn (WishlistItem $item) => self::line($item))
            ->values()
            ->all();

        $account = $list->customer_id !== null;

        return [
            'token' => $account ? null : $list->token,
            'account' => $account,
            'items' => $items,
            'item_count' => count($items),
            'email' => $account ? null : $list->email,
            // Whether a back-in-stock or price-drop email can reach anybody:
            // false for a guest with no address, and for a list whose stop
            // link was pressed. The page says which.
            'alerts' => $list->alertAddress() !== null,
            'alerts_off' => $list->alerts_off_at !== null,
        ];
    }

    /** @return array<string, mixed> */
    private static function line(WishlistItem $item): array
    {
        /** @var StoreProduct $product */
        $product = $item->product;
        $variation = $item->variation;
        $now = $item->currentPricePaise();
        $image = is_array($product->images) && filled($product->images) ? (string) $product->images[0] : null;

        return [
            'id' => $item->id,
            'product_id' => $product->id,
            'variation_id' => $variation?->id,
            'name' => $product->name,
            'variation_name' => $variation?->name,
            'slug' => $product->slug,
            'image_url' => $image !== null ? MediaUrl::for($image) : null,
            'image_alt' => $image !== null ? MediaMeta::alt($image) : null,
            'price_paise' => $now,
            'price_at_save_paise' => $item->price_at_save,
            // A saving since it was saved, when there is one — the figure the
            // list is for. Null rather than zero or negative: a rise is not a
            // saving, and saying "0% down" is noise.
            'saving_paise' => $now < $item->price_at_save ? $item->price_at_save - $now : null,
            'in_stock' => $item->buyable(),
            // A product-level line on a product with options cannot go
            // straight into a basket — somebody has to choose one.
            'needs_choice' => $variation === null && $product->variations->where('is_active', true)->isNotEmpty(),
            'added_at' => $item->created_at?->toIso8601String(),
        ];
    }

    private static function find(Wishlist $list, int $productId, ?int $variationId): ?WishlistItem
    {
        return WishlistItem::query()
            ->where('wishlist_id', $list->id)
            ->where('store_product_id', $productId)
            ->where('variation_key', $variationId ?? 0)
            ->first();
    }

    /** The customer's list, made on first use; a race with a second tab reads the winner back. */
    private static function createFor(Customer $customer): Wishlist
    {
        try {
            return Wishlist::create(['customer_id' => $customer->id]);
        } catch (UniqueConstraintViolationException) {
            return Wishlist::where('customer_id', $customer->id)->firstOrFail();
        }
    }
}
