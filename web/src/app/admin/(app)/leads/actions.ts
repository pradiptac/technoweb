"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addLeadNote, deleteLead, updateLead, type LeadUpdate } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { rupeesToPaise } from "@/lib/money";

export type LeadActionState = { error?: string };

/**
 * Move a lead on, and say so.
 *
 * The whole panel saves in one request. Four endpoints for four fields edited
 * together is four chances for half a screen to land, and the trail would then
 * hold four lines for one decision.
 */
export async function updateLeadAction(
  id: number,
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const payload: LeadUpdate = {};

  const status = formData.get("status");
  if (typeof status === "string" && status) payload.status = status;

  const owner = formData.get("assigned_to");
  // An empty select is "nobody", which is a real value and not "leave it
  // alone" — so it has to be sent as null rather than omitted.
  if (typeof owner === "string") payload.assigned_to = owner ? Number(owner) : null;

  const followUp = formData.get("follow_up_at");
  if (typeof followUp === "string") payload.follow_up_at = followUp || null;

  const value = formData.get("value_rupees");
  if (typeof value === "string") {
    /*
      Rupees are collected and paise are sent. `rupeesToPaise` parses the text
      rather than multiplying, because `parseFloat("11800.10") * 100` is
      1180009.9999999999 in this runtime and `Math.round` hides that exactly
      until the day it does not.
    */
    payload.value_paise = value.trim() ? rupeesToPaise(value) : null;
  }

  const note = formData.get("note");
  if (typeof note === "string" && note.trim()) payload.note = note.trim();

  try {
    await updateLead(id, payload);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      // The API refuses an illegal move by naming both states, which is a
      // sentence written to be read by whoever pressed the button.
      return { error: error.message };
    }

    return { error: "We could not save that. Try again." };
  }

  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/leads");

  return {};
}

export async function addLeadNoteAction(
  id: number,
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const body = formData.get("body");

  if (typeof body !== "string" || !body.trim()) {
    return { error: "Write something first." };
  }

  try {
    await addLeadNote(id, body.trim());
  } catch {
    return { error: "We could not add that note. Try again." };
  }

  revalidatePath(`/admin/leads/${id}`);

  return {};
}

/**
 * Delete, then leave.
 *
 * `redirect()` is outside the try deliberately: it works by throwing, and the
 * error it throws carries `NEXT_REDIRECT` in its `digest` rather than in its
 * message — so a catch that tries to recognise and re-throw it swallows it
 * instead, and the screen reports a failure for something that succeeded.
 */
export async function deleteLeadAction(id: number): Promise<LeadActionState> {
  try {
    await deleteLead(id);
  } catch {
    return { error: "We could not delete that lead." };
  }

  revalidatePath("/admin/leads");
  redirect("/admin/leads?done=lead-deleted");
}
