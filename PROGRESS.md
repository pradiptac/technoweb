# Technoware — progress checklist

Living tracker, updated as each slice lands **and is verified** — nothing is
ticked here that has not been run. See `CLAUDE.md` for architecture and
conventions and `API.md` for the endpoint reference; this file is just
"what's done vs. not."

**In progress:** nothing — the last slice is committed and verified.

**Branch:** work lands on `phase-3-admin-cms`. `main` is still at the end of
Phase 2, so Phase 3 is not merged yet.

## Phase 1 — Foundation

- [x] Design-token layer (Tailwind v4, `web/src/app/globals.css`)
- [x] Public homepage, static-rendered
- [x] Typed API client (`web/src/lib/api.ts`) with ISR + error handling
- [x] Customer auth — Sanctum token in httpOnly cookie
- [x] Full database schema — 30 tables, FKs, indexes
- [x] Support tickets end to end (customer side): create, converse, attach,
      close, reopen, internal notes, SLA clock, audit trail
- [x] Staff ticket queue API (filtering, assignment, status transitions) —
      built, not yet reachable from a browser until Phase 3's admin login
- [x] RBAC across four staff roles (`Role` enum, `role:` middleware)
- [x] SEO layer — metadata, JSON-LD, `robots.txt`, `sitemap.xml`, 301s

## Phase 2 — Inner marketing pages + resources

- [x] `/solutions`, `/services`, `/industries` — index + detail
- [x] `/products`, `/products/[slug]` — category/product resolver
- [x] `/contact` — enquiry form
- [x] `/resources`, `/blog`, `/case-studies`, `/knowledge-base`, `/about`
- [x] Redirect middleware, sitemap generated from the API
- [x] Ticket-deflection loop (KB ↔ new-ticket form)

## Phase 3 — Admin CMS

**Shell, dashboard, ticket queue, ticket detail — done:**

- [x] Staff authentication (`/admin/login`, separate `tw_admin_session`
      cookie, separate Sanctum guard flow from the customer portal)
- [x] Admin shell — sidebar nav, header, sign-out (`/admin/(app)/layout.tsx`)
- [x] Dashboard — ticket counts, recent tickets, high-priority list, status
      breakdown (`/admin`)
- [x] Ticket queue — filters (status, priority, assignee, unassigned,
      overdue, search), inline status transitions, inline reassignment,
      pagination (`/admin/tickets`)
- [x] Ticket detail/reply (`/admin/tickets/[reference]`) — full conversation
      thread with a distinct internal-note treatment, reply form (customer-visible
      or internal, with attachments), inline status/assignee controls reused
      from the queue. Fixed two real bugs found while building this: staff
      replies weren't persisting attachments, and staff couldn't download any
      ticket attachment at all (wrong authorization route).
- [x] Staff listing endpoint for the assignment dropdown
- [x] Every form on the site (contact, portal login/reply/new-ticket/profile,
      admin login/reply) converted to floating labels — shared `Field`
      primitive in `web/src/components/ui/input.tsx`
- [x] Main container widened to 90% / max 1920px (`components/ui/container.tsx`)
- [x] AOS-style scroll reveals across the marketing site —
      `components/ui/reveal.tsx` (IntersectionObserver, no dependency) plus
      the `data-aos` CSS in `globals.css`. Author with `data-aos="fade-up"`,
      stagger with `data-aos-delay` (see `STAGGER` in `lib/utils.ts`).
      Deliberately excluded: the portal and admin (dense utility UI), and
      above-the-fold headings (animating the LCP element delays it).
- [x] Verified against the mock API and against real Laravel + MySQL with a
      real admin account

- [x] Closed the customer/staff authorization gap. Every portal endpoint
      authorised by comparing the caller's id against a ticket's
      `customer_id` — ids drawn from two different tables, which collide
      whenever the numbers match (as they did for the seeded admin and
      customer, both id 1). A staff token could therefore read a customer's
      tickets, profile and attachments. Fixed at the routing layer with an
      `EnsureUserIsCustomer` middleware (`customer` alias) mirroring the
      staff-side `role:` middleware, rather than patching each call site;
      it also revokes access for a customer deactivated after sign-in.

- [x] Fixed a fatal in `TicketController::store()` — a `Stringable` passed
      into an enum-cast column meant customers could not create a ticket at
      all. Verified end to end through the portal form.

- [x] **HTML sanitisation on write** (`api/app/Support/HtmlSanitiser.php`) —
      the long-standing Phase 1 TODO recorded in `prose.tsx`. Allowlist
      pinned to the tags `Prose` styles. Covered by the project's first
      tests (`api/tests/Unit/HtmlSanitiserTest.php`).
- [x] **Blog CRUD** — list, create, edit, delete, with CKEditor 5, cover
      images, draft/publish and SEO overrides. This is the **template** the
      remaining CMS entities should copy.
- [x] **Knowledge base CRUD** — same shape plus tags and categories; the
      admin search reuses the model's own `scopeSearch`, so the CMS finds
      articles the way customers do.
- [x] **Case studies CRUD** — adds a `results` repeater of figure/label
      pairs, `client_name` and an industry picker; no publish date, because
      the table has no such column.
- [x] **Shared CMS scaffolding**, extracted so each further entity is small:
      `SeoPanel`, `CoverField`, `EditorField`, `ResultsField` and
      `admin-form.ts` (web); `SeoRules`, `SeoOverrideArray` and the
      `WritesCmsEntities` trait (api).
- [x] **Solutions CRUD** — string lists (benefits, technologies), two
      many-to-many pickers, an icon picker and inline FAQs.
- [x] **Pages CRUD** + a public catch-all route, fixing the footer's three
      dead links (`/privacy`, `/terms`, `/downloads`).
- [x] **Media library** upload endpoint (`POST /admin/media`) + `storage:link`.
- [x] **Demo content and imagery across every section** — 10 products with
      real specs, solution/service/industry bodies, FAQs and 25 generated
      placeholder images (`ProductSeeder`, `DemoContentSeeder`, `PageSeeder`).
- [x] **Mega menu** driven by the CMS — icons, summaries and a mobile
      accordion; CSS-only, no JavaScript.
- [x] **`API.md`** — every `/api/v1` route, generated from the live route
      table and checked back against it, plus the non-obvious behaviour
      (search must not be ISR-cached, `seo` is an override where null means
      "derive it", slug changes write their own 301, repeating fields are
      replaced not diffed).
- [x] **Settings screen** (`/admin/settings`, `role:admin` only) with the
      footer social icon row it drives. Six profiles; a blank one hides its
      icon rather than linking nowhere. Saving calls `updateTag("settings")`,
      so an editor sees the change in the footer immediately instead of
      waiting out the ten-minute cache.

- [x] **Services and industries CMS.** Two departures from the shared
      pattern, both forced by the data: an industry is titled `name`, not
      `title`, and has **no `status`** — it is reference data the catalogue
      points at, not something you draft. Consolidated `/admin/industries`,
      which had been both a picker and a CRUD index under two URLs, into one.

- [x] **Brands and product categories CMS.** Neither has a publish status, for
      different reasons: a brand is a filter facet on the product listing with
      no page and so no SEO either, and a category is taxonomy like industries.
      Categories are a tree, which brings the two behaviours worth knowing:
      reparenting is refused if the target is the category itself or one of its
      descendants (that would cut the branch out of the navigation silently),
      and deleting a parent promotes its children to the grandparent rather
      than letting the FK scatter them to the top level.

- [x] **Products CMS** — the largest entity: an ordered specifications
      editor, features list, image gallery, one-way related products, solution
      links and FAQs. Its index doubles as the picker other forms use, which
      retired the duplicate `/admin/products` endpoint the solution form had
      been calling.

      Two bugs surfaced while building it, both pre-existing. **MySQL JSON
      does not preserve object key order**, so every product page had been
      rendering its spec sheet in an order nobody chose and no amount of
      reordering in the admin could stick — `AppCastsSpecSheet` now stores
      the sheet as an ordered list of pairs. And a deleted product held its
      slug for ever, because `Product` is the only soft-deleting model and
      nothing lists trashed rows, so recreating it was refused by a uniqueness
      check naming a record no one could see.

- [x] **FAQs as a standalone screen** — every question on the site in one
      list, filterable by what it hangs off. An FAQ must name an owner even
      though the column allows null: nothing on the public site renders an
      unattached one.
- [x] **Media library browsing UI** — grid, search, upload, delete, and the
      storable path shown for copying into a record.
- [x] **Redirects manager** (`role:seo_manager`) — separates the rows the CMS
      wrote on a slug change from the ones a person added, and shows hit
      counts so a dead redirect can be told from a live one.
- [x] **SEO manager** (`role:seo_manager`) — every indexable record with the
      metadata it will publish, derived versus overridden, and length warnings.
      Read-mostly by design; the only write is the sitemap toggle.
- [x] **Staff/user management** (`role:admin`) — accounts, roles and three
      lockout guards. The last active administrator cannot be deactivated,
      deleted or demoted, which is what stops two admins demoting each other
      and leaving no way in.
- [x] **Admin console chrome** — the public header and footer no longer wrap
      the console or the portal, and the nav has icons grouped into Content,
      Catalogue and Site.
- [x] **The homepage reads the CMS.** Five sections were rendering from a
      static file, so editing a solution or publishing a post changed every
      page except the homepage. Hero copy and the statistics moved into
      settings at the same time, which is what makes the invented figures
      correctable without a deploy.
- [x] **Demo support desk** (`DemoSupportSeeder`) — a portal login, five
      tickets across every status, a thread containing an internal note, and
      two enquiries. Demo data; must go before launch.

- [x] **Branding, contact and integration settings.** Logo and favicon
      uploads, the company address, a validated Google Maps embed, the contact
      number, SMTP credentials and an API key — all editable at
      `/admin/settings` and used by the frontend. The logo appears in the
      header and footer, the favicon in the document head, the address and
      phone in the footer, on the contact page and in the Organization
      structured data, and the map on the contact page.

      The two credential groups are private: excluded from the public
      settings endpoint, encrypted at rest, and never returned to the browser.
      SMTP details override the mail config at boot, so the client can change
      mail provider without a deploy.

- [x] **Analytics settings** — GA4, Google Tag Manager, Meta Pixel, and both
      site-verification tags. Each loads only when its ID is set, and only on
      the public site: never in the admin console or the customer portal,
      where a tracker would send ticket URLs containing a customer reference
      to a third party.
- [x] **Fixed a broken share image.** Every index page pointed `og:image` at
      `/og-default.png`, which was never added — a 404, so sharing the
      homepage produced a blank preview. Replaced with a generated card that
      reads the company name and tagline from Settings.

- [x] **Cookie consent banner**, gating the analytics for real: nothing loads
      until someone accepts, and declining is remembered. Shown only when an
      analytics ID is configured. All six strings are editable in Settings,
      and gating can be switched off there if the client decides it is not
      needed.

**Still owed by the client:**

- [ ] **Consent wording.** The default copy is a starting point written to be
      replaced — it has not been reviewed by anyone qualified, and neither has
      the privacy policy it links to.

- [x] **Password reset and change**, both principals. Forgot-password and
      reset screens for staff and customers, plus `/admin/profile` so any
      staff role can change their own password — previously only an
      administrator could, via the Staff screen, which meant knowing it.
- [x] **Split-screen sign-in** for both principals, with a configurable image
      (`login_image_path` in Settings) beside the form. Hidden on phones,
      where it would push the form below the fold.
- [x] **Footer credit** — copyright plus "Developed by Altis Infonet Private
      Limited".

- [x] **Mobile menu drawer** — two thirds of the viewport, anchored right,
      with the page dimmed behind it. Closes on Escape or a tap outside, and
      locks the page behind it. The drawer slides in and out; the third of the
      screen that stays visible fades by opacity.

## Phase 4 — Done

- [x] **Ticket and enquiry notifications.** New ticket to the support desk
      plus a receipt to the customer, replies to whichever side did not write
      them, and enquiries to the sales inbox. Addresses come from settings, so
      they change in the admin without a deploy.
- [x] **Failures never break the request.** `App\Support\Notifier` logs and
      swallows: a committed ticket must still return 201 when mail is down.
- [x] **An internal note never reaches a customer** — guarded at the call site
      and covered by a test that posts one and asserts nothing was sent.

## Mobile responsiveness — audited and fixed

Audited with a new `web/scripts/mobile-audit.mjs` (`npm run audit:mobile`) at
320/360/390/414 px across all 53 routes: public site, signed-in portal, admin
console. It names the offending element rather than the offending page. All 53
now pass; `npm run audit`, `tsc --noEmit`, `eslint` and `npm run build` are
clean alongside it.

- [x] **Every form control was 15px, admin filter selects 13px.** iOS Safari
      zooms the page when a control under 16px takes focus and does not zoom
      back, so tapping any field on the site threw the layout sideways. Fixed
      at the cascade level in `globals.css` rather than across 34 files.
- [x] **79 sub-12px text utilities** (down to 10.5px) lifted to a 12px floor on
      phones only; the desktop console keeps its density.
- [x] **The admin nav was seventeen unlabelled 16px slivers.** `min-w-0` on the
      links let them shrink below their own labels once the sidebar became a
      horizontal strip. The strip is meant to scroll; only the container may
      shrink.
- [x] **All fifteen admin list tables become labelled cards below `md`.** They
      were 620–900px wide inside `overflow-x-auto`, which is why nothing ever
      flagged them: contained, so no overflow — and unreadable, because you
      met them through a 360px window.
- [x] **The hero's NOC topology diagram is hidden on phones.** Its labels are
      in viewBox user units, so at 360px `fontSize="8.5"` rendered at 5.4px.
      No font size fixes it: 12px on screen needs 19 user units, and
      "CORE-SW-01" at 19 units is wider than the 68-unit box it labels.

Two flaws in the audit itself, both found by disbelieving its output:
decorative blobs inside `overflow: hidden` were reported as overflow, and SVG
text was measured in user units instead of on-screen pixels.

### Still open

- **The same diagram labels are also under 12px at 1024, 1280 and 1440 px** —
  the panel narrows when the hero goes two-column. Same defect, desktop
  widths, and deliberately not fixed here: it needs the diagram redrawn with
  fewer, larger nodes, which is a design decision rather than a bug fix.

## Admin forms are tabbed

Every CMS entity form now splits into Content / Media / Related / SEO, the
same treatment `/admin/settings` already had. Measured at 1440x900:

| form | before | after |
|---|---|---|
| solutions | 1972px | 1275px |
| products | 1878px | 1225px |
| services | 1226px | 900px |
| industries | 1226px | 900px |
| product categories | 1001px | 900px |
| case studies | 970px | 936px |

Blog, knowledge base and pages were already within a screen and gained tabs
for consistency, replacing the collapsible SEO card with a panel.

Brands, FAQs, redirects, staff and profile are deliberately left alone — 7 to
12 fields each, where tabs are chrome rather than structure. The rule used was
"does it carry a `SeoPanel`", which is exactly the set of CMS entity forms.

Verified in a browser, not by reading: all nine are tabbed, every inactive
panel stays mounted, and a real create-then-reload round trip on a throwaway
record proved a field typed on Content, a relation ticked on Related, an
override typed on SEO and **the sitemap checkbox unticked on a hidden tab**
all survive a save made from a different tab. That last one is the historical
bug this whole pattern is most able to reintroduce.

A 422 whose only error sits on a hidden panel jumps to that tab and badges it
with a count, rather than reporting "could not save" over a form that looks
entirely valid.

## Customer self-registration — done

Customers can register themselves; the support desk approves them. Three
steps, and each proves something the next one needs.

- [x] `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification`
      — public, throttled, honeypot on `website`
- [x] `customers.status` (`pending`/`active`/`rejected`/`suspended`), replacing
      the `is_active` boolean
- [x] Hashed, single-use, 24-hour confirmation tokens
- [x] `/portal/register`, `/portal/register/check-your-email`,
      `/portal/verify-email`
- [x] Login refuses with a machine-readable `reason`, and each reason gets its
      own screen
- [x] `/admin/customers` — the approval queue, plus reject / suspend /
      reactivate / resend, each with a staff-only note
- [x] Five notifications, all through `Notifier` (a send failure never fails a
      request)
- [x] `registration_enabled` closes the door in one setting
- [x] 23 feature tests; `npm run audit` clean in both schemes,
      `npm run audit:mobile` clean on all 55 routes

**Two bugs found by running it, not reading it.** Dropping `is_active` broke
`EnsureUserIsCustomer`, which still read it — the missing attribute evaluated
as false and every authenticated portal request 403'd, taking the whole
customer portal down. And approving an account reported nothing at all: the
button is conditional on the status it changes, so `revalidatePath` unmounted
it and destroyed its own success message.

**One that had been shipping for months.** `Alert`, `Badge` and `ErrorState`
each paired an inverting `*-soft` background with hexes chosen for the light
palette. Every alert in the console and the portal was 1.53:1 in dark mode.
The audit had never caught it because the contrast check only measures what is
on the page, and no audited route rendered an alert by default — the new
confirmation screen is the first that does.

## Decisions still owed by the client

- **CKEditor 5 licence.** It is dual-licensed GPL-2.0+/commercial and is
  currently wired with `licenseKey: 'GPL'` — valid because this repository is
  public and GPL-compatible. A proprietary deployment needs a commercial key.
  One line in `web/src/components/admin/rich-text-editor.tsx`.
- **Privacy and terms copy.** The seeded pages are a structurally complete
  starting point, not legal advice. They need review by someone qualified and
  the real company details before launch.

## Known placeholders that must not ship

See CLAUDE.md's "Known risks and placeholders" — invented phone number,
"since 2009", stats, case studies, testimonial, and the text-only logo. Plus,
from the demo-content seeding: all 25 generated placeholder images, the ten
seeded products, the privacy/terms/downloads copy, and the three social
profile URLs.

The social URLs are the sharpest of these: they are live links to accounts
that are probably somebody else's, and unlike the rest they are *outbound*.
`SettingsSeeder` seeds them null on purpose; only `DemoContentSeeder` fills
them, and only where blank. Clear them in `/admin/settings` — a blank value
hides the icon rather than linking nowhere.

**Local environment note.** `api/.env` had `APP_ENV=production` on the dev
machine, which forced https on generated URLs (breaking every image) and
disabled `preventLazyLoading` and `preventSilentlyDiscardingAttributes` — the
two guards CLAUDE.md relies on outside production. Now set to `local`;
previous values are in `api/.env.backup-before-local-fix`.
