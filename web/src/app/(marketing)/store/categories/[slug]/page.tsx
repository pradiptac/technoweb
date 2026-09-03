import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconBox } from "@/components/icons";
import { StoreProductCard } from "@/components/store/product-card";
import { publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import type { Paginated, StoreCategory, StoreProduct } from "@/types/api";

async function load(slug: string): Promise<StoreCategory | null> {
  try {
    return (await publicApi.storeCategory(slug)).data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await load(slug);

  if (!category) return buildMetadata({ title: "Not found", path: `/store/categories/${slug}` });

  return buildMetadata({
    title: category.name,
    description: category.description ?? undefined,
    path: `/store/categories/${category.slug}`,
    seo: category.seo,
  });
}

export default async function StoreCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await load(slug);

  if (!category) notFound();

  let products: Paginated<StoreProduct> | null = null;

  try {
    products = await publicApi.storeProducts(`?category=${encodeURIComponent(slug)}`);
  } catch {
    products = null;
  }

  return (
    <>
      <PageHero
        kicker="Store"
        title={category.name}
        lede={category.description}
        crumbs={[
          { name: "Store", path: "/store" },
          { name: category.name, path: `/store/categories/${category.slug}` },
        ]}
      />

      <section className="section-y">
        <Container>
          {!products ? (
            <ErrorState title="We could not load this category">
              Try again shortly.
            </ErrorState>
          ) : products.data.length === 0 ? (
            <EmptyState icon={<IconBox />} title="Nothing in here yet">
              This category has no products on sale at the moment.
            </EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.data.map((p) => (
                <li key={p.id}>
                  <StoreProductCard product={p} headingLevel={2} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </section>
    </>
  );
}
