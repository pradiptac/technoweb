import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { SchemeToggle } from "@/components/ui/scheme-toggle";
import { CreditLine } from "@/components/layout/credit-line";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { footerNav } from "@/content/site";
import { SocialLinks } from "@/components/layout/social-links";
import type { NavLink } from "@/lib/navigation";
import { settingEnabled, telHref, type SiteSettings } from "@/lib/site-settings";
import { NewsletterSignup } from "@/components/layout/newsletter-signup";
import { IconMail, IconMapPin, IconPhone } from "@/components/icons-ui";
import { cn } from "@/lib/utils";

/**
 * How the footer is arranged — one per theme (2026-09-17, "a different
 * type of footer for different themes"). Every layout is the same data
 * composed differently: the brand block, the link columns (an assigned
 * footer menu, or the built-in columns), the policy row (the bottom-bar
 * menu, or the built-in five), the signup band and the social row. The
 * menu contract, the settings and the `sr-only`-free landmark structure
 * hold in all nine, so a footer menu assigned in the console reaches every
 * theme.
 *
 * - `columns`   — the dark band with the brand column and one column per
 *                 menu column. The site as it shipped; classic.
 * - `masthead`  — the company name set huge across the top in the display
 *                 face over hairline rules, the columns as a ruled row, on
 *                 the page's own ground. Editorial.
 * - `console`   — dark, with a mono status line, `›` bullets and a mono
 *                 policy row. Datacenter.
 * - `card`      — the footer inside one rounded brand-wash card on the
 *                 page ground, the policy row outside it. Launch.
 * - `prompt`    — mono throughout; every link is printed as a path and the
 *                 credit line is a prompt. Terminal.
 * - `statement` — the tagline set large above four columns on the page
 *                 ground, under an accent rule. Summit.
 * - `split`     — two panels: the brand block on a brand-900 panel, the
 *                 columns on the dark band beside it. Enterprise.
 * - `centred`   — everything centred under a brand-gradient rule: logo,
 *                 tagline, the columns as a row, the social row. Horizon.
 * - `cream`     — the tagline in the display serif at 400 over a coral
 *                 hairline, on the cream ground. Canvas.
 * - `glow`      — dark, under a hairline that glows in the brand colour
 *                 at its middle; the columns first, the brand block last.
 *                 Sentinel (2026-09-18).
 * - `contact`   — dark, opening on a row of three contact plates (phone,
 *                 email, address), the columns beside a rounded signup
 *                 panel. Vantage.
 * - `plate`     — dark, the brand block with the address on the left, the
 *                 columns as bold headings, the signup as one pill button
 *                 and the social row on the right. Keystone.
 *
 * Three of the nine (`masthead`, `statement`, `cream`, and `card`'s
 * surround) sit on the page ground rather than the dark band, so their
 * colours are the page's inverting tokens and the contrast audit grades
 * them in both schemes; the dark ones keep the `dark-*` tokens that never
 * invert. `footerLayoutFor()` maps a theme id to its layout, for the
 * classic chrome that three child themes inherit.
 */
export type FooterLayout =
  | "columns" | "masthead" | "console" | "card" | "prompt"
  | "statement" | "split" | "centred" | "cream"
  | "glow" | "contact" | "plate";

const LAYOUT_BY_THEME: Record<string, FooterLayout> = {
  classic: "columns",
  editorial: "masthead",
  datacenter: "console",
  launch: "card",
  terminal: "prompt",
  summit: "statement",
  enterprise: "split",
  horizon: "centred",
  canvas: "cream",
  sentinel: "glow",
  vantage: "contact",
  keystone: "plate",
};

export function footerLayoutFor(themeId: string): FooterLayout {
  return LAYOUT_BY_THEME[themeId] ?? "columns";
}

type Column = { heading: string; href: string | null; links: NavLink[] };
type Legal = { label: string; href: string; newTab: boolean };

export function SiteFooter({
  settings = {}, columns, bottomBar, layout = "columns",
}: {
  settings?: SiteSettings;
  /*
    The columns, when a menu has been assigned to the footer in the console.
    Absent means the built-in ones — the same fallback the header uses, and the
    reason assigning a menu is an editorial act rather than a deploy.
  */
  columns?: Column[];
  /*
    The bottom row's policy links, when a menu is assigned to that location.
    Absent means the built-in three, the same fallback `columns` uses.
  */
  bottomBar?: Legal[];
  layout?: FooterLayout;
}) {
  const nav: Column[] = columns ?? footerNav.map((col) => ({
    heading: col.heading,
    href: "",
    links: col.links.map((l) => ({ label: l.label, href: l.href, newTab: false })),
  }));

  /*
    The four policy pages are hard-coded here as the fallback and are **CMS
    pages** in the seeded menu, so an assigned menu follows a slug change and
    this list does not. Returns and Shipping are the two Google Merchant Center
    requires a shop to make reachable. That is the trade of the fallback existing at all, and it is the
    right one: a footer with no link to a privacy policy is worse than one
    holding a link that has to be corrected if somebody renames the page.
  */
  const legal: Legal[] = bottomBar ?? [
    { label: "Privacy", href: "/privacy", newTab: false },
    { label: "Terms", href: "/terms", newTab: false },
    { label: "Returns", href: "/returns", newTab: false },
    { label: "Shipping", href: "/shipping", newTab: false },
    { label: "Sitemap", href: "/sitemap.xml", newTab: false },
  ];

  /*
    The signup is a band across the top, not a widget in the brand column.
    In the column it had about 270px — narrow enough that the input clipped
    `you@company.com` before anybody had typed. Gated on the setting rather
    than always drawn: `newsletter_signup_enabled` is the one key published
    out of an otherwise private group, for exactly this — a form that renders
    and then answers 403 is worse than no form. Read through `settingEnabled`,
    because settings are strings and `"0"` is truthy in JavaScript.
  */
  const signup = settingEnabled(settings, "newsletter_signup_enabled", false);
  const tagline = settings.tagline ??
    "Hardware, network and security infrastructure — designed, deployed and supported by engineers.";
  const p = { settings, nav, legal, signup, tagline };

  switch (layout) {
    case "masthead": return <Masthead {...p} />;
    case "console": return <Console {...p} />;
    case "card": return <CardFooter {...p} />;
    case "prompt": return <Prompt {...p} />;
    case "statement": return <Statement {...p} />;
    case "split": return <Split {...p} />;
    case "centred": return <Centred {...p} />;
    case "cream": return <Cream {...p} />;
    case "glow": return <Glow {...p} />;
    case "contact": return <Contact {...p} />;
    case "plate": return <Plate {...p} />;
    default: return <Columns {...p} />;
  }
}

type Parts = { settings: SiteSettings; nav: Column[]; legal: Legal[]; signup: boolean; tagline: string };

/* ----------------------------------------------------------------- pieces */

/** The logo, the tagline, the address and phone, the social row. `onDark` picks the band's tokens. */
function Brand({ settings, tagline, onDark, centred = false, className }: { settings: SiteSettings; tagline: string; onDark: boolean; centred?: boolean; className?: string }) {
  return (
    <div className={cn(centred && "flex flex-col items-center text-center", className)}>
      <Logo
        onDark={onDark}
        className="mb-3.5 block"
        logoUrl={settings.logo_url}
        logoWidth={settings.logo_width}
        logoHeight={settings.logo_height}
        companyName={settings.company_name}
      />
      <p className={cn("max-w-[34ch] leading-relaxed", centred && "mx-auto")}>{tagline}</p>
      {(settings.address || settings.phone) && (
        /*
          No rule above it and no heading over the address: this block is
          three short things — who we are, where we are, where else to find
          us — and a hairline between each made an identity block read as a
          stack of separate widgets.
        */
        <section className={cn("mt-5 max-w-[34ch]", centred && "mx-auto")}>
          <address className="not-italic leading-relaxed">
            {/* Kept as typed: an address is line-broken by whoever wrote it. */}
            {settings.address && <span className="block whitespace-pre-line">{settings.address}</span>}
            {settings.phone && (
              <a href={telHref(settings.phone)} className={cn("mt-2 inline-block font-mono text-14 transition-colors", onDark ? "hover:text-white" : "hover:text-ink")}>
                {/* `font-mono`, the rule this project holds for data: a telephone number is dialled, not read as prose. */}
                {settings.phone}
              </a>
            )}
          </address>
        </section>
      )}
      <SocialLinks settings={settings} />
    </div>
  );
}

/** One column: its heading (a link when the menu's top-level item is a destination) and its whole subtree. */
function FooterColumn({ col, onDark, headingClass, bullet }: { col: Column; onDark: boolean; headingClass?: string; bullet?: string }) {
  return (
    <div>
      {/*
        A configured column's heading is itself a link — the top-level item
        is a real destination in a menu, unlike the built-in columns whose
        headings are only labels. Rendered as a heading either way, so the
        footer's landmark structure does not depend on which source it came
        from.
      */}
      <h2 className={cn("mb-4 font-display text-xs font-semibold uppercase tracking-[.11em]", onDark ? "text-white" : "text-ink", headingClass)}>
        {col.href ? <Link href={col.href} className="hover:underline">{col.heading}</Link> : col.heading}
      </h2>
      <FooterLinks links={col.links} onDark={onDark} bullet={bullet} />
    </div>
  );
}

/**
 * A footer column's links, nested to any depth.
 *
 * Recursive, with an indent and a rule per level — the same treatment the
 * mobile drawer uses, and for the same reason: it is the one pattern that
 * survives arbitrary nesting without a decision per depth. On the dark band
 * the rule is `dark-line`, which never inverts; on the page ground it is
 * `line`, which does.
 */
function FooterLinks({ links, depth = 0, onDark, bullet, asPath }: { links: NavLink[]; depth?: number; onDark: boolean; bullet?: string; asPath?: boolean }) {
  return (
    <ul className={depth === 0 ? "" : cn("mt-1.5 mb-1 ml-1 border-l pl-3", onDark ? "border-dark-line" : "border-line")}>
      {links.map((l) => (
        <li key={l.href ?? `heading:${l.label}`} className="mb-2.5">
          {l.href === null ? (
            // A heading inside a column: a group title over its own list.
            <span className={cn("font-semibold", onDark ? "text-white" : "text-ink")}>{l.label}</span>
          ) : (
            <Link
              href={l.href}
              target={l.newTab ? "_blank" : undefined}
              rel={l.newTab ? "noopener noreferrer" : undefined}
              className={cn("transition-colors", onDark ? "hover:text-white" : "hover:text-ink", asPath && "font-mono text-13")}
            >
              {bullet && <span aria-hidden className="mr-1.5 opacity-60">{bullet}</span>}
              {asPath ? pathLabel(l) : l.label}
            </Link>
          )}
          {l.children && l.children.length > 0 && (
            <FooterLinks links={l.children} depth={depth + 1} onDark={onDark} bullet={bullet} asPath={asPath} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** "Our team" at /team → `~/team`; an external link keeps its host. The terminal's way of naming a page. */
function pathLabel(l: NavLink): string {
  if (!l.href) return l.label;
  if (/^https?:\/\//.test(l.href)) return l.href.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `~${l.href === "/" ? "" : l.href}`;
}

/** The credit line, the policy links and the scheme toggle, in one row. */
function BottomRow({ settings, legal, onDark, className, mono = false }: { settings: SiteSettings; legal: Legal[]; onDark: boolean; className?: string; mono?: boolean }) {
  return (
    <div className={cn("flex flex-wrap justify-between gap-x-6 gap-y-3 py-5.5 text-13", mono && "font-mono text-12-5", className)}>
      <CreditLine
        companyName={settings.company_name ?? "Technoware"}
        linkClassName={cn("font-medium hover:underline", onDark ? "text-dark-ink hover:text-white" : "text-ink hover:text-brand-ink")}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/*
          The policy row, from a menu when one is assigned to the bottom bar
          and from the built-in list otherwise. A flat list deliberately:
          this line is shared with the copyright and the scheme toggle, so it
          has no room for a group. `getBottomBarNav` drops children rather
          than recursing, so the decision lives in one place.
        */}
        <ul className="flex flex-wrap gap-5">
          {legal.map((l) => (
            <li key={`${l.href}-${l.label}`}>
              <Link href={l.href} {...(l.newTab ? { target: "_blank", rel: "noreferrer" } : {})} className={onDark ? "hover:text-white" : "hover:text-ink"}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        {/*
          The site's own scheme control, independent of the console's. In the
          footer rather than the header: it is a preference somebody sets
          once, not a thing they reach for.
        */}
        <SchemeToggle area="site" onDark={onDark} />
      </div>
    </div>
  );
}

function SignupBand({ onDark, className }: { onDark: boolean; className?: string }) {
  return (
    <section className={cn("grid gap-x-10 gap-y-4 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-start", className)}>
      <div className="min-w-0">
        <h2 className={cn("font-display text-19 font-semibold", onDark ? "text-white" : "text-ink")}>Occasional notes on infrastructure</h2>
        <p className="measure mt-1.5 leading-relaxed">
          What we have been building, what broke, and what we would do differently. No more than once a month.
        </p>
      </div>
      <NewsletterSignup onDark={onDark} />
    </section>
  );
}

/* ---------------------------------------------------------------- layouts */

/** The dark band with the brand column and one column per menu column. Classic. */
function Columns({ settings, nav, legal, signup, tagline }: Parts) {
  return (
    <footer data-footer="columns" className="bg-dark pt-[60px] text-sm text-dark-muted">
      <Container>
        {signup && <SignupBand onDark className="mb-10 border-b border-dark-line pb-9" />}
        {/*
          The brand column plus one track per nav column, generated rather
          than spelled out. Below `lg` the link columns sit two abreast rather
          than stacking; the brand column spans both.
        */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 pb-11 lg:grid-cols-[1.4fr_repeat(var(--footer-cols),minmax(0,1fr))] lg:gap-9"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          <Brand settings={settings} tagline={tagline} onDark className="col-span-2 lg:col-span-1" />
          {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark />)}
        </div>
        <BottomRow settings={settings} legal={legal} onDark className="border-t border-dark-line" />
      </Container>
    </footer>
  );
}

/** The company name huge across the top over hairline rules; the columns as a ruled row; the page ground. Editorial. */
function Masthead({ settings, nav, legal, signup, tagline }: Parts) {
  const name = settings.company_name ?? "Technoware";
  return (
    <footer data-footer="masthead" className="border-t-2 border-ink bg-page pt-8 text-sm text-muted">
      <Container>
        <p aria-hidden className="select-none overflow-hidden border-b border-line pb-4 font-display text-[clamp(2.75rem,9.5vw,8.5rem)] leading-[.9] font-semibold tracking-[-.045em] text-ink uppercase">
          {name}
        </p>
        {signup && <SignupBand onDark={false} className="border-b border-line py-8" />}
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 border-b border-line py-9 lg:grid-cols-[1.2fr_repeat(var(--footer-cols),minmax(0,1fr))] lg:gap-9"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          <Brand settings={settings} tagline={tagline} onDark={false} className="col-span-2 lg:col-span-1 lg:border-r lg:border-line lg:pr-9" />
          {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark={false} headingClass="font-serif normal-case tracking-normal text-15 italic" />)}
        </div>
        <BottomRow settings={settings} legal={legal} onDark={false} />
      </Container>
    </footer>
  );
}

/** Dark, with a mono status line, `›` bullets and a mono policy row. Datacenter. */
function Console({ settings, nav, legal, signup, tagline }: Parts) {
  const year = new Date().getFullYear();
  return (
    <footer data-footer="console" className="bg-dark text-sm text-dark-muted">
      <div className="border-b border-dark-line">
        <Container>
          <p className="flex flex-wrap items-center gap-x-5 gap-y-1 py-2.5 font-mono text-12 uppercase tracking-[.08em]">
            <span className="text-dark-ink">{settings.company_name ?? "Technoware"}</span>
            <span aria-hidden className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ok" />systems nominal</span>
            <span>{year}</span>
            {settings.phone && <span className="ml-auto">tel {settings.phone}</span>}
          </p>
        </Container>
      </div>
      <Container>
        {signup && <SignupBand onDark className="border-b border-dark-line py-9" />}
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 py-11 lg:grid-cols-[1.4fr_repeat(var(--footer-cols),minmax(0,1fr))] lg:gap-9"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          <Brand settings={settings} tagline={tagline} onDark className="col-span-2 lg:col-span-1" />
          {nav.map((col) => (
            <FooterColumn key={col.heading} col={col} onDark bullet="›" headingClass="font-mono" />
          ))}
        </div>
        <BottomRow settings={settings} legal={legal} onDark mono className="border-t border-dark-line" />
      </Container>
    </footer>
  );
}

/** The footer inside one rounded brand-wash card on the page ground; the policy row outside it. Launch. */
function CardFooter({ settings, nav, legal, signup, tagline }: Parts) {
  return (
    <footer data-footer="card" className="bg-page pt-6 text-sm text-muted">
      <Container>
        <div className="rounded-3xl bg-brand-50 px-6 py-9 sm:px-9 lg:px-12 lg:py-12">
          {signup && <SignupBand onDark={false} className="mb-9 border-b border-brand-200/60 pb-9" />}
          <div className="grid grid-cols-2 gap-x-6 gap-y-9 lg:grid-cols-[1.4fr_repeat(var(--footer-cols),minmax(0,1fr))] lg:gap-9"
            style={{ "--footer-cols": nav.length } as CSSProperties}>
            <Brand settings={settings} tagline={tagline} onDark={false} className="col-span-2 lg:col-span-1" />
            {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark={false} />)}
          </div>
        </div>
        <BottomRow settings={settings} legal={legal} onDark={false} />
      </Container>
    </footer>
  );
}

/** Mono throughout; every link printed as a path; the credit line as a prompt. Terminal. */
function Prompt({ settings, nav, legal, signup, tagline }: Parts) {
  return (
    <footer data-footer="prompt" className="border-t border-line bg-page pt-9 font-mono text-13 text-muted">
      <Container>
        {signup && <SignupBand onDark={false} className="border-b border-line pb-9" />}
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 py-9 lg:grid-cols-[1.3fr_repeat(var(--footer-cols),minmax(0,1fr))] lg:gap-9"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          <Brand settings={settings} tagline={tagline} onDark={false} className="col-span-2 lg:col-span-1" />
          {nav.map((col) => (
            <div key={col.heading}>
              <h2 className="mb-4 text-12 font-semibold text-ink">
                <span aria-hidden className="text-brand-ink">$ </span>ls {col.href ? <Link href={col.href} className="hover:underline">{col.heading.toLowerCase()}</Link> : col.heading.toLowerCase()}
              </h2>
              <FooterLinks links={col.links} onDark={false} asPath />
            </div>
          ))}
        </div>
        <div className="border-t border-line">
          <p className="pt-5 text-12-5"><span aria-hidden className="text-brand-ink">$ </span>whoami<span aria-hidden className="ml-0.5 inline-block w-[7px] animate-pulse border-b-2 border-brand-ink align-baseline">&nbsp;</span></p>
          <BottomRow settings={settings} legal={legal} onDark={false} mono className="pt-2" />
        </div>
      </Container>
    </footer>
  );
}

/** The tagline set large above four columns on the page ground, under an accent rule. Summit. */
function Statement({ settings, nav, legal, signup, tagline }: Parts) {
  return (
    <footer data-footer="statement" className="border-t-4 border-accent-500 bg-page pt-12 text-sm text-muted">
      <Container>
        <p className="measure font-display text-[clamp(1.6rem,3.2vw,2.6rem)] leading-[1.15] font-semibold tracking-[-.03em] text-ink">{tagline}</p>
        {signup && <SignupBand onDark={false} className="mt-9 border-t border-line pt-9" />}
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-9 border-t border-line pt-9 pb-11 lg:grid-cols-[1fr_repeat(var(--footer-cols),minmax(0,1fr))] lg:gap-9"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          <div className="col-span-2 lg:col-span-1">
            <Logo className="mb-3.5 block" logoUrl={settings.logo_url} logoWidth={settings.logo_width} logoHeight={settings.logo_height} companyName={settings.company_name} />
            {(settings.address || settings.phone) && (
              <address className="not-italic leading-relaxed">
                {settings.address && <span className="block whitespace-pre-line">{settings.address}</span>}
                {settings.phone && <a href={telHref(settings.phone)} className="mt-2 inline-block font-mono text-14 hover:text-ink">{settings.phone}</a>}
              </address>
            )}
            <SocialLinks settings={settings} />
          </div>
          {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark={false} />)}
        </div>
        <BottomRow settings={settings} legal={legal} onDark={false} className="border-t border-line" />
      </Container>
    </footer>
  );
}

/** Two panels: the brand block on a brand-900 panel, the columns on the dark band beside it. Enterprise. */
function Split({ settings, nav, legal, signup, tagline }: Parts) {
  return (
    <footer data-footer="split" className="bg-dark text-sm text-dark-muted">
      <div className="lg:grid lg:grid-cols-[minmax(0,.38fr)_minmax(0,1fr)]">
        <div className="bg-brand-900 px-6 py-11 text-dark-muted sm:px-10 lg:px-14 lg:py-14">
          <div className="ml-auto max-w-[420px] lg:mr-0">
            <Brand settings={settings} tagline={tagline} onDark />
          </div>
        </div>
        <div className="px-6 py-11 sm:px-10 lg:px-14 lg:py-14">
          {signup && <SignupBand onDark className="mb-9 border-b border-dark-line pb-9" />}
          <div className="grid grid-cols-2 gap-x-6 gap-y-9 lg:grid-cols-[repeat(var(--footer-cols),minmax(0,1fr))] lg:gap-9"
            style={{ "--footer-cols": nav.length } as CSSProperties}>
            {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark headingClass="border-b border-dark-line pb-2" />)}
          </div>
        </div>
      </div>
      <Container>
        <BottomRow settings={settings} legal={legal} onDark className="border-t border-dark-line" />
      </Container>
    </footer>
  );
}

/** Everything centred under a brand-gradient rule: logo, tagline, the columns as a row, the social row. Horizon. */
function Centred({ settings, nav, legal, signup, tagline }: Parts) {
  return (
    <footer data-footer="centred" className="bg-dark pt-0 text-sm text-dark-muted">
      <div aria-hidden className="h-1.5 bg-linear-to-r from-brand-600 via-secondary-500 to-accent-500" />
      <Container>
        <div className="pt-12 pb-9">
          <Brand settings={settings} tagline={tagline} onDark centred />
        </div>
        {signup && <SignupBand onDark className="mx-auto max-w-[900px] border-y border-dark-line py-9" />}
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 py-10 text-center sm:grid-cols-[repeat(var(--footer-cols),minmax(0,1fr))] sm:gap-9"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark />)}
        </div>
        <BottomRow settings={settings} legal={legal} onDark className="border-t border-dark-line justify-center" />
      </Container>
    </footer>
  );
}

/** The tagline in the display serif at 400 over a coral hairline, on the cream ground. Canvas. */
function Cream({ settings, nav, legal, signup, tagline }: Parts) {
  return (
    <footer data-footer="cream" className="border-t border-accent-500/60 bg-surface pt-12 text-sm text-muted">
      <Container>
        <p className="max-w-[26ch] font-display text-[clamp(1.75rem,3.6vw,3rem)] leading-[1.1] font-normal tracking-[-.02em] text-ink">{tagline}</p>
        {signup && <SignupBand onDark={false} className="mt-9 border-t border-line pt-9" />}
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-9 border-t border-line pt-9 pb-11 lg:grid-cols-[1fr_repeat(var(--footer-cols),minmax(0,1fr))] lg:gap-9"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          <div className="col-span-2 lg:col-span-1">
            <Logo className="mb-3.5 block" logoUrl={settings.logo_url} logoWidth={settings.logo_width} logoHeight={settings.logo_height} companyName={settings.company_name} />
            {(settings.address || settings.phone) && (
              <address className="not-italic leading-relaxed">
                {settings.address && <span className="block whitespace-pre-line">{settings.address}</span>}
                {settings.phone && <a href={telHref(settings.phone)} className="mt-2 inline-block font-mono text-14 hover:text-ink">{settings.phone}</a>}
              </address>
            )}
            <SocialLinks settings={settings} />
          </div>
          {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark={false} headingClass="normal-case tracking-normal text-14 font-normal italic" />)}
        </div>
        <BottomRow settings={settings} legal={legal} onDark={false} className="border-t border-line" />
      </Container>
    </footer>
  );
}

/** Dark, under a hairline that glows in the brand colour at its middle; the columns first, the brand block last. Sentinel. */
function Glow({ settings, nav, legal, signup, tagline }: Parts) {
  return (
    <footer data-footer="glow" className="relative bg-dark pt-14 text-sm text-dark-muted">
      {/* The seam between page and footer: a hairline whose middle carries the brand colour. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-300 to-transparent" />
      <Container>
        {signup && <SignupBand onDark className="mb-11 border-b border-dark-line pb-10" />}
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 pb-11 lg:grid-cols-[repeat(var(--footer-cols),minmax(0,1fr))_1.3fr] lg:gap-9"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark headingClass="font-light normal-case tracking-normal text-15 text-white" />)}
          <Brand settings={settings} tagline={tagline} onDark className="col-span-2 border-t border-dark-line pt-8 lg:col-span-1 lg:border-t-0 lg:border-l lg:pl-9 lg:pt-0" />
        </div>
        <BottomRow settings={settings} legal={legal} onDark className="border-t border-dark-line" />
      </Container>
    </footer>
  );
}

/** Dark, opening on a row of contact plates, the columns beside a rounded signup panel. Vantage. */
function Contact({ settings, nav, legal, signup, tagline }: Parts) {
  type Plate = { icon: ReactNode; label: string; href: string | null };
  const plates: Plate[] = [];
  if (settings.phone) plates.push({ icon: <IconPhone className="size-4" />, label: settings.phone, href: telHref(settings.phone) });
  if (settings.support_email) plates.push({ icon: <IconMail className="size-4" />, label: settings.support_email, href: `mailto:${settings.support_email}` });
  if (settings.address) plates.push({ icon: <IconMapPin className="size-4" />, label: settings.address.replace(/\s*\n\s*/g, ", "), href: null });
  return (
    <footer data-footer="contact" className="bg-dark pt-12 text-sm text-dark-muted">
      <Container>
        {plates.length > 0 && (
          <ul className="flex flex-wrap gap-x-10 gap-y-4 border-b border-dark-line pb-9">
            {plates.map((c) => (
              <li key={c.label} className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-500 text-accent-on">{c.icon}</span>
                {c.href ? <a href={c.href} className="text-dark-ink hover:text-white">{c.label}</a> : <span className="text-dark-ink">{c.label}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className={cn("grid gap-x-10 gap-y-9 py-10", signup && "lg:grid-cols-[1fr_minmax(0,380px)]")}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-[repeat(var(--footer-cols),minmax(0,1fr))]"
            style={{ "--footer-cols": nav.length } as CSSProperties}>
            {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark headingClass="text-accent-300 normal-case tracking-normal text-15" />)}
          </div>
          {signup && (
            <div className="rounded-2xl bg-dark-2 p-6">
              <h2 className="font-display text-17 font-semibold text-white">Occasional notes on infrastructure</h2>
              <p className="mt-1.5 leading-relaxed">{tagline}</p>
              <div className="mt-4"><NewsletterSignup onDark /></div>
            </div>
          )}
        </div>
        <div className="border-t border-dark-line pt-6">
          <SocialLinks settings={settings} />
        </div>
        <BottomRow settings={settings} legal={legal} onDark />
      </Container>
    </footer>
  );
}

/** Dark, the brand block with the address left, bold headings, the signup as one pill button and the social row on the right. Keystone. */
function Plate({ settings, nav, legal, signup, tagline }: Parts) {
  return (
    <footer data-footer="plate" className="bg-dark pt-14 text-sm text-dark-muted">
      <Container>
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 pb-11 lg:grid-cols-[1.3fr_repeat(var(--footer-cols),minmax(0,1fr))_1fr] lg:gap-9"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          <Brand settings={settings} tagline={tagline} onDark className="col-span-2 lg:col-span-1" />
          {nav.map((col) => <FooterColumn key={col.heading} col={col} onDark headingClass="normal-case tracking-normal text-14 font-bold text-white" />)}
          <div className="col-span-2 flex flex-col items-start gap-4 lg:col-span-1 lg:items-end">
            {signup && (
              <a href="#newsletter" className="inline-flex h-10 items-center rounded-full bg-brand-600 px-5 text-13-5 font-semibold text-brand-on transition-colors duration-(--duration-base) hover:bg-brand-700">
                Subscribe to our newsletter
              </a>
            )}
            <SocialLinks settings={settings} />
          </div>
        </div>
        {signup && <div id="newsletter"><SignupBand onDark className="border-t border-dark-line py-9" /></div>}
        <BottomRow settings={settings} legal={legal} onDark className="border-t border-dark-line" />
      </Container>
    </footer>
  );
}
