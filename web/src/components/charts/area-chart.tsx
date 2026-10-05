"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { niceMax, plot, smoothPath, under, count } from "./geometry";
import { toneColour, type ChartTone } from "./tones";
import { downloadCsv, toCsv } from "./csv";
import { compactPaise, formatPaise } from "@/lib/money";

export type AreaSeries = {
  key: string;
  label: string;
  tone: ChartTone | string;
  values: number[];
  /** The same positions in the period before, for the compare toggle. */
  previous?: number[];
};

/**
 * Smooth lines with a fading fill, a value read-out under the pointer and the
 * keyboard, series that can be switched off, the period before drawn dashed
 * underneath, and the same numbers as a table or a CSV.
 *
 * ## What is SVG and what is HTML
 *
 * The lines and fills are SVG in a 0..100 box stretched to the card
 * (`geometry.ts`), with `non-scaling-stroke` so a 2px line stays 2px. Every
 * word — the axis, the ticks, the tooltip — is HTML, and so are the dots on
 * the read-out, because a circle in a stretched viewBox is an ellipse. The
 * rule that makes this split is the hero diagram's: SVG text scales with the
 * viewBox and lands under the 12px floor.
 *
 * ## No effect, no measurement on render
 *
 * The tooltip is clamped inside the plot from the plot's width read **in the
 * event handler**, so nothing here runs on mount and the server render is the
 * chart, complete, with the read-out simply closed. The draw-in is CSS
 * (`[data-chart-draw]` in `globals.css`), inside the reduced-motion guard.
 *
 * ## The keyboard
 *
 * The plot is one tab stop. Arrow keys move the read-out a point at a time,
 * Home and End jump, Escape closes it; a polite live region says the point in
 * words, so the read-out is not a pointer-only feature.
 */
export function AreaChart({
  series, labels, ticks, lastTick, height = 160, unit, previousLabel = "Previous period",
  csvName, summary, className, format = "count",
}: {
  series: AreaSeries[];
  /** One per point: what the read-out and the table call it. */
  labels: string[];
  /** One per point: the label under the axis there, or null for none. */
  ticks?: (string | null)[];
  /** Pinned to the right edge — "Today", "This week". */
  lastTick?: string;
  /** The plot's minimum height in px; it grows with the card. */
  height?: number;
  /** "tickets" — read out after each figure. */
  unit?: string;
  previousLabel?: string;
  /** Offers a CSV of the numbers when given. */
  csvName?: string;
  /** The chart in one sentence, for a screen reader. */
  summary: string;
  className?: string;
  /** What the values are: counts, or paise (axis "₹1.2L", read-out "₹1,20,000"). */
  format?: "count" | "paise";
}) {
  const fmt = format === "paise" ? (v: number) => formatPaise(v) : count;
  const axis = format === "paise" ? compactPaise : count;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const plotRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState<{ i: number; width: number } | null>(null);

  const n = labels.length;
  const canCompare = series.some((s) => s.previous && s.previous.length === n);
  const shown = series.filter((s) => !hidden.includes(s.key));
  const showPrev = compare && canCompare;

  const peak = Math.max(
    0,
    ...shown.flatMap((s) => [...s.values, ...(showPrev && s.previous ? s.previous : [])]),
  );
  const top = niceMax(peak);

  const toggle = (key: string) => {
    setHidden((h) => {
      if (h.includes(key)) return h.filter((k) => k !== key);
      // The last visible series stays: a chart of nothing is a broken chart.
      return series.length - h.length <= 1 ? h : [...h, key];
    });
  };

  const indexAt = (clientX: number): { i: number; width: number } | null => {
    const el = plotRef.current;
    if (!el || n === 0) return null;
    const box = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / Math.max(1, box.width)));
    return { i: Math.round(ratio * (n - 1)), width: box.width };
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (n === 0) return;
    const width = plotRef.current?.getBoundingClientRect().width ?? 0;
    const at = active?.i ?? n - 1;
    const next =
      e.key === "ArrowRight" ? Math.min(n - 1, at + (active ? 1 : 0))
        : e.key === "ArrowLeft" ? Math.max(0, at - (active ? 1 : 0))
          : e.key === "Home" ? 0
            : e.key === "End" ? n - 1
              : null;
    if (e.key === "Escape") { setActive(null); return; }
    if (next === null) return;
    e.preventDefault();
    setActive({ i: next, width });
  };

  const xPct = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  const describe = (i: number) =>
    `${labels[i]}: ${shown.map((s) => `${fmt(s.values[i] ?? 0)} ${s.label.toLowerCase()}${showPrev && s.previous ? ` (${fmt(s.previous[i] ?? 0)} before)` : ""}`).join(", ")}`;

  const exportCsv = () => {
    const header = ["Period", ...series.flatMap((s) => (s.previous ? [s.label, `${s.label} (${previousLabel.toLowerCase()})`] : [s.label]))];
    const rows = labels.map((l, i) => [l, ...series.flatMap((s) => (s.previous ? [s.values[i] ?? 0, s.previous[i] ?? 0] : [s.values[i] ?? 0]))]);
    downloadCsv(csvName ?? "chart", toCsv(header, rows));
  };

  // The read-out box, kept inside the plot: 11rem wide, clamped by pixels.
  const TIP = 176;
  const tipLeft = active
    ? Math.min(Math.max(0, (xPct(active.i) / 100) * active.width - TIP / 2), Math.max(0, active.width - TIP))
    : 0;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {/* Legend as toggles, then the view switches. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2">
        <div role="group" aria-label="Series" className="flex flex-wrap items-center gap-1.5">
          {series.map((s) => {
            const on = !hidden.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.key)}
                className={cn(
                  "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-12 font-semibold transition-[opacity,border-color] duration-(--duration-fast)",
                  on ? "border-line-strong text-ink-2" : "border-dashed border-line text-faint opacity-70",
                )}
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: toneColour(s.tone), opacity: on ? 1 : 0.35 }} />
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {canCompare && (
            <button
              type="button"
              aria-pressed={compare}
              onClick={() => setCompare((c) => !c)}
              className={cn(
                "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-12 font-semibold transition-colors duration-(--duration-fast)",
                compare ? "border-brand-ink/40 bg-brand-50 text-brand-ink" : "border-line-strong text-muted hover:text-ink",
              )}
            >
              <svg aria-hidden viewBox="0 0 16 4" className="h-1 w-4"><line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" /></svg>
              Compare
            </button>
          )}
          <button
            type="button"
            aria-pressed={asTable}
            onClick={() => { setAsTable((t) => !t); setActive(null); }}
            className="inline-flex min-h-7 items-center rounded-full border border-line-strong px-2.5 text-12 font-semibold text-muted transition-colors duration-(--duration-fast) hover:text-ink"
          >
            {asTable ? "Chart" : "Table"}
          </button>
          {csvName && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex min-h-7 items-center rounded-full border border-line-strong px-2.5 text-12 font-semibold text-muted transition-colors duration-(--duration-fast) hover:text-ink"
            >
              CSV
            </button>
          )}
        </div>
      </div>

      {asTable ? (
        <div className="max-h-72 w-0 min-w-full overflow-auto rounded-md border border-line">
          <table className="w-full text-12-5 tabular-nums">
            <thead className="sticky top-0 bg-surface-2 text-left text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Period</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-2 text-right font-semibold">{s.label}</th>
                ))}
                {canCompare && series.filter((s) => s.previous).map((s) => (
                  <th key={`${s.key}-prev`} scope="col" className="px-3 py-2 text-right font-semibold">{s.label}, before</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={`${l}-${i}`} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal whitespace-nowrap text-ink-2">{l}</th>
                  {series.map((s) => <td key={s.key} className="px-3 py-1.5 text-right">{fmt(s.values[i] ?? 0)}</td>)}
                  {canCompare && series.filter((s) => s.previous).map((s) => (
                    <td key={`${s.key}-prev`} className="px-3 py-1.5 text-right text-muted">{fmt(s.previous?.[i] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex flex-1 gap-2" style={{ minHeight: height }}>
            {/* The scale: a bar or a line is a shape until the axis says how many. */}
            <ul aria-hidden className="flex w-8 shrink-0 flex-col justify-between text-right text-11 tabular-nums text-faint">
              {[top, top / 2, 0].map((t) => (
                <li key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{axis(t)}</li>
              ))}
            </ul>

            <div
              ref={plotRef}
              tabIndex={0}
              role="group"
              aria-label={`${summary} Use the arrow keys to read each point.`}
              onPointerMove={(e) => setActive(indexAt(e.clientX))}
              onPointerLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
              onKeyDown={onKey}
              className="relative flex-1 rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
                <span className="block border-t border-dashed border-line" />
                <span className="block border-t border-dashed border-line" />
                <span className="block border-t border-line-strong" />
              </div>

              <svg
                aria-hidden
                data-chart-draw
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full overflow-visible"
              >
                <defs>
                  {shown.map((s) => (
                    <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={toneColour(s.tone)} stopOpacity="0.32" />
                      <stop offset="100%" stopColor={toneColour(s.tone)} stopOpacity="0" />
                    </linearGradient>
                  ))}
                </defs>
                {/* Fills first, lines on top, the last series drawn last so the
                    first-listed reads as the one in front. */}
                {[...shown].reverse().map((s) => (
                  <path key={`f-${s.key}`} d={under(smoothPath(plot(s.values, top)))} fill={`url(#${uid}-${s.key})`} />
                ))}
                {showPrev && shown.map((s) => s.previous && (
                  <path
                    key={`p-${s.key}`}
                    d={smoothPath(plot(s.previous, top))}
                    fill="none"
                    stroke={toneColour(s.tone)}
                    strokeOpacity="0.55"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {[...shown].reverse().map((s) => (
                  <path
                    key={`l-${s.key}`}
                    d={smoothPath(plot(s.values, top))}
                    fill="none"
                    stroke={toneColour(s.tone)}
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>

              {active && (
                <>
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-line-strong" style={{ left: `${xPct(active.i)}%` }} />
                  {shown.map((s) => {
                    const v = s.values[active.i] ?? 0;
                    return (
                      <span
                        key={s.key}
                        aria-hidden
                        className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow-1"
                        style={{ left: `${xPct(active.i)}%`, top: `${100 - Math.min(100, (v / top) * 100)}%`, background: toneColour(s.tone) }}
                      />
                    );
                  })}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute top-0 z-10 rounded-md border border-line-strong bg-card px-3 py-2 text-12 shadow-3"
                    style={{ left: tipLeft, width: TIP }}
                  >
                    <p className="mb-1 font-semibold text-ink">{labels[active.i]}</p>
                    <ul className="grid gap-0.5">
                      {shown.map((s) => (
                        <li key={s.key} className="flex items-center gap-1.5 text-ink-2">
                          <span aria-hidden className="size-2 rounded-full" style={{ background: toneColour(s.tone) }} />
                          <span className="min-w-0 flex-1 truncate">{s.label}</span>
                          <span className="font-semibold tabular-nums text-ink">{fmt(s.values[active.i] ?? 0)}</span>
                          {showPrev && s.previous && (
                            <span className="tabular-nums text-muted">/ {fmt(s.previous[active.i] ?? 0)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {showPrev && <p className="mt-1 text-muted">After the slash: {previousLabel.toLowerCase()}</p>}
                  </div>
                </>
              )}
            </div>
          </div>

          {ticks && (
            <div aria-hidden className="relative ml-10 mt-1.5 h-4 text-11 text-faint">
              {ticks.map((t, i) => t && (
                <span
                  key={i}
                  className={cn("absolute top-0 whitespace-nowrap", i === 0 ? "" : "-translate-x-1/2")}
                  style={{ left: `${xPct(i)}%` }}
                >
                  {t}
                </span>
              ))}
              {lastTick && <span className="absolute right-0 top-0 whitespace-nowrap">{lastTick}</span>}
            </div>
          )}
        </>
      )}

      <p className="sr-only" aria-live="polite">{active ? describe(active.i) : ""}</p>
      {unit && <span className="sr-only">Figures are {unit}.</span>}
    </div>
  );
}
