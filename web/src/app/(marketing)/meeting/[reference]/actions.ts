"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { cancelGuestMeeting, meetingGuestToken, rescheduleGuestMeeting } from "@/lib/meetings";
import type { MeetingManageState } from "@/components/meetings/meeting-manage";

/**
 * The guest's two moves. The token is read from the cookie the `/open`
 * route handler (or the booking) set — never from the form, where it could
 * be changed to somebody else's.
 */
export async function cancelGuestMeetingAction(reference: string): Promise<MeetingManageState> {
  const token = await meetingGuestToken(reference);
  if (!token) return { error: "This link has expired. Open the link in your email again." };

  try {
    await cancelGuestMeeting(reference, token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) return { error: error.message };
    return { error: "We could not cancel it. Reply to the confirmation email, or call us, and we will." };
  }

  revalidatePath(`/meeting/${reference}`);
  return { ok: "Cancelled." };
}

export async function rescheduleGuestMeetingAction(
  reference: string, _prev: MeetingManageState, formData: FormData,
): Promise<MeetingManageState> {
  const token = await meetingGuestToken(reference);
  if (!token) return { error: "This link has expired. Open the link in your email again." };

  const start = formData.get("start");
  if (typeof start !== "string" || start === "") return { error: "Choose a day and a time first." };

  try {
    await rescheduleGuestMeeting(reference, token, start);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return { error: error.errors?.start?.[0] ?? error.message, fieldErrors: error.errors };
    }
    return { error: "We could not move it. Reply to the confirmation email, or call us, and we will." };
  }

  revalidatePath(`/meeting/${reference}`);
  return { ok: "Moved — the invitation in your calendar is updated, and a new confirmation is on its way." };
}
