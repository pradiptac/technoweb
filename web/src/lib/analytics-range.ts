import { istDate } from "@/lib/visit-dates";
import type { AnalyticsRange } from "@/types/analytics";

/**
 * The window the Analytics screens share, read from the URL so the pages stay
 * server-rendered (C3). No directive: the server pages resolve it and the
 * client picker draws its links from the same list.
 */
export const PERIODS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
] as const;

export const COMPARES = [
  { value: "previous", label: "Previous period" },
  { value: "year", label: "Same dates last year" },
  { value: "none", label: "No comparison" },
] as const;

export type AnalyticsQuery = { period?: string; compare?: string; from?: string; to?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` shifted by whole days, as a calendar date. */
function shift(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** What the picker shows as chosen, and what the API is asked for. */
export function resolveRange(q: AnalyticsQuery, today: string = istDate()): {
  period: string; compare: "previous" | "year" | "none"; range: Required<Pick<AnalyticsRange, "from" | "to">> & { compare: "previous" | "year" | "none" };
} {
  const compare = q.compare === "year" || q.compare === "none" ? q.compare : "previous";
  const custom = q.from && q.to && DAY.test(q.from) && DAY.test(q.to);
  const period = custom ? "custom" : (PERIODS.some((p) => p.value === q.period) ? (q.period as string) : "30");
  let from: string;
  let to = today;

  if (custom) {
    [from, to] = q.from! <= q.to! ? [q.from!, q.to!] : [q.to!, q.from!];
  } else if (period === "month") {
    from = `${today.slice(0, 8)}01`;
  } else if (period === "last-month") {
    const first = `${today.slice(0, 8)}01`;
    to = shift(first, -1);
    from = `${to.slice(0, 8)}01`;
  } else {
    from = shift(today, -(Number(period) - 1));
  }

  return { period, compare, range: { from, to, compare } };
}

/** The query that carries a window from one screen to the next. */
export function rangeQuery(period: string, compare: string, custom?: { from: string; to: string }): string {
  const p = new URLSearchParams();
  if (custom) {
    p.set("from", custom.from);
    p.set("to", custom.to);
  } else if (period !== "30") p.set("period", period);
  if (compare !== "previous") p.set("compare", compare);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

/** One page's own view, carrying the window the list was drawn for. */
export function pageViewHref(path: string, qs: string): string {
  return `/admin/analytics/page?path=${encodeURIComponent(path)}${qs ? `&${qs.slice(1)}` : ""}`;
}
