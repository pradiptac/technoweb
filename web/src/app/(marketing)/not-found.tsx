import { NotFoundContent } from "@/components/layout/not-found-content";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({
  title: "Page not found",
  path: "/404",
  seo: noIndex,
});

/**
 * The 404 for anything inside the public site — which is most of them, since
 * an unknown top-level path matches the CMS page route at (marketing)/[slug]
 * and that calls notFound() when the API has no such page.
 *
 * Header and footer come from the marketing layout, so this file is only the
 * body. The root app/not-found.tsx has to supply its own chrome; see there.
 */
export default function MarketingNotFound() {
  return <NotFoundContent />;
}
