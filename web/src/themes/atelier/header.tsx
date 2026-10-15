"use client";

import Link from "next/link";
import { ONE_ROW_GATE, PrimaryNavItems, UtilityLinks, useHeaderNav, Arranged, CtaWords, HeaderScheme } from "@/components/layout/header-parts";
import type { ResolvedHeader } from "@/themes/chrome-parts";
import { Logo } from "@/components/layout/logo";
import type { MenuPanelStyle } from "@/components/layout/mega-menu";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { Container } from "@/components/ui/container";
import { IconArrowRight, IconMenu, IconPhone } from "@/components/icons-ui";
import type { MenuSection, NavLink, TopBarLink } from "@/lib/navigation";
import { telHref, type SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

/**
 * Atelier's header: a masthead rule and the sections set in the serif.
 *
 * The bar is the paper it sits on with one hairline under it — the same
 * rule that divides everything else in the theme — and the sections are
 * set in the display face at reading size, underlined on hover rather
 * than filled. The one call is a square-cornered button, because a pill
 * in a theme of straight rules would be the only round thing on the page.
 *
 * **No search in the bar.** Atelier is a studio's site: the work is the
 * navigation, and a search field in a masthead reads as a shop's. It is
 * still in the drawer and on `/search`, so nothing is lost — the
 * `oneRowHeader` list simply does not name it.
 *
 * **The number joins at 1600, and that figure is measured.** At 1440 the
 * logo, the sections, the utility link and the call already fill the row,
 * and the number took the bar 16px past the viewport — found by
 * `scripts/probes/strip-modes.mjs`, which reads `scrollWidth` on every
 * theme's front page and is the only check that looks at a desktop width.
 * Launch gates its own tools the same way and for the same reason.
 *
 * The parts that work are the classic header's, through
 * `header-parts.tsx`.
 */
export function AtelierHeader({
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
  const { nav, utility, phone, isStoreItem, open, setOpen, toggleRef, drawerProps } = useHeaderNav({ settings, links, topBar });
  const bigMenu = menuStyle === "big";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line-strong bg-page/95 backdrop-blur-sm">
        <Container className={cn("flex h-[70px] min-w-0 items-center gap-4", bigMenu && "relative")}>
          <Link href="/" aria-label={settings.company_name ? `${settings.company_name} home` : "Home"} className="shrink-0">
            <Logo
              className="max-[419px]:text-17"
              logoUrl={settings.logo_url}
              logoWidth={settings.logo_width}
              logoHeight={settings.logo_height}
              companyName={settings.company_name}
            />
          </Link>

          <nav aria-label="Primary" className="ml-auto hidden shrink-0 min-[1280px]:block">
            <ul className={cn("flex items-center gap-1", !bigMenu && "relative")}>
              <PrimaryNavItems
                nav={nav}
                menu={menu}
                menuStyle={menuStyle}
                isStoreItem={isStoreItem}
                showCart={chrome.show.cart}
                linkClassName="atelier-nav flex items-center gap-1.5 whitespace-nowrap px-3 py-2 font-display text-15 font-normal text-ink transition-colors duration-(--duration-base) hover:text-brand-ink group-[:focus-within:not([data-closed])]:text-brand-ink"
              />
            </ul>
          </nav>

          <div className={cn("flex shrink-0 items-center gap-3", "min-[1280px]:ml-6 max-[1279px]:ml-auto")}>
            <Arranged chrome={chrome} nodes={{
              phone: (
                phone ? (
                  <a
                    href={telHref(phone)}
                    className="hidden items-center gap-2 text-13-5 text-ink-2 transition-colors duration-(--duration-base) hover:text-ink min-[1600px]:flex"
                  >
                    <IconPhone className="size-3.5" />
                    <span>{phone}</span>
                  </a>
                ) : null
              ),
              utility: (
                <UtilityLinks
                  utility={utility}
                  menuStyle={menuStyle}
                  gate={ONE_ROW_GATE}
                  linkClassName="atelier-nav flex items-center gap-1 whitespace-nowrap py-2 text-13-5 text-ink-2 transition-colors duration-(--duration-base) hover:text-ink"
                />
              ),
              cta: (
                <Link
                  href={chrome.cta.href ?? "/contact"}
                  className="inline-flex h-10 items-center gap-1.5 border border-ink bg-ink px-4 text-13-5 font-medium text-page transition-colors duration-(--duration-base) hover:bg-transparent hover:text-ink max-[419px]:px-3"
                >
                  <CtaWords label={chrome.cta.label} long="Start a project" short="Enquire" />
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
              className="grid size-10 place-items-center text-ink transition-colors duration-(--duration-base) hover:text-brand-ink min-[1280px]:hidden"
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
