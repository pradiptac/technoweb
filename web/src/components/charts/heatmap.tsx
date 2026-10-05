import { count } from "./geometry";
import { toneColour, type ChartTone } from "./tones";

/**
 * When things happen: rows by columns of counts, shaded against the busiest
 * cell — the ticket desk's weekday × hour grid, and anything else shaped
 * like it.
 *
 * Server-rendered. Each cell is a div whose background is the tone mixed
 * into the card by its share of the peak (`color-mix`, tokens only, so it
 * repaints with the scheme) — a cell with nothing in it keeps the plain
 * surface rather than a faint tint, so "none" and "a few" are told apart.
 * The cells carry no text; their figures are in each `title` and the
 * busiest slots are named in words underneath, so the grid is never the
 * only way to the answer. Column labels are shown every `labelEvery`
 * columns, which is what fits under 24 hours at 320px.
 */
export function Heatmap({ cells, rowLabels, colLabels, labelEvery = 3, tone = "info", unit = "", describe }: {
  cells: number[][];
  rowLabels: string[];
  colLabels: string[];
  labelEvery?: number;
  tone?: ChartTone | string;
  unit?: string;
  /** "Mon 09:00" for a cell, for its title and the summary. */
  describe: (row: number, col: number) => string;
}) {
  const peak = Math.max(0, ...cells.flat());
  const colour = toneColour(tone);
  const cols = colLabels.length;

  const busiest = cells
    .flatMap((r, ri) => r.map((v, ci) => ({ v, ri, ci })))
    .filter((c) => c.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);

  if (peak === 0) return <p className="text-12-5 text-muted">Nothing has arrived in this window yet.</p>;

  return (
    <div>
      <div className="grid gap-[2px] sm:gap-[3px]" style={{ gridTemplateColumns: `2.25rem repeat(${cols}, minmax(0, 1fr))` }} aria-hidden>
        {cells.map((row, ri) => (
          <div key={ri} className="contents">
            <span className="self-center pr-1 text-11 text-faint">{rowLabels[ri]}</span>
            {row.map((v, ci) => (
              <span
                key={ci}
                data-chart-cell
                title={`${describe(ri, ci)}: ${count(v)}${unit ? ` ${unit}` : ""}`}
                className="h-3.5 min-w-0 rounded-[3px] sm:h-5"
                style={{
                  background: v === 0 ? "var(--color-surface-2)" : `color-mix(in oklab, ${colour} ${Math.round(18 + (v / peak) * 82)}%, var(--color-card))`,
                  animationDelay: `${(ri * cols + ci) * 4}ms`,
                }}
              />
            ))}
          </div>
        ))}
        <span />
        {colLabels.map((l, ci) => (
          <span key={ci} className="pt-1 text-11 text-faint">{ci % labelEvery === 0 ? l : ""}</span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-muted">
        <span className="flex items-center gap-1.5" aria-hidden>
          Fewer
          {[0.18, 0.45, 0.72, 1].map((s) => (
            <span key={s} className="size-3 rounded-[3px]" style={{ background: `color-mix(in oklab, ${colour} ${Math.round(s * 100)}%, var(--color-card))` }} />
          ))}
          More
        </span>
        {busiest.length > 0 && (
          <span>Busiest: {busiest.map((b) => `${describe(b.ri, b.ci)} (${count(b.v)})`).join(", ")}</span>
        )}
      </div>
    </div>
  );
}
