"use client";

import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { CartBadge } from "@/components/layout/cart-badge";
import { IconChevronDown, IconClose, IconMail, IconPhone } from "@/components/icons-ui";
import type { MenuItem, MenuSection, NavLink, TopBarLink } from "@/lib/navigation";
import { navKey } from "@/lib/nav-key";
import { telHref, type SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import { ShimmerLink } from "@/components/velora/shimmer-button";
import { Input } from "@/components/ui/input";

/**
 * The phone navigation: a panel over two thirds of the screen, with the
 * primary links as an accordion, the search field, the top bar's links and
 * the two contact lines. Split out of `site-header.tsx`, which held the top
 * bar, the desktop nav, the mega-menu state and this in one 650-line
 * function; the header owns `open` and the toggle, this owns everything that
 * happens once it is open — the focus trap, the scroll lock, the focus
 * hand-off — and hands focus back to `returnFocusTo` when it closes.
 */
export function MobileDrawer({
  open, onClose, returnFocusTo, nav, menu, utility, settings, phone, email, isStoreItem, expanded, setExpanded,
}: {
  open: boolean;
  onClose: () => void;
  /** The control that opened the drawer, which gets focus back when it closes. */
  returnFocusTo: RefObject<HTMLButtonElement | null>;
  nav: readonly NavLink[];
  menu: Record<string, MenuSection>;
  utility: readonly TopBarLink[];
  settings: SiteSettings;
  phone: string;
  email: string;
  isStoreItem: (href: string) => boolean;
  /** Which section is expanded — there is no hover on a phone. */
  expanded: string | null;
  setExpanded: (next: string | null) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  /*
   * What a panel covering two thirds of the screen has to do to be a dialog.
   *
   * Escape closes it and the page behind does not scroll — both are implied
   * by covering the screen and neither happens for free. The overflow is
   * restored on cleanup rather than on close, so navigating away with the
   * drawer open cannot leave the body locked.
   *
   * Tab is trapped inside the panel. Without it a keyboard user tabs from the
   * drawer straight into the page underneath it — still visible around the
   * backdrop, still reachable, and with no way to tell they have left.
   */
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () => {
      const panel = panelRef.current;
      if (!panel) return [] as HTMLElement[];
      return [...panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!panelRef.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  /*
   * Focus goes into the panel when it opens and back to the toggle when it
   * closes — not just anywhere, back to the control the user pressed, which
   * is where they expect to be.
   *
   * Only when it was previously open, or this would steal focus on first
   * render and on every navigation.
   */
  useEffect(() => {
    if (!open) {
      // Back to the control the user pressed, not just anywhere — but only if
      // the drawer was actually open, or this steals focus on first render.
      if (wasOpen.current) returnFocusTo.current?.focus();
      wasOpen.current = false;
      return;
    }

    wasOpen.current = true;

    /*
     * Focus the close button once it can actually take focus.
     *
     * Not on the next frame: the panel transitions `visibility` over 300ms,
     * and on the first frame the transition is still at progress zero, so the
     * computed value is `hidden` — and a hidden element silently refuses
     * focus. The call appeared to run and did nothing, which is how this
     * looked like a broken ref for a while.
     *
     * Bounded, so a panel that never becomes visible cannot spin here.
     */
    let frame = 0;
    let raf = 0;
    const focusWhenVisible = () => {
      const el = closeRef.current;
      if (!el) return;
      if (getComputedStyle(el).visibility === "visible") {
        el.focus();
        return;
      }
      if (frame++ < 30) raf = requestAnimationFrame(focusWhenVisible);
    };
    raf = requestAnimationFrame(focusWhenVisible);

    return () => cancelAnimationFrame(raf);
  }, [open, returnFocusTo]);

  return (
    <>
      {/* mobile drawer */}
      {/*
        Both panels stay mounted and are shown by class. A conditionally
        rendered element has nothing to transition on the way out — it simply
        disappears — so neither the slide nor the fade would ever be seen
        closing.

        `visibility` is in both transitions on purpose. It is the property that
        keeps a closed drawer out of the tab order and, more importantly, keeps
        the off-screen `translate-x-full` out of documentElement.scrollWidth —
        the zero-tolerance overflow check this project runs on every route.
        CSS gives it exactly the behaviour wanted here: it flips to `visible`
        immediately on the way in, and waits until the transition ends on the
        way out, so the panel is still painted while it slides away.

        `inert` is the other half: `opacity-0` alone leaves every link
        focusable and readable by a screen reader.

        Reduced motion needs nothing — globals.css already disables every
        transition under that query.
      */}
      <div
        aria-hidden
        onClick={() => onClose()}
        className={cn(
          // The third of the screen that stays visible: fades only, no motion.
          "fixed inset-0 z-40 bg-dark/45 min-[1280px]:hidden",
          // Arrives over the panel's 300ms; leaves in 200, the exit-faster
          // rule: the two states carry their own timing.
          "transition-[opacity,visibility]",
          open ? "visible opacity-100 duration-(--duration-slow) ease-out" : "invisible opacity-0 duration-(--duration-base) ease-exit",
        )}
      />

      <div
        id="mobile-menu"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        className={cn(
          // Two thirds of the viewport, anchored right: that is the side the
          // toggle sits on, and the thumb that opened it is already there.
          "fixed inset-y-0 right-0 z-50 w-2/3 overflow-y-auto bg-card shadow-[-8px_0_32px_rgba(18,20,13,.14)] min-[1280px]:hidden",
          // Slides only. The fade belongs to the backdrop; doing both here
          // makes the panel look like it is dissolving rather than moving.
          //
          // `translate`, not `transform`: Tailwind v4 emits the standalone CSS
          // translate property, so transitioning `transform` animates nothing
          // and the panel simply appears. Caught by measuring the computed
          // value mid-flight rather than trusting the class name.
          "transition-[translate,visibility]",
          open
            ? "visible translate-x-0 duration-(--duration-slow) ease-[cubic-bezier(.16,1,.3,1)]"
            : "invisible translate-x-full duration-(--duration-base) ease-exit",
        )}
      >
          <div className="flex h-[68px] items-center justify-between gap-3 border-b border-line px-5">
            <Logo
              logoUrl={settings.logo_url}
              logoWidth={settings.logo_width}
              logoHeight={settings.logo_height}
              companyName={settings.company_name}
            />
            <button
              ref={closeRef}
              type="button"
              onClick={() => onClose()}
              aria-label="Close menu"
              className="grid size-11 place-items-center rounded border border-line-strong"
            >
              <IconClose className="size-[18px]" />
            </button>
          </div>
          <div className="px-5 py-6">
            {/* First thing in the drawer: on a phone this is the only search
                on the site, and it should not be below seventeen links. */}
            <form role="search" action="/search" method="get" className="mb-5 flex gap-2">
              <label htmlFor="drawer-q" className="sr-only">Search the site</label>
              <Input
                id="drawer-q"
                name="q"
                type="search"
                placeholder="Search products, guides…"
                className="min-w-0 flex-1 px-3 py-2.5"
              />
              <button
                type="submit"
                className="rounded bg-brand-600 px-3.5 text-13-5 font-semibold text-brand-on"
              >
                Go
              </button>
            </form>

            <ul className="grid gap-1">
              {nav.map((item) => {
                const key = navKey(item);
                const section = menu[key];
                const isOpen = expanded === key;

                return (
                  <li key={key}>
                    <div className="flex items-center gap-1">
                      {/*
                        A heading (no href) has nothing to navigate to, so the
                        row itself toggles its section — the chevron beside it
                        still does too, and is what a screen reader is offered.
                      */}
                      {item.href === null ? (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : key)}
                          className="flex flex-1 items-center gap-2 rounded px-3 py-3.5 text-left font-display text-lg font-semibold tracking-[-.02em] hover:bg-surface-2"
                        >
                          {item.label}
                        </button>
                      ) : (
                        <Link
                          href={item.href}
                          onClick={() => onClose()}
                          target={item.newTab ? "_blank" : undefined}
                          rel={item.newTab ? "noopener noreferrer" : undefined}
                          className="flex flex-1 items-center gap-2 rounded px-3 py-3.5 font-display text-lg font-semibold tracking-[-.02em] hover:bg-surface-2"
                        >
                          {item.label}
                          {isStoreItem(item.href) && <CartBadge size={26} />}
                        </Link>
                      )}
                      {section && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : key)}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Hide" : "Show"} ${item.label}`}
                          className="grid size-11 shrink-0 place-items-center rounded border border-line-strong bg-card"
                        >
                          <IconChevronDown
                            className={`size-4 transition-[rotate] duration-(--duration-base) ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>

                    {section && isOpen && (
                      /*
                        The whole subtree, not one level of it.

                        A menu nests without limit now, and the drawer is the
                        location that takes depth best: it is already a vertical
                        list, so a fourth level is another indent rather than a
                        layout problem. This used to read `section.items` and
                        drop everything under them.
                      */
                      <DrawerItems items={section.items} onNavigate={() => onClose()} />
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 grid gap-3 border-t border-line pt-6">
              <ButtonLink href="/portal/login" variant="secondary" onClick={() => onClose()}>
                Customer login
              </ButtonLink>
              <ShimmerLink href="/contact" onClick={() => onClose()} className="h-11 rounded text-14 font-semibold">
                Request a consultation
              </ShimmerLink>
            </div>

            {/*
              The utility bar's links, which live above the header on a wide
              screen and are hidden below sm. Without them here, Knowledge
              base, Track a ticket, the phone number and the support address
              were unreachable from mobile navigation entirely — the drawer is
              the only navigation a phone has.
            */}
            <div className="mt-6 grid gap-1 border-t border-line pt-6">
              {/*
                The same list the bar renders, minus anything the two buttons
                above already offer.

                The drawer promotes Customer login to a `ButtonLink` beside
                Request a consultation — a deliberate CTA pair — so rendering
                the whole top bar here would print it twice on every phone.
                The filter is on the exact href, which covers the built-in
                list and any menu pointing at the same page; an editor writing
                a custom link to `/portal/login?next=…` gets both, which is the
                harmless direction to be wrong in.

                An item with a panel under it is kept whatever its href. The
                first cut filtered on the href alone and dropped a "Customer
                zone" pointing at the login page together with the three tabs
                and nine links beneath it — the whole panel gone from every
                phone, for the sake of not printing one link twice. Twice is
                the harmless direction here too.
              */}
              {utility
                .filter((l) => l.items.length > 0 || !offeredByButtons(l.href))
                .map((l) => {
                  /*
                    A heading is its label, over the list beneath it — an
                    item with no address, and also a bar item whose panel is
                    under it and whose own address is one of the two buttons
                    above. "Customer Zone" → /portal/login with three tabs
                    beneath it read as a third Customer login on the phone;
                    the panel is the thing, and its title needs no link the
                    button already is.
                  */
                  const heading = l.href === null || (l.items.length > 0 && offeredByButtons(l.href));
                  const Row = heading ? "div" : Link;

                  return (
                    <div key={navKey(l)}>
                      <Row
                        href={l.href as string}
                        {...(!heading && l.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
                        onClick={heading ? undefined : () => onClose()}
                        className={cn("flex items-center gap-2.5 rounded px-3 py-2.5 text-15", heading ? "font-semibold" : "hover:bg-surface-2")}
                      >
                        {/* A 16px box either way, so a list of mixed items does
                            not sit on two different left edges. */}
                        <span className="grid size-4 shrink-0 place-items-center text-muted">
                          {l.icon}
                        </span>
                        {l.label}
                      </Row>
                      {/*
                        Whatever the top bar opens in a panel on a wide screen
                        — a phone has no hover, and the bar link itself is
                        hidden below `sm`, so this list is the only way to the
                        panel's contents. Plain links, indented under the bar
                        link, two levels: the tabs and the cards under each,
                        which is the whole panel read top to bottom.
                      */}
                      {l.items.length > 0 && <DrawerItems items={pruneOffered(l.items)} onNavigate={onClose} />}
                    </div>
                  );
                })}
              <a
                href={telHref(phone)}
                onClick={() => onClose()}
                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-15 hover:bg-surface-2"
              >
                <IconPhone className="size-4 text-muted" />
                {phone}
              </a>
              <a
                href={`mailto:${email}`}
                onClick={() => onClose()}
                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-15 break-all hover:bg-surface-2"
              >
                <IconMail className="size-4 shrink-0 text-muted" />
                {email}
              </a>
            </div>
          </div>
      </div>
    </>
  );
}

/** What the drawer's two buttons already offer, by exact href. */
const BUTTON_HREFS = new Set(["/portal/login", "/contact"]);
const offeredByButtons = (href: string | null) => href !== null && BUTTON_HREFS.has(href);

/**
 * Drops, anywhere in the top bar's tree, a link the two buttons already are,
 * and puts its children in its place.
 *
 * The client's "Customer Zone" panel has a "Customer login" tab pointing at
 * `/portal/login` with "Track a ticket" under it, so a phone showed Customer
 * login three times — the button, the bar item, the tab — and the one useful
 * link a level below the third. The tab goes and Track a ticket takes its
 * row. Hoisted rather than kept as a heading: a heading reading "Customer
 * login" over one link is still the repeat the person noticed.
 */
function pruneOffered(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => {
    const children = item.children ? pruneOffered(item.children) : [];
    if (offeredByButtons(item.href)) return children;
    return [{ ...item, children }];
  });
}

/**
 * The drawer's nested links, to any depth.
 *
 * Recursive, and the indent is what carries the hierarchy — a rule plus
 * padding per level, which is the one pattern that survives arbitrary nesting
 * on a 320px screen without needing a decision per depth.
 *
 * Only the first level keeps its icon tile. An icon at every level would make
 * a four-deep list read as four unrelated groups, and the tile is what marks a
 * *section*; below that, the indent already says what the relationship is.
 * The tile's box is reserved whether or not there is a tile, and the list
 * under a first-level row starts under its *label* (`ml-[38px]`: the 28px
 * tile and its gap), not under its tile. It used to start 12px in from the
 * row's edge, which put a child's text 26px to the *left* of its parent's —
 * "Track a Ticket" read as a sibling of "Customer login" rather than the one
 * thing under it, which is the screenshot this was measured from.
 *
 * Tap targets stay at the drawer's own 15px/2.5 padding all the way down, so a
 * fifth-level link is as pressable as a first-level one — `audit:mobile` would
 * fail it otherwise, and a menu nobody can tap is not a menu.
 */
function DrawerItems({
  items,
  onNavigate,
  depth = 0,
}: {
  items: MenuItem[];
  onNavigate: () => void;
  depth?: number;
}) {
  return (
    <ul className={cn("grid gap-0.5 border-l border-line pl-3", depth === 0 ? "mt-1 mb-2" : "ml-[38px]")}>
      {items.map((child) => {
        // Only the top level of the drawer carries a tile; deeper rows are
        // an indented list. The tile arrives rendered from the server, and
        // its 28px box is kept even when there is none, so a list of mixed
        // rows sits on one left edge.
        const icon = depth === 0 ? <span className="grid size-7 shrink-0 place-items-center">{child.icon}</span> : null;

        // A heading is a label over its own indented list, not a link.
        const Row = child.href === null ? "div" : Link;

        return (
          <li key={navKey(child)}>
            <Row
              href={child.href as string}
              onClick={child.href === null ? undefined : onNavigate}
              className={cn("flex items-center gap-2.5 rounded px-3 py-2.5 text-15", child.href === null ? "font-semibold" : "hover:bg-surface-2")}
            >
              {icon}
              {child.label}
            </Row>

            {child.children && child.children.length > 0 && (
              <DrawerItems items={child.children} onNavigate={onNavigate} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
