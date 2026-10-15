"use client";

import { useEffect } from "react";

/** Stamps `data-scrolled` on the bar once its sentinel leaves the viewport. Renders nothing. */
export function TopBarEdge() {
  useEffect(() => {
    const sentinel = document.querySelector("[data-topbar-sentinel]");
    const bar = document.querySelector<HTMLElement>("[data-topbar]");
    if (!sentinel || !bar) return;
    const io = new IntersectionObserver(([e]) => { bar.toggleAttribute("data-scrolled", !e.isIntersecting); });
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);
  return null;
}
