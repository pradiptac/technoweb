"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/money";
import type { CourierQuote } from "@/types/courier";

export type RatesState = { error?: string; couriers?: CourierQuote[]; cod?: boolean };

/**
 * "See couriers and prices" (0.159.0, docs/store.md "Rate quotes"): asks
 * Shiprocket what each courier would charge for this parcel and lets the desk
 * choose one. A quote only — the checkout's delivery charge is the zones'
 * and does not read it — and it books nothing.
 *
 * It sits inside the panel's own `<Form>`, so the chosen courier travels as
 * the named radio `courier_id` with the Book or Assign press that follows; the
 * first choice, "Shiprocket's default", sends nothing, which is how a booking
 * without a choice has always behaved. The press that asks for the quote is a
 * `type="button"` — it must not submit the booking.
 */
export function CourierRates({
  load,
  weightFieldId,
}: {
  load: (weightKg: string) => Promise<RatesState>;
  /** The booking form's weight input, so a changed weight is quoted as typed. */
  weightFieldId?: string;
}) {
  const [state, setState] = useState<RatesState>({});
  const [pending, start] = useTransition();

  const ask = () => {
    const weight = weightFieldId ? (document.getElementById(weightFieldId) as HTMLInputElement | null)?.value ?? "" : "";

    start(async () => setState(await load(weight)));
  };

  return (
    <div className="mb-3 min-w-0">
      <Button type="button" size="sm" variant="secondary" onClick={ask} pending={pending} data-courier-rates>
        {pending ? "Asking Shiprocket…" : state.couriers ? "Ask again" : "See couriers and prices"}
      </Button>

      {state.error && <div className="mt-2"><Alert tone="err" title="No quote" dismissible={false}>{state.error}</Alert></div>}

      {state.couriers && (
        <fieldset className="mt-3 min-w-0 rounded border border-line p-3">
          <legend className="px-1 text-12-5 font-semibold text-muted">Courier</legend>
          <ul className="grid gap-1">
            <li>
              <label className="flex min-h-6 cursor-pointer items-center gap-2 text-13-5">
                <input type="radio" name="courier_id" value="" defaultChecked className="size-4 accent-brand-600" />
                <span>Shiprocket&apos;s default for the account</span>
              </label>
            </li>
            {state.couriers.map((c) => (
              <li key={c.courier_id}>
                <label className="flex min-h-6 cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 text-13-5">
                  <input type="radio" name="courier_id" value={String(c.courier_id)} className="size-4 accent-brand-600" />
                  <span className="font-semibold [overflow-wrap:anywhere]">{c.name}</span>
                  <span className="tabular-nums">{formatPaise(c.rate_paise, { withPaise: true })}</span>
                  {state.cod && c.cod_charges_paise > 0 && (
                    <span className="text-12-5 text-muted">+ {formatPaise(c.cod_charges_paise, { withPaise: true })} cash on delivery</span>
                  )}
                  <span className="text-12-5 text-muted">
                    {[c.days !== null ? `${c.days} ${c.days === 1 ? "day" : "days"}` : null, c.etd ? `by ${c.etd}` : null, c.rating !== null ? `rated ${c.rating}` : null]
                      .filter(Boolean).join(" · ")}
                  </span>
                  {c.recommended && <Badge tone="brand" dot={false}>Recommended</Badge>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </div>
  );
}
