import Link from "next/link";
import { count } from "./geometry";
import { toneColour, categoricalTone, type ChartTone } from "./tones";

export type DonutSegment = { key: string; label: string; value: number; tone?: ChartTone | string; href?: string };

/**
 * A ring of shares with the total in the middle and a legend beside it —
 * the newsletter's verification donut, generalised.
 *
 * Server-rendered. One `<circle pathLength={100}>` per segment whose dash is
 * its share, offset by the shares before it, with a one-unit gap between
 * neighbours (none when one segment is the whole ring — a gap in a full
 * circle is a defect). The centre figure is HTML over the SVG, because SVG
 * text is measured after viewBox scaling. The legend carries the count and
 * the percentage for every segment, so colour is never the only channel, and
 * an empty ring is drawn as a full muted track rather than nothing.
 */
export function Donut({ segments, centre, caption, size = 148 }: {
  segments: DonutSegment[];
  /** The figure in the middle; the total when absent. */
  centre?: string;
  caption?: string;
  size?: number;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const drawn = segments
    .filter((s) => s.value > 0)
    .reduce<(DonutSegment & { share: number; offset: number; colour: string })[]>((acc, s, i) => {
      const share = (s.value / Math.max(1, total)) * 100;
      const offset = acc.reduce((n, d) => n + d.share, 0);
      return [...acc, { ...s, share, offset, colour: toneColour(s.tone ?? categoricalTone(i)) }];
    }, []);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="40" fill="none" strokeWidth="11" className="stroke-surface-2" />
          {drawn.map((s) => {
            const gap = drawn.length > 1 ? 1 : 0;
            const dash = Math.max(0, s.share - gap);
            return (
              <circle
                key={s.key}
                data-chart-sweep
                cx="50" cy="50" r="40" fill="none" strokeWidth="11"
                pathLength={100}
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={-s.offset}
                stroke={s.colour}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-22 leading-none font-semibold tabular-nums text-ink">{centre ?? count(total)}</p>
            {caption && <p className="mt-1 text-11-5 text-muted">{caption}</p>}
          </div>
        </div>
      </div>
      <ul className="grid min-w-[12rem] flex-1 gap-1.5">
        {segments.map((s, i) => {
          const share = total > 0 ? Math.round((s.value / total) * 100) : 0;
          const body = (
            <>
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: toneColour(s.tone ?? categoricalTone(i)) }} />
              <span className="min-w-0 flex-1 truncate text-12-5 text-ink-2">{s.label}</span>
              <span className="text-12-5 font-semibold tabular-nums text-ink">{count(s.value)}</span>
              <span className="w-9 text-right text-12 tabular-nums text-muted">{share}%</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.href ? (
                <Link href={s.href} className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-surface-2">{body}</Link>
              ) : (
                <div className="flex items-center gap-2 py-0.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
