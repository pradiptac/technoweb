"use client";

import Link from "next/link";
import { ONE_ROW_GATE, PrimaryNavItems, UtilityLinks, useHeaderNav, Arranged, CtaWords, HeaderScheme } from "@/components/layout/header-parts";
import type { ResolvedHeader } from "@/themes/chrome-parts";
import { Logo } from "@/components/layout/logo";
import type { MenuPanelStyle } from "@/components/layout/mega-menu";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { SiteSearch } from "@/components/layout/site-search";
import { Container } from "@/components/ui/container";
import { IconArrowRight, IconMenu } from "@/components/icons-ui";
import type { MenuSection, NavLink, TopBarLink } from "@/lib/navigation";
import type { SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

/**
 * Aurora's header: one soft row, nothing boxed.
 *
 * The bar has no border — a hairline under a wash would be the hard edge
 * the theme is defined by not having — so it is `bg-page/80` under a blur
 * and separates from the page by the blur alone while the wash shows
 * faintly through it. The sections sit on the centre line as plain words
 * that take a soft brand wash on hover rather than an underline; the
 * calls are pills. The parts that work are the classic header's, through
 * `header-parts.tsx`, so the mega menu, the drawer, the search and the
 * cart are the same components every other theme hosts.
 *
 * The nav appears at 1280 like classic's: this bar carries a search and
 * two pills beside the sections, and at 1160 the row wrapped.
 *
 * **The search joins at 1760, which is measured rather than copied.**
 * `ONE_ROW_GATE` brings the rest of the utility links in at 1680, and with
 * a 200px field already on the bar that one band — 1680 exactly, not 1600
 * and not 1760 — ran 17px past the viewport. Launch's search joins at the
 * same width for the same reason; Terminal, whose mono labels are wider
 * still, has a gate of its own.
 */
export function AuroraHeader({
  menu = {}, settings = {}, links, topBar, menuStyle = "simple", chrome,
}: {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
  links?: NavLink[];
  topBar: TopBarLink[];
  menuStyle?: MenuPanelStyle;
  /** Which parts to draw and in what order (the Header & footer screen). */
  chrome: ResolvedHeader;
}) {
  const { nav, utility, isStoreItem, open, setOpen, toggleRef, drawerProps } = useHeaderNav({ settings, links, topBar });
  const bigMenu = menuStyle === "big";

  return (
    <>
      <header className="sticky top-0 z-40 bg-page/80 backdrop-blur-xl">
        <Container className={cn("flex h-[72px] min-w-0 items-center gap-3", bigMenu && "relative")}>
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
            <ul className={cn("flex items-center gap-1", !bigMenu && "relative")}>
              <PrimaryNavItems
                nav={nav}
                menu={menu}
                menuStyle={menuStyle}
                isStoreItem={isStoreItem}
                showCart={chrome.show.cart}
                linkClassName="flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-14 font-medium text-ink-2 transition-colors duration-(--duration-base) hover:bg-brand-50 hover:text-brand-ink group-[:focus-within:not([data-closed])]:bg-brand-50 group-[:focus-within:not([data-closed])]:text-brand-ink"
              />
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Arranged chrome={chrome} nodes={{
              search: (
                <SiteSearch
                  placeholders={["Search…", "part number", "firewall"]}
                  className="hidden h-10 w-[200px] max-w-none rounded-full border-transparent bg-surface-2 pl-4 pr-1 min-[1760px]:flex"
                  inputClassName="text-13-5"
                  buttonClassName="size-8 rounded-full"
                />
              ),
              utility: (
                <UtilityLinks
                  utility={utility}
                  menuStyle={menuStyle}
                  gate={ONE_ROW_GATE}
                  linkClassName="flex h-10 items-center gap-1 whitespace-nowrap rounded-full px-4 text-13-5 font-medium text-ink-2 transition-colors duration-(--duration-base) hover:bg-surface-2 hover:text-ink group-[:hover:not([data-closed])]:bg-surface-2 group-[:focus-within:not([data-closed])]:bg-surface-2"
                />
              ),
              cta: (
                <Link
                  href={chrome.cta.href ?? "/contact"}
                  className="aurora-cta inline-flex h-11 items-center gap-1.5 rounded-full bg-brand-600 px-5 text-14 font-semibold text-brand-on transition-colors duration-(--duration-base) hover:bg-brand-700 max-[419px]:h-10 max-[419px]:px-3.5"
                >
                  <CtaWords label={chrome.cta.label} long="Talk to us" short="Talk" />
                  <IconArrowRight className="size-3.5" />
                </Link>
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
