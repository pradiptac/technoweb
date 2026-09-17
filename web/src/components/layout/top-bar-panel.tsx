"use client";

import Link from "next/link";
import { useState } from "react";
import { PANEL_CLASSES, type MenuPanelStyle } from "@/components/layout/mega-menu";
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
 *
 * **It follows the menu style, and each theme restyles it (2026-09-17).**
 * The client saw one 760px tabbed sheet whatever the theme or the
 * `menu_style` chosen on the Themes screen, beside a mega menu that
 * followed both. `style` is the same `MenuPanelStyle`, from the same
 * setting, and gives four shapes: `simple` is a 300px list, each tab a
 * small group label over its own links, no tiles, no summaries, no state;
 * `semi` is 520px with the tabs as a row of pills across the top and the
 * cards in one column with a tile and a label; `mega` is the sheet above;
 * `big` is up to 1100px with the tab strip across the top and the cards in
 * four columns — and its width is its content's, the widest tab's, never
 * more: the client saw the big sheet open to its full 1100px over two
 * cards (2026-09-18) and asked for "the maximum of the menu's own size".
 * Every tab's pane is rendered, the inactive ones `hidden` by visibility
 * at zero height, so the widest pane sets the width once and switching
 * tabs changes only the height; each card is a fixed 260px slot that
 * wraps at the viewport. `mega` keeps its fixed 760px, which the client
 * asked for first ("a minimum width irrespective of the entries"), and
 * `semi` its 520. The panel stamps `data-panel="topbar"` and
 * `data-topbar-style`, and every theme's `theme.css` carries a block under
 * `[data-theme] [data-panel="topbar"]` — corners, rules, type, the tab's
 * active mark — so the sheet reads as that theme's rather than classic's.
 * Terminal had done this since it shipped; the rest do now.
 */
export function TopBarPanel({ items, style = "mega" }: { items: MenuItem[]; style?: MenuPanelStyle }) {
  const tabbed = items.some((item) => item.children && item.children.length > 0);
  const [active, setActive] = useState(0);

  if (style === "simple") return <SimplePanel items={items} tabbed={tabbed} />;
  const tabsAcross = style === "semi" || style === "big";

  // Never past the end: an item count that shrinks between renders (an
  // editor removing a tab, then the page revalidating under an open panel)
  // must not leave the pane pointing at nothing.
  const current = tabbed ? items[Math.min(active, items.length - 1)] : null;
  const cards = tabbed ? (current?.children ?? []) : items;
  // `big` renders every tab's pane and shows one; the others need a list.
  const panes: { key: string; cards: MenuItem[] }[] = style === "big" && tabbed
    ? items.map((tab) => ({ key: navKey(tab), cards: tab.children ?? [] }))
    : [{ key: "only", cards }];
  const activeKey = style === "big" && tabbed && current ? navKey(current) : "only";

  const width = style === "semi" ? "w-[min(520px,calc(100vw-2rem))]" : style === "big" ? "w-max max-w-[calc(100vw-2rem)]" : "w-[min(760px,calc(100vw-2rem))]";

  return (
    <div className={`${PANEL_CLASSES} right-0 ${width}`}>
      <div
        data-panel="topbar"
        data-topbar-style={style}
        className={cn(
          "overflow-hidden rounded-xl border border-topbar-line bg-topbar text-topbar-ink shadow-2",
          tabbed && !tabsAcross && "grid sm:grid-cols-[200px_1fr]",
        )}
      >
        {tabbed && (
          <ul className={cn(
            "content-start gap-0.5 border-b border-topbar-line bg-topbar-2 p-2.5",
            tabsAcross ? "flex flex-wrap" : "grid sm:border-r sm:border-b-0",
          )}>
            {items.map((tab, i) => {
              const isActive = i === Math.min(active, items.length - 1);

              const tabClass = cn(
                "block rounded-md px-3.5 py-2.5 text-left text-14 transition-colors duration-(--duration-base)",
                tabsAcross ? "rounded-full px-4 py-1.5" : "w-full",
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
        <div className={cn(style === "big" && "grid [&>*]:[grid-area:1/1]")}>
        {panes.map((pane) => (
        <ul
          key={pane.key}
          // An inactive pane keeps its width and loses its height, so the
          // widest tab sizes the sheet and the open one sizes its height.
          aria-hidden={pane.key !== activeKey || undefined}
          className={cn(
            "content-start gap-0.5 p-2.5",
            style === "big" ? "flex flex-wrap" : "grid",
            style === "big" ? "" : style === "semi" ? "" : "sm:grid-cols-2",
            pane.key !== activeKey && "invisible h-0 overflow-hidden py-0",
          )}
        >
          {pane.cards.map((card) => {
            const hasIcon = card.tile !== null && card.tile !== undefined;
            // A heading among the cards is a label, not a link.
            const Card = card.href === null ? "div" : Link;

            return (
              <li key={navKey(card)} className={cn(style === "big" && "w-[260px] shrink-0")}>
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
                    {card.summary && style !== "semi" && (
                      <span className="mt-0.5 block max-w-[34ch] text-12-5 leading-[1.5] text-topbar-muted">{card.summary}</span>
                    )}
                  </span>
                </Card>
              </li>
            );
          })}
          {pane.cards.length === 0 && (
            // A tab with nothing under it yet. Saying so beats an empty pane,
            // which reads as the panel having failed to load.
            <li className="px-3 py-2.5 text-13 text-topbar-muted">Nothing here yet.</li>
          )}
        </ul>
        ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The `simple` shape: a narrow list, each tab a group label over its own
 * links. No tiles, no summaries and nothing to switch, so no state — a
 * dropdown under a utility link, the way the simple mega menu is a
 * dropdown under its item.
 */
function SimplePanel({ items, tabbed }: { items: MenuItem[]; tabbed: boolean }) {
  const groups: MenuItem[] = tabbed ? items : [{ ...items[0], label: "", href: null, children: items }];
  const row = (item: MenuItem) => (
    <li key={navKey(item)}>
      {item.href === null ? (
        <span className="block px-3 py-1.5 text-13 text-topbar-muted">{item.label}</span>
      ) : (
        <Link
          href={item.href}
          {...newTabAttrs(item.newTab)}
          className="block rounded-md px-3 py-1.5 text-14 text-topbar-ink transition-colors duration-(--duration-base) hover:bg-topbar-2"
        >
          {item.label}
        </Link>
      )}
    </li>
  );
  return (
    <div className={`${PANEL_CLASSES} right-0 w-[min(300px,calc(100vw-2rem))]`}>
      <div data-panel="topbar" data-topbar-style="simple" className="overflow-hidden rounded-xl border border-topbar-line bg-topbar p-2 text-topbar-ink shadow-2">
        {groups.map((group, g) => (
          <div key={`${navKey(group)}-${g}`} className={cn(g > 0 && "mt-1.5 border-t border-topbar-line pt-1.5")}>
            {group.label && (
              group.href === null
                ? <span className="block px-3 pt-1.5 pb-1 text-11-5 font-semibold uppercase tracking-[.1em] text-topbar-muted">{group.label}</span>
                : <Link href={group.href} {...newTabAttrs(group.newTab)} className="block px-3 pt-1.5 pb-1 text-11-5 font-semibold uppercase tracking-[.1em] text-topbar-muted hover:text-topbar-ink">{group.label}</Link>
            )}
            <ul>{(group.children ?? []).map(row)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}
