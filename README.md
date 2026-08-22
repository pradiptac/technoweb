# Technoware

Marketing site, customer support portal and REST API for a hardware and
network solution provider.

This file is a running record, appended phase by phase — the sections below
are dated snapshots and are not rewritten as later work supersedes them. For
current state see **`PROGRESS.md`**; for the working rules see **`CLAUDE.md`**;
for the endpoint reference see **`API.md`**.

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


---

## Phase 2 complete — resources and company pages

| Route | Notes |
|---|---|
| `/resources` | Hub tying blog, knowledge base, case studies and support together |
| `/blog`, `/blog/[slug]` | Article JSON-LD, reading time, author |
| `/case-studies`, `/case-studies/[slug]` | Results table, industry tagging |
| `/knowledge-base`, `/knowledge-base/[slug]` | Search, categories, tags, TechArticle JSON-LD |
| `/about` | Company positioning, process, principles |

### Ticket deflection

`/portal/tickets/new` now leads with a knowledge-base prompt, and knowledge-base
articles link back to the ticket form with `?subject=` pre-filled. The brief
asked for customers to be pointed at the knowledge base before raising a
ticket; this closes that loop in both directions.

### Two bugs the audit caught

**Knowledge-base search could not find "wifi".** `KnowledgeArticle::scopeSearch`
matched `LIKE` against title, excerpt and body only — so the hyphen in "Wi-Fi"
defeated it, and tags were not searched at all. People do not type hyphens. The
scope now also searches `tags` and matches a punctuation-stripped form of the
title, so `wifi`, `wi-fi` and `wi fi` all find the same article. A knowledge
base nobody can search deflects nothing.

**Search results were being ISR-cached.** `?q=wifi` returned nothing once and
kept returning nothing for the full five-minute window, even after the content
changed. Worse, the query space is unbounded, so every distinct search was
filling the cache with a single-use entry. Search now bypasses the cache
(`publicApi.products` and `publicApi.knowledgeArticles` take a `cache` flag);
only the unfiltered listings are cached.

### Verified

Twelve routes, in a browser, against the mock: zero contrast failures, zero
heading-level jumps, exactly one `h1` each, zero horizontal overflow at 1280 px
and 360 px, correct canonicals, and `Article` / `TechArticle` / `Product` /
`FAQPage` / `BreadcrumbList` structured data emitting where expected. Search
round-trips as a plain GET, so results stay shareable and indexable and work
without JavaScript.


---

## Phase 3 — the admin CMS

Twenty-four commits on `phase-3-admin-cms`. Staff can now sign in, work the
ticket queue, and edit most of what the public site renders.

### Admin shell and tickets

| Route | Purpose |
|---|---|
| `/admin/login` | Staff sign-in — a **separate principal** from the customer portal |
| `/admin` | Dashboard: counts, recent and high-priority tickets |
| `/admin/tickets` | Queue with status/priority/assignee/overdue filters and search |
| `/admin/tickets/[reference]` | Detail, reply, internal notes, assignment, status transitions |

Staff authentication did not exist before this phase — `AuthController::login()`
was hard-coded to the `Customer` model, so there was no way into the admin at
all.

### The authorisation gap this phase closed

The portal authorises by comparing the caller's id to a ticket's `customer_id`.
Those ids come from two different tables, and on a seeded install the
administrator and the first customer were **both id 1** — so a staff token
could read that customer's tickets. `EnsureUserIsCustomer` (`customer`
middleware) now rejects a staff token at the portal boundary, mirroring
`role:` on the admin side. Enforced in middleware rather than in controllers,
because a controller-by-controller check is one forgotten line away from the
same bug.

Two smaller ones alongside it: admin replies silently dropped their
attachments, and staff got a 404 downloading any attachment because the
resource always built the customer-facing URL.

### Rich text is sanitised on write

`Prose` renders CMS bodies through `dangerouslySetInnerHTML`, so a
content-manager account could otherwise inject script into every visitor's
page. `App\Support\HtmlSanitiser` (HTMLPurifier via `mews/purifier`, `cms`
profile) runs in the form request's `prepareForValidation()` — before
validation, so nothing unsanitised reaches a controller, and inherited by
every entity that uses the shared trait.

The allowlist is exactly the tags `prose.tsx` styles. Anything else is
stripped and **cannot be stored**: `<script>`, `<iframe>`, event handlers,
inline styles, `javascript:` URLs. The CKEditor toolbar is constrained to the
same set, but that is a UX guardrail — the server is the boundary.

This is the project's first tested code: `tests/Unit/HtmlSanitiserTest.php`,
15 tests, 176 assertions, each attack vector asserted individually.

### CMS entities

Blog posts, knowledge articles, case studies, solutions, services, industries
and pages — full CRUD, all behind `role:content_manager`, all bound **by id,
not slug** (the edit form changes the slug it is addressed by). Blog was built
first as the template; the rest reuse the same scaffolding —
`WritesCmsEntities`, `SanitisesRichText`, `CmsFieldRules`, `SeoRules`.

Plus the media upload endpoint (public disk, hashed filenames, needs
`storage:link`), and `/admin/settings` behind `role:admin`, which drives the
footer's social icon row.

### Site-wide changes

- **Floating labels on every form**, via a `variant` on the shared `Field`.
- **Main container is 90% wide, capped at 1920px.**
- **Scroll reveals** — `data-aos` attributes observed by `reveal.tsx`, not a
  library. Vertical translate only; the hidden start state carries no
  transition.
- **Mega menu** driven by the CMS, with icons and summaries. CSS-only.

### New setup steps

```bash
cd api && composer install          # now pulls mews/purifier
php artisan storage:link            # media uploads 404 without it
cd ../web && npx playwright install chromium   # for npm run audit
```

### The audit script

`web/scripts/audit.mjs` drives a real browser over every route and exits
non-zero on WCAG AA contrast failures, heading-level jumps, more or fewer than
one `h1`, horizontal overflow at 1280px or 360px, tap targets under 24px, a
missing canonical or malformed JSON-LD. Run it against a dev server or a
build; pass routes to narrow it. It is the definition of done for this
project, and it authenticates into `/admin/*` given
`ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD`.

### Bugs it caught that reading would not have

- **Scroll reveals faded content *out* before fading in** — the transition sat
  on the hidden start state.
- **`Container` silently dropped unknown props**, so sixteen `data-aos`
  attributes were inert. TypeScript did not object; the animation simply never
  ran.
- **`next dev` 403'd its own JS chunks** at `127.0.0.1:3000` — pages rendered,
  hydration never happened, and audits were passing against dead pages. Fixed
  with `allowedDevOrigins`.
- **The SEO panel unmounted when collapsed**, so every post saved with it
  closed silently dropped out of `sitemap.xml`.
- **`sitemap_include` was inert** — index responses never carried the `seo`
  relation, so the toggle wrote a value nothing read.
- **An unescaped `&` in a generated SVG's `aria-label`** made "Storage & NAS"
  invalid XML and the browser refused to parse the image.
- **Customers could not create a ticket at all** — a `Stringable` was being
  passed into an enum cast.

### Verified

Fifteen routes clean on every audit check, public and admin. `tsc --noEmit`,
`eslint` and `pint` clean. Sanitisation covered by unit tests; the CRUD round
trip, the 301-on-slug-change, the role boundaries and the settings/footer loop
each exercised end to end in a browser against real Laravel and MySQL.

### Still open

Products, brands and product categories (the largest remaining entity — specs,
features, an image gallery), FAQs as a standalone screen, the media browsing
UI, the redirects manager, the SEO manager, and staff/user management. Then
Phase 4: ticket email notifications.

**Before launch:** clear the placeholder content listed in `CLAUDE.md` — the
invented phone number, the case studies, the testimonial, and above all the
three seeded social URLs, which point at accounts that are probably somebody
else's. A CKEditor licence decision is also outstanding: it ships as
`licenseKey: 'GPL'`, valid while this repository is public and GPL-compatible,
and a commercial key is required otherwise.


---

## Phase 3 complete, and Phase 4

### The rest of the console

| Route | Purpose |
|---|---|
| `/admin/faqs` | Every question on the site, wherever it lives |
| `/admin/media` | The media library — grid, upload, storable paths |
| `/admin/seo` | Metadata across every indexable record |
| `/admin/redirects` | The redirect table, CMS-written and hand-added |
| `/admin/users` | Staff accounts and roles |

Plus products, brands and product categories, which were the largest of
the CMS entities.

`/admin/seo` is read-mostly on purpose. Each record's own form already
carries a SEO panel, and a second editor for the same override row would be
two implementations of the same rules, free to drift. What was missing was
the overview: which pages run on derived metadata, which titles are too long
to survive a search result, and what has been dropped from the sitemap. The
only thing it writes is the sitemap toggle, because that is a decision taken
while looking at the whole list.

Staff accounts carry three lockout guards: you cannot deactivate or delete
your own account, you cannot remove your own administrator role, and the last
active administrator cannot be deactivated, deleted or demoted. The third is
the one that matters — without it two administrators can each demote the
other and the install has no way back in short of a database edit.

### Phase 4 — notifications

A new ticket goes to the support desk and a receipt goes to the customer;
replies go to whichever side did not write them; enquiries go to the sales
inbox. The addresses come from the settings table rather than config, so they
change in the admin without a deploy.

Two rules, both tested:

**A send failure never fails the request.** `App\Support\Notifier` logs and
swallows. A ticket that is already committed must still answer 201 when the
mail server is down — telling a customer their ticket failed while it sits in
the database is worse than losing the email, because they send it again.

**An internal note never reaches a customer.** The guard is at the call site
in the admin reply path, not inside the notification. It is the worst failure
this system could have, and it belongs where anyone reading that method will
see it.

### Two things found while finishing

**Stored XSS in the JSON-LD.** `JSON.stringify` does not escape `<`, and the
output went straight into a `<script>` tag — so a CMS field containing
`</script>` closed the block and everything after it became live markup.
Confirmed with a real payload firing `alert()` in Chromium, fixed by escaping
it to its `\u003c` form, and the audit now fails on any JSON-LD block containing a
literal `<`. The existing "malformed JSON-LD" check could never have caught
it: a breakout splits one block into two that both parse cleanly.

**The homepage was not reading the CMS.** Five sections rendered from a
static file, so renaming a solution or publishing a post changed every page
except the one people land on first. They now read the same endpoints as the
index pages. The hero copy and both statistic rows moved into settings at the
same time, which is what makes the invented figures — 340+ sites, 99.9%
uptime — correctable by the client rather than by a developer.

### One thing broken and fixed

The first run of the notification tests used `RefreshDatabase` with no test
database configured, which dropped and re-migrated the **development**
database. `phpunit.xml` now pins `DB_DATABASE` to `technoweb_test`, with a
comment saying why, and the development data was restored with
`migrate:fresh --seed`. Verified afterwards that a full suite run leaves it
alone.

### Verified

43 routes clean on every audit check — 20 public, 23 admin. 22 tests, 191
assertions. `tsc`, `eslint` and `pint` clean. Admin coverage checked
programmatically rather than by eye: every public content area resolves to an
admin endpoint, and each has content in it.

### Before launch

Everything outstanding is content or configuration, not code. See "Known
risks and placeholders" in `CLAUDE.md` — the invented statistics (now
editable in Settings), the placeholder phone number, the three seeded social
URLs that point at accounts which are probably somebody else's, the demo
support desk, and the privacy and terms copy, which reads as real policy and
is not.
