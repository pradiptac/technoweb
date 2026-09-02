"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { formatPaise } from "@/lib/money";
import { addToCartAction, type CartActionState } from "@/app/(marketing)/store/actions";
import type { StoreProduct, StoreVariation } from "@/types/api";

const initial: CartActionState = {};

/**
 * Choose a configuration, choose a quantity, add it.
 *
 * **One selector listing the variations by name, not one per option
 * dimension.** The two-selector version has to resolve a pair of choices back
 * to a row and then decide what to do when the pair does not exist — which is
 * most pairs, because the shop stocks a handful of configurations rather than
 * the cartesian product of every option. A single list can only offer what is
 * actually for sale, which is why the admin form calls the name "what the
 * buyer picks from". The options are shown as text beside it, so "16 GB / 1 TB"
 * is still legible as RAM and storage.
 *
 * The price beside the button follows the selection, because a variation may
 * cost more than the product and the figure under the title would otherwise
 * quietly disagree with the basket.
 */
export function AddToBasket({ product }: { product: StoreProduct }) {
  const variations = product.variations ?? [];
  const [state, formAction, pending] = useActionState(addToCartAction, initial);

  const [variationId, setVariationId] = useState<string>(
    // The first one that can actually be bought, so the common case needs no
    // interaction at all.
    String(variations.find((v) => v.in_stock)?.id ?? variations[0]?.id ?? ""),
  );
  const [quantity, setQuantity] = useState("1");

  const chosen: StoreVariation | undefined =
    variations.find((v) => String(v.id) === variationId);

  const price = chosen?.price_paise ?? product.price_paise;
  const available = variations.length ? Boolean(chosen?.in_stock) : product.in_stock;

  return (
    <Form action={formAction} state={state} className="grid gap-3">
      <input type="hidden" name="product_id" value={product.id} />
      {chosen && <input type="hidden" name="variation_id" value={chosen.id} />}

      {variations.length > 0 && (
        <div>
          <label htmlFor="variation" className="mb-1 block text-[13px] font-semibold">
            Configuration
          </label>
          <select
            id="variation"
            value={variationId}
            onChange={(e) => setVariationId(e.target.value)}
            className="w-full rounded border border-line-strong bg-surface px-3 py-2.5 text-[15px]"
          >
            {variations.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.in_stock}>
                {v.name}
                {v.price_paise !== product.price_paise ? ` — ${formatPaise(v.price_paise)}` : ""}
                {v.in_stock ? "" : " (out of stock)"}
              </option>
            ))}
          </select>

          {chosen?.options && Object.keys(chosen.options).length > 0 && (
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
              {Object.entries(chosen.options).map(([key, value]) => (
                <div key={key} className="flex gap-1.5">
                  <dt className="font-medium">{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-24">
          <label htmlFor="quantity" className="mb-1 block text-[13px] font-semibold">
            Quantity
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={99}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded border border-line-strong bg-surface px-3 py-2.5 text-[15px]"
          />
        </div>

        <div className="flex-1">
          <p className="mb-1 text-[12.5px] text-muted">Total, including GST</p>
          <p className="text-[22px] font-semibold tabular-nums leading-none">
            {formatPaise(price * (Number(quantity) || 1))}
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending || !available} className="w-full sm:w-auto">
        {pending ? "Adding…" : available ? "Add to basket" : "Out of stock"}
      </Button>

      {/*
        An Alert rather than a toast: this is part of what the screen says
        about the thing being bought, and it must still be there while somebody
        reads the price under it.
      */}
      {state.error && <Alert tone="err" title="Not added">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone={state.warning ? "warn" : "ok"} title={state.ok}>
          {state.warning ?? <Link className="underline" href="/cart">View your basket</Link>}
        </Alert>
      )}

      {!product.returnable && (
        <p className="text-[12.5px] font-medium text-warn">
          This product is non-returnable.
        </p>
      )}
    </Form>
  );
}
