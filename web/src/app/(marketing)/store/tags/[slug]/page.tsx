import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Prose } from "@/components/ui/prose";
import { EmptyState } from "@/components/ui/empty";
import { IconBox } from "@/components/icons";
import { CompactProductCard } from "@/components/store/compact-product-card";
import { StoreFilterBar } from "@/components/store/store-filter-bar";
import { publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import type { Paginated, StoreCategory, StoreProduct } from "@/types/api";
import type { StoreTagPage } from "@/types/store-tags";

async function load(slug: string): Promise<StoreTagPage | null> {
  try {
    return (await publicApi.storeTag(slug)).data;
  } catch {
    return null;
  }
}

/*
 * Empty on purpose, and the export itself is the feature — see
 * `categories/[slug]`. Nothing here reads a cookie, a header or
 * `searchParams`: every read is an ISR-tagged store fetch (`store-tags`,
 * `store-tag:<slug>`, `store-products`), so a `?page=` is not honoured — the
 * grid is the first page and a link carries the rest to `/store?tag=`, the
 * dynamic listing. A request-time API here would be a 500, not a fallback.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tag = await load(slug);

  if (!tag) return buildMetadata({ title: "Not found", path: `/store/tags/${slug}` });

  return buildMetadata({
    title: tag.heading || tag.name,
    path: `/store/tags/${tag.slug}`,
    // Under three published products the page is a stub: listed for people,
    // not for search engines — and out of the sitemap (`sitemap.ts`).
    seo: tag.seo && !tag.indexable && !/noindex/i.test(tag.seo.robots ?? "")
      ? { ...tag.seo, robots: "noindex, follow" }
      : tag.seo,
  });
}

export default async function StoreTagLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tag = await load(slug);

  if (!tag) notFound();

  let categories: StoreCategory[] = [];
  let products: Paginated<StoreProduct> | null = null;

  try {
    [categories, products] = await Promise.all([
      publicApi.storeCategories().then((r) => r.data),
      publicApi.storeProducts(`?tag=${encodeURIComponent(slug)}`),
    ]);
  } catch {
    products = null;
  }

  const title = tag.heading || tag.name;
  const more = products && products.meta.total > products.data.length;

  return (
    <>
      <PageHero
        section="store"
        kicker="Store"
        title={title}
        crumbs={[
          { name: "Store", path: "/store" },
          { name: tag.name, path: `/store/tags/${tag.slug}` },
        ]}
      />

      {/* Like every page under /store, this one renders the shop's bar itself — see `categories/layout.tsx`. */}
      <Container data-hero-gap="keep" className="section-y pt-3">
        <StoreFilterBar categories={categories} tag={tag.slug} />

        {tag.intro && <Prose html={tag.intro} className="mb-8" />}

        {!products ? (
          <EmptyState icon={<IconBox />} title="We could not load these products">
            Try again shortly.
          </EmptyState>
        ) : products.data.length === 0 ? (
          <EmptyState icon={<IconBox />} title="Nothing here yet">
            No products with this tag are on sale at the moment.
          </EmptyState>
        ) : (
          <ul data-collection="products" data-cols="6" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {products.data.map((p, i) => (
              <li key={p.id}>
                <CompactProductCard product={p} priority={i < 4} />
              </li>
            ))}
          </ul>
        )}

        {more && products && (
          <p className="mt-8 text-center">
            <Link href={`/store?tag=${encodeURIComponent(tag.slug)}`} className="font-semibold text-brand-ink hover:text-secondary-ink">
              See all {products.meta.total} products tagged {tag.name}
            </Link>
          </p>
        )}
      </Container>

      {tag.schema && <JsonLd data={tag.schema} />}
    </>
  );
}
