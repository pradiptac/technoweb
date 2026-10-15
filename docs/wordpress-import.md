# Importing a WordPress / WooCommerce site

System → **WordPress import** (`/admin/imports/wordpress`, `role:admin`). Reads a
WordPress site over its REST API — and, with WooCommerce, the shop's — and
brings across what has a home here: posts, pages, categories, comments,
menus, media, Yoast/Rank Math metadata, custom post types, ACF values,
products and their variations, shop categories, brands, stock, customers,
coupons, orders with their payments, refunds and notes, and reviews.

It cannot be perfect, because the two systems model different things. It is
**complete and accountable**: everything with a home arrives exactly, and
everything without one is named — grouped by reason, with examples — before
anything is written.

## The flow

1. **Scan** (queued, sliced). `RunWordPressImport` phase `scan` reads the
   site into a harvest: one JSONL file per collection under
   `storage/app/private/wordpress-imports/{id}/`, plus `state.json` (the task
   list and cursor). `Scanner` discovers the API root (`/wp-json/` or
   `/?rest_route=/`), the namespaces (WooCommerce, ACF, Yoast, Rank Math) and
   WooCommerce's currency, weight unit and tax basis, then pages through each
   collection with `context=edit`. A variable product spawns a variations
   task and an order an order-notes task; each record they return is stamped
   `_parent`. An **optional** endpoint answering 401/403/404 (menus, brands,
   users, a custom post type) goes in `missing` with the site's words and the
   scan carries on.
2. **Analyse** (queued, sliced). The dry run: every step's `plan()` over
   every record, nothing written, media counted rather than fetched. Ends
   `ready`, with the review's payload on `analysis`.
3. **Review.** The person reads the plan and settles the decisions; a
   `PATCH` re-runs the analysis, so the counts shown are always the commit's.
4. **Commit** (queued, sliced). The same steps, planning and writing, one
   record per transaction. Ends `completed`; the harvest is deleted.

Status: `pending → scanning → analysing → ready → running → completed`, with
`failed`, `cancelled` and `expired` the ways out. One import at a time.

## Credentials

An **application password** (Users → Profile → Application Passwords) for
`wp/v2` — and for `wc/v3` too, which WooCommerce accepts from a shop manager
or an administrator. A **WooCommerce REST key and secret** (read access) is
optional and used instead when given; WooCommerce accepts its own keys only
over https. Both go as HTTP Basic auth. They are sealed in the cache by `SealedCache` under
a key only the scan's job chain carries, for six hours at most, and forgotten
the moment the scan stops — never a settings row, never a job payload, never
on the import row. The commit needs none: uploads are public URLs.

## Reading an address somebody typed

Every request goes through `App\Support\Net\SafeHttp`, extracted from
`DeliverWebhook` (which now uses it too): the host is resolved, every answer
must be public (`PublicHost`), cURL is pinned to those addresses
(`CURLOPT_RESOLVE`), and redirects are followed **by hand** — at most three,
each hop checked and pinned, never from https to http, and the
`Authorization` header dropped the moment the host changes. Downloads are
capped (`max_media_bytes`, 50MB). `WORDPRESS_IMPORT_ALLOW_PRIVATE=true` lets a
Laragon WordPress on this machine be the source, and is ignored unless
`APP_ENV=local`.

## The steps, in order

`Importer::steps()` — the order is the dependency order.

| Step | Becomes | What does not come across |
|---|---|---|
| Whole media library (only when chosen) | media | — |
| Blog categories | `BlogCategory` (a slug already here is taken over) | nesting (flat here); "Uncategorized" |
| Content types | `ContentType` per custom post type | a type whose address is reserved, a page's or another type's — skipped until given another in the review |
| Custom field groups | one "Imported from WordPress" group per target | ACF repeaters, flexible content, groups, galleries, relationships |
| Blog posts | `BlogPost`, featured image, categories, author by staff address, sticky → featured | tags; private and password-protected posts arrive as drafts |
| Pages | `Page` | nesting (old nested address redirected); WooCommerce's cart/checkout/account/shop pages |
| Entries | `Entry` of the type it became | — |
| Shop categories | `StoreCategory` | nesting; "Uncategorized" |
| Brands | `Brand` (same slug or name taken over) | — |
| Products | `StoreProduct` + variations, stock via `StockLedger` | grouped, external, subscription, bundle, composite, booking and downloadable products; an "any value" variation; tags; categories beyond the first; pictures beyond twelve; scheduled sale end dates |
| Customers | `Customer`, active, unconfirmed, random password | WordPress passwords; administrators, shop managers, editors, authors and contributors (WooCommerce's `role=all` lists every user) |
| Coupons | `Coupon` (percentage / fixed basket) | fixed-per-product coupons; product, category and email restrictions, free shipping, exclude-sale, maximum spend (named per code) |
| Orders | `Order` + snapshot lines, payments, refunds, notes, coupon uses | non-INR orders; abandoned checkouts |
| Product reviews | `ProductReview` | reviews by somebody with no account; an older second review by the same customer |
| Comments | `BlogComment` (one level of replies) | pingbacks; comments on pages and products |
| Menus | `Menu`, **unassigned** | items nested past three levels are lifted to the third |
| Links | old-site `href`s in imported bodies rewritten to new paths; linked upload files brought into the library | — |
| Redirects | a 301 from every imported record's old address — "Plain" permalinks' `/?p=123`, `/?page_id=`, `/?product=`, `/?cat=` included — plus `/shop` → `/store` | any old path that collides with a route, page or archive here |

## Rules worth knowing

- **Dry run and commit are one loop** (`Importer::run`), both sliced with a
  cursor on `progress` (`analyse` / `commit`: step, offset, report, and for
  the dry run the map's planned set). A dry-run step marks what it plans to
  create (`ImportMap::plan()`), so a later step sees it coming — an order line
  "has" its product in the preview exactly as in the commit.
- **Re-running updates rather than copies.** `wordpress_import_map` (site
  hash, source type, source id → morph alias, target id, old URL) is the
  identity. A second import of the same site before cutover picks up what
  changed; a slug is never changed on a second run (it would make
  `Sluggable` write a stray redirect).
- **Orders are history, inserted in their final state** — never through
  `Checkout`, `Settlement` or `moveTo()`, which send mail, messages and
  webhooks, take stock and mint accounts. On a second run they are updated
  with `saveQuietly()`. Numbers are `WC-{number}`, outside the
  `ORD-{year}-` sequence `Order::nextNumber()` reads. `review_requested_at`
  is stamped or the hourly review request would mail every past customer.
- **The lines add up to the total.** Line = subtotal + its tax; shipping and
  fees are service lines; a negative fee is discount; GST is WooCommerce's
  recorded tax. A remaining gap over ₹1 is flagged.
- **Paid** is `date_paid`; a completed cash-on-delivery order without one was
  paid when completed; a processing one is `confirmed`.
- **Prices**: `Money::fromRupeeString`, never a float. Catalogue prices
  follow the review's `tax_basis` (`keep` or `add_gst`) when WooCommerce added
  tax on top; order totals never change. A shop not selling in INR imports no
  products, coupons or orders.
- **Media** is fetched on demand by `Context::media()` — only what imported
  records show, unless "whole library" is chosen — through
  `MediaUploader::storeFromPath()`: the console upload's extension list
  (checked against the bytes), size limit, megapixel ceiling and SVG
  sanitiser; the MIME recorded is `finfo`'s. `-300x200` resized copies map to
  the original. Bodies go through `HtmlSanitiser::clean()` with `srcset`
  dropped.
- **Yoast**: a title that is only the record's title plus the old site's
  name is not an override; a canonical pointing at the old site is never
  copied; robots only when it says `noindex`/`nofollow`. **A head is used
  only when its canonical (or og:url) is the record's own address**: without
  its index built — Yoast builds it on production sites only, and after bulk
  changes it wants "Optimise SEO data" — Yoast answers a collection request
  with the *first* post's head on every post. Measured on a real site: three
  posts, one title. The review warns and says how to fix it at the source.
- **ACF kinds are inferred** from up to twenty values per field, shown in the
  review and changeable; values are validated through `CustomFields::rules()`
  one at a time. WooCommerce's API has no `acf` key; a product's ACF values
  are recognised in `meta_data` by their `_name → field_…` companion.
  WordPress exposes `acf` only with "Show in REST API" on each field group —
  the review says so when ACF is installed and nothing arrived.
- **Nothing is sent.** Per-record IndexNow pings are suppressed for the whole
  commit (`IndexNow::suppressed`). Customers join "Existing customers" through
  their own model hook, as the client decided (2026-09-26), and the review
  names the running sequences that would then email them.
- **Staff are never created.** An author matches a staff account by address
  or is left blank.

## Redirects from query addresses

A site on WordPress's "Plain" permalinks reports each record's address as a
query — `?p=62`, `?page_id=5`, `?product=cap`, `?product_cat=hoodies`.
`LinksStep::normalise()` keeps that as the old address in one shape,
`/?{name}={decoded value}`, and `proxy.ts` looks a request up in the same
shape **only on the home path** (`/` or `/index.php`): each parameter is tried
as a key, the one that matches is dropped, and the rest of the query (tracking
tags) rides along to the destination. A real page's own query —
`/store?category=…` — is never read as one. Body links in the query form are
rewritten the same way.

A shop category's old address comes from WordPress's own `wp/v2/product_cat`
(same term id): WooCommerce's REST record carries none, and a shop may have
renamed `/product-category/` or use Plain permalinks. Only when WordPress will
not say is the default base assumed.

## Operations

- `technoware:prune-wordpress-imports` (hourly): a `ready` import past three
  days is `expired` and its harvest deleted — it holds customers' addresses
  and orders; an import stuck two hours is `failed`.
- A commit that fails (a slice killed past its timeout, the worker
  interrupted) keeps its cursor; **Resume** carries on from the last
  checkpoint.
- The scan and commit are refused when nothing drains the queue
  (`QueueHealth::delivering()`).

## Verified against a real site (2026-09-27)

A WordPress 6 with WooCommerce's own sample catalogue (18 products: simple,
variable, grouped, external, downloadable), ACF (free) with a field group
shown in REST, Yoast, a portfolio post type, nested categories and pages,
threaded comments, a menu, customers, coupons and three orders placed through
WooCommerce's own order API (a coupon and shipping, a guest's cash on
delivery, a bank transfer with a partial refund) — served locally with
`WORDPRESS_IMPORT_ALLOW_PRIVATE`, imported into a scratch database through a
second API instance. The commit's counts matched the review's exactly; the
orders reconciled to the rupee; a second run after changing a price and
adding a post added one post, updated everything else and doubled nothing.
Four things only a real site showed, all fixed with a test: Yoast's shared
head (above), the WordPress administrator arriving as a customer,
"Uncategorized" as a blog category, and WooCommerce refusing its own keys
over http (the application password now reads the shop too).

## Pages as builder sections (0.109.0)

The review's **How pages arrive** (`page_layout`, default `sections`): a page
is laid out as builder sections, its body kept beside them as the fallback,
or (`html`) arrives as one text body as before. Posts and articles have no
builder and are unchanged.

- **Read from the blocks** when the page was written in the block editor:
  `content.raw` (harvested with `context=edit`) is parsed by
  `App\Support\WordPress\GutenbergSections` — a tokenizer for the
  `<!-- wp:… -->` comments that keeps each container's own markup and its
  children in their saved order (`seq`). The page's first `core/cover` (or a
  level-1/2 heading with a picture straight after it) becomes the **hero**,
  `core/media-text` a **picture with text**, `core/columns` of two to four
  short columns **features**, a quote with a citation a **testimonial**, a
  YouTube embed a **video**, a separator a **divider**, consecutive
  `core/details` a **questions** section, and `core/buttons` the buttons of
  the hero or picture-with-text before them. Everything else gathers into
  text sections, a new one at each level-2 heading.
- **Nothing is dropped for not fitting**: a quote with nobody named, a column
  too long to be a point, a cover with no heading falls back to its markup in
  a text section. A dynamic block whose saved markup is empty (latest posts)
  has nothing to bring and the review names it.
- **Split at headings instead** (`BodySections` on the rendered body) for a
  classic-editor page, a page laid out by Elementor, Divi or WPBakery, or one
  whose shortcodes only the rendered HTML expanded — the raw blocks would
  show `[contact-form-7]` as text.
- Every piece of markup goes through `Step::body()` (uploads re-homed in the
  library, the sanitiser); picture fields take the path `Context::media()`
  answers, by attachment id first and URL second.
- **A second run** lays a page out only while it is still as the import left
  it — `template = default` and no sections. A template or sections chosen
  here since are never overwritten.
- **Links** between imported pages are rewritten inside sections too: every
  section `body` as markup and every `href` (buttons, features) by
  `LinksStep`.

## What the import recognises (0.110.0)

A page builder leaves a signature in the rendered page — Elementor's
`elementor-widget-*` classes and `data-widget_type`, Divi's `et_pb_*`,
Spectra's `wp-block-uagb-*`, Kadence's, Stackable's `stk-*`, the core
`wp-block-*` — and the rendered HTML has every shortcode expanded, so a form
is a real `<form>`. `App\Support\WordPress\Rendered\RenderedSections` walks
it: each element is offered to the recognisers in `Rendered/Recognisers/`, the
first to claim it answers a piece, and an element nobody claims is looked
inside when it is only a wrapper and kept as text when it is not.

| Found | Becomes |
|---|---|
| a form (Contact Form 7, WPForms, Gravity Forms, Elementor, Divi, Formidable, or any `<form>` with fields) | a published **form** + a `form` section |
| price tables (Elementor, Divi, Stackable, a theme's `pricing-table`/`price-card`), or a row of two to four cards each with a price, a list and a link | a published **pricing block** (`three_tier`, four plans a block) + a `content_block` section |
| a gallery or carousel (core, `[gallery]`, Elementor, Divi, Spectra, Kadence) | a published **gallery** + a `gallery` section |
| testimonials | `testimonial` (one) / `testimonials` (two or more) |
| counters / progress bars | `stats` as figures / as bars |
| accordions, toggles, Yoast and Rank Math FAQ blocks, `<details>` | `faq` |
| tabs | `tabs` |
| a call-to-action box | `cta` |
| icon boxes, image boxes, blurbs, info boxes | `features` |
| icon lists | `checklist` |
| a timeline / how-to steps | `timeline` / `steps` |
| a YouTube video | `video` |
| a cover or full-width header opening the page | `hero` |
| a divider | `divider` |

- **Neighbours of one kind are one section** (`Piece::MERGES`): three price
  tables in three columns are one block of three plans, four counters one
  figures section. A heading just above becomes the section's heading, and a
  short line above that heading its kicker.
- **Everything must pass its target's rules** — `SectionRules::for()`, the
  pricing block's `BlockRules` with `after()`, `StoreFormRequest::formRules()`
  for a form's fields. One that does not (one milestone, a plan without a
  price) is kept as its markup in a text section; nothing is lost and nothing
  invalid is stored.
- **A price is paise only when it says rupees and a period** (`₹1,999/month`,
  `Rs. 24000 per year`); anything else — `$49`, `Custom`, a rupee figure with
  no period, which the block would label "per month" — is kept as the words
  shown (`PriceReader`). A plan's link to the old site becomes a path, which
  the redirects step answers.
- **A form** (`FormReader`): labels from `<label for>`, a wrapping label, the
  field group's label, `aria-label` or the placeholder; a radio group or a set
  of checkboxes becomes a choice from a list, a lone checkbox a tick box;
  hidden fields, honeypots, captchas, passwords and buttons are left out, and a
  file upload is named in the review ("has no field here"). A field key is the
  plugin's own name where it means something (`your-email` → `email`) and the
  label otherwise (`wpforms[fields][3]` → `company_name`), never `website`.
  `notify_email` is left blank, so submissions go to the sales address and the
  leads pipeline.
- **One form per form**: the same Contact Form 7 form on twelve pages is one
  form, found by the plugin's id (`cf7:123`, `wpforms:45`, `gform:2`,
  `elementor:<id>`) or by its fields. Pricing blocks and galleries are keyed
  by the page and their place on it.
- **The records are created in the commit only** (`Parts`, writing mode). The
  review counts them under a step of its own, "Forms, pricing tables and
  galleries", once per run, as reasons of kind `info`. A second run reuses a
  record it finds in the map and leaves it as it stands here.
- **A block-editor page** uses the same recognisers for any block
  `GutenbergSections` does not map itself (a gallery, a group, a plugin's
  block, columns that are not features), and a form block that saved only its
  id (WPForms, Gravity Forms) takes the page's next rendered form.

## Tests

`tests/Feature/WordPressImportTest.php` drives the whole flow against a faked
site (`Http::fake`, `PublicHost::RESOLVER` bound): the review's counts and
reasons, credentials kept off the row and off other hosts, the commit's
every mapping, nothing sent and no webhook, a second run updating in place,
`add_gst`, a foreign currency, menus, private and disguised hosts and a
redirect into the network refused; a block-editor page arriving as a hero and
text sections with its cover in the library and its links rewritten inside a
section, a classic page split at its headings, `page_layout: html`, and a
second run leaving sections arranged here alone.
`tests/Unit/GutenbergSectionsTest.php` — the parser's nesting and saved order,
each mapping, the fallbacks and the named dynamic blocks.
`tests/Unit/RenderedSectionsTest.php` — Elementor, Divi, Spectra, Yoast,
Contact Form 7, WPForms and Gravity fixtures, the grouping, headings and
kickers, prices, the fallbacks. `WordPressImportTest` adds an Elementor site
whose form, pricing block and gallery are created published and placed (one
form for two pages, submitted into the leads pipeline, reused on a second run,
nothing created in the review or under `page_layout: html`) and a form block
that saved only its id.
