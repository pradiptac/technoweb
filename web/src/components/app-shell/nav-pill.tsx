"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";

/** `instant` is the first placement after there was none: drawn in place, never slid in. */
export type PillBox = { y: number; h: number; instant: boolean } | null;

/**
 * Where the active row sits inside a list, so one pill can slide to it
 * rather than each row painting its own fill (Console 2.0). Measured after
 * layout and again whenever the list changes size (a section opening, the
 * filter narrowing it). A row that is not rendered — inside a shut section,
 * or on the folded rail — has no `offsetParent`, and then there is no pill
 * and the row keeps its own fill.
 */
export function usePillBox(list: RefObject<HTMLElement | null>, key: string | undefined): PillBox {
  const [box, setBox] = useState<PillBox>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => {
      const row = el.querySelector<HTMLElement>("[aria-current='page']");
      if (!row || row.offsetParent === null) { setBox(null); return; }
      const y = row.getBoundingClientRect().top - el.getBoundingClientRect().top;
      setBox((b) => (b && b.y === y && b.h === row.offsetHeight ? b : { y, h: row.offsetHeight, instant: b === null }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [list, key]);
  return box;
}

/**
 * The pill itself. It moves with the `translate` property — Tailwind v4's
 * translate utilities set that property, not `transform`, and the transition
 * names it — so the active state glides between rows instead of jumping.
 */
export function NavPill({ box, className }: { box: PillBox; className?: string }) {
  return (
    <span
      data-nav-pill aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-0 rounded-lg bg-brand-600 shadow-1",
        "transition-[translate,height,opacity] duration-(--duration-base) ease-brand",
        className,
      )}
      // The first placement is not animated: on a full load the pill would
      // otherwise slide down from the top of the list as the page hydrates,
      // and the rows' fill would be gone for that slide (the audit caught it).
      style={{ translate: `0 ${box?.y ?? 0}px`, height: box?.h ?? 0, opacity: box ? 1 : 0, transitionProperty: box?.instant ? "none" : undefined }}
      // While it travels, the rows drop their own fill so the glide shows; at
      // rest the active row paints its own ground again — which is what the
      // contrast audit reads, since it walks ancestors and the pill is a
      // sibling behind the row.
      onTransitionRun={(e) => e.currentTarget.parentElement?.setAttribute("data-moving", "")}
      onTransitionEnd={(e) => e.currentTarget.parentElement?.removeAttribute("data-moving")}
      onTransitionCancel={(e) => e.currentTarget.parentElement?.removeAttribute("data-moving")}
    />
  );
}
