"use client";

import Link from "next/link";
import { Fragment, useRef, useState, type ReactNode, type RefObject } from "react";
import { CartBadge } from "@/components/layout/cart-badge";
import { MegaMenu, PANEL_CHEVRON_CLASSES, PANEL_HOST_CLASS, type MenuPanelStyle } from "@/components/layout/mega-menu";
import { closePanelOnNavigate, releasePanel } from "@/components/layout/panel-host";
import { TopBarPanel } from "@/components/layout/top-bar-panel";
import { SchemeToggle } from "@/components/ui/scheme-toggle";
import { IconChevronDown } from "@/components/icons-ui";
import { contact, mainNav } from "@/content/site";
import { navKey } from "@/lib/nav-key";
import { arrange, type ResolvedChrome } from "@/themes/chrome-parts";
import type { MenuSection, NavLink, TopBarLink } from "@/lib/navigation";
import type { SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

/**
 * The parts every theme's header is made of, so a theme writes only its
 * bar.
 *
 * Five theme headers (2026-09-18: datacenter, launch, terminal, summit,
 * the editorial masthead) each carried the same hundred lines — the
 * section list with its panel hosts, the utility links with theirs, and
 * the state the drawer needs — differing only in class strings, a chevron
 * size and where the cart mark sits. Three more themes were about to copy
 * them a sixth, seventh and eighth time. What is shared is here; what a
 * theme decides — the bar's shape, its ground, the type on the links, what
 * shows at which width — arrives as props, so the markup a migrated header
 * renders is byte for byte what it rendered before (measured on every
 * theme's preview before and after the move).
 *
 * The `data-closed` contract, `releasePanel`/
 * `closePanelOnNavigate` and `PANEL_HOST_CLASS` are the classic header's,
 * unchanged; see `panel-host.ts` and `mega-menu.tsx`.
 */

/** The header's resolved lists and the drawer's state, the same in every theme. */
export function useHeaderNav({
  settings = {}, links, topBar,
}: {
  settings?: SiteSettings;
  links?: NavLink[];
  topBar: TopBarLink[];
}) {
  const nav: readonly NavLink[] = links ?? mainNav.map((item) => ({ label: item.label, href: item.href, newTab: false }));
  const isStoreItem = (href: string) => href === "/store";
  const utility: readonly TopBarLink[] = topBar;
  const phone = settings.phone ?? contact.phone;
  const email = settings.support_email ?? contact.email;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  /** Spread onto `MobileDrawer`; the header adds nothing to it. */
  const drawerProps = {
    open, onClose: close, returnFocusTo: toggleRef as RefObject<HTMLButtonElement | null>,
    nav, utility, settings, phone, email, isStoreItem, expanded, setExpanded,
  };

  return { nav, utility, phone, email, isStoreItem, open, setOpen, close, toggleRef, drawerProps };
}

/**
 * The section links as `<li>`s — the caller draws the `<ul>`, whose gap
 * and height are the theme's. Each is a panel host when the section has a
 * mega-menu panel, on the classic contract.
 */
export function PrimaryNavItems({
  nav, menu = {}, menuStyle = "mega", isStoreItem, linkClassName, itemClassName, chevronClassName = "size-3",
  cartBadgeClassName = "relative -top-[6px] -ml-1", renderLabel = (label) => label, showCart = true,
}: {
  nav: readonly NavLink[];
  menu?: Record<string, MenuSection>;
  menuStyle?: MenuPanelStyle;
  isStoreItem: (href: string) => boolean;
  /** The link's classes: the theme's type, padding and hover. */
  linkClassName: string;
  /** Classes on every `<li>` besides the panel host's; none by default, so an item without a panel carries no `class`. */
  itemClassName?: string;
  chevronClassName?: string;
  cartBadgeClassName?: string;
  /** How the label is printed — Terminal prints `/label` in lower case. */
  renderLabel?: (label: string) => ReactNode;
  /** The basket mark on the Store link; the Header & footer screen can switch it off. */
  showCart?: boolean;
}) {
  return (
    <>
      {nav.map((item) => {
        const section = menu[navKey(item)];
        const Trigger = item.href === null ? "button" : Link;
        const liClass = section || itemClassName ? cn(itemClassName, section && PANEL_HOST_CLASS[menuStyle]) : undefined;
        return (
          <li
            key={navKey(item)}
            data-panel-host
            className={liClass}
            onClick={section ? closePanelOnNavigate : undefined}
            onFocus={section ? releasePanel : undefined}
          >
            <Trigger
              href={item.href as string}
              type={item.href === null ? "button" : undefined}
              onPointerEnter={section ? releasePanel : undefined}
              target={item.newTab ? "_blank" : undefined}
              rel={item.newTab ? "noopener noreferrer" : undefined}
              className={linkClassName}
            >
              {renderLabel(item.label)}
              {showCart && item.href !== null && isStoreItem(item.href) && <CartBadge size={18} className={cartBadgeClassName} />}
              {section && <IconChevronDown className={cn(chevronClassName, PANEL_CHEVRON_CLASSES)} />}
            </Trigger>
            {section && <MegaMenu section={section} style={menuStyle} />}
          </li>
        );
      })}
    </>
  );
}

/**
 * The utility bar's links, each a panel host for its `TopBarPanel` when it
 * has items. `gate(i, count)` says which widths show the i-th link: the
 * one-row headers show the last from 1440 and the rest from 1680, the
 * two-row ones show the last always and the rest from `sm`.
 */
export function UtilityLinks({
  utility, menuStyle = "mega", linkClassName, gate, chevronClassName = "size-3", renderLabel = (label) => label,
}: {
  utility: readonly TopBarLink[];
  menuStyle?: MenuPanelStyle;
  linkClassName: string;
  gate: (index: number, count: number) => string;
  chevronClassName?: string;
  renderLabel?: (label: string) => ReactNode;
}) {
  return (
    <>
      {utility.map((l, i) => {
        const panel = l.items.length > 0;
        return (
          <div
            key={`${l.href}-${l.label}`}
            data-panel-host
            className={cn(gate(i, utility.length), panel && "group relative")}
            onClick={panel ? closePanelOnNavigate : undefined}
            onFocus={panel ? releasePanel : undefined}
          >
            {l.href === null ? (
              <button type="button" onPointerEnter={panel ? releasePanel : undefined} className={linkClassName}>
                {renderLabel(l.label)}{panel && <IconChevronDown className={cn(chevronClassName, PANEL_CHEVRON_CLASSES)} />}
              </button>
            ) : (
              <Link href={l.href} onPointerEnter={panel ? releasePanel : undefined} {...(l.newTab ? { target: "_blank", rel: "noreferrer" } : {})} className={linkClassName}>
                {renderLabel(l.label)}{panel && <IconChevronDown className={cn(chevronClassName, PANEL_CHEVRON_CLASSES)} />}
              </Link>
            )}
            {panel && <TopBarPanel items={l.items} style={menuStyle} />}
          </div>
        );
      })}
    </>
  );
}

/** The one-row headers' gate: the last utility link from 1440, the rest from 1680. */
export const ONE_ROW_GATE = (i: number, count: number) => (i === count - 1 ? "hidden min-[1440px]:flex" : "hidden min-[1680px]:flex");
/** Terminal's, whose mono labels are wider: the last from 1600, the rest from 1760. */
export const TERMINAL_GATE = (i: number, count: number) => (i === count - 1 ? "hidden min-[1600px]:flex" : "hidden min-[1760px]:flex");
/** The two-row headers' gate: the last always, the rest from `sm`. */
export const STRIP_GATE = (i: number, count: number) => (i === count - 1 ? "flex" : "hidden sm:flex");

/**
 * A header button's words: the theme's own pair (the long one from 560px, the
 * short one below it) or, when an editor has typed some, those — one label at
 * every width, cut short with an ellipsis on a phone where the row has no
 * room to spare.
 */
export function CtaWords({
  label, long, short, longClass = "hidden min-[560px]:inline", shortClass = "min-[560px]:hidden",
}: {
  label?: string;
  long: ReactNode;
  short: ReactNode;
  longClass?: string;
  shortClass?: string;
}) {
  // An editor's own words: cut short on a phone, tighter still under 420px, where Launch ran 20px over at 360 with "Book a survey".
  if (label) return <span className="max-[559px]:max-w-[8.5rem] max-[419px]:max-w-[4rem] max-[559px]:truncate">{label}</span>;
  return (
    <>
      <span className={longClass}>{long}</span>
      <span className={shortClass}>{short}</span>
    </>
  );
}

/**
 * The light / dark switch in a header — opt-in (Site → Header & footer), so no
 * theme draws it until asked. Shown from 1600px where it sits in a bar, which
 * is wider than every gate the bar's other tools use: the footer carries the
 * same control at every width, and a header at its measured limit has no room
 * for a 90px control.
 */
export function HeaderScheme({ onDark = false, className = "hidden min-[1600px]:inline-flex" }: { onDark?: boolean; className?: string }) {
  return <SchemeToggle area="site" onDark={onDark} className={cn("shrink-0", className)} />;
}

/**
 * A cluster of header parts in the order the manifest's group (and so the
 * Header & footer screen) puts them, the switched-off ones left out. Write
 * the nodes (an object, in the order the theme draws them) and the default is the markup
 * it always rendered. Whole groups only — see `arrange()`.
 */
export function Arranged<Id extends string>({ chrome, nodes }: { chrome: ResolvedChrome<Id>; nodes: Partial<Record<Id, ReactNode>> }) {
  return <>{arrange(chrome, Object.entries(nodes) as [Id, ReactNode][]).map(([id, node]) => <Fragment key={id}>{node}</Fragment>)}</>;
}
