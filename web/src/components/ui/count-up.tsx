"use client";

import { useEffect, useRef, type ElementType } from "react";

/**
 * A figure that counts up from zero the first time it scrolls into view.
 *
 * The client asked for counting animations "wherever a number is
 * mentioned, site-wide, on loading the pages" (2026-09-18). This is the one
 * component for that, and `StatValue` — the homepage statistics — shares
 * its arithmetic. What it is *not* put on, deliberately: a price, a date, a
 * telephone number, an order or ticket reference, a "3 of 5" slide counter
 * — figures that are read, dialled or matched rather than admired, where a
 * number in motion is a number somebody cannot yet trust. It goes on the
 * figures that stand for something: a case study's results, a category's
 * product count, a listing's total, a category's post count, a comment
 * count, a reading time, a theme's readout of the hero statistics.
 *
 * `value` may carry a prefix, a unit and decimals — `340+`, `99.9%`,
 * `< 4 hrs`, `₹1,200` — and every part but the number is kept, the number
 * arriving with the source's decimal places and grouping. A value with no
 * number in it is rendered as it is.
 *
 * Three rules, the ones every motion in this project keeps: it plays once,
 * on first entering the viewport, never on mount, so a figure below the
 * fold counts when it is reached; the **server renders the final figure**,
 * and the start state is set by JS after hydration, so a crawler, a reader
 * with scripts off and the audit's text checks all see the real number; and
 * under `prefers-reduced-motion` nothing runs — the query is read on mount,
 * never at render, so the server and the first client frame agree.
 *
 * 1.2s with a cubic ease-out: long enough to read as counting, short enough
 * that nobody waits on a number before they can read the sentence it is in.
 */
export function CountUp({
  value, as: Tag = "span", duration = 1200, className,
}: {
  value: string | number;
  as?: ElementType;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const text = String(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const parsed = splitNumber(text);
    if (!parsed || parsed.number === 0) return;

    // Written to the element rather than through state: the server's final
    // figure is what React rendered and what it keeps; the count is a
    // drawing over it, and setting state synchronously in an effect is the
    // cascade React's lint refuses.
    el.textContent = parsed.prefix + formatNumber(0, parsed) + parsed.suffix;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const run = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = parsed.prefix + formatNumber(parsed.number * eased, parsed) + parsed.suffix;
        if (p < 1) frame = requestAnimationFrame(run);
      };
      frame = requestAnimationFrame(run);
    }, { threshold: 0.3 });
    observer.observe(el);

    return () => { observer.disconnect(); cancelAnimationFrame(frame); el.textContent = text; };
  }, [text, duration]);

  return <Tag ref={ref} className={className}>{text}</Tag>;
}

export type ParsedNumber = { prefix: string; number: number; decimals: number; grouped: boolean; suffix: string };

/** "340+" → { prefix: "", number: 340, decimals: 0, suffix: "+" }; null when there is no number. */
export function splitNumber(value: string): ParsedNumber | null {
  const m = /^([^\d]*)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/.exec(value);
  if (!m) return null;
  const digits = m[2].replace(/,/g, "");
  const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
  return { prefix: m[1], number: Number(digits), decimals, grouped: m[2].includes(","), suffix: m[3] };
}

/** The same shape as the source: its decimal places, and thousands grouping only where the source had it. */
export function formatNumber(n: number, p: ParsedNumber): string {
  const fixed = n.toFixed(p.decimals);
  if (!p.grouped) return fixed;
  const [whole, frac] = fixed.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
}
