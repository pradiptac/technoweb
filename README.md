# Technoware — Phase 1

Marketing site, customer support portal and API foundation for a hardware and
network solution provider.

```
www.technoware.in           api.technoware.in
      │                            │
   Next.js  ──── REST /api/v1 ──── Laravel ──── MySQL 8
```

The frontend never touches MySQL. Every read and write goes through the API.

| | |
|---|---|
| `web/` | Next.js 16, TypeScript, App Router, Tailwind v4 |
| `api/` | Laravel 12, PHP 8.3+, Sanctum, MySQL 8 |
| `design/` | Static HTML mockup and design-system reference |

---

## What Phase 1 covers

Per the brief: project foundation, API architecture, authentication and the
design system — plus the full public homepage and the support-ticket domain,
since tickets are the heart of the product.

**Built**

- Design-token layer shared by the site, portal and admin
- Public homepage, fully responsive, rendered statically
- Typed API client with ISR caching and structured error handling
- Customer authentication — Sanctum token held in an httpOnly cookie
- Complete database schema: 30 tables with foreign keys and indexes
- Support tickets end to end: create, converse, attach, close, reopen,
  internal notes, SLA clock, audit trail
- Staff ticket queue with filtering, assignment and status transitions
- Role-based access control across four staff roles
- SEO layer: auto-generated metadata with per-record admin overrides,
  JSON-LD, `robots.txt`, `sitemap.xml`, and 301s written automatically on
  slug change

**Not built yet** — Phases 2–6: the CMS admin UI, inner marketing pages,
product/solution detail pages, knowledge base front end, and email
notifications.

---

## Local setup

### API

```bash
cd api
composer install
cp .env.example .env
php artisan key:generate
# point DB_* at a local MySQL 8 database, then:
php artisan migrate --seed
php artisan storage:link
php artisan serve          # http://localhost:8000
```

The seeder prints a generated administrator password **once**. There are no
default credentials anywhere in this repository.

### Frontend

```bash
cd web
npm install
cp .env.example .env.local     # API_BASE_URL=http://localhost:8000
npm run dev                    # http://localhost:3000
```

---

## Deploying to Plesk

Two domains, two document roots.

**api.technoware.in** — document root must point at `api/public`, not `api/`.
Anything above `public/` should never be web-reachable. Set the PHP version to
8.3 or later. `.htaccess` in `api/public` already forwards the `Authorization`
header, which Apache strips by default and which otherwise breaks every
token-authenticated request with a silent 401.

```bash
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan event:cache
php artisan storage:link
```

Ensure `storage/` and `bootstrap/cache/` are writable, and that
`storage/app/private/` is **not** served over HTTP — ticket attachments live
there and can contain network diagrams, logs and credentials.

**www.technoware.in** — Node.js application, `npm ci && npm run build`, start
command `npm run start`. Set `API_BASE_URL` to the internal API URL and
`NEXT_PUBLIC_SITE_URL` to the public origin.

Set `FRONTEND_URL` in the API's `.env` — CORS and generated canonical URLs both
read it.

---

## Decisions worth knowing

**Ticket status and priority are PHP enums, not lookup tables.** The brief
listed `ticket_statuses` and `ticket_priorities` as candidate tables. Both are
fixed lifecycles that application code branches on, and permitted transitions
live in `TicketStatus::canTransitionTo()`. A new row in a database table could
not introduce a new state without code changes anyway. Say the word and they
become tables; nothing else has to change.

**Tailwind v4 is CSS-first.** Next 16 ships Tailwind v4, which replaced
`tailwind.config.ts` with an `@theme` block in `globals.css`. The v3-style
config shown in `design/design-system.html` is superseded by
`web/src/app/globals.css`. Same tokens, different syntax.

**Fonts are self-hosted.** Vendored from `@fontsource` into `web/src/fonts`
rather than fetched from Google — no third-party request at runtime, no
build-time network dependency, no consent question.

**A polymorphic morph map is enforced.** Polymorphic rows store `"product"`,
not `App\Models\Product`, so classes can be renamed or moved without a data
migration. Adding a new polymorphic model means adding it to the map in
`AppServiceProvider`.

**`--brand-500` fails AA for text.** It is 4.07:1 on white. Use `--brand-600`
(7.53:1) for any coloured text. The design system flags this live.

---

## Verification status

Verified by running it:

- `npm run build` passes clean; TypeScript reports no errors
- Homepage prerenders static, `/portal/login` renders dynamic as intended
- `robots.txt`, `sitemap.xml` and both JSON-LD blocks emit correctly
- Zero WCAG AA contrast failures across the homepage
- One `h1`, no heading-level jumps, all four landmarks present
- Zero horizontal overflow at 360, 390, 768, 1024 and 1440 px

Reviewed but **not executed**:

- The entire Laravel application. This sandbox's egress proxy blocks
  `repo.packagist.org`, so `composer install` could not run and the app could
  not be booted. Every PHP file passes `php -l`, every internal class reference
  resolves, and there are no unused imports — but no migration has been run and
  no endpoint has answered a request. Expect to shake out runtime issues on
  your first `php artisan migrate`.

---

## Customer portal (added after Phase 1)

Routes under `/portal`, all `noindex` and all server-rendered:

| Route | Purpose |
|---|---|
| `/portal/login` | Sign in; redirects to `/portal` if already authenticated |
| `/portal` | Dashboard — ticket counts by status, five most recent |
| `/portal/tickets` | List with status filters and pagination |
| `/portal/tickets/new` | Submit a ticket, with attachments |
| `/portal/tickets/[reference]` | Conversation thread, reply, close, reopen |
| `/portal/profile` | Contact details and password change |

The auth guard lives on `portal/(app)/layout.tsx`. `login/` sits deliberately
**outside** that route group — guarding it as well would redirect to itself
forever.

### Verified against a mock API

The Laravel backend still cannot be booted here, so the portal was tested
end-to-end against `mock-api.mjs`, a Node server implementing exactly the
`/api/v1` contract. Driven through a real browser:

- Unauthenticated `/portal` redirects to `/portal/login`
- Login through the real form sets the session and lands on the dashboard
- List renders 5 tickets; detail renders the full 4-message thread with an
  attachment; the category select is populated from the API
- An unknown reference renders the not-found state instead of crashing
- **The session token is not readable from client JavaScript** (`document.cookie`
  is empty) and does not appear anywhere in the HTML
- Zero contrast failures, one `h1`, no heading jumps, zero overflow on all five
  portal pages at both 1280 px and 360 px

This proves the frontend against the documented contract. It does **not** prove
the Laravel implementation matches that contract — that still needs a real
`php artisan migrate` and a live request.

### Token fix

`--color-warn` was `#a9711a`, which is **3.83:1** on `--color-warn-soft` and
fails AA at badge sizes. Corrected to `#8a5c10` (5.36:1). This affected the
design system and would have affected the admin UI too, so it was fixed at the
token level rather than per-component.

### New endpoint

`GET /api/v1/ticket-categories` was added to the Laravel side — the
submit-a-ticket form needs it, and it did not exist in the original route list.


---

## Backend verified (2026-08-18)

`php artisan migrate --seed` ran clean against MySQL 8 and
`GET /api/v1/solutions` returned all nine seeded solutions in the expected
shape. Migrations, models, enum casts, the Sluggable trait and the resource
layer are all confirmed working.

Two things that run exposed:

**Slugs did not match the frontend.** `Str::slug` derived
`enterprise-networking`, `storage-nas`, `enterprise-wi-fi`,
`it-infrastructure-amc` — while the frontend links to `networking`, `storage`,
`enterprise-wifi`, `amc`. Eight of nine were wrong, and `sitemap.xml` was
publishing URLs that would have 404'd. `CatalogueSeeder` now sets every slug
**explicitly** for solutions, services, industries and product categories.
Those values are the URL contract; changing one later means adding a redirect.

**No way to create a customer.** The seeder creates an administrator but no
portal account, and portal logins are issued with an AMC contract rather than
self-registered, so nothing could sign in. Added:

```bash
php artisan technoware:customer neil@example.in --name="Neil Basu" --company="Meridian Foods"
```

It generates a 16-character password and prints it once.

### Re-seeding after the slug fix

The seeder keys `updateOrCreate` on slug, so re-running it now would create a
*second* set of records rather than renaming the existing ones. Wipe and reseed:

```bash
php artisan migrate:fresh --seed
```

This drops every table — fine right now, since there is no real data yet. Do
not run it once the site is live.


---

## Phase 2 — inner marketing pages

| Route | Notes |
|---|---|
| `/solutions`, `/solutions/[slug]` | Problem, overview, benefits, technologies, related hardware, industries, FAQ |
| `/services`, `/services/[slug]` | Body copy plus an inline enquiry form |
| `/industries`, `/industries/[slug]` | Sector page with the solutions we lead with |
| `/products` | Category grid, search and brand filter, pagination |
| `/products/[slug]` | **Resolves to either a category listing or a product** |
| `/contact` | Enquiry form with honeypot; pre-fills the subject from `?subject=` |

### One route, two entity types

The brief specifies both `/products/network-switches` (a category) and
`/products/cisco-cbs350-24t-4g` (a product) — one URL segment, two kinds of
thing. Next cannot express that as two routes, so `products/[slug]/resolve.ts`
tries the category endpoint first and falls back to the product endpoint. Both
are ISR-cached and Next dedupes identical fetches within a render, so
`generateMetadata` and the page component share one round trip.

### Redirect middleware

`src/middleware.ts` consults `GET /api/v1/redirects/lookup` before Next renders
a 404, so a slug changed in the CMS keeps its old URL working — and its
ranking. It only runs on content-URL prefixes, and a lookup failure falls
through to the 404 rather than taking the site down.

### The sitemap is generated from the API

It reads solutions, services, industries, categories and products at runtime and
honours each record's `sitemap_include` flag. A hard-coded list would drift the
moment an editor renamed a slug — which is exactly the bug that shipped in
Phase 1. On a fetch failure it degrades to the static routes rather than
emitting an empty sitemap, which search engines read as "delete everything".

### A build that cannot reach the API now fails

Index pages are statically prerendered. During the first Phase 2 test the build
ran while the API was down and cheerfully baked *"We could not load the
solutions list"* into `/solutions` as static HTML — crawlable, indexable, and
stuck that way until the ISR window expired.

`src/lib/build-phase.ts` fixes this: at runtime an API failure still degrades
gracefully and the site stays up, but during `next build` the error is rethrown
and the deploy fails loudly. A failed deploy is much cheaper than an indexed
error page.

**Consequence:** the API must be reachable when you run `npm run build`. Set
`API_BASE_URL` in the build environment, not just at runtime.

### Verified

All ten routes, against the mock API, in a real browser: zero contrast
failures, zero heading-level jumps, exactly one `h1` each, zero horizontal
overflow at 1280 px and 360 px, correct canonical URLs, and the right JSON-LD
per page type (`Service`, `Product`, `FAQPage`, `BreadcrumbList` throughout).
The 404 path, the 301 middleware and the enquiry submission were all exercised
end to end.

Two bugs the audit caught: the empty and error states used `<h3>` directly
beneath the page `<h1>`, and product card titles needed to be `<h2>` on a
category listing but stay `<h3>` under the "All products" heading — hence the
`headingLevel` prop on `ProductGrid`.
