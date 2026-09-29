/**
 * Online meetings (2026-09-29, docs/meetings.md) — the shapes the API
 * answers with. The contract in words is docs/meetings-contract.md; the
 * two are kept in step by hand, and the mock (`mock-api.mjs`) answers
 * with these.
 *
 * Every time on the wire is ISO 8601 **with its offset**; every label
 * (`date_label`, `time_label`, `timezone`) is written by the API in the
 * app's timezone, because `lib/dates.ts` has none and a server in UTC would
 * draw 04:30 for a 10:00 meeting. Draw the labels; parse the ISO strings
 * only to compare or to work out "your time".
 */

export type MeetingStatus = "scheduled" | "completed" | "no_show" | "cancelled";
export type MeetingSource = "site" | "portal" | "console";
export type MeetingGoogleStatus = "pending" | "synced" | "failed" | "off";

/** A type as the booking page offers it. `type` in every request is the slug. */
export type PublicMeetingType = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  minutes: number;
};

/** `GET /meetings/options` — everything the booking page needs before a day is picked. */
export type MeetingOptions = {
  enabled: boolean;
  types: PublicMeetingType[];
  /** Minutes between possible start times: 15, 30 or 60. */
  step: number;
  min_notice_hours: number;
  max_days: number;
  /** The first and last day that can have a slot, `Y-m-d` in the app's timezone. */
  min_date: string;
  max_date: string;
  /** Closed dates inside that range, `Y-m-d`. */
  holidays: string[];
  /** IANA zone, e.g. `Asia/Kolkata`. */
  timezone: string;
  /** How people read it, e.g. `IST`. */
  timezone_label: string;
  /** Longest agenda accepted, in characters. */
  agenda_max: number;
};

/** One day in the range answer: how many start times are free. 0 for a closed or full day. */
export type MeetingSlotDay = { date: string; count: number };

/** `GET /meetings/slots?type=&from=&to=` — counts per day, every date in the range present. */
export type MeetingSlotRange = {
  type: string;
  from: string;
  to: string;
  timezone: string;
  timezone_label: string;
  days: MeetingSlotDay[];
};

/** One free start time. `start` is what a booking POSTs back, exactly. */
export type MeetingSlot = {
  start: string;
  end: string;
  /** "15:30", in the app's timezone. */
  time_label: string;
};

/** `GET /meetings/slots?type=&date=` — the free times on one day. Never says which host. */
export type MeetingSlotDate = {
  type: string;
  date: string;
  timezone: string;
  timezone_label: string;
  slots: MeetingSlot[];
};

/** The console's slot: the same, plus who is free for it. */
export type AdminMeetingSlot = MeetingSlot & {
  hosts: { id: number; name: string }[];
  /** Outside every candidate host's working hours — offered only when asked for. */
  outside_hours?: boolean;
  /** Only free if a Google busy time is overridden. */
  google_busy?: boolean;
};

export type AdminMeetingSlotDate = Omit<MeetingSlotDate, "slots"> & { slots: AdminMeetingSlot[] };

/** `POST /meetings` → 201. The token appears here and nowhere else. */
export type MeetingBooking = {
  reference: string;
  access_token: string;
  starts_at: string;
  date_label: string;
  time_label: string;
  timezone: string;
};

/** A meeting as its customer sees it — the guest link and the portal. */
export type CustomerMeeting = {
  reference: string;
  status: MeetingStatus;
  status_label: string;
  meeting_type: { name: string; slug: string; minutes: number } | null;
  host_name: string | null;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  agenda: string | null;
  starts_at: string;
  ends_at: string;
  date_label: string;
  /** "15:30 – 16:00". */
  time_label: string;
  timezone: string;
  /** Only while the meeting is scheduled, and only once Google has made it. */
  meet_url: string | null;
  cancel_reason: string | null;
  can_cancel: boolean;
  can_reschedule: boolean;
  reschedules_left: number;
  change_cutoff_hours: number;
  created_at: string | null;
};

export type MeetingTrailEvent = {
  id: number;
  /** booked, rescheduled, cancelled, completed, no_show, note, google_synced, google_failed … */
  type: string;
  from: string | null;
  to: string | null;
  note: string | null;
  actor_name: string | null;
  created_at: string | null;
};

/** A meeting as the desk (and "My meetings") works it. */
export type AdminMeeting = {
  id: number;
  reference: string;
  status: MeetingStatus;
  status_label: string;
  is_open: boolean;
  /** Scheduled and already over — owed an outcome. */
  needs_outcome: boolean;
  allowed_next: { value: MeetingStatus; label: string }[];
  meeting_type?: { id: number; name: string; slug: string; minutes: number } | null;
  meeting_type_id: number;
  host_id: number | null;
  /** Copied onto the row, so it survives the account. */
  host_name: string | null;
  host?: { id: number; name: string; email: string } | null;
  customer_id: number | null;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  agenda: string | null;
  starts_at: string;
  ends_at: string;
  date_label: string;
  time_label: string;
  timezone: string;
  minutes: number;
  blocked_from: string | null;
  blocked_until: string | null;
  source: MeetingSource;
  source_label: string;
  created_by: number | null;
  reschedule_count: number;
  cancel_reason: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  staff_note: string | null;
  lead_id: number | null;
  meet_url: string | null;
  google: {
    status: MeetingGoogleStatus;
    status_label: string;
    event_id: string | null;
    account: string | null;
    attempts: number;
    error: string | null;
  };
  source_url: string | null;
  source_path: string | null;
  source_title: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  admin_path: string;
  /** The detail read only. */
  trail?: MeetingTrailEvent[];
  created_at: string | null;
  updated_at: string | null;
};

export type MeetingStatusOption = { value: MeetingStatus; label: string; open: boolean };

/** `GET /admin/meetings` and `GET /admin/my-meetings`. */
export type AdminMeetingIndex = {
  data: AdminMeeting[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from?: number | null;
    to?: number | null;
    statuses: MeetingStatusOption[];
    types: { id: number; name: string; slug: string; is_active: boolean }[];
    hosts: { id: number; name: string }[];
    sources: { value: MeetingSource; label: string }[];
    needs_outcome_count: number;
    today_count: number;
    google_failed_count: number;
    sorts: string[];
    timezone: string;
    timezone_label: string;
  };
};

/** A meeting type as the console edits it. */
export type AdminMeetingType = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  minutes: number;
  buffer_before: number;
  buffer_after: number;
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  /** Empty means every eligible host. */
  host_ids: number[];
  hosts: { id: number; name: string; eligible: boolean }[];
  meetings_count: number;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminMeetingTypeIndex = {
  data: AdminMeetingType[];
  meta: { eligible_hosts: { id: number; name: string }[] };
};

export type MeetingHostHours = { weekday: number; start: string; end: string };

export type MeetingTimeOff = { id: number; starts_at: string; ends_at: string; note: string | null; label: string };

/** A host on Meetings → Hosts. */
export type MeetingHost = {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  /** No hours of their own: works `meta.default_hours`. */
  uses_default_hours: boolean;
  hours: MeetingHostHours[];
  time_off: MeetingTimeOff[];
  upcoming_count: number;
  /** Whether the connected Google account can read their free/busy. */
  free_busy: "visible" | "unknown" | "not_connected";
};

export type MeetingHostIndex = {
  data: MeetingHost[];
  meta: { default_hours: MeetingHostHours[]; timezone: string; timezone_label: string };
};

/** `GET /admin/meetings/google`. */
export type MeetingsGoogleStatus = {
  is_connected: boolean;
  account: string | null;
  connected_at: string | null;
  client_configured: boolean;
  calendar_id: string | null;
  error: string | null;
  callback_path: string;
  /** Future meetings with a synced event — what disconnecting would strand. */
  synced_future_count: number;
};
