"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";

/**
 * The route-change loader: a two-pixel line across the top of the page
 * while the next page is on its way. Styled by `.route-progress` in
 * globals.css, with `data-style` choosing between the creeping `bar` and
 * the `pulse`; `data-state` is `active`, `done` or absent, and absent is
 * `display: none` — so while nothing is loading the element is not painted,
 * not measured by the audit, and cannot touch the document's width.
 *
 * **Start** is the router's own signal, forwarded from
 * `instrumentation-client.ts` as a `tw:navigate` event. A URL whose path and
 * query equal the current page's is ignored: a hash change or a `push` to
 * where we already are never changes the hooks below, and would otherwise
 * leave the bar up until the backstop.
 *
 * **Finish** is the pathname or the search params changing — both, because
 * pagination and sorting are search-only navigations and a bar keyed on
 * the path alone would sit there for eight seconds after page two arrived.
 * `useSearchParams` is why the mount site wraps this in `<Suspense>`: on a
 * prerendered page it suspends at build time otherwise.
 *
 * **Timing** is what stops it being noise. A prefetched navigation commits
 * within a frame, so the bar waits 120ms before it shows at all; once shown
 * it stays at least 200ms so a fast page reads as "loaded" rather than as a
 * flicker; and an 8s backstop hides a bar whose navigation was abandoned —
 * a redirect to an external site, a `beforeunload` cancel.
 */
export function RouteProgress({ style }: { style: "bar" | "pulse" }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "active" | "done">("idle");

  // Timers live in refs so the two effects can see each other's without a
  // render between them.
  const showTimer = useRef<number | null>(null);
  const backstop = useRef<number | null>(null);
  const shownAt = useRef<number | null>(null);
  const finishTimer = useRef<number | null>(null);

  const clear = (t: MutableRefObject<number | null>) => {
    if (t.current !== null) {
      window.clearTimeout(t.current);
      t.current = null;
    }
  };

  useEffect(() => {
    const start = (e: Event) => {
      const target = (e as CustomEvent<string>).detail;
      let next: URL;
      try {
        next = new URL(target, window.location.href);
      } catch {
        return;
      }
      if (next.pathname + next.search === window.location.pathname + window.location.search) return;

      clear(finishTimer);
      clear(showTimer);
      clear(backstop);
      shownAt.current = null;
      showTimer.current = window.setTimeout(() => {
        // Nulled here, not only in `clear`: the finish path reads this ref
        // to tell "never shown" (cancel quietly) from "shown" (complete).
        showTimer.current = null;
        shownAt.current = performance.now();
        setState("active");
      }, 120);
      backstop.current = window.setTimeout(() => {
        clear(showTimer);
        shownAt.current = null;
        setState("idle");
      }, 8000);
    };
    window.addEventListener("tw:navigate", start);
    return () => window.removeEventListener("tw:navigate", start);
  }, []);

  // The page arrived. If the bar never got as far as showing, cancel it
  // quietly; if it did, let it complete and hold the minimum.
  const key = `${pathname}?${search.toString()}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (key === lastKey.current) return;
    lastKey.current = key;
    clear(backstop);
    if (showTimer.current !== null) {
      clear(showTimer);
      return;
    }
    if (shownAt.current === null) return;
    const wait = Math.max(0, 200 - (performance.now() - shownAt.current));
    finishTimer.current = window.setTimeout(() => {
      setState("done");
      finishTimer.current = window.setTimeout(() => {
        shownAt.current = null;
        setState("idle");
      }, 400);
    }, wait);
  }, [key]);

  return (
    <div
      aria-hidden
      className="route-progress"
      data-style={style}
      data-state={state === "idle" ? undefined : state}
    />
  );
}
