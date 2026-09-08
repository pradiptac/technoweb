import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconBox } from "@/components/icons";
import { CategorySidebar } from "@/components/store/category-sidebar";
import { CategoryRail } from "@/components/store/category-rail";
import { CompactProductCard } from "@/components/store/compact-product-card";
import { StoreFilterBar } from "@/components/store/store-filter-bar";
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
    <>
      {/*
        The section banner, like every other second-level page.

        This screen used to hand-roll its heading — breadcrumbs, an `h1` and a
        lede — on the argument that a category is reached mid-browse rather
        than landed on cold, so it wanted a slim header rather than a hero.
        That was a reasonable call about *height* and it made this the one
        second-level page in the product with no banner and its own copy of
        markup `PageHero` already owns, including the `BreadcrumbList` the
        component emits alongside the visible trail.
      */}
      <PageHero
        section="store"
        kicker="Store"
        title={category.name}
        lede={category.description}
        crumbs={[
          { name: "Store", path: "/store" },
          { name: category.name, path: `/store/categories/${category.slug}` },
        ]}
      />

      {/*
        The shop's control strip, directly under the banner.

        It replaces `BasketBar`, which this segment used to get from its layout:
        a row reading "Store · All prices include 18% GST" with the basket at
        the far end. That strip had **no search on it**, so somebody inside a
        category who wanted a part number had to go back to the shop's front
        page to type one — two bars across one shop, and the useful one was on
        the other half of it.

        `category={category.slug}` preselects this category, and the form
        submits to `/store`: this page's own loader takes a slug and nothing
        else, so pointing it here would render a search box that discards what
        was typed into it. Searching from a category therefore lands on the
        shop's listing with the category still selected — the same set,
        narrowed, and the select says so.

        **It shares this `Container` with the listing, and that is what makes
        the docking work at all.** A sticky element travels only inside its own
        containing block, so the first cut — the bar in a `Container` of its own
        above the content's — could stick for exactly its own height and then
        scrolled away with the page: `position: sticky` computed correctly and
        the thing measured 258px above the header's bottom edge on the way past.
        Sharing the parent with the grid it scrolls over is the arrangement
        `/store` already has.
      */}
      {/*
        `data-hero-gap="keep"` is what lets `pt-3` mean anything here, and
        without it the number in the class list is decoration.

        `globals.css` carries an **unlayered** rule —
        `.page-hero + *:not([data-hero-gap="keep"]) { padding-top: 2rem/3rem }` —
        which owns the space under every hero on the site, and unlayered CSS
        beats `@layer utilities` on cascade layer alone. So `pt-3` lost silently:
        the element measured 48px top against 64px bottom, two different values
        from what looked like one `section-y`, and the same class list on a div
        in `<body>` measured the 12px it claims. Chrome's own matched-rule list
        is what named it; nothing about the markup could have.

        That rule exists to *shrink* a 145px gap and is right everywhere it
        applies. This block is the exception it provides for: the bar is the
        banner's control strip rather than the content the hero introduces, and
        the band around it already carries 12px of its own at `lg` — so opting
        out and asking for 12 leaves 24px between the banner and the first thing
        anybody presses.
      */}
      <Container data-hero-gap="keep" className="section-y pt-3">
        <StoreFilterBar categories={categories} category={category.slug} />

        {/* Below `lg`, the vertical sidebar has no room — the same category
            data instead renders as the horizontal rail. */}
        <div className="lg:hidden">
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
    </>
  );
}
