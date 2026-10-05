import Link from "next/link";
import { LOCALE, formatTableDate } from "@/lib/dates";
import { priorityTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { hueFor } from "@/lib/hues";
import { cn } from "@/lib/utils";
import { IconTicket, IconHeadset, IconClock, IconGauge } from "@/components/icons";
import { StatTile, type Tone } from "@/components/admin/stat-tile";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { Heatmap } from "@/components/charts/heatmap";
import { percentChange } from "@/components/charts/geometry";
import type { ChartTone } from "@/components/charts/tones";
import type { DashboardMetrics, TicketPriority, VolumePeriod } from "@/types/api";

/**
 * The dashboard's charts, on the chart kit (`components/charts/`, 2026-10-05).
 *
 * Every figure here can legitimately have no data behind it — a fresh install
 * has answered no tickets — so each one has a real empty state rather than a
 * zero that reads as a measurement. Every word is HTML; only the marks are
 * SVG (see the kit's `geometry.ts` for why).
 */

/**
 * Hours as something a person reads at a glance — whole units in every band.
 * The API sends a tenth of an hour, and "12.7 days" on a tile claims a
 * precision a median of five tickets does not have (the client, 2026-09-17).
 */
function duration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * The volume chart's periods (the client, 2026-09-24). The API decides the
 * buckets — days for a month, weeks for a quarter and a half year, months for
 * a year — and this side only names them.
 */
const PERIODS: { id: VolumePeriod; label: string; short: string; span: string; before: string }[] = [
  { id: "month", label: "Monthly", short: "1M", span: "last 30 days", before: "The 30 days before" },
  { id: "quarter", label: "Quarterly", short: "3M", span: "last 3 months", before: "The 13 weeks before" },
  { id: "half", label: "Half-yearly", short: "6M", span: "last 6 months", before: "The 26 weeks before" },
  { id: "year", label: "Yearly", short: "1Y", span: "last 12 months", before: "The 12 months before" },
];

type Bucket = DashboardMetrics["volume_series"]["bucket"];

const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" });
const monthYearFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric", timeZone: "UTC" });

/** What a bucket is called under the axis. */
function bucketTick(date: string, bucket: Bucket): string {
  return bucket === "month" ? monthFmt.format(new Date(`${date}T00:00:00Z`)) : formatTableDate(date);
}

/** What a bucket is called in the read-out and the table. */
function bucketTitle(p: { date: string; end: string }, bucket: Bucket): string {
  if (bucket === "day") return formatTableDate(p.date);
  if (bucket === "week") return `${formatTableDate(p.date)} – ${formatTableDate(p.end)}`;
  return monthYearFmt.format(new Date(`${p.date}T00:00:00Z`));
}

/** A badge tone as a chart tone, so "Critical" is the same red in the bars as in the queue. */
const BADGE_TO_CHART: Record<string, ChartTone> = {
  open: "info", progress: "warn", resolved: "ok", closed: "muted", urgent: "err", brand: "brand", accent: "accent",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

export function DashboardMetricsPanel({ metrics }: { metrics: DashboardMetrics }) {
  const { volume_trend: trend, sla_first_response: sla } = metrics;
  const series = metrics.volume_series;
  const volume = series.points;
  const bucket = series.bucket;
  const period = PERIODS.find((p) => p.id === series.period) ?? PERIODS[0];
  // A label every Nth bucket — six or seven whatever the period, which is
  // what fits under the plot at 320px — and none within a step of the end,
  // where the pinned "Today" sits.
  const step = bucket === "day" ? 7 : bucket === "week" ? (volume.length > 13 ? 5 : 3) : 2;
  const lastLabel = bucket === "day" ? "Today" : bucket === "week" ? "This week" : "This month";
  const ticks = volume.map((d, i) => (i % step === 0 && i < volume.length - step ? bucketTick(d.date, bucket) : null));
  const totalCreated = volume.reduce((n, d) => n + d.created, 0) + volume.reduce((n, d) => n + d.resolved, 0);
  const previous = series.previous && series.previous.length === volume.length ? series.previous : undefined;

  const slaTone: Tone = sla.pct === null ? "neutral" : sla.pct >= 90 ? "ok" : sla.pct >= 70 ? "warn" : "err";
  const change = percentChange(trend.current, trend.previous);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-15 font-semibold">Last {metrics.window_days} days</h2>
        <p className="text-12 text-muted">
          Response and resolution times are medians — one ticket answered after
          a fortnight would drag a mean somewhere that describes none of them.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="New tickets"
          icon={IconTicket}
          tone="info"
          value={trend.current.toLocaleString()}
          spark={metrics.volume.map((d) => d.created)}
          /* The percentage only once the baseline is worth dividing by: one
             ticket last month against six this month is a true +500% and a
             useless thing to publish. More tickets is load, not news, so the
             arrow takes no side. */
          delta={{
            change,
            goodWhen: "neither",
            caption: change === null
              ? `${trend.previous} in the ${metrics.window_days} days before`
              : `vs the ${metrics.window_days} days before`,
          }}
          href="/admin/tickets"
        />
        <StatTile
          label="First response"
          icon={IconHeadset}
          tone="neutral"
          value={duration(metrics.first_response_hours)}
          note={metrics.first_response_hours === null ? "Nothing answered yet" : "Median"}
        />
        <StatTile
          label="Time to resolve"
          icon={IconClock}
          tone="neutral"
          value={duration(metrics.resolution_hours)}
          spark={metrics.volume.map((d) => d.resolved)}
          note={metrics.resolution_hours === null ? "Nothing resolved yet" : "Median · line is resolved a day"}
        />
        <StatTile
          label="Answered within SLA"
          icon={IconGauge}
          tone={slaTone}
          value={sla.pct === null ? "—" : `${sla.pct}%`}
          /* The sample size travels with the number. "100%" from two tickets
             and from two hundred are not the same claim. */
          note={sla.of === 0
            ? "No ticket has both a due date and a reply yet"
            : `Of ${sla.of} ticket${sla.of === 1 ? "" : "s"} with a due date and a reply`}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card interactive={false} padding="sm" className="flex min-w-0 flex-col">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div>
              <p className="text-13 font-semibold">Ticket volume</p>
              <p className="text-12 text-muted">Opened and resolved, {period.span}</p>
            </div>
            {/*
              The period, as links rather than a client toggle: the page is
              server-rendered from the API, and `?volume=` keeps the choice in
              the URL so a refresh or a shared link shows the same chart.
            */}
            <nav aria-label="Ticket volume period" className="flex w-full rounded-md border border-line-strong p-0.5 sm:w-auto">
              {PERIODS.map((p) => {
                const active = p.id === period.id;
                return (
                  <Link
                    key={p.id}
                    href={p.id === "month" ? "/admin" : `/admin?volume=${p.id}`}
                    scroll={false}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex min-h-7 flex-1 items-center justify-center rounded px-2.5 text-12 font-semibold transition-colors duration-(--duration-fast) sm:flex-none",
                      active ? "bg-brand-600 text-brand-on" : "text-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <span className="sm:hidden" aria-hidden>{p.short}</span>
                    <span className="sr-only sm:not-sr-only">{p.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {totalCreated === 0 ? (
            /*
              It says what was measured, not "no tickets" (the client,
              2026-09-24): this chart counts tickets *opened*, the tiles count
              tickets *open*, and an install whose newest ticket is older than
              the window is correct on both counts.
            */
            <div className="grid min-h-40 flex-1 place-items-center text-center">
              <div>
                <p className="text-13 text-muted">No tickets opened or resolved in the {period.span}.</p>
                <p className="mt-1 text-12-5 text-faint">Anything still open was raised before that, and is counted above.</p>
              </div>
            </div>
          ) : (
            <AreaChart
              className="flex-1"
              height={180}
              labels={volume.map((d) => bucketTitle(d, bucket))}
              ticks={ticks}
              lastTick={lastLabel}
              unit="tickets"
              previousLabel={period.before}
              csvName={`ticket-volume-${period.id}`}
              summary={`Tickets opened and resolved per ${bucket} over the ${period.span}: ${volume.reduce((n, d) => n + d.created, 0)} opened, ${volume.reduce((n, d) => n + d.resolved, 0)} resolved.`}
              series={[
                { key: "opened", label: "Opened", tone: "info", values: volume.map((d) => d.created), previous: previous?.map((d) => d.created) },
                { key: "resolved", label: "Resolved", tone: "ok", values: volume.map((d) => d.resolved), previous: previous?.map((d) => d.resolved) },
              ]}
            />
          )}
        </Card>

        <div className="grid content-start gap-3">
          <Card interactive={false} padding="sm">
            <p className="mb-3 text-13 font-semibold">Open by priority</p>
            <BarList
              empty="Nothing open."
              labelWidth="4.75rem"
              rows={metrics.open_by_priority.map((r) => ({
                label: r.label.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
                value: r.total,
                tone: BADGE_TO_CHART[priorityTone[r.label as TicketPriority] ?? "closed"],
                href: `/admin/tickets?open=1&priority=${encodeURIComponent(r.label)}`,
              }))}
            />
          </Card>
          <Card interactive={false} padding="sm">
            <p className="mb-3 text-13 font-semibold">Open by category</p>
            {/* A category is a name an editor typed, so it takes a hue derived
                from that name: stable across renders and already contrast-
                checked on this surface. */}
            <BarList
              empty="Nothing open."
              labelWidth="5.5rem"
              rows={metrics.open_by_category.map((r) => ({ label: r.label, value: r.total, tone: hueFor(r.label) }))}
            />
          </Card>
        </div>
      </div>

      {metrics.arrivals && (
        <Card interactive={false} padding="sm" className="mt-3">
          <div className="mb-3">
            <p className="text-13 font-semibold">When tickets arrive</p>
            <p className="text-12 text-muted">
              By weekday and hour (IST), the last {metrics.arrivals.days} days —
              {" "}{metrics.arrivals.total.toLocaleString()} tickets. Staff the busy squares.
            </p>
          </div>
          <Heatmap
            cells={metrics.arrivals.cells}
            rowLabels={DAYS}
            colLabels={HOURS}
            unit="tickets"
            describe={(d, h) => `${DAYS[d]} ${HOURS[h]}:00`}
          />
        </Card>
      )}
    </section>
  );
}
