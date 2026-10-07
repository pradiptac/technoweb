"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { LoginBackdropId } from "@/lib/login-backdrop-choices";

/**
 * An animated ground behind a section (0.126.0, a background of `kind:
 * scene`): one of the sign-in screen's fifteen canvas animations, drawn in
 * the theme's own colours over the dark band `SectionBg` paints under it.
 *
 * Three things keep it from costing a page anything:
 *
 * - **The drawing code is its own chunk**, loaded when a section that uses
 *   it is about to scroll into view — `AuthBackdrop` carries all fifteen
 *   scenes, and a page with no animated section never downloads one.
 * - **It runs only while it is on screen.** The canvas is mounted by an
 *   `IntersectionObserver` and unmounted again once the section is well
 *   past, so an animation three screens down is not a loop spending the
 *   visitor's battery behind their back.
 * - **Still under reduced motion and in a hidden tab** — `AuthBackdrop`'s
 *   own rule — and **it can be paused**: movement that starts by itself,
 *   runs on and sits beside the words needs a way to stop it (WCAG 2.2.2),
 *   the rule the Cover hero's video already keeps.
 *
 * The words never sit on the canvas as far as the contrast audit is
 * concerned: the ground they are graded against is the shell's own opaque
 * dark band, and the scenes draw at low intensity over it.
 */
const AuthBackdrop = dynamic(() => import("@/components/layout/auth-backdrop").then((m) => m.AuthBackdrop), { ssr: false });

export function SectionScene({ scene }: { scene: Exclude<LoginBackdropId, "image"> }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    // A screen's worth of margin either side: drawing by the time it is
    // seen, gone once it is well out of sight.
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: "60% 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={host} aria-hidden data-section-scene={scene} className="pointer-events-none absolute inset-0">
        {near && <AuthBackdrop style={scene} intensity="low" speed="slow" still={paused} />}
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Play the background animation" : "Pause the background animation"}
        aria-pressed={paused}
        className="absolute bottom-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-card/85 text-ink shadow-2 backdrop-blur-sm transition-colors duration-(--duration-fast) hover:bg-card"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
          {paused ? <path d="M8 5.5v13l11-6.5z" /> : <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>}
        </svg>
      </button>
    </>
  );
}
