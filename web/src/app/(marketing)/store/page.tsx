import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { CtaBand } from "@/components/ui/cta-band";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconBox } from "@/components/icons";
import { StoreProductCard } from "@/components/store/product-card";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { Paginated, StoreCategory, StoreProduct } from "@/types/api";

export const metadata = buildMetadata({
  title: "Store",
  description:
    "Buy hardware, licences and services online. All prices include 18% GST — the price shown is the price paid.",
  path: "/store",
});

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;

  const query = new URLSearchParams();
  if (sp.q) query.set("q", sp.q);
  if (sp.category) query.set("category", sp.category);
  if (sp.sort) query.set("sort", sp.sort);
  if (sp.page) query.set("page", sp.page);
  const qs = query.toString();

  let categories: StoreCategory[] = [];
  let products: Paginated<StoreProduct> | null = null;
  let failed = false;

  try {
    [categories, products] = await Promise.all([
      publicApi.storeCategories().then((r) => r.data),
      // Never cached with a search term in it: `?q=` has an unbounded key
      // space, so caching fills the cache with single-use entries and serves a
      // stale empty result for the whole window.
      publicApi.storeProducts(qs ? `?${qs}` : "", !sp.q),
    ]);
  } catch (error) {
    // A build that cannot reach the API fails rather than baking "we could not
    // load the store" into static HTML for Google to crawl.
    if (isPrerendering) throw error;
    failed = true;
  }

  const filtered = Boolean(sp.q || sp.category);

  return (
    <>
      <PageHero
        kicker="Store"
        title="Buy online"
        lede="Hardware, licences and services, bought and paid for here. All prices include 18% GST — what you see is what you pay."
        crumbs={[{ name: "Store", path: "/store" }]}
      />

      <section className="section-y">
        <Container>
          {failed || !products ? (
            <ErrorState title="We could not load the store">
              Try again shortly, or call us and we will take the order over the phone.
            </ErrorState>
          ) : (
            <>
              <form
                action="/store"
                className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line-strong bg-card p-4"
              >
                <div className="min-w-0 flex-1">
                  <label htmlFor="q" className="mb-1 block text-[12.5px] font-semibold text-muted">
                    Search
                  </label>
                  <input
                    id="q"
                    name="q"
                    defaultValue={sp.q}
                    placeholder="Name, part number or brand…"
                    className="w-full rounded border border-line-strong bg-surface px-3 py-2 text-[14px]"
                  />
                </div>

                {categories.length > 0 && (
                  <div>
                    <label htmlFor="category" className="mb-1 block text-[12.5px] font-semibold text-muted">
                      Category
                    </label>
                    <Select id="category" name="category" defaultValue={sp.category ?? ""}>
                      <option value="">Everything</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.slug}>{c.name}</option>
                      ))}
                    </Select>
                  </div>
                )}

                <div>
                  <label htmlFor="sort" className="mb-1 block text-[12.5px] font-semibold text-muted">
                    Sort
                  </label>
                  <Select id="sort" name="sort" defaultValue={sp.sort ?? "featured"}>
                    <option value="featured">Featured</option>
                    <option value="price-low">Price, low to high</option>
                    <option value="price-high">Price, high to low</option>
                    <option value="name">Name</option>
                    <option value="newest">Newest</option>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" size="sm">Apply</Button>
                  {filtered && (
                    <Link
                      href="/store"
                      className="rounded px-3 py-2 text-[13.5px] font-medium text-muted hover:text-ink"
                    >
                      Clear
                    </Link>
                  )}
                </div>
              </form>

              {products.data.length === 0 ? (
                <EmptyState icon={<IconBox />} title={filtered ? "Nothing matches that" : "The store is being set up"}>
                  {filtered
                    ? "Try a different term, or clear the filters."
                    : "There is nothing on sale online yet. Get in touch and we will quote."}
                </EmptyState>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {products.data.map((p) => (
                    <li key={p.id}>
                      {/* h2: the page's h1 is the hero title, and a card
                          heading below it must not skip a level. */}
                      <StoreProductCard product={p} headingLevel={2} />
                    </li>
                  ))}
                </ul>
              )}

              {products.meta && products.meta.last_page > 1 && (
                <nav className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Pages">
                  {Array.from({ length: products.meta.last_page }, (_, i) => i + 1).map((n) => {
                    const page = new URLSearchParams(qs);
                    page.set("page", String(n));

                    return (
                      <Link
                        key={n}
                        href={`/store?${page.toString()}`}
                        aria-current={n === products.meta.current_page ? "page" : undefined}
                        className={`rounded border px-3 py-1.5 text-[13.5px] ${
                          n === products.meta.current_page
                            ? "border-brand-600 bg-brand-600 font-semibold text-white"
                            : "border-line-strong hover:bg-surface-2"
                        }`}
                      >
                        {n}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </>
          )}
        </Container>
      </section>

      <CtaBand
        title="Need something that is not listed?"
        body="Most of what we supply is quoted per project. Tell us what you are building and we will price it."
      />
    </>
  );
}
