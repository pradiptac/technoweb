import "server-only";
import { ApiError, publicApi } from "@/lib/api";
import type { Paginated, Product, ProductCategory } from "@/types/api";

/**
 * The brief specifies both /products/network-switches (a category) and
 * /products/cisco-cbs350-24t-4g (a product) — one URL segment, two entity
 * types. Next cannot express that with two routes, so a single [slug] route
 * resolves it: a category wins if one exists, otherwise a product.
 *
 * **Both are asked at once.** The first cut tried the category and then the
 * product, so every product page waited a full round trip for a 404 before
 * the fetch that mattered — and a 404 is never stored in Next's data cache,
 * so that was paid on every render. Asked together, the product page's
 * critical path is one round trip and the wasted one overlaps it. The cost
 * is the mirror image on a category page — an uncached product 404 that now
 * runs alongside rather than not at all — which is one cheap query in
 * exchange for a round trip off the more numerous page.
 *
 * Both branches are ISR-cached and Next dedupes identical fetches within a
 * render, so generateMetadata and the page component share one round trip
 * rather than doubling it.
 */
export type Resolved =
  | { kind: "category"; category: ProductCategory; products: Paginated<Product> }
  | { kind: "product"; product: Product }
  | { kind: "none" };

const notFound = (e: unknown) => e instanceof ApiError && e.status === 404;

export async function resolveProductSlug(slug: string, query = ""): Promise<Resolved> {
  const [categoryResult, productResult] = await Promise.allSettled([
    publicApi.productCategory(slug),
    publicApi.product(slug),
  ]);

  // Anything other than a 404 is a real failure and is still thrown, so a
  // dead API fails the build rather than baking a 404 page.
  for (const r of [categoryResult, productResult]) {
    if (r.status === "rejected" && !notFound(r.reason)) throw r.reason;
  }

  if (categoryResult.status === "fulfilled") {
    // A filtered listing is never cached, for the same reason a search is
    // not: ?q= has an unbounded key space, and one visitor's part number
    // would otherwise be served to the next for the whole revalidate window.
    const products = await publicApi.products(
      `?category=${encodeURIComponent(slug)}${query}`,
      !query.includes("q="),
    );
    return { kind: "category", category: categoryResult.value.data, products };
  }

  if (productResult.status === "fulfilled") {
    return { kind: "product", product: productResult.value.data };
  }

  return { kind: "none" };
}
