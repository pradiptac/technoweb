"use client";

import { useActionState } from "react";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { paiseToRupeeInput } from "@/lib/money";
import type { AdminReturn } from "@/types/returns";
import {
  approveReturnAction, closeReturnAction, receiveReturnAction, refundReturnAction,
  rejectReturnAction, saveReturnNoteAction, type ReturnActionState,
} from "../actions";

const initial: ReturnActionState = {};
const panel = "rounded-lg border border-line-strong bg-card p-5";

/** Whether the API says this return may move to `status` now — a button is a promise. */
const may = (r: AdminReturn, status: string) => (r.allowed_next ?? []).some((s) => s.value === status);

/**
 * The desk's moves on one return (docs/store.md "Returns"). Each panel is
 * drawn only when `allowed_next` offers its move, and each success redirects
 * with `?done=` — the panel it came from is gone by then.
 */
export function DecisionPanel({ r }: { r: AdminReturn }) {
  const [approve, approveAction, approving] = useActionState(approveReturnAction.bind(null, r.reference), initial);
  const [reject, rejectAction, rejecting] = useActionState(rejectReturnAction.bind(null, r.reference), initial);

  if (!may(r, "approved") && !may(r, "rejected")) return null;

  return (
    <div className="grid gap-5">
      {may(r, "approved") && (
        <Form action={approveAction} state={approve} className={panel}>
          <h2 className="mb-1 text-15 font-semibold">{r.status === "rejected" ? "Approve it after all" : "Approve the return"}</h2>
          <p className="mb-3 text-13 text-muted">
            The customer is emailed that it is approved{r.return_instructions ? ", with your return instructions from Store → Settings" : ""}.
            {!r.return_instructions && " There are no return instructions saved in Store → Settings, so say here where to send it."}
          </p>
          {approve.error && <Alert tone="err" title="Not approved">{approve.error}</Alert>}
          <Field label="Message to the customer" htmlFor="approve_note" error={approve.fieldErrors?.note?.[0]} hint="Optional. Added to the email — what to include, a collection date.">
            <Textarea id="approve_note" name="note" rows={3} maxLength={2000} />
          </Field>
          <Button type="submit" size="sm" pending={approving}>{approving ? "Approving…" : "Approve and email the customer"}</Button>
        </Form>
      )}

      {may(r, "rejected") && (
        <Form action={rejectAction} state={reject} className={panel}>
          <h2 className="mb-1 text-15 font-semibold">Do not accept it</h2>
          <p className="mb-3 text-13 text-muted">The customer is emailed your reason. This can be reversed.</p>
          {reject.error && <Alert tone="err" title="Not saved">{reject.error}</Alert>}
          <Field label="Reason, as the customer will read it" htmlFor="reject_note" error={reject.fieldErrors?.note?.[0]}>
            <Textarea id="reject_note" name="note" rows={3} maxLength={2000} required />
          </Field>
          <Button type="submit" size="sm" variant="secondary" pending={rejecting}>{rejecting ? "Saving…" : "Decline and email the customer"}</Button>
        </Form>
      )}
    </div>
  );
}

export function ReceivePanel({ r }: { r: AdminReturn }) {
  const [state, action, pending] = useActionState(receiveReturnAction.bind(null, r.reference), initial);

  if (!may(r, "received")) return null;

  return (
    <Form action={action} state={state} className={panel}>
      <h2 className="mb-1 text-15 font-semibold">The items have arrived</h2>
      <p className="mb-3 text-13 text-muted">
        Say how many of each turned up, and tick the ones fit to sell again — those go back into stock.
        The customer is emailed that the return has reached you.
      </p>
      {state.error && <Alert tone="err" title="Not saved">{state.error}</Alert>}

      <ul className="mb-4 grid gap-3">
        {(r.items ?? []).map((line) => (
          <li key={line.id} className="grid gap-x-4 gap-y-2 rounded-md border border-line-strong p-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-center">
            <input type="hidden" name="line_ids" value={line.id} />
            <p className="min-w-0 text-14">
              <span className="font-medium [overflow-wrap:anywhere]">{line.name ?? "An item"}</span>
              {line.variation_name && <span className="text-muted"> ({line.variation_name})</span>}
              <span className="block text-12-5 text-muted">{line.quantity} asked to come back</span>
            </p>
            <Field label="Arrived" htmlFor={`received_${line.id}`} className="mb-0" error={state.fieldErrors?.[`items.${line.id}.received_quantity`]?.[0]}>
              <Input id={`received_${line.id}`} name={`received_${line.id}`} type="number" min={0} max={line.quantity} defaultValue={line.quantity} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-13-5">
              <input type="checkbox" name={`restock_${line.id}`} value="1" />
              Put back in stock
            </label>
          </li>
        ))}
      </ul>

      <Button type="submit" size="sm" pending={pending}>{pending ? "Saving…" : "Mark as received"}</Button>
    </Form>
  );
}

export function RefundPanel({ r }: { r: AdminReturn }) {
  const [state, action, pending] = useActionState(refundReturnAction.bind(null, r.reference), initial);

  if (!may(r, "refunded")) return null;

  if (!r.order_paid) {
    return (
      <div className={panel}>
        <h2 className="mb-1 text-15 font-semibold">Refund</h2>
        <p className="text-13-5 text-muted">
          This order has not been paid for, so there is nothing to refund. Close the return below once it is settled.
        </p>
      </div>
    );
  }

  return (
    <Form action={action} state={state} className={panel}>
      <h2 className="mb-1 text-15 font-semibold">Record the refund</h2>
      <p className="mb-3 text-13 text-muted">
        For money already sent back through the gateway or the bank — nothing is sent from here. The customer is
        emailed the amount and the reference, and the refund shows on the order.
      </p>
      {state.error && <Alert tone="err" title="Not recorded">{state.error}</Alert>}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Amount returned (₹)" htmlFor="refund_amount" error={state.fieldErrors?.amount_paise?.[0]} hint="Starts on the price of what arrived.">
          <Input id="refund_amount" name="amount" inputMode="decimal" defaultValue={paiseToRupeeInput(r.suggested_refund_paise ?? 0)} />
        </Field>
        <Field label="Reference" htmlFor="refund_reference" error={state.fieldErrors?.reference?.[0]} hint="The gateway's refund id, or the bank's.">
          <Input id="refund_reference" name="reference" maxLength={191} required />
        </Field>
      </div>
      <Field label="Note" htmlFor="refund_note" hint="Optional. For colleagues; kept with the payment.">
        <Textarea id="refund_note" name="note" rows={2} maxLength={2000} />
      </Field>

      <Button type="submit" size="sm" pending={pending}>{pending ? "Recording…" : "Record refund and email the customer"}</Button>
    </Form>
  );
}

export function ClosePanel({ r }: { r: AdminReturn }) {
  const [state, action, pending] = useActionState(closeReturnAction.bind(null, r.reference), initial);

  if (!may(r, "closed")) return null;

  return (
    <Form action={action} state={state} className={panel}>
      <h2 className="mb-1 text-15 font-semibold">Close without a refund</h2>
      <p className="mb-3 text-13 text-muted">
        For a return that ended some other way — a replacement was sent, the customer kept the item. Nobody is
        emailed, and it cannot be reopened.
      </p>
      {state.error && <Alert tone="err" title="Not closed">{state.error}</Alert>}
      <Field label="Why" htmlFor="close_note" hint="Optional. Added to the note for colleagues.">
        <Input id="close_note" name="note" maxLength={2000} />
      </Field>
      <Button type="submit" size="sm" variant="ghost" pending={pending}>{pending ? "Closing…" : "Close the return"}</Button>
    </Form>
  );
}

export function StaffNotePanel({ r }: { r: AdminReturn }) {
  const [state, action, pending] = useActionState(saveReturnNoteAction.bind(null, r.reference), initial);

  return (
    <Form action={action} state={state} className={panel}>
      <h2 className="mb-1 text-15 font-semibold">Note for colleagues</h2>
      <p className="mb-3 text-13 text-muted">Never shown to the customer and never emailed.</p>
      {state.error && <Alert tone="err" title="Not saved">{state.error}</Alert>}
      <Field label="Note" htmlFor="staff_note">
        <Textarea id="staff_note" name="staff_note" rows={3} maxLength={5000} defaultValue={r.staff_note ?? ""} />
      </Field>
      <Button type="submit" size="sm" variant="secondary" pending={pending}>{pending ? "Saving…" : "Save note"}</Button>
    </Form>
  );
}
