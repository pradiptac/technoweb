"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ratioLabel, type ImageSpec } from "@/lib/image-specs";

/** A crop in the image's own pixels. */
export type CropRect = { x: number; y: number; w: number; h: number };

export type CropRatio = { label: string; value: number };

/**
 * The ratios a crop offers: the field's own first (and alone when locked),
 * then Free, the image's Original and the usual five.
 */
export function cropRatios(width: number, height: number, spec?: ImageSpec): CropRatio[] {
  const own = spec && spec.ratio !== "free" ? spec.ratio : null;
  if (own && spec?.lock) return [{ label: ratioLabel(own) ?? "Required", value: own }];
  const list: CropRatio[] = [
    ...(own ? [{ label: `${ratioLabel(own)} (this field)`, value: own }] : []),
    { label: "Free", value: 0 },
    { label: "Original", value: width / height },
    { label: "1:1", value: 1 },
    { label: "4:3", value: 4 / 3 },
    { label: "16:9", value: 16 / 9 },
    { label: "3:4", value: 3 / 4 },
    { label: "9:16", value: 9 / 16 },
  ];
  // A preset equal to the field's own ratio is the same button twice.
  return own ? list.filter((r, i) => i === 0 || Math.abs(r.value - own) > 0.005) : list;
}

type Box = { x: number; y: number; w: number; h: number };
type Handle = "nw" | "ne" | "sw" | "se";

/*
 * The stage is 320px tall when the dialog has room, and shorter when it does
 * not. A fixed 320 put the size line and the keyboard hint under the button
 * bar: the dialog is capped at 38rem (and the window less 4rem), and the
 * title, ratios, zoom and both lines of text need the rest. So the stage is
 * measured into what is left — see `fitHeight()`.
 */
const STAGE_H = 320;
const STAGE_MIN_H = 160;
const PAD = 16;
const MAX_ZOOM = 8;
const MIN_FRAME = 24;

/**
 * The one crop surface (docs/media.md "Crop before upload"): a frame drawn in
 * the chosen ratio over the picture, which zooms (slider, Ctrl/⌘ + wheel or a
 * trackpad pinch, two-finger pinch) and pans (drag) underneath it. Under Free
 * the frame's corners resize it. From the keyboard, with the stage focused:
 * arrows pan, + and − zoom, Shift + arrows resize a free frame.
 *
 * Everything is kept in stage pixels — the image's place (`img`) and the
 * frame — and converted to the image's own pixels once, for `onChange`. The
 * image always covers the frame, so a crop is never partly empty. No
 * library: a scale, an offset and a rectangle.
 *
 * Used by the media library's crop (which then crops on the server) and by
 * the crop that opens before an upload (which crops in the browser).
 */
export function CropStage({
  src, width, height, ratios, onChange, id = "crop",
}: {
  src: string;
  /** The image's own size. */
  width: number;
  height: number;
  ratios: CropRatio[];
  onChange: (rect: CropRect) => void;
  id?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);
  const [ratio, setRatio] = useState(ratios[0]?.value ?? 0);
  const [zoom, setZoom] = useState(1);
  const [img, setImg] = useState<Box | null>(null);
  const [frame, setFrame] = useState<Box | null>(null);

  // The scale at which the whole picture fits the stage: zoom 1.
  const [stageH, setStageH] = useState(STAGE_H);
  const fit = stageW ? Math.min((stageW - PAD * 2) / width, (stageH - PAD * 2) / height) : 0;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    /*
     * Everything in the dialog but the stage — its header and buttons, and
     * the rest of the scrolling body — measured as it is, so a long file
     * name or a hint wrapping on a phone is counted; the stage takes what is
     * left of the dialog's own max-height, between 160 and 320.
     */
    const fitHeight = () => {
      const dialog = el.closest("dialog");
      const body = el.parentElement?.closest<HTMLElement>(".overflow-y-auto");
      if (!dialog || !body) return;
      const cap = parseFloat(getComputedStyle(dialog).maxHeight);
      if (!Number.isFinite(cap)) return;
      const around = dialog.offsetHeight - body.clientHeight;
      const rest = body.scrollHeight - el.offsetHeight;
      setStageH(Math.round(Math.min(STAGE_H, Math.max(STAGE_MIN_H, cap - around - rest - 2))));
    };
    const measure = () => {
      setStageW(el.clientWidth);
      fitHeight();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  /** The largest frame of `r` inside `within`, centred on (cx, cy) where it fits. */
  const frameFor = useCallback((r: number, within: Box, cx: number, cy: number): Box => {
    let w = within.w;
    let h = within.h;
    if (r) {
      if (w / h > r) w = h * r;
      else h = w / r;
    }
    const x = Math.min(Math.max(cx - w / 2, within.x), within.x + within.w - w);
    const y = Math.min(Math.max(cy - h / 2, within.y), within.y + within.h - h);
    return { x, y, w, h };
  }, []);

  /** Where the frame may be: the stage less its padding, and the picture. */
  const bounds = useCallback((image: Box): Box => {
    const x = Math.max(PAD, image.x);
    const y = Math.max(PAD, image.y);
    const r = Math.min(stageW - PAD, image.x + image.w);
    const b = Math.min(stageH - PAD, image.y + image.h);
    return { x, y, w: Math.max(MIN_FRAME, r - x), h: Math.max(MIN_FRAME, b - y) };
  }, [stageW, stageH]);

  /** Keep the picture covering the frame. */
  const cover = useCallback((image: Box, f: Box): Box => ({
    ...image,
    x: Math.min(f.x, Math.max(image.x, f.x + f.w - image.w)),
    y: Math.min(f.y, Math.max(image.y, f.y + f.h - image.h)),
  }), []);

  // Lay out once the stage has a width, and again when it changes size —
  // adjusted during render, so the first paint is already laid out.
  const [laidFor, setLaidFor] = useState("");
  if (fit && laidFor !== `${stageW}x${stageH}`) {
    setLaidFor(`${stageW}x${stageH}`);
    const w = width * fit;
    const h = height * fit;
    const image = { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h };
    setZoom(1);
    setImg(image);
    setFrame(frameFor(ratio, bounds(image), stageW / 2, stageH / 2));
  }

  // Report the crop in the image's own pixels.
  useEffect(() => {
    if (!img || !frame) return;
    const s = img.w / width;
    const x = Math.round((frame.x - img.x) / s);
    const y = Math.round((frame.y - img.y) / s);
    const w = Math.min(width - x, Math.round(frame.w / s));
    const h = Math.min(height - y, Math.round(frame.h / s));
    onChange({ x: Math.max(0, x), y: Math.max(0, y), w: Math.max(1, w), h: Math.max(1, h) });
  }, [img, frame, width, height, onChange]);

  const chooseRatio = (r: number) => {
    setRatio(r);
    if (!img || !frame) return;
    setFrame(frameFor(r, bounds(img), frame.x + frame.w / 2, frame.y + frame.h / 2));
  };

  /** Zoom about a point of the stage (the frame's centre unless given). */
  const zoomTo = (next: number, at?: { x: number; y: number }) => {
    if (!img || !frame || !fit) return;
    // Never so far out that the picture stops covering the frame.
    const least = Math.max(1, frame.w / (width * fit), frame.h / (height * fit));
    const z = Math.min(MAX_ZOOM, Math.max(least, next));
    const s = fit * z;
    const px = at?.x ?? frame.x + frame.w / 2;
    const py = at?.y ?? frame.y + frame.h / 2;
    const nx = (px - img.x) / img.w; // the picture's fraction under the point
    const ny = (py - img.y) / img.h;
    const w = width * s;
    const h = height * s;
    setZoom(z);
    setImg(cover({ x: px - nx * w, y: py - ny * h, w, h }, frame));
  };

  const pan = (dx: number, dy: number) => {
    if (!img || !frame) return;
    setImg(cover({ ...img, x: img.x + dx, y: img.y + dy }, frame));
  };

  const resize = (handle: Handle, px: number, py: number) => {
    if (!img || !frame) return;
    const lim = bounds(img);
    let { x, y, w, h } = frame;
    const right = x + w;
    const bottom = y + h;
    if (handle.includes("w")) { x = Math.min(Math.max(px, lim.x), right - MIN_FRAME); w = right - x; }
    if (handle.includes("e")) { w = Math.min(Math.max(px - x, MIN_FRAME), lim.x + lim.w - x); }
    if (handle.includes("n")) { y = Math.min(Math.max(py, lim.y), bottom - MIN_FRAME); h = bottom - y; }
    if (handle.includes("s")) { h = Math.min(Math.max(py - y, MIN_FRAME), lim.y + lim.h - y); }
    setFrame({ x, y, w, h });
  };

  // Pointers: one drags (pan, or a corner), two pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: "pan" | Handle; lx: number; ly: number } | { kind: "pinch"; dist: number; zoom: number } | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent, kind: "pan" | Handle) => {
    e.preventDefault();
    e.stopPropagation();
    stageRef.current?.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
    } else {
      gesture.current = { kind, lx: p.x, ly: p.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      zoomTo(g.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    if (g.kind === "pan") {
      pan(p.x - g.lx, p.y - g.ly);
      gesture.current = { kind: "pan", lx: p.x, ly: p.y };
      return;
    }
    resize(g.kind, p.x, p.y);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };

  // Ctrl/⌘ + wheel (and a trackpad's pinch, which arrives as one) zooms. A
  // plain wheel scrolls the dialog as it would anywhere else.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoom * Math.exp(-e.deltaY / 300), local(e));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.altKey ? 2 : 12;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomTo(zoom * 1.15); return; }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomTo(zoom / 1.15); return; }
    const a = arrows[e.key];
    if (!a || !frame) return;
    e.preventDefault();
    if (e.shiftKey && ratio === 0) resize("se", frame.x + frame.w + a[0], frame.y + frame.h + a[1]);
    // The picture moves under the frame, so the arrow moves the view the
    // way it points: right shows more of the right.
    else pan(-a[0], -a[1]);
  };

  const s = img ? img.w / width : 1;
  const natural = img && frame
    ? { w: Math.round(frame.w / s), h: Math.round(frame.h / s) }
    : null;
  const handle = "absolute size-3.5 rounded-sm border border-white bg-brand-600 shadow-1";

  return (
    <div>
      {ratios.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Ratio">
          <span className="text-12 font-semibold text-faint">Ratio</span>
          {ratios.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => chooseRatio(r.value)}
              aria-pressed={Math.abs(ratio - r.value) < 0.0001}
              className={cn(
                "cursor-pointer rounded border px-2.5 py-1 text-12-5",
                Math.abs(ratio - r.value) < 0.0001
                  ? "border-brand-600 bg-brand-600 font-semibold text-brand-on"
                  : "border-line-strong bg-card text-muted hover:text-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={stageRef}
        tabIndex={0}
        role="group"
        aria-label="Crop area"
        aria-describedby={`${id}-keys`}
        data-crop-stage
        // A corner says which it is; anywhere else pans.
        onPointerDown={(e) => onPointerDown(e, ((e.target as HTMLElement).dataset.handle as Handle | undefined) ?? "pan")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative w-full cursor-grab touch-none overflow-hidden rounded border border-line-strong bg-surface-2 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:cursor-grabbing"
        style={{ height: stageH }}
      >
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ left: img.x, top: img.y, width: img.w, height: img.h }}
          />
        )}

        {frame && (
          <>
            {/* Everything outside the frame, dimmed: four panels, so the cut
                edge stays crisp. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 bg-dark/55" style={{ height: frame.y }} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-dark/55" style={{ top: frame.y + frame.h }} />
            <div className="pointer-events-none absolute left-0 bg-dark/55" style={{ top: frame.y, height: frame.h, width: frame.x }} />
            <div className="pointer-events-none absolute right-0 bg-dark/55" style={{ top: frame.y, height: frame.h, left: frame.x + frame.w }} />

            <div
              data-crop-frame
              className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_1px_rgba(18,20,13,.5)]"
              style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
            >
              {/* Thirds, the guide every camera draws. */}
              <span className="absolute inset-y-0 left-1/3 w-px bg-white/45" />
              <span className="absolute inset-y-0 left-2/3 w-px bg-white/45" />
              <span className="absolute inset-x-0 top-1/3 h-px bg-white/45" />
              <span className="absolute inset-x-0 top-2/3 h-px bg-white/45" />
              {ratio === 0 && (["nw", "ne", "sw", "se"] as Handle[]).map((h) => (
                <span
                  key={h}
                  data-handle={h}
                  className={cn(
                    handle, "pointer-events-auto",
                    h === "nw" && "-top-2 -left-2 cursor-nwse-resize",
                    h === "ne" && "-top-2 -right-2 cursor-nesw-resize",
                    h === "sw" && "-bottom-2 -left-2 cursor-nesw-resize",
                    h === "se" && "-right-2 -bottom-2 cursor-nwse-resize",
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label htmlFor={`${id}-zoom`} className="text-12 font-semibold text-faint">Zoom</label>
        <input
          id={`${id}-zoom`}
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => zoomTo(Number(e.target.value))}
          className="h-6 flex-1 accent-brand-600"
          data-crop-zoom
        />
        <span className="w-12 text-right font-mono text-12 text-muted">{zoom.toFixed(1)}×</span>
      </div>

      <p className="mt-2 text-center text-12-5 text-muted" aria-live="polite">
        {natural
          ? <>Crop <strong className="font-semibold text-ink" data-crop-size>{natural.w} × {natural.h}</strong> from {width} × {height} px</>
          : "Loading the picture…"}
      </p>
      <p id={`${id}-keys`} className="mt-1 text-center text-12 text-faint">
        Drag to move the picture{ratio === 0 ? ", corners to resize the frame" : ""}. Ctrl + scroll or pinch to zoom. Arrows move, + and − zoom.
      </p>
    </div>
  );
}
