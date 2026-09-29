import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { AdminMeeting, MeetingGoogleStatus, MeetingStatus } from "@/types/meetings";

/*
  The small pieces every meeting screen draws — the list, the agenda, the
  record and a host's own diary. No "use client": a plain component a server
  page and a client panel can both render.
*/

type Tone = NonNullable<ComponentProps<typeof Badge>["tone"]>;

/** One colour per meeting state. */
export const meetingStatusTone: Record<MeetingStatus, Tone> = {
  scheduled: "open",
  completed: "resolved",
  no_show: "urgent",
  cancelled: "closed",
};

export function MeetingStatusBadge({ status, label }: { status: MeetingStatus; label: string }) {
  return <Badge tone={meetingStatusTone[status] ?? "closed"}>{label}</Badge>;
}

/** Whether Google holds the event: waiting is a state, failed is the one to act on. */
export const googleTone: Record<MeetingGoogleStatus, Tone> = {
  pending: "progress",
  synced: "resolved",
  failed: "urgent",
  off: "closed",
};

export function GoogleBadge({ google }: { google: AdminMeeting["google"] }) {
  return <Badge tone={googleTone[google.status] ?? "closed"}>{google.status_label}</Badge>;
}

/** A labelled fact, or nothing at all. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;

  return (
    <div className="min-w-0">
      <dt className="text-11-5 font-semibold uppercase tracking-[.06em] text-faint">{label}</dt>
      <dd className="mt-0.5 break-words text-13">{children}</dd>
    </div>
  );
}

/* ---- Calendar dates, read as dates rather than moments --------------------- */

/** `YYYY-MM-DD` for now, in the app's timezone (the API's `meta.timezone`). */
export function zoneToday(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
}

function utc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
}

/** A bare date `n` days on. */
export function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week holding a bare date. */
export function mondayOf(date: string): string {
  const day = utc(date).getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/** "Mon 5 Oct" for a bare date — a calendar day, whatever zone this runs in. */
export function dayLabel(date: string, withYear = false): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
  }).format(utc(date));
}

export const isBareDate = (value: string | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/**
 * The meeting's own calendar date. The API writes every time with the app
 * timezone's offset, so the first ten characters are that day.
 */
export const meetingDay = (m: Pick<AdminMeeting, "starts_at">) => m.starts_at.slice(0, 10);

/** Whether a meeting has begun — the outcome is refused before. Compared as moments. */
export function hasStarted(startsAt: string): boolean {
  return new Date(startsAt).getTime() <= Date.now();
}

/** How the trail names each event. Unknown types are drawn as they arrive. */
export const EVENT_WORDS: Record<string, string> = {
  booked: "Booked",
  scheduled: "Booked",
  rescheduled: "Moved",
  host_changed: "Host changed",
  cancelled: "Cancelled",
  completed: "Marked held",
  no_show: "Marked no-show",
  status: "Status",
  note: "Note",
  reminded: "Reminder sent",
  google_synced: "In Google Calendar",
  google_failed: "Google sync failed",
  google_retried: "Google sync retried",
  confirmation_sent: "Confirmation sent",
  link_sent: "Meet link sent",
  google_off: "Google sync off",
  link_ready: "Meet link sent",
};
