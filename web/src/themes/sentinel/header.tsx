"use client";

import Link from "next/link";
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
 * Sentinel's header: one translucent dark row, the seam under it.
 *
 * The reference's bar is a dark glass over the page with a hairline
 * under it; here the row is `bg-dark/85` under a blur — the audit
 * composites it against the `bg-dark` wrapper the chrome puts around it,
 * both the same near-black, so the ratio holds in either scheme — and
 * the seam is the theme's glowing hairline, `sentinel-seam` in
 * `theme.css`. The sections are plain light labels at 400 that go white;
 * the CTA is one pill in the brand fill. The parts that work are the
 * classic header's, through `header-parts.tsx`, with `SiteSearch` and the
 * whole `MobileDrawer`; the width gates are Launch's, measured there.
 */
export function SentinelHeader({
  menu = {}, settings = {}, links, topBar, menuStyle = "mega",
}: {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
  links?: NavLink[];
  topBar: TopBarLink[];
  menuStyle?: MenuPanelStyle;
}) {
  const { nav, utility, phone, isStoreItem, open, setOpen, toggleRef, drawerProps } = useHeaderNav({ settings, links, topBar });
  const bigMenu = menuStyle === "big";

  return (
    <>
      <div className="sticky top-0 z-40 bg-dark">
        <header className="sentinel-seam bg-dark/85 text-dark-ink backdrop-blur-md">
          <Container className={bigMenu ? "relative" : undefined}>
            <div className="flex h-[68px] min-w-0 items-center gap-1.5">
              <Link href="/" aria-label={settings.company_name ? `${settings.company_name} home` : "Home"} className="shrink-0">
                <Logo
                  onDark
                  className="max-[419px]:text-17"
                  logoUrl={settings.logo_url}
                  logoWidth={settings.logo_width}
                  logoHeight={settings.logo_height}
                  companyName={settings.company_name}
                />
              </Link>

              <nav aria-label="Primary" className="ml-8 hidden shrink-0 min-[1280px]:block">
                <ul className={cn("flex items-center gap-1", !bigMenu && "relative")}>
                  <PrimaryNavItems
                    nav={nav}
                    menu={menu}
                    menuStyle={menuStyle}
                    isStoreItem={isStoreItem}
                    linkClassName="flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-14 font-normal text-dark-muted transition-colors duration-(--duration-base) hover:text-white group-[:focus-within:not([data-closed])]:text-white"
                  />
                </ul>
              </nav>

              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <UtilityLinks
                  utility={utility}
                  menuStyle={menuStyle}
                  gate={ONE_ROW_GATE}
                  linkClassName="flex items-center gap-1 whitespace-nowrap px-3 py-2 text-13 font-normal text-dark-muted transition-colors duration-(--duration-base) hover:text-white group-[:hover:not([data-closed])]:text-white group-[:focus-within:not([data-closed])]:text-white"
                />
                <SiteSearch
                  placeholders={["Search…", "part number", "firewall"]}
                  className="hidden h-9 w-[180px] max-w-none rounded-full border-dark-line bg-dark-2 pl-3.5 pr-0.5 text-dark-ink min-[1760px]:flex [&>span]:text-dark-muted"
                  inputClassName="text-13 text-dark-ink"
                  buttonClassName="size-7 rounded-full"
                />
                {phone ? (
                  <a
                    href={telHref(phone)}
                    aria-label={`Call ${phone}`}
                    title={phone}
                    className="hidden size-10 place-items-center rounded-full text-dark-muted transition-colors duration-(--duration-base) hover:bg-dark-2 hover:text-white sm:grid"
                  >
                    <IconPhone className="size-4" />
                  </a>
                ) : null}
                <Link
                  href="/contact"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-13-5 font-semibold text-brand-on transition-colors duration-(--duration-base) hover:bg-brand-700 max-[419px]:px-3"
                >
                  <span className="hidden min-[560px]:inline">Request a call</span>
                  <span className="min-[560px]:hidden">Call</span>
                  <IconArrowRight className="size-3.5" />
                </Link>
                <button
                  ref={toggleRef}
                  type="button"
                  onClick={() => setOpen(true)}
                  aria-label="Open menu"
                  aria-expanded={open}
                  aria-controls="mobile-menu"
                  className="grid size-10 place-items-center rounded-full text-dark-ink transition-colors duration-(--duration-base) hover:bg-dark-2 min-[1280px]:hidden"
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
