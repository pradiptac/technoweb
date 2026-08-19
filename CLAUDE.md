# Technoware — project guide

Marketing site, customer support portal and API for a hardware and network
solution provider. Monorepo.

```
www.technoware.in          api.technoware.in
      │                          │
   Next.js  ──── REST /api/v1 ──── Laravel ──── MySQL 8
```

The frontend never touches MySQL. Every read and write goes through the API.

| Path | What |
|---|---|
| `api/` | Laravel 12, PHP 8.3+, Sanctum, MySQL 8 |
| `web/` | Next.js 16, TypeScript, App Router, Tailwind **v4** |
| `design/` | Static HTML mockup + design-system reference (not built, not deployed) |

---

## Commands

```bash
# API
cd api
php artisan serve                    # http://localhost:8000
php artisan migrate:fresh --seed     # wipes everything; safe only pre-launch
php artisan technoware:customer you@example.in --name="Name"   # portal login
./vendor/bin/pint                    # formatter

# Frontend
cd web
npm run dev                          # http://localhost:3000
npm run build
npx tsc --noEmit
node mock-api.mjs                    # serves the /api/v1 contract on :8899
```

Working on the frontend without the backend running:

```bash
node mock-api.mjs &
API_BASE_URL=http://127.0.0.1:8899 npm run dev
```

`mock-api.mjs` implements the same contract as Laravel. **If you change an API
response shape, change the mock too** — CI builds against it, so drift breaks
the build rather than production, which is the point.

---

## Things that will bite you

**`npm run build` requires a reachable API.** Index pages are prerendered. A
build that cannot reach the API deliberately *fails* (`src/lib/build-phase.ts`)
rather than baking "We could not load…" into static HTML that Google then
crawls. Set `API_BASE_URL` in the build environment, not just at runtime. At
runtime the same failure degrades gracefully instead.

**Tailwind is v4 — CSS-first.** Tokens live in `web/src/app/globals.css` under
`@theme`. There is no `tailwind.config.ts` and there should not be. The v3-style
config shown in `design/design-system.html` is superseded.

**Two colours fail WCAG AA and look fine:**
- `--color-brand-500` (#6f8641) is 4.07:1 on white. Use `--color-brand-600`
  (7.53:1) for any coloured **text**. brand-500 is for fills only.
- `--color-warn` was #a9711a (3.83:1 on `--color-warn-soft`) and is now #8a5c10.
  Don't revert it.

**A morph map is enforced** (`AppServiceProvider`). Polymorphic rows store
`"product"`, not `App\Models\Product`. Consequences: any new polymorphic model
must be registered there, and **never** compare `$model->author_type ===
Foo::class` — use `instanceof`. Set relations with `->associate()`, not by
assigning `*_type` by hand.

**`Model::preventLazyLoading` is on outside production.** Eager-load everything
an API Resource serialises, or it throws.

**Never ISR-cache a user's search query.** `publicApi.products()` and
`publicApi.knowledgeArticles()` take a `cache` flag; pass `false` when a `q`
parameter is present. Caching search fills the cache with single-use entries and
serves stale empty results for the whole revalidate window.

**Portal auth guard lives on `web/src/app/portal/(app)/layout.tsx`.**
`portal/login/` sits *outside* that route group deliberately — guarding it too
would redirect to itself forever.

**Slugs are the URL contract.** `CatalogueSeeder` sets every slug explicitly
because `Str::slug` produced `enterprise-wi-fi` and `it-infrastructure-amc`
while the frontend linked to `enterprise-wifi` and `amc`. Changing a slug means
adding a redirect (the `redirects` table + `web/src/middleware.ts` handle it).

**`/products/[slug]` resolves to a category *or* a product.** The brief requires
both `/products/switches` and `/products/cisco-cbs350-24t-4g`. See
`products/[slug]/resolve.ts` — category endpoint first, product second.

---

## Conventions

- Never hard-code a hex. If a colour isn't in `globals.css`, it doesn't ship.
- Mono type (`font-mono`) is for data only — IDs, IPs, SKUs, throughput. Never prose.
- Ticket status/priority are **PHP enums**, not lookup tables. Transition rules
  live in `TicketStatus::canTransitionTo()`.
- Ticket attachments are on the **private** disk and stream through an
  authorised controller. Never expose a public URL.
- Internal ticket notes (`is_internal`) must never reach a customer-facing
  response. The customer controller uses `publicMessages`, not `messages`.
- Commit `api/` and `web/` changes **together**. Nearly every change spans both.

---

## Definition of done

Before calling a page finished, verify in a real browser — not by inspection:

- Zero WCAG AA contrast failures
- Exactly one `<h1>`, no heading-level jumps (h1→h3 is a bug)
- Zero horizontal overflow at 360px and 1280px
- Correct canonical URL and JSON-LD for the page type
- Tap targets ≥24px (WCAG 2.2 SC 2.5.8)

Every bug of consequence in this project so far was found by running it, not by
reading it. Two independently-written string constants disagreeing is invisible
to static analysis.

---

## Scope limits (from the client brief — do not exceed)

No cart, checkout, payments, quotations, invoices, renewals, subscriptions,
domain/hosting control panels, or CRM. Products are a **catalogue** with
"Request Information" CTAs only.

---

## Still outstanding

- **Admin CMS UI** (Phase 3) — the largest remaining piece. API routes are
  stubbed under `/api/v1/admin` behind `role:` middleware.
- Email notifications for tickets (hooks marked `TODO(phase 4)`).
- **Placeholder content that must not ship as-is:** phone +91 98765 43210,
  "since 2009", 340 sites, 99.9% uptime, <4h SLA, all three case studies, and
  the "R. Kulkarni" testimonial. All invented to make layouts realistic.
- The real logo file. `#4A5A2A` is sampled from a screenshot; the header uses a
  text wordmark placeholder (`web/src/components/layout/logo.tsx`).
- Rich text from the CMS renders via `dangerouslySetInnerHTML` (`Prose`).
  **Sanitise on write in Laravel** before the admin UI ships.
