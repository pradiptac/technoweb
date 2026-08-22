import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { footerNav } from "@/content/site";
import { SocialLinks } from "@/components/layout/social-links";
import { telHref, type SiteSettings } from "@/lib/site-settings";

export function SiteFooter({ settings = {} }: { settings?: SiteSettings }) {
  return (
    <footer className="bg-dark pt-[60px] text-sm text-dark-muted">
      <Container>
        <div className="grid gap-9 pb-11 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo onDark className="mb-3.5 block" logoUrl={settings.logo_url} companyName={settings.company_name} />
            <p className="max-w-[34ch] leading-relaxed">
              {settings.tagline ??
                "Hardware, network and security infrastructure — designed, deployed and supported by engineers."}
            </p>

            {(settings.address || settings.phone) && (
              <address className="mt-4 not-italic leading-relaxed">
                {/* Kept as typed: an address is line-broken by whoever wrote
                    it, and re-flowing it loses the shape of it. */}
                {settings.address && <span className="block whitespace-pre-line">{settings.address}</span>}
                {settings.phone && (
                  <a href={telHref(settings.phone)} className="mt-2 inline-block transition-colors hover:text-white">
                    {settings.phone}
                  </a>
                )}
              </address>
            )}

            <SocialLinks settings={settings} />
          </div>
          {footerNav.map((col) => (
            <div key={col.heading}>
              <h2 className="mb-4 font-display text-xs font-semibold uppercase tracking-[.11em] text-white">
                {col.heading}
              </h2>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href} className="mb-2.5">
                    <Link href={l.href} className="transition-colors hover:text-white">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-3 border-t border-dark-line py-5.5 text-[13px]">
          <span>
            © {new Date().getFullYear()} {settings.company_name ?? "Technoware"}. All rights reserved.
            {" · "}
            Developed by{" "}
            {/* Leaves the site, so it opens away from it and does not hand the
                opener a window handle back. */}
            <a
              href="https://www.altisinfonet.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-dark-ink hover:text-white hover:underline"
            >
              Altis Infonet Private Limited
            </a>
          </span>
          <ul className="flex flex-wrap gap-5">
            <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
            <li><Link href="/sitemap.xml" className="hover:text-white">Sitemap</Link></li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
