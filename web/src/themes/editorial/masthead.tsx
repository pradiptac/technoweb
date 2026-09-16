"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CartBadge } from "@/components/layout/cart-badge";
import { Logo } from "@/components/layout/logo";
import { MegaMenu, PANEL_CHEVRON_CLASSES, type MenuPanelStyle } from "@/components/layout/mega-menu";
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
 * Editorial's masthead: a newspaper's top, not a SaaS header.
 *
 * Three rules, top to bottom. A dateline strip — telephone, address, the
 * utility links, the search field — set small on a hairline. The masthead
 * itself: the logo centred and large, the way a paper's nameplate sits,
 * with the consultation link as a plain text link at the right and the
 * menu button at the left on a phone. Then the **section rail**: the
 * primary navigation as tracked small capitals between two hairlines, and
 * that rail is what sticks — the nameplate scrolls away, the sections stay,
 * which is how a reader moves through a paper.
 *
 * Everything that *works* is reused from the classic header rather than
 * rewritten: `MegaMenu` opens under a rail item on the same `data-closed`
 * contract (`panel-host.ts`), the top bar's `TopBarPanel`, `SiteSearch`,
 * `CartBadge`, and the whole `MobileDrawer` with its focus trap and scroll
 * lock. A theme is a different *arrangement* of the site's parts; a second
 * drawer would be a second set of the bugs the first one already fixed.
 *
 * The rail's height is `--h-site-header` under `[data-theme="editorial"]`
 * (theme.css), because the shop's filter bar sticks beneath whatever is
 * sticky and reads that variable.
 */
export function Masthead({
  menu = {}, settings = {}, links, topBar, menuStyle = "mega",
}: {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
  links?: NavLink[];
  topBar: TopBarLink[];
  /** The theme option; see `MegaMenu`. A big panel positions against the rail's container. */
  menuStyle?: MenuPanelStyle;
}) {
  const bigMenu = menuStyle === "big";
  const nav: readonly NavLink[] = links ?? mainNav.map((item) => ({ label: item.label, href: item.href, newTab: false }));
  const isStoreItem = (href: string) => href === "/store";
  const utility: readonly TopBarLink[] = topBar;
  const phone = settings.phone ?? contact.phone;
  const email = settings.support_email ?? contact.email;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* The dateline strip. */}
      <div className="border-b border-line text-12 text-muted">
        <Container className="flex h-9 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-5">
            <a href={telHref(phone)} className="flex items-center gap-1.5 whitespace-nowrap py-1.5 hover:text-ink">
              <IconPhone className="size-3" />
              {phone}
            </a>
            <a href={`mailto:${email}`} className="hidden whitespace-nowrap py-1.5 hover:text-ink lg:inline-flex">
              {email}
            </a>
          </div>
          <div className="flex items-center gap-4">
            <SiteSearch
              placeholders={["Search…", "Try a part number", "Firewall installation", "Wi-Fi survey"]}
              className="hidden h-7 w-[200px] max-w-none rounded-none border-0 border-b border-line bg-transparent pl-0 pr-0.5 text-ink focus-within:border-ink md:flex [&>span]:left-0 [&>span]:text-12 [&>span]:text-muted"
              inputClassName="text-12 text-ink"
              buttonClassName="size-6 rounded-none"
            />
            {utility.map((l, i) => {
              const panel = l.items.length > 0;
              const classes = "flex items-center gap-1 whitespace-nowrap py-1.5 uppercase tracking-[.12em] text-11 hover:text-ink group-[:hover:not([data-closed])]:text-ink group-[:focus-within:not([data-closed])]:text-ink";
              return (
                <div
                  key={`${l.href}-${l.label}`}
                  data-panel-host
                  className={cn(i === utility.length - 1 ? "flex" : "hidden sm:flex", panel && "group relative")}
                  onClick={panel ? closePanelOnNavigate : undefined}
                  onFocus={panel ? releasePanel : undefined}
                >
                  {l.href === null ? (
                    <button type="button" onPointerEnter={panel ? releasePanel : undefined} className={classes}>
                      {l.label}
                      {panel && <IconChevronDown className={cn("size-[11px]", PANEL_CHEVRON_CLASSES)} />}
                    </button>
                  ) : (
                    <Link
                      href={l.href}
                      onPointerEnter={panel ? releasePanel : undefined}
                      {...(l.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
                      className={classes}
                    >
                      {l.label}
                      {panel && <IconChevronDown className={cn("size-[11px]", PANEL_CHEVRON_CLASSES)} />}
                    </Link>
                  )}
                  {panel && <TopBarPanel items={l.items} />}
                </div>
              );
            })}
          </div>
        </Container>
      </div>

      {/* The nameplate. */}
      <div className="border-b border-line-strong bg-page">
        <Container className="grid h-[88px] grid-cols-[1fr_auto_1fr] items-center gap-3 sm:h-[112px]">
          <div className="flex items-center">
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="grid size-11 place-items-center border border-line-strong bg-card min-[1280px]:hidden"
            >
              <IconMenu className="size-[18px]" />
            </button>
          </div>
          <Link href="/" aria-label="Technoware home" className="justify-self-center">
            <Logo
              className="text-[26px] sm:text-[34px]"
              logoUrl={settings.logo_url}
              logoWidth={settings.logo_width}
              logoHeight={settings.logo_height}
              companyName={settings.company_name}
            />
          </Link>
          <div className="flex items-center justify-end">
            <Link
              href="/contact"
              className="group/cta hidden items-center gap-1.5 whitespace-nowrap border-b border-ink pb-0.5 text-13 font-semibold text-ink hover:border-brand-ink hover:text-brand-ink sm:inline-flex"
            >
              Request a consultation
              <IconArrowRight className="size-3.5 transition-[translate] duration-(--duration-base) group-hover/cta:translate-x-0.5" />
            </Link>
          </div>
        </Container>
      </div>

      {/* The section rail — the part that sticks. */}
      <header className="sticky top-0 z-40 border-b border-line-strong bg-page/95 backdrop-blur-[10px]">
        <nav aria-label="Primary" className="hidden min-[1280px]:block">
          <Container className={bigMenu ? "relative" : undefined}>
            <ul className={cn("flex h-[calc(var(--h-site-header)-1px)] items-stretch justify-center", !bigMenu && "relative")}>
              {nav.map((item) => {
                const section = menu[navKey(item)];
                const Trigger = item.href === null ? "button" : Link;
                return (
                  <li
                    key={navKey(item)}
                    data-panel-host
                    className={cn("flex", section && "group")}
                    onClick={section ? closePanelOnNavigate : undefined}
                    onFocus={section ? releasePanel : undefined}
                  >
                    <Trigger
                      href={item.href as string}
                      type={item.href === null ? "button" : undefined}
                      onPointerEnter={section ? releasePanel : undefined}
                      target={item.newTab ? "_blank" : undefined}
                      rel={item.newTab ? "noopener noreferrer" : undefined}
                      className="relative flex items-center gap-1.5 whitespace-nowrap px-4 text-12 font-semibold uppercase tracking-[.14em] text-ink-2 transition-colors duration-(--duration-base) hover:text-ink after:absolute after:inset-x-4 after:bottom-0 after:h-[3px] after:origin-left after:scale-x-0 after:bg-ink after:transition-[scale] after:duration-(--duration-base) after:ease-brand hover:after:scale-x-100 focus-visible:after:scale-x-100 group-[:focus-within:not([data-closed])]:after:scale-x-100 motion-reduce:after:transition-none"
                    >
                      {item.label}
                      {item.href !== null && isStoreItem(item.href) && <CartBadge size={18} className="relative -top-[7px] -ml-1" />}
                      {section && <IconChevronDown className={cn("size-[11px] text-faint", PANEL_CHEVRON_CLASSES)} />}
                    </Trigger>
                    {section && <MegaMenu section={section} style={menuStyle} />}
                  </li>
                );
              })}
            </ul>
          </Container>
        </nav>
        {/* Below 1280 the rail carries the company's line and the sections are in the drawer. */}
        <Container className="flex h-[calc(var(--h-site-header)-1px)] items-center justify-between min-[1280px]:hidden">
          <span className="truncate text-11 font-semibold uppercase tracking-[.14em] text-muted">
            {settings.tagline ?? "Networks · Servers · Security · Support"}
          </span>
          <Link href="/contact" className="whitespace-nowrap text-12 font-semibold text-ink underline underline-offset-4 sm:hidden">
            Consultation
          </Link>
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
