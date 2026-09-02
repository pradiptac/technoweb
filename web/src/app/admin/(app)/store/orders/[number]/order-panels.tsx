"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  addNoteAction, fulfilOrderAction, moveOrderAction, recordPaymentAction, saveInvoiceAction,
  saveShippingAction,
  type OrderActionState,
} from "../actions";
import { paiseToRupeeInput } from "@/lib/money";
import type { AdminOrder } from "@/types/api";

const initial: OrderActionState = {};

/**
 * The four things a person does to an order, each its own form.
 *
 * Separate forms rather than one, because they are separate acts with separate
 * consequences: changing a status writes to the trail, saving a tracking number
 * is visible to the customer, a note is not, and issuing a code hands over
 * stock. One form would mean pressing Save did all four, and a mistake in any
 * of them would arrive with the others.
 *
 * Each reports **into itself** rather than through a toast: the control stays
 * on screen, so the place to say what happened is beside it. That is the
 * console's own rule for a failure, and it holds for a success where the
 * control does not unmount.
 */

export function StatusPanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(moveOrderAction, initial);
  const moves = order.allowed_transitions ?? [];

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-line-strong bg-card p-5">
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-[15px] font-semibold">Status</h2>
      <p className="measure mb-3 text-[13px] text-muted">
        Currently <strong>{order.status_label}</strong>.
        {order.status === "pending_payment" && " Nothing has been charged."}
      </p>

      {state.error && <Alert tone="err" title="Not changed">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      {moves.length === 0 ? (
        <p className="text-[13px] text-muted">
          {order.status === "pending_payment"
            /*
              Said rather than left to be discovered by a dropdown with one
              option in it. An order becomes paid because a payment was
              verified, and this is the screen where somebody would otherwise
              go looking for the button.
            */
            ? "This order moves on by itself when the payment arrives. It cannot be marked paid by hand."
            : "There is nowhere further for this order to go."}
        </p>
      ) : (
        <>
          <Field label="Move to" htmlFor="status" variant="float-static">
            <Select id="status" name="status" defaultValue="">
              <option value="" disabled>Choose…</option>
              {moves.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>

          <Field label="Note" htmlFor="status_note" hint="Optional. Goes into the order's history, not to the customer.">
            <Input id="status_note" name="note" maxLength={1000} />
          </Field>

          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Update status"}
          </Button>
        </>
      )}
    </Form>
  );
}

export function ShippingPanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(saveShippingAction, initial);

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-line-strong bg-card p-5">
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-[15px] font-semibold">Delivery</h2>
      <p className="measure mb-3 text-[13px] text-muted">
        Entered by hand — there is no courier integration. The customer sees the courier, the
        number and the link on their own order page.
      </p>

      {state.error && <Alert tone="err" title="Not saved">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Courier" htmlFor="courier">
          <Input id="courier" name="courier" defaultValue={order.courier ?? ""} maxLength={120} />
        </Field>

        <Field label="Tracking number" htmlFor="tracking_number">
          <Input id="tracking_number" name="tracking_number" defaultValue={order.tracking_number ?? ""}
            className="font-mono text-[14px]" maxLength={120} />
        </Field>
      </div>

      <Field label="Tracking link" htmlFor="tracking_url"
        hint="The page the customer lands on. It has to start with http:// or https://.">
        <Input id="tracking_url" name="tracking_url" defaultValue={order.tracking_url ?? ""} maxLength={500} />
      </Field>

      <Field label="Notes for the customer" htmlFor="shipping_notes" hint="Optional.">
        <Textarea id="shipping_notes" name="shipping_notes" rows={2} defaultValue={order.shipping_notes ?? ""} />
      </Field>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save delivery details"}
      </Button>
    </Form>
  );
}

export function InvoicePanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(saveInvoiceAction, initial);

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-line-strong bg-card p-5">
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-[15px] font-semibold">GST invoice</h2>
      <p className="measure mb-3 text-[13px] text-muted">
        Prepared outside this system and attached here — nothing is generated automatically.
        {order.gst_required
          ? ` This customer asked for one: ${order.company_name ?? "—"} (${order.gstin ?? "—"}).`
          : " This customer did not ask for one."}
      </p>

      {state.error && <Alert tone="err" title="Not saved">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Invoice number" htmlFor="invoice_number">
          <Input id="invoice_number" name="invoice_number" defaultValue={order.invoice_number ?? ""} maxLength={64} />
        </Field>

        <Field label="Invoice date" htmlFor="invoice_date">
          <Input id="invoice_date" name="invoice_date" type="date" defaultValue={order.invoice_date ?? ""} />
        </Field>
      </div>

      <Field label="Invoice PDF" htmlFor="invoice"
        hint={order.has_invoice
          ? "One is attached. Uploading another replaces it — two invoices for one order is a question nobody can answer later."
          : "PDF only, up to 10MB. Stored privately and streamed, never on a public URL."}>
        <input
          id="invoice"
          name="invoice"
          type="file"
          accept="application/pdf"
          className="w-full rounded border border-line-strong bg-surface px-3 py-2 text-[14px] file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[13px]"
        />
      </Field>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save invoice"}
      </Button>
    </Form>
  );
}

export function NotePanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(addNoteAction, initial);

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-line-strong bg-card p-5">
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-[15px] font-semibold">Internal notes</h2>
      <p className="measure mb-3 text-[13px] text-muted">
        For colleagues. These never reach the customer and are not on their order page.
      </p>

      {state.error && <Alert tone="err" title="Not added">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      {(order.notes?.length ?? 0) > 0 && (
        <ul className="mb-4 grid gap-2">
          {order.notes!.map((note) => (
            <li key={note.id} className="rounded border border-line bg-surface px-3 py-2 text-[13px]">
              <p>{note.body}</p>
              <p className="mt-1 text-[12px] text-faint">
                {note.actor_name ?? "Somebody"}
                {note.at && ` · ${new Date(note.at).toLocaleString()}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Field label="Add a note" htmlFor="body">
        <Textarea id="body" name="body" rows={3} maxLength={2000} />
      </Field>

      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Adding…" : "Add note"}
      </Button>
    </Form>
  );
}

/**
 * Recording money that arrived without a gateway.
 *
 * Shown only for an order that needs it — an offline method, not yet paid. A
 * gateway order never gets this form, because the API refuses it there anyway
 * and a control that exists to be rejected is worse than no control at all.
 *
 * It is the one place in the console that can make an order paid, and the shape
 * of the form is the argument for allowing it: an amount, a reference and a
 * date, recorded against the person who entered them. A status dropdown could
 * carry none of that, which is why moving an order into `paid` is still refused
 * everywhere else.
 */
export function RecordPaymentPanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(recordPaymentAction, initial);

  const offline = order.payment_method && order.payment_method !== "gateway";

  if (!offline || order.paid_at) return null;

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-warn/25 bg-warn-soft p-5">
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-[15px] font-semibold">Record the payment</h2>
      <p className="measure mb-3 text-[13px]">
        This order is being paid by <strong>{order.payment_method_label ?? order.payment_method}</strong>,
        which has no gateway behind it — so it becomes paid when somebody here says the money
        arrived. Check the statement first; this is the entry auditors read.
      </p>

      {state.error && <Alert tone="err" title="Not recorded">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field
          label="Amount received (₹)"
          htmlFor="amount"
          hint="What actually arrived. A short payment is recorded and flagged rather than refused."
        >
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={paiseToRupeeInput(order.total_paise)}
          />
        </Field>

        <Field
          label="Reference"
          htmlFor="reference"
          hint="UTR, UPI transaction id, or the courier's receipt number."
        >
          <Input id="reference" name="reference" maxLength={191} />
        </Field>
      </div>

      <Field label="When it arrived" htmlFor="paid_at" hint="Leave blank for now.">
        <Input id="paid_at" name="paid_at" type="datetime-local" />
      </Field>

      <Field label="Note" htmlFor="payment_note" hint="Optional. For colleagues, never the customer.">
        <Textarea id="payment_note" name="note" rows={2} maxLength={2000} />
      </Field>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Recording…" : "Record payment"}
      </Button>
    </Form>
  );
}

/**
 * Issuing activation codes by hand.
 *
 * Shown only when something is outstanding — a button that is always there
 * invites pressing, and pressing it when nothing is due is a control that
 * teaches people it does nothing.
 */
export function FulfilPanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(fulfilOrderAction, initial);

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-warn/40 bg-warn-soft p-5">
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-[15px] font-semibold text-warn">Activation codes are outstanding</h2>
      <p className="measure mb-3 text-[13px] text-warn">
        This order is paid and somebody is waiting for a licence key. Issuing takes one from the
        product&rsquo;s inventory; if there are none left, add some first.
      </p>

      {state.error && <Alert tone="err" title="Not issued">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Issuing…" : "Issue the codes"}
      </Button>
    </Form>
  );
}
