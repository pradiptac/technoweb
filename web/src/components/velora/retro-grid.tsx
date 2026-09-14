/**
 * Velora `retro-grid` — https://velora.colorlib.com/r/retro-grid.json,
 * installed 2026-09-14 (Velora by Colorlib). As published, with shadcn's
 * `--border` and `bg-background` mapped to this theme's `--color-line-strong`
 * and `page`. The `animate-retro-grid` utility and its keyframe are in
 * `globals.css`, inside the reduced-motion guard like every keyframe there,
 * so under `reduce` the grid stands still.
 *
 * It replaced the halftone-dot artwork behind the homepage's certifications
 * band. Same contract as that layer: `aria-hidden`, absolute, under a
 * `relative` Container, inside a section that clips its overflow — the
 * plane is 600vw wide and would widen a 320px document otherwise.
 */
import type { CSSProperties, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface RetroGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Perspective angle of the grid plane */
  angle?: number;
  cellSize?: number;
  opacity?: number;
}

/**
 * Scrolling perspective grid backdrop. Place inside a
 * `relative overflow-hidden` section.
 */
export function RetroGrid({
  className,
  angle = 55,
  cellSize = 56,
  opacity = 0.4,
  ...props
}: RetroGridProps) {
  return (
    <div
      aria-hidden
      data-slot="retro-grid"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden [perspective:240px]",
        className
      )}
      style={{ opacity }}
      {...props}
    >
      <div
        className="absolute inset-0"
        style={{ transform: `rotateX(${angle}deg)` }}
      >
        <div
          className="animate-retro-grid [inset:0%_0px] [margin-left:-200%] [transform-origin:100%_0_0] absolute h-[300vh] w-[600vw] [background-image:linear-gradient(to_right,var(--grid-line)_1px,transparent_0),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_0)] [background-repeat:repeat]"
          style={
            {
              backgroundSize: `${cellSize}px ${cellSize}px`,
              // Not `line-strong`: the registry's `--border` is light on a
              // dark demo page, and the same idea on a white page was #e0e0d8
              // at 90% under 0.35 opacity — a grid nobody could see. The
              // brand `500` at half strength reads on both grounds.
              "--grid-line":
                "color-mix(in oklab, var(--color-brand-500) 55%, transparent)",
            } as CSSProperties
          }
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-page via-transparent to-page" />
    </div>
  );
}
