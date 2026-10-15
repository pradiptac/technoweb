"use client";

import { useEffect } from "react";

/**
 * The dashboard's (and the portal home's) entrance, once per session
 * (Console 2.0).
 *
 * The root layout's pre-paint script stamps `html[data-entrance]` on a full
 * load of `/admin` or `/portal` when this session has not seen it — before
 * paint, because an attribute set after hydration would show the page, blank
 * it and fade it back in. This marks the session as having seen it and
 * clears the attribute once the keyframes in globals.css have run, so a
 * later visit draws the page at once. Renders nothing.
 */
export function Entrance({ scope }: { scope: "console" | "portal" }) {
  useEffect(() => {
    try { sessionStorage.setItem(`tw_entrance_${scope}`, "1"); } catch { /* the attribute is cleared regardless */ }
    if (!document.documentElement.dataset.entrance) return;
    const t = window.setTimeout(() => { delete document.documentElement.dataset.entrance; }, 1400);
    return () => window.clearTimeout(t);
  }, [scope]);
  return null;
}
