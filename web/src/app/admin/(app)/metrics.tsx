import { cn } from "@/lib/utils";
import type { DashboardMetrics } from "@/types/api";

/**
 * The dashboard's charts.
 *
 * Bars are divs, not SVG. The hero's SVG diagram taught this the hard way:
 * text inside a viewBox is in user units, so it scales with the container and
 * a label set at 8.5 rendered at 5.4px. HTML labels beside CSS-sized bars
 * cannot develop that problem.
 *
 * Every figure here can legitimately have no data behind it — a fresh install
 * has answered no tickets — so each one has a real empty state rather than a
 * zero that reads as a measurement.
 */

/** Hours as something a person reads at a glance. */
function duration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

function Tile({
  label, value, footnote, tone,
}: {
  label: string;
  value: string;
  footnote?: string;
  tone?: "ok" | "warn" | "err";
}) {
  return (
    <div className="rounded-lg border border-line-strong bg-card p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cn(
        "mt-1 font-display text-[24px] leading-none font-semibold tracking-[-.02em]",
        tone === "ok" && "text-ok",
        tone === "warn" && "text-warn",
        tone === "err" && "text-err",
      )}>
        {value}
      </p>
      {footnote && <p className="mt-1.5 text-[11.5px] text-faint">{footnote}</p>}
    </div>
  );
}

export function DashboardMetricsPanel({ metrics }: { metrics: DashboardMetrics }) {
  const { volume, volume_trend: trend, sla_first_response: sla } = metrics;
  const peak = Math.max(1, ...volume.map((d) => Math.max(d.created, d.resolved)));
  const totalCreated = volume.reduce((n, d) => n + d.created, 0);

  /*
   * A percentage needs a baseline worth dividing by. One ticket last month
   * against six this month is a true +500% and a useless thing to publish, so
   * the counts carry it below five and the percentage only appears once it
   * describes something.
   */
  const showPct = trend.change !== null && trend.previous >= 5;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold">Last {metrics.window_days} days</h2>
        <p className="text-[12px] text-muted">
          Response and resolution times are medians — one ticket answered after
          a fortnight would drag a mean somewhere that describes none of them.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="New tickets"
          value={String(trend.current)}
          footnote={
            showPct
              ? `${trend.change! > 0 ? "+" : ""}${trend.change}% on the previous ${metrics.window_days} days`
              : `${trend.previous} in the ${metrics.window_days} days before`
          }
        />
        <Tile
          label="First response"
          value={duration(metrics.first_response_hours)}
          footnote={metrics.first_response_hours === null ? "Nothing answered yet" : "Median"}
        />
        <Tile
          label="Time to resolve"
          value={duration(metrics.resolution_hours)}
          footnote={metrics.resolution_hours === null ? "Nothing resolved yet" : "Median"}
        />
        <Tile
          label="Answered within SLA"
          value={sla.pct === null ? "—" : `${sla.pct}%`}
          tone={sla.pct === null ? undefined : sla.pct >= 90 ? "ok" : sla.pct >= 70 ? "warn" : "err"}
          /* The sample size travels with the number. "100%" from two tickets
             and from two hundred are not the same claim. */
          footnote={sla.of === 0
            ? "No ticket has both a due date and a reply yet"
            : `Of ${sla.of} ticket${sla.of === 1 ? "" : "s"} with a due date and a reply`}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_280px]">
        {/* A column, so the bars take the height the card has rather than
            sitting at the bottom of it. The card is as tall as the two
            stacked breakdowns beside it, and a chart that ignores that leaves
            a third of itself blank. */}
        <div className="flex flex-col rounded-lg border border-line-strong bg-card p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold">Ticket volume</p>
            <p className="flex items-center gap-3 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-brand-500" /> opened
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-brand-200" /> resolved
              </span>
            </p>
          </div>

          {totalCreated === 0 ? (
            <p className="grid flex-1 place-items-center text-[13px] text-muted">
              No tickets in this window.
            </p>
          ) : (
            <>
              {/* A table, described for a screen reader, drawn as bars. The
                  numbers are the content; the bars are how they look. */}
              <ul className="flex min-h-32 flex-1 items-end gap-px" aria-hidden>
                {volume.map((d) => (
                  <li key={d.date} className="flex h-full flex-1 flex-col justify-end gap-px">
                    <span
                      className="block rounded-t-sm bg-brand-500"
                      style={{ height: `${(d.created / peak) * 100}%` }}
                      title={`${d.date}: ${d.created} opened`}
                    />
                    <span
                      className="block rounded-b-sm bg-brand-200"
                      style={{ height: `${(d.resolved / peak) * 100}%` }}
                      title={`${d.date}: ${d.resolved} resolved`}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 flex justify-between text-[11.5px] text-faint">
                <span>{new Date(volume[0].date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                <span className="sr-only">
                  {totalCreated} tickets opened over {metrics.window_days} days, peaking at {peak} in a day.
                </span>
                <span>Today</span>
              </div>
            </>
          )}
        </div>

        <div className="grid gap-3">
          <Breakdown title="Open by priority" rows={metrics.open_by_priority} />
          <Breakdown title="Open by category" rows={metrics.open_by_category} />
        </div>
      </div>
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; total: number }[] }) {
  const peak = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div className="rounded-lg border border-line-strong bg-card p-4">
      <p className="mb-2.5 text-[13px] font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-muted">Nothing open.</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2.5">
              <span className="w-[92px] shrink-0 truncate text-[12px] text-muted capitalize" title={r.label}>
                {r.label.replace(/_/g, " ")}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-brand-500"
                  style={{ width: `${(r.total / peak) * 100}%` }}
                />
              </span>
              <span className="w-5 shrink-0 text-right text-[12px] font-semibold">{r.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
