"use client";

import Link from "next/link";
import { useState } from "react";
import { PANEL_CLASSES } from "@/components/layout/mega-menu";
import type { MenuItem } from "@/lib/navigation";
import { navKey, newTabAttrs } from "@/lib/nav-key";
import { cn } from "@/lib/utils";

/**
 * The panel under a top-bar link that has a menu beneath it: tabs down the
 * left, cards beside them.
 *
 * The shape is a vendor's "Customer zone" — a utility link that opens a panel
 * whose left column switches between audiences (For home, For business) and
 * whose right side lists what each can do. In the menu tree that is the link's
 * children as the tabs and *their* children as the cards, which is the three
 * levels `MenuRequest::MAX_DEPTH` already allows.
 *
 * **A panel whose tabs have nothing under them has no tab column.** An editor
 * who nests three pages directly under "Knowledge base" has built a list, not
 * a tabbed panel, and three tabs each switching to an empty pane would be the
 * worst reading of that. So when no second-level item carries children the
 * second level *is* the cards.
 *
 * Opened and closed by `PANEL_CLASSES` — the same hover / focus-within /
 * `data-closed` contract as the header's `MegaMenu`, so the two panels cannot
 * drift in how they leave. The one piece of state here is which tab is active,
 * and it is switched on pointer-enter and on focus rather than on click:
 * a tab with a page of its own is a real link, so a click *follows* it, and a
 * keyboard user tabbing down the column sees the pane change under each stop
 * without pressing anything. A tab that is a **heading** — a custom item with
 * no address, which is what "For home" usually is — is a `<button>` instead:
 * still focusable, still switches the pane, and goes nowhere on a click
 * because there is nowhere to go.
 *
 * Anchored `right-0`, not `left-0`: these links sit at the right edge of the
 * viewport, and a panel opening rightwards from the last of them would be
 * mostly off-screen.
 *
 * No headings inside, for the reason `MegaMenu` gives: this sits above the
 * page's h1 and a heading here would break the outline the audit checks.
 *
 * Painted in the bar's own colours — the `--color-topbar-*` tokens, derived
 * from the `theme_topbar` setting or aliased to the dark band when it is
 * blank — so the panel reads as the strip unfolding rather than as a piece of
 * the page floating over it. The tiles keep mixing
 * against `--color-card`, deliberately: an identity hue is contrast-checked
 * against the scheme's light surfaces, and a tile made to blend into this
 * panel would put a light-scheme glyph on a near-black chip it was never
 * measured for.
 *
 * One width, whatever is in it. The panel used to be `w-max`, so a tab with
 * two cards opened a 700px sheet and the next tab's single card shrank it to
 * 420 — the panel changed size under the pointer on every tab, and a bar
 * item with one link opened a sliver. It is a fixed 760px now (less on a
 * narrow window), the cards sit in two equal columns however many there
 * are, and only the height follows the count. The client asked for exactly
 * that: a minimum width irrespective of the number of entries, height as
 * needed.
 */
export function TopBarPanel({ items }: { items: MenuItem[] }) {
  const tabbed = items.some((item) => item.children && item.children.length > 0);
  const [active, setActive] = useState(0);

  // Never past the end: an item count that shrinks between renders (an
  // editor removing a tab, then the page revalidating under an open panel)
  // must not leave the pane pointing at nothing.
  const current = tabbed ? items[Math.min(active, items.length - 1)] : null;
  const cards = tabbed ? (current?.children ?? []) : items;

  return (
    <div className={`${PANEL_CLASSES} right-0 w-[min(760px,calc(100vw-2rem))]`}>
      <div
        data-panel="topbar"
        className={cn(
          "overflow-hidden rounded-xl border border-topbar-line bg-topbar text-topbar-ink shadow-2",
          tabbed && "grid sm:grid-cols-[200px_1fr]",
        )}
      >
        {tabbed && (
          <ul className="grid content-start gap-0.5 border-b border-topbar-line bg-topbar-2 p-2.5 sm:border-r sm:border-b-0">
            {items.map((tab, i) => {
              const isActive = i === Math.min(active, items.length - 1);

              const tabClass = cn(
                "block w-full rounded-md px-3.5 py-2.5 text-left text-14 transition-colors duration-(--duration-base)",
                isActive ? "bg-topbar-line font-semibold text-topbar-ink" : "text-topbar-muted hover:bg-topbar-line hover:text-topbar-ink",
              );

              return (
                <li key={navKey(tab)}>
                  {tab.href === null ? (
                    <button
                      type="button"
                      onPointerEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onClick={() => setActive(i)}
                      aria-current={isActive ? "true" : undefined}
                      className={tabClass}
                    >
                      {tab.label}
                    </button>
                  ) : (
                    <Link
                      href={tab.href}
                      onPointerEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      aria-current={isActive ? "true" : undefined}
                      className={tabClass}
                    >
                      {tab.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/*
          The cards. `MegaMenu`'s recipe — tile beside title, summary under —
          rather than the tall centred tiles of the reference, because the
          reference's cards carry one line of copy each and these carry the
          record's own summary, which does not centre well.
        */}
        <ul className="grid content-start gap-0.5 p-2.5 sm:grid-cols-2">
          {cards.map((card) => {
            const hasIcon = card.tile !== null && card.tile !== undefined;
            // A heading among the cards is a label, not a link.
            const Card = card.href === null ? "div" : Link;

            return (
              <li key={navKey(card)}>
                <Card
                  href={card.href as string}
                  {...(card.href !== null ? newTabAttrs(card.newTab) : {})}
                  className={cn(
                    "flex h-full gap-3 rounded-lg p-3",
                    card.href !== null && "transition-colors duration-(--duration-base) hover:bg-topbar-2",
                    card.summary ? "items-start" : "items-center",
                  )}
                >
                  {hasIcon && <span className={card.summary ? "mt-0.5 shrink-0" : "shrink-0"}>{card.tile}</span>}
                  <span className="min-w-0">
                    <span className="block text-14 font-semibold text-topbar-ink">{card.label}</span>
                    {card.summary && (
                      <span className="mt-0.5 block max-w-[34ch] text-12-5 leading-[1.5] text-topbar-muted">{card.summary}</span>
                    )}
                  </span>
                </Card>
              </li>
            );
          })}
          {cards.length === 0 && (
            // A tab with nothing under it yet. Saying so beats an empty pane,
            // which reads as the panel having failed to load.
            <li className="px-3 py-2.5 text-13 text-topbar-muted">Nothing here yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
