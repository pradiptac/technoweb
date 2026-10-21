import "server-only";
import { apiFetch } from "@/lib/api";
import { token, query } from "./_shared";
import type {
  AnalyticsBreakdown, AnalyticsBreakdownRow, AnalyticsNow, AnalyticsPage, AnalyticsRange, AnalyticsSearch, AnalyticsSummary, LeadSource,
} from "@/types/analytics";

export type { AnalyticsMetric, AnalyticsBreakdown, AnalyticsBreakdownRow, AnalyticsNow, AnalyticsPage, AnalyticsRange, AnalyticsSearch, AnalyticsSummary, LeadSource } from "@/types/analytics";

/** Native analytics (C3): every figure is the API's, and a failed panel is the page's to blank. */
export async function getAnalyticsSummary(range: AnalyticsRange): Promise<AnalyticsSummary> {
  return apiFetch<AnalyticsSummary>(`/admin/analytics/summary${query(range)}`, { token: await token() });
}

export async function getAnalyticsBreakdown(
  dimension: string, range: AnalyticsRange, kind?: string, limit?: number,
): Promise<AnalyticsBreakdown> {
  return apiFetch<AnalyticsBreakdown>(
    `/admin/analytics/breakdown${query({ dimension, from: range.from, to: range.to, kind, limit })}`, { token: await token() },
  );
}

export async function getAnalyticsSearch(range: AnalyticsRange, scope?: "site" | "shop" | "all"): Promise<AnalyticsSearch> {
  return apiFetch<AnalyticsSearch>(
    `/admin/analytics/search${query({ from: range.from, to: range.to, scope })}`, { token: await token() },
  );
}

export async function getAnalyticsPage(path: string, range: AnalyticsRange): Promise<AnalyticsPage> {
  return apiFetch<AnalyticsPage>(`/admin/analytics/pages${query({ path, from: range.from, to: range.to })}`, { token: await token() });
}

export async function getAnalyticsNow(): Promise<AnalyticsNow> {
  return apiFetch<AnalyticsNow>("/admin/analytics/now", { token: await token() });
}

const CONVERSION_KINDS = ["enquiry", "order_placed", "order_paid", "visit_requested", "meeting_booked", "event_registered", "newsletter_signup"];

/** Every conversion kind, summed per channel. The API's breakdown takes one kind at a time. */
export async function getConversionsByChannel(range: AnalyticsRange): Promise<AnalyticsBreakdown> {
  const parts = await Promise.all(CONVERSION_KINDS.map((k) => getAnalyticsBreakdown("channel", range, k, 100)));
  const by = new Map<string, AnalyticsBreakdownRow>();
  for (const row of parts.flatMap((p) => p.data)) {
    const have = by.get(row.key);
    by.set(row.key, have ? { ...have, views: have.views + row.views, value_paise: have.value_paise + row.value_paise } : { ...row, visitors: null, share: null });
  }
  const data = [...by.values()].sort((a, b) => b.views - a.views);
  return { data, meta: { ...parts[0].meta, kind: "conversions", total: data.reduce((n, r) => n + r.views, 0) } };
}

/** Conversions by channel, for the leads screen (`role:sales_manager`). */
export async function getLeadSources(range: AnalyticsRange): Promise<LeadSource[]> {
  const res = await apiFetch<{ data: LeadSource[] }>(`/admin/leads/sources${query({ from: range.from, to: range.to })}`, { token: await token() });
  return res.data;
}
