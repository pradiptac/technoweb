"use client";

import { ButtonLink } from "@/components/ui/button";
import { useQuickAdd } from "@/components/store/quick-add";
import type { StoreProduct } from "@/types/api";

/**
 * The pill "ADD" trigger for `CompactProductCard`, sharing `QuickAdd`'s own
 * action-wiring via `useQuickAdd`. A separate client-component file, the way
 * `QuickAdd`/`QuickView` already sit apart from the server-rendered
 * `StoreProductCard` that uses them — the hook this calls needs the client
 * boundary, and the card around it does not.
 */
export function CompactAdd({ product }: { product: StoreProduct }) {
  const { formAction, pending, hasVariations } = useQuickAdd(product);

  if (hasVariations) {
    return (
      <ButtonLink
        href={`/store/products/${product.slug}`}
        className="absolute bottom-2 right-2 rounded-full border border-brand-200 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[.03em] text-brand-ink shadow-1"
      >
        Add
      </ButtonLink>
    );
  }

  return (
    <form action={formAction} className="absolute bottom-2 right-2">
      <input type="hidden" name="product_id" value={product.id} />
      <button
        type="submit"
        disabled={pending || !product.in_stock}
        className="rounded-full border border-brand-200 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[.03em] text-brand-ink shadow-1 transition-colors duration-200 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "…" : product.in_stock ? "Add" : "Sold out"}
      </button>
    </form>
  );
}
