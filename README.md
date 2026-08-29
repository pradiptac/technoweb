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

---

## Mobile responsiveness pass

Every route audited on a phone and the findings fixed. The audit is
`web/scripts/mobile-audit.mjs` (`npm run audit:mobile`), which drives a real
browser over 53 routes — public site, signed-in portal, admin console — at
320, 360, 390 and 414 px and fails on horizontal overflow, elements wider than
the viewport, text under 12px, tap targets under 24px, form controls under
16px, and fixed elements covering more than half the screen.

It differs from `npm run audit` in one way that matters: it names the element.
"This table is 760px wide in a 360px viewport" is actionable; "the page
overflows by 42px" is a search.

### What it found

**Every form control on the site was 15px** — admin filter selects were 13px.
iOS Safari zooms the whole page when a control under 16px takes focus and does
not zoom back out, so tapping any field on any form threw the layout sideways
on an iPhone. Together with 79 sub-12px text utilities, this is fixed in a
single unlayered `@media (width < 40rem)` block in `globals.css` rather than
across 34 component files: unlayered CSS beats Tailwind's `@layer utilities` on
cascade layer alone, so it needs no `!important` and no specificity games. The
floor is a property of the medium, not of any one component.

That fix has a consequence worth remembering: **a control with a fixed width
truncates once its text grows.** The ticket row's `w-[112px]` selects started
showing "Unassig".

**The admin navigation was seventeen unlabelled 16px slivers.** Below `lg` the
sidebar becomes a horizontal strip, and the `min-w-0` that lets the *container*
shrink was also on each link — so every one collapsed to its icon with the
label clipped off. The strip is supposed to scroll; only the container may
shrink.

**All fifteen admin list tables were unusable and passing every check.** Each
is 620–900px wide inside an `overflow-x-auto` wrapper, so the page never
overflows — you simply read a 760px table through a 360px window, scrolling
sideways once per row. Contained is not responsive. Below `md` each row is now
a card and each cell is labelled from a `data-label` attribute, so there is one
source of truth per screen rather than a second mobile component to keep in
sync.

**The hero's NOC topology diagram rendered its labels at 5.4px.** They are in
viewBox user units, so they scale with the container. No font size fixes it —
12px on screen needs 19 user units, and `CORE-SW-01` at 19 units is wider than
the 68-unit box it sits in. The diagram is decorative and `aria-hidden`, so it
is hidden below `md`, which also gives the hero back scarce vertical space.

### Two bugs in the audit itself

Both found by disbelieving its output rather than by reading it:

- **Decorative blobs were reported as overflow.** The containment check only
  treated `overflow-x: auto|scroll` as containing. `hidden` and `clip` contain
  too, and that is how every background blob on this site is kept in its
  section — so the first run flagged them on nearly every route.
- **SVG text was measured in the wrong units.** `getComputedStyle` reports an
  SVG's font-size in user units, which is not what the reader sees. Multiplying
  by the element's screen CTM scale turned a reported 8.5px into the 5.4px it
  actually was.

### Not fixed

The same diagram's labels also fall under 12px at 1024, 1280 and 1440 px — the
panel narrows when the hero switches to two columns. It is the same defect at
desktop widths, and fixing it means redrawing the diagram with fewer, larger
nodes. That is a design decision, so it is flagged rather than taken.

### Verified

53/53 routes clean at all four widths, `npm run audit` clean on the public
routes and on nine admin routes, `tsc --noEmit` clean, `eslint` clean, and
`npm run build` passing. The card layout was also checked by eye at 360px, which
is what caught the truncated select the numbers had passed.

---

## Admin forms are tabbed

Every CMS entity form splits into Content / Media / Related / SEO, the same
treatment `/admin/settings` already had. The tallest were two full screens of
scrolling:

| form | before | after |
|---|---|---|
| solutions | 1972px | 1275px |
| products | 1878px | 1225px |
| services / industries | 1226px | 900px |
| product categories | 1001px | 900px |
| case studies | 970px | 936px |

Blog, knowledge base and pages already fitted a screen and gained tabs for
consistency, which also replaced the collapsible SEO card with a panel — a tab
you click to reveal a disclosure you click again was one click too many.

Brands, FAQs, redirects, staff and profile keep a single pane. They carry 7 to
12 fields, where tabs are chrome rather than structure. The dividing line used
was "does this form have a `SeoPanel`", which turns out to be exactly the set
of CMS entity forms.

### The two things that make it safe

**No panel is ever unmounted.** All four sit inside one `<form>`, so an
unmounted panel takes its inputs out of the DOM — and a missing checkbox reads
as false. This project has already shipped that exact bug once: the SEO panel
used to unmount when collapsed, and every post saved with it closed quietly
dropped out of `sitemap.xml`. Same mechanism, four times the blast radius.

**A validation error cannot hide behind a tab.** Without this, a 422 on a
hidden panel gives an editor "could not save" over a form where every field
they can see looks fine. `components/admin/form-tabs.tsx` maps Laravel's error
keys — including nested ones like `seo.title` and `faqs.0.question` — to the
tab that owns them, badges it with a count and jumps there. Errors matching no
tab are charged to the first rather than dropped, so a field renamed on the
server cannot make one uncountable.

### Verified by running it

All nine forms: tabbed, every inactive panel still mounted, and every named
control still present in the submitted `FormData`. Then a real round trip on a
throwaway record — created with a field typed on Content, a relation ticked on
Related, an override typed on SEO and the sitemap checkbox unticked on a
hidden tab, saved from the SEO tab, reloaded, all five confirmed, and the
record deleted. The sitemap checkbox is in there deliberately: it is the one
this pattern is most able to break, and it is the one that has broken before.

`npm run audit` clean on all nine, `npm run audit:mobile` clean on all 53
routes, `tsc` and `eslint` clean.

---

## Outgoing mail is configured in the admin

Six transports, chosen at `/admin/settings` → Outgoing mail: **SMTP**, **Gmail
or Google Workspace** over OAuth, **Brevo**, **Mailgun**, **Amazon SES**, and a
**log** transport that sends nothing. The client changes provider without a
deploy; the alternative is asking somebody with server access every time.

`App\Enums\MailTransport` is the only list. It owns each transport's label, the
settings it reads, its composer package and whether that package is on this
server — and both the settings form and `MailSettingsProvider` are built from
it, so adding one is a case rather than a change in four files that then have
to agree. `.env` stays the fallback: with nothing chosen, none of this fires,
which is what a first deploy and every development machine rely on.

### Send a test message

The button that makes a broken configuration visible. Until it existed the only
way to discover one was for a customer's receipt not to arrive — `Notifier`
swallows send failures on purpose, because a committed ticket must still answer
201 when mail is down.

It is the one endpoint allowed to fail on a mail error, it sends only to the
signed-in administrator, and it returns the mail server's own words rather than
something friendlier: *"Connection could not be established with host
smtp.example.com:587"* says what to fix. A failure also writes `mail_error`,
which the settings screen shows as a banner until a test succeeds.

### New composer dependencies

```bash
composer require symfony/brevo-mailer symfony/mailgun-mailer symfony/http-client
```

Already in `composer.json`, so the documented deploy step covers them.
**`symfony/http-client` is not optional**: both mailer bridges declare it as a
*dev* dependency and then call it at runtime, so installing either one alone
succeeds and fails at the first send.

**SES is offered but not installed.** `aws/aws-sdk-php` is around 50MB of vendor
on every deploy, which is a lot to carry for a transport nobody has chosen, so
it was deferred. The console shows Amazon SES disabled with the command that
enables it:

```bash
composer require aws/aws-sdk-php
```

Nothing else changes when it is run — the enum, the provider, the form and the
tests already cover it, and the SES test skips itself while the package is
absent rather than passing vacuously.

Worth knowing either way: all three providers publish plain SMTP credentials, so
the `smtp` transport reaches Brevo, Mailgun **or** SES today with no bridge at
all. What the API transports buy is better error reporting and immunity to a
host that blocks outbound 587, which shared hosting does.

### Connecting a Google mailbox

Create an OAuth client (Web application) in Google Cloud and register the
callback:

```
https://www.technoware.in/admin/settings/mail/callback
http://localhost:3000/admin/settings/mail/callback     # development
```

Paste the client ID and secret into Settings, **save**, then press Connect. A
settings change takes effect on the next request, because the transport is
applied at boot — the request that saves a setting is not the one that sends
anything through it.

Two things about this that are decisions rather than details:

- **The scope is `https://mail.google.com/`, which is full mailbox access.**
  There is no send-only scope that works over SMTP AUTH; `gmail.send` is
  accepted only by the Gmail HTTP API, which is a different transport.
- **Keep the consent screen out of "Testing".** Google expires refresh tokens
  issued by a test-mode client after seven days, and the mailbox then
  disconnects for no visible reason.

### Two bugs found by building the transports rather than reading the code

**Laravel's Mailgun factory reads `secret`; Brevo's transport reads `key`.**
Both are "the API key", both are a string in a config array, and nothing
distinguishes them — not the type checker, not a review. The wrong one produces
`Undefined array key "secret"` at *send* time, from a screen that had just
reported the settings saved. `OutgoingMailTest` now builds each API transport
for real; reverting the one word fails exactly two of the nineteen tests.

**A field two transports share was rendered twice.** `mail_api_key` belongs to
Brevo *and* Mailgun, and the panel keeps every transport's fields mounted — so
two inputs carried the same `id` and `name` inside one form. The label focused
the hidden twin, and the browser submitted both values for one key. It appeared
to work only because a blank secret means "unchanged" and the empty one was
discarded, which is a rule from the settings API holding the form together by
accident. The panel now renders the deduplicated union.

### Verified

Every transport driven end to end through the browser — chosen, saved, and
tested — with deliberately wrong credentials, so each one reaches its provider
over the network and reports that provider's own refusal:

| | |
|---|---|
| Brevo | `Unable to send an email: Key not found (code 401).` |
| Mailgun | `Unable to send an email: Forbidden (code 401).` |
| Amazon SES | `Request to AWS SES API failed. Reason: The security token included in the request is invalid.` |

SES was verified this way **before** its package was removed, so the transport
is known to build and reach AWS; what ships is the disabled option. The path
that replaced it was verified too: with the package gone, a stored `ses`
transport leaves `.env` in charge instead of half-applying, and the test button
answers with `composer require aws/aws-sdk-php`. That alert renders only from
stored state, so no audited route can reach it — it was measured by hand at
5.36:1 in light and 7.57:1 in dark.

That is as far as verification goes without real accounts, and it proves the
whole chain: bridge present, settings read, transport built, request made,
error surfaced in the UI and recorded in `mail_error`. SMTP and the log
transport were verified by actually delivering — a message on disk in
`storage/logs/mail.log`, which is itself a fix: Laravel's log mailer writes at
`debug` and both `.env` files ship `LOG_LEVEL=warning`, so choosing it used to
produce a cheerful "sent" and nothing anywhere.

The Google consent handshake is the one path that cannot be exercised without a
real Google project. Everything around it is tested: the exact-host check on the
redirect, the single-use server-side `state`, token caching, refresh-token
rotation, and a revoked grant — 19 tests in `OutgoingMailTest`, against a faked
token endpoint.

145 tests, 534 assertions (one skipped: the SES build, while its package is
absent). `pint`, `tsc` and `eslint` clean.


---

## Programmatic SEO

Landing pages generated from combinations the catalogue already knows about:

| | |
|---|---|
| `/brands`, `/brands/cisco`, `/brands/cisco/switches` | brand, brand × category, brand × solution |
| `/locations`, `/locations/kolkata`, `/locations/kolkata/firewall-installation` | place, place × service, place × solution |

The brief that asked for this named the risk in the same breath — thousands of
thin pages is a manual action against the whole domain, not a poor ranking on
one URL. So the module is built so that a thin page **cannot be published**,
rather than being discouraged from it.

### Five rules, each blocking a different route to a doorway page

1. **Existence is earned from data, never enumerated.** A pairing becomes a
   candidate only when three published products sit in that exact intersection.
   Against the seeded catalogue the grid holds **160 combinations and the
   finder returns 2** — the other 158 are pages about hardware nobody carries.
2. **Publication is gated server-side**, returning 422 with the reasons. Not a
   warning in the console: a warning is what somebody clicks past on a Friday.
3. **Near-duplicate introductions are refused.** The rule that matters, because
   it is the only one a determined template does not survive — a second page
   with the city swapped has evidence, length and its own title.
4. **A distinct title and description**, on the same bounds as `SeoScore`.
5. **A ceiling on how many may be live**, `landing_page_cap`, default 40. The
   only rule about the set rather than the page.

### The duplicate check, and why the threshold is where it is

`App\Support\TextSimilarity` compares overlapping five-word runs (Jaccard over
shingles) rather than using `similar_text`, which is a longest-common-substring
measure with no notion of word order and happily reports 80% for two paragraphs
that share nothing but English.

The threshold was measured, not chosen. On realistic copy:

| | score |
|---|---|
| Identical | 1.00 |
| City name swapped | 0.67 |
| City name *and* a clause reworded | 0.55 |
| Same subject, written separately | **0.00** |
| Different subject | 0.00 |

Nothing falls between 0.01 and 0.54, so the refusal line at **0.35** sits in
empty space rather than at the edge of either population. Both ends are pinned
by `tests/Unit/TextSimilarityTest.php`; moving the number means re-measuring.

### Locations are not seeded, deliberately

A `locations` row is a claim that engineers attend sites in that city.
Generating "Firewall Installation in Kolkata" for a city with nobody in it is
the doorway pattern *and* a false statement about the business — the same
mistake as the invented Mumbai address on the must-not-ship list. The client
enters the real ones, and no page about a place may publish until an address, an
attendance line or a written summary exists for it.

The service-and-place suggestions are also capped at two per place. Six services
across five cities is thirty drafts, which in practice is thirty introductions
written from one template — the failure this module exists to prevent, arrived
at by way of the tool meant to prevent it.

### Generating

```bash
php artisan technoware:landing-pages                 # report only; writes nothing
php artisan technoware:landing-pages --create        # drafts, max 10, never published
php artisan technoware:landing-pages --kind=brand_category --limit=3
```

Everything it creates is a draft with an empty introduction — which is exactly
a page the gate refuses. The machine proposes; nothing it proposes reaches the
public site without somebody writing prose that is not a near-duplicate of prose
that already exists. `/admin/landing-pages` lists every draft with what it is
still missing, and `/admin/landing-pages/opportunities` is the same list a
person can act on.

### Verified

Both refusals driven end to end against real Laravel: publishing an
introduction-less page comes back *"Nothing has been written yet. A generated
page is a starting point, not a page."*, and the same paragraph with one word
changed on a second page comes back *"This reads as 80% the same as 'Cisco
Networking Hardware'"* — naming the page it duplicates. A page that is written
separately publishes and renders with the hardware it is about.

25 new tests. The audit covers the four new public routes and the four new
console screens, clean in light, dark and at 320–414px. One defect it caught
that reading would not have: the landing page emitted **two** `BreadcrumbList`
blocks, because `PageHero` already renders one and the page added its own.


---

## Locations as a structured entity

Places are a tree rather than a list:

```
India → West Bengal → Kolkata → Salt Lake
                             → New Town
                    → Howrah
```

`parent_id` plus a level of country / state / city / area. **`state` is not a
column** — it is derived from the nearest state ancestor, because a string
beside a `parent_id` is a second answer to one question and the two disagree the
first time a subtree moves.

**The tree does not shape the URL.** Pages stay at `/locations/kolkata`, not
`/locations/west-bengal/kolkata`: nesting them would make a two-segment place
path indistinguishable in shape from `/locations/kolkata/networking`, which is
the ambiguity the stored-path design exists to avoid.

**A cycle is refused in validation, because a cycle is invisible.** Every node
in a loop still resolves and still renders — it is simply unreachable from a
root, so a whole branch disappears from the site with nothing reporting an
error. Levels may be skipped: a city directly inside a country is ordinary, and
forcing an invented intermediate row produces a page about a region nobody
searches for.

### Services declare where they are offered

Two pivots, `location_service` and `location_solution`, which is the change that
matters most:

```
Network Installation → Kolkata, Howrah, Salt Lake, New Town, West Bengal
```

Before them the generator paired every place with the first two published
services — an arbitrary combination an editor then had to invent copy for, which
is the shortest path there is to a template with a noun substituted in. Now:

- `LandingPageQuality` **refuses** a "<service> in <place>" page unless the
  service is ticked on that place
- the opportunity finder proposes **only** what is ticked
- `areaServed` in the structured data is built from the same list, so the panel
  on the page and the markup a crawler reads cannot drift

**Substance is never inherited.** Kolkata having a response time does not let
West Bengal publish. A state page assembled from its cities' facts says nothing
about the state — that is the template problem moved up a level, not solved.

---

## Schema.org, generated in the backend

All JSON-LD is built by `App\Support\StructuredData` and rendered by the
frontend's `JsonLd`.

### Why it moved

It used to be built where it was *rendered* — six helpers in `lib/seo.tsx` plus
five hand-rolled blocks inline in page components. Eleven files that all had to
agree about what an Article is, and they did not:

- **The blog and the case study both declared `dateModified: published_at`.** An
  article revised two years after publication told Google it had never changed.
  Freshness is one of the few things structured data genuinely moves, and this
  was silently throwing it away on every post, article and case study.
- **Both named the Organization as `author`** while the record had carried
  `author_id` the whole time.
- **`sku` was never emitted**, though it sits on every product row — it is one
  of the two identifiers that lets a search engine match a page to the same part
  listed elsewhere.

The frontend could only emit what a resource happened to expose. The backend has
the data.

### What each page now emits

| | |
|---|---|
| Product | `Product` + `brand` + `sku` + images + a price-less `Offer` |
| Service / Solution | `Service` + `provider` + `areaServed` from the places it is assigned to |
| Blog / Case study | `Article` + real author + `datePublished` + real `dateModified` + image |
| Knowledge base | `TechArticle`, same |
| FAQs | `FAQPage` + `Question` + `Answer` |
| Site-wide | `Organization` + `WebSite` |
| A place | `LocalBusiness` + address + `areaServed` over its subtree |
| A catalogue landing page | `CollectionPage` |

### Three rules it will not break

**Nothing is guessed.** `availability` is nullable with no default — defaulting
it to `InStock` would make every block look complete and would be a claim about
stock this business has never made. There is **no price anywhere**: the brief
rules out carts, checkout and quotations, so Google will report a missing price
for Product, and that is the correct outcome for a catalogue that does not sell
online. An invented one to silence the warning would be the worst thing in the
file.

**Escaping stays at the sink.** `StructuredData` returns arrays; `JsonLd`
serialises them and escapes `<`. `JSON.stringify` does not, so a CMS field
containing `</script>` would close the block and everything after it would
become live markup — `npm run audit` fails on any JSON-LD block containing a
literal `<`.

**`LocalBusiness` is only for a place.** It asserts a physical presence, so on
every page of a site with one office it is a claim to serve everywhere from
nowhere.

### The bug this introduced, and the test that now pins it

Gating `schema` on `routeIs('*.show')` seemed obvious and was wrong: **a nested
resource inherits its parent's route name**, so every product rendered inside
`/solutions/networking` believed it was a detail view, built a Product graph,
touched `brand` and `category` — and with `preventLazyLoading` on, the endpoint
500'd. `ProductResource` has carried a comment about this exact trap for its
`seo` key the whole time, which is fair evidence that a comment was never going
to be enough. It is gated on an explicit `->withSchema()` from the controller
now, and `StructuredDataTest` asserts a nested record carries no graph.

---

## An external code audit, and the five things it found

A static review of the API and frontend on 27 August 2026
(`docs/deep-code-audit-2026-08-27.md`). All five findings were real. Two of
them were the kind that survive review because the code reads correctly and
the test agrees with it.

### The media library accepted SVG, and an SVG is a document

`MediaController` carried a comment saying public media excludes
"no svg-as-document" with `svg` sitting in its allowlist four lines below it.
A browser runs whatever script an SVG carries the moment its URL is opened, so
every upload was stored active content on the API origin — the same hole
`HtmlSanitiser` closes for CMS bodies, on a file type nobody thinks of as
markup.

`App\Support\SvgSanitiser` now cleans one on write, at the sink, exactly like
rich text. It is an **allowlist** of elements and attributes because the
vectors here cannot be enumerated from memory:
`<animate attributeName="href" values="javascript:…">` defeats any check that
reads the `href` as written, since the dangerous value is not in the attribute
at parse time. The bytes are cleaned *before* they reach the disk, so there is
no window in which the raw file has a live URL, and a file the XML parser
cannot read is refused with a 422 rather than repaired.

Rejecting SVG outright was the other option and is the wrong one: vector is
the format logos and icons are published in, all 33 placeholder images in this
library are SVG, and an upload form that refuses the format the content is in
gets worked around.

`tests/Unit/SvgSanitiserTest.php` has one test per vector, and it earned that
shape immediately — the first cut of the class never scrubbed the **root**
element's own attributes, so `onload` on `<svg>`, the payload that needs no
interaction at all, went straight through a sanitiser that read as correct.

The second layer is `api/public/.htaccess`: `nosniff` on everything Apache
serves from `public/`, and `default-src 'none'; sandbox` on `.svg`, which makes
one opened directly inert while costing an `<img>` embed nothing. Two things
that had to be got right there — `<LocationMatch>` is a server-config directive
and is not permitted in `.htaccess` at all (Apache answers 500 for the whole
vhost), and scoping the sandbox policy by path rather than by `.svg` would take
PDFs with it, since `sandbox` stops Chrome's viewer rendering one inline.

### Renaming a brand broke every landing page under it, silently

A landing page's `path` is composed from two or three *other* records' slugs.
`LandingPage`'s `saving` hook recomputes it and writes the 301 — correct, and
never enough, because nothing saved the page when a **constituent** was
renamed. Fixing a typo in a brand name on a different screen moved every URL
under that brand and wrote no redirect at all: live, ranking URLs turning into
404s, which is precisely the outcome the whole module exists to prevent.

The reason it survived is worth more than the fix. The test covering it called
`$page->touch()` after the rename. That proves the model event fires and
proves nothing whatever about anything firing it. **A test that stages the
trigger by hand is testing the mechanism, not the wiring.** The four tests
there now rename a brand, a category through the API, and a location with two
pages hanging off it, and touch nothing.

`RepathsLandingPages` hooks `updated` on all five constituents and re-saves the
pages one at a time, because a mass `update()` skips model events — and the
events are what write the path and the redirect.

### Three smaller ones

**A landing page published on create had no publication date.** The invariant
lived only on the update path, so the one endpoint that could publish in a
single request was the one that left the column null. It is on the model now,
so it holds for both endpoints, the seeder and the artisan command alike.

**A location's level could be edited into a contradiction.** The check returned
early unless the request carried `parent_id`, so a `PATCH` sending only `level`
skipped it — a city inside a state could be promoted to `country` with every
page under it still resolving. Both fields are now read from the request where
it carries them and from the record where it does not. The check also runs
*downwards*, which the audit did not ask for and the same invariant demands:
widening a node strands its children rather than itself, so nothing on the
edited row is wrong and a check that reads only that row sees nothing.

**There was no Content-Security-Policy.** See below — it is the one finding
whose fix is a trade rather than a repair.

### The CSP is deliberately half enforced

`script-src` is the directive that matters and the one this application cannot
tighten. The App Router streams its RSC payload in inline `<script>` tags whose
contents differ per page, so they can be neither hashed nor enumerated, and the
only precise way to allow them is a per-request nonce — which forces every page
to render dynamically. This site prerenders its index pages on purpose, to the
point that a build with an unreachable API *fails* rather than bake a stale
error page into static HTML. Buying `script-src` at the cost of static
rendering trades a measured property for a defence-in-depth one.

So `base-uri`, `object-src`, `form-action` and `frame-ancestors` are
**enforced** — they cost nothing, cannot break an integration, and are the four
that turn a foothold into an escalation — and the full policy ships alongside
as `Content-Security-Policy-Report-Only`.

**`npm run audit` fails on any violation that policy reports**, which is what
makes it a claim rather than a hope: a header nothing checks drifts the first
time somebody adds an integration, and a report-only policy nobody reads
protects no one. Promoting it to enforced is then moving one string, with
evidence behind it.

It caught something on its first run, which is the argument for doing it this
way: every image-bearing route reported a blocked `img-src`. `API_BASE_URL` is
the URL the *server* fetches over; the storage URLs in a response are built by
Laravel from its own `APP_URL`, and on this machine those are `127.0.0.1:8000`
and `localhost:8000` — the same host to a person, two origins to a CSP. The
browser-facing asset origin is a separate fact, so it is stated separately as
`ASSET_ORIGIN`, falling back to the API's origin whenever the two agree.

One more, found by disbelieving a passing reading rather than by reading the
code: **`next.config.ts` is *imported* before Next assigns `NODE_ENV`**, so a
`const dev` at module scope is `true` even during `next build`, and
`'unsafe-eval'` was baked into the *production* policy. Read it inside
`headers()`, which runs after the assignment.

The corollary matters for deployment: `headers()` is evaluated at build time
and written into `.next/routes-manifest.json`, so `ASSET_ORIGIN` has to be set
in the **build** environment, exactly like `API_BASE_URL`. Setting it only at
runtime changes nothing.

It very nearly went unnoticed in the other direction too — `pkill` does not
reliably kill a Node process here, so the first "fixed" reading came from the
previous server still holding port 3000. Kill by PID and confirm the port is
free before believing a header.

### Not changed, and why

The audit suggested reviewing `zip` in the same allowlist. It stays. A browser
downloads an archive rather than running it, a bundle of datasheets is a real
thing an editor publishes, and this endpoint is behind a content-manager
session — it is not the same call as the careers form, which refuses archives
because that upload is open to the internet. The comment claiming otherwise is
what was wrong, and it now says which of the two rules applies here.


---

## Signing in with a code

A six-digit code by email is now the default way in — customer portal and
admin console both — with the password form one link away rather than gone.

```
POST /auth/request-code          POST /admin/auth/request-code
POST /auth/verify-code           POST /admin/auth/verify-code
```

### A code belongs to one door

`sign_in_codes` is keyed on `(audience, email)` and never on a user id, which
is the whole security of the feature rather than a detail of it. Two reasons,
both of which have already cost this project a bug: `Customer` and `User` ids
collide on a seeded install — the administrator and the first customer were
both id 1, which is why `EnsureUserIsCustomer` exists — and both password
brokers once shared `password_reset_tokens`, whose key is the email address, so
a token issued to a *customer* reset the *staff* account at the same address.

A code minted at the portal is therefore refused at the console, and the
reverse. Two tests exist for exactly that, and deleting the audience clause
from `SignInCodes::consume()` fails precisely those two.

### The rules, and what each blocks

| | |
|---|---|
| Hashed at rest | A database read yields no working code |
| Ten minutes | A code left in an inbox is not a standing key |
| **Five wrong entries burn it** | The check that actually closes six digits |
| Single-use, claimed atomically | Two simultaneous submissions mint one token |
| A new code retires the old | Three "send another" presses must not mean three live codes |
| `random_int` | The only one of the obvious three that is cryptographically seeded |

The attempt cap is the one worth arguing for. A route throttle slows an online
guess down; 10⁶ is not a space rate limiting closes on its own. And the consume
is a conditional `UPDATE` on `consumed_at IS NULL` with the affected row count
checked, because the obvious read-then-write version passes every test written
on one thread and is a race in production.

### Nothing here says whether an account exists

`request-code` answers `202` and one sentence for every address — unknown,
known, and one sent a code moments ago alike. A code row is written either way
so the work done does not differ, and the frontend has the other half of the
rule: **the form advances to the code step whatever happened**, because a form
that only advanced for addresses it recognised would hand back exactly what the
API withholds.

Every way a code can be no good — wrong, expired, already spent, burnt through
too many attempts, never issued at all — is one 422 with one sentence.

**One gap is real and is not closed.** Mail goes out inside the request, so an
address with an account behind it answers measurably slower: 1.6s against 1.0s,
measured on this machine. The rate limit bounds how fast that can be walked; the
fix is a queue worker, which is a deployment change and the same one `Notifier`
has wanted since tickets shipped.

### A code confirms an address

Delivering a code and having it typed back is exactly the proof
`POST /auth/verify-email` asks for, so an unconfirmed address is confirmed on
the way past rather than being sent to look for an older email — and the
`email_unverified` refusal cannot arise from this path at all.

That confirmation fires `CustomerRegistered` to the support desk, the way the
verification endpoint does. Without it a customer confirms by signing in, waits
for an approval, and **is in nobody's queue** — the quiet failure in the whole
feature, and the one that would have shipped.

### What this trades

The mailbox is now the only factor. For the portal that is a straight
improvement: those accounts were always recoverable by email, so the mailbox
was already the real credential, and this removes a password nobody remembers.

For the **admin console** it is a genuine reduction — before, an attacker
needed the mailbox *and* a password. That was asked for and is deliberate, and
it is reversible from Settings without a deploy: `otp_admin_login_enabled`.
`password_login_enabled` is a separate switch for a specific reason — mail is
configured from the console and can be misconfigured from the console, so an
install that has turned passwords off and then broken its SMTP settings has
locked out every administrator, and the way back in is a database edit.

### SMS is present and unavailable

`App\Enums\SignInChannel` owns the list the way `MailTransport` does, so adding
a channel is a case rather than a change in four files. SMS reports itself
unavailable and says why: it needs a gateway, a DLT-registered sender and
template — which in India is approved in days, by whoever owns the business
relationship — and a phone number on every account, where `users` has no phone
column at all.

### One input, not six boxes

`components/ui/code-field.tsx`. Six separate inputs is the design everybody
reaches for and it is worse in every way measurable here: pasting a code fills
the first box with all of it, a screen reader announces six unlabelled fields,
backspace has to be hand-written, and six adjacent targets sit inside the 24px
clearance the audit enforces. `autocomplete="one-time-code"` is what lets a
phone offer the code straight from the notification, and it is exactly the
attribute that gets left off one of two copies — hence one component.

### Deploying it

```bash
php artisan migrate --force
php artisan db:seed --class=SettingsSeeder    # the three `auth` settings
```

The seeder is idempotent — an existing row keeps its value and only its group,
type and secrecy are refreshed — so it is safe to re-run and is the only way
the new settings appear.

Skipping it fails safe rather than badly: `Setting::get()` returns the default
`false` for a row that does not exist, codes are switched off, and both screens
render the password form they render today. The feature is simply absent until
the seeder runs.

### Verified

17 feature tests, and the whole chain driven for real: a code read out of
`storage/logs/mail.log`, refused at the console, accepted at the portal *with a
space pasted into the middle of it*, and refused again on replay. Then both
sign-in screens in a browser — the wrong-code path, the resend, the fallback to
a password, and a console sign-in landing on the dashboard with the request and
the sign-in both in the activity log.

244 tests, 821 assertions. `pint`, `tsc`, `eslint` and the build clean.


---

## Summernote replaces CKEditor

The CMS body editor is now **Summernote**, with its full toolbar: style,
bold/italic/underline/strikethrough, superscript and subscript, font family,
font size, text and highlight colour, lists, alignment, indent, line height,
tables, links, images, video, horizontal rules, full screen, code view and
help.

Two things came with it that were not the point but are worth more than the
editor swap.

**The licence question is closed.** CKEditor 5 is dual-licensed and shipped
here as `licenseKey: 'GPL'`, valid only while this repository stays public and
GPL-compatible — a business decision the client still owed, and one that would
have had to be answered before the site could go proprietary. Summernote is
MIT. There is nothing left to decide.

**`node_modules` lost 175 packages and gained 2.** CKEditor 5 pulls its
plugin graph in as separate packages; Summernote is one file plus jQuery.

### The rule that made this bigger than a swap

The old toolbar was deliberately narrow — h2/h3, bold, italic, lists, link,
quote, code, table — because the sanitiser's allowlist is *exactly* the tags
`prose.tsx` styles, and a button producing anything else would write markup the
site renders unstyled.

"All features" therefore could not mean "turn on all the buttons". A toolbar
offering a control the server strips is worse than not offering it: the editor
colours a paragraph, saves, is told it saved, and the colour is gone. So every
button that was switched on was followed through all three layers — the editor,
`config/purifier.php`, and `Prose` — and the tag set widened to match: `h4`,
`u`, `s`, `sub`, `sup`, `pre`, `hr`, `span[style]`, table spans, and an iframe
for video.

Inline style is now permitted, as an allowlist of **properties**. That is what
makes the colour, font, size, alignment, indent, line-height and image
resize/float buttons real rather than decorative. HTMLPurifier parses each
declaration and validates the value against the property's own grammar, so
`expression(...)` and `url(javascript:…)` are refused for not being valid
values of anything listed, rather than by being on a denylist that has to be
complete. `position`, `display` and `z-index` are absent deliberately: those
are the three that let body content leave its box and cover the page's chrome.

Video is restricted to YouTube and Vimeo by `URI.SafeIframeRegexp`, anchored so
`youtube.com.attacker.test` cannot pass — the trap `App\Support\YouTube`
already documents for `str_contains`. Summernote's own list runs to nine hosts.
Each is a decision about who may run code in a frame on this origin, and the
answer is stated in three places that have to agree: that regexp, the editor's
toolbar, and `frame-src` in `next.config.ts`.

### Images go to the media library, in both directions

Summernote inlines a chosen, dropped or pasted image as a base64 `data:` URI by
default. For a 400KB photograph that is ~540KB inside a MySQL TEXT column,
carried by every read of the record, every API response and every prerender —
and invisible to the media library, so it can never be found, renamed, given
alt text, resized or deleted. `App\Support\MediaAlt` resolves alt text by
**path**, so an inlined image has nothing to resolve against either.

Uploads now go through `POST /admin/media` and the body carries a URL like
every other image on the site. That also puts the file through the SVG
sanitiser, which a `data:` URI written straight into the body would have gone
around.

The other half is a **Library** button in the toolbar, which opens the media
library and inserts something already in it — with the alt text stored against
the file. Without it, the only way to reuse a picture is to upload it again,
which is how a library ends up holding four copies of one logo under four
hashed names that cannot be told apart in a grid.

### Three bugs found by running it rather than reading it

**`styleWithCSS: true` was silently dropping underline.** It seemed the tidier
choice — it makes `execCommand` emit `<span style>` rather than the deprecated
`<font>`. What it also does is make Bold emit `<span style="font-weight:bold">`,
which carries no emphasis for a screen reader and which `Prose` does not style,
and Underline emit `text-decoration-line` — a longhand the CSS allowlist does
not name, so it was being dropped on save with nothing reporting it. Exactly
the failure the whole three-layer rule exists to prevent, produced by the
arrangement meant to prevent it. It is off; the browser emits `<b>`, `<u>` and
`<font>`, and `<font>` is normalised on the way in.

**`HTML.TidyLevel` defaults to `medium`, at which nothing is normalised.**
HTMLPurifier's deprecated-element transforms all sit in the top band, so at the
default a `<font color>` was allowlisted and written to the database as a
`<font>`. At `heavy` it becomes a `<span style>` whose declaration is validated
like any other. `HTML.TidyRemove` exempts `u` and `s`, whose transforms are a
loss rather than a normalisation — both are real elements the allowlist admits
and `Prose` styles, and flattening them into spans discards the markup in order
to reproduce the appearance.

**A body containing only a video saved as null.** HTMLPurifier kept the iframe
perfectly and `HtmlSanitiser::isBlank()` then threw the whole result away,
because it had no *text* and no `<img>`. That check was correct exactly while
an image was the only childless element the allowlist admitted.

One smaller one, from the browser console rather than the database: a custom
Summernote toolbar button must be passed `container`. Summernote's own Buttons
module wraps `ui.button` with a method that sets it, so a custom button calling
`context.ui.button` directly skips it and `TooltipUI.show` reads `.top` off
`undefined` — on hover, so the button works and the console fills with a
TypeError the moment anyone points at it.

### Theming, because Summernote ships one light stylesheet

Every panel, border, button and dialog is re-pointed at the design tokens in
`globals.css`. Not cosmetic: `AUDIT_SCHEME=dark npm run audit` measures the CMS
edit screens, which is where the editor is, so a hard-coded `#fff` slab inside
a near-black page fails the contrast gate rather than merely looking wrong.
There are no literal colours — every one of those surfaces inverts.

Two details that are rules rather than preferences. Toolbar buttons are 36px
with a mouse and 44px on a coarse pointer, because Bold and Italic sit 2px
apart and on a tablet a miss is not a near miss, it is the opposite command.
And the editable area is pinned to 16px: the `width < 40rem` block lifts every
*form control* to 16px so iOS does not zoom the page on focus, and a
contenteditable div is not a form control, so it would have been missed.

Summernote's dialogs are moved to `<body>` (`dialogsInBody`), because every CMS
form here is a single `<form>` and a dialog left where it is built puts its
inputs inside it — so Enter while typing a URL into the link dialog submits the
record. The consequence is that those dialogs are not inside `.cms-editor` and
are styled through Summernote's own class names instead.

### Verified

`HtmlSanitiserTest` is 33 tests, 332 assertions — the twelve hostile vectors it
always had, plus an iframe to an unknown host, a `youtube.com.attacker.test`
lookalike, `youtube.com` in the *path* of another host, a `javascript:` iframe,
`expression()`, `behavior:`, `url(javascript:)` and a fixed overlay. Then the
positive half: every toolbar control in one body, asserted against **what a
browser actually emits** rather than the tidy markup it ought to — writing it
the other way is how the first version passed while underline was being
dropped.

Each new rule was control-run: reverting `CONTENTFUL_TAGS` to `<img>` alone
fails exactly the embedded-body test, loosening the iframe pattern to a
substring match fails exactly three, dropping `float`/`width` from the CSS
allowlist fails exactly the formatting test, and `TidyLevel: medium` and the
`u,s` exemption each fail exactly two.

Then the whole chain in a browser against real Laravel and MySQL, on a
throwaway blog post that was deleted afterwards: type, bold, underline, centre,
insert an image from the library, save, reload, and read back
`<p style="text-align:center;"><b><u>…</u></b></p>` with the image as a URL
carrying the library's own alt text and no `data:` URI anywhere. 259 API tests,
`pint`, `tsc`, `eslint` and the build clean.


---

## The media library becomes a media manager

Eleven new API routes and a console to match: sorting, multi-select with bulk
move/copy/delete, a full-screen preview, a details panel, an image editor
(rotate, flip, brightness, contrast, greyscale), overwrite-in-place, a bin,
per-file version history, folder upload, and one upload control used everywhere
in the product.

### The five bugs behind "uploads do not work"

Reported as *"most of the time file not uploading"*, which turned out to be
five separate things.

**Next caps a Server Action body at 1MB, and every upload here is one.**
`serverActions.bodySizeLimit` was never set, so anything larger than a small
image failed with a **500 and nothing on screen** — the action throws before
its own body runs, so there is no error path to report from. Small test images
passed and ordinary photographs did not, which is exactly why it read as
intermittent rather than as a size rule. Every probe written until then had
used a 70-byte PNG, which is precisely the size that always worked.

**Two nested drop zones.** A `stopPropagation` on the upload panel stopped the
grid's drop handler running, and that handler is the only thing that clears its
"Drop to upload" overlay. The file uploaded; the screen stayed covered until a
reload. The fix inverts the responsibility — the panel marks itself
`data-filedrop`, and the outer target resets its overlay *first* and then skips
a drop that landed inside one.

**A thrown action wedged the uploader permanently.** `redirect()` works by
throwing, so a 401 escaped the async block and left `busy` true: every later
upload returned at the guard having done nothing and said nothing.

**The dark scheme lost on source order.** Summernote's stylesheet ships from
the dynamically imported editor chunk, so it applies *after* `globals.css` — a
one-class override merely ties its one-class rule and loses. The text went to
`--color-ink` while the panel stayed `#fff`: 1.11:1 across 43 elements. Not a
false positive either; open the colour dropdown in dark and the labels were
genuinely unreadable.

**Editing an image showed the old one.** An edit rewrites the file in place,
because the path is the identity records store — so the URL does not change and
the browser serves what it already has. Reported as "the gallery is not
refreshing". `url` now carries `?v=<updated_at>`; `path` never does, because a
stored path with a query string is a filename that does not exist.

### Deleting is survivable now, and so is editing

Nothing in this product tracks which records reference a path, so the delete
dialog has always had to admit it cannot say what it will break — which means
the mistake is found by somebody opening a page and seeing a hole in it, days
later. Deleting now fills a **bin** and keeps the bytes, because a restore has
to put back the *exact* URL that was published; re-uploading the same image
under a new hashed name would leave every referencing record broken.

Every in-place edit archives the previous bytes **before** it runs. Doing it
afterwards looks identical from outside and stores the new bytes every time —
a history of the present, which restores nothing. Ten versions per file,
because these are full copies on the public disk.

### Limits are visible, and they are not ours alone

The 5MB limit lived in `config/media.php`, where neither a browser nor an
administrator could see it — so the refusal only arrived after the whole file
had been sent. It is a setting now, and Settings shows php.ini's own
`upload_max_filesize` and `post_max_size` beside it.

The effective limit is a **minimum** across all three. A value above php.ini is
not a bigger limit; it is a promise the server will not keep, and with
`post_max_size` it is worse than that — PHP throws away the entire request
body, so Laravel reports the file as *missing* rather than as too large.

Image quality is a setting too, and it applies to images the application
**produces** — a resize, a crop, a thumbnail, a rotate — never to uploads. An
upload is stored byte-for-byte, because re-encoding somebody's original
discards quality they cannot get back and it is the only copy there is.

### One uploader, everywhere

There were three: a bare `FileInput` on the ticket and careers forms, a
`FileInput` plus a separate invisible drop zone on the media library, and
another inside each cover and gallery picker. Dragging worked on exactly one
screen and nothing anywhere said so.

Progress is measured in **files, not bytes**, and the label says so. Byte-level
progress needs `XMLHttpRequest.upload.onprogress` and every upload here goes
through a Server Action, which emits no progress events. A percentage animated
on a timer would be worse than none: it is the one part of an upload people
watch to decide whether something has hung.

### Two GD traps, caught by asserting on pixels

`imagerotate` measures **anticlockwise**, which is invisible at 180° and
exactly wrong at the two angles anybody uses. `IMG_FILTER_CONTRAST` is
**inverted**, so passing a "more contrast" slider straight through flattens the
image and reads as a weak filter rather than a backwards one.

Two of the tests written for these were wrong first, informatively: one
asserted that a rotation put black where the test image's own grey marker
lands, and the other measured contrast on mid-grey — which is the *fixed point*
of a contrast transform, the one value that cannot demonstrate it.

### Verified

35 media tests and 12 upload-limit tests, each new rule control-run: reverting
the id tiebreak, the snapshot ordering, the prune's file cleanup, the rotation
direction, the contrast sign, the quality preset, `as_copy` and the versioned
URL each fail exactly their own tests and nothing else.

One control run proved nothing and is worth recording: an early attempt failed
all 27 tests, which looked like overwhelming evidence and was a syntax error in
the patch. Re-run with valid PHP, it failed the three it should.

Then the browser: uploads by picker and by drop on both targets, a 2.97MB
photograph, an oversized file refused with its own sentence, multi-select
through duplicate and bulk delete, the bin through delete/restore/purge, and
the editor turning an 870x1280 image to 1280x870 and back. 308 tests, `pint`,
`tsc`, `eslint` and the build clean; `/admin/media` and `/admin/settings` clean
in light and dark.


---

## Mail leaves through a queue

Every notification in the application had `use Queueable` and every one of
them was still sent inline — that trait queues nothing on its own; the
`ShouldQueue` interface is what does it. So SMTP sat on the request path, and
an unreachable host had already been measured taking a contact-form submission
from 0.2s to **12.5 seconds**: long enough for a visitor to press Send twice,
and long enough that a few concurrent submissions occupy every PHP worker
there is. The five-second timeout in `config/mail.php` was a floor under that
failure, never a fix.

Eleven notifications are now queued. **Three are not, and each says why in its
own file**: the sign-in code, the password reset and the address verification.
Somebody is sitting at a form waiting for those, and the queue is drained once
a minute — a six-digit code that takes a minute to arrive is a sign-in nobody
can use.

### Drained by the scheduler, not a daemon

```
* * * * * php artisan schedule:run
```

That one cron entry is the whole deployment requirement, and four commands
already depended on it. `queue:work --stop-when-empty --max-time=50` runs every
minute and ends when the queue is empty, so a missed minute costs nothing and
two runs cannot overlap. Asking for a supervised daemon as well would be a
second operational requirement, and **mail that silently stops because nobody
set it up is worse than mail that is a minute late**.

A short-lived worker also re-boots on every run, which matters here: outgoing
mail is configured in the console and applied at boot, so a long-running daemon
would hold the settings it started with — a changed SMTP password would take
effect for web requests and not for the queue.

### The two silent failures this had to answer

Moving the send introduced a failure mode of its own, and both halves are
closed:

- **A queued send cannot throw during the request**, so `Notifier`'s guard has
  nothing to catch. `QueuedMail::failed()` writes `mail_error` after three
  attempts — the same banner a failed test writes, so the way back to health is
  unchanged.
- **If the scheduler stops, nothing throws, nothing is logged and no
  `mail_error` is written.** Jobs simply accumulate while the console looks
  perfectly healthy. `GET /admin/settings/mail` now reports the backlog and the
  settings screen warns when the oldest waiting job is over five minutes old.
  The age is the figure that matters, not the count.

### Verified

The configured transport was checked by connecting and authenticating against
the relay without sending anything. Five tests pin the rest, on the `database`
driver rather than the `sync` one `phpunit.xml` uses — which is the only way to
tell "this left the request" from "this was sent during it": raising a ticket
queues two jobs and sends nothing; requesting a sign-in code queues none; the
worker the scheduler runs drains both jobs with nothing left in `failed_jobs`
and two messages delivered; and a failed delivery writes `mail_error`.

Control-run both ways — un-queueing one notification fails exactly the queue
test and the split test, and removing `failed()` fails exactly the `mail_error`
test. 333 tests, 1,233 assertions.
