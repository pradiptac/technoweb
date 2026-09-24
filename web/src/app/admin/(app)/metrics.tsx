import { formatTableDate } from "@/lib/dates";
import { TONE_BAR, priorityTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { hueFor } from "@/lib/hues";
import { cn } from "@/lib/utils";
import { IconTicket, IconHeadset, IconClock, IconGauge } from "@/components/icons";
import type { DashboardMetrics, TicketPriority } from "@/types/api";

/** "28 Jul". Short enough to sit under a 36px column without wrapping. */

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

/**
 * Hours as something a person reads at a glance.
 *
 * Whole units in every band. The API sends the median to a tenth of an hour,
 * and "12.7 days" on a tile claims a precision a median of five tickets does
 * not have -- the client asked for round figures (2026-09-17). A tenth of a
 * day is a rounding on a tile, not information.
 */
function duration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
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
    <Card interactive={false} padding="sm">
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
      {/* 24px on a phone, 32 from `sm`: the glyph is decoration in the corner
          of a card, and at 32 it competes with the figure it sits beside once
          the card is the width of the screen. */}
      <Icon aria-hidden className="absolute top-4 right-4 size-6 text-faint opacity-40 sm:size-8" />
      <p className="pr-10 text-12 text-muted">{label}</p>
      <p className={cn(
        "mt-1 font-display text-22 leading-none font-semibold tracking-[-.02em] sm:text-24",
        tone === "ok" && "text-ok",
        tone === "warn" && "text-warn",
        tone === "err" && "text-err",
      )}>
        {value}
      </p>
      {footnote && <p className="mt-1.5 text-11-5 text-faint">{footnote}</p>}
    </Card>
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
        <h2 className="text-15 font-semibold">Last {metrics.window_days} days</h2>
        <p className="text-12 text-muted">
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
            <p className="text-13 font-semibold">Ticket volume</p>
            <p className="flex items-center gap-3 text-11-5 text-muted">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-info" /> opened
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-ok" /> resolved
              </span>
            </p>
          </div>

          {totalCreated === 0 ? (
            /*
              It says what was measured, not "no tickets" (the client,
              2026-09-24).

              This chart counts tickets **opened** per day over the last
              `window_days`, and the queue beside it counts tickets **open**
              right now — two different words for two different questions. On
              an install whose newest ticket is 32 days old both are correct
              and the card read as broken: four open tickets on the tiles above
              and "No tickets in this window" under them. Naming the window and
              the measure is the whole fix; the second line says where the open
              ones are, so nobody goes looking for a fault.
            */
            <div className="grid flex-1 place-items-center text-center">
              <div>
                <p className="text-13 text-muted">
                  No tickets opened or resolved in the last {metrics.window_days} days.
                </p>
                <p className="mt-1 text-12-5 text-faint">
                  Anything still open was raised before that, and is counted above.
                </p>
              </div>
            </div>
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
                <ul className="flex w-6 shrink-0 flex-col justify-between text-right text-11 tabular-nums text-faint">
                  {[axisTop, axisTop / 2, 0].map((tick) => (
                    <li key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{tick}</li>
                  ))}
                </ul>

                <div className="relative flex-1">
                  {/*
                    Gridlines behind the curves, and the one at zero is the
                    baseline — solid where the others are faint, because it is
                    the line every value is measured from and the only one that
                    is not a guess at where a value sits.
                  */}
                  <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
                    <span className="block border-t border-line" />
                    <span className="block border-t border-line" />
                    <span className="block border-t border-line-strong" />
                  </div>

                  <VolumeCurves volume={volume} axisTop={axisTop} />
                </div>
              </div>

              {/*
                Dated every seventh day rather than at the two ends. "28 Jul"
                and "Today" say how wide the window is and nothing about where
                in it a spike sits, which is the only question a volume chart
                is asked. Offset by the axis gutter so a label lands under the
                day it belongs to.
              */}
              <div className="relative ml-8 mt-1.5 flex text-11 text-faint" aria-hidden>
                {volume.map((d, i) => {
                  // The weekly tick nearest the end is suppressed: "Today" is
                  // anchored to the right edge, and on a 30-day window the two
                  // landed four columns apart and printed as "25 AugToday".
                  const show = i % 7 === 0 && i < volume.length - 7;
                  return (
                    <span key={d.date} className="min-w-0 flex-1">
                      {show && (
                        <span className="-ml-3 block whitespace-nowrap">
                          {formatTableDate(d.date)}
                        </span>
                      )}
                    </span>
                  );
                })}
                {/*
                  "Today" is anchored to the **row**, not to the final column.

                  In flow it was a `whitespace-nowrap` label inside a slot one
                  thirtieth of the row wide — about 9px at 320px — so a 30px
                  word painted roughly 10px past the card and the page scrolled
                  horizontally by 2px. Nothing reported an element, because no
                  element *box* was over the edge: the box was the 9px slot and
                  it was the text that spilled, which is why the mobile audit
                  could say the page scrolled and name nothing.

                  `text-right` had looked like the fix and only moved which
                  edge it hung off. Widening the last slot instead would drag
                  every weekly tick out of line with the column it dates, since
                  this row and the bars above it are two separate flex rows
                  that agree only by having equal children.
                */}
                <span className="absolute right-0 top-0 whitespace-nowrap">Today</span>
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
 * The ticket volume, as two curves rather than sixty bars (the client,
 * 2026-09-23).
 *
 * ## Why this one is SVG when every other chart here is divs
 *
 * The rule at the top of this file still holds and is the reason nothing here
 * has an `<svg><text>`: a label inside a viewBox is in user units, so it
 * scales with the container and the hero's diagram once rendered a label set
 * at 8.5 as 5.4px. That rule is about **text**. A curve is a line through
 * thirty points, and there is no way to draw one out of block elements — the
 * bars were divs precisely because a bar is a rectangle. So the shape is SVG
 * and every label on the card stays HTML, which is the same division the rule
 * was written to protect.
 *
 * `preserveAspectRatio="none"` stretches the plot to whatever box the card
 * gives it, and `vector-effect="non-scaling-stroke"` is what keeps that from
 * turning the stroke into a smear: without it a 2px line drawn in a 30x10
 * viewBox comes out 2px tall and 60px wide.
 *
 * ## The colours are tokens, and a gradient stop can hold one
 *
 * `--color-info` for opened and `--color-ok` for resolved, the two the legend
 * and the old bars already used, referenced as `var(...)` in the stop rather
 * than as a hex — the file's own rule, and the reason a scheme change repaints
 * this chart with everything else. The fill under each curve is the same
 * colour fading to nothing, which is what makes two overlapping series
 * readable where two overlapping opaque areas would not be.
 *
 * ## What the curve must not invent
 *
 * The smoothing is a Catmull-Rom spline converted to cubic Béziers, with the
 * control points clamped into the plot, so the line passes through every
 * measured day and never leaves the box on the way between two of them — a
 * chart that dips below the baseline is drawing fewer than no tickets. The
 * clamp is not belt and braces: at the standard tension a drop from a busy
 * day into two quiet ones put a control point at 108 in a 0–100 box, measured
 * on this dashboard. Days are a fixed step apart and the
 * API fills empty days with zeroes, so there is no gap to interpolate across.
 *
 * The hover targets stay HTML: one transparent column per day over the top,
 * carrying the same `title` the bars carried, because a `<title>` inside a
 * stretched SVG path is a target the size of the stroke.
 */
function VolumeCurves({ volume, axisTop }: {
  volume: DashboardMetrics["volume"];
  axisTop: number;
}) {
  const last = Math.max(1, volume.length - 1);
  // A 0..100 box in both axes: the aspect is thrown away by
  // `preserveAspectRatio`, so the numbers only have to be convenient.
  const x = (i: number) => (i / last) * 100;
  const y = (v: number) => 100 - Math.min(100, (v / axisTop) * 100);

  const curve = (pick: (d: DashboardMetrics["volume"][number]) => number): string => {
    const pts = volume.map((d, i) => [x(i), y(pick(d))] as const);
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;

    let path = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      /*
       * Sixth of the neighbouring span, the standard Catmull-Rom tension —
       * and the control points are **clamped to the plot**, which the first
       * cut was not: measured on this dashboard, a drop from a busy day to
       * two quiet ones put a control point at y=108 in a box that ends at
       * 100, and a curve bowing under the baseline is drawing fewer than no
       * tickets. Clamping flattens exactly those corners and leaves every
       * other one alone.
       */
      const clamp = (v: number) => Math.min(100, Math.max(0, v));
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6);
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6);
      path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return path;
  };

  const opened = curve((d) => d.created);
  const resolved = curve((d) => d.resolved);
  const under = (d: string) => `${d} L 100 100 L 0 100 Z`;

  return (
    <>
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <defs>
          <linearGradient id="tw-volume-opened" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-info)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--color-info)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="tw-volume-resolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-ok)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--color-ok)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Resolved underneath: it is the quieter series on most weeks, and the
            one drawn second is the one whose fill dulls the other. */}
        <path d={under(resolved)} fill="url(#tw-volume-resolved)" />
        <path d={under(opened)} fill="url(#tw-volume-opened)" />

        <path
          d={resolved}
          fill="none"
          stroke="var(--color-ok)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={opened}
          fill="none"
          stroke="var(--color-info)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The day-by-day figures, as targets rather than as shapes. */}
      <ul className="absolute inset-0 flex" aria-hidden>
        {volume.map((d) => (
          <li
            key={d.date}
            className="min-w-0 flex-1"
            title={`${formatTableDate(d.date)}: ${d.created} opened, ${d.resolved} resolved`}
          />
        ))}
      </ul>
    </>
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
    <Card interactive={false} padding="sm">
      <p className="mb-2.5 text-13 font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-12-5 text-muted">Nothing open.</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2.5">
              <span className="w-[92px] shrink-0 truncate text-12 text-muted capitalize" title={r.label}>
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
              <span className="w-5 shrink-0 text-right text-12 font-semibold">{r.total}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
