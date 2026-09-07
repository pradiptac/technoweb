"use client";

import { useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/modal";
import { IconEye } from "@/components/icons";
import { QuickAdd } from "@/components/store/quick-add";
import { formatPaise, percentOff } from "@/lib/money";
import type { StoreProduct } from "@/types/api";

/**
 * The eye-icon trigger and its modal, together.
 *
 * Everything the modal shows was already in the grid's own
 * `publicApi.storeProducts()` payload — no network request on open, which is
 * the entire point of a *quick* view.
 */
export function QuickView({ product }: { product: StoreProduct }) {
  const [open, setOpen] = useState(false);
  const discounted = Boolean(product.compare_at_paise && product.compare_at_paise > product.price_paise);
  const image = product.images[0];

  return (
    <>
      {/*
        A sibling of the card's image `Link`, never nested inside an anchor —
        a button inside an `<a>` is invalid HTML and would break the card's
        own link.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Quick view: ${product.name}`}
        /*
          A square beside the add button rather than a circle floating over the
          photograph. `size-11` is the add button's own height, so the pair sits
          on one baseline — and it clears the 24px tap target the audit enforces
          with room to spare.
        */
        className="grid size-11 shrink-0 place-items-center rounded-md border border-line-strong bg-card text-ink transition-colors duration-200 hover:bg-surface-2"
      >
        <IconEye className="size-[18px]" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={product.name}
        footer={<QuickAdd product={product} />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-2">
            {image && (
              <Image
                src={image}
                alt={product.image_alts[0] ?? ""}
                fill
                sizes="(min-width: 640px) 260px, 100vw"
                className="object-contain"
                unoptimized
              />
            )}
          </div>

          <div>
            {product.category?.name && (
              <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-brand-ink">
                {product.category.name}
              </span>
            )}

            <div className="mt-2 flex items-baseline gap-2">
              <b className="text-[20px] font-semibold tabular-nums">{formatPaise(product.price_paise)}</b>
              {discounted && product.compare_at_paise && (
                <>
                  <span className="text-[14px] text-faint line-through">{formatPaise(product.compare_at_paise)}</span>
                  <span className="text-[12.5px] font-semibold text-err">
                    -{percentOff(product.price_paise, product.compare_at_paise)}%
                  </span>
                </>
              )}
            </div>

            {product.short_description && (
              <p className="mt-3 text-[13.5px] leading-normal text-muted">{product.short_description}</p>
            )}

            {!product.in_stock && (
              <p className="mt-3 text-[12.5px] font-medium text-err">Out of stock</p>
            )}
            {!product.returnable && (
              <p className="mt-2 text-[12.5px] font-medium text-warn">This product is non-returnable.</p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
