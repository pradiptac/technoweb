import Link from "next/link";
import { IconBox, IconCart } from "@/components/icons";
import { RemoveLineButton } from "@/components/store/remove-line-button";
import { getCart } from "@/lib/cart";
import { formatPaise } from "@/lib/money";
import type { CartSummary } from "@/types/api";

/**
 * The basket, as the shop's chrome shows it.
 *
 * There used to be a `BasketBar` above this — a full-width strip reading
 * "Store · All prices include 18% GST" with the basket at its far end, rendered
 * by the category and product layouts. It is gone: `StoreFilterBar` carries the
 * same `BasketIndicator` under each page's banner and adds the search box that
 * strip never had, so a shop with two different bars either side of a link
 * became a shop with one. The file keeps its name because the *indicator* is
 * what every call site imports.
 *
 * Not in the site header, deliberately, and that reasoning still stands. That
 * row is already at its measured limit — both flanking groups are `shrink-0`
 * and the consultation button is a fixed 150px that must not shrink, which is
 * why the logo needed a width cap at 320px. Putting a basket there would reopen
 * an overflow problem on every page of the site to serve three of them.
 */

/**
 * The basket itself: the badge, the count and the hover preview.
 *
 * Split out of the strip above because the shop's front page puts it at the
 * end of its own filter bar instead — one row of controls rather than a strip
 * of chrome sitting on top of a row of controls. Both places render this, so
 * the count, the badge, the preview and the audit hook cannot drift into two
 * versions that disagree.
 */
export async function BasketIndicator() {
  const cart = await getCart();
  const count = cart?.item_count ?? 0;

  return (
    <>
        {/*
          `group` lives on this wrapper rather than the link itself, because
          the hover panel below sits beside the link as a sibling, not inside
          it — item rows in that panel may one day want their own `<Link>`,
          and a nested `<a>` is invalid HTML the browser silently mangles.
          Same shape `site-header.tsx` uses for the mega menu: `group` on the
          `<li>`, the panel a sibling of the trigger it hovers off.
        */}
        <div className="group relative">
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
            <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-brand-on shadow-2 transition-colors group-hover:bg-brand-700">
              {/*
                The glow, and only while there is something in the basket.

                It is a *signal*, not decoration: a control that pulses on an
                empty basket is an animation that means nothing, and one that
                never stops is the kind of motion `prefers-reduced-motion`
                exists for — so it is gated on both.

                Its own element rather than the circle's `box-shadow`, because
                the circle already carries `shadow-2` and an animation on that
                property would replace it: the resting shadow would vanish for
                the length of every cycle. This span has no shadow of its own,
                so there is nothing to fight over.
              */}
              {count > 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full motion-safe:animate-[basket-pulse_2.4s_var(--ease-brand)_infinite]"
                />
              )}
              <IconCart className="relative size-5" />
              {count > 0 && (
                /*
                  `bg-err-fill` with white on it, and red in both schemes
                  deliberately: a cart count is the one badge people look for
                  without reading, and it is red everywhere they have ever
                  shopped. It used to be `bg-page`/`text-ink` — a white disc
                  with dark text, which separated cleanly from the brand circle
                  but read as a notification dot rather than a quantity.

                  `err-fill`, not `err`. That split exists for exactly this
                  case: `--color-err` is *coloured text on a panel*, so in dark
                  it inverts to a light pink and white on it is about 2.1:1.
                  The fill stays a real red in both schemes and is the token
                  measured to carry white text.

                  The `border-page` ring stays. The badge sits on the
                  brand-filled circle, and without a ring in the page's own
                  colour a red disc on a dark green one has no edge.
                */
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-page bg-err-fill text-[11px] font-bold text-white tabular-nums"
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
    </>
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
        <ul className="grid gap-3">
          {shown.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              {/*
                A thumbnail per line. People recognise what they put in a
                basket by its picture far faster than by a part number, and
                this list is read at a glance on the way to the checkout.

                A fixed 44px well, so a slow image cannot reflow a panel that
                is only on screen while a pointer is held still — the same
                reason every other image on this site sits in one.

                `object-contain` with padding, not `cover`: these are product
                shots on their own background, and cropping one to a square
                cuts the plug off the end of a cable.
              */}
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface p-1">
                {item.image_url
                  ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt=""
                      className="max-h-full w-auto object-contain"
                      loading="lazy"
                    />
                  )
                  : <span className="text-faint"><IconBox className="size-5" /></span>}
              </span>

              {/*
                `min-w-0` is what makes `truncate` work here at all: a flex
                item's automatic minimum size is its **min-content**, so
                without it one long unbreakable part number sets the column's
                floor and the name runs past the panel rather than ending in an
                ellipsis. The campaign block list had exactly this defect.
              */}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{item.name}</span>
                {item.variation_name && (
                  <span className="block truncate text-[12px] text-muted">{item.variation_name}</span>
                )}
                <span className="text-[12px] text-muted">
                  {item.quantity} &times; {formatPaise(item.unit_price_paise)}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1.5">
                <span className="tabular-nums text-muted">{formatPaise(item.line_total_paise)}</span>
                <RemoveLineButton id={item.id} name={item.name} />
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

        {/*
          Somewhere to go from here.

          The panel opens on hover over a link to /cart, so "view the basket"
          was already one click away — but the checkout was two, through a page
          nobody needed to read. These are `<Link>`s inside the panel rather
          than inside the trigger, which is why `group` sits on the wrapper: an
          anchor inside an anchor is invalid and the browser silently unnests
          it.
        */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href="/cart"
            className="grid h-9 place-items-center rounded-lg border border-line-strong bg-card text-[13px] font-semibold transition-colors hover:border-faint"
          >
            View basket
          </Link>
          <Link
            href="/checkout"
            className="grid h-9 place-items-center rounded-lg bg-brand-600 text-[13px] font-semibold text-brand-on transition-colors hover:bg-brand-700"
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
