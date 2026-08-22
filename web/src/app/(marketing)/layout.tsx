import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getMegaMenu } from "@/lib/navigation";
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
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Read once here rather than per page: the header is in every public
  // response, and both reads are ISR-cached so this costs a revalidation
  // rather than a round trip.
  const [menu, settings] = await Promise.all([getMegaMenu(), getSiteSettings()]);

  return (
    <>
      <SiteHeader menu={menu} settings={settings} />
      <main id="main">{children}</main>
      <SiteFooter settings={settings} />
      <JsonLd data={[jsonLd.organization(settings), jsonLd.website()]} />
    </>
  );
}
