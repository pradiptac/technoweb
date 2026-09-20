"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { IconChevronDown, IconClose, IconMenu } from "@/components/icons-ui";
import { cn } from "@/lib/utils";
// Types only: a value import here would drag the icon map into the client
// bundle, which is the one thing nav-items.tsx exists to prevent.
import type { NavEntry, NavRow } from "./nav-items";
import { NEW_SINCE_ROUTES, useNewSince } from "./new-since";

/**
 * The sidebar. The rows arrive from `nav-items.tsx` through the server
 * layout — filtered by role, icons already rendered — so this file is the
 * accordion, the filter and the drawer, and nothing about what is in them.
 */

/**
 * Where a hairline goes, and why there are only two.
 *
 * Three bands: what a support engineer works all day, the two content stores,
 * and the site's own configuration. A rule between every row would be a table;
 * a rule between every *section* would be five of them and would stop meaning
 * anything. Two says "these three groups are different kinds of thing", which
 * is the only claim worth making here.
 */
const DIVIDE_BEFORE = new Set(["content", "site"]);

const isOn = (pathname: string, href: string, exact?: boolean) =>
  exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

/** The group holding the current route, so a deep link opens its own section. */
function groupFor(nav: NavEntry[], pathname: string): string | null {
  for (const item of nav) {
    if (item.kind !== "group") continue;
    if (item.links.some((l) => isOn(pathname, l.href, l.exact))) return item.id;
  }
  return null;
}

const row =
  "flex w-full items-center gap-2 rounded px-2 py-[7px] text-13 font-medium " +
  "whitespace-nowrap transition-colors [&_svg]:size-4 [&_svg]:shrink-0";

export function AdminNav({ nav }: { nav: NavEntry[] }) {
  const pathname = usePathname();
  const arrived = useNewSince();
  const base = useId();

  // One id, not a set — that *is* the accordion. Storing which section is open
  // rather than which are open makes "only one at a time" structural instead
  // of something every toggle has to remember to enforce.
  const [open, setOpen] = useState<string | null>(() => groupFor(nav, pathname));
  const [drawer, setDrawer] = useState(false);
  const [filter, setFilter] = useState("");

  const term = filter.trim().toLowerCase();

  // Follow the route: arriving inside a section opens it, and leaving for one
  // that belongs to no section closes what was open. Adjusting during render
  // rather than in an effect means the correct section is the first thing
  // painted, not a frame later.
  const [seen, setSeen] = useState(pathname);
  if (pathname !== seen) {
    setSeen(pathname);
    setOpen(groupFor(nav, pathname));
    setDrawer(false);
    // A filter that survives the navigation it caused leaves the sidebar
    // showing one row and no way back that looks like one.
    setFilter("");
  }

  const current =
    nav.find((i) => i.kind === "group" && i.links.some((l) => isOn(pathname, l.href, l.exact)))
    ?? nav.find((i) => i.kind === "link" && isOn(pathname, i.href, i.exact));
  const currentLabel = current?.label ?? "Menu";

  const links = (list: NavRow[], nested: boolean) =>
    list.map(({ href, label, icon, exact, hue }) => {
      const active = isOn(pathname, href, exact);
      return (
        <li key={href} className="min-w-0">
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              row,
              // Indented, but still carrying its own icon: dropping the icon
              // on nested rows made the whole submenu a column of bare text
              // and lost the one thing that makes a destination recognisable
              // at a glance.
              nested && "pl-5",
              // Solid, not a tint. bg-brand-50 was a barely-there wash that
              // read as "slightly warmer row" rather than "you are here" —
              // in a list of seventeen near-identical rows the current one
              // has to be the first thing the eye lands on. White on
              // brand-600 measures 7.5:1, so the fill can be this strong
              // without costing legibility.
              active
                ? "bg-brand-600 font-semibold text-brand-on shadow-1"
                : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {/* The hue is a variable the class reads, not a style on the
                glyph: the icon arrived from the server as an element, and
                whether it wears its colour depends on the pathname. */}
            <span aria-hidden className={cn("contents", !active && "[&_svg]:text-(--neon)")} style={{ "--neon": hue } as React.CSSProperties}>
              {icon}
            </span>
            {label}
            {/* What arrived on this queue since the console was opened — see new-since.tsx. */}
            {NEW_SINCE_ROUTES[href] && arrived[NEW_SINCE_ROUTES[href]] > 0 && (
              <span
                className={cn("ml-auto rounded-full px-1.5 py-px text-10-5 font-semibold tabular-nums", active ? "bg-card text-brand-ink" : "bg-brand-600 text-brand-on")}
                aria-label={`${arrived[NEW_SINCE_ROUTES[href]]} new`}
              >
                {arrived[NEW_SINCE_ROUTES[href]]}
              </span>
            )}
          </Link>
        </li>
      );
    });

  /*
   * Filtering flattens. Twenty-five destinations behind five collapsed
   * sections means the search that finds one has to *show* it, and showing it
   * inside its accordion would mean opening several at once — which is the one
   * thing the accordion exists to prevent. So a term switches the tree for a
   * plain list of what matched, and clearing it puts the tree back.
   *
   * Matched against the section name too: somebody who types "catalogue" is
   * asking for what is in it.
   */
  const matches: NavRow[] = term === ""
    ? []
    : nav.flatMap((item) =>
      item.kind === "link"
        ? (item.label.toLowerCase().includes(term) ? [item] : [])
        : item.links.filter(
          (l) => l.label.toLowerCase().includes(term) || item.label.toLowerCase().includes(term),
        ),
    );

  const tree = term !== "" ? (
    matches.length === 0 ? (
      <p className="px-2 py-3 text-12-5 text-muted">
        Nothing matches “{filter.trim()}”.
      </p>
    ) : (
      <ul className="grid gap-0.5">{links(matches, false)}</ul>
    )
  ) : (
    <ul className="grid gap-0.5">
      {nav.map((item) => {
        if (item.kind === "link") return links([item], false)[0];

        const expanded = open === item.id;
        const holdsCurrent = groupFor(nav, pathname) === item.id;
        const panelId = `${base}-${item.id}`;

        return (
          <li key={item.id} className="min-w-0">
            {/* A hairline, and nothing a screen reader has to hear about —
                the grouping it draws is already carried by the sections
                themselves. Inset by the row padding so it lines up with the
                text rather than the panel edge. */}
            {DIVIDE_BEFORE.has(item.id) && (
              <hr aria-hidden className="mx-2 my-2 border-0 border-t border-line" />
            )}
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen((cur) => (cur === item.id ? null : item.id))}
              className={cn(
                row, "cursor-pointer text-left",
                // The section holding the current page stays marked whether
                // it is open or shut. Open, it is the heading above a
                // highlighted row; shut, it is the only thing saying where
                // the page you are on actually lives.
                holdsCurrent
                  ? "bg-brand-50 font-semibold text-brand-ink"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {/* The section headers get a hue too, keyed on the section id.
                  Their row is a tint rather than a solid fill even when it
                  holds the current page, so the icon stays legible on it. */}
              <span aria-hidden className="contents [&_svg]:text-(--neon)" style={{ "--neon": item.hue } as React.CSSProperties}>
                {item.icon}
              </span>
              {item.label}
              <IconChevronDown
                aria-hidden
                className={cn("ml-auto transition-[rotate] duration-(--duration-base)", expanded && "rotate-180")}
              />
            </button>

            {/* hidden, not unmounted: the links stay in the DOM so the browser
                keeps them findable and nothing re-mounts on every toggle. */}
            <ul id={panelId} hidden={!expanded} className="mt-0.5 grid gap-0.5">
              {links(item.links, true)}
            </ul>
          </li>
        );
      })}
    </ul>
  );

  return (
    /*
      The rule dividing the sidebar from the page, and `lg:` on every part of
      it. Below that breakpoint the nav is a full-width block *above* the
      content, where a right-hand border is a stray line ending in mid-air.

      It goes on <nav> rather than on the sticky panel inside it: the panel is
      only as tall as the tree, so the line would stop after Settings and leave
      the rest of a long page undivided. As a grid item this element stretches
      to the row, so the rule runs the height of whichever column is taller.
    */
    <nav
      aria-label="Admin sections"
      className="min-w-0 lg:border-r lg:border-line lg:pr-5"
    >
      {/*
        Below lg the sidebar is a full-width block above the content, so the
        tree is behind a toggle: five collapsed rows would be 175px of nav
        before a phone showed any of the page. The button names the section
        you are in, which is the one thing a collapsed nav otherwise hides.
      */}
      <button
        type="button"
        aria-expanded={drawer}
        aria-controls={`${base}-drawer`}
        onClick={() => setDrawer((d) => !d)}
        className={cn(
          row,
          "cursor-pointer rounded border border-line-strong bg-card text-ink lg:hidden",
        )}
      >
        <IconMenu />
        {currentLabel}
        <IconChevronDown
          aria-hidden
          className={cn("ml-auto transition-[rotate] duration-(--duration-base)", drawer && "rotate-180")}
        />
      </button>

      {/*
        A class, not the `hidden` attribute. Tailwind v4's preflight declares
        `[hidden] { display: none !important }`, so `lg:block` cannot win it
        back and the sidebar stayed invisible on desktop. The submenu panels
        below still use the attribute — they want exactly that behaviour and
        have no breakpoint to escape at.
      */}
      <div
        id={`${base}-drawer`}
        className={cn(
          "mt-2 lg:mt-0 lg:sticky lg:top-[68px]",
          drawer ? "block" : "hidden lg:block",
        )}
      >
        {/*
          A type-to-find over the sidebar.

          Twenty-five destinations sit behind five collapsed sections, so
          reaching Redirects is "guess which section, open it, read seven
          rows". Typing three letters is faster than remembering somebody
          else's taxonomy, and this is a tool used at a desk for hours by
          people who learn keystrokes.

          `type="search"` for the browser's own clear affordance, plus an
          explicit button because WebKit's is the only one that renders and
          it is not keyboard reachable. Escape clears it too, which is what
          the fingers already in the field will try first.
        */}
        <div className="relative mb-2">
          <label htmlFor={`${base}-filter`} className="sr-only">Filter sections</label>
          <input
            id={`${base}-filter`}
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setFilter(""); }}
            placeholder="Filter…"
            autoComplete="off"
            className={cn(
              "w-full rounded border border-line-strong bg-card py-[6px] pr-7 pl-2.5 text-13",
              "text-ink transition-all duration-(--duration-base) ease-brand placeholder:text-faint",
              "focus:border-brand-400 focus:ring-3 focus:ring-brand-100 focus:outline-none",
              "[&::-webkit-search-cancel-button]:hidden",
            )}
          />
          {filter !== "" && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear the filter"
              className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded text-faint transition-colors hover:text-ink [&_svg]:size-3.5"
            >
              <IconClose />
            </button>
          )}
        </div>

        {tree}
      </div>
    </nav>
  );
}
