"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber, splitNumber } from "@/components/ui/count-up";

/**
 * A statistic's figure, animated the way Site → Settings → Homepage asks
 * (the arithmetic is `CountUp`'s, which every other figure on the site uses)
 * (`stats_animation`, resolved by `statLookFor()` and stamped on the row's
 * container as `data-stat-animation` by `statFigures()`).
 *
 * The client asked for "text animation" on the figures (2026-09-17). Three
 * styles, each keyed on the *container's* attribute rather than a prop, so
 * the nine templates that draw `<StatFigure>` did not change: the figure
 * reads the nearest `[data-stat-animation]` on mount, the way it already
 * reads `--stat-ink` and `--stat-size` from the same ancestor.
 *
 * - `count`: the number inside the figure counts up from zero over 1.4s,
 *   keeping whatever is around it — `340+` counts to 340 and keeps the `+`,
 *   `99.9%` keeps its decimal place and its sign, `< 4 hrs` keeps both
 *   words. A figure with no number in it (`24/7` has two; the first is
 *   taken) simply appears.
 * - `rise`: each figure rises 12px as it fades in, staggered 90ms by its
 *   position in the row.
 * - `flip`: each character turns in from `rotateX(-90deg)`, staggered 40ms,
 *   the split-flap board.
 *
 * Three things every one of them keeps, the motion rules of this project:
 * it plays **once, on first entering the viewport**, through an
 * `IntersectionObserver`, never on mount — the support band is below the
 * fold; the **server renders the final figure** and the start state is
 * applied by JS after hydration, so a crawler, a reader with scripts off
 * and the audit's text checks all see `340+`; and under
 * `prefers-reduced-motion` nothing here runs at all — the query is read on
 * mount, never at render, so the server and the first client frame agree.
 *
 * `rise` and `flip` are CSS keyframes in `globals.css` under
 * `.stat-value[data-in]`, inside the reduced-motion guard like every
 * animation there; only `count` needs JavaScript to draw, because a number
 * is text.
 */
export function StatValue({ value }: { value: string }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(value);
  // Which style is running, from the effect — not read off the ref during
  // render, which React's rules refuse, and "none" on the server so the
  // markup hydrates against the plain figure.
  const [kind, setKind] = useState("none");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const kind = el.closest<HTMLElement>("[data-stat-animation]")?.dataset.statAnimation ?? "none";
    if (kind === "none") return;
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    el.dataset.statAnim = kind;
    // Its place in the row, for the stagger: counted from the container
    // rather than passed in, so no template has to number its figures.
    const container = el.closest<HTMLElement>("[data-stat-animation]");
    const index = container ? Array.from(container.querySelectorAll(".stat-value")).indexOf(el) : 0;
    el.style.setProperty("--stat-index", String(Math.max(0, index)));
    setKind(kind);

    const parsed = kind === "count" ? splitNumber(value) : null;
    if (parsed) setShown(parsed.prefix + formatNumber(0, parsed) + parsed.suffix);

    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      el.dataset.in = "";
      if (!parsed) return;
      const start = performance.now();
      const run = (now: number) => {
        const p = Math.min(1, (now - start) / 1400);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(parsed.prefix + formatNumber(parsed.number * eased, parsed) + parsed.suffix);
        if (p < 1) frame = requestAnimationFrame(run);
      };
      frame = requestAnimationFrame(run);
    }, { threshold: 0.4 });
    observer.observe(el);

    return () => { observer.disconnect(); cancelAnimationFrame(frame); delete el.dataset.in; delete el.dataset.statAnim; setShown(value); setKind("none"); };
  }, [value]);

  return (
    <b ref={ref} className="stat-value font-display text-(length:--stat-size) font-bold leading-none tracking-[-.03em] text-(--stat-ink)">
      {kind === "flip"
        ? [...shown].map((ch, i) => (
            <span key={i} className="stat-char" style={{ "--char-index": i } as React.CSSProperties}>{ch === " " ? "\u00a0" : ch}</span>
          ))
        : shown}
    </b>
  );
}
