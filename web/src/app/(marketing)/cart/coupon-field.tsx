"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { applyCouponAction, removeCouponAction, type CartActionState } from "../store/actions";

const initial: CartActionState = {};

/**
 * A discount code, applied to the basket.
 *
 * **The code is stored on the basket, never the amount.** So this control does
 * not display a discount it worked out — the server recalculates on every read,
 * and the summary beside it renders that. Adding a line, removing one, or the
 * coupon expiring all change the answer without anything here having to know.
 *
 * A refusal is shown **as the API worded it**: "that code needs an order of
 * ₹5,000 or more" is something somebody can act on, where "invalid coupon"
 * sends them to the telephone.
 */
export function CouponField({ applied, label }: { applied?: string | null; label?: string | null }) {
  const [state, formAction, pending] = useActionState(applyCouponAction, initial);

  if (applied) {
    return (
      <form action={removeCouponAction} className="mt-4 border-t border-line pt-4">
        <p className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="rounded border border-ok/30 bg-ok-soft px-2 py-0.5 font-mono text-[12.5px] text-ok">
            {applied}
          </span>
          {label && <span className="text-muted">{label}</span>}
          <Button type="submit" size="sm" variant="ghost" className="ml-auto">Remove</Button>
        </p>
      </form>
    );
  }

  return (
    <form action={formAction} className="mt-4 border-t border-line pt-4">
      <label htmlFor="coupon" className="mb-1 block text-[12.5px] font-semibold text-muted">
        Discount code
      </label>

      <div className="flex gap-2">
        <input
          id="coupon"
          name="code"
          maxLength={64}
          placeholder="WELCOME10"
          className="min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 py-2 font-mono text-[14px]"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Checking…" : "Apply"}
        </Button>
      </div>

      {/* The API's own sentence, kept. */}
      {state.error && <Alert tone="err" title="Not applied">{state.error}</Alert>}
    </form>
  );
}
