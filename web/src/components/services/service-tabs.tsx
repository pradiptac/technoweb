"use client";

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The services, one tab per service category (the client, 2026-09-29) —
 * `themes/summit/catalogue-tabs.tsx` generalised, and the island
 * `ServiceCatalogue` draws when there is more than one group.
 *
 * - **The full ARIA tabs pattern.** A `tablist` of buttons with a roving
 *   `tabIndex`; ←/→ move and select (wrapping), Home and End go to the ends,
 *   and each `tabpanel` is labelled by its tab.
 * - **Every panel is rendered on the server** and arrives here as nodes, the
 *   inactive ones `hidden`, so a crawler reads every service. The tiles are
 *   the server's markup — this island never imports `IconTile`, which would
 *   carry the whole icon map into the client bundle (the Turbopack rule in
 *   CLAUDE.md).
 * - **The address names the tab.** Each tab's id is its category's slug, so
 *   `/services#hardware-services` — from a menu, an email — scrolls to the
 *   strip and opens that tab; a press writes the slug back with
 *   `history.replaceState`, which neither scrolls nor adds a history entry.
 *   The hash is read through `useSyncExternalStore`, whose server snapshot
 *   is empty, so the server and the first client render agree on the first
 *   tab and hydration never mismatches.
 * - **The strip scrolls inside itself.** `w-0 min-w-full` on the scroller
 *   (CLAUDE.md, "A scroll container inside a grid item still widens the
 *   column"), and every label is one unbroken line, so eight categories on a
 *   320px screen scroll sideways without widening the page. Themes restyle
 *   the buttons through `[role="tab"]`, as they already do for every tab.
 */
export type ServiceTabGroup = { slug: string; label: string; panel: ReactNode };

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => decodeURIComponent(window.location.hash.slice(1));
const noHash = () => "";

export function ServiceTabs({ groups, label = "Service categories" }: { groups: ServiceTabGroup[]; label?: string }) {
  const hash = useSyncExternalStore(subscribe, readHash, noHash);
  // What was last pressed; the address wins whenever it names a tab, and a
  // press writes the address, so the two only differ when a hash names none.
  const [picked, setPicked] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const fromHash = groups.findIndex((g) => g.slug === hash);
  const active = fromHash >= 0 ? fromHash : Math.min(picked, groups.length - 1);

  const select = (i: number, focus = false) => {
    setPicked(i);
    const slug = groups[i]?.slug;
    if (slug && typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", `#${encodeURIComponent(slug)}`);
    }
    if (focus) tabs.current[i]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = groups.length - 1;
    const to =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (to === null) return;
    e.preventDefault();
    select(to, true);
  };

  return (
    <div data-service-tabs>
      <div className="w-0 min-w-full overflow-x-auto" data-service-tabs-strip>
        {/* p-1: room for the focus ring, which the scroller would otherwise clip. */}
        <div role="tablist" aria-label={label} className="flex w-max gap-2 p-1">
          {groups.map((g, i) => (
            <button
              key={g.slug}
              ref={(el) => { tabs.current[i] = el; }}
              role="tab"
              type="button"
              id={g.slug}
              aria-selected={i === active}
              aria-controls={`${g.slug}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "min-h-10 scroll-mt-28 whitespace-nowrap rounded-full border px-4 py-2 text-13-5 font-semibold transition-colors duration-(--duration-base) ease-brand",
                i === active
                  ? "border-brand-600 bg-brand-600 text-brand-on"
                  : "border-line-strong bg-card text-ink-2 hover:border-brand-300 hover:text-brand-ink",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {groups.map((g, i) => (
        <div
          key={g.slug}
          role="tabpanel"
          id={`${g.slug}-panel`}
          aria-labelledby={g.slug}
          hidden={i !== active}
          // `settle-in` (globals.css): the panel un-hidden settles in over
          // `--duration-base`; the one leaving is hidden at once.
          className="settle-in mt-6"
        >
          {g.panel}
        </div>
      ))}
    </div>
  );
}
