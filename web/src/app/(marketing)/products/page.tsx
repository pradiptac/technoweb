import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import {
  IdentityIcon, IconServer } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import { ProductGrid } from "./product-grid";
import { CatalogueFilters } from "./catalogue-filters";
import type { Brand, Paginated, Product, ProductCategory } from "@/types/api";

export const metadata = buildMetadata({
  title: "Products",
  description:
    "Servers, switches, routers, firewalls, Wi-Fi, storage, UPS and surveillance hardware — every line supported by the engineers who install it.",
  path: "/products",
});

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brand?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;

  const query = new URLSearchParams();
  if (sp.q) query.set("q", sp.q);
  if (sp.brand) query.set("brand", sp.brand);
  if (sp.sort) query.set("sort", sp.sort);
  if (sp.page) query.set("page", sp.page);
  const qs = query.toString();

  let categories: ProductCategory[] = [];
  let brands: Brand[] = [];
  let products: Paginated<Product> | null = null;
  let failed = false;

  try {
    [categories, brands, products] = await Promise.all([
      publicApi.productCategories().then((r) => r.data),
      publicApi.brands().then((r) => r.data),
      publicApi.products(qs ? `?${qs}` : "", !sp.q),
    ]);
  } catch (error) {
    if (isPrerendering) throw error;
    failed = true;
  }

  const searching = Boolean(sp.q || sp.brand);

  return (
    <>
      <PageHero
        kicker="Products"
        title="A catalogue backed by people who install it."
        lede="Every line we carry is hardware our engineers deploy and support in the field. Browse it, then ask us what actually fits — we would rather specify correctly than sell twice."
        crumbs={[{ name: "Products", path: "/products" }]}
      />

      <Container data-aos="fade-up" className="py-16 lg:py-20">
        {failed ? (
          <ErrorState title="We could not load the catalogue">
            Refresh in a moment, or call us with what you are looking for.
          </ErrorState>
        ) : (
          <>
            {!searching && categories.length > 0 && (
              <section data-aos="fade-up" className="mb-14">
                <h2 className="display-3 mb-6">Browse by category</h2>
                <div className="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
                  {categories.map((c) => {
                    return (
                      <Link
                        key={c.id}
                        href={`/products/${c.slug}`}
                        className="flex items-center gap-3.5 rounded border border-line-strong bg-card px-4 py-4 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-brand-ink">
                          <IdentityIcon name={c.icon} fallback="server" className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14.5px] font-semibold leading-tight text-ink">
                            {c.name}
                            {typeof c.product_count === "number" && (
                              <span className="ml-1.5 font-normal text-muted">({c.product_count})</span>
                            )}
                          </span>
                          {c.description && <span className="text-[12.5px] text-muted">{c.description}</span>}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h2 className="display-3 mb-6">
                {searching ? `Results${sp.q ? ` for “${sp.q}”` : ""}` : "All products"}
              </h2>

              <CatalogueFilters action="/products" brands={brands} total={products?.meta.total ?? 0} />

              {products && products.data.length > 0 ? (
                <ProductGrid page={products} basePath="/products" params={sp} />
              ) : (
                <EmptyState
                  icon={<IconServer />}
                  title="Nothing matched"
                  action={
                    <Link
                      href="/products"
                      className="rounded border border-line-strong bg-card px-4 py-[11px] text-[13.5px] font-semibold hover:border-faint"
                    >
                      Clear filters
                    </Link>
                  }
                >
                  The catalogue is still being populated. Tell us the model you are after and
                  we will source it.
                </EmptyState>
              )}
            </section>
          </>
        )}
      </Container>

      <CtaBand
        title="Not sure which model fits?"
        body="Send us the site size and what it has to do. We will come back with a specification and the reasoning behind it, not a price list."
      />
    </>
  );
}
