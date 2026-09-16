import type { ReactNode } from "react";
import { getSiteSettings } from "@/lib/settings";
import type { BannerSection } from "@/lib/site-settings";
import { activeTheme } from "@/themes";
import type { Crumb } from "@/components/ui/breadcrumbs";

/**
 * `Breadcrumbs` lives in `breadcrumbs.tsx` and is re-exported from here so
 * its six importers keep the path they had; it moved out because a theme's
 * hero template imports it, and a template importing the dispatcher that
 * loads it would be a cycle.
 */
export { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";

/**
 * The heading block every first- and second-level page opens with.
 *
 * A dispatcher since 2026-09-16: the thirty pages that render a hero keep
 * this import, and the active theme decides what a hero *is*. The settings
 * are read here — always, not only for a banner, because the backdrop style
 * is a setting too — and handed down, so a template receives data and
 * returns markup and never fetches on its own. `getSiteSettings` is a tagged
 * fetch Next dedupes within a render, and `activeTheme()` is cached per
 * request, so thirty of these on a page resolve once. Classic's template,
 * with the design notes, is `themes/classic/templates/page-hero.tsx`.
 */
export async function PageHero(props: {
  kicker?: string;
  title: string;
  lede?: string | null;
  crumbs?: Crumb[];
  children?: ReactNode;
  tone?: "light" | "dark";
  /** The area of the site this page belongs to, which decides its banner. */
  section?: BannerSection;
}) {
  const [theme, settings] = await Promise.all([activeTheme(), getSiteSettings()]);
  const Hero = theme.templates.PageHero;

  return <Hero {...props} settings={settings} options={theme.options} />;
}
