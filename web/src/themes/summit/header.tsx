"use client";

import Link from "next/link";
import { PrimaryNavItems, UtilityLinks, useHeaderNav, ONE_ROW_GATE } from "@/components/layout/header-parts";
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
 * Summit's header: one dark row, the product-company bar.
 *
 * Launch's one-row header (the same width gates, measured there: the last
 * utility link from 1440, the rest from 1680, the search from 1760) on
 * the dark ground tokens that do not invert with the scheme — `dark`,
 * `dark-line`, `dark-ink`, `dark-muted` — so the bar is the same near-black
 * in both schemes, the way the reference site (everestims.com) is dark
 * throughout. The sections are plain links that light to `brand-300`; the
 * CTA is the brand fill; a hairline under the row and no shadow. The parts
 * that work are the classic header's, on the same `data-closed` contract:
 * `MegaMenu`, `TopBarPanel`, `SiteSearch`, `CartBadge` and the whole
 * `MobileDrawer`. A big panel positions against the `Container`.
 */
export function SummitHeader({
  menu = {}, settings = {}, links, topBar, menuStyle = "mega",
}: {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
  links?: NavLink[];
  topBar: TopBarLink[];
  menuStyle?: MenuPanelStyle;
}) {
  const bigMenu = menuStyle === "big";
  const { nav, utility, phone, isStoreItem, open, setOpen, toggleRef, drawerProps } = useHeaderNav({ settings, links, topBar });

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-dark-line bg-dark text-dark-ink">
        <Container className={bigMenu ? "relative" : undefined}>
          <div className="flex h-16 min-w-0 items-center gap-1.5">
            <Link href="/" aria-label="Technoware home" className="shrink-0">
              <Logo
                onDark
                className="max-[419px]:text-17"
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
                  linkClassName="flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-13-5 font-medium text-dark-muted transition-colors duration-(--duration-base) hover:text-brand-300 group-[:focus-within:not([data-closed])]:text-brand-300"
                />
              </ul>
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <UtilityLinks
                utility={utility}
                menuStyle={menuStyle}
                gate={ONE_ROW_GATE}
                linkClassName="flex items-center gap-1 whitespace-nowrap px-3 py-2 text-13 font-medium text-dark-muted transition-colors duration-(--duration-base) hover:text-dark-ink group-[:hover:not([data-closed])]:text-dark-ink group-[:focus-within:not([data-closed])]:text-dark-ink"
              />
              <SiteSearch
                placeholders={["Search…", "part number", "firewall"]}
                className="hidden h-9 w-[180px] max-w-none rounded-md border-dark-line bg-dark-2 pl-3.5 pr-0.5 text-dark-ink min-[1760px]:flex [&>span]:text-dark-muted"
                inputClassName="text-13 text-dark-ink"
                buttonClassName="size-7 rounded-full"
              />
              <a
                href={telHref(phone)}
                aria-label={`Call ${phone}`}
                title={phone}
                // Hidden below `sm`: at 320 the pill was 5px over with it, and the drawer carries the number.
                className="hidden size-10 place-items-center rounded-md text-dark-muted transition-colors duration-(--duration-base) hover:bg-dark-2 hover:text-dark-ink sm:grid"
              >
                <IconPhone className="size-4" />
              </a>
              <Link
                href="/contact"
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-13-5 font-semibold text-brand-on transition-colors duration-(--duration-base) hover:bg-brand-700 max-[419px]:px-3"
              >
                <span className="hidden min-[560px]:inline">Book a demo</span>
                <span className="min-[560px]:hidden">Demo</span>
                <IconArrowRight className="size-3.5" />
              </Link>
              <button
                ref={toggleRef}
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
                aria-expanded={open}
                aria-controls="mobile-menu"
                className="grid size-10 place-items-center rounded-md text-dark-ink transition-colors duration-(--duration-base) hover:bg-dark-2 min-[1280px]:hidden"
              >
                <IconMenu className="size-[18px]" />
              </button>
            </div>
          </div>
        </Container>
      </header>

      <MobileDrawer {...drawerProps} menu={menu} />
    </>
  );
}
