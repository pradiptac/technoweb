"use client";

/**
 * Velora `border-beam` — https://velora.colorlib.com/r/border-beam.json,
 * installed 2026-09-14 (Velora by Colorlib, built on `motion`). Kept as
 * published apart from two things this codebase needs: `--brand-from` and
 * `--brand-to` are defined in `globals.css` from *this* site's theme tokens
 * rather than the registry's blue oklch palette, and `ring` sets the width
 * of the ring the beam is masked to.
 *
 * The ring is **padding, not border**, which is the one structural change.
 * The overlay has to be `overflow-hidden`: a mask hides pixels and nothing
 * else, so the beam's square still counted toward scrollable overflow, and
 * on the last card of a row it reached past the page edge and put a
 * horizontal scrollbar on the homepage. But `overflow: hidden` clips to the
 * *padding box* — and the published ring is the transparent border, which
 * lies outside it, so clipping removed the beam entirely (measured: running
 * at 25%, opacity 1, nothing painted). With the ring as padding and the mask
 * cut from the content box, the clip keeps the ring and drops the overrun.
 *
 * This replaced a CSS-only implementation of the same effect. The user asked
 * for the registry item itself, twice; the cost is `motion` (~35KB gzipped)
 * on every public page, and the trade is noted in CLAUDE.md.
 */
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface BorderBeamProps {
  className?: string;
  /** Size of the beam in px */
  size?: number;
  /** Seconds for one full loop */
  duration?: number;
  /** Seconds of delay before starting */
  delay?: number;
  reverse?: boolean;
  colorFrom?: string;
  colorTo?: string;
  /** Width of the border ring the beam is masked to, whole px — Chrome snaps a 1.5px border down to 1. */
  ring?: number;
}

/**
 * Animated beam that travels around the border of its nearest
 * positioned ancestor. Parent needs `position: relative` and a border.
 */
export function BorderBeam({
  className,
  size = 64,
  duration = 6,
  delay = 0,
  reverse = false,
  colorFrom = "var(--brand-from)",
  colorTo = "var(--brand-to)",
  ring = 1,
}: BorderBeamProps) {
  // Hide via CSS + skip the animation under reduced motion; never branch the
  // rendered tree on it — the server can't know the preference and would
  // mismatch on hydration.
  const reducedMotion = useReducedMotion();

  /*
    Runs only while the host is hovered or holds focus. The published beam
    animates for the life of the page — a JS-driven loop per card, twenty-four
    of them on the shop's front — and `globals.css` fades the overlay in on
    hover, so at rest that was twenty-four loops moving something nobody could
    see. Measured as dropped frames during the theme wipe. The host is the
    parent element, which is what the published docblock already requires
    (`position: relative` on it); listeners go there rather than on this
    overlay, which is `pointer-events: none`.
  */
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const on = () => setActive(true);
    const off = () => setActive(false);
    host.addEventListener("pointerenter", on);
    host.addEventListener("pointerleave", off);
    host.addEventListener("focusin", on);
    host.addEventListener("focusout", off);
    return () => {
      host.removeEventListener("pointerenter", on);
      host.removeEventListener("pointerleave", off);
      host.removeEventListener("focusin", on);
      host.removeEventListener("focusout", off);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      data-slot="border-beam"
      style={{ padding: ring }}
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] [mask-clip:content-box,border-box] [mask-composite:exclude] [mask-image:linear-gradient(#000,#000),linear-gradient(#000,#000)] motion-reduce:hidden"
    >
      <motion.div
        className={cn(
          "absolute aspect-square bg-gradient-to-l from-(--beam-from) via-(--beam-to) to-transparent",
          className
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            "--beam-from": colorFrom,
            "--beam-to": colorTo,
          } as CSSProperties
        }
        initial={{ offsetDistance: reverse ? "100%" : "0%" }}
        animate={
          reducedMotion || !active
            ? undefined
            : { offsetDistance: reverse ? "0%" : "100%" }
        }
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: -delay,
        }}
      />
    </div>
  );
}
