"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Homepage tile sections never end on a half-empty row (the client,
 * 2026-09-28: "why only 2?" — Horizon's two case studies sat in a grid of
 * four, and other sections stopped part-way along a row the same way).
 *
 * A `Collection` marked `fill` (`data-fill="rows"`) is a *selection* with a
 * "View all" beside it, so it may show fewer than it was given. After
 * layout, and again whenever the grid's box changes:
 *
 * - **a short last row under a full one is dropped** (`data-row-cut`, which
 *   `globals.css` hides) — whatever the columns are at this width;
 * - **a list shorter than one row takes as many columns as it has items**,
 *   so two tiles are two wide tiles rather than two tiles and a gap.
 *
 * It measures rather than computes because the columns are not one fact:
 * `Collection`'s breakpoints set them, and themes override them — Datacenter
 * draws two, Launch a twelve-column bento whose lead tile spans two rows.
 * Positions are read from `offsetTop`/`offsetLeft`, which ignore the reveal
 * styles' transforms, so a section still arriving measures where it lands.
 * Index pages never carry the attribute: a listing shows everything.
 */
export function FullRows() {
  const pathname = usePathname();

  useEffect(() => {
    // Each grid re-settles whenever its own box changes — the stylesheet
    // landing after hydration, a breakpoint, a font — not on the window's
    // resize alone: measured once on mount, a dev server's late CSS left a
    // section settled against the wrong columns. A settle leaves the grid
    // the size it measured, so it does not feed itself.
    const watched = new WeakSet<HTMLElement>();
    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) settle(entry.target as HTMLElement);
    });
    const watch = () => document.querySelectorAll<HTMLElement>('[data-fill="rows"]').forEach((grid) => {
      if (watched.has(grid)) return;
      watched.add(grid);
      sizes.observe(grid);
    });

    watch();
    const mutations = new MutationObserver(watch);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      sizes.disconnect();
      mutations.disconnect();
    };
  }, [pathname]);

  return null;
}

type Box = { el: HTMLElement; top: number; left: number; width: number; height: number };

function boxes(grid: HTMLElement): Box[] {
  const out: Box[] = [];
  for (const el of Array.from(grid.children) as HTMLElement[]) {
    if (el.hasAttribute("data-row-cut") || el.offsetParent === null || el.offsetWidth === 0) continue;
    // Offsets are relative to the nearest positioned ancestor: the grid when it is positioned, else the grid's own.
    const inside = el.offsetParent === grid;
    out.push({
      el,
      top: el.offsetTop - (inside ? 0 : grid.offsetTop),
      left: el.offsetLeft - (inside ? 0 : grid.offsetLeft),
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  }
  return out;
}

const settled = new WeakMap<HTMLElement, string>();

function settle(grid: HTMLElement) {
  // A height change from inside (a picture loading, the cut itself) moves no column.
  const key = `${grid.clientWidth}:${grid.children.length}`;
  if (settled.get(grid) === key) return;
  settled.set(grid, key);
  // What a probe waits for: this grid has been measured at least once.
  grid.setAttribute("data-fill-settled", "");

  grid.style.removeProperty("grid-template-columns");
  for (const el of Array.from(grid.children)) el.removeAttribute("data-row-cut");

  const inner = grid.clientWidth - parseFloat(getComputedStyle(grid).paddingLeft) - parseFloat(getComputedStyle(grid).paddingRight);

  for (let guard = 0; guard < 8; guard++) {
    const items = boxes(grid);
    if (items.length < 2) return;

    const lastTop = Math.max(...items.map((b) => b.top));
    // Everything drawn across the last row's band — a bento's lead tile reaches into it from above.
    const band = items.filter((b) => b.top <= lastTop + 1 && b.top + b.height > lastTop + 1);
    const reach = Math.max(...band.map((b) => b.left + b.width)) - Math.min(...band.map((b) => b.left));

    if (reach >= inner - 4) return;

    const above = items.some((b) => b.top < lastTop - 1);

    if (above) {
      for (const b of items) if (Math.abs(b.top - lastTop) <= 1) b.el.setAttribute("data-row-cut", "");
      continue;
    }

    // One short row: widen it, when its tiles are alike (a bento's are not, and keeps its own shape).
    const widths = items.map((b) => b.width);
    if (Math.max(...widths) - Math.min(...widths) <= 2) {
      grid.style.setProperty("grid-template-columns", `repeat(${items.length}, minmax(0, 1fr))`);
    }

    return;
  }
}
