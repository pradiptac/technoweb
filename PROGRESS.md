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

## Phase 4 — Done

- [x] **Ticket and enquiry notifications.** New ticket to the support desk
      plus a receipt to the customer, replies to whichever side did not write
      them, and enquiries to the sales inbox. Addresses come from settings, so
      they change in the admin without a deploy.
- [x] **Failures never break the request.** `App\Support\Notifier` logs and
      swallows: a committed ticket must still return 201 when mail is down.
- [x] **An internal note never reaches a customer** — guarded at the call site
      and covered by a test that posts one and asserts nothing was sent.

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
