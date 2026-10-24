"use client";

import { useEffect } from "react";
import { useMotionOk } from "@/lib/hooks/use-carousel";

/**
 * Buttons that drift towards the pointer (`motion_buttons: magnetic`, 0.192.0).
 *
 * One delegated listener for the whole page, the `CardTilt` pattern: a
 * pointer over a `.btn` inside `[data-motion-buttons="magnetic"]` writes how
 * far the pointer is from the button's centre as `--mx`/`--my` in pixels
 * (at most 6, reached at the edge); `globals.css` reads them into `translate`
 * and springs the button home when they are removed. The centre is taken from
 * the box minus the drift already applied, or the button would chase its own
 * pointer. Throttled to a frame, fine pointers and allowed motion only —
 * nothing is listened to otherwise. Mounted by the public layout only when
 * the setting asks for it (and by the Motion tab to preview it).
 */
const REACH = 6;
const BUTTON = '[data-motion-buttons="magnetic"] .btn';

export function MagneticButtons() {
  const ok = useMotionOk();

  useEffect(() => {
    if (!ok || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    let current: HTMLElement | null = null;
    let last: PointerEvent | null = null;
    let dx = 0;
    let dy = 0;

    const release = () => {
      current?.style.removeProperty("--mx");
      current?.style.removeProperty("--my");
      current = null;
      dx = dy = 0;
    };

    const paint = () => {
      frame = 0;
      const target = (last?.target as Element | null)?.closest<HTMLElement>(BUTTON) ?? null;
      if (target !== current) {
        release();
        current = target && !target.matches(":disabled, [aria-disabled='true']") ? target : null;
      }
      if (!current || !last) return;
      const box = current.getBoundingClientRect();
      const cx = box.left - dx + box.width / 2;
      const cy = box.top - dy + box.height / 2;
      const clamp = (v: number) => Math.min(1, Math.max(-1, v));
      dx = clamp((last.clientX - cx) / (box.width / 2)) * REACH;
      dy = clamp((last.clientY - cy) / (box.height / 2)) * REACH;
      current.style.setProperty("--mx", dx.toFixed(2));
      current.style.setProperty("--my", dy.toFixed(2));
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", release);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", release);
      if (frame) cancelAnimationFrame(frame);
      release();
    };
  }, [ok]);

  return null;
}
