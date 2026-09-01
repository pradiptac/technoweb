"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { rupeesToPaise } from "@/lib/money";
import { ApiError } from "@/lib/api";
import {
  addStoreOrderNote, fulfilStoreOrder, moveStoreOrder, saveStoreOrderInvoice, saveStoreOrderShipping,
  recordStoreOrderPayment,
} from "@/lib/admin";

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
