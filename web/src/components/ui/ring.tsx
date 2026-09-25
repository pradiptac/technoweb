import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A ring filled to a percentage, for the public site — the geometry of the
 * console's SEO score ring (`app/admin/(app)/seo/score.tsx`), made generic:
 * any value 0–100, any size, any colour.
 *
 * The colour is `currentColor`, so the arc takes whatever `text-*` class it
 * is given (`className`) and the track whatever `trackClassName` says. Pick
 * a graded ink — `text-brand-ink`, `text-accent-ink` — and the arc clears
 * the 3:1 a graphic needs in both schemes by construction.
 *
 * **No text inside the SVG.** `getComputedStyle` reports an SVG font size in
 * user units and the mobile audit measures it after viewBox scaling — which
 * is how one diagram in this project shipped at 5.4px. Whatever should sit in
 * the middle is passed as `children` and drawn in ordinary HTML over the SVG.
 */
export function Ring({
  value, size = 96, strokeWidth, className, trackClassName = "text-line-strong", children,
}: {
  /** 0–100; clamped. */
  value: number;
  size?: number;
  /** Defaults to 7 from 80px up, 5 below. */
  strokeWidth?: number;
  /** The arc's colour, as a `text-*` class. */
  className?: string;
  trackClassName?: string;
  /** Drawn centred over the ring, in HTML. */
  children?: ReactNode;
}) {
  const stroke = strokeWidth ?? (size >= 80 ? 7 : 5);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className={cn("-rotate-90", className)}
      >
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          className={trackClassName} stroke="currentColor"
        />
        {pct > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
            stroke="currentColor" strokeLinecap="round"
            strokeDasharray={`${(circumference * pct) / 100} ${circumference}`}
          />
        )}
      </svg>
      {children !== undefined && (
        <span className="absolute inset-0 flex items-center justify-center text-center">{children}</span>
      )}
    </span>
  );
}
