"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/input";
import { paiseToRupeeInput, rupeesToPaise, formatPaise } from "@/lib/money";

/**
 * A setting stored in paise, typed in rupees.
 *
 * The trap this exists for is small and expensive: `cod_max_paise` holds
 * 2500000, and an administrator reading "Maximum order value" and typing 25000
 * would set the ceiling to two hundred and fifty rupees. The whole store speaks
 * paise on the wire deliberately — a price is an exact count of the smallest
 * unit there is — but nobody types paise, so the conversion belongs at the edge.
 *
 * It parses the **text** rather than multiplying, the rule `lib/money.ts` sets
 * out: `parseFloat("11800.10") * 100` is 1180009.9999999999 in this runtime, and
 * `Math.round` hides that exactly until the day it does not.
 *
 * The hidden input carries the paise, so this drops into the settings form
 * beside every other field and the API receives what it already expects.
 */
export function RupeeSetting({
  name, label, hint, defaultPaise, zeroMeans,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultPaise: string | null;
  /** What zero signifies, said on the screen rather than left to be guessed. */
  zeroMeans?: string;
}) {
  const [rupees, setRupees] = useState(
    paiseToRupeeInput(defaultPaise === null ? null : Number(defaultPaise)),
  );

  const paise = rupeesToPaise(rupees) ?? 0;

  return (
    <div>
      <input type="hidden" name={name} value={String(paise)} />

      <Field
        label={label}
        htmlFor={`${name}__rupees`}
        hint={
          paise === 0 && zeroMeans
            ? zeroMeans
            : hint
        }
      >
        <Input
          id={`${name}__rupees`}
          // No `name`: the hidden input above is what the form submits. A named
          // field here would be saved as a setting of its own, or silently
          // dropped depending on the prefix — the trap the mail test recipient
          // documents.
          inputMode="decimal"
          value={rupees}
          onChange={(e) => setRupees(e.target.value)}
          placeholder="25000"
        />
      </Field>

      {paise > 0 && (
        <p className="-mt-3 mb-4 text-[12px] text-faint">
          Stored as {paise} paise — {formatPaise(paise)}.
        </p>
      )}
    </div>
  );
}
