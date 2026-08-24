# Technoware REST API — `/api/v1`

Every read and write in the product goes through this API. The Next.js
frontend never touches MySQL.

Generated from the live route table (`php artisan route:list`). If you add a
route, add it here — a reference that has silently drifted is worse than none.

---

## Conventions

**Base URL** — `https://api.technoware.in/api/v1` in production,
`http://127.0.0.1:8000/api/v1` locally.

**Always send `Accept: application/json`.** Without it Laravel answers
unauthenticated requests with an HTML redirect and you get a 500 instead of a
401. Every client in this repo sets it.

**Versioning** — the whole surface sits under `/v1` so a breaking change can
ship as `/v2` without stranding the deployed frontend.

**Response envelopes** — a single record is `{ "data": {…} }`. A collection is
either `{ "data": [...] }` or, when it paginates, `{ "data": [...], "meta": {…}, "links": {…} }`.
Index endpoints backed by a paginator return `meta.current_page`,
`meta.last_page`, `meta.per_page` and `meta.total`. These are **not**
interchangeable: products, blog, knowledge base and every admin index
paginate; solutions, services and industries return a plain collection.

**Errors** — `{ "message": "…" }`, plus `{ "errors": { "field": ["…"] } }` on a
422. Status codes used: 401 unauthenticated, 403 wrong principal or missing
role, 404 not found (also returned instead of 403 where a 403 would confirm a
record exists), 422 validation, 429 rate limited.

**Rate limits** — `POST /enquiries` 10/min, `POST /auth/login` and
`POST /admin/auth/login` 10/min, `POST /tickets` 20/min. Login additionally
throttles per email+IP after 5 failures, so one attacker cannot lock out a
whole office.

---

## Authentication

Two entirely separate principals, and the distinction is load-bearing:

| | Customers | Staff |
|---|---|---|
| Model | `Customer` | `User` |
| Log in at | `POST /auth/login` | `POST /admin/auth/login` |
| Token name | `portal` | `admin` |
| Cookie (frontend) | `tw_session` | `tw_admin_session` |
| Reaches | `/tickets`, `/auth/*` | `/admin/*` |

Both return `{ "token": "…", "customer"|"staff": {…} }`. Send it as
`Authorization: Bearer <token>`. Tokens last 14 days and logging in again
revokes the previous token of the same name.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | Customer. Public, throttled |
| `POST` | `/auth/logout` | Customer. Revokes the current token |
| `GET` | `/auth/me` | Customer |
| `POST` | `/admin/auth/login` | Staff. Public, throttled |
| `POST` | `/admin/auth/logout` | Staff. Revokes the current token |
| `GET` | `/admin/auth/me` | Staff, with roles. **Not role-gated** — every role needs to be able to check its own session |

**A staff token cannot use the portal endpoints and a customer token cannot
use the admin ones** — both directions return 403. This is enforced by
middleware (`EnsureUserIsCustomer`, `EnsureUserHasRole`) rather than in
controllers, because the portal authorises by comparing the caller's id to a
ticket's `customer_id`: those ids come from two different tables and collide
whenever the numbers happen to match.

The frontend keeps tokens in httpOnly cookies and calls the API server-side.
Browser JavaScript never sees a token.

### Roles

`admin`, `support_engineer`, `content_manager`, `seo_manager`. **An `admin`
passes every role check implicitly**, so a route only ever declares the
specific role it needs.

---

## Public endpoints

No authentication. Cacheable; the frontend ISR-caches most of these.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | Version banner and endpoint list |
| `GET` | `/products` | Paginated. `?q=` search, `?category=`, `?brand=`, `?sort=`, `?page=` |
| `GET` | `/products/{slug}` | |
| `GET` | `/product-categories` | Plain collection, each with `product_count` |
| `GET` | `/product-categories/{slug}` | Adds `related_solutions` |
| `GET` | `/brands` | Brands that have a published product. Plain collection |
| `GET` | `/solutions` | Plain collection |
| `GET` | `/solutions/{slug}` | Includes benefits, technologies, related products, industries, FAQs |
| `GET` | `/services` | Plain collection |
| `GET` | `/services/{slug}` | |
| `GET` | `/industries` | Plain collection |
| `GET` | `/industries/{slug}` | |
| `GET` | `/blog` | Paginated, published only, newest first |
| `GET` | `/blog/{slug}` | |
| `GET` | `/case-studies` | Published only |
| `GET` | `/case-studies/{slug}` | Includes the `results` figures |
| `GET` | `/knowledge-base` | Paginated. `?q=` search, `?category=` |
| `GET` | `/knowledge-base/{slug}` | |
| `GET` | `/pages` | Published CMS pages, **without bodies**. For the sitemap |
| `GET` | `/pages/{slug}` | CMS pages — `/privacy`, `/terms`, `/downloads` |
| `GET` | `/ticket-categories` | Powers the submit-a-ticket form |
| `GET` | `/settings` | Site settings. **Whitelisted by group**, see below |
| `GET` | `/search?q=` | Site-wide search, grouped by type. Min 2 characters, 5 per group |
| `GET` | `/search?q=` | Site-wide search, grouped by content type. **Never cache this** |
| `GET` | `/redirects/lookup?path=/blog/old-slug` | 200 with `{data:{to,status}}`, or 404 |
| `POST` | `/enquiries` | Contact form. Throttled 10/min, honeypot field |

**`?sort=` is a whitelist of three orderings** — `featured` (the default),
`name` and `newest` — and an unrecognised value falls back to the default
rather than returning 422. A sort parameter is the kind of thing that arrives
mangled from an old bookmark, and an error page is a worse answer than the
catalogue's own order. Every ordering ends on `name` so the sequence is total:
without a tiebreak, a page boundary can show one row twice and hide another,
because MySQL is free to order equal rows differently between two queries.

**Catalogue search matches the brand name as well as the product's.** The
manufacturer is rarely in the product's own name — "6100 48G Switch" is an
Aruba and nothing in that string says so — and searching a hardware catalogue
by brand is the first thing this audience tries. It returned nothing.

**`/brands` lists only brands with a published product.** A facet that can
only ever return an empty result is worse than an absent one: the visitor
reads the empty page as "they do not carry this" rather than "that filter was
never going to match".

**A category's detail response carries `related_solutions`.** A category has
no solutions of its own — the relation lives on the product — so it is the
distinct set across everything published in it, capped at six. It is the one
cross-link a category listing can offer that is not more hardware: someone
reading a switch listing is usually part-way through a networking project.

**`/settings` returns a whitelist, not a filtered dump.** Only the `general`,
`contact` and `social` groups are public; the same table also holds SEO
defaults and the portal toggle. "Return everything except what I remembered to
hide" is the wrong default on an unauthenticated endpoint — a setting added
later is private until somebody deliberately makes it public. Null and empty
values are dropped, so a caller gets `undefined` rather than a blank string.
The response is a flat `{ "data": { "key": "value" } }` map.

**`/pages` exists so the sitemap can find CMS pages.** They are rows, not
routes, so nothing could enumerate them and `/privacy`, `/terms` and
`/downloads` were all missing from `sitemap.xml`. It returns
`PageSummaryResource` — id, title, slug, updated_at and the resolved `seo` —
deliberately without `body`: building a list of URLs has no use for the HTML,
and the cost of shipping it grows with every page an editor adds.

**`/search` ranks an exact part number first.** This audience searches
`CBS350-24T` far more often than it searches prose, and putting that below a
product whose description happens to contain the string is the difference
between a search people use and one they stop using. Each group reports the
total it found, not the number returned — "5 results" is a lie when there are
23. Terms under two characters return nothing rather than most of the
catalogue.

It is LIKE against a handful of columns, not a search engine. That is a
deliberate ceiling for a catalogue in the hundreds: the database is already
there, and a Scout driver plus a Meilisearch container is a lot of
operational surface for this corpus. It needs replacing at five figures; the
shape of the endpoint would not change.

**Never ISR-cache a search response.** `?q=` has an unbounded key space, so
caching it fills the cache with single-use entries and serves a stale empty
result for the whole revalidate window. `publicApi.products()` and
`publicApi.knowledgeArticles()` take a `cache` flag for exactly this.

**`/search` ranks an exact part number first.** This audience searches
`CBS350-24T` far more often than prose, so a SKU that matches exactly outranks
a product whose description merely contains the string. Each group carries the
count of *every* match alongside the five it returns — "5 results" is a lie
when there are 23. It is LIKE against a handful of columns rather than a search
engine: a deliberate ceiling for a catalogue in the hundreds, and one that will
need replacing well before it reaches five figures.

**Knowledge-base search matches tags and a punctuation-stripped title**, so
`wifi` finds "Wi-Fi". People do not type hyphens.

---

## Customer portal

`Authorization: Bearer <portal token>`. Every query is scoped to the
authenticated customer — no code path here can reach another customer's data.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | Public. Returns token + customer |
| `POST` | `/auth/logout` | Revokes the current token |
| `GET` | `/auth/me` | The signed-in customer |
| `PATCH` | `/auth/profile` | Name, email, company, phone, password. Changing the password revokes every other session |
| `GET` | `/tickets` | `?status=`, `?per_page=` (max 50) |
| `GET` | `/tickets/summary` | Counts by status for the dashboard |
| `POST` | `/tickets` | multipart. `subject`, `description`, `ticket_category_id`, `priority`, `attachments[]` |
| `GET` | `/tickets/{reference}` | Bound by reference (`TW-2026-00001`), not id |
| `POST` | `/tickets/{reference}/messages` | multipart. `body`, `attachments[]` |
| `POST` | `/tickets/{reference}/close` | |
| `POST` | `/tickets/{reference}/reopen` | |
| `GET` | `/ticket-attachments/{id}` | Streams the file |

**Internal notes never appear here.** The customer controller loads
`publicMessages`, not `messages`, and the attachment download refuses
anything hanging off an internal note.

**Attachments live on the private disk** and only ever stream through this
authorised endpoint. There is no public URL for one.

---

## Admin — tickets (`role:support_engineer`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/dashboard` | Counts, high priority, status breakdown, and a `metrics` block: 30-day volume, trend, median first response and resolution, SLA rate, open by priority and category |
| `GET` | `/admin/users` | Active staff, for assignment pickers |
| `GET` | `/admin/tickets` | `?status=`, `?priority=`, `?assigned_to=`, `?unassigned=1`, `?overdue=1`, `?q=`, `?per_page=` (max 100). Critical first, then oldest |
| `GET` | `/admin/tickets/{reference}` | Includes internal notes and the audit trail |
| `PATCH` | `/admin/tickets/{reference}` | `status`, `priority`, `assigned_to`, `ticket_category_id` |
| `POST` | `/admin/tickets/{reference}/reply` | multipart. `body`, `is_internal`, `attachments[]` |
| `GET` | `/admin/ticket-attachments/{id}` | Staff download — no ownership check, and internal-note attachments are allowed |

**The dashboard's `metrics` are medians, not means**, and `null` rather than
zero when nothing has been measured — zero reads as "instant". `sla_first_response`
carries the sample it was taken from, because 100% of two tickets and 100% of
two hundred are not the same claim. `volume_trend.change` is `null` when the
previous window was empty: going from no tickets to some is not a percentage.
The 30-day series fills empty days with zeroes, or a chart drawn from it puts
a busy Tuesday next to a busy Friday as though they were consecutive. See
`App\Support\TicketMetrics`.

Status changes are validated against `TicketStatus::canTransitionTo()`; an
illegal move returns 422 naming both states. Every change is written to the
ticket's event log. Assigning an unassigned `open` ticket moves it to
`assigned` automatically, and a customer-visible reply on an `open` ticket
moves it to `in_progress` and stops the first-response SLA clock — an
internal note does neither.

---

## Admin — CMS (`role:content_manager`)

All five verbs per entity, all bound **by id, not slug** — the edit form
changes the slug it is addressed by, so a slug-bound route would break
mid-save.

### Entities

| Entity | Base path | Beyond the common fields |
|---|---|---|
| Blog posts | `/admin/blog-posts` | `author_id`, `published_at`, cover image. `reading_minutes` is derived on save and not accepted |
| Knowledge articles | `/admin/knowledge-articles` | `tags[]`, `knowledge_category_id`, `published_at`. `view_count`/`helpful_count` are read-only telemetry |
| Case studies | `/admin/case-studies` | `client_name`, `industry_id`, `results[{value,label}]`, cover image. **No `published_at`** — status alone decides |
| Solutions | `/admin/solutions` | `problem_statement`, `overview` (rich text), `benefits[]`, `technologies[]`, `icon`, `hero_image_path`, `sort_order`, `product_ids[]`, `industry_ids[]`, `faqs[{question,answer}]` |
| Services | `/admin/services` | `icon`, `sort_order`, `faqs[{question,answer}]`. No `published_at` |
| Industries | `/admin/industries` | `icon`, `sort_order`, `solution_ids[]`. Titled `name`, **not** `title`, and has **no `status`** — an industry is reference data the catalogue points at, not something you draft |
| Pages | `/admin/pages` | `template`, `published_at`. No `summary`. `blocks` is deliberately not accepted — the column exists for block-assembled pages, which need a block editor; raw JSON here would let a typo corrupt a page invisibly |
| Product categories | `/admin/product-categories` | `parent_id`, `icon`, `sort_order`. Titled `name`, and **no `status`** — taxonomy, like industries. `description` is plain text, not rich |
| Products | `/admin/products` | `sku`, `brand_id`, `product_category_id`, `specifications`, `features[]`, `images[]`, `datasheet_path`, `is_featured`, `sort_order`, `solution_ids[]`, `related_product_ids[]`, `faqs[]`. Titled `name`. **No `published_at`** — status alone decides |
| Brands | `/admin/brands` | `logo_path`, `sort_order`, `is_featured`. Titled `name`, and **no `status` and no `seo`** — a brand is a filter facet on the product listing, not a page |

Common to all: `title`, `slug`, `summary`/`excerpt`, `body`, `status`
(`draft`/`published`/`archived`) and a nested `seo` object — with the two
exceptions called out above.

| Method | Path |
|---|---|
| `GET` | `/admin/{entity}` — `?status=`, `?q=`, `?page=`, `?per_page=`, plus the entity's own filter |
| `POST` | `/admin/{entity}` |
| `GET` | `/admin/{entity}/{id}` |
| `PATCH` | `/admin/{entity}/{id}` |
| `DELETE` | `/admin/{entity}/{id}` |

### Pickers

Read-only lists that populate relation selects in the edit forms.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/admin/knowledge-categories` | `{id, name, slug}` |

**Every other picker is just that resource's CRUD index.** `/admin/products`,
`/admin/industries`, `/admin/brands` and `/admin/product-categories` each
serve both jobs — ask for `?per_page=100` and read `id` and `name` off the
rows, which are never detail-only.

An earlier cut had a second endpoint for industries, which forced the CRUD one
to be named `/admin/industry-records` — a URL that exists only to dodge a
collision is a sign the collision should not exist. `/admin/products` was the
same shape until products gained full CRUD, and went the same way.

### Media

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/media-folders` | `{id, name, media_count}` |
| `POST` | `/admin/media-folders` | `name`, unique |
| `DELETE` | `/admin/media-folders/{id}` | **Keeps the files** — they become unfiled |
| `GET` | `/admin/media` | Paginated. `?q=` on filename, `?folder=` (an id, or `unfiled`), `?kind=image\|file` |
| `POST` | `/admin/media` | multipart `file` + optional `alt_text`, `folder_id`. 5 MB default |
| `PATCH` | `/admin/media/{id}` | `filename`, `alt_text`, `folder_id` |
| `POST` | `/admin/media/{id}/resize` | `width`, `height`, `thumbnails[]` of 90/120/180 |
| `POST` | `/admin/media/{id}/crop` | `x`, `y`, `width`, `height`, optional `out_width`/`out_height` |
| `GET` | `/admin/media/{id}/download` | Streams it under its human filename |
| `DELETE` | `/admin/media/{id}` | Removes the file and the row |

**Deleting a folder never deletes what is in it.** `folder_id` is
`nullOnDelete`, so the files return to the unfiled view. A folder is a label;
the files are the expensive thing, and losing a hundred uploads to one
confirmation dialog is not a mistake anyone recovers from.

**`?folder=unfiled` and no `folder` parameter are different questions** — the
first means "files in no folder", the second means "everything".

**A square thumbnail crops; it does not squash.** `resize` scales the whole
frame, because the caller named exact dimensions — but a 90x90 thumbnail of a
4:3 photograph has to cut a square out of the middle. Scaling the frame into a
square is what the thumbnails did at first, and a round 300px circle in an
800x400 source came back as an ellipse 34x68.

**Crop coordinates are in the image's own pixels.** The client maps whatever
it drew on screen back to natural size before sending; the displayed image is
almost never 1:1. A rectangle past the edge is clamped rather than refused —
a selection is dragged with a pointer, and overshooting by a few pixels is
what hands do.

**Resize and crop rewrite the file in place, and refuse SVG**, with a 422 that
says why. A vector has no pixel size to change, so resizing one would report
success and leave the file exactly as it was — and most of this library is
currently SVG placeholder art, so that would be the common case. Checked
thumbnail sizes become their own media rows rather than hidden variants:
anything the library cannot list is something an editor cannot reach.

**Rename never touches the stored path.** `filename` is metadata; the file
keeps its hashed name, so renaming cannot break a record that already
references the path.

**Uploads accept documents as well as images** — pdf, doc(x), xls(x), csv,
txt, zip — because the Files tab needs something to hold. It stays an
allowlist: these are served straight back to browsers from the public disk,
so the question is what is safe to hand a visitor, not what is safe to store.

**Alt text lives with the file, and the public resources resolve it by path.**
Records store a path, not a media id — `cover_image_path`, `images[]` — so the
path is the only link from a published image back to the row that describes it.
`App\Support\MediaAlt` loads the whole `path => alt_text` map once per request
and memoises it, because a products index renders twenty images and twenty
queries for twenty short strings is the wrong trade. Public resources therefore
carry `cover_image_alt` (blog, case studies), `hero_image_alt` (solutions) and
`image_alts` (products — a parallel array, same order and length as `images`).

Strictly, alt text describes an image *in context*, and the same photograph can
warrant different wording in two places. For a hardware catalogue the answer is
almost always the name of the thing in the picture, so one description per file
is worth far more than four sets of per-record fields nobody fills in. A
per-use override can be added later without changing the wire shape.

Media goes to the **public** disk — these are cover images and og:image
targets meant to be fetched by browsers and crawlers, the opposite of ticket
attachments. Filenames are hashed; the original is metadata only. Requires
`php artisan storage:link`.

### Things that will bite you

**Rich text is sanitised on write**, against an allowlist that is exactly the
tags the frontend styles. Anything else — `<script>`, `<iframe>`, event
handlers, inline styles, `javascript:` URLs — is stripped and cannot be
stored. The editor toolbar is a convenience, not the boundary.

**`seo` is an override, not the value.** Every field is nullable and null
means "derive it". `GET` returns both: `seo` is what was typed, `seo_defaults`
is what the site falls back to. Send only what the editor actually entered —
copying `seo_defaults` back promotes every derived value into a hard override.

**Changing a slug writes a 301 automatically** into the `redirects` table, so
old URLs keep working and keep their ranking. That is why slugs are safe to
edit and why `/redirects/lookup` exists.

**Publishing without a date sets `published_at` to now** on entities that have
the column. Otherwise a post would be `published` with a null date and the
public scope would filter it straight back out — publishing would look like it
had silently failed.

**Repeating fields are replaced wholesale, not diffed** — `faqs`, `results`,
`benefits`, `technologies`, and the `*_ids` relations. Send the complete
desired set. Omitting a key entirely leaves that relation untouched; sending
`[]` clears it.

**A category cannot be reparented under itself or a descendant.** Either would
cut that branch out of the tree — still walkable from inside the loop, but
unreachable from a root, so the whole subtree would disappear from the
navigation with no error. `PATCH` returns 422 on `parent_id` naming which case
it hit.

**Deleting a category promotes its children to the grandparent**, rather than
letting `nullOnDelete` scatter them to the top level. Products survive both a
category and a brand deletion — they simply lose that association.

**A product's `specifications` is an ordered map**, and the order is the one
the editor set. It survives a round trip only because `App\Casts\SpecSheet`
stores it as a list of pairs: MySQL's JSON type reorders object keys by length
and then alphabetically, so a plain map came back scrambled. The wire format
is still `{"Ports": "24 × 1G"}` in both directions.

**Deleting a product releases its slug.** `Product` is the only soft-deleting
model and nothing lists trashed rows, so the slug would otherwise be held
forever by a record no one can see — and recreating it would be refused by a
uniqueness check naming a phantom. The row is kept (recoverable in the
database) with its slug suffixed, so the URL is free to reuse.

**`related_product_ids` is one-way.** Marking B as related to A does not list
A on B. The two sides are edited separately — an accessory can point at a
switch without the switch listing every accessory back — and a product cannot
be related to itself.

---

## Admin — settings (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/settings` | Every setting, grouped. `{ "data": { "general": [{key, value, type, group}], … } }` |
| `PATCH` | `/admin/settings` | `settings: [{key, value}]` |

**`role:admin`, not `role:content_manager`.** These are site-wide behaviour —
the portal toggle, support addresses, SEO fallbacks — not page content, and
the `Role` enum already placed configuration under administrator.

| `POST` | `/admin/settings/clear-secret` | `key`. Removes a stored credential |

**Only keys that already exist are written.** The settings table is defined by
its seeder; a `PATCH` naming an unknown key ignores it rather than inserting
one, so the endpoint cannot be turned into an arbitrary key/value store. An
empty string is stored as `null`, which is what makes a blank social URL hide
its footer icon instead of linking nowhere.

**Credentials are never returned.** Rows flagged `is_secret` — the SMTP
password and the API key — are encrypted at rest and come back as
`value: null` with `is_set: true`. A blank submit means *unchanged*, because
the form can never show the current value and treating blank as a delete would
wipe the SMTP password on every unrelated save. Clearing one is the separate
endpoint above.

**The `mail` and `integrations` groups are not public.** They are absent from
the `/settings` whitelist. Anything added to them stays server-side.

**The `consent` group is public too**, for the same reason — the banner is
rendered client-side and needs every string in it.

**The `analytics` group *is* public, and must be.** A GA4 measurement ID and a
Meta Pixel ID appear in the page source of every site that uses them; there is
nothing to protect, and the frontend cannot inject a tag it cannot read. They
are not secrets and must not be marked as such.

**A `map_embed_url` is validated against `https://www.google.com/maps/embed`**
on write. It becomes an `iframe src` on the contact page, and an unchecked one
is somebody else's page rendered inside this origin.

**Settings whose key ends in `_path`** (the logo and favicon) come back with a
resolved `url` alongside the stored path, so a picker can preview one without
knowing how storage paths map to URLs.

---

## Admin — FAQs (`role:content_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/faq-owners` | Grouped picker: solutions, services, products, pages |
| `GET` | `/admin/faqs` | `?q=`, `?owner_type=`, `?owner_id=` |
| `POST` | `/admin/faqs` | `question`, `answer` (rich text), `sort_order`, `owner_type`, `owner_id` |
| `GET`/`PATCH`/`DELETE` | `/admin/faqs/{id}` | |

**An FAQ must name an owner**, though the column allows null. Nothing on the
public site renders an unattached one, so it would be written, saved and never
seen. `owner_type` is the morph key (`solution`), not a class name.

---

## Admin — SEO and redirects (`role:seo_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/seo` | Indexable records. `?type=`, `?q=`, `?issues=1`, `?page=`, `?per_page=` (max 200, default 50) |
| `PATCH` | `/admin/seo/sitemap` | `type`, `id`, `sitemap_include` |
| `GET` | `/admin/redirects` | `?q=`, `?source=automatic\|manual`, `?active=` |
| `POST` | `/admin/redirects` | `from_path`, `to_path`, `status_code`, `is_active` |
| `GET`/`PATCH`/`DELETE` | `/admin/redirects/{id}` | |

**`/admin/seo` paginates, and `?issues=1` is a server-side filter.** The two
arrived together and cannot be separated: the screen used to render every
record and filter for problems in the browser, which is correct only while
everything is on one page. Filter a page client-side and it hides just the
rows that happened to land on it. `meta.with_issues` counts the whole matching
set rather than the page, because it is a headline figure.

**`/admin/seo` is read-mostly.** Editing metadata stays on each record's own
form; a second editor for the same override row would be two implementations of
the same rules. What it adds is the overview — derived versus overridden, and
titles or descriptions outside the lengths search engines display.

**Redirect paths are normalised** to a leading slash and no trailing one, since
the middleware looks them up by exact match. `hit_count` and `last_hit_at` are
telemetry the middleware writes and are read-only here.

---

## Admin — staff (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/staff/roles` | The four roles with descriptions |
| `GET` | `/admin/staff` | `?q=`, `?role=`, `?active=` |
| `POST` | `/admin/staff` | `name`, `email`, `roles[]`, optional `password`, `is_active` |
| `GET`/`PATCH`/`DELETE` | `/admin/staff/{id}` | |

**Omitting `password` on create generates one** and returns it as
`generated_password` on that response only. It is hashed in the database and
cannot be read again.

**Three lockout guards**, all returning 422: you cannot deactivate or delete
your own account, you cannot remove your own administrator role, and the last
active administrator cannot be deactivated, deleted or demoted. Without the
last one, two administrators can each demote the other.

---

## Notifications

Not endpoints — side effects of existing ones.

| Trigger | Goes to | Notification |
|---|---|---|
| `POST /tickets` | `support_email` setting | `TicketCreated` |
| `POST /tickets` | The customer | `TicketAcknowledged` |
| `POST /tickets/{ref}/messages` | `support_email` setting | `TicketReplied` |
| `POST /admin/tickets/{ref}/reply` | The customer, **unless `is_internal`** | `TicketReplied` |
| `POST /enquiries` | `sales_email` setting | `EnquiryReceived` |

**A send failure never fails the request.** `App\Support\Notifier` logs and
swallows: a committed ticket must still answer 201 when mail is down.

**The internal-note guard is at the call site**, not inside the notification.

---

## Not built yet

Nothing outstanding in the brief. See `PROGRESS.md` for what remains before
launch, which is content and configuration rather than code.
