"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { IconChevronDown, IconMenu, IconPhone } from "@/components/icons-ui";
import { contact, mainNav } from "@/content/site";
import type { NavLink, TopBarLink } from "@/lib/navigation";
import { telHref, type SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import { navKey } from "@/lib/nav-key";
import { MegaMenu, PANEL_CHEVRON_CLASSES, PANEL_HOST_CLASS, type MenuPanelStyle } from "@/components/layout/mega-menu";
import { TopBarPanel } from "@/components/layout/top-bar-panel";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { closePanelOnNavigate, releasePanel } from "@/components/layout/panel-host";
import { CartBadge } from "@/components/layout/cart-badge";
import { SiteSearch } from "@/components/layout/site-search";
import { ShimmerLink } from "@/components/velora/shimmer-button";
import type { MenuSection } from "@/lib/navigation";

export function SiteHeader({
  menu = {}, settings = {}, links, topBar, menuStyle = "mega",
}: {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
  /*
    The top-level links, when a menu has been assigned to the header in the
    console. Absent means "use the built-in list" — the same fallback the
    homepage hero uses for an absent slider, and what keeps this change
    additive for an install that never opens that screen.
  */
  links?: NavLink[];
  /*
    The top bar's links, when a menu is assigned to that location. Same
    fallback as `links`: absent means "use the built-in list", so an install
    that never opens the menu screen renders exactly what it renders today.
  */
  topBar: TopBarLink[];
  /** How a section's panel is drawn — the theme option; `MegaMenu` says what each is. */
  menuStyle?: MenuPanelStyle;
}) {
  const nav: readonly NavLink[] = links ?? mainNav.map((item) => ({
    label: item.label, href: item.href, newTab: false,
  }));
  // A big panel spans the header, so the container is what it positions
  // against; every other style hangs off the list. See `MegaMenu`.
  const bigMenu = menuStyle === "big";

  /*
    Which nav item gets the cart glyph beside its label.
    A straight href match rather than a field on `NavLink`: this decorates
    one specific destination rather than being a property an editor picks
    per menu item, the same reasoning the "New" tag it replaced was built on.
  */
  const isStoreItem = (href: string) => href === "/store";

  /*
    The top bar's links, built-in or configured, always supplied by the layout
    — `defaultTopBar()` in `lib/navigation.ts` is the built-in list. Each
    carries its glyph already rendered on the server, so this file no longer
    imports `iconMap`: that map is ~130 SVG components, and importing it here
    put all of them in the client bundle of every public page to draw two.
  */
  const utility: readonly TopBarLink[] = topBar;
  // Settings win, with the static constants as the fallback — the same
  // arrangement as the hero. A site with nothing configured still renders.
  const phone = settings.phone ?? contact.phone;
  const email = settings.support_email ?? contact.email;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // Which drawer section is expanded on mobile, where there is no hover.
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleRef = useRef<HTMLButtonElement>(null);


  return (
    <>
      {/* utility bar */}
      <div className="bg-topbar text-13 text-topbar-muted">
        <Container className="flex h-[38px] items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            {/*
              `whitespace-nowrap` on everything in this strip, and the address
              waits for `lg`: measured at 768 and 900 the bar held the number,
              the address, the search field and three links, so the number
              broke after "+91", every link wrapped to two lines inside a 38px
              strip, and "Customer login" was clipped at the edge. Below `lg`
              the address is one tap away in the drawer.
            */}
            <a href={telHref(phone)} className="flex items-center gap-1.5 whitespace-nowrap py-1.5 hover:text-topbar-ink">
              <IconPhone className="size-[13px]" />
              {phone}
            </a>
            <a href={`mailto:${email}`} className="hidden whitespace-nowrap py-1.5 hover:text-topbar-ink lg:inline-flex lg:items-center">
              {email}
            </a>
          </div>
          <div className="flex items-center gap-5">
            {/*
              A real field, not a link to one. The site has ~50 indexable
              pages including a catalogue people search by part number, and
              until now the only search on it was inside the knowledge base.

              From md up, where the bar has the room; the drawer carries it on
              a phone. Deliberately a plain GET so it works without
              JavaScript and the results stay shareable.
            */}
            {/*
              Velora's `vanish-input`: the placeholder cycles through what
              people actually search for here while the field is empty. No
              `onSubmit` handler on purpose — with none the component lets the
              form's own GET to `/search` run, so Enter works before hydration
              and the results URL is shareable, exactly as the plain field was.
              Sized down to the strip: the published pill is 48px tall.
            */}
            {/*
              `SiteSearch` wraps the pill with a suggestion list under it —
              three results per group as the term is typed, from `/search`'s
              own ranking. Enter with nothing highlighted is still the GET.
            */}
            <SiteSearch
              placeholders={["Search products, guides…", "Try a part number: CBS350-24T", "Firewall installation", "Wi-Fi survey", "AMC for servers"]}
              className="hidden h-7 w-[240px] max-w-none rounded border-topbar-line bg-topbar-2 pl-2.5 pr-0.5 text-topbar-ink focus-within:ring-1 focus-within:ring-brand-400 md:flex [&>span]:left-2.5 [&>span]:text-12-5 [&>span]:text-topbar-muted"
              inputClassName="text-12-5 text-topbar-ink"
              buttonClassName="size-6 rounded-sm"
            />
            {/*
              All but the **last** are hidden below `sm`, which is what this
              bar already did with its three hard-coded links and is now a
              rule rather than three class lists.

              The strip is 38px and at 320px it holds the telephone number and
              one link with nothing to spare — both flanking groups have to
              shrink, and the phone number is the one thing here nobody should
              have to open a drawer to find. Keeping the *last* visible rather
              than the first is deliberate: an editor puts the thing they most
              want pressed at the end of a utility bar, which is where the
              built-in list has Customer login.
            */}
            {/*
              A link with a menu beneath it is hosted the way a header link
              with a mega panel is — a `.group` carrying the `data-closed`
              contract — and opens `TopBarPanel` under the strip. One that has
              none is a plain link, which is every link in the built-in bar.
            */}
            {utility.map((l, i) => {
              const panel = l.items.length > 0;

              return (
                <div
                  key={`${l.href}-${l.label}`}
                  data-panel-host
                  className={cn(
                    i === utility.length - 1 ? "flex" : "hidden sm:flex",
                    panel && "group relative",
                  )}
                  onClick={panel ? closePanelOnNavigate : undefined}
                  onFocus={panel ? releasePanel : undefined}
                >
                  {/*
                    A heading — no address, a panel beneath — is a button that
                    exists to open it: focusable, so the panel opens for a
                    keyboard, and going nowhere on a press. `Link` cannot take
                    a null href, and an `<a>` without one is not focusable.
                  */}
                  {l.href === null ? (
                    <button
                      type="button"
                      onPointerEnter={panel ? releasePanel : undefined}
                      className="flex items-center gap-1 whitespace-nowrap py-1.5 hover:text-topbar-ink group-[:hover:not([data-closed])]:text-topbar-ink group-[:focus-within:not([data-closed])]:text-topbar-ink"
                    >
                      {l.label}
                      {panel && <IconChevronDown className={cn("size-[11px] text-topbar-muted", PANEL_CHEVRON_CLASSES)} />}
                    </button>
                  ) : (
                    <Link
                      href={l.href}
                      onPointerEnter={panel ? releasePanel : undefined}
                      {...(l.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
                      className="flex items-center gap-1 whitespace-nowrap py-1.5 hover:text-topbar-ink group-[:hover:not([data-closed])]:text-topbar-ink group-[:focus-within:not([data-closed])]:text-topbar-ink"
                    >
                      {l.label}
                      {panel && <IconChevronDown className={cn("size-[11px] text-topbar-muted", PANEL_CHEVRON_CLASSES)} />}
                    </Link>
                  )}
                  {panel && <TopBarPanel items={l.items} />}
                </div>
              );
            })}
          </div>
        </Container>
      </div>

      <header className="sticky top-0 z-40 border-b border-line bg-card/85 backdrop-blur-[14px]">
        {/*
          Tighter gap below 420px: the logo, the CTA and the menu button are
          306px of content in a 288px bar at 320px.

          The height is derived from `--h-site-header` rather than written as a
          literal, because the shop's filter bar sticks directly beneath this
          row and has to know how far down it ends. That variable is the
          header's **outer** height, so the `border-b` on the element above
          comes off here — see the note beside it in `globals.css` for the 1px
          seam that arrangement exists to prevent.
        */}
        <Container className={cn("flex h-[calc(var(--h-site-header)-1px)] min-w-0 items-center gap-2 sm:gap-3.5", bigMenu && "relative")}>
          <Link href="/" aria-label="Technoware home" className="shrink-0">
            <Logo
              className="max-[419px]:text-17"
              logoUrl={settings.logo_url}
              logoWidth={settings.logo_width}
              logoHeight={settings.logo_height}
              companyName={settings.company_name}
            />
          </Link>

          {/*
            1280, not 1160, and the number was measured rather than chosen.

            The nav carries `min-w-0` so the row can shrink, and its links are
            `whitespace-nowrap` — so once the content stops fitting, the links
            paint *outside* the nav's box instead of the row wrapping. At 1160
            "Resources" ran 93px into the consultation button; at 1280 there are
            15px to spare. No element is ever over the page edge and no box
            overlaps, which is why every overflow check passes: it is text
            outside its own box, the same signature as the dashboard's "Today"
            label.

            It began fitting badly when Store was added — one item more than the
            row had room for. Below this the drawer carries the same links.
          */}
          <nav aria-label="Primary" className="ml-5 hidden min-w-0 min-[1280px]:block">
            <ul className={cn("flex gap-0.5", !bigMenu && "relative")}>
              {nav.map((item) => {
                const section = menu[navKey(item)];
                // A heading in the main bar is a button that opens its panel,
                // for the reason the top bar's is.
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
                      // `noopener` always, never conditionally: a new tab
                      // opened without it hands the destination a live handle
                      // on this window through `window.opener`.
                      target={item.newTab ? "_blank" : undefined}
                      rel={item.newTab ? "noopener noreferrer" : undefined}
                      /*
                        The underline grows from the left on hover and on focus,
                        and stays out while the panel below is open on its own.

                        `transition-[scale]`, **not** `transition-transform`.
                        Tailwind v4's `scale-x-*` utilities set the CSS `scale`
                        property rather than `transform`, so transitioning
                        `transform` animates nothing and the rule simply appears
                        — the same trap that made the mobile drawer snap into
                        place instead of sliding, documented in CLAUDE.md.

                        It is drawn on `::after` rather than as an element, so it
                        cannot take part in the flex row or change the link's
                        height, and it is inset to the padding so it underlines
                        the word rather than the hit area. `motion-reduce` drops
                        the animation and keeps the indication: somebody who has
                        asked for less movement still needs to know where they
                        are.
                      */
                      className="relative flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-3 text-14-5 font-medium text-ink-2 transition-colors duration-(--duration-base) hover:bg-surface-2 hover:text-ink after:absolute after:inset-x-3 after:bottom-[7px] after:h-[2px] after:origin-left after:scale-x-0 after:rounded-full after:bg-brand-600 after:transition-[scale] after:duration-(--duration-base) after:ease-brand hover:after:scale-x-100 focus-visible:after:scale-x-100 group-[:focus-within:not([data-closed])]:after:scale-x-100 motion-reduce:after:transition-none"
                    >
                      {item.label}
                      {/*
                        A superscript: 18px, raised to the cap line and tucked
                        against the word, rather than a 22px disc on the
                        baseline — it is a mark on "Store", not a second item.
                        (16px first; asked for a little bigger.)
                      */}
                      {item.href !== null && isStoreItem(item.href) && <CartBadge size={18} className="relative -top-[7px] -ml-1" />}
                      {section && (
                        <IconChevronDown className={cn("size-[11px] text-faint", PANEL_CHEVRON_CLASSES)} />
                      )}
                    </Trigger>
                    {section && <MegaMenu section={section} style={menuStyle} />}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/*
              Shown later than the navigation beside it, and that is a fix
              rather than a preference.

              The nav carries `min-w-0` so the row can shrink, and its links are
              `whitespace-nowrap` — so once the content stops fitting the links
              paint *outside* the nav's box instead of the row wrapping, and
              "Resources" was rendering straight over this word at 1280px. No
              element was over the edge and no box overlapped, so the audit's
              overflow check could not see it: it is text outside its own box,
              the same signature as the dashboard's "Today" label.

              It appeared when Store was added to the navigation, which is one
              item more than the row had space for. This link is the one thing
              in that group that is duplicated elsewhere — Contact is in the
              footer, in the top bar and one press away in the drawer — so it is
              what gives way.
            */}
            <ButtonLink href="/contact" variant="ghost" size="sm" className="hidden min-[1400px]:inline-flex">
              Contact
            </ButtonLink>
            {/*
              Velora's shimmer button, in place of the `soft` ButtonLink and
              its lift/glow. Sized to the header's row — the published pill
              is 48px and `px-8`, and this row is at its measured limit at
              320px, so the width stays what the soft button's was.
            */}
            <ShimmerLink href="/contact" className="h-9 rounded px-4 text-13 font-semibold max-[419px]:px-[11px] max-[419px]:text-12">
              {/*
                One promise at every width, shortened rather than swapped. The
                narrow variant used to read "Get a quote", which is a different
                offer from the one this button makes on a wide screen and the
                one the drawer makes below it. The full wording does not fit a
                320px header — it overflowed by 63px — so what changes is the
                length, not what is being offered.
              */}
              {/*
                One flex child, not two. `shared` puts `gap-2` between a
                button's children, so two sibling spans were separated by 8px
                *plus* the non-breaking space — "Request a  consultation" with a
                visible double gap. Wrapping them makes the gap apply to the
                label as a whole, which is what it is for.
              */}
              <span>
                <span className="hidden min-[560px]:inline">Request a </span>
                <span className="min-[560px]:lowercase">Consultation</span>
              </span>
            </ShimmerLink>
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="grid size-11 place-items-center rounded border border-line-strong bg-card min-[1280px]:hidden"
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

