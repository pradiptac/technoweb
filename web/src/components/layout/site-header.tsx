"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { IconCart, IconChevronDown, IconClose, IconMail, IconMenu, IconPhone } from "@/components/icons-ui";
import { contact, mainNav } from "@/content/site";
import type { NavLink } from "@/lib/navigation";
import { telHref, type SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import { MegaMenu } from "@/components/layout/mega-menu";
import { VanishInput } from "@/components/velora/vanish-input";
import { ShimmerLink } from "@/components/velora/shimmer-button";
import type { MenuItem, MenuSection } from "@/lib/navigation";

export function SiteHeader({
  menu = {}, settings = {}, links, topBar,
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
  topBar: NavLink[];
}) {
  const nav: readonly NavLink[] = links ?? mainNav.map((item) => ({
    label: item.label, href: item.href, newTab: false,
  }));

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
  const utility: readonly NavLink[] = topBar;
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
      <div className="bg-dark text-13 text-dark-muted">
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
            {/*
              Velora's `vanish-input`: the placeholder cycles through what
              people actually search for here while the field is empty. No
              `onSubmit` handler on purpose — with none the component lets the
              form's own GET to `/search` run, so Enter works before hydration
              and the results URL is shareable, exactly as the plain field was.
              Sized down to the strip: the published pill is 48px tall.
            */}
            <VanishInput
              id="header-q"
              name="q"
              action="/search"
              label="Search the site"
              placeholders={["Search products, guides…", "Try a part number: CBS350-24T", "Firewall installation", "Wi-Fi survey", "AMC for servers"]}
              className="hidden h-7 w-[240px] max-w-none rounded border-dark-line bg-dark-2 pl-2.5 pr-0.5 text-dark-ink focus-within:ring-1 focus-within:ring-brand-400 md:flex [&>span]:left-2.5 [&>span]:text-12-5 [&>span]:text-dark-muted"
              inputClassName="text-12-5 text-dark-ink"
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
            {utility.map((l, i) => (
              <Link
                key={`${l.href}-${l.label}`}
                href={l.href}
                {...(l.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
                className={cn(
                  "py-1.5 hover:text-white",
                  i === utility.length - 1
                    ? "flex items-center"
                    : "hidden sm:inline-flex sm:items-center",
                )}
              >
                {l.label}
              </Link>
            ))}
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
        <Container className="flex h-[calc(var(--h-site-header)-1px)] min-w-0 items-center gap-2 sm:gap-3.5">
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
            <ul className="relative flex gap-0.5">
              {nav.map((item) => {
                const section = menu[item.href];

                return (
                  <li
                    key={item.href}
                    className={section ? "group" : undefined}
                    onClick={section ? closePanelOnNavigate : undefined}
                    onFocus={section ? releasePanel : undefined}
                  >
                    <Link
                      href={item.href}
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
                      {isStoreItem(item.href) && <CartBadge size={22} />}
                      {section && (
                        <IconChevronDown className="size-[11px] text-faint transition-[rotate] duration-(--duration-base) group-[:hover:not([data-closed])]:rotate-180 group-[:focus-within:not([data-closed])]:rotate-180" />
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
          "fixed inset-0 z-40 bg-dark/45 min-[1280px]:hidden",
          // Arrives over the panel's 300ms; leaves in 200, the exit-faster
          // rule: the two states carry their own timing.
          "transition-[opacity,visibility]",
          open ? "visible opacity-100 duration-(--duration-slow) ease-out" : "invisible opacity-0 duration-(--duration-base) ease-exit",
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
          "transition-[translate,visibility]",
          open
            ? "visible translate-x-0 duration-(--duration-slow) ease-[cubic-bezier(.16,1,.3,1)]"
            : "invisible translate-x-full duration-(--duration-base) ease-exit",
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
                className="min-w-0 flex-1 rounded border border-line-strong bg-card px-3 py-2.5 text-15 text-ink placeholder:text-faint focus:border-brand-400 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded bg-brand-600 px-3.5 text-13-5 font-semibold text-brand-on"
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
                        className="flex flex-1 items-center gap-2 rounded px-3 py-3.5 font-display text-lg font-semibold tracking-[-.02em] hover:bg-surface-2"
                      >
                        {item.label}
                        {isStoreItem(item.href) && <CartBadge size={26} />}
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
                            className={`size-4 transition-[rotate] duration-(--duration-base) ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>

                    {section && isOpen && (
                      /*
                        The whole subtree, not one level of it.

                        A menu nests without limit now, and the drawer is the
                        location that takes depth best: it is already a vertical
                        list, so a fourth level is another indent rather than a
                        layout problem. This used to read `section.items` and
                        drop everything under them.
                      */
                      <DrawerItems items={section.items} onNavigate={() => setOpen(false)} />
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 grid gap-3 border-t border-line pt-6">
              <ButtonLink href="/portal/login" variant="secondary" onClick={() => setOpen(false)}>
                Customer login
              </ButtonLink>
              <ShimmerLink href="/contact" onClick={() => setOpen(false)} className="h-11 rounded text-14 font-semibold">
                Request a consultation
              </ShimmerLink>
            </div>

            {/*
              The utility bar's links, which live above the header on a wide
              screen and are hidden below sm. Without them here, Knowledge
              base, Track a ticket, the phone number and the support address
              were unreachable from mobile navigation entirely — the drawer is
              the only navigation a phone has.
            */}
            <div className="mt-6 grid gap-1 border-t border-line pt-6">
              {/*
                The same list the bar renders, minus anything the two buttons
                above already offer.

                The drawer promotes Customer login to a `ButtonLink` beside
                Request a consultation — a deliberate CTA pair — so rendering
                the whole top bar here would print it twice on every phone.
                The filter is on the exact href, which covers the built-in
                list and any menu pointing at the same page; an editor writing
                a custom link to `/portal/login?next=…` gets both, which is the
                harmless direction to be wrong in.
              */}
              {utility
                .filter((l) => l.href !== "/portal/login" && l.href !== "/contact")
                .map((l) => {
                  return (
                    <Link
                      key={`${l.href}-${l.label}`}
                      href={l.href}
                      {...(l.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded px-3 py-2.5 text-15 hover:bg-surface-2"
                    >
                      {/* A 16px box either way, so a list of mixed items does
                          not sit on two different left edges. */}
                      <span className="grid size-4 shrink-0 place-items-center text-muted">
                        {l.icon}
                      </span>
                      {l.label}
                    </Link>
                  );
                })}
              <a
                href={telHref(phone)}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-15 hover:bg-surface-2"
              >
                <IconPhone className="size-4 text-muted" />
                {phone}
              </a>
              <a
                href={`mailto:${email}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-15 break-all hover:bg-surface-2"
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

/**
 * The cart glyph beside Store, as a solid chip rather than a bare coloured
 * outline. `IdentityIcon` gave it a hue-per-icon stroke with no fill, which
 * read as a thin decorative line next to real nav text — too quiet to work
 * as a badge, which is the whole point of marking one destination out. A
 * filled circle carries weight at a glance the way a badge has to.
 *
 * `bg-brand-600`/`text-brand-on` rather than a neon hue: that pairing is one of
 * the eighteen checked against every theme (`Button`'s primary variant uses
 * it), so it is guaranteed to clear WCAG AA everywhere this ships — a neon
 * token was chosen for icon *strokes* on a plain surface and was never
 * verified as a fill with white on top of it.
 */
/*
 * The mega panel is opened by CSS alone — `group-hover` and
 * `group-focus-within` on the `<li>` — which needs no state and is right until
 * somebody clicks a link inside it. The header lives in the layout, so a
 * client-side navigation never remounts it: the clicked link is still
 * `document.activeElement` and the pointer is still over the panel, so both
 * conditions hold and the panel sat open over the page it had just navigated
 * to. Measured: `visible` after the route changed, and still `visible` after
 * the mouse moved away, because focus never left the link.
 *
 * So a click on any link in the group marks it `data-closed` — the panel's
 * variants are `group-[:hover:not([data-closed])]`, so hover and focus both
 * stop counting — and blurs the link, which is what a full page load would
 * have done to focus anyway.
 *
 * The mark is lifted when the pointer **enters the trigger link**, and not
 * when it leaves the `<li>`, which was the first cut and a feedback loop:
 * hiding the panel removes the element under the cursor, so the browser
 * fires `pointerleave` on the `<li>` *because of* the close, the handler
 * released the mark, and the panel came straight back. Firefox does that
 * synchronously and showed it on every click; Chromium's synthesised move
 * came 300ms later, after the pointer had a page under it, so it only looked
 * fixed there. The trigger's own visibility never changes, so entering it
 * cannot be caused by anything this code does — and it is also the one
 * gesture that unambiguously means "open it again". Focus into the group
 * lifts it too (`onFocus` is `focusin`, so any descendant counts), or a
 * keyboard user who never touches the pointer would find the panel closed to
 * Tab for good.
 */
function closePanelOnNavigate(e: MouseEvent<HTMLLIElement>) {
  const link = (e.target as HTMLElement).closest("a");
  if (!link || !e.currentTarget.contains(link)) return;
  e.currentTarget.dataset.closed = "";
  link.blur();
}

function releasePanel(e: SyntheticEvent<HTMLElement>) {
  delete e.currentTarget.closest("li")?.dataset.closed;
}

function CartBadge({ size }: { size: number }) {
  const CartIcon = IconCart;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600 cart-catch"
      style={{ width: size, height: size }}
    >
      <CartIcon className="text-brand-on" style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  );
}

/**
 * The drawer's nested links, to any depth.
 *
 * Recursive, and the indent is what carries the hierarchy — a rule plus
 * padding per level, which is the one pattern that survives arbitrary nesting
 * on a 320px screen without needing a decision per depth.
 *
 * Only the first level keeps its icon tile. An icon at every level would make
 * a four-deep list read as four unrelated groups, and the tile is what marks a
 * *section*; below that, the indent already says what the relationship is.
 *
 * Tap targets stay at the drawer's own 15px/2.5 padding all the way down, so a
 * fifth-level link is as pressable as a first-level one — `audit:mobile` would
 * fail it otherwise, and a menu nobody can tap is not a menu.
 */
function DrawerItems({
  items,
  onNavigate,
  depth = 0,
}: {
  items: MenuItem[];
  onNavigate: () => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "mt-1 mb-2 grid gap-0.5 border-l border-line pl-3" : "grid gap-0.5 border-l border-line pl-3"}>
      {items.map((child) => {
        // Only the top level of the drawer carries a tile; deeper rows are
        // an indented list. The tile arrives rendered from the server.
        const icon = depth === 0 ? child.icon : null;

        return (
          <li key={child.href}>
            <Link
              href={child.href}
              onClick={onNavigate}
              className="flex items-center gap-2.5 rounded px-3 py-2.5 text-15 hover:bg-surface-2"
            >
              {icon}
              {child.label}
            </Link>

            {child.children && child.children.length > 0 && (
              <DrawerItems items={child.children} onNavigate={onNavigate} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
