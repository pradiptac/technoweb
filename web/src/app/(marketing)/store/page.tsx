import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconBox } from "@/components/icons";
import { StoreProductCard } from "@/components/store/product-card";
import { CategoryRail } from "@/components/store/category-rail";
import { PromoBanner } from "@/components/store/promo-banner";
import { TrustStrip } from "@/components/store/trust-strip";
import { StoreHero } from "@/components/store/store-hero";
import { StoreFilterBar } from "@/components/store/store-filter-bar";
import { Slider } from "@/components/ui/slider";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import type { Paginated, StoreCategory, StoreProduct } from "@/types/api";

export const metadata = buildMetadata({
  title: "Store",
  description:
    "Buy hardware, licences and services online. All prices include 18% GST — the price shown is the price paid.",
  path: "/store",
});

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
  searchParams: Promise<{ q?: string; category?: string; sort?: string; page?: string }>;
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

  // Each independent and gracefully degrading, the same shape as the
  // homepage's own `heroSlider` — absent means "skip this section", not an
  // error, since none of the three has ever been configured on a fresh
  // install.
  const heroSlider = await publicApi.slider("store-hero").then((r) => r.data).catch(() => null);
  const settings = await getSiteSettings();
  /*
    `per_page` as well as the slice. The slice is what actually bounds the
    strip — the endpoint could change its default tomorrow — and asking for the
    right number is what stops the API building and serialising twenty-four
    products to render twelve.
  */
  const latestProducts = await publicApi.storeProducts(`?sort=newest&per_page=${PER_GRID}`, true)
    .then((r) => r.data.slice(0, PER_GRID))
    .catch(() => [] as StoreProduct[]);

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
                <div className="overflow-hidden rounded-xl">
                  <Slider
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
      */}
      <section className={heroSlider ? "pb-8 pt-5 lg:pb-10" : "section-y pb-8 lg:pb-10"}>
        <Container>
          {failed || !products ? (
            <ErrorState title="We could not load the store">
              Try again shortly, or call us and we will take the order over the phone.
            </ErrorState>
          ) : (
            <>
              <StoreFilterBar
                categories={categories}
                q={sp.q}
                category={sp.category}
                sort={sp.sort}
              />

              {categories.length > 0 && (
                <div className="mb-10">
                  <h2 className="mb-4 text-[22px] font-semibold tracking-tight">Shop by Categories</h2>
                  <CategoryRail categories={categories} />
                </div>
              )}

              <h2 className="mb-4 text-[22px] font-semibold tracking-tight">Top Picks For You</h2>

              {products.data.length === 0 ? (
                <EmptyState icon={<IconBox />} title={filtered ? "Nothing matches that" : "The store is being set up"}>
                  {filtered
                    ? "Try a different term, or clear the filters."
                    : "There is nothing on sale online yet. Get in touch and we will quote."}
                </EmptyState>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {products.data.map((p, i) => (
                    <li key={p.id}>
                      {/* h3: "Top Picks For You" above the grid is the h2. */}
                      <StoreProductCard product={p} headingLevel={3} priority={i === 0} />
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
                            ? "border-brand-600 bg-brand-600 font-semibold text-brand-on"
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
            <h2 className="mb-4 text-[22px] font-semibold tracking-tight">Latest Products</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
          <TrustStrip />
        </Container>
      </section>

      <CtaBand
        title="Need something that is not listed?"
        body="Most of what we supply is quoted per project. Tell us what you are building and we will price it."
      />
    </>
  );
}
