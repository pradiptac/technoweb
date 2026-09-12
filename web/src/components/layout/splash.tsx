"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The first-visit splash: the logo settling in over the page colour for
 * under a second, on the first page of a session and never again in it.
 *
 * Three things decide when it is seen, and none of them is this component.
 * The markup is rendered on the server as `display: none` (`.splash` in
 * globals.css), so a crawler or a visitor without JavaScript never sees an
 * overlay. The root layout's blocking script sets `data-splash` on `<html>`
 * before first paint — only when the setting is on, only off the console
 * and the portal, only when `sessionStorage` has no `tw_splash`, and never
 * under `prefers-reduced-motion` — and it is that attribute the CSS keys the
 * overlay and its animation on. Doing it in the script rather than here is
 * what stops the page painting first and the overlay landing on top of it.
 *
 * This component is the cleaner. It writes the session flag on mount and
 * takes the attribute off when the animation has ended — listening for
 * `animationend`, but checking first whether anything is still running,
 * because hydration can land after a 900ms animation has already finished
 * and an event that has already fired is one nobody hears. A background tab
 * throttles animations rather than dropping them, so a 1500ms fallback
 * covers the remaining case.
 */
export function Splash({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem("tw_splash", "1");
    } catch {
      // No storage means the script never set the attribute either.
    }
    const root = document.documentElement;
    if (!("splash" in root.dataset)) return;

    const done = () => delete root.dataset.splash;
    const el = ref.current;
    const running = el?.getAnimations().some((a) => a.playState === "running");
    if (!running) {
      done();
      return;
    }
    el?.addEventListener("animationend", done, { once: true });
    const fallback = window.setTimeout(done, 1500);
    return () => {
      el?.removeEventListener("animationend", done);
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div ref={ref} className="splash" aria-hidden>
      {children}
    </div>
  );
}
