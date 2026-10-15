import Link from "next/link";
import { count } from "./geometry";
import { toneColour, type ChartTone } from "./tones";

export type FunnelStage = { label: string; value: number; href?: string };

/**
 * Stages that can only narrow — received, replied to, won — as centred bars
 * each as wide as its share of the first, with the step's conversion between
 * them.
 *
 * Server-rendered. The caller is responsible for the stages genuinely
 * narrowing (a status *snapshot* drawn as a funnel shows a narrowing that
 * never happened — see the API's `funnel`); a later stage larger than the one
 * before is drawn as it is, never clamped, so a wrong feed looks wrong. Every
 * figure and percentage is HTML, and the bar's colour steps from the tone
 * towards its lighter end down the funnel so the stages read as one flow.
 */
export function Funnel({ stages, tone = "brand", empty = "Nothing has arrived in this window yet." }: {
  stages: FunnelStage[];
  tone?: ChartTone | string;
  empty?: string;
}) {
  const first = stages[0]?.value ?? 0;
  if (first === 0) return <p className="text-12-5 text-muted">{empty}</p>;
  const colour = toneColour(tone);

  return (
    <ol className="grid gap-1">
      {stages.map((s, i) => {
        const width = s.value === 0 ? 0 : Math.max(1.5, (s.value / first) * 100);
        const prev = i > 0 ? stages[i - 1].value : null;
        const step = prev ? Math.round((s.value / prev) * 100) : null;
        const ofFirst = Math.round((s.value / first) * 100);
        const bar = (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="relative h-9 min-w-0">
              <div
                data-chart-grow-centre
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-md"
                style={{
                  width: `${width}%`,
                  background: `color-mix(in oklab, ${colour} ${100 - i * 18}%, var(--color-card))`,
                  animationDelay: `${i * 90}ms`,
                }}
              />
            </div>
            <div className="w-28 text-right sm:w-36">
              <p className="text-12-5 text-ink-2">{s.label}</p>
              <p className="text-13 font-semibold tabular-nums text-ink">
                {count(s.value)} <span className="text-12 font-normal text-muted">· {ofFirst}%</span>
              </p>
            </div>
          </div>
        );
        return (
          <li key={s.label}>
            {step !== null && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-0.5">
                <p className="text-center text-11-5 text-muted">
                  <span aria-hidden>↓ </span>{step}% of the step before
                </p>
                <span className="w-28 sm:w-36" />
              </div>
            )}
            {s.href ? <Link href={s.href} className="block rounded-md hover:bg-surface-2">{bar}</Link> : bar}
          </li>
        );
      })}
    </ol>
  );
}
