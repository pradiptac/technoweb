"use client";

import Link from "next/link";
import { IconCart } from "@/components/icons";
import { useQuickAdd } from "@/components/store/quick-add";
import type { StoreProduct } from "@/types/api";

/**
 * The add trigger for `CompactProductCard`, overlaid on the image's corner and
 * sharing `QuickAdd`'s action-wiring via `useQuickAdd`. A separate
 * client-component file, the way `QuickAdd`/`QuickView` already sit apart from
 * the server-rendered card that uses them — the hook this calls needs the
 * client boundary, and the card around it does not.
 *
 * **A cart glyph, not the word "ADD".** It sits on a photograph in a grid of
 * dense cards, where a word is a second thing to read on a tile whose job is to
 * be scanned; the glyph is the one control on a shop card that needs no
 * reading anywhere. The colour is unchanged — `brand-ink`, the token that
 * exists because a fill and coloured text want opposite values in dark, so the
 * mark stays the theme's own green in both schemes and follows a theme change
 * with nothing here to update.
 *
 * **An icon-only button needs a name.** `aria-label` carries the product, not
 * just the verb: this renders once per card, so twenty buttons all announcing
 * "Add to basket" is a list nobody can navigate. It is the same shape
 * `QuickView`'s trigger already uses.
 */
const PILL =
  "grid size-9 place-items-center rounded-full border border-brand-200 bg-card text-brand-ink shadow-1 " +
  "transition-colors duration-200 hover:bg-brand-50";

export function CompactAdd({ product }: { product: StoreProduct }) {
  const { formAction, pending, hasVariations } = useQuickAdd(product);

  if (hasVariations) {
    return (
      /*
        A plain `Link`, not `ButtonLink`: that primitive brings its own padding,
        height and text sizing, all of which were being overridden to nothing
        here — and now that the control is a fixed square there is none of it
        left to keep.

        The glyph is the same as the add button's, which is deliberate rather
        than lazy: from the reader's side both mean "start buying this", and the
        difference — that this one has options to pick first — is a fact about
        the product rather than about the control. The label says so for anyone
        who cannot see the difference on arrival.
      */
      <Link
        href={`/store/products/${product.slug}`}
        aria-label={`Choose options for ${product.name}`}
        className={`absolute bottom-2 right-2 ${PILL}`}
      >
        <IconCart className="size-[18px]" />
      </Link>
    );
  }

  /*
    Out of stock keeps its words.

    Everything else here is a glyph because "add to basket" is the one thing a
    shop card never has to spell out. "Sold out" is the opposite: it is the
    reason the control does nothing, and a dimmed cart says only that something
    is unavailable without saying why — on a card that otherwise looks exactly
    like the eleven around it. The compact card has no stock badge of its own,
    unlike `StoreProductCard`, so this is the only place it can be said.
  */
  if (!product.in_stock) {
    return (
      <span className="absolute bottom-2 right-2 rounded-full border border-line-strong bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[.03em] text-muted shadow-1">
        Sold out
      </span>
    );
  }

  return (
    <form action={formAction} className="absolute bottom-2 right-2">
      <input type="hidden" name="product_id" value={product.id} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Add ${product.name} to basket`}
        /*
          `aria-busy` rather than swapping the glyph for an ellipsis. The button
          is already disabled while the action is in flight, so the ellipsis was
          decoration that also removed the only mark saying what the control
          does — and it changed the accessible name mid-press, which a screen
          reader reads out as a different button appearing.
        */
        aria-busy={pending}
        className={`${PILL} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <IconCart className="size-[18px]" />
      </button>
    </form>
  );
}
