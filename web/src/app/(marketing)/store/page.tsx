import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Select } from "@/components/ui/input";
import { IconBox, IconSearch } from "@/components/icons";
import { StoreProductCard } from "@/components/store/product-card";
import { CategoryRail } from "@/components/store/category-rail";
import { PromoBanner } from "@/components/store/promo-banner";
import { TrustStrip } from "@/components/store/trust-strip";
import { StoreHero } from "@/components/store/store-hero";
import { BasketIndicator } from "@/components/store/basket-bar";
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

  // Each independent and gracefully degrading, the same shape as the
  // homepage's own `heroSlider` — absent means "skip this section", not an
  // error, since none of the three has ever been configured on a fresh
  // install.
  const heroSlider = await publicApi.slider("store-hero").then((r) => r.data).catch(() => null);
  const settings = await getSiteSettings();
  const latestProducts = await publicApi.storeProducts("?sort=newest", true)
    .then((r) => r.data.slice(0, 6))
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
        `pt-5` rather than `section-y`'s 64px when a hero is present: the
        filter bar is the hero's own control strip and reads as part of it, so
        a full section's worth of air between the two breaks them into two
        unrelated bands. Without a hero it keeps the standard rhythm, since
        then it *is* the top of the page.
      */}
      <section className={heroSlider ? "pb-16 pt-5 lg:pb-20" : "section-y"}>
        <Container>
          {failed || !products ? (
            <ErrorState title="We could not load the store">
              Try again shortly, or call us and we will take the order over the phone.
            </ErrorState>
          ) : (
            <>
              {/*
                The shop's control strip: find something on the left, what is
                already in the basket on the right.

                One height for everything in it — `h-11` on the input, both
                selects and the button. They were three different heights
                before (the shared `field` class is 43px, the search input was
                38px, the button 36px), which on one row reads as three
                unrelated controls that happen to be adjacent rather than one
                instrument. Nothing else about the bar mattered as much as
                that.

                Laid out as a grid rather than a wrapping flex row, because the
                two arrangements are genuinely different rather than one
                reflowing: on a phone the search takes a full row, the two
                selects share the next, and the button sits beside the basket.
                A flex row wrapping into that shape needs basis arithmetic at
                three breakpoints and still leaves the button stranded on a
                line of its own, which is what it was doing.
              */}
              <form
                action="/store"
                className="mb-8 grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl border border-line-strong bg-card p-3 shadow-1 lg:flex lg:items-end lg:gap-3"
              >
                <div className="col-span-2 min-w-0 lg:flex-1">
                  {/*
                    `sr-only`, not deleted. The magnifier and the placeholder
                    are enough to look at and are nothing to a screen reader —
                    a placeholder is not a label, and an input labelled only by
                    one is announced as "edit text, blank". The same call the
                    footer's newsletter field already makes.
                  */}
                  <label htmlFor="q" className="sr-only">Search the store</label>
                  {/*
                    The glyph sits inside the field rather than beside it, so
                    it reads as part of the control. `pointer-events-none` on
                    the icon and left padding on the input, or the icon eats
                    the click that should focus the field.
                  */}
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-faint">
                      <IconSearch className="size-[18px]" />
                    </span>
                    <input
                      id="q"
                      name="q"
                      defaultValue={sp.q}
                      placeholder="Name, part number or brand…"
                      className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-11 pr-3 text-[14.5px] transition-all duration-200 ease-brand placeholder:text-faint focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-100"
                    />
                  </div>
                </div>

                {categories.length > 0 && (
                  <div className="min-w-0 lg:w-[184px]">
                    <label htmlFor="category" className="mb-1 block text-[12px] font-semibold uppercase tracking-[.04em] text-faint">
                      Category
                    </label>
                    <Select
                      id="category"
                      name="category"
                      defaultValue={sp.category ?? ""}
                      className="h-11 rounded-lg bg-surface py-0 text-[14.5px]"
                    >
                      <option value="">Everything</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.slug}>{c.name}</option>
                      ))}
                    </Select>
                  </div>
                )}

                <div className="min-w-0 lg:w-[184px]">
                  <label htmlFor="sort" className="mb-1 block text-[12px] font-semibold uppercase tracking-[.04em] text-faint">
                    Sort
                  </label>
                  <Select
                    id="sort"
                    name="sort"
                    defaultValue={sp.sort ?? "featured"}
                    className="h-11 rounded-lg bg-surface py-0 text-[14.5px]"
                  >
                    <option value="featured">Featured</option>
                    <option value="price-low">Price, low to high</option>
                    <option value="price-high">Price, high to low</option>
                    <option value="name">Name</option>
                    <option value="newest">Newest</option>
                  </Select>
                </div>

                {/*
                  The button and the basket share a row on a phone and sit at
                  the end of the strip on a wide screen. `col-span-2` so they
                  keep the full width when the selects are side by side above
                  them.
                */}
                <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
                  <button
                    type="submit"
                    className="h-11 shrink-0 rounded-lg bg-brand-600 px-6 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-brand-700"
                  >
                    Apply
                  </button>

                  {filtered && (
                    <Link
                      href="/store"
                      className="shrink-0 text-[13.5px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
                    >
                      Clear
                    </Link>
                  )}

                  {/*
                    The basket at the end of the same strip rather than in a
                    band of its own above the hero — one row of controls, and
                    the honest arrangement anyway: the old strip carried a
                    "Store" link on the page that link goes to.

                    `ml-auto` pushes it to the far end on both layouts, so on a
                    phone it sits opposite Apply instead of crowding it. The
                    rule only appears once they are genuinely on one line;
                    below that it would be a mark separating nothing.
                  */}
                  <span aria-hidden className="ml-auto hidden h-7 w-px bg-line-strong lg:block" />
                  <div className="ml-auto lg:ml-0">
                    <BasketIndicator />
                  </div>
                </div>
              </form>

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
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

      <PromoBanner settings={settings} />

      {latestProducts.length > 0 && (
        <section className="section-y">
          <Container>
            <h2 className="mb-4 text-[22px] font-semibold tracking-tight">Latest Products</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {latestProducts.map((p) => (
                <li key={p.id}>
                  <StoreProductCard product={p} headingLevel={3} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      <section className="section-y">
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
