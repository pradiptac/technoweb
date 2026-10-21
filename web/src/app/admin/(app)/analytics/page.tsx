import type { ReactNode, SVGProps } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { StatTile, type Tone } from "@/components/admin/stat-tile";
import { Panel } from "@/components/app-shell/panel";
import { Alert } from "@/components/ui/input";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList, type BarRow } from "@/components/charts/bar-list";
import { IconChart, IconGauge, IconUsers } from "@/components/icons";
import { IconCart, IconEye, IconSearchChart } from "@/components/icons-ui";
import {
  getAnalyticsBreakdown, getAnalyticsNow, getAnalyticsSearch, getAnalyticsSummary, getConversionsByChannel,
  type AnalyticsBreakdown, type AnalyticsMetric,
} from "@/lib/admin";
import { PERIODS, pageViewHref, rangeQuery, resolveRange, type AnalyticsQuery } from "@/lib/analytics-range";
import { requireScreen } from "@/lib/admin-screen";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { AnalyticsPeriod } from "./analytics-period";
import { NowTile } from "./now-tile";

export const metadata = buildMetadata({ title: "Analytics", path: "/admin/analytics", seo: noIndex });

const COMPARE_CAPTION = { previous: "vs the period before", year: "vs the same dates last year", none: undefined } as const;

type Icon = (p: SVGProps<SVGSVGElement>) => React.ReactElement;

/** A panel that failed blanks itself and nothing else. */
const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

/** The rows of a breakdown as bars; `link` turns a row into its page's own view. */
function bars(b: AnalyticsBreakdown, link?: (key: string) => string): BarRow[] {
  return b.data.map((r) => ({ label: r.label || "(unknown)", value: r.views, href: link?.(r.key) }));
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<AnalyticsQuery> }) {
  await requireScreen();
  const { period, compare, range } = resolveRange(await searchParams);
  const qs = rangeQuery(period, compare, period === "custom" ? { from: range.from, to: range.to } : undefined);

  const summary = await safe(getAnalyticsSummary(range));
  const head = (
    <PageHeader title="Analytics" lede="Visits counted by this site itself, without cookies. Figures for today update as visitors arrive; earlier days are final." />
  );

  if (!summary) {
    return (
      <>
        {head}
        <Alert tone="err" dismissible={false} title="Analytics could not be loaded">The admin API is not responding. Try again shortly.</Alert>
      </>
    );
  }
  if (!summary.meta.enabled) {
    return (
      <>
        {head}
        <Alert tone="info" dismissible={false} title="Native analytics is switched off.">Switch it on in Site → Settings, under Analytics.</Alert>
      </>
    );
  }

  const [pages, entries, channels, sources, campaigns, devices, browsers, countries, conversions, terms, search, outbound, downloads, contacts, now] = await Promise.all([
    safe(getAnalyticsBreakdown("page", range, "pageview", 10)),
    safe(getAnalyticsBreakdown("entry", range, "pageview", 10)),
    safe(getAnalyticsBreakdown("channel", range, "pageview", 10)),
    safe(getAnalyticsBreakdown("source", range, "pageview", 10)),
    safe(getAnalyticsBreakdown("campaign", range, "pageview", 10)),
    safe(getAnalyticsBreakdown("device", range, "pageview", 10)),
    safe(getAnalyticsBreakdown("browser", range, "pageview", 10)),
    safe(getAnalyticsBreakdown("country", range, "pageview", 10)),
    safe(getConversionsByChannel(range)),
    safe(getAnalyticsBreakdown("target", range, "search", 10)),
    safe(getAnalyticsSearch(range, "all")),
    safe(getAnalyticsBreakdown("target", range, "outbound", 10)),
    safe(getAnalyticsBreakdown("target", range, "download", 10)),
    safe(getAnalyticsBreakdown("target", range, "contact", 10)),
    safe(getAnalyticsNow()),
  ]);

  const s = summary.data;
  const caption = COMPARE_CAPTION[s.compare];
  const num = (m: AnalyticsMetric, f: (v: number) => string = (v) => v.toLocaleString("en-IN")) => (m.value === null ? "—" : f(m.value));
  const tile = (label: string, m: AnalyticsMetric, icon: Icon, value: string, tone: Tone, goodWhen: "up" | "down" = "up") => (
    <StatTile
      key={label}
      label={label}
      value={value}
      icon={icon}
      tone={tone}
      delta={s.compare === "none" ? undefined : { change: m.change, caption: m.change === null ? "Nothing to compare" : caption, goodWhen }}
    />
  );

  const step = Math.max(1, Math.ceil(s.series.length / 8));
  const hasPrevious = s.compare !== "none" && s.series.every((p) => p.previous_views !== null);
  const toLink = (path: string) => pageViewHref(path, qs);
  const csv = (dimension: string, kind = "pageview") =>
    `/api/admin/analytics/export?dimension=${dimension}&kind=${kind}&from=${range.from}&to=${range.to}`;

  const failed = <p className="text-12-5 text-muted">This panel could not be loaded.</p>;
  const panel = (title: string, body: ReactNode, exportHref?: string) => (
    <Panel key={title} title={title} actions={exportHref && <a href={exportHref} download className="text-13 text-brand-ink underline">CSV</a>}>
      {body}
    </Panel>
  );
  const list = (b: AnalyticsBreakdown | null, link?: (key: string) => string) =>
    b === null ? failed : <BarList rows={bars(b, link)} empty="Nothing yet in this period." />;

  return (
    <>
      {head}
      <AnalyticsPeriod basePath="/admin/analytics" period={period} compare={compare} from={range.from} to={range.to} />
      <p className="-mt-2 mb-4 text-12-5 text-muted">
        {s.range.label}
        {" · "}
        {PERIODS.find((p) => p.value === period)?.label ?? "Custom range"}
      </p>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {tile("Visits", s.visits, IconUsers, num(s.visits), "brand")}
        {tile("Page views", s.views, IconEye, num(s.views), "info")}
        {tile("Views per visit", s.views_per_visit, IconGauge, num(s.views_per_visit, (v) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 })), "neutral")}
        {tile("Bounce rate", s.bounce_share, IconChart, num(s.bounce_share, (v) => `${v}%`), "warn", "down")}
        {tile("Conversions", s.conversions, IconSearchChart, num(s.conversions), "ok")}
        {tile("Revenue", s.revenue_paise, IconCart, num(s.revenue_paise, (v) => formatPaise(v)), "ok")}
        <NowTile initial={now?.data ?? null} />
      </section>

      <Panel title="Views and visits by day" icon={<IconChart />} className="mt-4">
        <AreaChart
          series={[
            { key: "views", label: "Page views", tone: "brand", values: s.series.map((p) => p.views), previous: hasPrevious ? s.series.map((p) => p.previous_views ?? 0) : undefined },
            { key: "visits", label: "Visits", tone: "info", values: s.series.map((p) => p.visitors) },
          ]}
          labels={s.series.map((p) => p.label)}
          ticks={s.series.map((p, i) => (i % step === 0 ? p.label.split(" ").slice(1).join(" ") : null))}
          previousLabel={s.compare === "year" ? "Same dates last year" : "Period before"}
          csvName="analytics-by-day"
          summary={`Page views and visits per day, ${s.range.label}: ${s.views.value ?? 0} views from ${s.visits.value ?? 0} visits.`}
        />
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {panel("Top pages", list(pages, toLink), csv("page"))}
        {panel("Entry pages", list(entries, toLink), csv("entry"))}
        {panel("Channels", list(channels), csv("channel"))}
        {panel("Sources", list(sources), csv("source"))}
        {panel("Campaigns", list(campaigns), csv("campaign"))}
        {panel("Devices", list(devices), csv("device"))}
        {panel("Browsers", list(browsers), csv("browser"))}
        {panel("Countries", list(countries), csv("country"))}
        {panel("Conversions by channel", list(conversions))}
        {panel("Searches", list(terms), csv("target", "search"))}
        {panel(
          "Searches that found nothing",
          search === null ? failed : <BarList rows={search.data.nothing.map((t) => ({ label: t.term, value: t.searches }))} empty="Nothing yet in this period." />,
        )}
        {panel("Links to other sites", list(outbound), csv("target", "outbound"))}
        {panel("Downloads", list(downloads), csv("target", "download"))}
        {panel("Calls, emails and WhatsApp", list(contacts), csv("target", "contact"))}
      </div>
    </>
  );
}
