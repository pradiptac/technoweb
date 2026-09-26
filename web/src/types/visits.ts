/**
 * Engineer visit requests (2026-09-26, docs/visits.md) — the shapes the API
 * answers with. The customer offers up to three dates with a part of the day
 * each; the desk picks the appointment.
 */
import type { StoredAddress } from "./api";

export type VisitStatus = "requested" | "confirmed" | "completed" | "cancelled" | "no_show";

/** A part of the day offered, from the `visit_windows` setting. */
export type VisitWindow = { value: string; label: string; start: string; end: string };

/** `GET /visits/options` — everything the request form offers. */
export type VisitOptions = {
  enabled: boolean;
  windows: VisitWindow[];
  /** ISO weekdays offered, 1 = Monday. */
  days: number[];
  min_date: string;
  max_date: string;
  holidays: string[];
  max_preferred: number;
  services: { id: number; title: string; slug: string; location_ids: number[] }[];
  solutions: { id: number; title: string; slug: string }[];
  locations: { id: number; name: string; slug: string }[];
};

/** One preferred time: the stored pair, and the words it reads as today. */
export type VisitPreferred = { date: string; window: string; label: string };

/** A visit request as its customer sees it — the guest link and the portal. */
export type CustomerVisit = {
  reference: string;
  status: VisitStatus;
  status_label: string;
  topic: string;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  site_address: StoredAddress | null;
  notes: string | null;
  preferred: VisitPreferred[];
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  visit_date: string;
  visit_time: string;
  cancel_reason: string | null;
  can_cancel: boolean;
  can_reschedule: boolean;
  created_at: string | null;
};

export type VisitEvent = {
  id: number;
  type: string;
  from: string | null;
  to: string | null;
  note: string | null;
  actor_name: string | null;
  created_at: string | null;
};

/** A visit request as the desk works it. */
export type AdminVisit = Omit<CustomerVisit, "can_cancel" | "can_reschedule"> & {
  id: number;
  is_open: boolean;
  allowed_next: { value: VisitStatus; label: string }[];
  customer_id: number | null;
  service: { id: number; title: string; slug: string } | null;
  solution: { id: number; title: string; slug: string } | null;
  location?: { id: number; name: string } | null;
  assigned_to: number | null;
  assignee_name?: string | null;
  staff_note: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  reminded_at: string | null;
  lead_id: number | null;
  source_url: string | null;
  source_path: string | null;
  source_title: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  admin_path: string;
  events?: VisitEvent[];
  updated_at: string | null;
};

export type AdminVisitIndex = {
  data: AdminVisit[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from?: number | null;
    to?: number | null;
    statuses: { value: VisitStatus; label: string; open: boolean }[];
    awaiting_count: number;
    today_count: number;
    unassigned_count: number;
    assignees: { id: number; name: string }[];
    sorts: string[];
    default_minutes: number;
    windows: VisitWindow[];
  };
};
