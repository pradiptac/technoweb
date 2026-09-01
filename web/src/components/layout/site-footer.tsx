import Link from "next/link";
import type { CSSProperties } from "react";
import { SchemeToggle } from "@/components/ui/scheme-toggle";
import { CreditLine } from "@/components/layout/credit-line";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { footerNav } from "@/content/site";
import { SocialLinks } from "@/components/layout/social-links";
import { settingEnabled, telHref, type SiteSettings } from "@/lib/site-settings";
import { NewsletterSignup } from "@/components/layout/newsletter-signup";

export function SiteFooter({
  settings = {}, columns,
}: {
  settings?: SiteSettings;
  /*
    The columns, when a menu has been assigned to the footer in the console.
    Absent means the built-in ones — the same fallback the header uses, and the
    reason assigning a menu is an editorial act rather than a deploy.
  */
  columns?: { heading: string; href: string; links: { label: string; href: string; newTab: boolean }[] }[];
}) {
  const nav = columns ?? footerNav.map((col) => ({
    heading: col.heading,
    href: "",
    links: col.links.map((l) => ({ label: l.label, href: l.href, newTab: false })),
  }));

  return (
    <footer className="bg-dark pt-[60px] text-sm text-dark-muted">
      <Container>
        {/*
          The brand column plus one track per nav column, generated rather than
          spelled out — the count changed the moment Company was added, and a
          hand-written template is one that disagrees with `footerNav` the next
          time somebody edits it. The brand column keeps its extra width
          because it carries the address, the phone number and the social row.
        */}
        {/*
          The signup is a band across the top, not a widget in the brand column.

          In the column it had about 270px — narrow enough that the input clipped
          `you@company.com` before anybody had typed, and narrow enough that the
          form had to stack, which made the brand column a tall stack of
          unrelated blocks while a third of the footer's width sat empty beneath
          the short link columns. Across the top it has the room it needs, the
          brand column becomes a coherent identity block, and the two problems
          turn out to have been one.

          Gated on the setting rather than always drawn.
          `newsletter_signup_enabled` is the one key published out of an
          otherwise private group, for exactly this: a form that renders and then
          answers 403 is worse than no form. Read through `settingEnabled`,
          because settings are strings and `"0"` is truthy in JavaScript.
        */}
        {settingEnabled(settings, "newsletter_signup_enabled", false) && (
          <section className="mb-10 grid gap-x-10 gap-y-4 border-b border-dark-line pb-9 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-start">
            <div className="min-w-0">
              <h2 className="font-display text-[19px] font-semibold text-white">
                Occasional notes on infrastructure
              </h2>
              <p className="measure mt-1.5 leading-relaxed">
                What we have been building, what broke, and what we would do differently. No more
                than once a month.
              </p>
            </div>

            <NewsletterSignup onDark />
          </section>
        )}

        <div className="grid gap-9 pb-11 lg:grid-cols-[1.4fr_repeat(var(--footer-cols),minmax(0,1fr))]"
          style={{ "--footer-cols": nav.length } as CSSProperties}>
          <div>
            <Logo
              onDark
              className="mb-3.5 block"
              logoUrl={settings.logo_url}
              logoWidth={settings.logo_width}
              logoHeight={settings.logo_height}
              companyName={settings.company_name}
            />
            <p className="max-w-[34ch] leading-relaxed">
              {settings.tagline ??
                "Hardware, network and security infrastructure — designed, deployed and supported by engineers."}
            </p>

            {/*
              The signup, gated on the setting rather than always drawn.

              `newsletter_signup_enabled` is the one key published out of an
              otherwise private group, for exactly this: a form that renders and
              then answers 403 is worse than no form. Read through
              `settingEnabled`, because settings are strings and `"0"` is truthy
              in JavaScript.
            */}
            {(settings.address || settings.phone) && (
              /*
                No rule above it and no heading over the address.

                With the signup moved out, this column is three short blocks —
                who we are, where we are, where else to find us — and a hairline
                between each made an identity block read as a stack of separate
                widgets. Space is enough separation for three things.
              */
              <section className="mt-5 max-w-[34ch]">
                <address className="not-italic leading-relaxed">
                  {/* Kept as typed: an address is line-broken by whoever wrote
                      it, and re-flowing it loses the shape of it. */}
                  {settings.address && <span className="block whitespace-pre-line">{settings.address}</span>}
                  {settings.phone && (
                    <a
                      href={telHref(settings.phone)}
                      className="mt-2 inline-block font-mono text-[14px] transition-colors hover:text-white"
                    >
                      {/* `font-mono`, the rule this project holds for data: a
                          telephone number is read digit by digit and dialled,
                          not read as prose. */}
                      {settings.phone}
                    </a>
                  )}
                </address>
              </section>
            )}

            <SocialLinks settings={settings} />
          </div>
          {nav.map((col) => (
            <div key={col.heading}>
              {/*
                A configured column's heading is itself a link — the top-level
                item is a real destination in a menu, unlike the built-in
                columns whose headings are only labels. Rendered as a heading
                either way, so the footer's landmark structure does not depend
                on which source it came from.
              */}
              <h2 className="mb-4 font-display text-xs font-semibold uppercase tracking-[.11em] text-white">
                {col.href
                  ? <Link href={col.href} className="hover:underline">{col.heading}</Link>
                  : col.heading}
              </h2>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href} className="mb-2.5">
                    <Link
                      href={l.href}
                      target={l.newTab ? "_blank" : undefined}
                      rel={l.newTab ? "noopener noreferrer" : undefined}
                      className="transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-3 border-t border-dark-line py-5.5 text-[13px]">
          <CreditLine
            companyName={settings.company_name ?? "Technoware"}
            linkClassName="font-medium text-dark-ink hover:text-white hover:underline"
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ul className="flex flex-wrap gap-5">
              <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
              <li><Link href="/sitemap.xml" className="hover:text-white">Sitemap</Link></li>
            </ul>
            {/*
              The site's own scheme control, independent of the console's.
              In the footer rather than the header: it is a preference somebody
              sets once, not a thing they reach for, and the header is already
              carrying a mega menu, a search field and the primary CTA.
            */}
            <SchemeToggle area="site" onDark />
          </div>
        </div>
      </Container>
    </footer>
  );
}
