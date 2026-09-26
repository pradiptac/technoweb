"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmVisit, updateVisit, type VisitUpdate } from "@/lib/admin";
import { ApiError } from "@/lib/api";

export type VisitActionState = { error?: string; fieldErrors?: Record<string, string[]> };

function refresh(reference: string) {
  revalidatePath("/admin/visits");
  revalidatePath(`/admin/visits/${reference}`);
  revalidatePath("/admin");
}

/** What a refusal says: the API's sentence for the field it names, else its message. */
function refusal(error: unknown): VisitActionState {
  if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
  if (error instanceof ApiError && error.status === 422) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return { error: first ?? error.message, fieldErrors: error.errors };
  }
  return { error: "We could not save that. Try again." };
}

/**
 * One move from the queue's row — a status, or "take it" — with the API's
 * refusal wording, the leads queue's arrangement.
 */
export async function moveVisitAction(reference: string, change: Pick<VisitUpdate, "status" | "assigned_to">): Promise<VisitActionState> {
  try {
    await updateVisit(reference, change);
  } catch (error) {
    return refusal(error);
  }

  refresh(reference);
  return {};
}

/**
 * Set the appointment. The `datetime-local` value goes as typed — a wall
 * clock with no offset — and the API reads it in IST, the app's timezone.
 */
export async function confirmVisitAction(reference: string, _prev: VisitActionState, formData: FormData): Promise<VisitActionState> {
  const start = formData.get("start_at");
  const minutes = formData.get("minutes");
  const owner = formData.get("assigned_to");

  if (typeof start !== "string" || !start) return { error: "Choose when the engineer will arrive.", fieldErrors: { start_at: ["Choose when the engineer will arrive."] } };

  try {
    await confirmVisit(reference, {
      start_at: start,
      minutes: typeof minutes === "string" && /^\d+$/.test(minutes) ? Number(minutes) : undefined,
      assigned_to: typeof owner === "string" && owner ? Number(owner) : null,
    });
  } catch (error) {
    return refusal(error);
  }

  refresh(reference);
  return {};
}

/** Status, engineer, the desk's note and a cancel reason, in one request. */
export async function updateVisitAction(reference: string, _prev: VisitActionState, formData: FormData): Promise<VisitActionState> {
  const payload: VisitUpdate = {};

  const status = formData.get("status");
  if (typeof status === "string" && status) payload.status = status;

  const owner = formData.get("assigned_to");
  if (typeof owner === "string") payload.assigned_to = owner ? Number(owner) : null;

  const note = formData.get("staff_note");
  if (typeof note === "string") payload.staff_note = note.trim() || null;

  const reason = formData.get("cancel_reason");
  if (typeof reason === "string" && reason.trim()) payload.cancel_reason = reason.trim();

  try {
    await updateVisit(reference, payload);
  } catch (error) {
    return refusal(error);
  }

  refresh(reference);
  return {};
}
