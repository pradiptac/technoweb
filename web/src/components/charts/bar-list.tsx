import Link from "next/link";
import { cn } from "@/lib/utils";
import { count } from "./geometry";
import { toneColour, categoricalTone, type ChartTone } from "./tones";

export type BarRow = {
  label: string;
  value: number;
  /** A tone by meaning, or a colour string (`hueFor()`); a categorical hue when absent. */
  tone?: ChartTone | string;
  /** Opens the list behind the figure, filtered the way it was counted. */
  href?: string;
};

/**
 * Labelled horizontal bars — the shape for "how many of each", ranked.
 *
 * Server-rendered. Each bar is scaled against the longest, and the share of
 * the total rides beside the count, so colour is never the only channel and
 * neither is length. A row with an `href` is a link to the list behind it,
 * the rule every dashboard tile follows. The bars grow in from the left on
 * first paint (`[data-chart-grow]`, inside the reduced-motion guard), each a
 * beat after the one above it.
 */
export function BarList({ rows, empty = "Nothing to show yet.", showShare = true, labelWidth = "7.5rem", className }: {
  rows: BarRow[];
  empty?: string;
  showShare?: boolean;
  labelWidth?: string;
  className?: string;
}) {
  if (rows.length === 0 || rows.every((r) => r.value === 0)) {
    return <p className="text-12-5 text-muted">{empty}</p>;
  }
  const peak = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);

  return (
    <ul className={cn("grid gap-2", className)}>
      {rows.map((r, i) => {
        const colour = toneColour(r.tone ?? categoricalTone(i));
        const share = total > 0 ? Math.round((r.value / total) * 100) : 0;
        const body = (
          <>
            <span className="shrink-0 truncate text-12-5 text-ink-2" style={{ width: labelWidth }} title={r.label}>
              {r.label}
            </span>
            <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                data-chart-grow
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${Math.max(2, (r.value / peak) * 100)}%`, background: colour, animationDelay: `${i * 60}ms` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right text-12-5 font-semibold tabular-nums text-ink">{count(r.value)}</span>
            {showShare && <span className="w-9 shrink-0 text-right text-12 tabular-nums text-muted">{share}%</span>}
          </>
        );
        return (
          <li key={`${r.label}-${i}`}>
            {r.href ? (
              <Link href={r.href} className="-mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-0.5 transition-colors duration-(--duration-fast) hover:bg-surface-2">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-2.5 py-0.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
