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
| `GET` | `/products` | Paginated. `?q=` search, `?category=`, `?brand=`, `?page=` |
| `GET` | `/products/{slug}` | |
| `GET` | `/product-categories` | Plain collection |
| `GET` | `/product-categories/{slug}` | |
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
| `GET` | `/pages/{slug}` | CMS pages — `/privacy`, `/terms`, `/downloads` |
| `GET` | `/ticket-categories` | Powers the submit-a-ticket form |
| `GET` | `/settings` | Site settings. **Whitelisted by group**, see below |
| `GET` | `/redirects/lookup?path=/blog/old-slug` | 200 with `{data:{to,status}}`, or 404 |
| `POST` | `/enquiries` | Contact form. Throttled 10/min, honeypot field |

**`/settings` returns a whitelist, not a filtered dump.** Only the `general`,
`contact` and `social` groups are public; the same table also holds SEO
defaults and the portal toggle. "Return everything except what I remembered to
hide" is the wrong default on an unauthenticated endpoint — a setting added
later is private until somebody deliberately makes it public. Null and empty
values are dropped, so a caller gets `undefined` rather than a blank string.
The response is a flat `{ "data": { "key": "value" } }` map.

**Never ISR-cache a search response.** `?q=` has an unbounded key space, so
caching it fills the cache with single-use entries and serves a stale empty
result for the whole revalidate window. `publicApi.products()` and
`publicApi.knowledgeArticles()` take a `cache` flag for exactly this.

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
| `GET` | `/admin/dashboard` | Counts, recent tickets, high priority, status breakdown |
| `GET` | `/admin/users` | Active staff, for assignment pickers |
| `GET` | `/admin/tickets` | `?status=`, `?priority=`, `?assigned_to=`, `?unassigned=1`, `?overdue=1`, `?q=`, `?per_page=` (max 100). Critical first, then oldest |
| `GET` | `/admin/tickets/{reference}` | Includes internal notes and the audit trail |
| `PATCH` | `/admin/tickets/{reference}` | `status`, `priority`, `assigned_to`, `ticket_category_id` |
| `POST` | `/admin/tickets/{reference}/reply` | multipart. `body`, `is_internal`, `attachments[]` |
| `GET` | `/admin/ticket-attachments/{id}` | Staff download — no ownership check, and internal-note attachments are allowed |

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
| `GET` | `/admin/media` | Paginated. `?q=` on filename |
| `POST` | `/admin/media` | multipart `file` + optional `alt_text`. Images only, 5 MB default |
| `DELETE` | `/admin/media/{id}` | Removes the file and the row |

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

**Only keys that already exist are written.** The settings table is defined by
its seeder; a `PATCH` naming an unknown key ignores it rather than inserting
one, so the endpoint cannot be turned into an arbitrary key/value store. An
empty string is stored as `null`, which is what makes a blank social URL hide
its footer icon instead of linking nowhere.

---

## Not built yet

FAQs as a standalone screen, the media library browsing UI (the upload
endpoint exists), the redirects manager, the SEO manager, and staff/user
management. See `PROGRESS.md`.

Ticket email notifications are Phase 4 — the hooks are marked `TODO(phase 4)`
in the code.
