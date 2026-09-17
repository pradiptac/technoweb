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
import { contact, heroStats, mainNav } from "@/content/site";
import { navKey } from "@/lib/nav-key";
import type { MenuSection, NavLink, TopBarLink } from "@/lib/navigation";
import { statPairs, telHref, type SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

/**
 * Datacenter's header: an operations console's top bar.
 *
 * Two dark rows. The status strip — a readout built from the site's own
 * statistics (Settings → Homepage), each with a steady dot, the telephone
 * number, the utility links and the search field, all in the mono face at
 * 12px. Then the header proper: the logo on dark, the sections as small
 * tracked labels with a brand underline that lights on hover, the cart
 * mark on Store, and one accent button. Both rows are the dark ground
 * tokens (`dark`, `dark-2`, `dark-line`, `dark-ink`, `dark-muted`) that do
 * not invert with the scheme — the CTA band's rule — so the header is the
 * same dark in light and in dark.
 *
 * The parts that work are the classic header's, on the same `data-closed`
 * contract: `MegaMenu` (its panel is a light card, which reads as a
 * window opening over the console), `TopBarPanel`, `SiteSearch`,
 * `CartBadge` and the whole `MobileDrawer`.
 */
export function ConsoleHeader({
  menu = {}, settings = {}, links, topBar, menuStyle = "mega",
}: {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
  links?: NavLink[];
  topBar: TopBarLink[];
  /** The theme option; see `MegaMenu`. A big panel positions against the header's container. */
  menuStyle?: MenuPanelStyle;
}) {
  const bigMenu = menuStyle === "big";
  const nav: readonly NavLink[] = links ?? mainNav.map((item) => ({ label: item.label, href: item.href, newTab: false }));
  const isStoreItem = (href: string) => href === "/store";
  const utility: readonly TopBarLink[] = topBar;
  const phone = settings.phone ?? contact.phone;
  const email = settings.support_email ?? contact.email;
  const readouts = statPairs(settings.hero_stats, heroStats).slice(0, 2);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* The status strip. */}
      <div className="border-b border-dark-line bg-dark-2 font-mono text-12 text-dark-muted">
        <Container className="flex h-9 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-5">
            {readouts.map((s) => (
              <span key={s.label} className="hidden items-center gap-2 whitespace-nowrap md:inline-flex">
                <i aria-hidden className="size-1.5 rounded-full bg-brand-300" />
                <b className="font-semibold text-dark-ink">{s.value}</b>
                <span className="lowercase">{s.label}</span>
              </span>
            ))}
            <a href={telHref(phone)} className="flex items-center gap-1.5 whitespace-nowrap py-1.5 hover:text-dark-ink">
              <IconPhone className="size-3" />
              {phone}
            </a>
          </div>
          <div className="flex items-center gap-4">
            <SiteSearch
              placeholders={["search…", "part number", "firewall", "wi-fi survey"]}
              className="hidden h-7 w-[200px] max-w-none rounded border-dark-line bg-dark pl-2.5 pr-0.5 text-dark-ink focus-within:border-brand-300 md:flex [&>span]:left-2.5 [&>span]:font-mono [&>span]:text-12 [&>span]:text-dark-muted"
              inputClassName="font-mono text-12 text-dark-ink"
              buttonClassName="size-6 rounded-sm"
            />
            {utility.map((l, i) => {
              const panel = l.items.length > 0;
              const classes = "flex items-center gap-1 whitespace-nowrap py-1.5 hover:text-dark-ink group-[:hover:not([data-closed])]:text-dark-ink group-[:focus-within:not([data-closed])]:text-dark-ink";
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
                      [{l.label}]
                      {panel && <IconChevronDown className={cn("size-[11px]", PANEL_CHEVRON_CLASSES)} />}
                    </button>
                  ) : (
                    <Link
                      href={l.href}
                      onPointerEnter={panel ? releasePanel : undefined}
                      {...(l.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
                      className={classes}
                    >
                      [{l.label}]
                      {panel && <IconChevronDown className={cn("size-[11px]", PANEL_CHEVRON_CLASSES)} />}
                    </Link>
                  )}
                  {panel && <TopBarPanel items={l.items} />}
                </div>
              );
            })}
            <a href={`mailto:${email}`} className="hidden whitespace-nowrap py-1.5 hover:text-dark-ink lg:inline-flex">{email}</a>
          </div>
        </Container>
      </div>

      {/* The header proper. */}
      <header className="sticky top-0 z-40 border-b border-dark-line bg-dark text-dark-ink">
        <Container className={cn("flex h-[calc(var(--h-site-header)-1px)] min-w-0 items-center gap-3", bigMenu && "relative")}>
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
          {/* Seven tracked labels need 822px at the roomy metrics, and at 1280
              the container leaves 740 beside the logo and the button — the
              last item ran under the button (measured from the gallery
              screenshot). Compact until 1440, where the room exists. */}
          <nav aria-label="Primary" className="ml-4 hidden min-w-0 min-[1280px]:block min-[1440px]:ml-6">
            <ul className={cn("flex min-[1440px]:gap-1", !bigMenu && "relative")}>
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
                      className="relative flex items-center gap-1.5 whitespace-nowrap px-2 py-3 text-12 font-semibold uppercase tracking-[.07em] text-dark-muted transition-colors duration-(--duration-base) hover:text-dark-ink min-[1440px]:px-3 min-[1440px]:text-12-5 min-[1440px]:tracking-[.1em] after:absolute after:inset-x-2 min-[1440px]:after:inset-x-3 after:-bottom-[10px] after:h-[2px] after:origin-left after:scale-x-0 after:bg-brand-300 after:transition-[scale] after:duration-(--duration-base) after:ease-brand hover:after:scale-x-100 focus-visible:after:scale-x-100 group-[:focus-within:not([data-closed])]:after:scale-x-100 motion-reduce:after:transition-none"
                    >
                      {item.label}
                      {item.href !== null && isStoreItem(item.href) && <CartBadge size={18} className="relative -top-[7px] -ml-1" />}
                      {section && <IconChevronDown className={cn("size-[11px]", PANEL_CHEVRON_CLASSES)} />}
                    </Trigger>
                    {section && <MegaMenu section={section} style={menuStyle} />}
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/contact"
              className="inline-flex h-9 items-center gap-2 rounded bg-brand-600 px-4 text-13 font-semibold text-brand-on transition-colors duration-(--duration-base) hover:bg-brand-700 max-[419px]:px-3 max-[419px]:text-12"
            >
              <span className="hidden min-[560px]:inline">Talk to an engineer</span>
              <span className="min-[560px]:hidden">Engineer</span>
              <IconArrowRight className="size-3.5" />
            </Link>
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="grid size-11 place-items-center rounded border border-dark-line bg-dark-2 text-dark-ink min-[1280px]:hidden"
            >
              <IconMenu className="size-[18px]" />
            </button>
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
