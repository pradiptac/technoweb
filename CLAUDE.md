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

See **`PROGRESS.md`** for the maintained checklist. Short version: all four
phases are done and verified in a browser — the public site, the customer
portal, the ticket/RBAC domain, the admin console and email notifications.

Ten entities have full CRUD (blog, knowledge base, case studies, solutions,
services, industries, pages, products, brands, product categories), alongside
FAQs, the media library, redirects, an SEO overview, staff accounts and site
settings. Everything the public site renders is editable from the console,
including the homepage hero and its statistics.

What remains before launch is content and configuration, not code: see
"Known risks and placeholders" below.

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

**The mobile drawer stays mounted and animates by class.** `{open && …}` has
nothing to transition on the way out, so the panel is always in the tree and
toggled with `visible`/`invisible`. `invisible` is doing real work: it is what
keeps the off-screen `translate-x-full` out of `documentElement.scrollWidth`,
so a horizontal slide passes the overflow check that CLAUDE.md warns about for
`data-aos`. It also carries `inert` while closed — `opacity-0` alone leaves
every link tabbable and readable by a screen reader.

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

**Marketing chrome lives in `(marketing)/layout.tsx`, not the root layout.**
It used to be in the root, which wrapped the admin console and the customer
portal in the public mega menu and footer. Each area now supplies its own
`<main id="main">` too, because the root no longer does and the skip link
targets it.

**The homepage reads the CMS, not `content/site.ts`.** Solutions, categories,
industries, case studies and posts are fetched like every other index page —
they were static, so renaming a solution changed every page except the one
people land on first. What remains in `content/site.ts` is genuinely static
page furniture: partner logos, the process diagram, AMC inclusions, the
web-services grid.

**Homepage hero copy and the statistics are settings, not code.** Group
`homepage` in the settings table, editable at `/admin/settings`. Stat rows are
`value|label`, one per line. This is what makes the invented figures on the
must-not-ship list correctable without a deploy. The logo, favicon, address,
phone number and map embed are settings too, and the frontend falls back to
the static constants in `content/site.ts` when one is unset.

**Analytics load on the public site only.** `Analytics` is mounted in
`(marketing)/layout.tsx`, not the root, so nothing is loaded inside the admin
console or the portal. Tracking staff pollutes the client's numbers, and a
tracker on a signed-in support page sends ticket URLs — which contain a
customer reference — to a third party. Each tag renders only when its ID is
set.

**Consent gates the trackers for real.** With `cookie_consent_enabled` on —
the default — `Analytics` renders nothing at all until someone accepts: no
script tags, no no-script pixels. A banner that shows while the tags load
anyway is worse than none, because it claims a consent that was never
obtained. The choice lives in `localStorage` and is read through
`useSyncExternalStore` in `lib/consent.ts`, whose server snapshot is null, so
the pre-hydration render never assumes yes. The banner is mounted only when at
least one analytics ID is configured: with none, no cookie is ever set and
asking would be theatre. **The default copy is a placeholder, not legal
advice.**

**Share images come from `app/opengraph-image.tsx`.** `buildMetadata` used to
fall back to `/og-default.png`, a file that was never added — so every index
page advertised a share image that 404'd and previews came out blank.
Generating it means there is nothing to forget to commit. A page or record
with its own image still wins.

**Two settings groups are private and must stay that way.** `mail` holds the
SMTP credentials and `integrations` holds the API key. They are excluded from
the public `/settings` whitelist, marked `is_secret`, encrypted at rest, and
never returned to the browser — the admin response says only whether a value
is set. A blank submit means "unchanged", because the form can never show the
current value; clearing one is a separate endpoint. When adding a setting, ask
which of those two lists it belongs on before adding it to the seeder.

**`lib/settings.ts` is `server-only`; the pure helpers live in
`lib/site-settings.ts`.** The header is a client component and needs
`telHref`. Importing it from the fetching module pulls `server-only` into the
client bundle and every page 500s. Types and pure functions go in the second
file; anything that fetches stays in the first.

**A map embed URL is validated against Google's host on write.** It becomes an
`iframe src` on the contact page, and an unchecked one is somebody else's page
rendered inside ours.

**Notifications must never fail a request.** Everything goes through
`App\Support\Notifier`, which logs and swallows. A ticket that is already
committed must still return 201 when the mail server is down — telling a
customer their ticket failed while it sits in the database means they send it
again. The internal-note guard is at the **call site** in the admin reply
path, not inside the notification: an engineering note reaching a customer
inbox is the worst failure this system has, and the check belongs where
anyone reading that method will see it.

**`phpunit.xml` pins `DB_DATABASE` to `technoweb_test`.** Feature tests use
`RefreshDatabase`, which drops and re-migrates whatever connection it is
given. Without that line the suite destroys the development database — it did,
once.

**The two principals must not share anything keyed on a value they both
hold.** Both password brokers pointed at `password_reset_tokens`, whose primary
key is the email address — so a token issued to a *customer* reset the *staff*
account at the same address. Verified working before the fix, and it is
privilege escalation into the admin console. Customers now have
`customer_password_reset_tokens`. This is the same shape as the id collision
between `Customer` and `User` that `EnsureUserIsCustomer` exists for.

**`staff` middleware guards the whole admin group.** `role:` already refuses a
customer token, but logout, `me` and change-your-own-password are reachable by
every role by design and each carried its own inline `instanceof User` check.
The third was added without one and a customer token could call it. One
middleware on the group cannot be forgotten; the inline checks are gone.

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

- **Placeholder content that must not ship.** All invented to make the
  layouts judgeable, and all of it now editable rather than buried in code:
  - The hero statistics (16 yrs, 340+ sites, <4h SLA, 99.9% uptime) and the
    support band figures — `/admin/settings`, Homepage group.
  - The phone number +91 98765 43210 — Contact group.
  - The invented Mumbai address and its map embed, seeded by
    `DemoContentSeeder`. Not a real Technoware office.
  - Three social profile URLs seeded by `DemoContentSeeder`. **The most
    dangerous of the lot**: live outbound links to accounts that are probably
    somebody else's. Blank hides the icon.
  - All three case studies, the ten seeded products, the 33 generated
    placeholder images, and the privacy/terms/downloads copy.
  - The whole demo support desk from `DemoSupportSeeder` — a customer named
    Neil Basu, five tickets and two enquiries.
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
