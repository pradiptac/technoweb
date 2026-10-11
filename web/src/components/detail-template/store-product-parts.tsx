import Link from "next/link";
import type { ReactNode } from "react";
import { PageHero } from "@/components/ui/page-hero";
import { Badge } from "@/components/ui/badge";
import { Prose, SpecTable } from "@/components/ui/prose";
import { IconCheck } from "@/components/icons";
import { DownloadList, downloadRow } from "@/components/downloads/download-list";
import { AddToBasket } from "@/components/store/add-to-basket";
import { WishlistHeart } from "@/components/store/wishlist-heart";
import { StoreProductCard } from "@/components/store/product-card";
import { ProductGallery } from "@/components/product/product-gallery";
import { VideoShelf } from "@/components/store/video-shelf";
import { RecentlyViewed, RememberProduct } from "@/components/store/recently-viewed";
import { ShareLinks } from "@/components/ui/share-links";
import { ProductTagChips } from "@/components/store/tag-row";
import type { Crumb } from "@/components/ui/breadcrumbs";
import { publicApi } from "@/lib/api";
import { formatPaise, percentOff } from "@/lib/money";
import { SITE } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import { videoShelfConfig, videoShelfEnabled } from "@/lib/store-videos";
import { settingEnabled } from "@/lib/site-settings";
import { reviewPage } from "@/lib/reviews";
import type { StoreCategory, StoreProduct } from "@/types/api";
import type { VideoShelfRow } from "@/types/store-merch";

/*
 * The pieces of a shop product's page, lifted out of its route (0.161.0) so
 * the route and a detail template draw each from the same code
 * (docs/page-builder.md "Detail templates"). Moved verbatim.
 */

type Settings = Awaited<ReturnType<typeof getSiteSettings>>;

/**
 * Everything the page reads beside the product itself, in one round: the
 * categories for the filter bar, the settings, the first page of reviews, the
 * "Watch" row and the products to suggest — each degrading rather than failing
 * the page. See the route for why they are fetched together and after the 404.
 */
export async function loadStoreProductContext(product: StoreProduct, slug: string) {
  const [categories, shelf, newest, settings, firstReviews, watchRows] = await Promise.all([
    publicApi.storeCategories().then((r) => r.data).catch(() => [] as StoreCategory[]),
    product.category
      ? publicApi.storeProducts(`?category=${product.category.slug}&per_page=6`).then((r) => r.data).catch(() => [] as StoreProduct[])
      : Promise.resolve([] as StoreProduct[]),
    publicApi.storeProducts("?sort=newest&per_page=6").then((r) => r.data).catch(() => [] as StoreProduct[]),
    getSiteSettings().catch(() => ({}) as Awaited<ReturnType<typeof getSiteSettings>>),
    // The first page of reviews, cached under `store-reviews:<slug>`; a failure draws the section empty rather than failing the page.
    reviewPage(product.slug).catch(() => null),
    /*
      The small "Watch" row (0.140.0): this product's own videos first, then —
      unless the shop's "fill with other products' videos" setting is off —
      others. **A cached, tagged fetch** (`store-videos`): this page is ISR,
      so no cookie, header or `no-store` may be read in its render; whether
      autoplay is allowed is decided in the browser. `others=0` is sent
      from here so the setting is read once, on this side. A failure, or an
      API that predates the row, is a page without it.
    */
    getSiteSettings()
      .then((s) => videoShelfEnabled.product(s)
        ? publicApi.storeVideos(
          `?product=${encodeURIComponent(slug)}&limit=${Math.min(8, videoShelfConfig(s).limit)}${videoShelfEnabled.productOthers(s) ? "" : "&others=0"}`,
        ).then((r) => r.data)
        : ([] as VideoShelfRow[]))
      .catch(() => [] as VideoShelfRow[]),
  ]);
  const seen = new Set<number>([product.id]);
  const pool = [...shelf, ...newest].filter((p) => !seen.has(p.id) && seen.add(p.id));

  // The page suggests four; a detail template may ask for more (`record_related`'s count).
  return { categories, settings, firstReviews, watchRows, alsoLike: pool.slice(0, 4), alsoLikePool: pool };
}

export function storeProductCrumbs(product: StoreProduct): Crumb[] {
  return [
    { name: "Store", path: "/store" },
    ...(product.category
      ? [{ name: product.category.name, path: `/store/categories/${product.category.slug}` }]
      : []),
  ];
}

/** The theme's page heading. */
export function StoreProductHero({ product, crumbs }: { product: StoreProduct; crumbs: Crumb[] }) {
  return (
      <PageHero
        section="store"
        kicker={product.brand?.name ?? "Store"}
        title={product.name}
        lede={product.short_description}
        crumbs={crumbs}
      />
  );
}

/**
 * The picture on the left and the buy panel on the right — price, stock,
 * options, basket, the terms — with the share row under it. `children` is the
 * left column's second row, which is what the sticky panel travels past: the
 * panel spans both rows (`lg:row-span-2`), so give it something to span.
 */
export function StoreBuyGrid({ product, settings, children }: { product: StoreProduct; settings: Settings; children?: ReactNode }) {
  const discounted = product.compare_at_paise && product.compare_at_paise > product.price_paise;

  const shippingPaise = Math.max(0, parseInt(settings.store_shipping_paise ?? "0", 10) || 0);
  const returnDays = Math.max(1, parseInt(settings.store_return_days ?? "7", 10) || 7);
  // In zones mode the charge depends on where it goes and what it weighs, so the
  // page says so rather than quoting one figure (0.142.0, docs/store.md).
  const delivery = settings.store_shipping_mode === "zones"
    ? "Delivery is worked out at checkout from your state and the weight, and tracked end to end."
    : shippingPaise === 0
      ? "Free delivery across India, tracked end to end."
      : `Delivery ${formatPaise(shippingPaise)} across India, tracked end to end.`;

  return (
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
            <ProductGallery
              images={product.images ?? []}
              alts={product.image_alts}
              focuses={product.image_focuses}
              blurs={product.image_blurs}
              name={product.name}
              priority
              // The shop's additions: videos, every thumbnail, the magnifier.
              videos={product.videos ?? []}
              store
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
                {/*
                  Words, not a boolean. `in_stock` is true for a back-ordered
                  product — correctly, it can be bought — and "In stock" on
                  an empty shelf is the difference between a sale and a
                  refund conversation. `availability` is the API's three-
                  valued answer and `handling_days` the number a back-order
                  sentence needs; an older API without them reads as before.
                */}
                {(product.availability ?? (product.in_stock ? "in_stock" : "out_of_stock")) === "backorder"
                  ? <Badge tone="progress">Back-ordered — ships in about {Math.max(7, (product.handling_days ?? 2) + 5)} days</Badge>
                  : product.in_stock
                    ? <Badge tone="resolved">In stock</Badge>
                    : <Badge tone="urgent">Out of stock</Badge>}
                {discounted && product.compare_at_paise && (
                  <span className="rounded-full bg-ok-soft px-2.5 py-1 text-12 font-semibold text-ok">
                    Save {percentOff(product.price_paise, product.compare_at_paise)}%
                  </span>
                )}
                {!product.returnable && (
                  <span className="text-12-5 font-medium text-warn">Non-returnable</span>
                )}
                {/*
                  A term of the sale, said before somebody pays. New is the
                  ordinary case and is not called out; the other two are — an
                  undisclosed refurbished unit is a complaint, and the feed
                  declares the condition to Google in the same words.
                */}
                {product.condition && product.condition !== "new" && (
                  <span className="text-12-5 font-medium text-warn capitalize">{product.condition}</span>
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
                <p className="mt-1.5 text-13 text-muted">Includes 18% GST. This is the price you pay.</p>
              </div>

              {product.short_description && (
                <p className="text-14-5 leading-[1.6] text-ink-2">{product.short_description}</p>
              )}

              {/* The product's own tags (0.141.0), each opening the shop filtered to it. */}
              {settingEnabled(settings, "store_tags_enabled") && <ProductTagChips tags={product.tags} />}

              <AddToBasket product={product} />

              {/*
                Save it for later, under the basket rather than beside it: the
                panel's one primary action keeps the row to itself. The product
                as a whole, not the option chosen above — somebody saving a
                switch for later has usually not decided between the 24 and the
                48 ports yet. A client island, filled after mount like the
                cards' hearts, so the page stays in the ISR cache.
              */}
              <WishlistHeart variant="page" productId={product.id} name={product.name} className="justify-self-start" />

              {/*
                The things a buyer checks before pressing the button, in the
                panel that holds the button rather than in a strip further down
                the page. The delivery and returns lines are settings — the
                same two the feed and the schema read — and the other two are
                terms of the shop, not facts about this row.
              */}
              <ul className="grid gap-2 border-t border-line pt-4 text-13 text-muted">
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>{delivery}</li>
                {product.returnable && (
                  <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>{returnDays}-day returns — see our <Link href="/returns" className="underline hover:text-ink">returns policy</Link>.</li>
                )}
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>Sourced from an authorised distributor.</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>Backed by the engineers who install it.</li>
                {/* The warranty as the seller states it — the same string the Offer's `WarrantyPromise` carries. */}
                {product.warranty && (
                  <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>Warranty: {product.warranty}</li>
                )}
              </ul>

              {product.sku && (
                <p className="font-mono text-12-5 text-faint">SKU {product.sku}</p>
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
{children}
          </div>
  );
}

/** The "Watch" row: this product's videos and, after them, other products'. */
export function StoreWatch({ rows, settings }: { rows: VideoShelfRow[]; settings: Settings }) {
  return (
          <VideoShelf
            rows={rows}
            config={videoShelfConfig(settings)}
            heading="Watch"
            size="small"
            contained={false}
            className="mt-14"
          />
  );
}

export function StoreFeatures({ product, heading = "What you get" }: { product: StoreProduct; heading?: string }) {
  return (
    <>
          {product.features && product.features.length > 0 && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">{heading}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {product.features.map((f) => (
                  <li key={f} className="flex gap-2 text-14">
                    <span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
    </>
  );
}

export function StoreSpecs({ product, heading = "Specification" }: { product: StoreProduct; heading?: string }) {
  return (
    <>
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">{heading}</h2>
              <SpecTable specs={product.specifications} />
            </div>
          )}
    </>
  );
}

export function StoreDetails({ product }: { product: StoreProduct }) {
  return (
    <>
          {product.description && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">Details</h2>
              <Prose html={product.description} />
            </div>
          )}
    </>
  );
}

export function StoreDownloads({ product, heading = "Downloads" }: { product: StoreProduct; heading?: string }) {
  return (
    <>
          {(product.downloads?.length ?? 0) > 0 && (
            <div id="downloads" className="mt-14 scroll-mt-24">
              <h2 className="display-3 mb-4">{heading}</h2>
              <DownloadList rows={(product.downloads ?? []).map(downloadRow)} className="max-w-4xl" />
            </div>
          )}
    </>
  );
}

export function StoreApplications({ product }: { product: StoreProduct }) {
  return (
    <>
          {product.applications && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">Applications</h2>
              <p className="whitespace-pre-line text-[16px] leading-[1.72] text-ink-2">{product.applications}</p>
            </div>
          )}
    </>
  );
}

/** "You may also like". */
export function StoreAlsoLike({ alsoLike }: { alsoLike: StoreProduct[] }) {
  return (
    <>
          {alsoLike.length > 0 && (
            <section aria-labelledby="also-like" className="mt-16" data-aos="fade-up">
              <h2
                id="also-like"
                className="mb-6 text-22 font-semibold after:mt-2.5 after:block after:h-[3px] after:w-10 after:rounded-full after:bg-brand-600"
              >
                You may also like
              </h2>
              <ul data-collection="products" data-cols="4" className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                {alsoLike.map((p) => (
                  <li key={p.id}>
                    <StoreProductCard product={p} headingLevel={3} />
                  </li>
                ))}
              </ul>
            </section>
          )}
    </>
  );
}

/** The browser's own list of what was looked at — filled after hydration. */
export function StoreRecent({ product }: { product: StoreProduct }) {
  return (
    <>
          {/* The browser's own list, after hydration; this product is remembered and kept off its own strip. */}
          <RememberProduct product={{ slug: product.slug, name: product.name, image: product.images?.[0] ?? null, focus: product.image_focuses?.[0] ?? null, price_paise: product.price_paise }} />
          <RecentlyViewed exclude={product.slug} className="mt-14" />
    </>
  );
}
