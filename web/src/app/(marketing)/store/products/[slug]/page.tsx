import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Badge } from "@/components/ui/badge";
import { Prose, SpecTable } from "@/components/ui/prose";
import { IconCheck } from "@/components/icons";
import { AddToBasket } from "@/components/store/add-to-basket";
import { StoreFilterBar } from "@/components/store/store-filter-bar";
import { StoreProductCard } from "@/components/store/product-card";
import { ProductGallery } from "@/components/product/product-gallery";
import { ShareLinks } from "@/components/ui/share-links";
import { publicApi } from "@/lib/api";
import { formatPaise, percentOff } from "@/lib/money";
import { buildMetadata, JsonLd, SITE } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import type { StoreCategory, StoreProduct } from "@/types/api";

async function load(slug: string): Promise<StoreProduct | null> {
  try {
    return (await publicApi.storeProduct(slug)).data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await load(slug);

  if (!product) return buildMetadata({ title: "Not found", path: `/store/products/${slug}` });

  return buildMetadata({
    title: product.name,
    description: product.short_description ?? undefined,
    path: `/store/products/${product.slug}`,
    seo: product.seo,
  });
}

export default async function StoreProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await load(slug);

  if (!product) notFound();

  /*
    After the 404, not beside it. A product that does not exist has no page to
    put a filter bar on, and fetching the rest in parallel with the product
    would spend four requests on every crawl of a dead URL. But everything
    below is one round, not three: the categories, the two "also like" reads
    and the settings were awaited one after another, which put the page's
    time-to-first-byte four API round trips deep.

    Each degrades rather than failing the page: the category select is one
    control on a bar whose search box and basket both work without it, a row
    of suggestions is not a reason for the product to 500, and the delivery
    line has a default. All four reads are cached listings and settings.

    "You may also like" is four products from the same shelf, topped up from
    the newest when the shelf is short — never this product, never one twice.
    The delivery and returns lines read the same two settings the Google feed
    and the Offer markup are built from, so the page, the feed and the schema
    cannot make three different promises; they used to be a sentence in
    `content/site.ts` the API could not see.
  */
  const [categories, shelf, newest, settings] = await Promise.all([
    publicApi.storeCategories().then((r) => r.data).catch(() => [] as StoreCategory[]),
    product.category
      ? publicApi.storeProducts(`?category=${product.category.slug}&per_page=6`).then((r) => r.data).catch(() => [] as StoreProduct[])
      : Promise.resolve([] as StoreProduct[]),
    publicApi.storeProducts("?sort=newest&per_page=6").then((r) => r.data).catch(() => [] as StoreProduct[]),
    getSiteSettings().catch(() => ({}) as Awaited<ReturnType<typeof getSiteSettings>>),
  ]);
  const seen = new Set<number>([product.id]);
  const alsoLike = [...shelf, ...newest].filter((p) => !seen.has(p.id) && seen.add(p.id)).slice(0, 4);

  const discounted = product.compare_at_paise && product.compare_at_paise > product.price_paise;

  const shippingPaise = Math.max(0, parseInt(settings.store_shipping_paise ?? "0", 10) || 0);
  const returnDays = Math.max(1, parseInt(settings.store_return_days ?? "7", 10) || 7);
  const delivery = shippingPaise === 0
    ? "Free delivery across India, tracked end to end."
    : `Delivery ${formatPaise(shippingPaise)} across India, tracked end to end.`;

  return (
    <>
      {/*
        The page's Product graph, with the price on it. Every other detail
        route in the product has carried one since the SEO work; the shop was
        the one omission, so the only part of the site that sells published no
        price to anything that reads a page — including Google Merchant Center,
        which uses this block to keep a listing current between feed fetches.
      */}
      {product.schema && <JsonLd data={product.schema} />}
      <PageHero
        section="store"
        kicker={product.brand?.name ?? "Store"}
        title={product.name}
        lede={product.short_description}
        crumbs={[
          { name: "Store", path: "/store" },
          ...(product.category
            ? [{ name: product.category.name, path: `/store/categories/${product.category.slug}` }]
            : []),
        ]}
      />

      {/*
        `data-hero-gap="keep"` and `pt-3`, both for the reason the category page
        records: an **unlayered** rule in `globals.css` —
        `.page-hero + *:not([data-hero-gap="keep"])` — owns the space under
        every hero on the site and beats `@layer utilities` on cascade layer
        alone, so a `pt-*` here is decoration until the element opts out. That
        rule targets whatever sits immediately after the hero, which on this
        page is the `<section>` rather than a `Container`.
      */}
      <section className="section-y pt-3" data-hero-gap="keep">
        <Container>
          {/*
            The shop's control strip, under the banner and above the product.

            It replaces `BasketBar`, and this is the half of the shop that was
            left on the old strip when the category pages moved — two different
            bars either side of a link. What it adds beyond consistency is the
            search box that row never had, and what it keeps is the basket:
            **this is the page with the Add to basket button on it**, so the
            count updating in view is worth more here than anywhere else in the
            shop.

            `category` is preselected from the product's own, so Apply searches
            the range this thing belongs to rather than starting from
            everything. The form submits to `/store`, because this page's loader
            takes a slug and nothing else — pointing it here would render a
            search box that discards what was typed into it.

            It sticks here as on the listings. It did not at first — this page
            already pins the buy panel, and a second stuck band means an offset
            on the panel that has to agree with the strip's height — and that
            offset is now `--h-store-bar` in `globals.css`, read by the panel
            below, so the two cannot drift. What sticking buys on this page is
            the search and the basket staying in reach while somebody reads a
            specification a screen and a half down.
          */}
          <StoreFilterBar categories={categories} category={product.category?.slug} />

          {/*
            The standard product layout: the picture on the left, everything
            that decides a purchase on the right. Equal columns rather than the
            previous 1.1fr/1fr — the buy panel now carries the price, the stock,
            the variations, the basket and the terms, and it was the half being
            squeezed.
          */}
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
            <ProductGallery
              images={product.images ?? []}
              alts={product.image_alts}
              name={product.name}
              priority
            />

            {/*
              `lg:sticky` so the price and the basket stay in view while
              somebody reads the specification below. The dock is the header
              *plus* the stuck filter strip, both read from `globals.css`;
              `self-start` is what lets a sticky child work inside a grid whose
              items would otherwise stretch to the row height.

              **`lg:row-span-2` is what makes any of that true**, and without it
              the whole thing was decoration. A sticky *grid item* is contained
              by its own **grid area**, not by the grid — and this panel's area
              was row 1, which is exactly as tall as the panel itself. Measured:
              `containerHeight: 552, panelHeight: 552, travel: 0`, with the
              panel's top moving 1:1 with the scroll and never reaching its own
              96px dock. `position: sticky` computed correctly the entire time,
              which is what made it look like a class name that worked.

              Spanning both rows gives the area the height of the column beside
              it, so the panel now travels past the features, the specification
              and the details — the three blocks the comment above always said
              it stayed beside and never did. They moved into row 2 of the left
              column for that to be possible; below `lg` the grid is one column
              and the order is unchanged: picture, then price, then the reading.

              The sticky element is the wrapper, not the card: the share row
              sits under the card and outside it, and it should travel with
              the price rather than be left behind on row 2.
            */}
            <div className="self-start lg:sticky lg:top-[calc(var(--h-site-header)+var(--h-store-bar))] lg:row-span-2">
            <div className="grid gap-5 rounded-xl border border-line-strong bg-card p-6 lg:p-7">
              <div className="flex flex-wrap items-center gap-2">
                {product.in_stock
                  ? <Badge tone="resolved">In stock</Badge>
                  : <Badge tone="urgent">Out of stock</Badge>}
                {discounted && product.compare_at_paise && (
                  <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[12px] font-semibold text-ok">
                    Save {percentOff(product.price_paise, product.compare_at_paise)}%
                  </span>
                )}
                {!product.returnable && (
                  <span className="text-[12.5px] font-medium text-warn">Non-returnable</span>
                )}
                {/*
                  A term of the sale, said before somebody pays. New is the
                  ordinary case and is not called out; the other two are — an
                  undisclosed refurbished unit is a complaint, and the feed
                  declares the condition to Google in the same words.
                */}
                {product.condition && product.condition !== "new" && (
                  <span className="text-[12.5px] font-medium text-warn capitalize">{product.condition}</span>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-[34px] font-semibold leading-none tabular-nums">
                    {formatPaise(product.price_paise)}
                  </span>
                  {discounted && (
                    <span className="text-[16px] tabular-nums text-faint line-through">
                      {formatPaise(product.compare_at_paise!)}
                    </span>
                  )}
                </div>
                {/*
                  Said once, plainly, beside the number it is about. The brief
                  asks for it and it is also the difference between a price
                  somebody trusts and one they have to work out.
                */}
                <p className="mt-1.5 text-[13px] text-muted">Includes 18% GST. This is the price you pay.</p>
              </div>

              {product.short_description && (
                <p className="text-[14.5px] leading-[1.6] text-ink-2">{product.short_description}</p>
              )}

              <AddToBasket product={product} />

              {/*
                The things a buyer checks before pressing the button, in the
                panel that holds the button rather than in a strip further down
                the page. The delivery and returns lines are settings — the
                same two the feed and the schema read — and the other two are
                terms of the shop, not facts about this row.
              */}
              <ul className="grid gap-2 border-t border-line pt-4 text-[13px] text-muted">
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>{delivery}</li>
                {product.returnable && (
                  <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>{returnDays}-day returns — see our <Link href="/returns" className="underline hover:text-ink">returns policy</Link>.</li>
                )}
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>Sourced from an authorised distributor.</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>Backed by the engineers who install it.</li>
              </ul>

              {product.sku && (
                <p className="font-mono text-[12.5px] text-faint">SKU {product.sku}</p>
              )}
            </div>

            {/*
              Pass this on — under the card, not in it. The card is the
              purchase; sharing is what somebody does *instead* of buying
              right now, to ask a colleague, and a row of network icons inside
              the panel that ends in Add to basket muddles which button the
              panel is for. The canonical URL, not the request's: a link
              copied from the page should not carry whoever's `?utm_` brought
              them here.
            */}
            <ShareLinks
              url={`${SITE.url}/store/products/${product.slug}`}
              title={product.name}
              label="Share this product"
              className="mt-4 px-1"
            />
            </div>
          {/*
            Row 2 of the left column: everything somebody reads after they have
            looked at the picture and the price.

            It used to sit after the grid entirely, which is why the buy panel's
            sticky had nothing to travel through — see the note on the panel. As
            a grid item it auto-places at row 2, column 1, beside the panel's
            spanned area, and `min-w-0` because a grid item's automatic minimum
            is its min-content: one unbreakable part number in a specification
            table would otherwise set this column's floor and push the panel off
            the row.

            The reading measure improves rather than suffers. At 1440 this
            column is ~624px where the full container is 1296 — and `Prose` caps
            itself at 68ch (~700px) regardless, so the body copy was never using
            the extra width it appeared to have.
          */}
          <div className="min-w-0">
          {product.features && product.features.length > 0 && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">What you get</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {product.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[14px]">
                    <span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">Specification</h2>
              <SpecTable specs={product.specifications} />
            </div>
          )}

          {product.description && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">Details</h2>
              <Prose html={product.description} />
            </div>
          )}
          </div>
          </div>

          {alsoLike.length > 0 && (
            <section aria-labelledby="also-like" className="mt-16" data-aos="fade-up">
              <h2
                id="also-like"
                className="mb-6 text-[22px] font-semibold after:mt-2.5 after:block after:h-[3px] after:w-10 after:rounded-full after:bg-brand-600"
              >
                You may also like
              </h2>
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {alsoLike.map((p) => (
                  <li key={p.id}>
                    <StoreProductCard product={p} headingLevel={3} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Container>
      </section>

    </>
  );
}
