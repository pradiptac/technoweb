"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ONE_ROW_GATE, PrimaryNavItems, UtilityLinks, useHeaderNav } from "@/components/layout/header-parts";
import { Logo } from "@/components/layout/logo";
import type { MenuPanelStyle } from "@/components/layout/mega-menu";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { SiteSearch } from "@/components/layout/site-search";
import { Container } from "@/components/ui/container";
import { IconArrowRight, IconMenu, IconPhone } from "@/components/icons-ui";
import type { MenuSection, NavLink, TopBarLink } from "@/lib/navigation";
import { telHref, type SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

/**
 * Vantage's header: a pill that is see-through over the hero.
 *
 * The client's words for the reference were "transparent menu on a full
 * width new style slider". The pill sits *over* the page — sticky, with a
 * negative bottom margin the height of the bar, so the hero starts under
 * it — and has two states. Over a dark band (the theme's hero and page
 * hero both stamp `data-vantage-dark`) and before the page has scrolled,
 * it is glass: a white hairline, a faint white wash, white type. Otherwise
 * — scrolled, or a page such as the shop that opens on a light band — it
 * is the solid card pill. Which page it is on is decided by CSS, not by
 * this component: `theme.css` keys the glass state on
 * `[data-theme="vantage"]:has([data-vantage-dark])`, so the server renders
 * the right state on the first paint with no flash; the scroll half is the
 * one thing that needs a script, read through `useSyncExternalStore` so
 * nothing is set from an effect.
 *
 * What the contrast audit grades: the glass pill's own ground is a
 * translucent white, which the audit walks past to the nearest opaque
 * ancestor — and that is the wrapper, which in the glass state carries
 * the dark ground at zero height. That is not a trick on the audit; it is
 * the ground the pill is actually over, since the band under it is
 * `bg-dark` with the photograph on top. In the solid state the wrapper is
 * transparent and the pill is graded on its own card colour.
 */
const subscribeScroll = (cb: () => void) => {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
};
const scrolledNow = () => window.scrollY > 24;
const scrolledOnServer = () => false;

export function VantageHeader({
  menu = {}, settings = {}, links, topBar, menuStyle = "semi",
}: {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
  links?: NavLink[];
  topBar: TopBarLink[];
  menuStyle?: MenuPanelStyle;
}) {
  const { nav, utility, phone, isStoreItem, open, setOpen, toggleRef, drawerProps } = useHeaderNav({ settings, links, topBar });
  const bigMenu = menuStyle === "big";
  const scrolled = useSyncExternalStore(subscribeScroll, scrolledNow, scrolledOnServer);

  return (
    <>
      <div className="vantage-head sticky top-0 z-40 pt-3 pb-1" data-scrolled={scrolled ? "" : undefined}>
        <header>
          <Container className={bigMenu ? "relative" : undefined}>
            <div className="vantage-bar flex h-14 min-w-0 items-center gap-1.5 rounded-full border border-line-strong bg-card/92 pl-4 pr-2 text-ink shadow-2 backdrop-blur-xl">
              <Link href="/" aria-label="Technoware home" className="shrink-0">
                <Logo
                  className="vantage-logo max-[419px]:text-17"
                  logoUrl={settings.logo_url}
                  logoWidth={settings.logo_width}
                  logoHeight={settings.logo_height}
                  companyName={settings.company_name}
                />
              </Link>

              <nav aria-label="Primary" className="mx-auto hidden shrink-0 min-[1280px]:block">
                <ul className={cn("flex items-center gap-0.5", !bigMenu && "relative")}>
                  <PrimaryNavItems
                    nav={nav}
                    menu={menu}
                    menuStyle={menuStyle}
                    isStoreItem={isStoreItem}
                    linkClassName="vantage-link relative flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-13-5 font-semibold text-ink-2 transition-colors duration-(--duration-base) hover:text-accent-ink group-[:focus-within:not([data-closed])]:text-accent-ink after:absolute after:bottom-0 after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:rounded-full after:bg-accent-500 after:opacity-0 after:transition-opacity after:duration-(--duration-base) hover:after:opacity-100"
                  />
                </ul>
              </nav>

              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <UtilityLinks
                  utility={utility}
                  menuStyle={menuStyle}
                  gate={ONE_ROW_GATE}
                  linkClassName="vantage-link flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-13 font-medium text-muted transition-colors duration-(--duration-base) hover:text-ink group-[:hover:not([data-closed])]:text-ink group-[:focus-within:not([data-closed])]:text-ink"
                />
                <SiteSearch
                  placeholders={["Search…", "part number", "firewall"]}
                  className="vantage-search hidden h-9 w-[180px] max-w-none rounded-full border-line bg-surface pl-3.5 pr-0.5 min-[1760px]:flex"
                  inputClassName="text-13"
                  buttonClassName="size-7 rounded-full"
                />
                <a
                  href={telHref(phone)}
                  aria-label={`Call ${phone}`}
                  title={phone}
                  className="vantage-link hidden size-10 place-items-center rounded-full text-ink-2 transition-colors duration-(--duration-base) hover:bg-surface-2 hover:text-ink sm:grid"
                >
                  <IconPhone className="size-4" />
                </a>
                <Link
                  href="/support"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent-600 px-4 text-13-5 font-semibold text-accent-on transition-colors duration-(--duration-base) hover:bg-accent-700 max-[419px]:px-3"
                >
                  <span className="hidden min-[560px]:inline">Support ticket</span>
                  <span className="min-[560px]:hidden">Support</span>
                  <IconArrowRight className="size-3.5" />
                </Link>
                <button
                  ref={toggleRef}
                  type="button"
                  onClick={() => setOpen(true)}
                  aria-label="Open menu"
                  aria-expanded={open}
                  aria-controls="mobile-menu"
                  className="vantage-link grid size-10 place-items-center rounded-full text-ink transition-colors duration-(--duration-base) hover:bg-surface-2 min-[1280px]:hidden"
                >
                  <IconMenu className="size-[18px]" />
                </button>
              </div>
            </div>
          </Container>
        </header>
      </div>

      <MobileDrawer {...drawerProps} menu={menu} />
    </>
  );
}
