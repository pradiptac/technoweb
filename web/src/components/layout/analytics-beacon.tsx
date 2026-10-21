"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { collectable, linkKind, utmFrom } from "@/lib/analytics-beacon";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Native analytics' beacon (C3, docs/analytics.md): one sendBeacon per page
 * view — the first load and every App Router navigation — and one per click
 * on another site, a download, a phone, email or WhatsApp link. No cookie, no
 * storage. Silent for DNT/GPC. A staff browser is not dropped here: the layout
 * is ISR-cached and cannot know, so the route handler forwards the staff
 * cookie's presence and the API applies `native_analytics_count_staff`.
 * Mounted after the page goes idle, like the chat loader.
 */
export function AnalyticsBeacon({ enabled }: { enabled: boolean }) {
  const path = usePathname();
  const first = useRef(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const w = window as IdleWindow;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(t);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !ready || !path || !collectable(path)) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
    navigator.sendBeacon?.(
      "/api/collect",
      JSON.stringify({
        k: "pageview",
        p: path,
        r: first.current ? document.referrer : "",
        u: first.current ? utmFrom(location.search) : {},
        w: window.innerWidth,
      }),
    );
    first.current = false;
  }, [enabled, ready, path]);

  useEffect(() => {
    if (!enabled || !ready) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !collectable(location.pathname)) return;
      const kind = a.hasAttribute("download") ? "download" : linkKind(a.getAttribute("href") ?? "", location.origin);
      if (kind) navigator.sendBeacon?.("/api/collect", JSON.stringify({ k: kind, p: location.pathname, t: a.href }));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [enabled, ready]);

  return null;
}
