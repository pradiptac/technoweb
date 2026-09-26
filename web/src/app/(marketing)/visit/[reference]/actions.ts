"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { cancelGuestVisit, guestToken, readPreferred, rescheduleGuestVisit } from "@/lib/visits";
import type { VisitManageState } from "@/components/visits/visit-manage";

/**
 * The guest's two moves. The token is read from the cookie the `/open`
 * route handler set — never from the form, where it could be changed to
 * somebody else's.
 */
export async function cancelGuestVisitAction(reference: string, _prev: VisitManageState): Promise<VisitManageState> {
  const token = await guestToken(reference);
  if (!token) return { error: "This link has expired. Open the link in your email again." };

  try {
    await cancelGuestVisit(reference, token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) return { error: error.message };
    return { error: "We could not cancel it. Call us and we will." };
  }

  revalidatePath(`/visit/${reference}`);
  return { ok: "Cancelled." };
}

export async function rescheduleGuestVisitAction(reference: string, _prev: VisitManageState, formData: FormData): Promise<VisitManageState> {
  const token = await guestToken(reference);
  if (!token) return { error: "This link has expired. Open the link in your email again." };

  const note = formData.get("note");

  try {
    await rescheduleGuestVisit(reference, token, readPreferred(formData), typeof note === "string" && note.trim() ? note.trim() : undefined);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return { error: error.errors ? "Check the highlighted times." : error.message, fieldErrors: error.errors };
    }
    return { error: "We could not send that. Call us and we will change it." };
  }

  revalidatePath(`/visit/${reference}`);
  return { ok: "Thank you — we will confirm one of your new times by email." };
}
