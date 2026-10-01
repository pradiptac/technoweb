"use server";

import { cookies } from "next/headers";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import {
  MEETING_COOKIE_AGE, bookMeeting, getGuestMeeting, meetingCookieName, meetingCookiePath, type MeetingBookingPayload,
} from "@/lib/meetings";

export type MeetingBookingState = {
  ok?: boolean;
  reference?: string;
  email?: string;
  date_label?: string;
  time_label?: string;
  timezone?: string;
  starts_at?: string;
  meet_url?: string | null;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Book the meeting, then say what happens next (docs/meetings.md).
 *
 * The portal token is forwarded when there is one, so a signed-in customer's
 * meeting is filed under their account — the API reads the guard by name,
 * and without the header a public route sees nobody.
 *
 * The access token comes back once. It goes straight into an httpOnly cookie
 * scoped to `/meeting/{reference}`, so the success panel's "manage it" link
 * opens the meeting without the secret ever being in a URL — the checkout's
 * and the visit's arrangement. The same token is used once more, here, to
 * ask whether Google has made the Meet link already; usually it has not (the
 * calendar event is made by a queued job) and the panel says it will arrive
 * by email.
 *
 * A 422 on `start` is the one refusal the form treats specially: somebody
 * else took the time while this person was typing. The client clears the
 * choice and asks for the times again when it sees that key.
 */
export async function bookMeetingAction(_prev: MeetingBookingState, formData: FormData): Promise<MeetingBookingState> {
  const value = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
  };

  const payload: MeetingBookingPayload = {
    type: value("type") ?? "",
    start: value("start") ?? "",
    name: value("name") ?? "",
    email: value("email") ?? "",
    phone: value("phone") ?? "",
    company: value("company"),
    agenda: value("agenda"),
    message_opt_in: formData.getAll("message_opt_in").map(String),
    website: value("website"),
    _source_url: value("_source_url"),
    _source_title: value("_source_title"),
    _referrer: value("_referrer"),
    _utm_source: value("_utm_source"),
    _utm_medium: value("_utm_medium"),
    _utm_campaign: value("_utm_campaign"),
  };

  if (!payload.start) {
    return { error: "Choose a day and a time first.", fieldErrors: { start: ["Choose a day and a time first."] } };
  }

  let booking;

  try {
    booking = (await bookMeeting(payload, await getToken())).data;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) {
        return {
          error: error.errors?.start?.[0] ?? "Check the highlighted fields.",
          fieldErrors: error.errors,
        };
      }
      if (error.status === 429) return { error: "That is a lot of bookings in a short time. Wait a minute and try again." };
      if (error.status === 403) return { error: error.message };
    }

    return { error: "We could not book it. Call us and we will set the meeting up over the phone." };
  }

  (await cookies()).set(meetingCookieName(booking.reference), booking.access_token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: meetingCookiePath(booking.reference), maxAge: MEETING_COOKIE_AGE,
  });

  const meetUrl = await getGuestMeeting(booking.reference, booking.access_token)
    .then((m) => m.meet_url)
    .catch(() => null);

  return {
    ok: true,
    reference: booking.reference,
    email: payload.email,
    date_label: booking.date_label,
    time_label: booking.time_label,
    timezone: booking.timezone,
    starts_at: booking.starts_at,
    meet_url: meetUrl,
  };
}
