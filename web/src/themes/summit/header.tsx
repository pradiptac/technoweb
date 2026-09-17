"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CartBadge } from "@/components/layout/cart-badge";
import { Logo } from "@/components/layout/logo";
import { MegaMenu, PANEL_CHEVRON_CLASSES, PANEL_HOST_CLASS, type MenuPanelStyle } from "@/components/layout/mega-menu";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { closePanelOnNavigate, releasePanel } from "@/components/layout/panel-host";
import { SiteSearch } from "@/components/layout/site-search";
import { TopBarPanel } from "@/components/layout/top-bar-panel";
import { Container } from "@/components/ui/container";
import { IconArrowRight, IconChevronDown, IconMenu, IconPhone } from "@/components/icons-ui";
import { contact, mainNav } from "@/content/site";
import { navKey } from "@/lib/nav-key";
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
  const nav: readonly NavLink[] = links ?? mainNav.map((item) => ({ label: item.label, href: item.href, newTab: false }));
  const isStoreItem = (href: string) => href === "/store";
  const utility: readonly TopBarLink[] = topBar;
  const phone = settings.phone ?? contact.phone;
  const email = settings.support_email ?? contact.email;
  const bigMenu = menuStyle === "big";
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

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
                {nav.map((item) => {
                  const section = menu[navKey(item)];
                  const Trigger = item.href === null ? "button" : Link;
                  return (
                    <li
                      key={navKey(item)}
                      data-panel-host
                      className={section ? PANEL_HOST_CLASS[menuStyle] : undefined}
                      onClick={section ? closePanelOnNavigate : undefined}
                      onFocus={section ? releasePanel : undefined}
                    >
                      <Trigger
                        href={item.href as string}
                        type={item.href === null ? "button" : undefined}
                        onPointerEnter={section ? releasePanel : undefined}
                        target={item.newTab ? "_blank" : undefined}
                        rel={item.newTab ? "noopener noreferrer" : undefined}
                        className="flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-13-5 font-medium text-dark-muted transition-colors duration-(--duration-base) hover:text-brand-300 group-[:focus-within:not([data-closed])]:text-brand-300"
                      >
                        {item.label}
                        {item.href !== null && isStoreItem(item.href) && <CartBadge size={18} className="relative -top-[6px] -ml-1" />}
                        {section && <IconChevronDown className={cn("size-3", PANEL_CHEVRON_CLASSES)} />}
                      </Trigger>
                      {section && <MegaMenu section={section} style={menuStyle} />}
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {utility.map((l, i) => {
                const panel = l.items.length > 0;
                const classes = "flex items-center gap-1 whitespace-nowrap px-3 py-2 text-13 font-medium text-dark-muted transition-colors duration-(--duration-base) hover:text-dark-ink group-[:hover:not([data-closed])]:text-dark-ink group-[:focus-within:not([data-closed])]:text-dark-ink";
                return (
                  <div
                    key={`${l.href}-${l.label}`}
                    data-panel-host
                    className={cn(i === utility.length - 1 ? "hidden min-[1440px]:flex" : "hidden min-[1680px]:flex", panel && "group relative")}
                    onClick={panel ? closePanelOnNavigate : undefined}
                    onFocus={panel ? releasePanel : undefined}
                  >
                    {l.href === null ? (
                      <button type="button" onPointerEnter={panel ? releasePanel : undefined} className={classes}>
                        {l.label}{panel && <IconChevronDown className={cn("size-3", PANEL_CHEVRON_CLASSES)} />}
                      </button>
                    ) : (
                      <Link href={l.href} onPointerEnter={panel ? releasePanel : undefined} {...(l.newTab ? { target: "_blank", rel: "noreferrer" } : {})} className={classes}>
                        {l.label}{panel && <IconChevronDown className={cn("size-3", PANEL_CHEVRON_CLASSES)} />}
                      </Link>
                    )}
                    {panel && <TopBarPanel items={l.items} />}
                  </div>
                );
              })}
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

      <MobileDrawer
        open={open}
        onClose={close}
        returnFocusTo={toggleRef}
        nav={nav}
        menu={menu}
        utility={utility}
        settings={settings}
        phone={phone}
        email={email}
        isStoreItem={isStoreItem}
        expanded={expanded}
        setExpanded={setExpanded}
      />
    </>
  );
}
