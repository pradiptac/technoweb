"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { cropMediaAction, type CropState } from "./actions";
import { Dialog } from "./item-menu";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/api";

/** A selection in *displayed* pixels. Converted to natural on submit. */
type Rect = { x: number; y: number; w: number; h: number };

const ASPECTS = [
  { label: "Free", value: 0 },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:4", value: 3 / 4 },
] as const;

type Handle = "nw" | "ne" | "sw" | "se";

/**
 * Crop, with the selection drawn over the image.
 *
 * Coordinates are kept in displayed pixels and converted to the image's own
 * pixels only on submit. The displayed image is almost never 1:1 — an 870px
 * photo shown 420px wide is the normal case — so doing the arithmetic
 * anywhere but the boundary means every handler has to remember the scale.
 *
 * No cropping library: this is a rectangle, four handles and a scale factor.
 * The whole of it is smaller than the dependency would be.
 */
export function CropDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [state, action, pending] = useActionState<CropState, FormData>(cropMediaAction, {});
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [aspect, setAspect] = useState<number>(0);

  const drag = useRef<
    | { kind: "new"; ox: number; oy: number }
    | { kind: "move"; dx: number; dy: number }
    | { kind: "resize"; handle: Handle; ox: number; oy: number }
    | null
  >(null);

  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  /** Displayed size, once the image has laid out. */
  const measure = () => {
    const img = imgRef.current;
    if (!img) return;
    const r = img.getBoundingClientRect();
    if (r.width < 1) return;
    setBox({ w: r.width, h: r.height });
    setRect((current) => current ?? {
      // Start with the middle 80%, which is a more useful default than
      // nothing to drag and nothing to see.
      x: r.width * 0.1, y: r.height * 0.1, w: r.width * 0.8, h: r.height * 0.8,
    });
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) measure();
    img.addEventListener("load", measure);
    window.addEventListener("resize", measure);
    return () => {
      img.removeEventListener("load", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  /**
   * Keep a rectangle inside the image and on ratio.
   *
   * The ratio is a parameter rather than read from state so a ratio button can
   * change it and re-clamp in the same handler — doing that in an effect
   * cascades a second render for something the click already knows.
   */
  const clamp = (r: Rect, ratio = aspect): Rect => {
    if (!box) return r;
    let { x, y, w, h } = r;
    w = Math.max(12, Math.min(w, box.w));
    h = Math.max(12, Math.min(h, box.h));
    if (ratio) h = w / ratio;
    if (h > box.h) { h = box.h; w = ratio ? h * ratio : w; }
    x = Math.max(0, Math.min(x, box.w - w));
    y = Math.max(0, Math.min(y, box.h - h));
    return { x, y, w, h };
  };

  const chooseAspect = (ratio: number) => {
    setAspect(ratio);
    setRect((r) => (r ? clamp(r, ratio) : r));
  };

  const pointFrom = (e: React.PointerEvent | PointerEvent) => {
    const f = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - f.left, y: e.clientY - f.top };
  };

  const onPointerDown = (e: React.PointerEvent, mode: "new" | "move" | Handle) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = pointFrom(e);

    if (mode === "new") {
      drag.current = { kind: "new", ox: p.x, oy: p.y };
      setRect(clamp({ x: p.x, y: p.y, w: 12, h: 12 }));
    } else if (mode === "move" && rect) {
      drag.current = { kind: "move", dx: p.x - rect.x, dy: p.y - rect.y };
    } else if (rect) {
      drag.current = { kind: "resize", handle: mode as Handle, ox: p.x, oy: p.y };
    }
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !frameRef.current) return;
      const p = pointFrom(e);

      if (d.kind === "new") {
        setRect(clamp({
          x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y),
          w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy),
        }));
        return;
      }
      if (d.kind === "move") {
        setRect((r) => (r ? clamp({ ...r, x: p.x - d.dx, y: p.y - d.dy }) : r));
        return;
      }
      setRect((r) => {
        if (!r) return r;
        const right = r.x + r.w;
        const bottom = r.y + r.h;
        const next = { ...r };
        if (d.handle.includes("w")) { next.x = p.x; next.w = right - p.x; }
        if (d.handle.includes("e")) { next.w = p.x - r.x; }
        if (d.handle.includes("n")) { next.y = p.y; next.h = bottom - p.y; }
        if (d.handle.includes("s")) { next.h = p.y - r.y; }
        return clamp(next);
      });
    };
    const up = () => { drag.current = null; };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, aspect, rect]);

  // Displayed pixels to the image's own. One place, on purpose.
  const scale = box && item.width ? item.width / box.w : 1;
  const natural = rect
    ? {
      x: Math.round(rect.x * scale),
      y: Math.round(rect.y * scale),
      w: Math.round(rect.w * scale),
      h: Math.round(rect.h * scale),
    }
    : null;

  const handleClass =
    "absolute size-3 rounded-sm border border-white bg-brand-600 shadow-1";

  return (
    <Dialog title={`Crop ${item.filename}`} onClose={onClose}>
      <form action={action}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="x" value={natural?.x ?? 0} />
        <input type="hidden" name="y" value={natural?.y ?? 0} />
        <input type="hidden" name="width" value={natural?.w ?? 0} />
        <input type="hidden" name="height" value={natural?.h ?? 0} />

        {state.error && <Alert tone="err" title="Could not crop">{state.error}</Alert>}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-faint">Ratio</span>
          {ASPECTS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => chooseAspect(a.value)}
              aria-pressed={aspect === a.value}
              className={cn(
                "cursor-pointer rounded border px-2.5 py-1 text-[12.5px]",
                aspect === a.value
                  ? "border-brand-600 bg-brand-600 font-semibold text-white"
                  : "border-line-strong bg-card text-muted hover:text-ink",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div
          ref={frameRef}
          onPointerDown={(e) => onPointerDown(e, "new")}
          className="relative mx-auto w-fit touch-none overflow-hidden rounded border border-line-strong bg-surface select-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={item.url}
            alt=""
            draggable={false}
            className="block max-h-[320px] w-auto max-w-full"
          />

          {rect && (
            <>
              {/* Everything outside the selection, dimmed. Four panels rather
                  than a box-shadow so the cut-out edge stays crisp. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 bg-ink/45" style={{ height: rect.y }} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink/45" style={{ top: rect.y + rect.h }} />
              <div className="pointer-events-none absolute left-0 bg-ink/45" style={{ top: rect.y, height: rect.h, width: rect.x }} />
              <div className="pointer-events-none absolute right-0 bg-ink/45" style={{ top: rect.y, height: rect.h, left: rect.x + rect.w }} />

              <div
                onPointerDown={(e) => onPointerDown(e, "move")}
                style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(18,20,13,.5)]"
              >
                {(["nw", "ne", "sw", "se"] as Handle[]).map((h) => (
                  <span
                    key={h}
                    onPointerDown={(e) => onPointerDown(e, h)}
                    className={cn(
                      handleClass,
                      h === "nw" && "-top-1.5 -left-1.5 cursor-nwse-resize",
                      h === "ne" && "-top-1.5 -right-1.5 cursor-nesw-resize",
                      h === "sw" && "-bottom-1.5 -left-1.5 cursor-nesw-resize",
                      h === "se" && "-right-1.5 -bottom-1.5 cursor-nwse-resize",
                    )}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <p className="mt-2 text-center text-[12.5px] text-muted">
          {natural
            ? <>Crop <strong className="font-semibold text-ink">{natural.w} × {natural.h}</strong> from {item.width} × {item.height} px — drag to move, corners to resize.</>
            : "Drag on the image to choose an area."}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="submit" disabled={pending || !natural || natural.w < 8}>
            {pending ? "Cropping…" : "Crop"}
          </Button>
          <button
            type="button"
            onClick={() => { setAspect(0); setRect(null); measure(); }}
            className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
          <span className="ml-auto text-[12.5px] text-muted">This replaces the original.</span>
        </div>
      </form>
    </Dialog>
  );
}
