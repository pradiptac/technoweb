"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { STATE_TONE } from "@/components/tenders/data";
import type { TenderState, TenderWindow } from "@/types/tenders";

/**
 * The chip that says whether a tender is taking bids, and the line under it
 * that counts the days (0.174.0, `docs/tenders.md`).
 *
 * **This is the reason a tender's page is safe to cache.** The page is in
 * the ISR cache, so the state the server rendered is the state when it was
 * rendered — which may be last week. A cached page telling a bidder that a
 * tender which shut on Tuesday is still open is the one failure this module
 * must not have, and it is not a failure anybody would notice in testing,
 * because a page built this morning is right all morning.
 *
 * So the server's answer is the starting value and the island re-asks
 * `/api/tenders/{slug}/state`, which is never cached, once it is on screen.
 * The events' availability panel is the precedent; the difference is that
 * this one has something true to show while it waits, so there is no
 * loading state and nothing moves when the answer comes back — only the
 * words change, and usually not even those.
 *
 * It asks **once**, on mount. A countdown ticking down to zero in front of
 * somebody reading a tender would be theatre: the deadline is hours or days
 * away, and the page will be reloaded long before a live clock earned its
 * keep.
 */
export function TenderStateChip({
  slug,
  initial,
  onDark = false,
  className,
}: {
  slug: string;
  /** What the server rendered — right until the clock moves past it. */
  initial: TenderWindow;
  /**
   * Whether it sits on a dark band — the page hero does.
   *
   * **A token that inverts cannot be paired with one that does not.**
   * `text-muted` is the light scheme's ink and reads 2.27:1 on the hero's
   * near-black ground, which the audit failed this component for on its
   * first run. The dark bands keep their own `dark-*` inks because their
   * ground does not follow the scheme.
   */
  onDark?: boolean;
  className?: string;
}) {
  const live = useLiveState(slug, initial);

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1", className)}>
      <StateChip state={live.state} label={live.state_label} />
      {live.closes_in_label && (
        <span className={cn("text-13 font-medium", onDark ? "text-dark-muted-brand" : "text-muted")}>
          {live.closes_in_label}
        </span>
      )}
    </span>
  );
}

/**
 * The chip on its own, server-rendered.
 *
 * A list is not re-asked: it is a dynamic page, rendered per request, so its
 * states are at most a minute old — the API's own cache window — and twenty
 * islands on one page to shave that minute would be twenty fetches for
 * nothing.
 */
export function StateChip({ state, label }: { state: TenderState; label: string }) {
  const tone = STATE_TONE[state];

  return (
    <span
      data-tender-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-12-5 font-semibold",
        tone === "ok" && "border-ok/25 bg-ok-soft text-ok",
        tone === "warn" && "border-warn/25 bg-warn-soft text-warn",
        tone === "info" && "border-info/25 bg-info-soft text-info",
        tone === "muted" && "border-line-strong bg-surface-2 text-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok" && "bg-ok-fill",
          tone === "warn" && "bg-warn-fill",
          tone === "info" && "bg-info-fill",
          tone === "muted" && "bg-muted",
        )}
      />
      {label}
    </span>
  );
}

/**
 * The live state, starting from the server's and replaced by the API's.
 *
 * A failed fetch leaves the server's answer standing: it was right when the
 * page was built, and an error chip would be worse than a slightly old one.
 */
function useLiveState(slug: string, initial: TenderWindow): TenderWindow {
  const [state, setState] = useState(initial);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/tenders/${encodeURIComponent(slug)}/state`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: TenderWindow } | null) => {
        if (body?.data?.state) setState(body.data);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [slug]);

  return state;
}
