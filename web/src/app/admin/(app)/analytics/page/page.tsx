import { PageHeader } from "@/components/admin/page-header";
import { StatTile } from "@/components/admin/stat-tile";
import { Panel } from "@/components/app-shell/panel";
import { Alert } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { IconChart, IconUsers } from "@/components/icons";
import { IconEye } from "@/components/icons-ui";
import { getAnalyticsPage } from "@/lib/admin";
import { rangeQuery, resolveRange, type AnalyticsQuery } from "@/lib/analytics-range";
import { requireScreen } from "@/lib/admin-screen";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { AnalyticsPeriod } from "../analytics-period";

export const metadata = buildMetadata({ title: "Page analytics", path: "/admin/analytics/page", seo: noIndex });

/** One page's own view: its days, where its visitors came from, and what they went on to do. */
export default async function AnalyticsPageView({ searchParams }: { searchParams: Promise<AnalyticsQuery & { path?: string }> }) {
  await requireScreen();
  const q = await searchParams;
  const path = typeof q.path === "string" ? q.path.slice(0, 255) : "";
  const { period, compare, range } = resolveRange(q);
  const qs = rangeQuery(period, compare, period === "custom" ? { from: range.from, to: range.to } : undefined);
  const back = { href: `/admin/analytics${qs}`, label: "Analytics" };

  if (!path) {
    return (
      <>
        <PageHeader title="Page analytics" back={back} />
        <EmptyState title="No page chosen">Open a page from Top pages or Entry pages on the Analytics screen.</EmptyState>
      </>
    );
  }

  const res = await getAnalyticsPage(path, range).catch(() => null);
  if (!res) {
    return (
      <>
        <PageHeader title={path} back={back} />
        <Alert tone="err" dismissible={false} title="This page's figures could not be loaded">The admin API is not responding. Try again shortly.</Alert>
      </>
    );
  }
  if (!res.meta.enabled) {
    return (
      <>
        <PageHeader title={path} back={back} />
        <Alert tone="info" dismissible={false} title="Native analytics is switched off.">Switch it on in Site → Settings, under Analytics.</Alert>
      </>
    );
  }

  const d = res.data;
  const views = d.series.reduce((n, p) => n + p.views, 0);
  const visits = d.series.reduce((n, p) => n + p.visitors, 0);
  const step = Math.max(1, Math.ceil(d.series.length / 8));

  return (
    <>
      <PageHeader title={path} back={back} lede="This page alone, from the individual visits of the last 90 days at most." />
      <AnalyticsPeriod basePath="/admin/analytics/page" period={period} compare={compare} from={range.from} to={range.to} extra={{ path }} />

      <section aria-label="Totals" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Page views" value={views.toLocaleString("en-IN")} icon={IconEye} tone="info" />
        <StatTile label="Visits" value={visits.toLocaleString("en-IN")} icon={IconUsers} tone="brand" />
        <StatTile label="Visits that began here" value={d.entries.toLocaleString("en-IN")} icon={IconChart} tone="neutral" />
      </section>

      <Panel title="Views and visits by day" icon={<IconChart />} className="mt-4">
        <AreaChart
          series={[
            { key: "views", label: "Page views", tone: "brand", values: d.series.map((p) => p.views) },
            { key: "visits", label: "Visits", tone: "info", values: d.series.map((p) => p.visitors) },
          ]}
          labels={d.series.map((p) => p.label)}
          ticks={d.series.map((p, i) => (i % step === 0 ? p.label.split(" ").slice(1).join(" ") : null))}
          csvName="analytics-page"
          summary={`Page views and visits per day for ${path}: ${views} views from ${visits} visits.`}
        />
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Where visitors came from">
          <BarList rows={d.sources.map((r) => ({ label: r.label || "Direct", value: r.views }))} empty="Nothing yet in this period." />
        </Panel>
        <Panel title="Conversions on this page">
          {d.conversions.length === 0 ? (
            <p className="text-12-5 text-muted">Nothing yet in this period.</p>
          ) : (
            <ul className="grid gap-2">
              {d.conversions.map((c) => (
                <li key={c.kind} className="flex items-baseline justify-between gap-3 text-13">
                  <span className="min-w-0 truncate text-ink-2">{c.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {c.count.toLocaleString("en-IN")}
                    {c.value_paise !== null && <span className="ml-2 font-normal text-muted">{formatPaise(c.value_paise)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
