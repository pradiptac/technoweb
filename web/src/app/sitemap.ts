import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { publicApi } from "@/lib/api";
import type { Paginated } from "@/types/api";

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

/**
 * Walks a paginated endpoint to the end.
 *
 * A single request with a large `per_page` looks like it works and quietly
 * stops at whatever cap the API applies — a sitemap that omits the tail of
 * the catalogue is worse than one that is obviously broken, because nothing
 * reports it. Capped at 20 rounds so a paginator that never advances cannot
 * spin here.
 */
async function all<T>(
  fetchPage: (query: string) => Promise<Paginated<T>>,
  perPage = 100,
): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  for (let guard = 0; guard < 20; guard++) {
    const res = await fetchPage(`?per_page=${perPage}&page=${page}`);
    rows.push(...res.data);
    const last = res.meta?.last_page ?? 1;
    if (page >= last) break;
    page += 1;
  }
  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    entry("/", 1, "weekly"),
    entry("/solutions", 0.9, "monthly"),
    entry("/products", 0.9, "weekly"),
    entry("/services", 0.8, "monthly"),
    entry("/industries", 0.7, "monthly"),
    entry("/resources", 0.7, "weekly"),
    entry("/knowledge-base", 0.7, "weekly"),
    // Live, linked from the footer and the homepage, and absent from this
    // list until now — along with every post, article and case study.
    entry("/blog", 0.7, "weekly"),
    entry("/case-studies", 0.7, "monthly"),
    entry("/support", 0.6, "monthly"),
    entry("/about", 0.5, "yearly"),
    entry("/contact", 0.6, "yearly"),
    entry("/careers", 0.6, "weekly"),
    entry("/brands", 0.6, "monthly"),
    entry("/locations", 0.6, "monthly"),
    // The shop. Absent from this list until now, along with every product and
    // category in it — a catalogue that sells things and that Google could not
    // enumerate.
    entry("/store", 0.8, "weekly"),
  ];

  const included = <T extends { seo?: { sitemap_include: boolean } | null }>(rows: T[]) =>
    rows.filter((r) => r.seo?.sitemap_include !== false);

  const when = (iso?: string | null) => (iso ? new Date(iso) : new Date());

  try {
    const [
      solutions, services, industries, categories, products,
      posts, articles, caseStudies, pages, careers,
      storeProducts, storeCategories, taxonomy,
    ] = await Promise.all([
      publicApi.solutions().then((r) => r.data),
      publicApi.services().then((r) => r.data),
      publicApi.industries().then((r) => r.data),
      publicApi.productCategories().then((r) => r.data),
      all((q) => publicApi.products(q)),
      all((q) => publicApi.posts(q)),
      all((q) => publicApi.knowledgeArticles(q)),
      publicApi.caseStudies().then((r) => r.data),
      publicApi.pages().then((r) => r.data),
      // Only the open ones: the endpoint already drops anything past its
      // closing date, so a closed role leaves the sitemap without anybody
      // remembering to take it out.
      publicApi.careers().then((r) => r.data),
      /*
       * The shop's own catalogue, which is a different table from `/products`
       * and was in neither this file nor the site-wide search.
       *
       * `all()` pages through it the way the marketing catalogue is paged: a
       * shop that outgrows one page of results should not quietly stop being
       * indexed at whatever the default `per_page` happens to be.
       */
      all((q) => publicApi.storeProducts(q)),
      publicApi.storeCategories().then((r) => r.data),
      // Blog categories are real, indexable, linked-to pages with their own
      // canonical — `/blog/category/{slug}` — and were unlisted too.
      publicApi.blogTaxonomy().then((r) => r.data),
    ]);

    /*
     * Programmatic landing pages.
     *
     * The endpoint returns published pages only, and a page is published only
     * once it has cleared `LandingPageQuality` — so there is nothing to filter
     * here and nothing thin can reach the sitemap. That is the point of putting
     * the gate on publication rather than on the sitemap: two places deciding
     * what is fit to index would eventually disagree, and the one that got it
     * wrong would be this one.
     */
    const landing = await publicApi.landingPages().then((r) => r.data).catch(() => []);

    return [
      ...staticRoutes,
      ...included(solutions).map((s) => entry(`/solutions/${s.slug}`, 0.8, "monthly")),
      ...included(services).map((s) => entry(`/services/${s.slug}`, 0.7, "monthly")),
      ...included(industries).map((i) => entry(`/industries/${i.slug}`, 0.6, "monthly")),
      ...included(categories).map((c) => entry(`/products/${c.slug}`, 0.7, "weekly")),
      ...included(products).map((p) => entry(`/products/${p.slug}`, 0.6, "weekly")),
      ...included(posts).map((p) => entry(`/blog/${p.slug}`, 0.6, "monthly", when(p.published_at))),
      ...included(articles).map((a) => entry(`/knowledge-base/${a.slug}`, 0.6, "monthly", when(a.published_at))),
      ...included(caseStudies).map((c) => entry(`/case-studies/${c.slug}`, 0.6, "yearly")),
      ...careers.map((j) => entry(`/careers/${j.slug}`, 0.6, "weekly", when(j.published_at))),
      /*
       * The store. No `included()` filter: `store_products` carries no SEO
       * override row, so there is no `sitemap_include` to honour — publication
       * is the only switch, and the endpoint already applies it.
       */
      ...storeCategories.map((c) => entry(`/store/categories/${c.slug}`, 0.7, "weekly")),
      ...storeProducts.map((p) => entry(`/store/products/${p.slug}`, 0.7, "weekly")),
      ...taxonomy.categories.map((c) => entry(`/blog/category/${c.slug}`, 0.5, "weekly")),
      ...landing.map((l) => entry(l.path, 0.6, "monthly", when(l.updated_at))),
      // /privacy, /terms, /downloads and anything else an editor publishes.
      ...included(pages).map((p) => entry(`/${p.slug}`, 0.4, "yearly", when(p.updated_at))),
    ];
  } catch {
    // Never emit an empty sitemap — a partial one is far less damaging.
    return staticRoutes;
  }
}
