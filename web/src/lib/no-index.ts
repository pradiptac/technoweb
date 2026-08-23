import type { Seo } from "@/types/api";

/**
 * Keeps a page out of the index without spelling out every null Seo field at
 * the call site.
 *
 * Two uses. The portal and the admin console are behind a login and hold
 * customer data. And a detail route whose record does not exist: it answers
 * 404, but its generateMetadata has already run and would otherwise emit
 * "index, follow" on a page that does not exist. The status code is what a
 * crawler acts on, but the two should not contradict each other.
 */
export const noIndex: Seo = {
  title: null,
  description: null,
  canonical_url: null,
  robots: "noindex, nofollow",
  focus_keyword: null,
  og_title: null,
  og_description: null,
  og_image: null,
  schema_type: null,
  sitemap_include: false,
};
