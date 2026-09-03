import Link from "next/link";
import { IconBox } from "@/components/icons";
import { getCart } from "@/lib/cart";
import { formatPaise } from "@/lib/money";
import type { CartSummary } from "@/types/api";

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
      <div className="mx-auto flex w-[90%] max-w-[1920px] flex-wrap items-center gap-x-4 gap-y-1.5 py-3 text-[14.5px]">
        <Link href="/store" className="font-semibold hover:underline">Store</Link>

        <span className="text-faint">All prices include 18% GST</span>

        {/*
          `group` lives on this wrapper rather than the link itself, because
          the hover panel below sits beside the link as a sibling, not inside
          it — item rows in that panel may one day want their own `<Link>`,
          and a nested `<a>` is invalid HTML the browser silently mangles.
          Same shape `site-header.tsx` uses for the mega menu: `group` on the
          `<li>`, the panel a sibling of the trigger it hovers off.
        */}
        <div className="group relative ml-auto">
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
            className="flex items-center gap-3 text-[15px] font-semibold hover:underline"
          >
            {/*
              A solid brand-filled badge, not the muted tint `IconTile` gives
              an identity icon — that treatment is deliberately quiet so a
              whole grid of them stays calm, and this is the opposite kind of
              control: one, always visible, the single thing on this page
              whose entire job is being pressed. Matches the fill `Button`'s
              primary variant already uses, so it reads as the same kind of
              "press me" as every other call to action on the site rather
              than a new colour language invented for one control.

              The count rides as a small badge in the corner instead of only
              living in the text beside it — the recognisable shape a basket
              icon takes everywhere else, and the one glance that answers "is
              there anything in it" from across the page rather than up close.
            */}
            <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-2 transition-colors group-hover:bg-brand-700">
              <IconBox className="size-5" />
              {count > 0 && (
                /*
                  `bg-page`/`text-ink`, not `bg-card`/`text-brand-ink`.

                  The badge sits *on* the brand-filled circle, so its own
                  background has to separate from that fill rather than
                  merely from the page — and in the darker themes (including
                  plain dark mode) `--color-card` lands close enough to the
                  circle's own dark-scheme fill that the badge nearly
                  vanished into the icon behind it. `page`/`ink` is this
                  site's one guaranteed-opposite pair — it is the whole
                  page's own canvas and text, so it cannot land near an
                  accent colour the way a *surface* token can.
                */
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-page bg-page text-[11px] font-bold text-ink tabular-nums"
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </span>
            {count === 0 ? (
              <span>Basket is empty</span>
            ) : (
              <span className="tabular-nums">{formatPaise(cart!.total_paise)}</span>
            )}
          </Link>

          {count > 0 && <BasketPreview cart={cart!} />}
        </div>
      </div>
    </div>
  );
}

/**
 * What is in the basket, on hover — short details rather than the full cart
 * page, which is a click away for anyone who wants to change something.
 *
 * CSS-only, the same mechanism the mega menu already uses:
 * `group-hover`/`group-focus-within` on an ancestor, no JavaScript, no
 * hydration. On touch there is no hover to trigger it, which is the right
 * outcome here too — the icon still opens `/cart` on a tap.
 */
function BasketPreview({ cart }: { cart: CartSummary }) {
  const shown = cart.items.slice(0, 5);
  const overflow = cart.items.length - shown.length;

  return (
    <div
      className={[
        "invisible absolute right-0 top-full z-20 w-80 max-w-[calc(100vw-2.5rem)] pt-2 opacity-0",
        "transition-[opacity,transform] duration-150 ease-brand",
        "translate-y-1 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100",
        "group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100",
        // Reduced motion still needs the panel to appear, just without the slide.
        "motion-reduce:transition-none",
      ].join(" ")}
    >
      <div className="overflow-hidden rounded-xl border border-line-strong bg-card p-3 text-[13px] shadow-2">
        <ul className="grid gap-2.5">
          {shown.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{item.name}</span>
                {item.variation_name && (
                  <span className="block truncate text-[12px] text-muted">{item.variation_name}</span>
                )}
                <span className="text-[12px] text-muted">Qty {item.quantity}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {formatPaise(item.line_total_paise)}
              </span>
            </li>
          ))}
        </ul>

        {overflow > 0 && (
          <p className="mt-2.5 text-[12px] text-faint">
            and {overflow} more {overflow === 1 ? "line" : "lines"}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 font-semibold text-ink">
          <span>Total</span>
          <span className="tabular-nums">{formatPaise(cart.total_paise)}</span>
        </div>
      </div>
    </div>
  );
}
