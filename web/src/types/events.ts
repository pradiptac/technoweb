import type { Faq, SchemaGraph, Seo } from "@/types/api";

/**
 * Events, as the public API sends them (docs/events-contract.md).
 *
 * The public shapes only. The console keeps its own admin types — an admin
 * event carries paths where these carry URLs, the join link, the counts —
 * and the two never needed to share a file.
 *
 * **Every label here is the API's.** `date_label`, `time_label`,
 * `format_label`, `status_label`, `closes_label`, `day` and `month` are
 * written by Laravel in `APP_TIMEZONE`; nothing on the website formats an
 * event's date, because a date formatted in the visitor's own zone is a
 * different day for somebody reading from abroad and a hydration mismatch
 * for everybody else.
 */

export type EventFormat = "in_person" | "online" | "hybrid";

/** `none` is an announcement, `open` registers here, `external` links to somebody else's sign-up. */
export type EventRegistrationMode = "none" | "open" | "external";

export type EventRegistrationStatus = "confirmed" | "waitlisted" | "cancelled" | "attended" | "no_show";

/**
 * What the registration panel may offer right now.
 *
 * `waitlist` is "full, and a waiting list is on"; `closed` is past
 * `registration_closes_at`; `ended` is "the event has started".
 */
export type EventAvailabilityState = "none" | "external" | "open" | "waitlist" | "full" | "closed" | "ended";

/** A row of `GET /events`. */
export type EventSummary = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  format: EventFormat;
  format_label: string;
  /** ISO 8601 with the API's offset. Read for `<time dateTime>` only, never formatted here. */
  starts_at: string;
  ends_at: string | null;
  date_label: string;
  time_label: string;
  /** "12" and "Nov" — the date badge, already in the API's timezone. */
  day: string;
  month: string;
  year: string;
  /** Null for an online event. */
  venue_name: string | null;
  venue_city: string | null;
  cover_image: string | null;
  cover_image_alt: string | null;
  cover_image_focus: string | null;
  cover_image_blur?: string | null;
  is_featured: boolean;
  is_past: boolean;
  registration_mode: EventRegistrationMode;
  updated_at: string;
  seo?: Seo | null;
};

export type EventSpeaker = {
  name: string;
  role: string | null;
  photo: string | null;
  photo_alt: string | null;
  photo_focus: string | null;
  photo_blur?: string | null;
};

export type EventAgendaItem = {
  /** Free text the editor typed — "3:00 pm", "After lunch". Never parsed. */
  time: string | null;
  title: string;
  note: string | null;
};

/** The standing rules of an event's registration; what is true *now* is `EventAvailability`. */
export type EventRegistrationRules = {
  mode: EventRegistrationMode;
  external_url: string | null;
  closes_at: string | null;
  closes_label: string | null;
  max_seats: number;
  has_capacity: boolean;
  waitlist: boolean;
};

/** `GET /events/{slug}`. `online_url` is never here: the join link goes to registrants only. */
export type EventDetail = EventSummary & {
  body: string | null;
  venue_address: string | null;
  map_url: string | null;
  speakers: EventSpeaker[];
  agenda: EventAgendaItem[];
  registration: EventRegistrationRules;
  /** The API's own path for the `.ics`. The website serves it at `/api/events/{slug}/calendar`. */
  calendar_path: string;
  faqs?: Faq[];
  faq_schema?: SchemaGraph | null;
  schema?: SchemaGraph | null;
};

/** `GET /events/{slug}/availability` — never cached, and never a count. */
export type EventAvailability = {
  state: EventAvailabilityState;
  few_left: boolean;
  /** A sentence for the states that refuse (`full`, `closed`, `ended`); null otherwise. */
  message: string | null;
};

/**
 * `POST /events/{slug}/register`, 201.
 *
 * **No link to the registration.** The address that views or cancels one
 * carries its token, and the token goes to the inbox that was typed and
 * nowhere else — a response that carried it would hand anybody who typed
 * somebody's address the means to cancel that person's place. A repeat from
 * the same address answers exactly as a first registration does, so there is
 * nothing here to tell the two apart either.
 */
export type EventRegistrationResult = {
  message: string;
  data: {
    status: Extract<EventRegistrationStatus, "confirmed" | "waitlisted">;
    seats: number;
  };
};

export type EventRegistrationPayload = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  seats: number;
  note?: string;
  /** The honeypot. Posted as it arrived; the API answers a filled one like a success. */
  website?: string;
  _source_url?: string;
  _source_title?: string;
  _referrer?: string;
  _utm_source?: string;
  _utm_medium?: string;
  _utm_campaign?: string;
};

/**
 * `GET /events/registrations/{token}` — one registration, for whoever holds
 * its link. No email, phone, note or staff field: the page is addressed by a
 * secret in a URL and shows only what that justifies.
 */
export type EventRegistration = {
  status: EventRegistrationStatus;
  status_label: string;
  seats: number;
  name: string;
  can_cancel: boolean;
  event: {
    title: string;
    slug: string;
    date_label: string;
    time_label: string;
    format: EventFormat;
    format_label: string;
    venue_name: string | null;
    venue_address: string | null;
    is_past: boolean;
    calendar_path: string;
  };
};
