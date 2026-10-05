import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/settings";
import { themeFor } from "@/lib/presets";
import { topBarFor } from "@/lib/themes";
import { brandName } from "@/lib/brand";
import { pwaFor } from "@/lib/pwa";
import { settingEnabled } from "@/lib/site-settings";

/**
 * The web app manifest, built from the settings (2026-10-05, docs/pwa.md).
 *
 * Next serves this at `/manifest.webmanifest` and links it from every page.
 * The colours are the theme's — the browser chrome's tint is the top bar's,
 * the one `generateViewport` already uses, and the splash screen's ground is
 * the page's — so an installed app opens in the palette the site wears.
 *
 * Switched off (`pwa_enabled`), the manifest still answers but says
 * `display: browser`: a browser that installed the site keeps a shortcut
 * that opens a tab, and nothing offers to install it again. The service
 * worker is unregistered by the page itself (`components/pwa/pwa-register.tsx`).
 *
 * `start_url` carries `?source=pwa` so the analytics can tell an installed
 * launch from a visit; it is a query string on the homepage, which is
 * cached and indexed without it — the canonical never carries it.
 */
export const revalidate = 600;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSiteSettings().catch(() => ({}) as Awaited<ReturnType<typeof getSiteSettings>>);
  const theme = themeFor(settings);
  const pwa = pwaFor(settings, brandName());
  const v = encodeURIComponent((settings.pwa_icon_path ?? "drawn") + (theme.colors.brand600 ?? ""));

  return {
    id: "/",
    name: pwa.name,
    short_name: pwa.shortName,
    description: settings.tagline ?? settings.hero_lede ?? `${pwa.name} — technology infrastructure that keeps your business connected.`,
    start_url: "/?source=pwa",
    scope: "/",
    display: pwa.enabled ? "standalone" : "browser",
    display_override: pwa.enabled ? ["standalone", "minimal-ui"] : ["browser"],
    orientation: "any",
    theme_color: topBarFor(theme, "light").bar,
    background_color: theme.colors.page,
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: `/pwa-icon/192?v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa-icon/512?v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/pwa-icon/512?maskable=1&v=${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Contact us", short_name: "Contact", url: "/contact?source=pwa" },
      { name: "Support", short_name: "Support", url: "/support?source=pwa" },
      // Only while the shop is open — a shortcut to a closed shop is a 404 on the home screen.
      ...(settingEnabled(settings, "store_enabled", true) ? [{ name: "Shop", short_name: "Shop", url: "/store?source=pwa" }] : []),
    ],
  };
}
