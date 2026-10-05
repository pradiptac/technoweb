"use client";

import Link from "next/link";
import { PrimaryNavItems, UtilityLinks, useHeaderNav, TERMINAL_GATE } from "@/components/layout/header-parts";
import { Logo } from "@/components/layout/logo";
import type { MenuPanelStyle } from "@/components/layout/mega-menu";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { SiteSearch } from "@/components/layout/site-search";
import { Container } from "@/components/ui/container";
import { IconMenu, IconPhone } from "@/components/icons-ui";
import type { MenuSection, NavLink, TopBarLink } from "@/lib/navigation";
import { telHref, type SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

/**
 * Terminal's header: one row, a prompt.
 *
 * The logo, then the sections as paths in the mono face — `/solutions`,
 * `/store` — the way a shell lists directories; the open one is
 * underlined with a block cursor's worth of brand. On the right the
 * CTA as `[ engineer ]` until 1440 and the full command from there, the
 * telephone and the last utility link from 1600, the rest from 1760, the
 * search as a prompt (`> _`) from 1920, and the menu button — measured,
 * since mono is wide and the logo is whatever the client uploaded (220px
 * here): the clearance between the nav and the right group is never
 * under 60px from 1280 up. Below 1280
 * the drawer holds all of it. Hairline under the row, no shadow; the ticker
 * sits beneath (`ticker.tsx`) and carries the number at every width.
 *
 * The parts that work are the classic header's, on the same `data-closed`
 * contract: `MegaMenu`, `TopBarPanel`, `SiteSearch`, `CartBadge` and the
 * whole `MobileDrawer`. A big panel positions against the `Container`,
 * which is `relative` for it.
 */
export function PromptHeader({
  menu = {}, settings = {}, links, topBar, menuStyle = "simple",
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
      <header className="sticky top-0 z-40 border-b border-line-strong bg-page">
        <Container className={cn("flex h-14 min-w-0 items-center gap-2 font-mono", bigMenu && "relative")}>
          <Link href="/" aria-label={settings.company_name ? `${settings.company_name} home` : "Home"} className="flex shrink-0 items-center gap-2">
            {/* The prompt goes below 420px: with a real logo it ran the menu button 3px off a 390px screen. */}
            <span aria-hidden className="text-13 text-brand-ink max-[419px]:hidden">$</span>
            <Logo
              className="max-[419px]:text-17"
              logoUrl={settings.logo_url}
              logoWidth={settings.logo_width}
              logoHeight={settings.logo_height}
              companyName={settings.company_name}
            />
          </Link>

          <nav aria-label="Primary" className="ml-4 hidden min-w-0 min-[1280px]:block">
            <ul className={cn("flex items-center", !bigMenu && "relative")}>
              <PrimaryNavItems
                nav={nav}
                menu={menu}
                menuStyle={menuStyle}
                isStoreItem={isStoreItem}
                linkClassName="relative flex items-center gap-1 whitespace-nowrap px-2 py-4 text-12-5 text-ink-2 transition-colors duration-(--duration-base) hover:text-brand-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:origin-left after:scale-x-0 after:bg-brand-500 after:transition-[scale] after:duration-(--duration-slow) hover:after:duration-(--duration-draw) focus-visible:after:duration-(--duration-draw) group-[:focus-within:not([data-closed])]:after:duration-(--duration-draw) after:ease-brand hover:after:scale-x-100 focus-visible:after:scale-x-100 group-[:focus-within:not([data-closed])]:after:scale-x-100 motion-reduce:after:transition-none"
                  chevronClassName="size-[11px]"
                  cartBadgeClassName="relative -top-[7px] -ml-0.5"
                  renderLabel={(label) => <><span aria-hidden className="text-faint">/</span>{label.toLowerCase()}</>}
              />
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <UtilityLinks
              utility={utility}
              menuStyle={menuStyle}
              gate={TERMINAL_GATE}
              linkClassName="flex items-center gap-1 whitespace-nowrap px-2 py-2 text-12-5 text-muted transition-colors duration-(--duration-base) hover:text-ink group-[:hover:not([data-closed])]:text-ink group-[:focus-within:not([data-closed])]:text-ink"
                chevronClassName="size-[11px]"
                renderLabel={(label) => <>[{label.toLowerCase()}]</>}
            />
            <SiteSearch
              placeholders={["> search_", "> part number", "> firewall"]}
              className="hidden h-8 w-[190px] max-w-none rounded-none border-line-strong bg-surface pl-2.5 pr-0.5 min-[1920px]:flex [&>span]:left-2.5 [&>span]:font-mono [&>span]:text-12-5"
              inputClassName="font-mono text-12-5"
              buttonClassName="size-6 rounded-none"
            />
            {phone ? (
              <a
                href={telHref(phone)}
                aria-label={`Call ${phone}`}
                title={phone}
                // The ticker under the header carries the number at every width; the icon is for the widths with room.
                className="hidden size-9 place-items-center text-ink-2 transition-colors duration-(--duration-base) hover:text-brand-ink min-[1600px]:grid"
              >
                <IconPhone className="size-4" />
              </a>
            ) : null}
            {/* Not below 360px, where it ran the menu button 8px off a 320px screen; the drawer carries contact. */}
            <Link
              href="/contact"
              className="inline-flex h-9 items-center whitespace-nowrap border border-ink bg-ink px-3 text-12-5 font-semibold text-page transition-colors duration-(--duration-base) hover:bg-brand-600 hover:border-brand-600 hover:text-brand-on max-[419px]:px-2.5 max-[359px]:hidden"
            >
              <span className="hidden min-[1440px]:inline">[ talk to an engineer ]</span>
              <span className="min-[1440px]:hidden">[ engineer ]</span>
            </Link>
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="grid size-10 place-items-center border border-line-strong text-ink min-[1280px]:hidden"
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
