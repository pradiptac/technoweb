import type { Metadata, Viewport } from "next";
import { ALL_FONT_VARIABLES } from "@/lib/fonts";
import { themeById, themeCss } from "@/lib/themes";
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
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The chosen theme, or the default when the setting is unset, unknown, or
  // the settings read fails. A site that loses its palette because an API call
  // timed out would be a worse failure than any theme.
  const settings = await getSiteSettings().catch(() => ({}) as Awaited<ReturnType<typeof getSiteSettings>>);
  const theme = themeById(settings.theme);

  return (
    <html lang="en" className={ALL_FONT_VARIABLES}>
      <head>
        {/*
          The theme's tokens, inline in the head.

          Inline rather than a stylesheet link because it must arrive with the
          first byte — a palette that swaps once a second file lands is a
          visible flash of the wrong brand on every cold load. It is a fixed
          set of custom properties built from a whitelisted theme id, so
          nothing an editor types reaches this element.
        */}
        <style id="theme-tokens" dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
      </head>
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
