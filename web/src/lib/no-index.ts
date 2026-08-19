import type { Seo } from "@/types/api";

/**
 * Portal pages must never be indexed — they are behind a login and contain
 * customer-specific data. Passing this into buildMetadata() sets the robots
 * directive without having to spell out every null field at each call site.
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
