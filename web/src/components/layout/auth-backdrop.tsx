"use client";

import { useEffect, useRef } from "react";
import { useDocumentHidden, useMotionOk } from "@/lib/hooks/use-carousel";
import { SCENES } from "@/components/layout/backdrop-scenes";
import { rgba, type Palette, type Rgb, type Scene, type SceneInput } from "@/components/layout/backdrop-scenes/shared";
import {
  INTENSITY_FACTOR, SPEED_FACTOR,
  type LoginBackdropId, type LoginIntensityId, type LoginSpeedId,
} from "@/lib/login-backdrop-choices";

/**
 * The animated panel beside the sign-in, registration and password forms.
 *
 * One `<canvas>`, one drawing loop, fifteen styles — chosen in Settings →
 * Sign-in screen (`login_backdrop`, `login_intensity`, `login_speed`, see
 * `lib/login-backdrop-choices.ts`). The client asked for this beside the
 * fixed picture on 2026-09-17, from a reference whose tiles were
 * Particles, Waves, Circuit, Geometric, Data flow, Gradient, Quantum and
 * Stars with an intensity and a speed under them. Seven more followed on
 * 2026-09-24, after Vengeance UI's backgrounds (Wave grid, Aurora, Fluid
 * morph, Twisting ribbon, Animated rays, Perspective grid, Light lines),
 * re-drawn on this same canvas: the originals lean on three.js and
 * framer-motion, and neither belongs on a sign-in page. The scenes live in
 * `backdrop-scenes/`; this file is the loop, the palette and the ground.
 *
 * Four rules, each for a reason this file already records elsewhere:
 *
 * - **The colours are the theme's**, read once at mount from
 *   `--color-brand-400`, `--color-secondary-500` and `--color-accent-500`
 *   on the document, so a palette change reaches this screen without a
 *   second list of colours. They are painted at low alpha over the panel's
 *   own `bg-dark`, which stays the ground the caption is graded against —
 *   the contrast audit reads `background-color`, never a canvas, and the
 *   caption is white on near-black whatever moves behind it.
 * - **Reduced motion draws one frame and stops.** `useMotionOk()` is the
 *   carousels' hook, read on mount and never at render, so the server and
 *   the first client frame agree. The still frame is the same drawing at
 *   t = 0, so a visitor who asked for less motion still gets the picture.
 * - **A hidden tab draws nothing.** `useDocumentHidden()`, the same hook;
 *   a background tab animating a sign-in page is a fan spinning for nobody.
 * - **Nothing here can widen the page.** The canvas is `absolute inset-0`
 *   inside a panel that is `overflow-hidden`, and it is `aria-hidden`: the
 *   panel is decorative and ordered after the form for a screen reader.
 *
 * `still` is for the settings tiles, which show every style at once as a
 * static frame: eight looping canvases in a grid is the cost the reference
 * screen avoided by drawing text-only tiles, and this project's rule is
 * that a picker tile shows the real thing. The live preview under them is
 * the same component running.
 */
export function AuthBackdrop({
  style, intensity = "medium", speed = "normal", still = false, className,
}: {
  style: Exclude<LoginBackdropId, "image">;
  intensity?: LoginIntensityId;
  speed?: LoginSpeedId;
  /** Draw t = 0 once and stop — the settings tiles. */
  still?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motionOk = useMotionOk();
  const hidden = useDocumentHidden();
  const animate = motionOk && !hidden && !still;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const palette = readPalette();
    const density = INTENSITY_FACTOR[intensity];
    const pace = SPEED_FACTOR[speed];
    let w = 0, h = 0, dpr = 1;
    let scene: Scene | null = null;
    // Where the pointer is over the panel, for the one scene that reads it
    // (the wave grid). Listened for on the panel, not the canvas — the
    // caption sits above the canvas and would swallow the events — and only
    // while animating, so a still tile or a reduced-motion visitor attaches
    // nothing.
    const input: SceneInput = { pointer: null };
    const host = canvas.parentElement;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      input.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => { input.pointer = null; };
    if (animate && host) {
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerleave", onLeave);
    }

    const size = () => {
      const rect = canvas.getBoundingClientRect();
      // Capped at 2: a 3x panel is nine million pixels a frame for a
      // difference nobody can see through the alpha.
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene = SCENES[style](w, h, density, palette);
    };

    let frame = 0;
    let last = performance.now();
    let t = 0;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * pace;
      ctx.clearRect(0, 0, w, h);
      ground(ctx, w, h, palette, t);
      scene?.draw(ctx, t, input);
      if (animate) frame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(() => { size(); if (!animate) draw(performance.now()); });
    observer.observe(canvas);
    size();
    // The still frame is drawn a little way in, because at exactly t = 0
    // every wave is flat and every pulse sits at the start of its trace.
    if (!animate) { t = 4; draw(performance.now()); } else { frame = requestAnimationFrame(draw); }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      host?.removeEventListener("pointermove", onMove);
      host?.removeEventListener("pointerleave", onLeave);
    };
  }, [style, intensity, speed, animate]);

  return <canvas ref={ref} aria-hidden className={className ?? "absolute inset-0 size-full"} />;
}

/** The theme's three hues, from the tokens the palette generator writes onto `:root`. */
function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: Rgb): Rgb => parseColour(css.getPropertyValue(name).trim()) ?? fallback;
  return {
    brand: read("--color-brand-400", [143, 166, 94]),
    secondary: read("--color-secondary-500", [97, 129, 100]),
    accent: read("--color-accent-500", [155, 110, 0]),
  };
}

/** `#rrggbb`, `rgb(...)` or, via a scratch element, anything the browser can resolve. */
function parseColour(value: string): Rgb | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
  if (!value) return null;
  // oklch() and friends: let the browser resolve it through a scratch element.
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const again = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(resolved);
  return again ? [+again[1], +again[2], +again[3]] : null;
}

/**
 * Two soft washes under every scene, drifting a little. Hairlines on flat
 * near-black read as thin -- the first cut did, measured against the
 * reference, whose shapes sat on a coloured ground -- and a wash in the
 * theme's own two hues is what gives the panel depth without a picture.
 */
function ground(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, t: number) {
  const big = Math.max(w, h);
  const washes = [
    { colour: p.brand, x: 0.2 + Math.sin(t * 0.12) * 0.06, y: 0.25 + Math.cos(t * 0.1) * 0.05, r: 0.9, a: 0.22 },
    { colour: p.secondary, x: 0.85 + Math.cos(t * 0.09) * 0.05, y: 0.9 + Math.sin(t * 0.11) * 0.05, r: 0.8, a: 0.16 },
  ];
  for (const wsh of washes) {
    const g = ctx.createRadialGradient(wsh.x * w, wsh.y * h, 0, wsh.x * w, wsh.y * h, wsh.r * big);
    g.addColorStop(0, rgba(wsh.colour, wsh.a));
    g.addColorStop(1, rgba(wsh.colour, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
