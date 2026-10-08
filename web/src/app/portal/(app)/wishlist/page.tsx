import { WishlistList } from "@/components/store/wishlist-list";
import { WishlistAlertsToggle } from "@/components/store/wishlist-alerts";
import { ErrorState } from "@/components/ui/empty";
import { getWishlist } from "@/lib/wishlist";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { VisibleWishlist } from "@/components/store/wishlist-actions";

export const metadata = buildMetadata({ title: "Your wishlist", path: "/portal/wishlist", seo: noIndex });

/**
 * The account's wishlist — the same list the shop's `/store/wishlist` shows a
 * signed-in customer, drawn by the same component. Reading it forwards the
 * portal session *and* any guest list this browser still holds, so a list
 * saved before signing in joins this one the first time the tab is opened
 * (the API merges; see `App\Support\Store\Wishlists`).
 *
 * The one control of its own is the emails switch, because the account's
 * address is where they go and the portal is where an account is managed.
 */
export default async function PortalWishlistPage() {
  const found = await getWishlist();

  if (!found) {
    return (
      <ErrorState title="We could not load your wishlist">
        Try again shortly. Nothing on it has been lost.
      </ErrorState>
    );
  }

  const { token: _token, ...list } = found;
  void _token;
  const visible: VisibleWishlist = list;

  return (
    <>
      <h2 className="display-3 mb-1">Your wishlist</h2>
      <p className="measure mb-6 text-14 text-muted">
        Things you have saved in the shop, at today&apos;s prices. We email you once when something here
        is back in stock or its price comes down — never between 9pm and 9am.
      </p>

      <WishlistList initial={visible} />

      {visible.items.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="mb-3 text-13-5 text-muted">
            {visible.alerts_off
              ? "Emails about this list are off."
              : "Emails about this list go to your account's address."}
          </p>
          <WishlistAlertsToggle on={Boolean(visible.alerts_off)} />
        </div>
      )}
    </>
  );
}
