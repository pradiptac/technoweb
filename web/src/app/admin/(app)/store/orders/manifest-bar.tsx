"use client";

import { useActionState } from "react";

import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { clearSelection, useSelection } from "@/components/admin/row-selection";
import { manifestOrdersAction, type ManifestState } from "./actions";

const initial: ManifestState = {};

/** The selection's scope on the orders list (`components/admin/row-selection.tsx`). */
export const ORDERS_SCOPE = "store-orders";

/**
 * One manifest for the ticked orders (0.159.0, docs/store.md "Manifests"):
 * the parcels whose courier is assigned and whose pickup is requested go on
 * it, and the rest come back with the reason, so a pass over twenty orders
 * does not stop at the one that is not ready. The PDF opens in a new tab as
 * a plain link — it lives on Shiprocket's storage, not ours.
 */
export function ManifestBar({ orders }: { orders: { id: number; number: string }[] }) {
  const current = useSelection(ORDERS_SCOPE);
  const [state, formAction, pending] = useActionState(manifestOrdersAction, initial);
  const numbers = orders.filter((o) => current.has(o.id)).map((o) => o.number);

  if (numbers.length === 0 && !state.url && !state.error && !state.refused?.length) return null;

  return (
    <div className="sticky top-13 z-20 mb-3 rounded-lg border border-brand-600 bg-brand-50 px-3 py-2.5" data-manifest-bar>
      <Form action={formAction} state={state} className="flex flex-wrap items-center gap-2">
        {numbers.map((n) => <input key={n} type="hidden" name="numbers" value={n} />)}

        {numbers.length > 0 && (
          <>
            <span className="text-13 font-semibold text-brand-ink">{numbers.length} {numbers.length === 1 ? "order" : "orders"} selected</span>
            <button type="button" onClick={() => clearSelection(ORDERS_SCOPE)} className="rounded px-2 py-1 text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
              Select none
            </button>
            <Button type="submit" size="sm" className="ml-auto" pending={pending}>{pending ? "Making…" : "Make a manifest"}</Button>
          </>
        )}

        {state.url && (
          <p className="text-13">
            <a href={state.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-ink underline">Open the manifest</a>
            {" "}for {state.included?.length ?? 0} {state.included?.length === 1 ? "parcel" : "parcels"}.
          </p>
        )}
      </Form>

      {state.error && <div className="mt-2"><Alert tone="err" title="No manifest" dismissible={false}>{state.error}</Alert></div>}

      {state.refused && state.refused.length > 0 && (
        <ul className="mt-2 grid gap-1 text-12-5">
          {state.refused.map((r) => (
            <li key={r.number}><span className="font-mono font-semibold">{r.number}</span> — {r.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
