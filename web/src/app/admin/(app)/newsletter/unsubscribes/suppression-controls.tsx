"use client";

import { useActionState, useState, useTransition } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Field, Input, Alert } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { liftSuppressionAction, suppressAction } from "../actions";
import type { NewsletterSuppression } from "@/types/api";

export function AddSuppression() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(suppressAction, {});

  return (
    <div className="mb-3">
      <Button type="button" size="sm" variant={open ? "primary" : "secondary"} onClick={() => setOpen(!open)}>
        Add an address
      </Button>

      {state.error && <Alert tone="err" title="Not added">{state.error}</Alert>}
      {state.ok && <Alert tone="ok" title={state.ok} />}

      {open && (
        <Form action={action} state={state} key={state.ok} className="mt-3 grid gap-2.5 rounded-lg border border-line-strong bg-card p-3.5 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <Field label="Email" htmlFor="email" variant="float" className="mb-0">
            <Input id="email" name="email" type="email" required />
          </Field>

          {/* Hint below the row, so the Add button lines up with the inputs
              rather than with the bottom of the hint. */}
          <Field label="Note" htmlFor="note" variant="float" className="mb-0">
            <Input id="note" name="note" aria-describedby="note-hint"
              placeholder="Asked to be removed by phone" />
          </Field>

          <div>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
          </div>

          <p id="note-hint" className="text-[12.5px] text-faint sm:col-span-3">
            The note is staff-only — it is never sent to anyone.
          </p>
        </Form>
      )}
    </div>
  );
}

export function SuppressionRow({ row }: { row: NewsletterSuppression }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <tr className="border-b border-line last:border-0">
      <td data-label="Address" className="py-2 pr-3 font-mono text-[12.5px]">{row.email}</td>

      <td data-label="Why" className="py-2 pr-3">
        <Badge tone={row.reason === "hard_bounce" ? "urgent" : "closed"}>{row.reason_label}</Badge>
        {row.note && <span className="block max-w-[40ch] truncate text-[12px] text-faint">{row.note}</span>}
        {error && <span className="block text-[12px] text-err">{error}</span>}
      </td>

      <td data-label="When" className="py-2 pr-3 text-[12.5px] text-muted">
        {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
      </td>

      <td data-label="" className="py-2 text-right">
        {/*
          The control is absent, not disabled, when the person unsubscribed
          themselves — a greyed-out button invites somebody to go looking for
          the permission to press it. The sentence beside it is the answer.
        */}
        {row.can_lift ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => start(async () => {
              const result = await liftSuppressionAction(row.id);
              if (result.error) setError(result.error);
            })}
          >
            Allow again
          </Button>
        ) : (
          <span className="text-[12px] text-faint">Only they can undo this</span>
        )}
      </td>
    </tr>
  );
}
