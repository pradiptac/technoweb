import "server-only";
import { ApiError, publicApi } from "@/lib/api";
import type { Paginated, Product, ProductCategory } from "@/types/api";

/**
 * The brief specifies both /products/network-switches (a category) and
 * /products/cisco-cbs350-24t-4g (a product) — one URL segment, two entity
 * types. Next cannot express that with two routes, so a single [slug] route
 * resolves it: category first, then product.
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
  try {
    const category = (await publicApi.productCategory(slug)).data;
    const products = await publicApi.products(`?category=${encodeURIComponent(slug)}${query}`);
    return { kind: "category", category, products };
  } catch (error) {
    if (!notFound(error)) throw error;
  }

  try {
    const product = (await publicApi.product(slug)).data;
    return { kind: "product", product };
  } catch (error) {
    if (!notFound(error)) throw error;
  }

  return { kind: "none" };
}
