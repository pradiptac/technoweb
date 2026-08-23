import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { NotFoundContent } from "@/components/layout/not-found-content";
import { getMegaMenu } from "@/lib/navigation";
import { getSiteSettings } from "@/lib/settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({
  title: "Page not found",
  path: "/404",
  seo: noIndex,
});

/**
 * The last-resort 404: a path that matches no route at all, such as
 * /a/b/c. Most 404s do not land here — an unknown single-segment path
 * matches (marketing)/[slug], so it renders that group's not-found inside the
 * marketing layout instead.
 *
 * This one sits above every route group, so there is no layout to inherit
 * chrome from and it has to bring its own. That is the same reason the admin
 * console and the portal each supply their own: the root layout stopped
 * rendering the public header and footer when they were scoped to
 * (marketing), so nothing here is wrapped in them by default.
 */
export default async function NotFound() {
  const [menu, settings] = await Promise.all([getMegaMenu(), getSiteSettings()]);

  return (
    <>
      <SiteHeader menu={menu} settings={settings} />
      <main id="main">
        <NotFoundContent />
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
