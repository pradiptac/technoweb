# Technoware

Marketing site, customer support portal and REST API for a hardware and network
solution provider. Monorepo, deployed to Plesk as two domains.

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
| `design/` | Static HTML mockup + design-system reference. Not built, not deployed. Open in a browser. |

---

## Where the project stands

See **`PROGRESS.md`** for the maintained checklist. Short version: the public
site, the customer portal and the ticket/RBAC domain are done and verified in
a browser. Phase 3 (admin CMS) is most of the way there — staff auth, the
shell, dashboard, ticket queue and ticket detail all work, and ten entities
have full CRUD (blog, knowledge base, case studies, solutions, services,
industries, pages, products, brands, product categories), plus media upload
and settings.

Still open in Phase 3: FAQs as a standalone screen, the media browsing UI,
the redirects manager, the SEO manager and staff/user management.
Phase 4 (ticket email notifications) has not started.

Work lands on `phase-3-admin-cms`; `main` is still at the end of Phase 2.

---

## Commands

```bash
# --- API (run from api/) ---
php artisan serve                    # http://localhost:8000
php artisan migrate:fresh --seed     # WIPES the database; safe only pre-launch
php artisan technoware:customer you@example.in --name="Name"   # create a portal login
php artisan storage:link             # once; media uploads 404 without it
php artisan test                     # HtmlSanitiser unit tests
./vendor/bin/pint                    # formatter

# --- Frontend (run from web/) ---
npm run dev                          # http://localhost:3000
npm run build
npm run lint
npx tsc --noEmit
npm run mock                         # mock API on :8899
npm run audit                        # browser audit — see "Definition of done"
```

Frontend without the backend running:

```bash
npm run mock &
API_BASE_URL=http://127.0.0.1:8899 npm run dev
```

`mock-api.mjs` implements the same `/api/v1` contract as Laravel. **If you
change an API response shape, change the mock too.** CI builds against it, so
drift breaks the build instead of production — that is the point of it.

---

## Environment

Development is on **Windows**; deployment is Linux under Plesk.

- **PowerShell 5.1 does not support `&&`.** Put commands on separate lines.
- PHP/MySQL/Composer come from Laragon.
- `.gitattributes` pins `artisan`, `*.php` and `*.sh` to LF. Without it they
  fail on the server with `bad interpreter: /usr/bin/env php^M`.

---

## Things that will bite you

**`npm run build` requires a reachable API.** Index pages are prerendered. A
build that cannot reach the API deliberately *fails* (`web/src/lib/build-phase.ts`)
rather than baking "We could not load…" into static HTML for Google to crawl.
Set `API_BASE_URL` in the **build** environment, not just at runtime. At runtime
the same failure degrades gracefully and the site stays up.

**Scroll reveals are `data-aos` attributes, not a library.** Tag a section
`data-aos="fade-up"`; `components/ui/reveal.tsx` observes it. Two rules the
CSS in `globals.css` depends on and that are easy to break:
*translate vertically only* — nothing clips overflow, so a horizontal
translate fails the audit's zero-tolerance overflow check on most routes —
and *the hidden start state must never carry a transition*, or content
visibly fades **out** before it can fade in. The whole thing is scoped under
`html[data-aos-ready]`, set by JS after hydration, so no-JS and
reduced-motion users get the content unhidden and static.

**Dev at `localhost:3000`, not `127.0.0.1:3000`** — or set
`allowedDevOrigins` (already done in `next.config.ts`). `next dev` 403s its
own JS chunks when the Origin host is one it does not recognise, which
serves a page whose client bundle never loads: no hydration, and nothing in
the UI to say so.

**Tailwind is v4 — CSS-first.** Tokens live in `web/src/app/globals.css` under
`@theme`. There is no `tailwind.config.ts` and there should not be. The v3-style
config in `design/design-system.html` is superseded.

**Two colours fail WCAG AA while looking perfectly fine:**
- `--color-brand-500` (#6f8641) is 4.07:1 on white. Use `--color-brand-600`
  (7.53:1) for coloured **text**; brand-500 is for fills only.
- `--color-warn` was #a9711a (3.83:1 on `--color-warn-soft`), now #8a5c10.
  Do not revert it.

**A morph map is enforced** (`AppServiceProvider`). Polymorphic rows store
`"product"`, not `App\Models\Product`. So: register any new polymorphic model
there; **never** compare `$model->author_type === Foo::class` (use `instanceof`);
set the relation with `->associate()`, never by assigning `*_type` by hand.

**`Model::preventLazyLoading` is on outside production.** Eager-load everything
an API Resource serialises or it throws.

**Never ISR-cache a user's search query.** `publicApi.products()` and
`publicApi.knowledgeArticles()` take a `cache` flag — pass `false` when `q` is
present. Caching search fills the cache with single-use entries and serves a
stale empty result for the whole revalidate window.

**Portal auth guard is on `web/src/app/portal/(app)/layout.tsx`.**
`portal/login/` sits *outside* that route group deliberately — guarding it too
would redirect to itself forever.

**Slugs are the URL contract.** `CatalogueSeeder` sets every slug explicitly,
because `Str::slug` produced `enterprise-wi-fi` and `it-infrastructure-amc`
while the frontend linked to `enterprise-wifi` and `amc`. Eight of nine were
wrong and the sitemap was publishing URLs that 404'd. Changing a slug now means
adding a redirect — the `redirects` table and `web/src/middleware.ts` handle it.

**`/products/[slug]` resolves to a category *or* a product.** The brief requires
both `/products/switches` and `/products/cisco-cbs350-24t-4g` under one segment.
See `products/[slug]/resolve.ts` — category endpoint first, product second.

**Knowledge-base search matches tags and a punctuation-stripped title**, so
"wifi" finds "Wi-Fi". See `KnowledgeArticle::scopeSearch`. Users do not type
hyphens.

**Rich text is sanitised on write, in `prepareForValidation()`.** `Prose`
renders CMS bodies through `dangerouslySetInnerHTML`, so `HtmlSanitiser` is
the only thing between a content-manager account and script on every visitor's
page. A new rich-text field must be declared in the request's
`richTextFields()` or it bypasses the sanitiser entirely — and the allowlist
in `config/purifier.php` is deliberately the exact tag set `prose.tsx` styles,
so widening one without the other ships markup the site renders unstyled.
Covered by `tests/Unit/HtmlSanitiserTest.php`; add a case when you touch it.

**JSON-LD escapes `<`, and must keep doing so.** `JsonLd` in `lib/seo.tsx`
writes `JSON.stringify(data)` into a `<script>` tag, and `JSON.stringify` does
not escape `<`. A CMS field containing `</script>` therefore closes the block
and everything after it becomes live markup — stored XSS on every visitor's
page, from any plain-text field that reaches structured data.

`HtmlSanitiser` does **not** cover this. It runs only over the fields a request
declares in `richTextFields()`; a product name or page title is a plain string,
correctly escaped by React everywhere *except* inside that script tag. Do not
"fix" it by sanitising names — escaping at the sink is the correct boundary,
and a product legitimately called `A <> B` should still work.

`npm run audit` fails on any JSON-LD block containing a literal `<`. Parsing is
not enough on its own: a breakout splits one block into two that both parse
cleanly, which is how it went unnoticed.

**MySQL JSON does not preserve object key order.** It normalises keys by
length, then lexicographically, so a spec sheet stored as a map came back as
`PoE, Ports, Uplinks, Warranty, Rack units, Switching capacity` — every
product page was rendering its specs in an order nobody chose, and reordering
them in the admin could not stick. `App\Casts\SpecSheet` stores the sheet as
an ordered **list of pairs** (JSON arrays *are* order-preserving) and hands
PHP back an ordered associative array, so the API still returns a plain
`{"Ports": "24 × 1G"}` object and the frontend never had to change. Anything
else order-sensitive that lands in a JSON column needs the same treatment —
do not reach for `'array'`.

**CMS admin routes bind by id, not slug** (`{blog_post:id}`).
`Sluggable::getRouteKeyName()` returns `slug`, and an edit form that changes
the slug it is addressed by breaks mid-save.

**In a Server Action, `updateTag()` — not `revalidateTag()`.** `updateTag`
gives read-your-own-writes, so an editor sees the change immediately instead
of waiting out the revalidate window. (In Next 16 `revalidateTag` also takes a
second argument now, so the old one-arg call is a type error, not a silent
no-op — but reach for `updateTag` here regardless.)

---

## Conventions

- Never hard-code a hex. If a colour is not in `globals.css`, it does not ship.
- `font-mono` is for data only — ticket IDs, IPs, SKUs, throughput. Never prose.
- Ticket status and priority are **PHP enums**, not lookup tables. Transition
  rules live in `TicketStatus::canTransitionTo()`.
- Ticket attachments live on the **private** disk and stream through an
  authorised controller. Never expose a public URL.
- Internal ticket notes (`is_internal`) must never reach a customer-facing
  response. The customer controller uses `publicMessages`, not `messages`.
- Commit `api/` and `web/` together — nearly every change spans both.
- Reuse the primitives in `web/src/components/ui/` (Button, Card, Badge, Input,
  Field, Alert, EmptyState, ErrorState, PageHero, Breadcrumbs, FaqList, Prose,
  SpecTable, CtaBand) rather than writing new one-off markup.

---

## Definition of done

Not a checklist to read — a command to run:

```bash
npm run dev                 # or npm run start against a build
npm run audit               # in another terminal
```

One-time setup: `npx playwright install chromium`.

`web/scripts/audit.mjs` drives a real browser over every route and fails on:

- WCAG AA contrast failures (alpha-composited backgrounds handled correctly)
- heading-level jumps, or anything other than exactly one `<h1>`
- horizontal overflow at 1280px or 360px
- tap targets under 24px that also fail WCAG 2.2's spacing exception
- a missing canonical URL, malformed JSON-LD, or an unescaped `<` inside it

It exits non-zero, so CI can gate on it. Pass routes to check specific pages:
`node scripts/audit.mjs /admin /admin/tickets`.

**Every bug of consequence in this project was found by running it, not by
reading it** — two independently-written string constants disagreeing is
invisible to static analysis. Verify in the browser before calling something
finished.

---

## Scope limits (from the client brief — do not exceed)

No cart, checkout, payments, quotations, invoices, renewals, subscriptions,
domain or hosting control panels, or CRM. Products are a **catalogue** with
"Request Information" CTAs only.

---

## Known risks and placeholders

- **Placeholder content that must not ship:** phone +91 98765 43210,
  "since 2009", 340 sites, 99.9% uptime, <4h SLA, all three case studies, and
  the "R. Kulkarni" testimonial, and the three social profile URLs seeded by
  `DemoContentSeeder`. All invented to make layouts realistic. The social ones
  are the most dangerous of them — they are live links to accounts that are
  probably somebody else's. Clear them in `/admin/settings` (blank hides the
  icon) or replace them with the real profiles.
- **The logo is a text placeholder.** `#4A5A2A` is sampled from a screenshot,
  not the real file. See `web/src/components/layout/logo.tsx`.
- **CKEditor ships as `licenseKey: 'GPL'`** — valid while this repository is
  public and GPL-compatible. If Technoware wants the site proprietary, a
  commercial key is required. One line either way, but it is a business call.
- **`/privacy` and `/terms` are placeholder copy.** They read as real policy
  and are not. Needs a qualified legal review before launch.
- **The repository is public.** No secrets are committed and history is clean,
  but one accidental `git add -f .env` would be scraped within minutes.

See @README.md for setup detail, Plesk deployment and the full change history,
and @API.md for the endpoint reference — every route, what it returns, and the
behaviour that is not obvious from the signature.
