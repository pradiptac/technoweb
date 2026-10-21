"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPARES, PERIODS, rangeQuery } from "@/lib/analytics-range";

/**
 * The window picker. Links, not state: the choice lives in the URL so the page
 * stays server-rendered and a shared link shows the same figures. A custom
 * range is a plain GET form submitting the same query.
 *
 * `extra` carries what the screen already filters on (the per-page view's
 * `path`) through every link and into the form.
 */
export function AnalyticsPeriod({ basePath, period, compare, from, to, extra }: {
  basePath: string;
  period: string;
  compare: string;
  from: string;
  to: string;
  extra?: Record<string, string>;
}) {
  const href = (q: string) => {
    const e = new URLSearchParams(extra);
    const base = new URLSearchParams(q.replace(/^\?/, ""));
    e.forEach((v, k) => base.set(k, v));
    const qs = base.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const custom = period === "custom" ? { from, to } : undefined;
  const link = (active: boolean) =>
    cn(
      "flex min-h-7 flex-1 items-center justify-center rounded px-2.5 text-12 font-semibold whitespace-nowrap transition-colors duration-(--duration-fast) sm:flex-none",
      active ? "bg-brand-600 text-brand-on" : "text-muted hover:bg-surface-2 hover:text-ink",
    );

  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line pb-3">
      <nav aria-label="Period" className="flex w-full flex-wrap rounded-md border border-line-strong p-0.5 sm:w-auto">
        {PERIODS.map((p) => (
          <Link key={p.value} href={href(rangeQuery(p.value, compare))} scroll={false} aria-current={period === p.value ? "true" : undefined} className={link(period === p.value)}>
            {p.label}
          </Link>
        ))}
      </nav>

      <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
        {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {compare !== "previous" && <input type="hidden" name="compare" value={compare} />}
        <label className="text-11 font-semibold text-faint">
          From
          <Input type="date" name="from" defaultValue={from} required className="mt-0.5 !w-auto" />
        </label>
        <label className="text-11 font-semibold text-faint">
          To
          <Input type="date" name="to" defaultValue={to} required className="mt-0.5 !w-auto" />
        </label>
        <Button type="submit" variant="secondary" size="sm">Show</Button>
      </form>

      <nav aria-label="Compare with" className="flex w-full flex-wrap rounded-md border border-line-strong p-0.5 sm:ml-auto sm:w-auto">
        {COMPARES.map((c) => (
          <Link key={c.value} href={href(rangeQuery(period, c.value, custom))} scroll={false} aria-current={compare === c.value ? "true" : undefined} className={link(compare === c.value)}>
            {c.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
