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
 * Runs `tick` every `intervalMs` while `active`, floored at two seconds —
 * a slide that changes faster than that cannot be read. The interval is
 * re-armed whenever `tick` changes, which every caller relies on: their
 * `tick` closes over the current index, so a manual press restarts the
 * clock rather than advancing again a moment later.
 */
export function useAutoplay(active: boolean, intervalMs: number | null | undefined, tick: () => void): void {
  useEffect(() => {
    if (!active) return;
    const id = setInterval(tick, Math.max(2000, intervalMs || 6000));
    return () => clearInterval(id);
  }, [active, intervalMs, tick]);
}

/** `next` wrapped into `[0, count)` in both directions, so -1 is the last slide. */
export function wrapIndex(next: number, count: number): number {
  return count === 0 ? 0 : ((next % count) + count) % count;
}
