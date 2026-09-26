# Store: specification filters, product video + zoom, Meta/WhatsApp catalogue — plan (2026-09-26)

Three client requests from the Shopify gap list. Decisions: **filters are
chosen per category from the products' existing spec sheets**; **videos are
YouTube links and uploaded MP4/WebM from the media library**.

## 1. Specification filters

- `store_product_specs` (derived, rebuilt in `StoreProduct` `saved` hooks and
  a `technoware:rebuild-store-specs` command for existing rows):
  `store_product_id`, `label`, `value`, `label_key`/`value_key` (normalised:
  trim, collapse whitespace, lower-case), indexed `(label_key, value_key)` and
  `(store_product_id)`. Values come from the product's `specifications`
  (`App\Casts\SpecSheet`) **and** each active variation's `options`, so a
  product matches when any variation has the value.
- `store_categories.filter_specs` JSON **list** of spec labels, ordered,
  edited on the store category form: chips of the labels actually used by
  that category's published products (with product counts), tick and
  reorder (`ReorderButtons`).
- API: `GET /store/products?category=&spec[<label>][]=<value>` — OR within a
  label, AND across labels, matched on the keys; unknown labels ignored.
  `GET /store/categories/{slug}/facets?spec[..]` — for each filter label, the
  values with counts under the *other* selections (standard facet counting),
  in a natural order (numbers sorted numerically where the value starts with
  one, e.g. "8 ports" < "24 ports"); cache 5 min keyed on category and the
  newest product `updated_at` — but never cache the per-query variant
  (the "never cache a user's query" rule).
- Frontend: `/store` (already dynamic) shows a "Filter" panel when a
  category with `filter_specs` is selected — sidebar at `lg`, a disclosure/
  drawer on phones, checkbox groups with counts, selected chips with × and
  "Clear all"; GET form through the existing `AutoApplyForm`. The ISR category
  page `/store/categories/[slug]` must NOT read `searchParams`: it shows the
  same panel built from the unfiltered facets (cached fetch) whose choices
  link to `/store?category=<slug>&spec[..]`. `listingMetadata` treats
  `spec` as a filter (noindex, follow); `storeProducts(..., cache)` is false
  whenever a spec filter is present. Pagination keeps the spec params.
- Admin: the category form's filter picker; `mock-api.mjs` facets.

## 2. Product video and image zoom

- `store_products.videos` JSON list (max 4): `{kind: youtube|file, youtube_id?,
  path?, title?, poster_path?}`; validation via `App\Support\YouTube::id()`
  for links and a media-library path check (mp4/webm) for files, poster an
  image path. Admin: a "Videos" repeater on the Media tab (paste a YouTube
  link, or pick a file through `MediaBrowser`), added to that tab's
  `fields` list (the `form-tabs` rule).
- Product page gallery (`components/product/product-gallery.tsx`,
  store-only behaviour behind a prop so the catalogue is unchanged): video
  thumbnails after the images with a play glyph; in the well a YouTube video
  is the click-to-play facade (`youtube-nocookie`, uploaded poster or the
  blog facade's drawn poster — **never i.ytimg.com**, `slide-media.tsx` /
  `youtube-embed.tsx` are the patterns); a file is `<video controls
  preload="none" playsInline poster>`. Also show thumbnails for **all**
  images (not just the first five) in a scrollable strip. `next.config.ts`:
  add the asset origins to `media-src` (report-only set) so a video from the
  API origin is not a CSP report.
- Zoom:
  - In the well at `lg` with a fine pointer: a hover magnifier — the image
    scaled 2× inside the well with `transform-origin` following the pointer
    (the `scale` property, never a `transition-transform` utility), under
    `(hover: hover)` and reduced-motion aware; the well stays clickable to
    open the lightbox.
  - In the lightbox (`components/ui/gallery.tsx`): click/double-click/`+`/`-`
    /`0` to zoom 1×–3×, drag to pan (pointer capture), pinch on touch,
    wheel with Ctrl; reset on slide change; the zoomed image loads a wider
    `sizes` variant. Keyboard and screen-reader labels ("Zoom in", "Zoom
    out", "Reset zoom").
- `StructuredData::storeProduct()`: add `subjectOf` VideoObject nodes for
  YouTube videos (name, thumbnailUrl only when a poster is uploaded, embedUrl,
  uploadDate = product updated_at) — only if every required property can be
  filled honestly; otherwise skip and say why in docs.

## 3. Meta (Facebook/Instagram) + WhatsApp catalogue feed

- Meta Commerce Manager (which also powers the WhatsApp Business catalogue)
  reads a scheduled data feed. Build it from the same rows as the Google
  feed (`App\Support\Store\ProductFeed::build`, `GET /store/feed`) — one
  source of truth — mapped at the frontend sink like `store/feed.xml`:
  - `web/src/app/meta-catalogue.xml/route.ts` — RSS 2.0 with the `g:`
    namespace (Meta accepts Google's format): id, title, description,
    availability mapped to Meta's values (`in stock`, `out of stock`,
    `available for order` for backorder), condition, price/sale_price as
    `1180.00 INR`, link, image_link, additional_image_link, brand,
    item_group_id, gtin/mpn, google_product_category, `product_type`,
    size/color from variation options, `quantity_to_sell_on_facebook` omitted
    (stock is never published).
  - `web/src/app/meta-catalogue.csv/route.ts` — the same fields as CSV (Meta
    accepts CSV; some staff prefer it), every cell escaped (a formula cell
    guard like `Csv::escape`).
  - Same caching as the Google feed (`revalidate = 3600`, the same error
    behaviour: an empty feed, never a 500).
- Settings (`store` group): `meta_catalogue_enabled` (default on) — when off
  both routes answer 404.
- Console: on the store products screen, the feed card lists both feeds
  (Google + Meta XML + Meta CSV) with copy buttons and plain `<a download>`
  links, and a short "How to connect" disclosure (Commerce Manager → Data
  sources → Data feed → Scheduled, paste the URL; WhatsApp Business Manager →
  Catalogue → connect the same catalogue).
- Docs: `docs/store.md` sections; `CLAUDE.md` store lines; `API.md` if the API
  changes; `robots.ts`/`sitemap` unaffected.

## Tests and gates

Feature tests: spec index rebuild on save (product + variation options),
filter AND/OR semantics, facet counts under other selections, category
`filter_specs` validation (labels must exist), video validation (YouTube
lookalike hosts refused, non-video media refused, max 4), `meta_catalogue`
setting. Frontend: `tsc`, `lint`; add `/meta-catalogue.xml` to nothing (not a
page); add a filtered `/store?category=…&spec…` URL to the audit lists.
