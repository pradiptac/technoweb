"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addCodesAction, deleteCodeAction, revealCodeAction, type CodeActionState } from "./actions";
import type { AdminDigitalCode } from "@/types/api";

const initial: CodeActionState = {};

/**
 * The activation-code inventory.
 *
 * **The listing never shows a code**, which the brief asks for in as many
 * words. This screen is open on a desk in a room people walk through, and a
 * page of licence keys is stock anybody passing can photograph. What it shows
 * is how many there are, what state each is in and which order took it.
 *
 * Reading one is a separate, deliberate act on a single row, for the case that
 * genuinely happens — somebody reading a key out to a customer on the
 * telephone. It is recorded, and the count is shown beside it: "they say they
 * never got it" against a row saying it was revealed three times is the whole
 * of that conversation.
 */
export function CodesPanel({
  productId, codes, available, delivered,
}: {
  productId: number;
  codes: AdminDigitalCode[];
  available: number;
  delivered: number;
}) {
  const [state, formAction, pending] = useActionState(addCodesAction, initial);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-line-strong bg-card px-5 py-4">
        <p className="text-[13px]">
          <span className="block text-[11px] font-semibold uppercase tracking-[.06em] text-faint">Available</span>
          <span className="font-display text-[22px] font-semibold tabular-nums">{available}</span>
        </p>
        <p className="text-[13px]">
          <span className="block text-[11px] font-semibold uppercase tracking-[.06em] text-faint">Issued</span>
          <span className="font-display text-[22px] font-semibold tabular-nums">{delivered}</span>
        </p>
        {available === 0 && (
          <p className="measure self-center text-[13px] text-warn">
            Nothing left. An order for this is paid and then waits for somebody — add codes below.
          </p>
        )}
      </div>

      <form action={formAction} className="mb-6 rounded-lg border border-line-strong bg-card p-5">
        <input type="hidden" name="product_id" value={productId} />

        <h2 className="mb-1 text-[15px] font-semibold">Add codes</h2>
        <p className="measure mb-3 text-[13px] text-muted">
          One per line. This is how they arrive — a supplier sends a block in an email. Pasting the
          same block twice is counted and reported rather than silently ignored.
        </p>

        {state.error && <Alert tone="err" title="Not added">{state.error}</Alert>}
        {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

        <Field label="Codes" htmlFor="codes">
          <Textarea id="codes" name="codes" rows={6} className="font-mono text-[13px]"
            placeholder={"XXXX-YYYY-ZZZZ\nAAAA-BBBB-CCCC"} />
        </Field>

        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add to inventory"}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
        <table className="admin-table w-full min-w-[620px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
              <th scope="col" className="px-3 py-1.5">Code</th>
              <th scope="col" className="px-3 py-1.5">Order</th>
              <th scope="col" className="px-3 py-1.5">Reveals</th>
              <th scope="col" className="px-3 py-1.5">Added</th>
              <th scope="col" className="px-3 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => <CodeRow key={code.id} code={code} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CodeRow({ code }: { code: AdminDigitalCode }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <tr className="border-b border-line last:border-b-0">
      <td data-label="Code" className="px-3 py-2">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={code.status === "available" ? "resolved" : code.status === "delivered" ? "closed" : "urgent"}>
            {code.status_label}
          </Badge>

          {revealed
            ? <code className="font-mono text-[13px] select-all">{revealed}</code>
            : (
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => {
                  const result = await revealCodeAction(code.id);

                  if (result.error) setError(result.error);
                  else setRevealed(result.code ?? null);
                })}
                className="text-[12.5px] font-semibold text-brand-ink underline disabled:opacity-60"
              >
                {pending ? "Revealing…" : "Reveal"}
              </button>
            )}
        </span>
        {error && <p className="mt-1 text-[12px] text-err">{error}</p>}
      </td>

      <td data-label="Order" className="px-3 py-2 font-mono text-[12.5px] text-muted">
        {code.order_number ?? "—"}
      </td>

      <td data-label="Reveals" className="px-3 py-2 tabular-nums text-muted">
        {code.reveal_count}
        {code.revealed_at && (
          <span className="block text-[12px] text-faint">{new Date(code.revealed_at).toLocaleDateString()}</span>
        )}
      </td>

      <td data-label="Added" className="px-3 py-2 text-muted">
        {code.created_at ? new Date(code.created_at).toLocaleDateString() : "—"}
      </td>

      <td data-label="" className="px-3 py-2 text-right">
        {/*
          Only an unsold one. A delivered code belongs to an order, and removing
          it would leave a customer's line pointing at nothing — the record of
          what was sold is not this screen's to erase. The API refuses it too.
        */}
        {code.status === "available" && (
          <form action={deleteCodeAction}>
            <input type="hidden" name="id" value={code.id} />
            <Button type="submit" size="sm" variant="ghost" className="text-err">Remove</Button>
          </form>
        )}
      </td>
    </tr>
  );
}
