"use client";

import { useActionState, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDrop } from "@/components/ui/file-drop";
import { useUploadForm } from "@/lib/hooks/use-upload-form";
import { Form } from "@/components/ui/form";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  addNoteAction, createZohoInvoiceAction, fulfilOrderAction, moveOrderAction, recordPaymentAction, recordRefundAction, saveInvoiceAction,
  saveShippingAction, sendZohoPaymentAction, shipmentAction,
  type OrderActionState,
} from "../actions";
import { paiseToRupeeInput } from "@/lib/money";
import type { AdminOrder, AdminPayment } from "@/types/api";
import { formatDate } from "@/lib/dates";

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

      <h2 className="mb-1 text-15 font-semibold">Status</h2>
      <p className="measure mb-3 text-13 text-muted">
        Currently <strong>{order.status_label}</strong>.
        {order.status === "pending_payment" && " Nothing has been charged."}
      </p>

      {state.error && <Alert tone="err" title="Not changed">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      {moves.length === 0 ? (
        <p className="text-13 text-muted">
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

          <Button type="submit" size="sm" pending={pending}>
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

      <h2 className="mb-1 text-15 font-semibold">Delivery</h2>
      <p className="measure mb-3 text-13 text-muted">
        {order.shipment?.active
          ? "Booking above fills these in; type over them if the parcel went another way. "
          : "Entered by hand. "}
        The customer sees the courier, the number and the link on their own order page.
      </p>

      {state.error && <Alert tone="err" title="Not saved">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Courier" htmlFor="courier">
          <Input id="courier" name="courier" defaultValue={order.courier ?? ""} maxLength={120} />
        </Field>

        <Field label="Tracking number" htmlFor="tracking_number">
          <Input id="tracking_number" name="tracking_number" defaultValue={order.tracking_number ?? ""}
            className="font-mono text-14" maxLength={120} />
        </Field>
      </div>

      <Field label="Tracking link" htmlFor="tracking_url"
        hint="The page the customer lands on. It has to start with http:// or https://.">
        <Input id="tracking_url" name="tracking_url" defaultValue={order.tracking_url ?? ""} maxLength={500} />
      </Field>

      <Field label="Notes for the customer" htmlFor="shipping_notes" hint="Optional.">
        <Textarea id="shipping_notes" name="shipping_notes" rows={2} defaultValue={order.shipping_notes ?? ""} />
      </Field>

      <Button type="submit" size="sm" pending={pending}>
        {pending ? "Saving…" : "Save delivery details"}
      </Button>
    </Form>
  );
}

/** 1750 → "1.75": grams as the kilograms a person weighs in, by integer division. */
function gramsToKilograms(grams: number): string {
  const whole = Math.floor(grams / 1000);
  const rest = String(grams % 1000).padStart(3, "0").replace(/0+$/, "");

  return rest === "" ? String(whole) : `${whole}.${rest}`;
}

/**
 * The parcel with the courier platform (docs/store.md "Shiprocket").
 *
 * Drawn only when the API sends `shipment` — Shiprocket is chosen in Store
 * settings, or something was once booked — so an install on hand-typed
 * tracking sees the Delivery panel and nothing else. Every control is the
 * API's own word: a button is drawn only when the API will take the press
 * (`can_*`), and a refusal is Shiprocket's reason, not ours.
 *
 * **Every button here acts on the real Shiprocket account**, and one `pending`
 * state governs them all, so the pressed one spins and its neighbours are
 * disabled for the length of the call: a second press while the first is in
 * flight is exactly what the booking claim exists to survive, and not
 * offering it is kinder than surviving it.
 */
export function CourierPanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(shipmentAction, initial);
  const [pressed, setPressed] = useState<string | null>(null);
  const shipment = order.shipment;

  if (!shipment || !order.needs_shipping) return null;

  const live = shipment.booking === "created";
  const trouble = shipment.problem !== null;
  const press = (action: string) => ({
    type: "submit" as const,
    name: "action",
    value: action,
    formNoValidate: action !== "book",
    disabled: pending,
    pending: pending && pressed === action,
    onClick: () => setPressed(action),
  });

  return (
    <Form
      action={formAction}
      state={state}
      className={trouble || shipment.booking === "failed"
        ? "min-w-0 rounded-lg border border-err/40 bg-err-soft p-5"
        : "min-w-0 rounded-lg border border-line-strong bg-card p-5"}
      data-courier={shipment.booking ?? "none"}
    >
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-15 font-semibold">Courier booking</h2>

      <p className="measure mb-3 text-13 text-muted">
        {!live && "Book this parcel with Shiprocket and it fills in the courier, the tracking number and the link below by itself. The customer is told when the courier picks it up."}
        {live && (
          <>
            Booked with Shiprocket
            {shipment.shiprocket_order_id && <> as order <span className="font-mono">{shipment.shiprocket_order_id}</span></>}.
            {shipment.has_courier
              ? <> {order.courier} · AWB <span className="font-mono">{order.tracking_number}</span>.</>
              : " No courier is assigned yet."}
          </>
        )}
      </p>

      {live && shipment.status && (
        <p className="mb-3 text-13-5">
          <span className="text-muted">Status: </span>
          <strong>{shipment.status}</strong>
          {shipment.status_at && <span className="text-muted"> · {formatDate(shipment.status_at, "dateTime")}</span>}
        </p>
      )}

      {trouble && (
        <Alert tone="warn" title={shipment.problem === "cancelled" ? "The courier cancelled this shipment" : "The parcel is coming back"} dismissible={false}>
          {shipment.problem === "cancelled"
            ? "Book it again, or decide what happens to this order."
            : "The courier is returning it to you. Decide what happens to this order — nothing has been changed for you."}
        </Alert>
      )}

      {shipment.error && !state.error && (
        /* Shiprocket's words can carry an identifier with nowhere to break: `anywhere`, not `break-words`. */
        <p className="mb-3 rounded border border-err/25 bg-card px-3 py-2 text-13 text-ink [overflow-wrap:anywhere]">
          {shipment.error}
        </p>
      )}

      {state.error && <Alert tone="err" title="Not done">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      {!live && !shipment.can_book && shipment.book_refusal && (
        <p className="mb-3 text-13 text-muted">{shipment.book_refusal}</p>
      )}

      {shipment.can_book && shipment.defaults && (
        <div className="mb-3 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
          <Field label="Weight (kg)" htmlFor="courier_weight_kg" className="mb-0">
            <Input id="courier_weight_kg" name="weight_kg" inputMode="decimal" defaultValue={gramsToKilograms(shipment.defaults.weight_grams)} />
          </Field>
          <Field label="Length (cm)" htmlFor="courier_length" className="mb-0">
            <Input id="courier_length" name="length" inputMode="numeric" defaultValue={String(shipment.defaults.length)} />
          </Field>
          <Field label="Breadth (cm)" htmlFor="courier_breadth" className="mb-0">
            <Input id="courier_breadth" name="breadth" inputMode="numeric" defaultValue={String(shipment.defaults.breadth)} />
          </Field>
          <Field label="Height (cm)" htmlFor="courier_height" className="mb-0">
            <Input id="courier_height" name="height" inputMode="numeric" defaultValue={String(shipment.defaults.height)} />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {shipment.can_book && (
          <Button size="sm" {...press("book")}>
            {pending && pressed === "book" ? "Booking…" : shipment.booking === "failed" ? "Try booking again" : "Book with Shiprocket"}
          </Button>
        )}
        {shipment.can_assign && (
          <Button size="sm" {...press("assign")}>{pending && pressed === "assign" ? "Asking…" : "Assign a courier"}</Button>
        )}
        {shipment.can_label && !shipment.label_url && (
          <Button size="sm" variant="secondary" {...press("label")}>{pending && pressed === "label" ? "Making…" : "Make the label"}</Button>
        )}
        {shipment.label_url && (
          <ButtonAnchor href={shipment.label_url} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">Open the label</ButtonAnchor>
        )}
        {shipment.can_pickup && (
          <Button size="sm" variant="secondary" {...press("pickup")}>{pending && pressed === "pickup" ? "Asking…" : "Request pickup"}</Button>
        )}
        {shipment.can_track && (
          <Button size="sm" variant="ghost" {...press("track")}>{pending && pressed === "track" ? "Asking…" : "Where is it now?"}</Button>
        )}
        {shipment.can_cancel && (
          <Button size="sm" variant="ghost" {...press("cancel")}>{pending && pressed === "cancel" ? "Cancelling…" : "Cancel shipment"}</Button>
        )}
      </div>

      {shipment.pickup_requested_at && (
        <p className="mt-3 text-12-5 text-muted">Pickup requested {formatDate(shipment.pickup_requested_at, "dateTime")}.</p>
      )}
    </Form>
  );
}

export function InvoicePanel({ order }: { order: AdminOrder }) {
  const router = useRouter();
  // Number and date alone go through the Server Action; with a PDF attached
  // the form takes the watched path and the bar shows it going up.
  const { state, formAction, pending, progress, onSubmitCapture } = useUploadForm<OrderActionState>({
    action: saveInvoiceAction,
    initial,
    url: `/api/admin/store/orders/${encodeURIComponent(order.order_number)}/invoice`,
    prepare: useCallback((data: FormData) => {
      data.delete("order_number");
      for (const key of ["invoice_number", "invoice_date"]) {
        const value = data.get(key);
        if (typeof value !== "string" || value.trim() === "") data.delete(key);
      }
    }, []),
    loginPath: "/admin/login",
    onSuccess: useCallback(() => {
      router.refresh();
      return { ok: "Invoice saved. The customer can download it from their order." } as OrderActionState;
    }, [router]),
  });

  return (
    <Form action={formAction} state={state} onSubmitCapture={onSubmitCapture} className="rounded-lg border border-line-strong bg-card p-5">
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-15 font-semibold">GST invoice</h2>
      <p className="measure mb-3 text-13 text-muted">
        {order.zoho
          ? "Made in Zoho Books by itself (see above), or prepared outside this system and attached here. An invoice attached here by hand is left alone by Zoho Books."
          : "Prepared outside this system and attached here — nothing is generated automatically."}
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

      <Field label="Invoice PDF" htmlFor="invoice" variant="above"
        hint={order.has_invoice
          ? "One is attached. Uploading another replaces it — two invoices for one order is a question nobody can answer later."
          : "PDF only, up to 10MB. Stored privately and streamed, never on a public URL."}>
        <FileDrop
          id="invoice"
          name="invoice"
          accept="application/pdf,.pdf"
          label="Select the PDF…"
          progress={progress}
        />
      </Field>

      <Button type="submit" size="sm" pending={pending}>
        {pending ? "Saving…" : "Save invoice"}
      </Button>
    </Form>
  );
}

/**
 * The order's invoice in Zoho Books (docs/store.md "Zoho Books invoices").
 *
 * Drawn only when the API sends `zoho` — Zoho is set up, or something was
 * once asked of it for this order — so a shop that never connected it sees
 * the upload panel and nothing else. What it says is the API's: the status,
 * Zoho's own words for a refusal, when the next attempt is due, and
 * `can_create`, which is whether the button will be taken.
 */
export function ZohoInvoicePanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(createZohoInvoiceAction, initial);
  const zoho = order.zoho;

  if (!zoho) return null;

  const failed = zoho.status === "failed";

  return (
    <Form
      action={formAction}
      state={state}
      className={failed
        ? "min-w-0 rounded-lg border border-err/40 bg-err-soft p-5"
        : "min-w-0 rounded-lg border border-line-strong bg-card p-5"}
    >
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className={`mb-1 text-15 font-semibold ${failed ? "text-err" : ""}`}>Zoho Books invoice</h2>

      <p className={`measure mb-3 text-13 ${failed ? "text-err" : "text-muted"}`}>
        {zoho.status === "created" && (
          <>
            Invoice <strong className="font-mono">{order.invoice_number ?? "—"}</strong> was made in Zoho Books
            {zoho.synced_at && ` on ${formatDate(zoho.synced_at, "dateTime")}`} and its PDF is attached to this order.{" "}
            {order.payments?.some((p) => p.zoho)
              ? "Payments and refunds on this order are recorded against it there too — each says where it stands under Payments."
              : "Record the payment against it in Zoho Books — that is not being done from here."}
          </>
        )}
        {zoho.status === "pending" && "Queued. The invoice is made within a few minutes."}
        {zoho.status === "creating" && "Being made in Zoho Books now."}
        {zoho.status === "skipped" && "Not made: this order already had an uploaded invoice, and two invoices for one order is a question nobody can answer later."}
        {failed && (
          <>
            Zoho Books refused this invoice{zoho.attempts > 1 ? ` (${zoho.attempts} attempts)` : ""}.{" "}
            {zoho.next_attempt_at
              ? `It will be tried again by itself around ${formatDate(zoho.next_attempt_at, "dateTime")}.`
              : "It will not be tried again by itself."}
          </>
        )}
        {zoho.status === null && (order.has_invoice
          ? "Nothing has been asked of Zoho Books for this order: it already has an uploaded invoice."
          : "Not made yet. It is made by itself when the order reaches the stage chosen in Store settings; or make it now.")}
      </p>

      {failed && zoho.error && !state.error && (
        /*
          Zoho's words can carry an identifier with nowhere to break. `anywhere`
          rather than `break-words`: only the first lowers the min-content
          width, and this form is a grid item, so the second still widened the
          whole column — 652px in a 360px screen, measured by the probe.
        */
        <p className="mb-3 rounded border border-err/25 bg-card px-3 py-2 text-13 text-ink [overflow-wrap:anywhere]">
          {zoho.error}
        </p>
      )}

      {state.error && <Alert tone="err" title="Not made">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      {/* No button over an uploaded invoice: the API would skip it again, and a button that does nothing teaches people to ignore it. */}
      {zoho.can_create && !((zoho.status === null || zoho.status === "skipped") && order.has_invoice) && (
        <Button type="submit" size="sm" pending={pending}>
          {pending ? "Asking Zoho Books…" : failed ? "Try again now" : "Create the Zoho invoice now"}
        </Button>
      )}
    </Form>
  );
}

/**
 * Under one payment or refund in the order's Payments list: where it stands
 * in Zoho Books (0.136.0, docs/store.md "Zoho Books: payments and credit
 * notes"). A payment that arrived is a customer payment on the order's
 * invoice there; a refund is a credit note.
 *
 * Renders nothing when the API sends no `zoho` for the row — a failed card
 * attempt, or an install where payments are not sent. The button is drawn
 * only when the API says a press would be taken, and a refusal is Zoho's own
 * words, wrapped (`anywhere`, the invoice panel's reason) because they can
 * carry an identifier with nowhere to break.
 */
export function ZohoPaymentLine({ orderNumber, payment }: { orderNumber: string; payment: AdminPayment }) {
  const [state, formAction, pending] = useActionState(sendZohoPaymentAction, initial);
  const zoho = payment.zoho;

  if (!zoho) return null;

  const note = zoho.kind === "credit_note";
  const failed = zoho.status === "failed";

  return (
    <Form action={formAction} state={state} className="mt-1.5 min-w-0 text-12" data-zoho-payment={zoho.status ?? "none"}>
      <input type="hidden" name="order_number" value={orderNumber} />
      <input type="hidden" name="payment_id" value={payment.id} />

      <p className={failed ? "text-err [overflow-wrap:anywhere]" : "text-muted [overflow-wrap:anywhere]"}>
        <span className="font-semibold">Zoho Books:</span>{" "}
        {zoho.status === "sent" && (note
          ? <>credit note <span className="font-mono">{zoho.number ?? "made"}</span>{zoho.synced_at && `, ${formatDate(zoho.synced_at, "dateTime")}`}.</>
          : <>recorded against the invoice{zoho.synced_at && `, ${formatDate(zoho.synced_at, "dateTime")}`}.</>)}
        {(zoho.status === "pending" || zoho.status === "sending") && (note ? "the credit note is being made." : "being recorded.")}
        {zoho.status === "skipped" && "not recorded — the invoice was already paid there."}
        {zoho.status === null && (note ? "no credit note made yet." : "not recorded yet.")}
        {failed && !state.error && <>{note ? "the credit note was refused" : "refused"}{zoho.attempts > 1 ? ` (${zoho.attempts} attempts)` : ""}. {zoho.error}</>}
        {failed && state.error && (note ? "the credit note was refused." : "refused.")}
      </p>

      {state.error && <p className="mt-1 text-err [overflow-wrap:anywhere]">{state.error}</p>}
      {state.ok && !state.error && <p className="mt-1 text-ok">{state.ok}</p>}

      {zoho.can_send && (
        <Button type="submit" size="sm" variant="secondary" pending={pending} className="mt-1.5">
          {pending ? "Asking Zoho Books…" : failed ? "Try again now" : note ? "Make the credit note now" : "Send to Zoho Books now"}
        </Button>
      )}
    </Form>
  );
}

export function NotePanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(addNoteAction, initial);

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-line-strong bg-card p-5">
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-15 font-semibold">Internal notes</h2>
      <p className="measure mb-3 text-13 text-muted">
        For colleagues. These never reach the customer and are not on their order page.
      </p>

      {state.error && <Alert tone="err" title="Not added">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      {(order.notes?.length ?? 0) > 0 && (
        <ul className="mb-4 grid gap-2">
          {order.notes!.map((note) => (
            <li key={note.id} className="rounded border border-line bg-surface px-3 py-2 text-13">
              <p>{note.body}</p>
              <p className="mt-1 text-12 text-faint">
                {note.actor_name ?? "Somebody"}
                {note.at && ` · ${formatDate(note.at, "dateTime")}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Field label="Add a note" htmlFor="body">
        <Textarea id="body" name="body" rows={3} maxLength={2000} />
      </Field>

      <Button type="submit" size="sm" variant="secondary" pending={pending}>
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

      <h2 className="mb-1 text-15 font-semibold">Record the payment</h2>
      <p className="measure mb-3 text-13">
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

      <Button type="submit" size="sm" pending={pending}>
        {pending ? "Recording…" : "Record payment"}
      </Button>
    </Form>
  );
}

/**
 * Money going back, recorded — the payment panel's counterpart.
 *
 * Shown only on a paid order that is not yet refunded in full. It moves no
 * money: the refund is made in the gateway's dashboard or at the bank, and
 * what is entered here is the amount and the reference that went with it.
 * Partial refunds add up; the amount that completes the total makes the
 * order `refunded`, which the status dropdown could only ever claim.
 */
export function RecordRefundPanel({ order }: { order: AdminOrder }) {
  const [state, formAction, pending] = useActionState(recordRefundAction, initial);

  if (!order.paid_at || order.status === "refunded") return null;

  const returned = (order.payments ?? [])
    .filter((p) => p.status === "refunded")
    .reduce((sum, p) => sum + (p.amount_paise ?? 0), 0);
  const remaining = Math.max(0, order.total_paise - returned);

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-line-strong bg-card p-5">
      <input type="hidden" name="order_number" value={order.order_number} />

      <h2 className="mb-1 text-15 font-semibold">Record a refund</h2>
      <p className="measure mb-3 text-13 text-muted">
        For money already returned through the gateway or the bank. Part of the order can go
        back on its own; once the whole total is recorded the order becomes refunded.
        {returned > 0 && ` ₹${paiseToRupeeInput(returned)} has gone back so far.`}
      </p>

      {state.error && <Alert tone="err" title="Not recorded">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Amount returned (₹)" htmlFor="refund_amount" hint={`At most ₹${paiseToRupeeInput(remaining)}.`}>
          <Input id="refund_amount" name="amount" inputMode="decimal" defaultValue={paiseToRupeeInput(remaining)} />
        </Field>
        <Field label="Reference" htmlFor="refund_reference" hint="The gateway's refund id, or the bank's.">
          <Input id="refund_reference" name="reference" maxLength={191} />
        </Field>
      </div>

      <Field label="Note" htmlFor="refund_note" hint="Optional. Why, for colleagues.">
        <Textarea id="refund_note" name="note" rows={2} maxLength={2000} />
      </Field>

      <Button type="submit" size="sm" variant="secondary" pending={pending}>
        {pending ? "Recording…" : "Record refund"}
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

      <h2 className="mb-1 text-15 font-semibold text-warn">Activation codes are outstanding</h2>
      <p className="measure mb-3 text-13 text-warn">
        This order is paid and somebody is waiting for a licence key. Issuing takes one from the
        product&rsquo;s inventory; if there are none left, add some first.
      </p>

      {state.error && <Alert tone="err" title="Not issued">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title={state.ok} />}

      <Button type="submit" size="sm" pending={pending}>
        {pending ? "Issuing…" : "Issue the codes"}
      </Button>
    </Form>
  );
}
