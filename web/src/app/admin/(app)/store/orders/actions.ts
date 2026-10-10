"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { rupeesToPaise } from "@/lib/money";
import { ApiError } from "@/lib/api";
import {
  addStoreOrderNote, createZohoInvoice, fulfilStoreOrder, moveStoreOrder, saveStoreOrderInvoice, saveStoreOrderShipping,
  recordStoreOrderPayment,
  recordStoreOrderRefund,
  sendZohoPayment,
  runShipmentAction, getShipmentRates, makeManifest, type ShipmentAction,
} from "@/lib/admin";
import type { RatesState } from "@/components/admin/courier-rates";

export type OrderActionState = { error?: string; ok?: string };

/**
 * Every action on an order returns into the page rather than redirecting.
 *
 * The rule this console already follows for a failure: an action whose control
 * stays on screen reports where the control is. These all keep their form
 * mounted — a status change, a tracking number, a note — so `?done=` would
 * push a toast for something the screen can say beside the thing that changed.
 *
 * The exception is the API's own sentence on a refusal. "An order cannot go
 * from Paid to Refunded" names both states and is written to be read by whoever
 * pressed the button; replacing it with "could not save" throws that away.
 */
function toState(error: unknown, fallback: string): OrderActionState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot manage the store." };
    if (error.message) return { error: error.message };
  }

  return { error: fallback };
}

function refresh(orderNumber: string) {
  revalidatePath("/admin/store/orders");
  revalidatePath(`/admin/store/orders/${orderNumber}`);
}

export async function moveOrderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!orderNumber || !status) return { error: "Choose a status first." };

  try {
    await moveStoreOrder(orderNumber, status, note || undefined);
  } catch (error) {
    return toState(error, "We could not change the status.");
  }

  refresh(orderNumber);

  return { ok: "Status updated." };
}

export async function saveShippingAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");

  if (!orderNumber) return { error: "Missing order." };

  const value = (key: string) => {
    const raw = formData.get(key);

    return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
  };

  try {
    await saveStoreOrderShipping(orderNumber, {
      courier: value("courier"),
      tracking_number: value("tracking_number"),
      tracking_url: value("tracking_url"),
      shipping_notes: value("shipping_notes"),
    });
  } catch (error) {
    return toState(error, "We could not save the delivery details.");
  }

  refresh(orderNumber);

  return { ok: "Delivery details saved. The customer can see them on their order." };
}

export async function addNoteAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!orderNumber || !body) return { error: "Write something first." };

  try {
    await addStoreOrderNote(orderNumber, body);
  } catch (error) {
    return toState(error, "We could not add the note.");
  }

  refresh(orderNumber);

  return { ok: "Note added. Only staff can see it." };
}

/**
 * Record money that arrived without a gateway.
 *
 * The only action in the console that can make an order paid, and it demands
 * what a dropdown cannot: an amount, a reference and — recorded on the server —
 * the name of whoever confirmed it. The API refuses this outright for a gateway
 * order, which is what keeps `OrderStatus::allowedTransitions()` meaningful.
 */
export async function recordPaymentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const rupees = String(formData.get("amount") ?? "").trim();

  if (!reference) {
    return { error: "Enter the UTR, transaction id or receipt number. It is what ties this to a line on the statement." };
  }

  /*
   * Rupees typed, paise sent — and parsed from the text rather than multiplied,
   * because `parseFloat("11800.10") * 100` is 1180009.9999999999 in this
   * runtime and `Math.round` hides that until the day it does not.
   */
  const amount = rupeesToPaise(rupees);

  if (amount === null || amount <= 0) {
    return { error: "Enter the amount that arrived, in rupees." };
  }

  try {
    await recordStoreOrderPayment(orderNumber, {
      amount_paise: amount,
      reference,
      note: String(formData.get("note") ?? "").trim() || undefined,
      paid_at: String(formData.get("paid_at") ?? "").trim() || undefined,
    });
  } catch (error) {
    return toState(error, "We could not record that payment.");
  }

  refresh(orderNumber);

  return { ok: "Payment recorded. The order is marked paid and the customer has been told." };
}

export async function recordRefundAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const rupees = String(formData.get("amount") ?? "").trim();

  if (!reference) {
    return { error: "Enter the gateway's refund id or the bank reference. It is what ties this to a line on the statement." };
  }

  const amount = rupeesToPaise(rupees);
  if (amount === null || amount <= 0) {
    return { error: "Enter the amount returned, in rupees." };
  }

  try {
    await recordStoreOrderRefund(orderNumber, {
      amount_paise: amount,
      reference,
      note: String(formData.get("note") ?? "").trim() || undefined,
    });
  } catch (error) {
    return toState(error, "We could not record that refund.");
  }

  refresh(orderNumber);

  return { ok: "Refund recorded." };
}

export async function saveInvoiceAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");

  if (!orderNumber) return { error: "Missing order." };

  /*
    Sent as multipart, so the file is forwarded rather than JSON-encoded.
    `apiFetch` would turn a FormData into `{}` and Laravel would answer "the
    file field is required" — which reads as the upload being rejected rather
    than as never having been sent.
  */
  const forward = new FormData();

  for (const key of ["invoice_number", "invoice_date"]) {
    const value = formData.get(key);

    if (typeof value === "string" && value.trim() !== "") forward.set(key, value.trim());
  }

  const file = formData.get("invoice");

  if (file instanceof File && file.size > 0) forward.set("invoice", file);

  try {
    await saveStoreOrderInvoice(orderNumber, forward);
  } catch (error) {
    return toState(error, "We could not save the invoice.");
  }

  refresh(orderNumber);

  return { ok: "Invoice saved. The customer can download it from their order." };
}

/**
 * Make this order's Zoho Books invoice now (docs/store.md "Zoho Books
 * invoices"). The API claims the order first, so two presses make one
 * invoice; a refusal comes back in Zoho's own words, which name what to fix.
 */
export async function createZohoInvoiceAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");

  if (!orderNumber) return { error: "Missing order." };

  let result: { status: string; invoice_number: string | null };

  try {
    result = await createZohoInvoice(orderNumber);
  } catch (error) {
    // The refusal is recorded on the order, so the panel must re-read it.
    refresh(orderNumber);

    return toState(error, "Zoho Books did not answer. Try again shortly.");
  }

  refresh(orderNumber);

  // Not every answer is an invoice: an uploaded one is left alone, and a
  // second press while the first is still talking to Zoho makes nothing.
  if (result.status === "skipped") {
    return { ok: "This order already has an uploaded invoice, so none was made in Zoho Books." };
  }
  if (result.status !== "created") {
    return { ok: "The invoice is being made now. Reload in a moment." };
  }

  return {
    ok: result.invoice_number
      ? `Invoice ${result.invoice_number} made in Zoho Books and attached to the order.`
      : "Invoice made in Zoho Books and attached to the order.",
  };
}

/**
 * "Send to Zoho Books" on one payment or refund (0.136.0). Runs in the
 * request: a payment becomes a customer payment on the order's invoice, a
 * refund a credit note, and a refusal comes back in Zoho's own words.
 */
export async function sendZohoPaymentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");
  const paymentId = Number(formData.get("payment_id"));

  if (!orderNumber || !Number.isInteger(paymentId) || paymentId < 1) return { error: "Missing payment." };

  let result: { status: string; number: string | null };

  try {
    result = await sendZohoPayment(orderNumber, paymentId);
  } catch (error) {
    // The refusal is recorded on the payment, so the line must re-read it.
    refresh(orderNumber);

    return toState(error, "Zoho Books did not answer. Try again shortly.");
  }

  refresh(orderNumber);

  if (result.status === "skipped") {
    return { ok: "Not recorded: the invoice is already paid in Zoho Books." };
  }
  if (result.status !== "sent") {
    return { ok: "It is being sent now. Reload in a moment." };
  }

  return { ok: result.number ? `Credit note ${result.number} made in Zoho Books.` : "Recorded in Zoho Books." };
}

export async function fulfilOrderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");

  if (!orderNumber) return { error: "Missing order." };

  let result: { assigned: number; short: string[] };

  try {
    result = await fulfilStoreOrder(orderNumber);
  } catch (error) {
    return toState(error, "We could not issue the codes.");
  }

  refresh(orderNumber);

  if (result.assigned === 0) {
    /*
      Nothing issued is not necessarily a failure — it is usually "there are
      none left", which is a different thing to do about it. Said plainly
      rather than as an error.
    */
    return result.short.length
      ? { error: `No codes are available for: ${result.short.join(", ")}. Add some to the inventory first.` }
      : { ok: "Nothing was outstanding." };
  }

  return {
    ok: result.assigned === 1
      ? "One code issued."
      : `${result.assigned} codes issued.`,
  };
}

const SHIPMENT_DONE: Record<ShipmentAction, string> = {
  book: "Booked with Shiprocket.",
  assign: "A courier was assigned.",
  pickup: "Pickup requested.",
  label: "The label is ready.",
  cancel: "The shipment was cancelled with Shiprocket.",
  track: "Asked Shiprocket where it is.",
  manifest: "The manifest is ready.",
};

/**
 * One action for the courier panel (docs/store.md "Shiprocket"): book, assign
 * the courier, ask for a pickup, make the label, cancel, or ask where the parcel
 * is. Each acts on the real Shiprocket account, so each is its own button with
 * its own press; the API claims the booking, so two presses make one order.
 * A refusal comes back in Shiprocket's own words, which name the thing to fix.
 *
 * The parcel's weight arrives in kilograms (what a person weighs in) and goes
 * on as whole grams, converted on the integers rather than through a float.
 */
export async function shipmentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = String(formData.get("order_number") ?? "");
  const action = String(formData.get("action") ?? "") as ShipmentAction;

  if (!orderNumber || !(action in SHIPMENT_DONE)) return { error: "Missing order." };

  const body: Record<string, unknown> = {};

  // The courier chosen from a quote; nothing chosen is Shiprocket's own default.
  const courier = String(formData.get("courier_id") ?? "");
  if ((action === "book" || action === "assign") && /^\d+$/.test(courier)) body.courier_id = Number(courier);

  if (action === "book") {
    const grams = kilogramsToGrams(String(formData.get("weight_kg") ?? ""));

    if (grams === null) return { error: "Enter the parcel's weight in kilograms, for example 1.5." };
    body.weight_grams = grams;

    for (const side of ["length", "breadth", "height"] as const) {
      const value = String(formData.get(side) ?? "").trim();

      if (!/^\d{1,3}$/.test(value) || Number(value) < 1) return { error: "Enter each side of the parcel in whole centimetres." };
      body[side] = Number(value);
    }
  }

  try {
    await runShipmentAction(orderNumber, action, body);
  } catch (error) {
    // The refusal is written on the order too, so the panel must re-read it.
    refresh(orderNumber);

    return toState(error, "Shiprocket did not answer. Try again shortly.");
  }

  refresh(orderNumber);

  return { ok: SHIPMENT_DONE[action] };
}

/** Couriers and prices for the parcel (0.159.0). A quote only; the weight is as typed on the form, else the order's. */
export async function shipmentRatesAction(orderNumber: string, weightKg: string): Promise<RatesState> {
  const grams = weightKg.trim() === "" ? undefined : kilogramsToGrams(weightKg);

  if (grams === null) return { error: "Enter the parcel's weight in kilograms, for example 1.5." };

  try {
    const quote = await getShipmentRates(orderNumber, grams);

    return { couriers: quote.data, cod: quote.meta.cod };
  } catch (error) {
    return { error: toState(error, "Shiprocket did not answer. Try again shortly.").error };
  }
}

export type ManifestState = { error?: string; url?: string; included?: string[]; refused?: { number: string; message: string }[] };

/** One manifest for the ticked orders (0.159.0): the ready ones are on it, the rest come back with the reason. */
export async function manifestOrdersAction(_previous: ManifestState, formData: FormData): Promise<ManifestState> {
  const numbers = formData.getAll("numbers").map(String).filter(Boolean);

  if (numbers.length === 0) return { error: "Tick the orders first." };

  try {
    const made = await makeManifest(numbers);

    revalidatePath("/admin/store/orders");

    return made;
  } catch (error) {
    return { error: toState(error, "Shiprocket did not answer. Try again shortly.").error };
  }
}

/** "1.5" → 1500, on the digits: no float between the text and the grams. */
function kilogramsToGrams(text: string): number | null {
  const match = /^(\d{1,4})(?:\.(\d{1,3}))?$/.exec(text.trim());

  if (!match) return null;

  const grams = Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0"));

  return grams >= 1 ? grams : null;
}
