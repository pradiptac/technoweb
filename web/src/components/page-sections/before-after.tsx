"use client";

import Image from "next/image";
import { useState } from "react";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";

/**
 * Two pictures of one place, the divider between them dragged across
 * (0.109.0, a builder `before_after` section).
 *
 * The control is a real `<input type="range">` over the whole picture, so a
 * pointer drags it anywhere, a keyboard moves it with the arrows and a screen
 * reader hears a slider with its value — the accessible part is the native
 * element, not a hand-rolled handle. The visible handle is drawn beside it
 * and takes the input's focus ring through `peer-focus-visible`.
 *
 * The labels and the handle sit on `bg-card`, an opaque ground of their own,
 * because no colour is safe on an arbitrary photograph.
 */
export function BeforeAfter({
  before, beforeAlt, beforeFocus, beforeBlur, after, afterAlt, afterFocus, afterBlur, beforeLabel, afterLabel, start = 50,
}: {
  before: string; beforeAlt: string; beforeFocus?: string | null; beforeBlur?: string | null;
  after: string; afterAlt: string; afterFocus?: string | null; afterBlur?: string | null;
  beforeLabel: string; afterLabel: string; start?: number;
}) {
  const [pos, setPos] = useState(Math.min(90, Math.max(10, start)));

  return (
    <div data-before-after className="relative aspect-[16/10] select-none overflow-hidden rounded-xl border border-line-strong bg-surface-2">
      <Image src={after} alt={afterAlt} fill sizes="(min-width: 1100px) 1024px, 94vw" className="object-cover" style={focalStyle(afterFocus)} {...blurProps(afterBlur)} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <Image src={before} alt={beforeAlt} fill sizes="(min-width: 1100px) 1024px, 94vw" className="object-cover" style={focalStyle(beforeFocus)} {...blurProps(beforeBlur)} />
      </div>

      <span className="absolute left-3 top-3 rounded-full bg-card px-3 py-1 text-12-5 font-semibold text-ink shadow-1" aria-hidden>{beforeLabel}</span>
      <span className="absolute right-3 top-3 rounded-full bg-card px-3 py-1 text-12-5 font-semibold text-ink shadow-1" aria-hidden>{afterLabel}</span>

      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label={`${beforeLabel} and ${afterLabel}: drag to compare`}
        aria-valuetext={`${pos}% ${beforeLabel.toLowerCase()}`}
        className="peer absolute inset-0 z-2 m-0 h-full w-full cursor-ew-resize opacity-0"
      />

      <span aria-hidden className="pointer-events-none absolute inset-y-0 z-1 w-0.5 -translate-x-1/2 bg-card shadow-1" style={{ left: `${pos}%` }} />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 z-1 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-card text-ink shadow-3 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600"
        style={{ left: `${pos}%` }}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
        </svg>
      </span>
    </div>
  );
}
