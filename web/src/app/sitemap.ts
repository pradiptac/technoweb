import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { publicApi } from "@/lib/api";

/**
 * Built from the API, not from a hard-coded list — otherwise the sitemap
 * silently drifts the moment an editor adds a solution or renames a slug, and
 * we end up submitting URLs that 404.
 *
 * Records whose SEO settings opt out (`sitemap_include: false`) are excluded.
 * A fetch failure degrades to the static routes rather than emitting an empty
 * sitemap, which search engines treat as "delete everything".
 */
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

const entry = (
  path: string,
  priority: number,
  changeFrequency: Entry["changeFrequency"],
  lastModified: Date = new Date(),
): Entry => ({ url: `${SITE.url}${path}`, lastModified, changeFrequency, priority });

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    entry("/", 1, "weekly"),
    entry("/solutions", 0.9, "monthly"),
    entry("/products", 0.9, "weekly"),
    entry("/services", 0.8, "monthly"),
    entry("/industries", 0.7, "monthly"),
    entry("/resources", 0.7, "weekly"),
    entry("/knowledge-base", 0.7, "weekly"),
    entry("/about", 0.5, "yearly"),
    entry("/contact", 0.6, "yearly"),
  ];

  const included = <T extends { seo?: { sitemap_include: boolean } | null }>(rows: T[]) =>
    rows.filter((r) => r.seo?.sitemap_include !== false);

  try {
    const [solutions, services, industries, categories, products] = await Promise.all([
      publicApi.solutions().then((r) => r.data),
      publicApi.services().then((r) => r.data),
      publicApi.industries().then((r) => r.data),
      publicApi.productCategories().then((r) => r.data),
      publicApi.products("?per_page=60").then((r) => r.data),
    ]);

    return [
      ...staticRoutes,
      ...included(solutions).map((s) => entry(`/solutions/${s.slug}`, 0.8, "monthly")),
      ...included(services).map((s) => entry(`/services/${s.slug}`, 0.7, "monthly")),
      ...included(industries).map((i) => entry(`/industries/${i.slug}`, 0.6, "monthly")),
      ...included(categories).map((c) => entry(`/products/${c.slug}`, 0.7, "weekly")),
      ...included(products).map((p) => entry(`/products/${p.slug}`, 0.6, "weekly")),
    ];
  } catch {
    // Never emit an empty sitemap — a partial one is far less damaging.
    return staticRoutes;
  }
}
