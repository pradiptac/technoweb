import { TONE_BAR, priorityTone } from "@/components/ui/badge";
import { hueFor } from "@/lib/hues";
import { cn } from "@/lib/utils";
import { IconTicket, IconHeadset, IconClock, IconGauge } from "@/components/icons";
import type { DashboardMetrics, TicketPriority } from "@/types/api";

/** "28 Jul". Short enough to sit under a 36px column without wrapping. */
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

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
  label, value, footnote, tone, icon: Icon,
}: {
  label: string;
  value: string;
  footnote?: string;
  tone?: "ok" | "warn" | "err";
  icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}) {
  return (
    <div className="relative rounded-lg border border-line-strong bg-card p-4">
      {/*
        Absolute rather than a flex sibling: these tiles have a footnote of
        wildly different lengths — "Median" against "Of 1 ticket with a due
        date and a reply" — and in a row the icon would sit at a different
        height in each of the four. Pinned to the corner it lines up across
        them whatever the text below does.

        `text-faint`, not the value's tone: the figure turns red when the SLA
        is missed, and a red mark beside it would double the alarm without
        adding anything to it.
      */}
      <Icon aria-hidden className="absolute top-4 right-4 size-8 text-faint opacity-40" />
      <p className="pr-10 text-[12px] text-muted">{label}</p>
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
   * The top of the axis, rounded up to an even number.
   *
   * Bars used to be drawn as a percentage of `peak`, so the tallest was always
   * full height whether it stood for two tickets or two hundred, and nothing
   * on the card said which. Rounding to an even number is what lets the
   * midpoint be a whole ticket: a gridline reading "3.5 tickets" is a gridline
   * describing something that cannot happen.
   */
  const axisTop = Math.max(2, Math.ceil(peak / 2) * 2);

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
          icon={IconTicket}
          value={String(trend.current)}
          footnote={
            showPct
              ? `${trend.change! > 0 ? "+" : ""}${trend.change}% on the previous ${metrics.window_days} days`
              : `${trend.previous} in the ${metrics.window_days} days before`
          }
        />
        <Tile
          label="First response"
          icon={IconHeadset}
          value={duration(metrics.first_response_hours)}
          footnote={metrics.first_response_hours === null ? "Nothing answered yet" : "Median"}
        />
        <Tile
          label="Time to resolve"
          icon={IconClock}
          value={duration(metrics.resolution_hours)}
          footnote={metrics.resolution_hours === null ? "Nothing resolved yet" : "Median"}
        />
        <Tile
          label="Answered within SLA"
          icon={IconGauge}
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
                <span aria-hidden className="size-2.5 rounded-sm bg-info" /> opened
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-ok" /> resolved
              </span>
            </p>
          </div>

          {totalCreated === 0 ? (
            <p className="grid flex-1 place-items-center text-[13px] text-muted">
              No tickets in this window.
            </p>
          ) : (
            <>
              <div className="flex min-h-32 flex-1 gap-2">
                {/*
                  The scale. Without it a bar is a shape rather than a
                  quantity — the chart looked identical for a busy month and a
                  quiet one, because the tallest bar was always full height.
                  `justify-between` puts the labels on the gridlines, and
                  `-translate-y-1/2` centres each on its own line rather than
                  hanging beneath it.
                */}
                <ul className="flex w-6 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-faint">
                  {[axisTop, axisTop / 2, 0].map((tick) => (
                    <li key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{tick}</li>
                  ))}
                </ul>

                <div className="relative flex-1">
                  {/*
                    Gridlines behind the bars, and the one at zero is the
                    baseline — solid where the others are faint, because it is
                    the line every bar is measured from and the only one that
                    is not a guess at where a value sits.
                  */}
                  <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
                    <span className="block border-t border-line" />
                    <span className="block border-t border-line" />
                    <span className="block border-t border-line-strong" />
                  </div>

                  {/* A table, described for a screen reader, drawn as bars. The
                      numbers are the content; the bars are how they look. */}
                  <ul className="absolute inset-0 flex items-end gap-px" aria-hidden>
                    {volume.map((d) => (
                      <li key={d.date} className="flex h-full flex-1 items-end gap-px">
                        {/*
                          Side by side, not stacked. A ticket opened and a
                          ticket resolved are separate events, so stacking them
                          implies a total that means nothing.

                          It also removes a latent overflow rather than a
                          reproduced one: the two were sized against the peak
                          independently and then stacked, so a day at the peak
                          in *both* series would have drawn a column of twice
                          the plot height and run out of the card. It has never
                          happened on this data, which is exactly the kind of
                          bug that waits for a busy week to appear.
                        */}
                        <span
                          className="block flex-1 rounded-t-sm bg-info"
                          style={{ height: `${(d.created / axisTop) * 100}%` }}
                          title={`${dayLabel(d.date)}: ${d.created} opened`}
                        />
                        <span
                          className="block flex-1 rounded-t-sm bg-ok"
                          style={{ height: `${(d.resolved / axisTop) * 100}%` }}
                          title={`${dayLabel(d.date)}: ${d.resolved} resolved`}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/*
                Dated every seventh day rather than at the two ends. "28 Jul"
                and "Today" say how wide the window is and nothing about where
                in it a spike sits, which is the only question a volume chart
                is asked. Offset by the axis gutter so a label lands under the
                day it belongs to.
              */}
              <div className="ml-8 mt-1.5 flex text-[11px] text-faint" aria-hidden>
                {volume.map((d, i) => {
                  const last = i === volume.length - 1;
                  // The weekly tick nearest the end is suppressed: "Today" is
                  // anchored to the right edge, and on a 30-day window the two
                  // landed four columns apart and printed as "25 AugToday".
                  const show = last || (i % 7 === 0 && i < volume.length - 7);
                  return (
                    <span key={d.date} className="min-w-0 flex-1">
                      {show && (
                        <span className={cn(
                          "block whitespace-nowrap",
                          // The final label would otherwise start at the last
                          // column and run off the edge of the card.
                          last ? "text-right" : "-ml-3",
                        )}>
                          {last ? "Today" : dayLabel(d.date)}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>

              <p className="sr-only">
                {totalCreated} tickets opened over {metrics.window_days} days, peaking at {peak} in a day.
              </p>
            </>
          )}
        </div>

        <div className="grid gap-3">
          <Breakdown
            title="Open by priority"
            rows={metrics.open_by_priority}
            bar={(label) => ({
              className: TONE_BAR[priorityTone[label as TicketPriority] ?? "closed"],
            })}
          />
          <Breakdown
            title="Open by category"
            rows={metrics.open_by_category}
            bar={(label) => ({ style: { backgroundColor: hueFor(label) } })}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * A labelled bar list.
 *
 * `bar` decides each row's colour and takes one of two shapes, because the two
 * charts using this are different kinds of thing. Priority is semantic -- the
 * words mean something, so the bar borrows the badge's tone and "Critical" is
 * the same red in the chart as it is in the list. A category is just a name an
 * editor typed, so it gets a hue derived from that name: stable across
 * renders, distinct from its neighbours, and already contrast-checked against
 * this exact surface.
 */
function Breakdown({ title, rows, bar }: {
  title: string;
  rows: { label: string; total: number }[];
  bar: (label: string) => { className?: string; style?: React.CSSProperties };
}) {
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
                {(() => {
                  const paint = bar(r.label);
                  return (
                    <span
                      className={cn("block h-full rounded-full", paint.className)}
                      style={{ width: `${(r.total / peak) * 100}%`, ...paint.style }}
                    />
                  );
                })()}
              </span>
              <span className="w-5 shrink-0 text-right text-[12px] font-semibold">{r.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
