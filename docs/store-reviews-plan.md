# Store product reviews — plan (2026-09-26)

The client asked for a review system on the shop, from five reference
screenshots (a Next-style clothing store): a rating badge on the product card,
a "Reviews 4.8/5 — Based on 9 customer reviews" disclosure on the product page,
a star summary with a "9 Reviews ▾" breakdown, "Write a review", a sort menu
(Featured, Newest, Highest Ratings, Lowest Ratings), review cards (name,
Verified, date, stars, text, "Item type: Black / XL"), "Show more reviews", and
a stepped write-a-review dialog opening on "How would you rate this item?" with
five stars labelled "Dislike it!" … "Love it!".

## Decisions the client made

- **Signed-in customers only** may write a review. A customer with a paid order
  containing the product is **Verified**, and their card carries the variant
  they bought.
- **Staff approve every review** before it appears (the blog-comment rule).
- **No photos** for now.
- **A "How was it?" email after delivery** asks buyers for a review.

## Data

- `product_reviews`: `store_product_id` (cascade), `variation_id` nullable
  (nullOnDelete), `customer_id` (cascade), `order_id` nullable (nullOnDelete —
  the paid order that verifies it), `rating` tinyint 1–5, `title` nullable
  (≤120), `body` text (plain text, ≤2000, stored as typed and rendered escaped),
  `display_name` (snapshot, "First L." from the customer's name at write time),
  `variant_label` nullable (snapshot from the verifying order item), `status`
  (`App\Enums\ReviewStatus`: pending, published, rejected, spam), `is_featured`
  bool, `published_at` (stamped on first publish, never cleared),
  `moderated_by` nullable (users, nullOnDelete), `moderated_at`, timestamps.
  Unique `(store_product_id, customer_id)`; index `(store_product_id, status,
  published_at)`.
- `store_products.rating_average` (decimal 2,1, nullable) and `rating_count`
  (unsigned int, default 0), recomputed by one `ReviewSummary::refresh($product)`
  whenever a review enters or leaves `published` (and on delete), so cards and
  lists never aggregate per row.
- `orders.review_requested_at` nullable timestamp.
- Morph map if the activity log's subject can be a review (it records by rule —
  check `ActivityLogger`), plus `MorphMapCoverageTest`.

## API

Public (`routes/api/public.php`, store block):
- `GET /store/products/{slug}/reviews?sort=featured|newest|highest|lowest&page=`
  — published only, 6 per page; `meta`: `average`, `count`, `distribution`
  `{5:n,4:n,3:n,2:n,1:n}`, pagination. Unknown sort → featured (the catalogue
  rule). Featured = `is_featured` desc, then rating desc, then newest; every
  order ends on id. The resource carries `display_name`, `verified`,
  `variant_label`, `rating`, `title`, `body`, `published_at` — never the
  customer id, email or order.
- `GET /store/products/{slug}/reviews/mine` (portal Bearer, `customer`
  middleware, in `portal.php`) — the caller's own review (any status) or
  `{data:null}`, plus `can_review` and `verified` so the dialog knows.
- `POST /store/products/{slug}/reviews` (portal, throttled) — `rating`,
  `title?`, `body`, honeypot `website`; creates or updates the caller's review,
  back to `pending` on every edit, verified from their paid orders
  (`Order::paid()` containing the product; variant label from that line's
  snapshot). Answers 202 and one sentence.
- Store product index and detail resources gain `rating: {average, count}` or
  `null` when `rating_count` is 0.

Admin (`role:store_manager`, `routes/api/admin-store-manager.php` or wherever
the store routes live):
- `GET /admin/store/reviews` — `?status=` (default pending), `?rating=`,
  `?product=`, `?verified=`, `?q=`, `?sort=`/`?dir=` via `ListSort`,
  `?per_page=` (max 100); `meta.statuses`, `meta.pending_count`.
- `POST /admin/store/reviews/moderate` — `ids[]`, `status` (one at a time or
  fifty; one row at a time so the summary refresh and stamps fire).
- `PATCH /admin/store/reviews/{id}` — `is_featured`.
- `DELETE /admin/store/reviews/{id}`.
- Store dashboard `attention.reviews_pending` linking to the queue.

## The review request email

- `technoweb:request-reviews`, scheduled hourly: orders that are paid (the
  `Order::paid()` definition), not cancelled/refunded, `review_requested_at`
  null, whose `dispatched_at` — or `paid_at` when nothing in the order ships —
  is older than `store_review_request_days` (default 7), with a customer
  account; skipped when the address is on `newsletter_suppressions`; only while
  `QuietHours::allows()`; switch `store_review_requests_enabled` (default on).
  Stamps `review_requested_at` whether or not the send succeeds (Notifier rule:
  never retried into a loop).
- Email template `review_request` in `MessageCatalogueEntries` (grep and update
  every hard-coded message count), listing each product in the order with a
  link to `/store/products/{slug}?review=1`, skipping products already reviewed.
- Store → Settings rows for the switch and the delay (`SettingsSeeder`,
  `settings-copy.ts`, `SettingsScreensTest`).

## Frontend

- **Product card** (`components/store/product-card.tsx` and the compact card if
  it shows a picture): a pill at the image's bottom-left — star glyph, average,
  a divider, count — only when `rating` is non-null; `aria-label` "Rated 4.8
  out of 5 from 9 reviews".
- **Product page** (`app/(marketing)/store/products/[slug]/page.tsx`): a
  "Reviews" section after the details — a `<details>` disclosure styled as the
  reference (star icon, "Reviews 4.8/5", "Based on 9 customer reviews",
  chevron that rotates via the `rotate` property); open by default when
  `?review=1`. Inside: star row + "9 Reviews" button toggling a breakdown
  popover (five bars, counts), "Write a review" button, sort button (sliders
  icon) opening a menu (Featured, Newest, Highest Ratings, Lowest Ratings),
  a 3-column grid (1 on phones, 2 at `sm`) of review cards on a ground (`Card`
  rules), "Show more reviews". The first page renders on the server with the
  product (ISR — tag `store-reviews:<slug>` and revalidated by moderation);
  sort and show-more are a client island fetching through a route handler
  `web/src/app/api/store/reviews/route.ts` (params allowlisted; it may be
  cached briefly since there is no user data). With no reviews: "No reviews
  yet" and the Write button.
- **Write-a-review dialog**: `components/ui/modal.tsx` (`<dialog>`), steps:
  1. "How would you rate this item?" — five stars as a radio group (arrow keys,
  labels "Dislike it!" under the first, "Love it!" under the last, each star
  ≥ 44px, `aria-label` "1 star" … "5 stars"); choosing one advances;
  2. title (optional) + review (required, counter) + submit through a Server
  Action carrying the portal token (`<Form>`);
  3. "Thanks — we'll publish it once it has been checked." Signed-out visitors
  see step 0: "Sign in to write a review" linking to the portal login with a
  `return` path — add a safe return parameter to the portal login (only a
  same-site path beginning with `/` and not `//` or `/\`, else `/portal`),
  applied after password and code sign-in. The whose-review state comes from a
  route handler (`/api/store/reviews/mine?slug=`) called after mount — never a
  cookie read during the product page's server render (ISR).
- **Portal**: on the order detail page, "Write a review" (or "Edit your
  review") beside each store line, linking to the product with `?review=1`.
- **Console**: Store → Reviews (sidebar row under Store, `nav-items.tsx`,
  `AdminNavRolesTest`): `PageHeader`, `FilterBar`, admin table with
  `data-label` cards on phones, bulk selection (the ticket queue's pattern),
  approve/reject/spam/feature/delete, a pending badge; toast outcomes.
- **Colour**: the star gold is a design token (`--color-rating`, plus a fill
  for the empty star outline) defined where hexes may live (`lib/themes.ts` /
  `lib/palette.ts`, both schemes, checked by `npm run themes` at ≥ 3:1 against
  the card and surface grounds — WCAG 1.4.11 for a graphic); never a literal
  in a component.
- **Structured data**: the store Product graph (`StructuredData`) gains
  `aggregateRating` (ratingValue, reviewCount, bestRating 5) and up to five
  `review` nodes (author name, datePublished, reviewRating, reviewBody) when
  `rating_count >= 1` — published reviews only. Update the "Not built,
  deliberately" paragraph in `docs/store.md`: they are real now, and still
  never invented.

## Docs and gates

`docs/store.md` section "Reviews", one line per rule under "The store" in
`CLAUDE.md`, `API.md` routes, `web/mock-api.mjs` endpoints and sample reviews,
`types/api.ts`, audit route lists (`audit.mjs`, `mobile-audit.mjs`: the queue,
a product page with reviews). Feature tests: signed-out refused, one per
customer (edit returns to pending), verified only with a paid order,
unpublished never listed, summary recomputed on publish/unpublish/delete,
sorts, distribution, the request command (delay, digital-only, suppression,
quiet hours, once per order, skips reviewed), staff role gate, the safe
return path.
