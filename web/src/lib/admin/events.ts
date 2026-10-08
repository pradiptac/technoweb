import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { FaqItem, Paginated, Seo, SeoOverride } from "@/types/api";

/**
 * Events, as the console reads and writes them (docs/events-contract.md).
 *
 * The types here are the **admin** shape and deliberately lean on nothing in
 * the public site's own event types: the console sees `online_url`, every
 * draft, the stored paths beside their URLs, and the registration counts —
 * none of which a public read carries. Two shapes that overlap today are
 * still two shapes, the rule `lib/admin/forms.ts` states for forms.
 *
 * **Every label is the API's.** `date_label`, `time_label`, `format_label`
 * and `status_label` are drawn as sent; nothing in the console formats an
 * event's date, because an event's time is a wall clock in the site's zone
 * and the browser's idea of "now" has no business in it.
 */

export type EventOption = { value: string; label: string };

/** A registration mode, with the sentence that says what choosing it does. */
export type EventModeOption = EventOption & { blurb?: string | null };

/**
 * What the form's pickers are drawn from — `meta` on the index, the read and
 * both writes. Never written out in TypeScript, the `meta.kinds` rule.
 */
export type EventMeta = {
  formats: EventOption[];
  statuses: EventOption[];
  registration_modes: EventModeOption[];
  registration_statuses: EventOption[];
  max_speakers: number;
  max_agenda: number;
  /** The site's zone as people say it — "IST" — for the hint under a time. */
  timezone: string;
};

export type EventCounts = {
  /** Registrations, not seats: one registration may hold several. */
  confirmed: number;
  confirmed_seats: number;
  waitlisted: number;
  cancelled: number;
  attended: number;
  /** Null when the event has no capacity. */
  seats_left: number | null;
};

export type AdminEventSpeaker = {
  name: string;
  role: string | null;
  photo_path: string | null;
  /** The resolved URL, for the preview; never posted. */
  photo?: string | null;
};

export type AdminEventAgendaItem = { time: string | null; title: string; note: string | null };

export type AdminEvent = import("@/types/page-sections").AdminRecordSections & {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  body?: string | null;
  status: string;
  status_label: string;
  is_featured: boolean;
  format: string;
  format_label: string;
  /** Wall-clock `Y-m-d\TH:i` in the site's zone — what a `datetime-local` input holds. */
  starts_at: string;
  ends_at: string | null;
  /** The instant, with its offset. */
  starts_at_iso?: string;
  date_label: string;
  time_label: string;
  is_past: boolean;
  venue_name: string | null;
  venue_city: string | null;
  venue_address?: string | null;
  map_url?: string | null;
  /** The join link. Console only: it never appears on a public read. */
  online_url?: string | null;
  cover_image_path?: string | null;
  cover_image?: string | null;
  speakers?: AdminEventSpeaker[];
  agenda?: AdminEventAgendaItem[];
  registration_mode: string;
  external_url?: string | null;
  capacity: number | null;
  waitlist_enabled: boolean;
  max_seats: number;
  registration_closes_at?: string | null;
  counts: EventCounts;
  public_path: string;
  admin_path: string;
  /** Detail read only. */
  faqs?: FaqItem[];
  seo?: SeoOverride;
  seo_defaults?: Seo;
  created_at?: string;
  updated_at?: string;
};

export type EventSpeakerPayload = { name: string; role: string | null; photo_path: string | null };

export type EventPayload = {
  /** Sections in place of the written body (0.130.0); absent leaves both alone. */
  body_layout?: import("@/types/page-sections").RecordBodyLayout;
  blocks?: import("@/types/page-sections").StoredSection[];
  title: string;
  slug: string | null;
  summary: string | null;
  body: string | null;
  status: string;
  is_featured: boolean;
  format: string;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_address: string | null;
  map_url: string | null;
  online_url: string | null;
  cover_image_path: string | null;
  /** Replaced wholesale; `[]` clears, and the key is always sent by the form. */
  speakers: EventSpeakerPayload[];
  agenda: AdminEventAgendaItem[];
  registration_mode: string;
  external_url: string | null;
  capacity: number | null;
  waitlist_enabled: boolean;
  /** Omitted when blank, so a new event takes the default from Events → Settings. */
  max_seats?: number;
  registration_closes_at: string | null;
  faqs: FaqItem[];
  seo?: Record<string, string | boolean | string[] | null>;
  /** Update only: email everyone with a confirmed place about a new time, place or join link. */
  notify_registrants?: boolean;
};

export type EventQueryParams = {
  status?: string; when?: string; format?: string; q?: string;
  sort?: string; dir?: string; page?: number; per_page?: number;
};

type EventIndex = Paginated<AdminEvent> & { meta: Paginated<AdminEvent>["meta"] & Partial<EventMeta> };

/** The fallbacks for an API that sends a thinner `meta` than the contract — never empty selects. */
const META_FALLBACK: EventMeta = {
  formats: [
    { value: "in_person", label: "In person" },
    { value: "online", label: "Online" },
    { value: "hybrid", label: "In person and online" },
  ],
  statuses: [
    { value: "draft", label: "Draft" },
    { value: "published", label: "Published" },
    { value: "archived", label: "Archived" },
  ],
  registration_modes: [
    { value: "none", label: "No registration" },
    { value: "open", label: "Register on this site" },
    { value: "external", label: "Register somewhere else" },
  ],
  registration_statuses: [
    { value: "confirmed", label: "Confirmed" },
    { value: "waitlisted", label: "On the waiting list" },
    { value: "cancelled", label: "Cancelled" },
    { value: "attended", label: "Attended" },
    { value: "no_show", label: "No-show" },
  ],
  max_speakers: 12,
  max_agenda: 30,
  timezone: "IST",
};

/** Only the keys this module names, so pagination figures never ride along as "meta". */
function pickMeta(meta: Partial<EventMeta> | undefined | null): EventMeta {
  const list = <T,>(value: T[] | undefined, fallback: T[]) => (Array.isArray(value) && value.length ? value : fallback);

  return {
    formats: list(meta?.formats, META_FALLBACK.formats),
    statuses: list(meta?.statuses, META_FALLBACK.statuses),
    registration_modes: list(meta?.registration_modes, META_FALLBACK.registration_modes),
    registration_statuses: list(meta?.registration_statuses, META_FALLBACK.registration_statuses),
    max_speakers: typeof meta?.max_speakers === "number" ? meta.max_speakers : META_FALLBACK.max_speakers,
    max_agenda: typeof meta?.max_agenda === "number" ? meta.max_agenda : META_FALLBACK.max_agenda,
    timezone: typeof meta?.timezone === "string" && meta.timezone ? meta.timezone : META_FALLBACK.timezone,
  };
}

export async function getEvents(params: EventQueryParams = {}): Promise<{ data: AdminEvent[]; meta: Paginated<AdminEvent>["meta"]; options: EventMeta }> {
  const res = await apiFetch<EventIndex>(`/admin/events${query(params)}`, { token: await token() });

  return { data: res.data, meta: res.meta, options: pickMeta(res.meta) };
}

/**
 * The form's option lists without an event to read them off.
 *
 * `/admin/events/new` has no record, so it asks the index for one row and
 * keeps the `meta` — the reason `/admin/forms/new` does the same.
 */
export async function getEventMeta(): Promise<EventMeta> {
  return (await getEvents({ per_page: 1 })).options;
}

export async function getEventWithMeta(id: number): Promise<{ event: AdminEvent; meta: EventMeta }> {
  const res = await apiFetch<{ data: AdminEvent; meta?: Partial<EventMeta> }>(`/admin/events/${id}`, { token: await token() });

  return { event: res.data, meta: pickMeta(res.meta) };
}

export async function createEvent(payload: EventPayload): Promise<AdminEvent> {
  const res = await apiFetch<{ data: AdminEvent }>("/admin/events", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateEvent(id: number, payload: Partial<EventPayload>): Promise<AdminEvent> {
  const res = await apiFetch<{ data: AdminEvent }>(`/admin/events/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

/** Refused with a 422 on `event` while the event has registrations: archive it instead. */
export async function deleteEvent(id: number): Promise<void> {
  await apiFetch<void>(`/admin/events/${id}`, { method: "DELETE", token: await token() });
}

/** A draft copy — "(copy)", a free slug, no registrations. */
export async function duplicateEvent(id: number): Promise<AdminEvent> {
  const res = await apiFetch<{ data: AdminEvent }>(`/admin/events/${id}/duplicate`, { method: "POST", token: await token() });
  return res.data;
}

/* ------------------------------------------------------------ registrations */

export type AdminEventRegistration = {
  id: number;
  event_id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  seats: number;
  /** What the registrant wrote. Plain text, from a stranger: rendered as text, never as markup. */
  note: string | null;
  /** The desk's own note. Never on a public read. */
  staff_note: string | null;
  status: string;
  status_label: string;
  customer_id: number | null;
  lead_id: number | null;
  /** A console path, or null when no lead was filed. */
  lead_path: string | null;
  /** `public` (the event's page) or `staff` (added here). */
  source: string;
  reminded_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  /**
   * The statuses this registration may move to, itself first — when the API
   * sends them. The moves are a fixed table on the API's side
   * (`EventRegistrationStatus::canTransitionTo()`), and a copy of it here
   * would be the second hand-written list; absent, the row offers every
   * status and shows the API's refusal for a move it will not make.
   */
  allowed_next?: EventOption[];
};

/**
 * The event a registrations list belongs to, as `meta.event` sends it.
 *
 * The contract names `id`, `title`, `date_label`, `counts` and `capacity`.
 * Everything else is optional and read when present: this screen is open to
 * the sales desk as well, which cannot read the event itself, so `meta.event`
 * is the only thing it can learn about the event from. `has_started` is what
 * decides whether "Attended" and "No-show" are offered — the API's answer,
 * never the browser's clock; absent, the options are offered and the API
 * refuses the ones it will not take.
 */
export type EventRegistrationEvent = {
  id: number;
  title: string;
  date_label: string;
  time_label?: string | null;
  format_label?: string | null;
  status?: string;
  status_label?: string;
  counts: EventCounts;
  capacity: number | null;
  max_seats?: number | null;
  registration_mode?: string;
  waitlist_enabled?: boolean;
  has_started?: boolean;
  is_past?: boolean;
  public_path?: string | null;
};

export type EventRegistrationIndex = Paginated<AdminEventRegistration> & {
  meta: Paginated<AdminEventRegistration>["meta"] & { event: EventRegistrationEvent; statuses?: EventOption[] };
};

export async function getEventRegistrations(
  eventId: number, params: { status?: string; q?: string; page?: number; per_page?: number } = {},
): Promise<EventRegistrationIndex> {
  return apiFetch<EventRegistrationIndex>(`/admin/events/${eventId}/registrations${query(params)}`, { token: await token() });
}

export type EventRegistrationPayload = {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  seats: number;
  note: string | null;
  /** Go past the capacity, or a closing time that has passed. */
  force: boolean;
  /** False adds the registration without emailing its confirmation. */
  notify: boolean;
};

export async function createEventRegistration(eventId: number, payload: EventRegistrationPayload): Promise<AdminEventRegistration> {
  const res = await apiFetch<{ data: AdminEventRegistration }>(`/admin/events/${eventId}/registrations`, {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export type EventRegistrationUpdate = {
  status?: string;
  seats?: number;
  staff_note?: string | null;
  /** Confirm a party, or grow one, past the capacity. The desk may overbook, but only by saying so. */
  force?: boolean;
};

export async function updateEventRegistration(
  eventId: number, registrationId: number, payload: EventRegistrationUpdate,
): Promise<AdminEventRegistration> {
  const res = await apiFetch<{ data: AdminEventRegistration }>(`/admin/events/${eventId}/registrations/${registrationId}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

/** For good. There is no bin for a registration. */
export async function deleteEventRegistration(eventId: number, registrationId: number): Promise<void> {
  await apiFetch<void>(`/admin/events/${eventId}/registrations/${registrationId}`, { method: "DELETE", token: await token() });
}
