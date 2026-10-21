import "server-only";
import { apiFetch } from "@/lib/api";
import { token, query } from "./_shared";
import type {
  AnalyticsBreakdown, AnalyticsNow, AnalyticsPage, AnalyticsRange, AnalyticsSearch, AnalyticsSummary, LeadSource,
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

/** Every counted conversion, per channel: `kind=conversions` is the API's own list (a paid order counts, a placed one does not). */
export async function getConversionsByChannel(range: AnalyticsRange): Promise<AnalyticsBreakdown> {
  return getAnalyticsBreakdown("channel", range, "conversions", 100);
}

/** Conversions by channel, for the leads screen (`role:sales_manager`). */
export async function getLeadSources(range: AnalyticsRange): Promise<LeadSource[]> {
  const res = await apiFetch<{ data: LeadSource[] }>(`/admin/leads/sources${query({ from: range.from, to: range.to })}`, { token: await token() });
  return res.data;
}
