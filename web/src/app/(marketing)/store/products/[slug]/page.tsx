import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { RecordSections, laidOutAsSections } from "@/components/page-sections/record-sections";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { RelatedEntities } from "@/components/content/related-entities";
import { StoreFilterBar } from "@/components/store/store-filter-bar";
import { ReviewsSection } from "@/components/store/reviews/reviews-section";
import { publicApi } from "@/lib/api";
import { buildMetadata, JsonLd } from "@/lib/seo";
import type { StoreProduct } from "@/types/api";
import { StoreAlsoLike, StoreApplications, StoreBuyGrid, StoreDetails, StoreDownloads, StoreFeatures, StoreProductHero, StoreRecent, StoreSpecs, StoreWatch, loadStoreProductContext, storeProductCrumbs } from "@/components/detail-template/store-product-parts";
import { StoreProductTemplate } from "@/components/detail-template/store-product-template";

async function load(slug: string): Promise<StoreProduct | null> {
  try {
    return (await publicApi.storeProduct(slug)).data;
  } catch {
    return null;
  }
}

/*
 * Empty on purpose, and the export itself is the feature — see the same
 * block on `solutions/[slug]`. This page could not carry it until
 * `BasketIndicator` stopped reading the cart cookie during render: a
 * request-time API in an ISR render is a 500, not a fallback, and the
 * indicator is a client component fed by `/api/store/basket` for exactly
 * that reason. Nothing else rendered here touches a cookie, a header or
 * `searchParams`; every read is an ISR-tagged store listing or the settings.
 */
export async function generateStaticParams() {
  return [];
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

  // An active detail template lays the page out (0.161.0, docs/page-builder.md "Detail templates"); with none, the page below is unchanged.
  if (product.detail_template) return <StoreProductTemplate product={product} />;

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
  const { categories, settings, firstReviews, watchRows, alsoLike } = await loadStoreProductContext(product, slug);

  const crumbs = storeProductCrumbs(product);
  // Builder sections in place of the written description (0.130.0).
  const laidOut = laidOutAsSections(product);

  // The reviews and the suggestions, which close the page whichever way the description is drawn.
  const tail = (
    <>
          <ReviewsSection slug={product.slug} productName={product.name} rating={product.rating ?? null} initial={firstReviews} />

          <StoreAlsoLike alsoLike={alsoLike} />

          <StoreRecent product={product} />
    </>
  );

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
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {product.faq_schema && <JsonLd data={product.faq_schema} />}
      <StoreProductHero product={product} crumbs={crumbs} />

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
          <StoreBuyGrid product={product} settings={settings}>
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
          {/*
            "Watch" (0.140.0): the product's videos and, after them, other
            products' — under the gallery on a desktop, after the buy panel on
            a phone. Small tiles, no lede; nothing at all when there is
            nothing to watch.
          */}
          <StoreWatch rows={watchRows} settings={settings} />

          <StoreFeatures product={product} />

          <StoreSpecs product={product} />

          {!laidOut && <StoreDetails product={product} />}

          {/* The downloads centre's files for this product (docs/downloads.md): its datasheet, drivers, firmware. */}
          <StoreDownloads product={product} />

          {/*
            Where it is used, in the seller's words (`applications`, plain
            text — `docs/aeo-geo-contract.md` §3), then the answer blocks with
            the FAQs merged into their questions, then what the product is
            connected to: the brand, the category, the services that install
            it. All after the reading and before "You may also like".
          */}
          <StoreApplications product={product} />
          {/* Custom fields in "details" groups (docs/custom-content.md): nothing when there are none. */}
          <CustomFieldDetails fields={product.custom_fields} className="mt-14" />
          <AnswerBlocks blocks={product.answer_blocks} faqs={product.faqs ?? []} className="mt-14" />
          <RelatedEntities entity={product.entity} className="mt-14" />
          </div>
          </StoreBuyGrid>

          {!laidOut && tail}
        </Container>
      </section>

      {/*
        Builder sections in place of "Details" (0.130.0): full-width bands
        under the buying block and what is read beside it, then the reviews
        and the suggestions in a section of their own. The search strip stays
        with the buying block — a sticky box is held by its own parent, and
        over a band with a background of its own it would be a bar floating
        on somebody else's ground.
      */}
      {laidOut && (
        <>
          <RecordSections sections={product.sections ?? []} crumbs={crumbs} />
          <section className="section-y">
            <Container className="[&>*:first-child]:mt-0">{tail}</Container>
          </section>
        </>
      )}

    </>
  );
}
