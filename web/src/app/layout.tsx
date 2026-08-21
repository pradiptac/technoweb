import type { Metadata, Viewport } from "next";
import { inter, instrument, jetbrains } from "@/lib/fonts";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Reveal } from "@/components/ui/reveal";
import { getMegaMenu } from "@/lib/navigation";
import { getSiteSettings } from "@/lib/settings";
import { JsonLd, SITE, jsonLd } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Technoware — Technology infrastructure that keeps your business connected",
    template: "%s | Technoware",
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.name }],
  openGraph: { type: "website", siteName: SITE.name, locale: SITE.locale, url: SITE.url },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#12140d",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once here rather than per page: the header is in every response, and
  // these four reads are ISR-cached so this costs a revalidation, not a fetch.
  const [menu, settings] = await Promise.all([getMegaMenu(), getSiteSettings()]);

  return (
    <html lang="en" className={`${inter.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-100 focus:rounded focus:bg-ink focus:px-4 focus:py-2.5 focus:text-white"
        >
          Skip to content
        </a>
        <SiteHeader menu={menu} />
        <main id="main">{children}</main>
        <SiteFooter settings={settings} />
        {/* Renders nothing — owns the scroll-reveal observer. A no-op on
            trees with no data-aos attributes (portal, admin). */}
        <Reveal />
        <JsonLd data={[jsonLd.organization(), jsonLd.website()]} />
      </body>
    </html>
  );
}
