"use client";

import Image from "next/image";
import { useState } from "react";

import { IconBox } from "@/components/icons";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ChatProduct } from "./chat-actions";
import { addToBasketFromChatAction } from "./chat-actions";

/**
 * A product, in the conversation.
 *
 * **Every figure on this card comes from the database, not from the answer
 * above it.** The model writes the sentence; the shop states the price and the
 * availability. That is Rule 4 and §29 of the specification, and it is the one
 * thing about a shopping assistant that must not be a matter of the model
 * behaving itself — a card built by parsing the reply would put a hallucinated
 * price next to a real Buy button.
 *
 * Compact rather than the full `StoreProductCard`: that one is 44px of image
 * well plus a badge row, built for a grid three across, and three of them in a
 * 380px panel is a page somebody scrolls past. Same tokens, same radius, same
 * price treatment — it reads as the same shop, which is what "reuse the
 * existing product card" is actually asking for.
 */
export function ChatProductCard({ product, title }: { product: ChatProduct; title: string }) {
  const [state, setState] = useState<{ busy: boolean; said: string | null; tone: "ok" | "warn" | "err" }>(
    { busy: false, said: null, tone: "ok" },
  );

  /*
   * A product with variations gets a link and no basket button.
   *
   * It cannot be added without choosing one — falling back to the product
   * would sell "a switch" where the shop has only ever offered a 24-port and a
   * 48-port, and somebody in the warehouse then has to guess. The product page
   * is where that choice is made, so that is where this sends them.
   */
  const canAdd = !product.has_variations && product.in_stock;

  async function add() {
    setState({ busy: true, said: null, tone: "ok" });

    const result = await addToBasketFromChatAction(product.id);

    setState({
      busy: false,
      said: result.ok ?? result.warning ?? result.error ?? null,
      tone: result.error ? "err" : result.warning ? "warn" : "ok",
    });
  }

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line-strong bg-page">
      <a href={`/store/products/${product.slug}`} className="flex gap-3 p-3 transition-colors hover:bg-surface-2">
        {/*
          A fixed square well, like every other image on the site: a slow image
          cannot move the price out from under somebody's cursor.
        */}
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface">
          {product.image ? (
            <Image
              src={product.image}
              alt=""
              width={56}
              height={56}
              className="size-full object-contain p-1"
              /*
               * `unoptimized`, like every other API-served image in the product.
               * This was the one call site of sixteen that went through the
               * optimiser, so it was the only one that depended on the upload
               * host being in `remotePatterns` — which in production it was not.
               * A 56px thumbnail is not worth a round trip through the optimiser
               * to find that out.
               */
              unoptimized
            />
          ) : (
            <IconBox className="size-5 text-faint" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-snug font-semibold text-ink">{title}</span>
          {product.brand && <span className="block text-[12px] text-muted">{product.brand}</span>}

          <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13.5px] font-semibold tabular-nums">{formatPaise(product.price_paise)}</span>
            {/* Only when it is genuinely higher — equal or lower is a mistake
                or a lie, and both render as a discount that is not there. */}
            {product.compare_at_paise && (
              <span className="text-[12px] text-faint line-through tabular-nums">
                {formatPaise(product.compare_at_paise)}
              </span>
            )}
            <span className={cn("text-[12px]", product.in_stock ? "text-ok" : "text-muted")}>
              {product.in_stock ? "In stock" : "Out of stock"}
            </span>
          </span>
        </span>
      </a>

      <div className="border-t border-line px-3 py-2">
        {/*
          The buttons on their own row and the note underneath. Sharing a row,
          the note took the width and "View product" wrapped onto two lines —
          a two-line button reads as a broken control. `whitespace-nowrap`
          alone would have pushed the note off the edge instead.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/store/products/${product.slug}`}
            className="rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[12.5px] whitespace-nowrap transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            View product
          </a>

          {canAdd && (
            <button
              type="button"
              onClick={add}
              disabled={state.busy}
              className="rounded-md bg-brand-600 px-2.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {state.busy ? "Adding…" : "Add to basket"}
            </button>
          )}
        </div>

        {product.has_variations && (
          <p className="mt-1.5 text-[12px] text-muted">Choose an option on the product page.</p>
        )}
      </div>

      {/*
        Mounted empty and kept mounted, so a change is announced. What it says
        comes from the cart API — including "only two left", which is the
        basket's own warning and not this card's opinion.
      */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "px-3 text-[12px]",
          state.said && "pb-2",
          state.tone === "err" ? "text-err" : state.tone === "warn" ? "text-warn" : "text-ok",
        )}
      >
        {state.said}
      </p>
    </div>
  );
}
