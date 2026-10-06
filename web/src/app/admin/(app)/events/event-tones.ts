/**
 * An event's status and a registration's status, as `Badge` tones.
 *
 * A directive-less module, so the server-rendered list and the client row
 * share one map — a constant exported from a `"use client"` file reaches a
 * server component as a reference rather than a value. The tones are the
 * badge's own, so each reads in both schemes with no colour of its own.
 *
 * Keyed on the API's values and tolerant of one it has not been told about:
 * an unknown status is the neutral tone, never a crash and never a colour
 * that claims to know what it means.
 */
type Tone = "open" | "progress" | "resolved" | "closed" | "urgent" | "brand" | "accent";

const EVENT: Record<string, Tone> = {
  published: "resolved",
  draft: "progress",
  archived: "closed",
};

/*
  `waitlisted` is amber — somebody is waiting on a place — and `no_show` is
  the one red, since it is the only state that records something going wrong.
  `attended` takes the brand tone rather than a second green: it is standing,
  not a state anybody acts on.
*/
const REGISTRATION: Record<string, Tone> = {
  confirmed: "resolved",
  waitlisted: "progress",
  cancelled: "closed",
  attended: "brand",
  no_show: "urgent",
};

export function eventStatusTone(status: string): Tone {
  return EVENT[status] ?? "closed";
}

export function registrationStatusTone(status: string): Tone {
  return REGISTRATION[status] ?? "closed";
}
