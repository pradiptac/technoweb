<?php

namespace App\Support\Store;

use App\Models\Customer;
use App\Models\NewsletterSuppression;
use App\Models\Setting;
use App\Models\Wishlist;
use App\Models\WishlistItem;
use App\Support\Messaging\MessageRecipient;

/**
 * What the two wishlist emails share: the names and links they print, and
 * the one answer to "may this list be written to right now".
 *
 * Links are built on `frontend_url`, because they are clicked from an inbox;
 * an account's list is the portal's Wishlist tab and a guest's is
 * `/store/wishlist` — which works only in the browser holding the list's
 * cookie, and that is said on the page rather than worked around. The stop
 * link carries `alerts_token`, never the list's own token.
 */
final class WishlistMail
{
    public static function productName(WishlistItem $item): string
    {
        $name = (string) $item->product?->name;

        return $item->variation !== null ? "{$name} — {$item->variation->name}" : $name;
    }

    public static function productUrl(WishlistItem $item): string
    {
        return self::base().'/store/products/'.$item->product?->slug;
    }

    public static function listUrl(WishlistItem $item): string
    {
        return self::base().($item->wishlist?->customer_id !== null ? '/portal/wishlist' : '/store/wishlist');
    }

    public static function stopUrl(WishlistItem $item): string
    {
        return self::base().'/store/wishlist/stop/'.$item->wishlist?->alerts_token;
    }

    /**
     * The address a notice for this list may go to now, or null.
     *
     * Null for a guest with no address, for a list whose stop link was
     * pressed, for an account that may not sign in, and for an address on
     * the newsletter's suppression list — that list is "do not mail this
     * person" whatever they signed up for, the rule `SendStockNotices` keeps.
     * A caller that gets null leaves the line unclaimed, so a lifted
     * suppression or an address given later is still owed its notice.
     */
    public static function address(Wishlist $list): ?string
    {
        $address = $list->alertAddress();

        return $address !== null && ! NewsletterSuppression::has($address) ? $address : null;
    }

    /** Who the other channels are asked to reach: the account, or nobody they could find. */
    public static function recipient(Wishlist $list): MessageRecipient
    {
        $customer = $list->customer;

        return $customer instanceof Customer ? MessageRecipient::customer($customer) : new MessageRecipient;
    }

    /** @return array<string, string> the always-present placeholders, beside each event's own */
    public static function baseVars(Wishlist $list): array
    {
        $name = (string) ($list->customer->name ?? '');

        return [
            'customer_name' => $name,
            'first_name' => (string) strtok($name, ' '),
            'site_name' => (string) (Setting::get('company_name') ?: config('app.name')),
        ];
    }

    /** The price-drop threshold, as a whole percentage between 1 and 90. Default 5. */
    public static function minimumDropPercent(): int
    {
        $value = (int) Setting::get('store_price_drop_min_percent', 5);

        return $value >= 1 && $value <= 90 ? $value : 5;
    }

    private static function base(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
