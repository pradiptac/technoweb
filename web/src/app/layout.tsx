import type { Metadata, Viewport } from "next";
import { inter, instrument, jetbrains } from "@/lib/fonts";
import { Reveal } from "@/components/ui/reveal";
import { SITE } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import "./globals.css";

const metadata: Metadata = {
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

/**
 * The favicon comes from Settings when one is uploaded.
 *
 * generateMetadata rather than the static export, because the value lives in
 * the database. A failed read falls through to the bundled app/favicon.ico
 * rather than leaving the tab iconless.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  return settings.favicon_url
    ? { ...metadata, icons: { icon: settings.favicon_url, shortcut: settings.favicon_url, apple: settings.favicon_url } }
    : metadata;
}

export const viewport: Viewport = {
  themeColor: "#12140d",
  width: "device-width",
  initialScale: 1,
};

/**
 * Owns the document and nothing else.
 *
 * The marketing header and footer live in (marketing)/layout.tsx rather than
 * here: they were wrapping every route, so the public mega menu and footer
 * rendered above and below the admin console and the customer portal too.
 * Each area now brings its own chrome and its own <main> landmark.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-100 focus:rounded focus:bg-ink focus:px-4 focus:py-2.5 focus:text-white"
        >
          Skip to content
        </a>
        {children}
        {/* Renders nothing — owns the scroll-reveal observer. A no-op on
            trees with no data-aos attributes (portal, admin). */}
        <Reveal />
      </body>
    </html>
  );
}
