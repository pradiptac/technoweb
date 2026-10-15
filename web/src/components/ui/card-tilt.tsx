"use client";

import { useEffect } from "react";

/**
 * Cards that lean towards the pointer (`motion_cards: tilt`, 0.103.0).
 *
 * One delegated listener for the whole page rather than one per card: a
 * pointer over a card writes its position on that card as `--tilt-x` and
 * `--tilt-y` (each −0.5…0.5) and stamps `data-tilting`; `globals.css` turns
 * those into a `transform` inside the guard. Throttled to one write per
 * frame, and only on a device that hovers with a fine pointer and has not
 * asked for less motion — on a phone, or under reduced motion, nothing is
 * listened to at all. Mounted by the public layout only when the setting
 * asks for it, so no other choice ships this code.
 *
 * `transform`, never `translate`: the hover lift a card already has is the
 * `translate` property, and the two compose rather than fight.
 */
const CARD = ".public-site :is([data-card],[data-tile])";

export function CardTilt() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;

    let frame = 0;
    let current: HTMLElement | null = null;
    let last: PointerEvent | null = null;

    const release = (el: HTMLElement | null) => {
      if (!el) return;
      el.removeAttribute("data-tilting");
      el.style.removeProperty("--tilt-x");
      el.style.removeProperty("--tilt-y");
    };

    const paint = () => {
      frame = 0;
      if (!last) return;
      const target = (last.target as Element | null)?.closest<HTMLElement>(CARD) ?? null;
      if (target !== current) {
        release(current);
        current = target;
      }
      if (!current) return;
      const box = current.getBoundingClientRect();
      const x = Math.min(0.5, Math.max(-0.5, (last.clientX - box.left) / box.width - 0.5));
      const y = Math.min(0.5, Math.max(-0.5, (last.clientY - box.top) / box.height - 0.5));
      current.style.setProperty("--tilt-x", x.toFixed(3));
      current.style.setProperty("--tilt-y", y.toFixed(3));
      current.setAttribute("data-tilting", "");
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onLeave = () => { release(current); current = null; };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
      release(current);
    };
  }, []);

  return null;
}
