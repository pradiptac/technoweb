"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";

import { ApiError } from "@/lib/api";
import {
  approveReturn, closeReturn, receiveReturn, refundReturn, rejectReturn, saveReturnNote,
  getReturnPickupRates, runReturnPickup,
} from "@/lib/admin";
import type { RatesState } from "@/components/admin/courier-rates";
import { rupeesToPaise } from "@/lib/money";

export type ReturnActionState = { error?: string; ok?: string; fieldErrors?: Record<string, string[]> };

/*
 * Every move redirects with `?done=`, never returns success into its own
 * panel: the panel is drawn only for the status it changes, so a success
 * unmounts it and the message with it. A refusal changes no status, keeps
 * the panel and is returned into it.
 */

function fail(error: unknown): ReturnActionState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 422) {
      // A move the status no longer permits is about the whole panel, not a field.
      const status = error.errors?.status?.[0];
      return { error: status ?? "Check the highlighted fields.", fieldErrors: error.errors };
    }
    if (error.status === 403) return { error: "Your account cannot work the returns desk." };
    if (error.status === 404) return { error: "That return no longer exists." };
  }

  return { error: "We could not do that. Try again shortly." };
}

function refresh(reference: string, stock = false): void {
  revalidatePath("/admin/store/returns");
  revalidatePath(`/admin/store/returns/${reference}`);
  revalidatePath("/admin/store");
  // Stock put back changes what the shop says is available.
  if (stock) updateTag("store-products");
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function approveReturnAction(reference: string, _prev: ReturnActionState, formData: FormData): Promise<ReturnActionState> {
  try {
    await approveReturn(reference, text(formData, "note") || null);
  } catch (error) {
    return fail(error);
  }

  refresh(reference);
  redirect(`/admin/store/returns/${reference}?done=return-approved`);
}

export async function rejectReturnAction(reference: string, _prev: ReturnActionState, formData: FormData): Promise<ReturnActionState> {
  try {
    await rejectReturn(reference, text(formData, "note"));
  } catch (error) {
    return fail(error);
  }

  refresh(reference);
  redirect(`/admin/store/returns/${reference}?done=return-rejected`);
}

export async function receiveReturnAction(reference: string, _prev: ReturnActionState, formData: FormData): Promise<ReturnActionState> {
  // One row per line of the return: `line_ids` says which were on the form,
  // so an unticked "put back in stock" is a no rather than a missing answer.
  const items = formData.getAll("line_ids").map((raw) => {
    const id = Number(raw);
    const received = text(formData, `received_${id}`);

    return {
      id,
      received_quantity: received === "" ? null : Number(received),
      restock: formData.get(`restock_${id}`) === "1",
    };
  }).filter((row) => Number.isInteger(row.id) && row.id > 0);

  try {
    await receiveReturn(reference, items);
  } catch (error) {
    return fail(error);
  }

  refresh(reference, true);
  redirect(`/admin/store/returns/${reference}?done=return-received`);
}

export async function refundReturnAction(reference: string, _prev: ReturnActionState, formData: FormData): Promise<ReturnActionState> {
  const amount = rupeesToPaise(text(formData, "amount"));

  if (amount === null || amount < 1) {
    return { error: "Check the highlighted fields.", fieldErrors: { amount_paise: ["Enter how much went back, in rupees."] } };
  }

  try {
    await refundReturn(reference, { amount_paise: amount, reference: text(formData, "reference"), note: text(formData, "note") || null });
  } catch (error) {
    return fail(error);
  }

  refresh(reference);
  redirect(`/admin/store/returns/${reference}?done=return-refunded`);
}

export async function closeReturnAction(reference: string, _prev: ReturnActionState, formData: FormData): Promise<ReturnActionState> {
  try {
    await closeReturn(reference, text(formData, "note") || null);
  } catch (error) {
    return fail(error);
  }

  refresh(reference);
  redirect(`/admin/store/returns/${reference}?done=return-closed`);
}

export async function saveReturnNoteAction(reference: string, _prev: ReturnActionState, formData: FormData): Promise<ReturnActionState> {
  try {
    await saveReturnNote(reference, text(formData, "staff_note") || null);
  } catch (error) {
    return fail(error);
  }

  refresh(reference);
  redirect(`/admin/store/returns/${reference}?done=return-note-saved`);
}

/*
 * The courier pickup (0.159.0, docs/store.md "Return pickups"). Unlike the
 * moves above, its panel stays on screen afterwards, so a success is
 * returned into it. A refusal is Shiprocket's own sentence, which names the
 * thing to fix; it is also written on the return, so the page re-reads.
 */

function pickupFail(error: unknown): ReturnActionState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot work the returns desk." };
    if (error.message) return { error: error.message };
  }

  return { error: "Shiprocket did not answer. Try again shortly." };
}

export async function returnPickupRatesAction(reference: string): Promise<RatesState> {
  try {
    const quote = await getReturnPickupRates(reference);

    return { couriers: quote.data, cod: false };
  } catch (error) {
    return { error: pickupFail(error).error };
  }
}

export async function returnPickupAction(reference: string, _prev: ReturnActionState, formData: FormData): Promise<ReturnActionState> {
  const action = text(formData, "action");

  if (action !== "book" && action !== "cancel") return { error: "Missing action." };

  const courier = text(formData, "courier_id");

  try {
    await runReturnPickup(reference, action, action === "book" && /^\d+$/.test(courier) ? { courier_id: Number(courier) } : {});
  } catch (error) {
    refresh(reference);

    return pickupFail(error);
  }

  refresh(reference);

  return { ok: action === "book" ? "The pickup is booked with Shiprocket." : "The pickup was cancelled with Shiprocket." };
}
