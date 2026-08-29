import type { Metadata } from "next";
import { Analytics } from "@/components/layout/analytics";
import { CookieConsent } from "@/components/layout/cookie-consent";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getFooterNav, getMegaMenu, getPrimaryNav } from "@/lib/navigation";
import { getSiteSettings } from "@/lib/settings";
import { JsonLd, jsonLd } from "@/lib/seo";

/**
 * The public site's chrome.
 *
 * This used to sit in the root layout, which meant the mega menu and the
 * footer rendered around the admin console and the customer portal as well —
 * two signed-in areas showing a marketing nav they have no use for. Scoping
 * it to this route group is what keeps it off them.
 *
 * The Organization and WebSite structured data belongs here for the same
 * reason: it describes the public site, and the admin is noindex.
 */
/**
 * Search-console and Meta domain verification tags.
 *
 * On this layout rather than the root so they appear on the public site only
 * — there is nothing to verify about the admin console, and pages here do not
 * set `verification` themselves, so the layout value survives the merge.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const google = settings.google_site_verification?.trim();
  const meta = settings.meta_domain_verification?.trim();

  if (!google && !meta) return {};

  return {
    verification: {
      ...(google ? { google } : {}),
      ...(meta ? { other: { "facebook-domain-verification": meta } } : {}),
    },
  };
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Read once here rather than per page: the header is in every public
  // response, and both reads are ISR-cached so this costs a revalidation
  // rather than a round trip.
  /*
    Four reads, all ISR-cached, so this costs a revalidation rather than a
    round trip per page.

    `primary` and `footer` are null unless a menu has been assigned in the
    console, and null means "use the navigation built into the site" — which is
    what makes menus additive rather than a migration. The mega menu is still
    fetched either way: a configured menu supplies its own panels, and the
    built-in header needs the CMS-driven ones.
  */
  const [menu, settings, primary, footerMenu] = await Promise.all([
    getMegaMenu(), getSiteSettings(), getPrimaryNav(), getFooterNav(),
  ]);

  return (
    // `public-site` is what scopes the 12px type floor in globals.css to the
    // marketing site. The console keeps its denser scale: it is a tool used
    // at a desk all day, where a 10.5px status chip is legible and the extra
    // rows it buys are the point. A visitor is anyone, on anything.
    <div className="public-site">
      <SiteHeader menu={primary ? primary.sections : menu} settings={settings} links={primary?.links} />
      <main id="main">{children}</main>
      <SiteFooter settings={settings} columns={footerMenu ?? undefined} />
      <JsonLd data={[jsonLd.organization(settings), jsonLd.website()]} />
      <Analytics settings={settings} />
      {/* Only asked when there is something to ask about: with no analytics
          ID configured, no cookie is ever set and a banner would be theatre. */}
      {settings.cookie_consent_enabled === "1"
        && (settings.google_analytics_id || settings.google_tag_manager_id || settings.meta_pixel_id)
        && <CookieConsent settings={settings} />}
    </div>
  );
}
