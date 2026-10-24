import { useEffect, useState } from "react";

/**
 * The three pieces of wiring every carousel on the site shares — the hero
 * `Slider`, the stacked-cards `CardsSlider`, the gallery lightbox and the
 * shop's `StoreHero` — pulled out of four byte-identical copies. What stays
 * in each component is what genuinely differs: how it moves (a scroll, a
 * state swap, a FLIP) and who may take the wheel.
 */

/**
 * Whether motion is welcome, read on mount rather than at render: the server
 * has no `matchMedia`, and assuming "motion is fine" until proven otherwise
 * would autoplay one frame before the check lands. Tracks the media query
 * live, so a visitor flipping the OS setting mid-visit is honoured.
 */
export function useMotionOk(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return ok;
}

/** Whether the tab is hidden — a hidden tab is not somebody watching a slideshow. */
export function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return hidden;
}

/**
 * How long a slide stays: its own `duration_ms`, else the slider's
 * `interval_ms`, floored at two seconds (a slide that changes faster cannot
 * be read) and 6000 when neither is set. The one calculation — the autoplay
 * clock, the slow zoom and the progress bar all read it.
 */
export function slideDelay(
  slide: { duration_ms?: number | null } | null | undefined,
  slider: { interval_ms?: number | null },
): number {
  return Math.max(2000, slide?.duration_ms || slider.interval_ms || 6000);
}

/**
 * Calls `tick` once `delayMs` after the current slide `at` appeared, while
 * `active`, and is re-armed by any change of `at`, `delayMs` or `tick` — so a
 * slide can stay longer or shorter than its neighbour, and a manual press
 * (which changes `at`) restarts the clock rather than advancing again a moment
 * later. `at` is needed because a caller whose `tick` is stable (a functional
 * state update) would otherwise never be re-armed after the first tick.
 */
export function useAutoplay(active: boolean, delayMs: number, tick: () => void, at: number): void {
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(tick, Math.max(2000, delayMs));
    return () => clearTimeout(id);
  }, [active, delayMs, tick, at]);
}

/** `next` wrapped into `[0, count)` in both directions, so -1 is the last slide. */
export function wrapIndex(next: number, count: number): number {
  return count === 0 ? 0 : ((next % count) + count) % count;
}
