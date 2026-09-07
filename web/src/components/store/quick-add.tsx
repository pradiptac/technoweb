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
      <ButtonLink
        href={`/store/products/${product.slug}`}
        variant="secondary"
        size="sm"
        className="grid h-11 w-full place-items-center"
      >
        Choose options
      </ButtonLink>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="product_id" value={product.id} />
      <button
        type="submit"
        disabled={pending || !product.in_stock}
        className="grid h-11 w-full grid-flow-col items-center justify-center gap-2 rounded-md bg-brand-600 px-3.5 text-[13.5px] font-semibold text-white transition-colors duration-200 hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {product.in_stock && !pending && <IconCart className="size-[18px]" />}
        {pending ? "Adding…" : product.in_stock ? "Add to cart" : "Out of stock"}
      </button>
    </form>
  );
}
