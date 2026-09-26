import "server-only";
import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import type { CustomerVisit, VisitOptions } from "@/types/api";

/**
 * Engineer visit requests, from the public side (docs/visits.md).
 *
 * The guest reaches their own request with the token the API hands out once,
 * on create. It never stays in an address bar: the link in the email opens
 * `/visit/{reference}/open?token=…`, a route handler that moves the token into
 * an httpOnly cookie scoped to `/visit/{reference}` and redirects to the clean
 * page — so analytics, a shared screenshot and the browser history never see
 * it. Every read and change below passes it back from that cookie.
 */

/** The cookie holding one request's token, named for the request. */
export function visitCookieName(reference: string): string {
  return `tw_visit_${reference.replace(/[^A-Za-z0-9-]/g, "")}`;
}

export function visitCookiePath(reference: string): string {
  return `/visit/${encodeURIComponent(reference)}`;
}

/**
 * The rows a form posts as `preferred.{i}.date` / `preferred.{i}.window`, in
 * order — the names the API gives its errors, so a refusal lands on its row.
 */
export function readPreferred(formData: FormData): { date: string; window: string }[] {
  const rows: { date: string; window: string }[] = [];

  for (let i = 0; i < 3; i++) {
    const date = formData.get(`preferred.${i}.date`);
    const window = formData.get(`preferred.${i}.window`);
    if (date === null && window === null) continue;
    rows.push({ date: typeof date === "string" ? date : "", window: typeof window === "string" ? window : "" });
  }

  return rows;
}

/** What the form offers. Cached for five minutes, the API's own `max-age`. */
export async function getVisitOptions(): Promise<VisitOptions> {
  const res = await apiFetch<{ data: VisitOptions }>("/visits/options", { revalidate: 300, tags: ["visits"] });

  return res.data;
}

export type VisitRequestPayload = {
  name: string;
  email: string;
  phone: string;
  company?: string;
  site_address: Record<string, string | undefined>;
  service_id?: number;
  solution_id?: number;
  location_id?: number;
  notes?: string;
  preferred: { date: string; window: string }[];
  message_opt_in?: string[];
  website?: string;
  _source_url?: string;
  _source_title?: string;
  _referrer?: string;
  _utm_source?: string;
  _utm_medium?: string;
  _utm_campaign?: string;
};

export async function placeVisit(payload: VisitRequestPayload, portalToken?: string | null) {
  return apiFetch<{ message: string; data: { reference: string; access_token: string } }>("/visits", {
    method: "POST", body: payload, token: portalToken ?? undefined,
  });
}

/** The token for this request, from its cookie — or null. */
export async function guestToken(reference: string): Promise<string | null> {
  return (await cookies()).get(visitCookieName(reference))?.value ?? null;
}

export async function getGuestVisit(reference: string, token: string): Promise<CustomerVisit> {
  const res = await apiFetch<{ data: CustomerVisit }>(
    `/visits/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`,
  );

  return res.data;
}

export async function cancelGuestVisit(reference: string, token: string): Promise<CustomerVisit> {
  const res = await apiFetch<{ data: CustomerVisit }>(`/visits/${encodeURIComponent(reference)}/cancel`, {
    method: "POST", body: { token },
  });

  return res.data;
}

export async function rescheduleGuestVisit(
  reference: string, token: string, preferred: { date: string; window: string }[], note?: string,
): Promise<CustomerVisit> {
  const res = await apiFetch<{ data: CustomerVisit }>(`/visits/${encodeURIComponent(reference)}/reschedule`, {
    method: "POST", body: { token, preferred, note },
  });

  return res.data;
}
