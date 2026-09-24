import { Container } from "@/components/ui/container";
import { Pagination } from "@/components/ui/pagination";
import { CtaBand } from "@/components/ui/cta-band";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconBox } from "@/components/icons";
import { StoreProductCard } from "@/components/store/product-card";
import { CategoryRail } from "@/components/store/category-rail";
import { PromoBanner } from "@/components/store/promo-banner";
import { PromoTiles } from "@/components/store/promo-tiles";
import { TrustStrip } from "@/components/store/trust-strip";
import { RecentlyViewed } from "@/components/store/recently-viewed";
import { StoreHero } from "@/components/store/store-hero";
import { StoreFilterBar } from "@/components/store/store-filter-bar";
import { SliderFor } from "@/components/ui/slider-for";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { listingMetadata } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import type { Paginated, StoreCategory, StoreProduct } from "@/types/api";

type SearchParams = { q?: string; category?: string; sort?: string; page?: string };

/** Self-referencing canonical per page; a search or a category facet is `noindex, follow` — see `listingMetadata`. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return listingMetadata({
    title: "Store",
    description:
      "Buy hardware, licences and services online. All prices include 18% GST — the price shown is the price paid.",
    path: "/store",
    searchParams: await searchParams,
    filters: ["q", "category"],
  });
}

/**
 * How many products each grid on this page shows.
 *
 * Two full rows of the six-column grid. One constant rather than two literals
 * because the two grids are meant to be the same shape — one reading 12 and the
 * other 6 is a page with a ragged second block and nothing saying why — and
 * because the number reaches three places that have to agree: the `per_page`
 * the listing asks the API for, the slice the latest strip takes, and the pager
 * under the first grid, which is drawn from that same response.
 *
 * `StoreController` caps `per_page` at 60 and defaults to 24, so this is inside
 * what it will honour. Asking for more than the cap would page at 60 while this
 * page believed otherwise, and the pager would disagree with the grid above it.
 */
const PER_GRID = 12;

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const query = new URLSearchParams();
  if (sp.q) query.set("q", sp.q);
  if (sp.category) query.set("category", sp.category);
  if (sp.sort) query.set("sort", sp.sort);
  if (sp.page) query.set("page", sp.page);
  /*
    Set last and unconditionally, so a hand-edited URL cannot ask for a page
    size this grid was not laid out for — the `?sort=` rule one step further on:
    what arrives from outside is a request, not an instruction.
  */
  query.set("per_page", String(PER_GRID));
  const qs = query.toString();

  /*
    Everything the page needs, in one round. The slider, the settings and the
    "latest" strip used to be awaited one after another *after* the listing —
    four sequential round trips on a page that is dynamic per request. Each
    of the three degrades on its own, the same shape as the homepage's
    `heroSlider`: absent means "skip this section", not an error, since none
    of them has ever been configured on a fresh install. Only the listing and
    the categories may fail the page, and only during a build.

    `per_page` as well as the slice on the latest strip. The slice is what
    actually bounds it — the endpoint could change its default tomorrow — and
    asking for the right number is what stops the API building and
    serialising twenty-four products to render twelve.
  */
  const [heroSlider, settings, latestProducts, listing] = await Promise.all([
    publicApi.slider("store-hero").then((r) => r.data).catch(() => null),
    getSiteSettings(),
    publicApi.storeProducts(`?sort=newest&per_page=${PER_GRID}`, true)
      .then((r) => r.data.slice(0, PER_GRID))
      .catch(() => [] as StoreProduct[]),
    (async (): Promise<{ categories: StoreCategory[]; products: Paginated<StoreProduct> | null; failed: boolean }> => {
      try {
        const [categories, products] = await Promise.all([
          publicApi.storeCategories().then((r) => r.data),
          // Never cached with a search term in it: `?q=` has an unbounded key
          // space, so caching fills the cache with single-use entries and
          // serves a stale empty result for the whole window.
          publicApi.storeProducts(qs ? `?${qs}` : "", !sp.q),
        ]);
        return { categories, products, failed: false };
      } catch (error) {
        // A build that cannot reach the API fails rather than baking "we
        // could not load the store" into static HTML for Google to crawl.
        if (isPrerendering) throw error;
        return { categories: [], products: null, failed: true };
      }
    })(),
  ]);
  const { categories, products, failed } = listing;

  const filtered = Boolean(sp.q || sp.category);

  return (
    <>
      {/*
        The mockup's hero carries no visible page title — the slide's own
        headline stands in for it. A real `<h1>` still has to exist for the
        audit's one-per-page rule and for anyone not looking at a screen, so
        it is here, `sr-only`, regardless of whether a hero is configured.
      */}
      <h1 className="sr-only">Store</h1>

      {/*
        Which renderer is the slider's own setting, not a decision hard-coded
        here: `split` is the two-column treatment, anything else is the
        full-width banner whose caption each slide anchors for itself. An
        editor switches between them in the console without a deploy.
      */}
      {heroSlider && (
        heroSlider.layout === "split"
          ? <StoreHero slider={heroSlider} />
          : (
            /*
              Inside the page container, not bled to the window edge. Every
              other band on this page — the filter bar, the category rail, the
              product grid — starts at the container's left edge, and a banner
              that ignored it was the one element on the page whose left edge
              did not line up with anything below it. `rounded-xl` and
              `overflow-hidden` because a contained banner needs a shape of its
              own; edge to edge it borrowed the window's.
            */
            <div className="pt-6">
              <Container>
                <div data-store-hero className="overflow-hidden rounded-xl">
                  <SliderFor
                    slider={heroSlider}
                    /*
                      Taller than 16:9 on a phone, because the caption has to
                      fit inside the picture. At 320px a 16:9 band is 162px
                      high and a heading, three lines of copy and a button need
                      about 250 — so the block overflowed its own box and the
                      button was clipped off the bottom. Wide screens keep the
                      banner proportions; a phone gets the room the words need.
                    */
                    aspect="aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/7]"
                    priority
                  />
                </div>
              </Container>
            </div>
          )
      )}

      {/*
        `pt-5` rather than `section-y`'s 48px when a hero is present: the
        filter bar is the hero's own control strip and reads as part of it, so
        a full section's worth of air between the two breaks them into two
        unrelated bands. Without a hero it keeps the standard rhythm, since
        then it *is* the top of the page.

        The **bottom** is trimmed either way, and the reason is that padding
        stacks and the sum is what a reader sees. Measured at 1920: this section
        ended in 80px, the promo band added 40 of its own, and the gap above the
        band came to **120px** — with 104 below it, so the page read as three
        unrelated pages rather than one shop. Nothing here was individually
        wrong, which is why looking at any one number would not have found it.
        32/40 here, a token band on the promo itself and a matching trim on the
        strip below bring both gaps to 48.

        A `pb-*` utility beats `.section-y` on its own: those live in
        `@layer components` precisely so a section that needs its own spacing
        can say so, which is what the no-hero branch does here.

        The `<div>` around this section and the three after it is the filter
        strip's containing block, and nothing else. `position: sticky` holds
        only while the element's parent is on screen, and the strip's parent
        used to be this one section — so it docked under the header for the
        length of the grid and left with it the moment the promo band scrolled
        into view, which reads as the strip "not being sticky" (2026-09-20).
        The wrapper spans the shop — the grid, the promo band, the latest
        products and the trust strip — and stops before the CTA band, which the
        strip has no business floating over.

        **And the strip has to be a direct child of it** (2026-09-23). A sticky
        box is held by its own parent's box and by nothing further up, so while
        the strip sat inside this section's `Container` the wrapper did nothing
        for it: measured at 1707px, it released at the pagination — absolute top
        1979 against a wrapper running to 3714 — and slid up behind the header
        with the promo band, the latest products and the trust strip still to
        come. That is the position the client reported, and the fix written down
        in September never applied to the element it was written for. It is
        hoisted out of the section now and carries the container's own gutter
        instead, so its edges still line up with the grid below it.
      */}
      <div>
      <StoreFilterBar
        categories={categories}
        q={sp.q}
        category={sp.category}
        sort={sp.sort}
        /*
          The `Container` gutter, applied to the strip itself because the strip
          is the sticky element. `mx-auto` beats the base `-mx-1` through
          tailwind-merge; the width carries the extra 0.5rem that `px-1` spends,
          so the *card* lines up with the 90% grid while its opaque band still
          clears the card's rounded corners.

          The space above it is a **margin**, and the section below has lost the
          top padding that used to supply it. Margin rather than padding because
          padding is inside the sticky box and would sit there as a permanent
          band once the strip docks; a margin gives the gap while the strip is
          in the flow and costs nothing once it is stuck. The two figures are
          the ones the section had: the hero branch's `pt-5`, and `.section-y`'s
          3rem/4rem where there is no hero.
        */
        className={`mx-auto w-[calc(90%+0.5rem)] max-w-[calc(1920px+0.5rem)] ${
          heroSlider ? "mt-5" : "mt-12 lg:mt-16"
        }`}
      />

      <section className="pb-8 lg:pb-10">
        <Container>
          {failed || !products ? (
            <ErrorState title="We could not load the store">
              Try again shortly, or call us and we will take the order over the phone.
            </ErrorState>
          ) : (
            <>
              {categories.length > 0 && (
                <div className="mb-6">
                  <h2 className="mb-3 text-22 font-semibold tracking-tight">Shop by Categories</h2>
                  <CategoryRail categories={categories} />
                </div>
              )}

              <h2 className="mb-4 text-22 font-semibold tracking-tight">Top Picks For You</h2>

              {products.data.length === 0 ? (
                <EmptyState icon={<IconBox />} title={filtered ? "Nothing matches that" : "The store is being set up"}>
                  {filtered
                    ? "Try a different term, or clear the filters."
                    : "There is nothing on sale online yet. Get in touch and we will quote."}
                </EmptyState>
              ) : (
                <ul data-collection="products" data-cols="6" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
                  {products.data.map((p, i) => (
                    <li key={p.id}>
                      {/* h3: "Top Picks For You" above the grid is the h2. */}
                      <StoreProductCard product={p} headingLevel={3} priority={i === 0} />
                    </li>
                  ))}
                </ul>
              )}

              {products.meta && (
                <Pagination
                  meta={products.meta}
                  basePath="/store"
                  params={{ q: sp.q, category: sp.category, sort: sp.sort }}
                  showPerPage={false}
                  numbered
                />
              )}
            </>
          )}
        </Container>
      </section>

      <PromoBanner settings={settings} />

      {latestProducts.length > 0 && (
        /*
          A trimmed top, matching the trimmed bottom of the grid above the promo
          band — see the note there. The **bottom** keeps `section-y`, because
          what follows is the trust strip and then the CTA band, which are
          different subjects rather than more of the shop.
        */
        <section className="section-y pt-8 lg:pt-10">
          <Container>
            <h2 className="mb-4 text-22 font-semibold tracking-tight">Latest Products</h2>
            <ul data-collection="products" data-cols="6" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
              {latestProducts.map((p) => (
                <li key={p.id}>
                  <StoreProductCard product={p} headingLevel={3} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {/*
        The two promo tiles sit directly above the trust strip (the client,
        2026-09-23). They were between the products grid and the promo band,
        where two editor-set pictures interrupted the shop on the way from what
        is for sale to the rest of it; down here they close the page with the
        banner and the strip as one run of shop furniture, and the grid runs
        into Latest Products uninterrupted.
      */}
      <PromoTiles settings={settings} />

      {/*
        A quarter of `section-y`, and that is a judgement about what this band
        *is* rather than a trim for its own sake. It is four one-line
        reassurances — shipping, payment, support, sourcing — not a section
        anybody reads down. At the standard rhythm it had 48/64px above and
        below four ~100px cards, which is more air than content and made the
        page's last stretch read as two empty bands with a strip between them.

        It still has neighbours with their own padding: the Latest Products grid
        ends in `section-y` and the CTA band opens with it, so the strip is not
        touching either. This number is the strip's own contribution, not the
        gap a reader sees.
      */}
      <section className="py-3 lg:py-4">
        <Container>
          <RecentlyViewed className="mb-8" />
          <TrustStrip />
        </Container>
      </section>
      </div>

      <CtaBand
        title="Need something that is not listed?"
        body="Most of what we supply is quoted per project. Tell us what you are building and we will price it."
      />
    </>
  );
}
