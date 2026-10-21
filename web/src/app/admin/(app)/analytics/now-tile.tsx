"use client";

import { useEffect, useState } from "react";
import type { AnalyticsNow } from "@/types/analytics";

/**
 * Page views in the last thirty minutes, and the pages they were on.
 *
 * Polls once a minute while the tab is visible. A failed poll keeps the last
 * answer rather than drawing a zero, and with nothing to keep it draws a dash:
 * "unmeasured" is not "no visitors".
 */
export function NowTile({ initial }: { initial: AnalyticsNow["data"] | null }) {
  const [now, setNow] = useState(initial);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/analytics/now", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as AnalyticsNow;
        if (alive) setNow(body.data);
      } catch {
        /* keep the last answer */
      }
    };
    const id = window.setInterval(poll, 60_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  return (
    <div className="rounded-xl border border-line-strong bg-card p-4 shadow-2">
      <p className="text-13 font-semibold">Now</p>
      <p className="mt-1.5 font-display text-22 leading-none font-semibold tabular-nums text-brand-ink">{now ? now.views.toLocaleString("en-IN") : "—"}</p>
      <p className="mt-1.5 text-12 text-muted">page views in the last 30 minutes</p>
      {now && now.pages.length > 0 && (
        <ul className="mt-2.5 grid gap-1 text-12-5 text-ink-2">
          {now.pages.map((p) => (
            <li key={p.path} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-mono" title={p.path}>{p.path}</span>
              <span className="shrink-0 font-semibold tabular-nums">{p.views}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
