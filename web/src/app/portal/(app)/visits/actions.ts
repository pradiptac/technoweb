"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { cancelMyVisit, rescheduleMyVisit } from "@/lib/portal";
import { readPreferred } from "@/lib/visits";
import type { VisitManageState } from "@/components/visits/visit-manage";

/** The portal's two moves on a customer's own request — authorised by the session. */
export async function cancelMyVisitAction(reference: string): Promise<VisitManageState> {
  try {
    await cancelMyVisit(reference);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/portal/login");
    if (error instanceof ApiError && error.status === 422) return { error: error.message };
    return { error: "We could not cancel it. Call us and we will." };
  }

  revalidatePath("/portal/visits");
  revalidatePath(`/portal/visits/${reference}`);
  return { ok: "Cancelled." };
}

export async function rescheduleMyVisitAction(reference: string, _prev: VisitManageState, formData: FormData): Promise<VisitManageState> {
  const note = formData.get("note");

  try {
    await rescheduleMyVisit(reference, readPreferred(formData), typeof note === "string" && note.trim() ? note.trim() : undefined);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/portal/login");
    if (error instanceof ApiError && error.status === 422) {
      return { error: error.errors ? "Check the highlighted times." : error.message, fieldErrors: error.errors };
    }
    return { error: "We could not send that. Call us and we will change it." };
  }

  revalidatePath("/portal/visits");
  revalidatePath(`/portal/visits/${reference}`);
  return { ok: "Thank you — we will confirm one of your new times by email." };
}
