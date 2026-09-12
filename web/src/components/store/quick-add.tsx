"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { IconCart } from "@/components/icons";
import { addToCartAction, type CartActionState } from "@/app/(marketing)/store/actions";
import type { StoreProduct } from "@/types/api";

const initial: CartActionState = {};

/**
 * The one place the variation/no-variation branch lives for a *listing*
 * add-to-cart control — shared by `QuickAdd` (the card footer and the
 * quick-view modal) and the category grid's compact pill button, so the two
 * cannot quietly drift into different rules about when an inline add is even
 * possible.
 *
 * Lighter than `AddToBasket` deliberately: no quantity stepper, no `Alert`.
 * A grid tile has no room for either, and the feedback that matters here is
 * the `BasketBar` count updating, which `addToCartAction`'s own
 * `revalidatePath("/store", "layout")` already drives.
 */
export function useQuickAdd(product: StoreProduct) {
  const [state, formAction, pending] = useActionState(addToCartAction, initial);
  const hasVariations = (product.variations?.length ?? 0) > 0;

  return { state, formAction, pending, hasVariations };
}

export function QuickAdd({ product }: { product: StoreProduct }) {
  const { formAction, pending, hasVariations } = useQuickAdd(product);

  /*
    Full width, because on a card this now shares a row with the quick-view
    square and the pair is meant to read as one control strip: the primary
    action takes whatever room is left and the secondary one is fixed. In the
    quick-view modal's footer the same full width is what a single footer
    action wants anyway.
  */
  if (hasVariations) {
    return (
      <div className="@container w-full">
        <ButtonLink
          href={`/store/products/${product.slug}`}
          variant="secondary"
          size="sm"
          className="grid h-11 w-full place-items-center"
        >
          <span>Choose<span className="hidden @min-[8.5rem]:inline">{" options"}</span></span>
        </ButtonLink>
      </div>
    );
  }

  return (
    /*
      The container is the form, which is exactly the width the button has to
      live in — so the label shortens against its own room rather than against
      the viewport.

      Querying the *card* would have been the obvious place and is wrong twice
      over: this control also renders in the quick-view modal's footer, where
      there is no card, and a container query with no container simply never
      matches — so the short label would have become permanent there. Put on
      the form it needs nothing from either call site.

      **8.5rem is measured.** With the shop's grid at six columns the button's
      box runs 93px at 1280 and 141px at 1600, and "Add to cart" plus its icon
      needs 126px at max-content. Under that it does not truncate — the button
      is `grid-flow-col`, so the label wraps inside its own cell, shoves the
      icon onto a second line and is then cut off by the card's
      `overflow-hidden`: measured at three lines in a 44px-tall button, reading
      "Add to" with the rest gone. Nothing catches that. The page does not
      overflow, so `npm run audit` passes, and the clipping happens inside a box
      whose own rect is the right size. 136px is 126 plus ten of margin, so a
      theme with a wider face does not walk back into it.
    */
    /*
      `w-full` is not cosmetic here: it is what makes `@container` safe.

      `container-type: inline-size` applies size containment in the inline axis,
      which means the element's width is resolved **without looking at its
      contents**. In the card that is free — the form is a block in a
      `flex-1 min-w-0` parent, so its width was already coming from above. In
      the quick-view modal's footer it is a flex item under `justify-end`, where
      the width *did* come from the contents: containment took it to zero, the
      button overflowed, the dialog gained a horizontal scroll, and the panel
      opened scrolled sideways with the product name clipped off the left and
      the button clipped off the right. It reads as a broken modal and the cause
      is one property on a `<form>` two components away.
    */
    <form action={formAction} className="@container w-full">
      <input type="hidden" name="product_id" value={product.id} />
      <button
        type="submit"
        disabled={pending || !product.in_stock}
        className="grid h-11 w-full grid-flow-col items-center justify-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13.5px] font-semibold text-brand-on transition-colors duration-200 hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {product.in_stock && !pending && <IconCart className="size-[18px]" />}
        {pending
          ? "Adding…"
          /*
            "Sold out" rather than "Out of stock", at every width and not as a
            second string behind a query. It is short enough to fit the narrowest
            card unaided, and the phrase is not lost: the card already carries an
            `Out of stock` badge above the price whenever this state is reached,
            so the two say one thing between them rather than the same thing
            twice. A width-dependent *wording* is the kind of pair that drifts —
            the argument the newsletter's two definitions of "delivered" settled.
          */
          : product.in_stock
            /*
              One `<span>` around the whole label, and the wrapper is not
              cosmetic. This button is `grid-flow-col`, so **every child is its
              own column** — a bare `Add` beside a `<span> to cart</span>` came
              out as three tracks (`18px 26.47px 45.78px`) with the button's own
              `gap-2` between each, so the label rendered "Add · to cart" with
              8px of air in the middle of a phrase. It reads as a typo in the
              copy rather than as a layout fault, and neither the wrap check nor
              the overflow check can see it: one line, nothing spilling, the
              right words in the right order.
            */
            ? (
              <span>Add<span className="hidden @min-[8.5rem]:inline">{" to cart"}</span></span>
            )
            : "Sold out"}
      </button>
    </form>
  );
}
