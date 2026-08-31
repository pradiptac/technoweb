"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { IconBook, IconChevronDown, IconClose, IconMail, IconMenu, IconPhone, IconTicket } from "@/components/icons";
import { contact, mainNav } from "@/content/site";
import type { NavLink } from "@/lib/navigation";
import { telHref, type SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import { MegaMenu } from "@/components/layout/mega-menu";
import { iconMap } from "@/components/icons";
import type { MenuSection } from "@/lib/navigation";

export function SiteHeader({
  menu = {}, settings = {}, links,
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
}) {
  const nav: readonly NavLink[] = links ?? mainNav.map((item) => ({
    label: item.label, href: item.href, newTab: false,
  }));
  // Settings win, with the static constants as the fallback — the same
  // arrangement as the hero. A site with nothing configured still renders.
  const phone = settings.phone ?? contact.phone;
  const email = settings.support_email ?? contact.email;
  const [open, setOpen] = useState(false);
  // Which drawer section is expanded on mobile, where there is no hover.
  const [expanded, setExpanded] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  /*
   * What a panel covering two thirds of the screen has to do to be a dialog.
   *
   * Escape closes it and the page behind does not scroll — both are implied
   * by covering the screen and neither happens for free. The overflow is
   * restored on cleanup rather than on close, so navigating away with the
   * drawer open cannot leave the body locked.
   *
   * Tab is trapped inside the panel. Without it a keyboard user tabs from the
   * drawer straight into the page underneath it — still visible around the
   * backdrop, still reachable, and with no way to tell they have left.
   */
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () => {
      const panel = panelRef.current;
      if (!panel) return [] as HTMLElement[];
      return [...panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!panelRef.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /*
   * Focus goes into the panel when it opens and back to the toggle when it
   * closes — not just anywhere, back to the control the user pressed, which
   * is where they expect to be.
   *
   * Only when it was previously open, or this would steal focus on first
   * render and on every navigation.
   */
  useEffect(() => {
    if (!open) {
      // Back to the control the user pressed, not just anywhere — but only if
      // the drawer was actually open, or this steals focus on first render.
      if (wasOpen.current) toggleRef.current?.focus();
      wasOpen.current = false;
      return;
    }

    wasOpen.current = true;

    /*
     * Focus the close button once it can actually take focus.
     *
     * Not on the next frame: the panel transitions `visibility` over 300ms,
     * and on the first frame the transition is still at progress zero, so the
     * computed value is `hidden` — and a hidden element silently refuses
     * focus. The call appeared to run and did nothing, which is how this
     * looked like a broken ref for a while.
     *
     * Bounded, so a panel that never becomes visible cannot spin here.
     */
    let frame = 0;
    let raf = 0;
    const focusWhenVisible = () => {
      const el = closeRef.current;
      if (!el) return;
      if (getComputedStyle(el).visibility === "visible") {
        el.focus();
        return;
      }
      if (frame++ < 30) raf = requestAnimationFrame(focusWhenVisible);
    };
    raf = requestAnimationFrame(focusWhenVisible);

    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <>
      {/* utility bar */}
      <div className="bg-dark text-[13px] text-dark-muted">
        <Container className="flex h-[38px] items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a href={telHref(phone)} className="flex items-center gap-1.5 py-1.5 hover:text-white">
              <IconPhone className="size-[13px]" />
              {phone}
            </a>
            <a href={`mailto:${email}`} className="hidden py-1.5 hover:text-white sm:inline-flex sm:items-center">
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
            <form role="search" action="/search" method="get" className="hidden md:block">
              <label htmlFor="header-q" className="sr-only">Search the site</label>
              <input
                id="header-q"
                name="q"
                type="search"
                placeholder="Search products, guides…"
                className="w-[212px] rounded border border-dark-line bg-dark-2 px-2.5 py-1 text-[12.5px] text-dark-ink placeholder:text-dark-muted focus:border-brand-400 focus:outline-none"
              />
            </form>
            <Link href="/knowledge-base" className="hidden py-1.5 hover:text-white sm:inline-flex sm:items-center">Knowledge base</Link>
            <Link href="/portal/tickets" className="hidden py-1.5 hover:text-white sm:inline-flex sm:items-center">Track a ticket</Link>
            <Link href="/portal/login" className="flex items-center py-1.5 hover:text-white">Customer login</Link>
          </div>
        </Container>
      </div>

      <header className="sticky top-0 z-40 border-b border-line bg-card/85 backdrop-blur-[14px]">
        {/* Tighter gap below 420px: the logo, the CTA and the menu button are 306px of content in a 288px bar at 320px. */}
        <Container className="flex h-[68px] min-w-0 items-center gap-2 sm:gap-3.5">
          <Link href="/" aria-label="Technoware home" className="shrink-0">
            <Logo
              className="max-[419px]:text-[17px]"
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
            <ul className="relative flex gap-0.5">
              {nav.map((item) => {
                const section = menu[item.href];

                return (
                  <li key={item.href} className={section ? "group" : undefined}>
                    <Link
                      href={item.href}
                      // `noopener` always, never conditionally: a new tab
                      // opened without it hands the destination a live handle
                      // on this window through `window.opener`.
                      target={item.newTab ? "_blank" : undefined}
                      rel={item.newTab ? "noopener noreferrer" : undefined}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-3 text-[14.5px] font-medium text-ink-2 transition-colors duration-200 hover:bg-surface-2 hover:text-ink"
                    >
                      {item.label}
                      {section && (
                        <IconChevronDown className="size-[11px] text-faint transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
                      )}
                    </Link>
                    {section && <MegaMenu section={section} />}
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
            <ButtonLink href="/contact" size="sm" className="max-[419px]:px-[11px] max-[419px]:text-[12px]">
              {/*
                One promise at every width, shortened rather than swapped. The
                narrow variant used to read "Get a quote", which is a different
                offer from the one this button makes on a wide screen and the
                one the drawer makes below it. The full wording does not fit a
                320px header — it overflowed by 63px — so what changes is the
                length, not what is being offered.
              */}
              <span className="hidden min-[560px]:inline">Request a&nbsp;</span>
              <span className="min-[560px]:lowercase">Consultation</span>
            </ButtonLink>
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

      {/* mobile drawer */}
      {/*
        Both panels stay mounted and are shown by class. A conditionally
        rendered element has nothing to transition on the way out — it simply
        disappears — so neither the slide nor the fade would ever be seen
        closing.

        `visibility` is in both transitions on purpose. It is the property that
        keeps a closed drawer out of the tab order and, more importantly, keeps
        the off-screen `translate-x-full` out of documentElement.scrollWidth —
        the zero-tolerance overflow check this project runs on every route.
        CSS gives it exactly the behaviour wanted here: it flips to `visible`
        immediately on the way in, and waits until the transition ends on the
        way out, so the panel is still painted while it slides away.

        `inert` is the other half: `opacity-0` alone leaves every link
        focusable and readable by a screen reader.

        Reduced motion needs nothing — globals.css already disables every
        transition under that query.
      */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          // The third of the screen that stays visible: fades only, no motion.
          "fixed inset-0 z-40 bg-ink/45 min-[1280px]:hidden",
          "transition-[opacity,visibility] duration-300 ease-out",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      />

      <div
        id="mobile-menu"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        className={cn(
          // Two thirds of the viewport, anchored right: that is the side the
          // toggle sits on, and the thumb that opened it is already there.
          "fixed inset-y-0 right-0 z-50 w-2/3 overflow-y-auto bg-card shadow-[-8px_0_32px_rgba(18,20,13,.14)] min-[1280px]:hidden",
          // Slides only. The fade belongs to the backdrop; doing both here
          // makes the panel look like it is dissolving rather than moving.
          //
          // `translate`, not `transform`: Tailwind v4 emits the standalone CSS
          // translate property, so transitioning `transform` animates nothing
          // and the panel simply appears. Caught by measuring the computed
          // value mid-flight rather than trusting the class name.
          "transition-[translate,visibility] duration-300 ease-[cubic-bezier(.16,1,.3,1)]",
          open ? "visible translate-x-0" : "invisible translate-x-full",
        )}
      >
          <div className="flex h-[68px] items-center justify-between gap-3 border-b border-line px-5">
            <Logo
              logoUrl={settings.logo_url}
              logoWidth={settings.logo_width}
              logoHeight={settings.logo_height}
              companyName={settings.company_name}
            />
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid size-11 place-items-center rounded border border-line-strong"
            >
              <IconClose className="size-[18px]" />
            </button>
          </div>
          <div className="px-5 py-6">
            {/* First thing in the drawer: on a phone this is the only search
                on the site, and it should not be below seventeen links. */}
            <form role="search" action="/search" method="get" className="mb-5 flex gap-2">
              <label htmlFor="drawer-q" className="sr-only">Search the site</label>
              <input
                id="drawer-q"
                name="q"
                type="search"
                placeholder="Search products, guides…"
                className="min-w-0 flex-1 rounded border border-line-strong bg-card px-3 py-2.5 text-[15px] text-ink placeholder:text-faint focus:border-brand-400 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded bg-brand-600 px-3.5 text-[13.5px] font-semibold text-white"
              >
                Go
              </button>
            </form>

            <ul className="grid gap-1">
              {nav.map((item) => {
                const section = menu[item.href];
                const isOpen = expanded === item.href;

                return (
                  <li key={item.href}>
                    <div className="flex items-center gap-1">
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        target={item.newTab ? "_blank" : undefined}
                        rel={item.newTab ? "noopener noreferrer" : undefined}
                        className="block flex-1 rounded px-3 py-3.5 font-display text-lg font-semibold tracking-[-.02em] hover:bg-surface-2"
                      >
                        {item.label}
                      </Link>
                      {section && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : item.href)}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Hide" : "Show"} ${item.label}`}
                          className="grid size-11 shrink-0 place-items-center rounded border border-line-strong bg-card"
                        >
                          <IconChevronDown
                            className={`size-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>

                    {section && isOpen && (
                      <ul className="mt-1 mb-2 grid gap-0.5 border-l border-line pl-3">
                        {section.items.map((child) => {
                          const Icon = child.icon && child.icon in iconMap ? iconMap[child.icon] : null;
                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-[15px] hover:bg-surface-2"
                              >
                                {Icon && (
                                  <span className="grid size-7 shrink-0 place-items-center rounded border border-brand-200 bg-brand-50 text-brand-ink [&_svg]:size-3.5">
                                    <Icon />
                                  </span>
                                )}
                                {child.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 grid gap-3 border-t border-line pt-6">
              <ButtonLink href="/portal/login" variant="secondary" onClick={() => setOpen(false)}>
                Customer login
              </ButtonLink>
              <ButtonLink href="/contact" onClick={() => setOpen(false)}>
                Request a consultation
              </ButtonLink>
            </div>

            {/*
              The utility bar's links, which live above the header on a wide
              screen and are hidden below sm. Without them here, Knowledge
              base, Track a ticket, the phone number and the support address
              were unreachable from mobile navigation entirely — the drawer is
              the only navigation a phone has.
            */}
            <div className="mt-6 grid gap-1 border-t border-line pt-6">
              <Link
                href="/knowledge-base"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-[15px] hover:bg-surface-2"
              >
                <IconBook className="size-4 text-muted" />
                Knowledge base
              </Link>
              <Link
                href="/portal/tickets"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-[15px] hover:bg-surface-2"
              >
                <IconTicket className="size-4 text-muted" />
                Track a ticket
              </Link>
              <a
                href={telHref(phone)}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-[15px] hover:bg-surface-2"
              >
                <IconPhone className="size-4 text-muted" />
                {phone}
              </a>
              <a
                href={`mailto:${email}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-[15px] break-all hover:bg-surface-2"
              >
                <IconMail className="size-4 shrink-0 text-muted" />
                {email}
              </a>
            </div>
          </div>
      </div>
    </>
  );
}
