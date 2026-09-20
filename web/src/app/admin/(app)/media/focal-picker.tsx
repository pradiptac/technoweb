"use client";

import Image from "next/image";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/api";

/**
 * The focal point picker: click the picture where its subject is.
 *
 * A focal point is a property of the file, set here beside the alt text
 * and read by every page that crops the picture — a 4:3 tile, a 300px
 * banner, a 1:1 thumbnail — as `object-position`. It never resizes or
 * pads anything; it only says which part of the picture a crop keeps.
 *
 * The preview is the whole file, contained, so the box under the pointer
 * *is* the picture and a click's offset is the percentage directly. A
 * crosshair marks the point; with none chosen it sits at the centre,
 * dimmed, because that is where every crop lands by default. Two hidden
 * inputs carry the pair to the form's ordinary save, both blank for the
 * centre — the API takes the two together or not at all, and "Reset to
 * centre" clears both. Arrow keys nudge the point by one, Shift by ten,
 * so the control is not pointer-only.
 *
 * `unoptimized`: a console preview, the one exception the images rule
 * makes — and the picture must be the file as it is, not a resized
 * variant, for the offsets to mean what they say. Raster and SVG alike;
 * a focal point is about cropping, not pixels.
 */
export function FocalPicker({ item }: { item: MediaItem }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(
    item.focal_x !== null && item.focal_y !== null ? { x: item.focal_x, y: item.focal_y } : null,
  );
  const x = point?.x ?? 50;
  const y = point?.y ?? 50;
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

  const pick = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setPoint({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) });
  };

  const nudge = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setPoint({ x: clamp(x + move[0]), y: clamp(y + move[1]) });
  };

  return (
    <div className="mb-[18px]">
      <p className="mb-1.5 text-13 font-medium text-ink">Focal point</p>
      <div className="flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={pick}
          onKeyDown={nudge}
          aria-label={point ? `Focal point at ${x}% across, ${y}% down. Click to move it; arrow keys nudge it.` : "Focal point at the centre. Click the picture where its subject is; arrow keys nudge it."}
          className="relative inline-block max-w-full cursor-crosshair overflow-hidden rounded-md border border-line-strong bg-surface-2 leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Image
            src={item.url}
            alt=""
            width={item.width ?? 1200}
            height={item.height ?? 900}
            unoptimized
            draggable={false}
            className="block h-auto max-h-64 w-auto max-w-full select-none"
          />
          {/*
            The crosshair: a ring and two hairlines, centred on the point. White
            with a scrim-coloured outline, because it sits over a photograph —
            a ground that does not follow the scheme, the same reason a slide
            caption's shade is `--color-scrim` and not a token that inverts.
          */}
          <span
            aria-hidden
            className={cn("pointer-events-none absolute", point ? "opacity-100" : "opacity-45")}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="absolute -left-4 -top-4 block size-8 rounded-full border-2 border-white shadow-[0_0_0_1px_var(--color-scrim),inset_0_0_0_1px_var(--color-scrim)]" />
            <span className="absolute -left-6 top-0 block h-px w-12 -translate-y-1/2 bg-white shadow-[0_0_0_1px_var(--color-scrim)]" />
            <span className="absolute -top-6 left-0 block h-12 w-px -translate-x-1/2 bg-white shadow-[0_0_0_1px_var(--color-scrim)]" />
          </span>
        </button>

        <div className="grid min-w-[12rem] gap-2 text-13 text-muted">
          <p aria-live="polite">
            {point
              ? <><span className="font-mono text-ink">{x}%</span> across, <span className="font-mono text-ink">{y}%</span> down</>
              : "Centre — the default for every crop"}
          </p>
          <p className="text-12">
            Click where the subject is. Every page that crops this picture keeps that part in frame.
          </p>
          <div>
            <Button type="button" variant="secondary" size="sm" disabled={!point} onClick={() => setPoint(null)}>
              Reset to centre
            </Button>
          </div>
        </div>
      </div>
      {/* Both blank for the centre; the API takes the pair together or not at all. */}
      <input type="hidden" name="focal_x" value={point ? String(point.x) : ""} />
      <input type="hidden" name="focal_y" value={point ? String(point.y) : ""} />
    </div>
  );
}
