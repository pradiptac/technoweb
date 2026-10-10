"use client";

import Link from "next/link";
import { ONE_ROW_GATE, PrimaryNavItems, UtilityLinks, useHeaderNav, Arranged, CtaWords, HeaderScheme } from "@/components/layout/header-parts";
import type { ResolvedHeader } from "@/themes/chrome-parts";
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
 * Keystone's header: the sections in one bordered pill, the calls in
 * pills of their own.
 *
 * The reference's bar is white with three groups on it — the logo, one
 * outlined pill holding every section, and two pill buttons — and nothing
 * else. Here the pill holds the sections at 1280 and up; the telephone,
 * one filled pill for the quote and one outlined pill for the customer
 * zone (the utility bar's last link) stand beside it; the search joins
 * from 1760 as Launch's does. The bar is `bg-card/95` under a blur so the
 * page shows faintly through it as it scrolls. The parts that work are
 * the classic header's, through `header-parts.tsx`.
 */
export function KeystoneHeader({
  menu = {}, settings = {}, links, topBar, menuStyle = "semi", chrome,
}: {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
  links?: NavLink[];
  topBar: TopBarLink[];
  menuStyle?: MenuPanelStyle;
  /** Which parts to draw and in what order (the Header & footer screen). */
  chrome: ResolvedHeader;
}) {
  const { nav, utility, phone, isStoreItem, open, setOpen, toggleRef, drawerProps } = useHeaderNav({ settings, links, topBar });
  const bigMenu = menuStyle === "big";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-card/95 backdrop-blur-xl">
        <Container className={cn("flex h-[68px] min-w-0 items-center gap-2", bigMenu && "relative")}>
          <Link href="/" aria-label={settings.company_name ? `${settings.company_name} home` : "Home"} className="shrink-0">
            <Logo
              className="max-[419px]:text-17"
              logoUrl={settings.logo_url}
              logoWidth={settings.logo_width}
              logoHeight={settings.logo_height}
              companyName={settings.company_name}
            />
          </Link>

          <nav aria-label="Primary" className="mx-auto hidden shrink-0 min-[1280px]:block">
            <ul className={cn("flex items-center gap-0.5 rounded-full border border-line-strong bg-card p-1", !bigMenu && "relative")}>
              <PrimaryNavItems
                nav={nav}
                menu={menu}
                menuStyle={menuStyle}
                isStoreItem={isStoreItem}
                  showCart={chrome.show.cart}
                linkClassName="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-13-5 font-semibold text-ink transition-colors duration-(--duration-base) hover:bg-brand-50 hover:text-brand-ink group-[:focus-within:not([data-closed])]:bg-brand-50 group-[:focus-within:not([data-closed])]:text-brand-ink"
              />
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Arranged chrome={chrome} nodes={{
              search: (
              <SiteSearch
                placeholders={["Search…", "part number", "firewall"]}
                className="hidden h-9 w-[180px] max-w-none rounded-full border-line bg-surface pl-3.5 pr-0.5 min-[1760px]:flex"
                inputClassName="text-13"
                buttonClassName="size-7 rounded-full"
              />
              ),
              phone: (
              phone ? (
                <a
                  href={telHref(phone)}
                  aria-label={`Call ${phone}`}
                  title={phone}
                  className="hidden size-10 place-items-center rounded-full text-ink-2 transition-colors duration-(--duration-base) hover:bg-surface-2 hover:text-ink sm:grid"
                >
                  <IconPhone className="size-4" />
                </a>
              ) : null
              ),
              cta: (
              <Link
                href={chrome.cta.href ?? "/contact"}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-13-5 font-semibold text-brand-on transition-colors duration-(--duration-base) hover:bg-brand-700 max-[419px]:px-3"
              >
                <CtaWords label={chrome.cta.label} long="Get a quote" short="Quote" />
                <IconArrowRight className="size-3.5" />
              </Link>
              ),
              utility: (
              <UtilityLinks
                utility={utility}
                menuStyle={menuStyle}
                gate={ONE_ROW_GATE}
                linkClassName="flex h-10 items-center gap-1 whitespace-nowrap rounded-full border border-brand-600 px-4 text-13-5 font-semibold text-brand-ink transition-colors duration-(--duration-base) hover:bg-brand-50 group-[:hover:not([data-closed])]:bg-brand-50 group-[:focus-within:not([data-closed])]:bg-brand-50"
              />
              ),
            }} />
            {chrome.show.scheme && <HeaderScheme />}
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="grid size-10 place-items-center rounded-full text-ink transition-colors duration-(--duration-base) hover:bg-surface-2 min-[1280px]:hidden"
            >
              <IconMenu className="size-[18px]" />
            </button>
          </div>
        </Container>
      </header>

      <MobileDrawer {...drawerProps} menu={menu} />
    </>
  );
}
