"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { cancelMyMeeting, rescheduleMyMeeting } from "@/lib/meetings";
import type { MeetingManageState } from "@/components/meetings/meeting-manage";

/** The portal's two moves on a customer's own meeting — authorised by the session. */
export async function cancelMyMeetingAction(reference: string): Promise<MeetingManageState> {
  try {
    await cancelMyMeeting(reference);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/portal/login");
    if (error instanceof ApiError && error.status === 422) return { error: error.message };
    return { error: "We could not cancel it. Reply to the confirmation email, or call us, and we will." };
  }

  revalidatePath("/portal/meetings");
  revalidatePath(`/portal/meetings/${reference}`);
  return { ok: "Cancelled." };
}

export async function rescheduleMyMeetingAction(
  reference: string, _prev: MeetingManageState, formData: FormData,
): Promise<MeetingManageState> {
  const start = formData.get("start");
  if (typeof start !== "string" || start === "") return { error: "Choose a day and a time first." };

  try {
    await rescheduleMyMeeting(reference, start);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/portal/login");
    if (error instanceof ApiError && error.status === 422) {
      return { error: error.errors?.start?.[0] ?? error.message, fieldErrors: error.errors };
    }
    return { error: "We could not move it. Reply to the confirmation email, or call us, and we will." };
  }

  revalidatePath("/portal/meetings");
  revalidatePath(`/portal/meetings/${reference}`);
  return { ok: "Moved — the invitation in your calendar is updated, and a new confirmation is on its way." };
}
