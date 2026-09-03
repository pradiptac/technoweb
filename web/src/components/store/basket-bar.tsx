import Link from "next/link";
import { IconBox } from "@/components/icons";
import { getCart } from "@/lib/cart";
import { formatPaise } from "@/lib/money";

/**
 * The shop's own chrome: what is in the basket, from anywhere in the shop.
 *
 * Not in the site header, deliberately. That row is already at its limit —
 * both flanking groups are `shrink-0` and the consultation button is a fixed
 * 150px that must not shrink, which is why the logo needed a width cap at
 * 320px. Adding a basket there would reopen a measured overflow problem on
 * every page of the site to serve three of them.
 *
 * Here instead, where it is a strip inside the shop — the same answer
 * `NewsletterNav` gives for the newsletter's six screens. A basket that can
 * only be reached from the confirmation of the thing just added is a screen
 * nothing links to.
 *
 * Rendered from the server on every request, so the count is never stale; a
 * cart is per-person and cannot be cached.
 */
export async function BasketBar() {
  const cart = await getCart();
  const count = cart?.item_count ?? 0;

  return (
    <div className="border-b border-line bg-surface-2">
      <div className="mx-auto flex w-[90%] max-w-[1920px] flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[13px]">
        <Link href="/store" className="font-semibold hover:underline">Store</Link>

        <span className="text-faint">All prices include 18% GST</span>

        {/*
          `data-basket-count` is for the audit, not for styling.

          `npm run audit` has to fill a basket before it can look at
          /checkout — that route redirects to /cart when the basket is empty,
          so without this the most important form on the site is unauditable.
          It used to sleep a flat 1500ms after pressing Add to basket and hope,
          which is a guess at a Server Action round trip and was too short under
          the load the audit itself creates: /checkout was skipped on every run.

          A server-rendered count is the honest signal that the action came
          back, so the attribute makes it findable without the probe depending
          on the wording inside.
        */}
        <Link
          href="/cart"
          data-basket-count={count}
          className="ml-auto flex items-center gap-2 font-medium hover:underline"
        >
          <span className="text-muted [&_svg]:size-4"><IconBox /></span>
          {count === 0 ? (
            <span>Basket is empty</span>
          ) : (
            <>
              <span>{count} {count === 1 ? "item" : "items"}</span>
              <span className="tabular-nums text-muted">{formatPaise(cart!.total_paise)}</span>
            </>
          )}
        </Link>
      </div>
    </div>
  );
}
