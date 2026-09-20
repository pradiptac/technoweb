"use client";

import { useEffect, useState } from "react";

/**
 * `--duration-exit`, as a number the timer can wait for. The token is 140ms
 * in `globals.css` and the toast carries the same constant as `EXIT_MS`; if
 * one moves, move the other.
 */
export const EXIT_MS = 140;

/**
 * Keeps a thing mounted for the length of its exit.
 *
 * A conditional render — `{open && <Panel/>}` — has nothing to transition on
 * the way out: the node is gone in the frame the state changes. This hook
 * turns one boolean into two. `mounted` stays true for `exitMs` after
 * `present` goes false, and `leaving` is true during that window, which is
 * what the component stamps as `data-leaving` for `globals.css` to fade on
 * (`.settle-in`, `.rise-in`, `.unfold` — the exit tokens on every one).
 * Arrival needs no JS at all: `@starting-style` on the class does it the
 * moment the node is rendered.
 *
 * Two things about the shape. It initialises from the first `present` it
 * sees and animates only a *change*, so a surface that is absent on the
 * first client render — the cookie banner for somebody who already chose —
 * never plays an exit it was not on screen for. And "present just flipped"
 * is derived during render (React's previous-value pattern) rather than in
 * an effect, because `react-hooks/set-state-in-effect` refuses a synchronous
 * `setState` there; the only effect is the timer, whose callback is where
 * `leaving` is cleared. Under reduced motion the wait is 0 — the global rule
 * has already dropped the transition, so holding the node would show a
 * fully painted thing that then vanishes 140ms late.
 */
export function usePresence(present: boolean, exitMs: number = EXIT_MS): { mounted: boolean; leaving: boolean } {
  const [prev, setPrev] = useState(present);
  const [leaving, setLeaving] = useState(false);

  if (present !== prev) {
    setPrev(present);
    setLeaving(!present);
  }

  useEffect(() => {
    if (!leaving) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setLeaving(false), reduced ? 0 : exitMs);
    return () => clearTimeout(timer);
  }, [leaving, exitMs]);

  return { mounted: present || leaving, leaving: !present && leaving };
}
