import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  AdminMeeting, AdminMeetingIndex, AdminMeetingSlotDate, AdminMeetingType, AdminMeetingTypeIndex,
  MeetingHost, MeetingHostHours, MeetingHostIndex, MeetingSlotRange, MeetingStatus, MeetingsGoogleStatus,
} from "@/types/meetings";

/*
  Online meetings in the console (docs/meetings-contract.md, "Console"). Every
  shape is `@/types/meetings`; every route is one the contract names, so the
  mock (`mock-api.mjs`) and Laravel answer the same calls.
*/

export type MeetingQueryParams = {
  status?: string; host?: string; type?: string; mine?: boolean; from?: string; to?: string;
  q?: string; needs_outcome?: boolean; google?: string; sort?: string; dir?: string;
  page?: number; per_page?: number;
};

/** The query string, built once so the list, the agenda, the pager and the headers agree. */
export function meetingQuery(params: MeetingQueryParams): string {
  const query = new URLSearchParams();
  for (const key of ["status", "host", "type", "from", "to", "q", "google", "sort", "dir"] as const) {
    if (params[key]) query.set(key, String(params[key]));
  }
  for (const key of ["mine", "needs_outcome"] as const) {
    if (params[key]) query.set(key, "1");
  }
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  return query.toString();
}

const ref = (reference: string) => encodeURIComponent(reference);

/* ---- The desk: `role:sales_manager,support_engineer` ---------------------- */

export async function getMeetings(params: MeetingQueryParams = {}): Promise<AdminMeetingIndex> {
  const qs = meetingQuery(params);

  return apiFetch<AdminMeetingIndex>(`/admin/meetings${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getMeeting(reference: string): Promise<AdminMeeting> {
  const res = await apiFetch<{ data: AdminMeeting }>(`/admin/meetings/${ref(reference)}`, { token: await token() });

  return res.data;
}

export type AdminSlotQuery = {
  type: string;
  date: string;
  host?: number | null;
  /** The confirm ticks: widen the answer to times outside working hours / over a Google busy time. */
  outside_hours?: boolean;
  google_busy?: boolean;
  /** A meeting being moved: its own block is left out, so the move can overlap where it is now. */
  exclude?: string | null;
};

/** One day's free times, each with the hosts free for it. */
export async function getAdminMeetingSlots(params: AdminSlotQuery): Promise<AdminMeetingSlotDate> {
  const query = new URLSearchParams({ type: params.type, date: params.date });
  if (params.host) query.set("host", String(params.host));
  if (params.outside_hours) query.set("outside_hours", "1");
  if (params.google_busy) query.set("google_busy", "1");
  if (params.exclude) query.set("exclude", params.exclude);

  const res = await apiFetch<{ data: AdminMeetingSlotDate }>(`/admin/meetings/slots?${query}`, { token: await token() });

  return res.data;
}

/** Counts per day over a range — the day strip above the times. */
export async function getAdminMeetingSlotRange(
  params: { type: string; from: string; to: string; host?: number | null; outside_hours?: boolean; google_busy?: boolean },
): Promise<MeetingSlotRange> {
  const query = new URLSearchParams({ type: params.type, from: params.from, to: params.to });
  if (params.host) query.set("host", String(params.host));
  if (params.outside_hours) query.set("outside_hours", "1");
  if (params.google_busy) query.set("google_busy", "1");

  const res = await apiFetch<{ data: MeetingSlotRange }>(`/admin/meetings/slots?${query}`, { token: await token() });

  return res.data;
}

export type MeetingCreate = {
  type: string;
  start: string;
  host_id?: number | null;
  customer_id?: number | null;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  agenda?: string | null;
  outside_hours?: boolean;
  override_google_busy?: boolean;
};

export async function createMeeting(payload: MeetingCreate): Promise<AdminMeeting> {
  const res = await apiFetch<{ data: AdminMeeting }>("/admin/meetings", {
    method: "POST", body: payload, token: await token(),
  });

  return res.data;
}

export type MeetingUpdate = { staff_note?: string | null; status?: MeetingStatus };

/**
 * The staff note and the outcome. `mine` sends it to `my-meetings`, which a
 * host who is neither sales nor support may reach for their own meetings.
 */
export async function updateMeeting(reference: string, payload: MeetingUpdate, mine = false): Promise<AdminMeeting> {
  const res = await apiFetch<{ data: AdminMeeting }>(`/admin/${mine ? "my-meetings" : "meetings"}/${ref(reference)}`, {
    method: "PATCH", body: payload, token: await token(),
  });

  return res.data;
}

export async function moveMeeting(
  reference: string,
  payload: { start: string; host_id?: number | null; outside_hours?: boolean; override_google_busy?: boolean },
): Promise<AdminMeeting> {
  const res = await apiFetch<{ data: AdminMeeting }>(`/admin/meetings/${ref(reference)}/move`, {
    method: "POST", body: payload, token: await token(),
  });

  return res.data;
}

export async function cancelMeeting(reference: string, reason: string | null): Promise<AdminMeeting> {
  const res = await apiFetch<{ data: AdminMeeting }>(`/admin/meetings/${ref(reference)}/cancel`, {
    method: "POST", body: { reason }, token: await token(),
  });

  return res.data;
}

/** Retry a Google sync that failed. */
export async function resyncMeeting(reference: string): Promise<AdminMeeting> {
  const res = await apiFetch<{ data: AdminMeeting }>(`/admin/meetings/${ref(reference)}/resync`, {
    method: "POST", token: await token(),
  });

  return res.data;
}

/* ---- A host's own diary: `role:meeting_host` ------------------------------ */

export async function getMyMeetings(params: MeetingQueryParams = {}): Promise<AdminMeetingIndex> {
  const qs = meetingQuery(params);

  return apiFetch<AdminMeetingIndex>(`/admin/my-meetings${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getMyMeeting(reference: string): Promise<AdminMeeting> {
  const res = await apiFetch<{ data: AdminMeeting }>(`/admin/my-meetings/${ref(reference)}`, { token: await token() });

  return res.data;
}

/* ---- Types: `role:sales_manager` ------------------------------------------ */

export async function getMeetingTypes(): Promise<AdminMeetingTypeIndex> {
  return apiFetch<AdminMeetingTypeIndex>("/admin/meeting-types", { token: await token() });
}

export async function getMeetingType(id: number): Promise<AdminMeetingType> {
  const res = await apiFetch<{ data: AdminMeetingType }>(`/admin/meeting-types/${id}`, { token: await token() });

  return res.data;
}

export type MeetingTypePayload = {
  name: string;
  slug?: string | null;
  description?: string | null;
  minutes: number;
  buffer_before: number;
  buffer_after: number;
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  /** Empty means every eligible host. */
  host_ids: number[];
};

export async function createMeetingType(payload: MeetingTypePayload): Promise<AdminMeetingType> {
  const res = await apiFetch<{ data: AdminMeetingType }>("/admin/meeting-types", {
    method: "POST", body: payload, token: await token(),
  });

  return res.data;
}

export async function updateMeetingType(id: number, payload: MeetingTypePayload): Promise<AdminMeetingType> {
  const res = await apiFetch<{ data: AdminMeetingType }>(`/admin/meeting-types/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });

  return res.data;
}

export async function deleteMeetingType(id: number): Promise<void> {
  await apiFetch(`/admin/meeting-types/${id}`, { method: "DELETE", token: await token() });
}

/* ---- Hosts: `role:admin` -------------------------------------------------- */

export async function getMeetingHosts(): Promise<MeetingHostIndex> {
  return apiFetch<MeetingHostIndex>("/admin/meeting-hosts", { token: await token() });
}

export async function getMeetingHost(id: number): Promise<MeetingHost> {
  const res = await apiFetch<{ data: MeetingHost }>(`/admin/meeting-hosts/${id}`, { token: await token() });

  return res.data;
}

/** Replaces the host's weekly hours; `[]` puts them back on the defaults. */
export async function saveMeetingHostHours(id: number, hours: MeetingHostHours[]): Promise<MeetingHost> {
  const res = await apiFetch<{ data: MeetingHost }>(`/admin/meeting-hosts/${id}/hours`, {
    method: "PUT", body: { hours }, token: await token(),
  });

  return res.data;
}

export async function addMeetingHostTimeOff(
  id: number, payload: { starts_at: string; ends_at: string; note?: string | null },
): Promise<MeetingHost> {
  const res = await apiFetch<{ data: MeetingHost }>(`/admin/meeting-hosts/${id}/time-off`, {
    method: "POST", body: payload, token: await token(),
  });

  return res.data;
}

export async function deleteMeetingHostTimeOff(id: number, timeOffId: number): Promise<void> {
  await apiFetch(`/admin/meeting-hosts/${id}/time-off/${timeOffId}`, { method: "DELETE", token: await token() });
}

/* ---- The Google Workspace calendar: `role:admin` -------------------------- */

export async function getMeetingsGoogleStatus(): Promise<MeetingsGoogleStatus> {
  const res = await apiFetch<{ data: MeetingsGoogleStatus }>("/admin/meetings/google", { token: await token() });

  return res.data;
}

/** The consent URL. The callback is this site's own path, which the API checks exactly. */
export async function authorizeMeetingsGoogle(origin: string): Promise<string> {
  const res = await apiFetch<{ data: { url: string } }>("/admin/meetings/google/authorize", {
    method: "POST", body: { redirect_uri: `${origin}/admin/meetings/google/callback` }, token: await token(),
  });

  return res.data.url;
}

export async function completeMeetingsGoogle(code: string, state: string): Promise<string> {
  const res = await apiFetch<{ data: { account: string } }>("/admin/meetings/google/callback", {
    method: "POST", body: { code, state }, token: await token(),
  });

  return res.data.account;
}

export async function disconnectMeetingsGoogle(): Promise<void> {
  await apiFetch("/admin/meetings/google/disconnect", { method: "POST", token: await token() });
}

/**
 * One real call with what is saved: the account it signed in as and the
 * calendar it reached. A refusal is a 422 carrying Google's own words.
 */
export async function testMeetingsGoogle(): Promise<{ account: string | null; calendar: string | null }> {
  const res = await apiFetch<{ data: { account?: string | null; calendar?: string | null } }>("/admin/meetings/google/test", {
    method: "POST", token: await token(),
  });

  return { account: res.data?.account ?? null, calendar: res.data?.calendar ?? null };
}
