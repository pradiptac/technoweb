import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { footerNav } from "@/content/site";

export function SiteFooter() {
  return (
    <footer className="bg-dark pt-[60px] text-sm text-dark-muted">
      <Container>
        <div className="grid gap-9 pb-11 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo onDark className="mb-3.5 block" />
            <p className="max-w-[34ch] leading-relaxed">
              Hardware, network and security infrastructure — designed, deployed and
              supported by engineers since 2009.
            </p>
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
        <div className="flex flex-wrap justify-between gap-3 border-t border-dark-line py-5.5 text-[13px]">
          <span>© {new Date().getFullYear()} Technoware. All rights reserved.</span>
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
