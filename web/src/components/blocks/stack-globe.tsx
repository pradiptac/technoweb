"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useDocumentHidden, useMotionOk } from "@/lib/hooks/use-carousel";
import { cn } from "@/lib/utils";

/** The golden angle, which is what spreads a Fibonacci sphere's points evenly. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** The sphere's radius, in `cqw` of the stage — the stage is a size container. */
const RADIUS = 34;
/** The starting tilt, so the first frame shows the sphere a little from above rather than edge-on. */
const START_TILT = -0.32;
/** Radians per millisecond: one turn in a little under forty seconds. */
const SPIN = 0.00017;
/** How far a pointer must travel before a press becomes a drag — below it, a press on a link is a click. */
const DRAG_THRESHOLD = 4;

type Point = [number, number, number];

/** `n` points on a unit sphere, evenly spread. Deterministic, so the server and the client agree. */
function sphere(n: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = i * GOLDEN;
    return [Math.cos(t) * r, y, Math.sin(t) * r];
  });
}

/** Turns a point about the vertical axis by `ay`, then about the horizontal by `ax`. */
function turn([x, y, z]: Point, ax: number, ay: number): Point {
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(ax), sx = Math.sin(ax);
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

/** Two decimals: enough for a pixel, and the same string on both sides of hydration. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Where a point is drawn: `translate` off the stage's centre, depth as
 * `scale`, opacity and stacking order. Individual transform properties, so
 * nothing here fights a Tailwind utility (CLAUDE.md, the v4 transform trap).
 */
function place(p: Point, ax: number, ay: number) {
  const [x, y, z] = turn(p, ax, ay);
  // z runs -1 (behind) to 1 (in front); depth 0..1.
  const depth = (z + 1) / 2;
  return {
    translate: `calc(-50% + ${r2(x * RADIUS)}cqw) calc(-50% + ${r2(y * RADIUS)}cqw)`,
    scale: String(r2(0.6 + 0.4 * depth)),
    opacity: String(r2(0.28 + 0.72 * depth)),
    zIndex: String(Math.round(depth * 100)),
  };
}

/**
 * The globe layout: the technologies on a sphere that turns slowly, drawn as
 * HTML so every logo stays crisp at any size.
 *
 * The first render — on the server and on the client alike — is the sphere
 * at its starting angle, worked out from nothing but the count, so hydration
 * has nothing to disagree about. The turning starts in an effect and writes
 * each node's style directly through a ref: sixty React renders a second to
 * move a handful of logos is work nobody needs.
 *
 * It stops when the pointer is over it, when anything inside has focus, when
 * the tab is hidden, while it is being dragged, and when the Pause button
 * says so. Under reduced motion it never turns by itself — a still sphere —
 * though a drag still spins it, because that motion is the reader's own.
 */
export function StackGlobe({ nodes, label }: { nodes: ReactNode[]; label: string }) {
  const points = useMemo(() => sphere(nodes.length), [nodes.length]);
  const motionOk = useMotionOk();
  const hidden = useDocumentHidden();
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);

  const angle = useRef({ ax: START_TILT, ay: 0 });
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);

  const paint = useCallback(() => {
    const { ax, ay } = angle.current;
    points.forEach((p, i) => {
      const el = refs.current[i];
      if (!el) return;
      const s = place(p, ax, ay);
      el.style.translate = s.translate;
      el.style.scale = s.scale;
      el.style.opacity = s.opacity;
      el.style.zIndex = s.zIndex;
    });
  }, [points]);

  const running = motionOk && !hidden && !paused && !hover && !focused && !dragging;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      // A frame after a long stall (a background tab, a debugger) must not lurch the sphere.
      const dt = Math.min(64, now - last);
      last = now;
      angle.current.ay += dt * SPIN;
      paint();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running, paint]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      // Captured only once it is a drag: capturing on press would retarget the
      // click to the stage and a link on the sphere could never be followed.
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    d.x = e.clientX;
    d.y = e.clientY;
    angle.current.ay += dx * 0.008;
    angle.current.ax = Math.max(-1.2, Math.min(1.2, angle.current.ax - dy * 0.008));
    paint();
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      setDragging(false);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-[560px] pb-9">
      <div
        className={cn("stack-globe", dragging && "stack-globe--dragging")}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }}
        onPointerLeave={() => setHover(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onFocus={() => setFocused(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
      >
        <span aria-hidden="true" className="stack-globe__shell" />
        {nodes.map((node, i) => {
          const s = place(points[i], START_TILT, 0);
          const style: CSSProperties = { translate: s.translate, scale: s.scale, opacity: s.opacity, zIndex: s.zIndex };
          return (
            <div key={i} ref={(el) => { refs.current[i] = el; }} className="stack-globe__node" style={style}>
              {node}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? `Resume ${label}` : `Pause ${label}`}
        className="absolute bottom-0 right-0 z-10 grid size-7 place-items-center rounded-full border border-line bg-card/90 text-muted transition-colors duration-(--duration-fast) hover:text-ink focus-visible:text-ink"
      >
        {paused ? (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        )}
      </button>
    </div>
  );
}
