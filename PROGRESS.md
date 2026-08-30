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
- [x] **Blog CRUD** — list, create, edit, delete, with a rich-text editor, cover
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
- [x] **Dashboard chart and lifecycle fix** — the ticket volume chart gained a
      baseline, a y-scale and dated x ticks; its two series are grouped rather
      than stacked. Behind it, a real bug: `resolved_at` was nulled on any
      status change that was not *to* Resolved, and `resolved → closed` is the
      ordinary path — so closing a ticket erased when it was resolved, and the
      dashboard's resolution metrics were computed over every ticket except
      the finished ones. Six tests in `TicketLifecycleTest`, verified to fail
      against the old line. Stat and metric cards also carry icons.
- [x] **Hydration warning on every page** — `<html>` takes the pre-paint
      script's `data-scheme` and `color-scheme` and had no
      `suppressHydrationWarning`, so React logged a mismatch on every route in
      the product. A console that always holds one error hides the next one.
- [x] **`Field` wires `aria-describedby`** — it built the hint and error ids,
      rendered both paragraphs, and pointed nothing at either, so every hint
      and every "why the save failed" message in the product was text a screen
      reader could not tie to its field.
- [x] **SEO scoring** — a score per record and one for the site, out of
      nineteen checks across metadata, content, focus keyword and technical.
      Each record's failures travel with its score and say what to do; the
      site card ranks the fixes by what each is costing and every figure on it
      filters the list to the records behind it. Scored out of the checks that
      *apply*, so an entity with no body is not marked down for content it
      cannot have. Fifteen unit tests in `SeoScoreTest`.
      Two bugs found on the way in: `admin_path` used the API's resource names
      rather than the console's, so blog posts and knowledge articles linked to
      a 404 from the one screen for finding records to fix; and `has_override`
      read whether an override row existed rather than whether anything was in
      it, so every record ever toggled out of the sitemap claimed "Overridden"
      with nothing to show for it.
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

- [x] **Outgoing mail, chosen in the admin.** Six transports — SMTP, Gmail or
      Google Workspace over OAuth, Brevo, Mailgun, Amazon SES, and a log
      transport that sends nothing. `App\Enums\MailTransport` is the only
      list: it owns each one's label, its fields, its composer package and
      whether that package is on this server, and both the settings form and
      `MailSettingsProvider` are built from it.

      Brevo and Mailgun ship their bridges, plus `symfony/http-client`, which
      both call at runtime while declaring it dev-only. **SES is offered but
      not installed** — `aws/aws-sdk-php` is ~50MB of vendor per deploy for a
      transport nobody has chosen, so the console disables the option and
      shows `composer require aws/aws-sdk-php`, which is the whole of turning
      it on. Every provider here also speaks plain SMTP, so the `smtp`
      transport reaches any of the three with no bridge at all.

      **"Send a test message" is the point of the screen.** `Notifier`
      swallows send failures on purpose, so until this existed a broken
      configuration announced itself by a customer's receipt not arriving. It
      is the one endpoint allowed to fail on a mail error, it sends only to
      the signed-in administrator, and it returns the mail server's own words.
      A failure writes `mail_error`, which shows as a banner until a test
      succeeds.

      Each transport was driven end to end in a browser with deliberately
      wrong credentials, so each reaches its provider and reports that
      provider's own refusal. The Google consent handshake is the one path
      that needs a real Google project; everything around it is tested — the
      exact-host redirect check, the single-use state, token caching, refresh
      rotation and a revoked grant.

- [x] **Programmatic landing pages.** `/brands/{brand}`,
      `/brands/{brand}/{category-or-solution}`, `/locations/{place}` and
      `/locations/{place}/{service-or-solution}`, generated from combinations
      the catalogue already supports.

      The brief that asked for these also named the risk, so the module is
      built so a thin page **cannot be published** rather than being
      discouraged from it. Existence is earned from data — against the seeded
      catalogue the grid holds 160 combinations and the finder returns 2.
      Publication is refused server-side with reasons: evidence behind the
      pairing, at least 40 words of written introduction, that introduction not
      reading as a near-duplicate of another page's, a distinct title and
      description, and a published count under a configurable cap.

      The duplicate check is the one that matters, because it is the only rule
      a determined template does not survive. `App\Support\TextSimilarity`
      compares five-word runs: a paragraph with the city name swapped scores
      0.67, two intros written separately score 0.00, and the refusal line sits
      at 0.35 in the empty band between them.

      **Nothing seeds a location.** A row is a claim that engineers attend
      sites there, and no page about a place may publish until an address, an
      attendance line or a written summary exists for it.

      `technoware:landing-pages` reports by default, creates drafts with
      `--create`, and never publishes anything.

- [x] **Locations as a structured entity.** A tree — India → West Bengal →
      Kolkata → Salt Lake — via `parent_id` and a level of country / state /
      city / area. `state` is derived from the nearest ancestor rather than
      stored, so there is one answer to where somewhere is. Cycles and
      impossible nestings are refused in validation, because a loop is
      invisible: every node in it still resolves and is merely unreachable from
      a root.

      **Services and solutions declare where they are offered**
      (`location_service`, `location_solution`). That replaced a heuristic and
      is the most important change in the location half: the generator used to
      pair every place with the first two published services, an arbitrary
      combination somebody then had to invent copy for. Now a
      "<service> in <place>" page cannot be published unless the service is
      ticked on that place, only ticked pairings are proposed, and `areaServed`
      in the structured data is built from the same list.

- [x] **Schema.org generated in the backend.** `App\Support\StructuredData`
      builds every JSON-LD block; the frontend renders it through `JsonLd`,
      which keeps the `<` escaping at the sink. Product carries `sku`, `brand`
      and a price-less `Offer`; Service carries `provider` and a real
      `areaServed`; Article and TechArticle carry a real author and a real
      `dateModified`; a place is a `LocalBusiness` over its own subtree.

      It moved because eleven files had to agree about what an Article is and
      did not — the blog and the case study both sent `datePublished` as
      `dateModified`, so an article revised two years later reported it had
      never changed, and `sku` was never emitted at all.

      Nothing is guessed: `availability` is omitted unless an editor set it, and
      there is no price anywhere, because the brief rules out anything
      transactional.

- [x] **Landing pages joined the SEO overview.** They are indexable records with
      SEO overrides and were missing from the one screen whose job is finding
      records to go and fix.

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

## Sign in with a one-time code — done, and the default

Both principals. An address, a six-digit code by email, and no password —
with the password form still one link away.

- [x] `POST /auth/request-code` and `/auth/verify-code`, plus the console's
      two, throttled 5/min and 10/min
- [x] `sign_in_codes` keyed on `(audience, email)` — a portal code is refused
      at the console and the reverse
- [x] Hashed at rest, ten-minute expiry, single-use via a conditional
      `UPDATE`, five wrong entries burn it, a new code retires the old
- [x] Identical answers throughout: unknown address, cooled-down resend and a
      real send are one 202; wrong, expired, spent, burnt and never-issued are
      one 422
- [x] A delivered code confirms an unverified address — and tells the support
      desk, so the approval queue still learns
- [x] Two-step forms on `/portal/login` and `/admin/login`, one code input
      with `autocomplete="one-time-code"`, resend, and the switch to passwords
- [x] `App\Enums\SignInChannel` — email installed, SMS present and reporting
      itself unavailable
- [x] Three public `auth` settings, `technoware:prune-sign-in-codes` hourly,
      and `login_code_requested` in the activity log
- [x] 17 feature tests; removing the audience clause fails exactly the two
      that exist for it

**What this trades, and it is worth restating.** The mailbox is now the only
factor. For the portal that is a straight improvement — those accounts were
always recoverable by email. For the console it is a genuine reduction, taken
deliberately and reversible from Settings without a deploy.

**One gap left open on purpose.** Mail goes out inside the request, so an
address with an account answers measurably slower than one without — 1.6s
against 1.0s, measured. The throttle bounds it; a queue worker closes it, and
that is a deployment change rather than a code one.

## Pre-launch configuration added by the code audit

- **`ASSET_ORIGIN` in the frontend's environment**, if the origin a browser
  loads uploaded images from is not the same as `API_BASE_URL`. It feeds the
  Content-Security-Policy's `img-src`, and getting it wrong shows up as every
  cover image reported blocked — which `npm run audit` now fails on. Leave it
  unset when the two agree, which is the normal production case.
- **The production API host in `images.remotePatterns`** (`web/next.config.ts`),
  which was already flagged there and is now a second reason to do it.
- **Promoting the Content-Security-Policy from Report-Only to enforced**, once
  a full audit run is clean under the production build and someone has driven
  the rich-text editor by hand. The policy is written; enforcing it is moving
  one string. Do not enforce it on the strength of the audit alone — the
  console's editor is the piece most likely to want something the policy does
  not name. (It moved to Summernote since that was written, which changed what
  `frame-src` has to allow: a body may now embed a YouTube or Vimeo video.)

## The media manager

Built out from an upload endpoint into something an editor can work in. See
README.md for the reasoning and API.md for the routes.

- [x] **Sorting** by upload date, last modified, name or size, both directions,
      with a whitelist that falls back rather than 422s. Every ordering ends on
      `id` — thirty files seeded in one run share a timestamp to the second, and
      without a tiebreak a page boundary shows one twice and hides another.
- [x] **Multi-select** with a bulk bar: move, duplicate, delete.
- [x] **Details** — description and tags, deliberately not a second alt text,
      plus the read-only facts and a copyable public URL.
- [x] **Full-screen preview** with prev/next, a counter and the keyboard.
- [x] **Image editor** — rotate, flip, brightness, contrast, greyscale.
- [x] **Crop presets** including the image's own ratio.
- [x] **Overwrite in place**, keeping the path every record points at.
- [x] **Bin** — delete keeps the bytes, restore puts back the exact URL, purge
      removes the file and its history.
- [x] **Version history**, ten per file, archived before each edit.
- [x] **Folder upload**, flattened, and the panel says so.
- [x] **One upload control** across the library, the cover and gallery pickers,
      all three ticket attachment fields and the careers CV.
- [x] **Image quality** and **upload size limits** as settings, with php.ini's
      own ceilings shown beside them.

### Still open on the media manager

- [ ] **Thumbnail size slider** and a keep-aspect-ratio toggle. A view
      preference; nothing depends on it.
- [ ] **Maximum image resolution.** Only file *size* is limited today, so a
      50-megapixel image inside the size limit is accepted and then costs GD a
      great deal of memory on the first resize.
- [ ] **Editable asset categories.** The accepted extensions are
      `MediaController::ALLOWED_EXTENSIONS`, shared with the console's info
      panel but not editable without a deploy. Worth doing only if the client
      actually wants to add formats — the list is a decision about what is safe
      to hand a visitor, not a preference.
- [ ] **A "Recent" view.** Sorting by last-modified covers the need; a nav
      entry for it is convenience rather than capability.

## The newsletter

Subscribers, groups, imports, templates, campaigns, sending, tracking and a
suppression list. See API.md for the routes and the rules.

- [x] **Audience three ways** — a CSV or Excel upload, the portal customer list,
      and a pasted block of addresses. All three go through one `SubscriberIntake`,
      which checks the suppression list *before* looking a subscriber up.
- [x] **The file is read by its bytes**, not its extension, so a workbook saved
      as `.csv` still works and the legacy binary `.xls` is named and refused
      rather than parsed into thousands of invalid rows.
- [x] **A file with no header row keeps its first address.** The first real file
      anybody uploaded held one address and nothing else; the importer ate it as
      a column heading and reported "0 rows", which reads as the file being
      empty. No legitimate heading is a valid email address, so a first row
      containing one is data.
- [x] **Groups**, with add, edit and delete, and a campaign selects any number
      of them.
- [x] **One PDF attachment**, picked from the media library or uploaded into it
      on the spot. Stored as a path; the name and size are copied onto the
      campaign so a later rename cannot change what was sent.
- [x] **Deliverability checks** that block a send — unsubscribe link, sender
      identity, postal address, a plain-text part — re-run at the moment of
      sending rather than read from the stored score.
- [x] **Sending is claimed with a conditional UPDATE**, recipients are frozen
      when queued, and each batch re-reads a recipient's status immediately
      before sending so an unsubscribe mid-send is honoured.
- [x] **Unsubscribe with no login and no confirmation step**, on GET and POST,
      because `List-Unsubscribe-Post` is what a mail client's own button sends.

### Still open on the newsletter

- [ ] **Bounce handling is manual.** Nothing reads a bounce mailbox or a
      provider webhook, so a hard bounce is suppressed only when somebody enters
      it. This is the one gap that degrades a sending reputation on its own.
- [ ] **A/B subject testing** and per-link click reports beyond the totals.

## Decisions still owed by the client

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
