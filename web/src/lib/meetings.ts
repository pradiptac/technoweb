import "server-only";
import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Paginated } from "@/types/api";
import type { CustomerMeeting, MeetingBooking, MeetingOptions, MeetingSlotDate, MeetingSlotRange } from "@/types/meetings";

/**
 * Online meetings, from the public side and the portal (docs/meetings.md,
 * docs/meetings-contract.md).
 *
 * Only the options are cached — five minutes, the `meetings` tag the
 * console's saves purge — because they are the same for every visitor and
 * the booking page is prerendered from them. Everything else is somebody's
 * own: the slots move with every booking, and a meeting is one person's.
 * Those are fetched without `revalidate`, which is what makes `apiFetch`
 * no-store *and* forward the visitor's address for the API's per-IP limits.
 *
 * The guest's token follows the visits pattern exactly: handed out once on
 * the booking's response, moved straight into an httpOnly cookie scoped to
 * `/meeting/{reference}`, and never in an address bar — the link in the
 * email lands on `/meeting/{reference}/open?token=…`, a route handler that
 * does the same swap and redirects to the clean page.
 */

/** The cookie holding one meeting's token, named for the meeting. */
export function meetingCookieName(reference: string): string {
  return `tw_meeting_${reference.replace(/[^A-Za-z0-9-]/g, "")}`;
}

export function meetingCookiePath(reference: string): string {
  return `/meeting/${encodeURIComponent(reference)}`;
}

/** Ninety days: long enough to outlive any booking window, like the visit's. */
export const MEETING_COOKIE_AGE = 60 * 60 * 24 * 90;

/** A reference as the API holds them to: `MT-2026-00001`. Anything else is a 404 without asking. */
export function isMeetingReference(value: string): boolean {
  return /^[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}$/.test(value);
}

/** What the booking page offers. Cached for five minutes under the `meetings` tag. */
export async function getMeetingOptions(): Promise<MeetingOptions> {
  const res = await apiFetch<{ data: MeetingOptions }>("/meetings/options", { revalidate: 300, tags: ["meetings"] });

  return res.data;
}

/** Free times per day across a range (`from`/`to`) — the day picker's counts. Never cached. */
export async function getMeetingSlotRange(type: string, from: string, to: string): Promise<MeetingSlotRange> {
  const q = new URLSearchParams({ type, from, to });
  const res = await apiFetch<{ data: MeetingSlotRange }>(`/meetings/slots?${q}`);

  return res.data;
}

/** The free start times on one day. Never cached. */
export async function getMeetingSlotDate(type: string, date: string): Promise<MeetingSlotDate> {
  const q = new URLSearchParams({ type, date });
  const res = await apiFetch<{ data: MeetingSlotDate }>(`/meetings/slots?${q}`);

  return res.data;
}

export type MeetingBookingPayload = {
  type: string;
  start: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  agenda?: string;
  message_opt_in?: string[];
  website?: string;
  _source_url?: string;
  _source_title?: string;
  _referrer?: string;
  _utm_source?: string;
  _utm_medium?: string;
  _utm_campaign?: string;
};

/**
 * Book. The portal token goes with it when there is one, so a signed-in
 * customer's meeting is filed under their account — the API reads the guard
 * by name, and a public route without the header sees nobody at all.
 */
export async function bookMeeting(payload: MeetingBookingPayload, portalToken?: string | null) {
  return apiFetch<{ message: string; data: MeetingBooking }>("/meetings", {
    method: "POST", body: payload, token: portalToken ?? undefined,
  });
}

/** The token for this meeting, from its cookie — or null. */
export async function meetingGuestToken(reference: string): Promise<string | null> {
  return (await cookies()).get(meetingCookieName(reference))?.value ?? null;
}

export async function getGuestMeeting(reference: string, token: string): Promise<CustomerMeeting> {
  const res = await apiFetch<{ data: CustomerMeeting }>(
    `/meetings/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`,
  );

  return res.data;
}

export async function cancelGuestMeeting(reference: string, token: string): Promise<CustomerMeeting> {
  const res = await apiFetch<{ data: CustomerMeeting }>(`/meetings/${encodeURIComponent(reference)}/cancel`, {
    method: "POST", body: { token },
  });

  return res.data;
}

export async function rescheduleGuestMeeting(reference: string, token: string, start: string): Promise<CustomerMeeting> {
  const res = await apiFetch<{ data: CustomerMeeting }>(`/meetings/${encodeURIComponent(reference)}/reschedule`, {
    method: "POST", body: { token, start },
  });

  return res.data;
}

/*
 * The portal's half — `my/meetings`, authorised by the session rather than a
 * token in a link, the `my/visits` arrangement. Never cached: a meeting
 * changes when the desk moves it.
 */

export async function getMyMeetings(page = 1): Promise<Paginated<CustomerMeeting>> {
  return apiFetch<Paginated<CustomerMeeting>>(`/my/meetings?page=${page}`, { token: await getToken() });
}

export async function getMyMeeting(reference: string): Promise<CustomerMeeting> {
  const res = await apiFetch<{ data: CustomerMeeting }>(`/my/meetings/${encodeURIComponent(reference)}`, { token: await getToken() });

  return res.data;
}

export async function cancelMyMeeting(reference: string): Promise<CustomerMeeting> {
  const res = await apiFetch<{ data: CustomerMeeting }>(`/my/meetings/${encodeURIComponent(reference)}/cancel`, {
    method: "POST", token: await getToken(),
  });

  return res.data;
}

export async function rescheduleMyMeeting(reference: string, start: string): Promise<CustomerMeeting> {
  const res = await apiFetch<{ data: CustomerMeeting }>(`/my/meetings/${encodeURIComponent(reference)}/reschedule`, {
    method: "POST", body: { start }, token: await getToken(),
  });

  return res.data;
}
