import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconBox } from "@/components/icons";
import { CategorySidebar } from "@/components/store/category-sidebar";
import { CategoryRail } from "@/components/store/category-rail";
import { CompactProductCard } from "@/components/store/compact-product-card";
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

  let categories: StoreCategory[] = [];
  let products: Paginated<StoreProduct> | null = null;

  try {
    [categories, products] = await Promise.all([
      publicApi.storeCategories().then((r) => r.data),
      publicApi.storeProducts(`?category=${encodeURIComponent(slug)}`),
    ]);
  } catch {
    products = null;
  }

  return (
    <section className="section-y">
      <Container>
        <Breadcrumbs
          crumbs={[
            { name: "Store", path: "/store" },
            { name: category.name, path: `/store/categories/${category.slug}` },
          ]}
        />

        <h1 className="display-2 mt-3">{category.name}</h1>
        {category.description && (
          <p className="lede mt-2 measure">{category.description}</p>
        )}

        {/* Below `lg`, the vertical sidebar has no room — the same category
            data instead renders as the horizontal rail. */}
        <div className="mt-8 lg:hidden">
          <CategoryRail categories={categories} />
        </div>

        <div className="mt-8 flex gap-8">
          <aside className="hidden w-56 shrink-0 lg:block">
            <CategorySidebar categories={categories} active={category.slug} />
          </aside>

          <div className="min-w-0 flex-1">
            {!products ? (
              <ErrorState title="We could not load this category">
                Try again shortly.
              </ErrorState>
            ) : products.data.length === 0 ? (
              <EmptyState icon={<IconBox />} title="Nothing in here yet">
                This category has no products on sale at the moment.
              </EmptyState>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {products.data.map((p, i) => (
                  <li key={p.id}>
                    {/*
                      The whole first row, not just the first card. With the
                      images covering their wells they are large enough that
                      any of the top row can win the Largest Contentful Paint,
                      and Next warns — and the audit fails — when that element
                      was lazy. Four is the widest the grid goes before `2xl`.
                    */}
                    <CompactProductCard product={p} priority={i < 4} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
