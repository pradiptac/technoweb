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
| `api/` | Laravel 13, PHP 8.3+, Sanctum, MySQL 8 |
| `web/` | Next.js 16, TypeScript, App Router, Tailwind **v4** |
| `design/` | Static HTML mockup + design-system reference. Not built, not deployed. Open in a browser. |

---

## Where the project stands

See **`PROGRESS.md`** for the maintained checklist. Short version: all four
phases are done and verified in a browser — the public site, the customer
portal, the ticket/RBAC domain, the admin console and email notifications.

Ten entities have full CRUD (blog, knowledge base, case studies, solutions,
services, industries, pages — including a section page builder — products, brands, product categories), alongside
FAQs, the media library, redirects, an SEO overview, staff accounts, **portal
customers and their approval queue**, and site settings. Everything the public site renders is editable from the console,
including the homepage hero and its statistics.

What remains before launch is content and configuration, not code: see
"Known risks and placeholders" below.

Work lands on `phase-3-admin-cms` and is merged to `main` once it is green.
`main` is the branch Plesk deploys, so nothing reaches it that has not
passed the audits in "Definition of done" — merge it, do not push to it.

---

## Commands

```bash
# --- API (run from api/) ---
php artisan serve                    # http://localhost:8000
php artisan migrate:fresh --seed     # WIPES the database; safe only pre-launch
php artisan technoware:customer you@example.in --name="Name"   # create a portal login
php artisan storage:link             # once; media uploads 404 without it
php artisan test                     # the feature and unit suites
composer analyse                     # Larastan, level 5, against a baseline — must say "No errors"
php artisan technoware:profile       # query count + ms per public endpoint
./vendor/bin/pint                    # formatter

# Mail is queued now, so *something* has to drain the queue or nothing is
# delivered on this machine. Either of these; the first mirrors production.
php artisan schedule:work            # the scheduler, in the foreground
php artisan queue:work               # or just the worker, delivering at once

# --- Frontend (run from web/) ---
npm run dev                          # http://localhost:3000
npm run build
npm run lint
npx tsc --noEmit
npm run mock                         # mock API on :8899
npm run audit                        # browser audit — see "Definition of done"
npm run audit:mobile                 # strict phone audit at 320/360/390/414
npm run perf                         # TTFB / LCP / bytes per route — against `npm run start`, never dev

# --- Releases (run from the repo root; see release/RELEASING.md) ---
node release/build.mjs               # the signed release zip, from HEAD, into release/dist/
node release/build.mjs --worktree    # the same from uncommitted work — testing only, refused by customers' updaters
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

The rules below are the ones every task can trip over. Each module's own
rules follow under "Modules" as one line each, with the full note — the
measurement, the failed first cut, the test that pins it — in `docs/`.
**Read the module's file before working in it.**

Contents:

- Next.js: rendering, caching and data
- Images
- Bundles
- Motion and the Tailwind v4 transform trap
- Hosts, ports and the three URLs
- Type, measure and overflow
- How the audits behave
- Tokens, schemes and colour
- Forms
- UI primitives
- The console: navigation, forms and tables
- Sanitising, escaping and the CSP
- Laravel conventions
- Tooling and editing on this machine
- Testing
- Modules — one line per rule here, the full notes in `docs/`:
  - The store — `docs/store.md`
  - Customers and addresses — `docs/customers.md`
  - Sign-in — `docs/auth.md`
  - Leads — `docs/leads.md`
  - Editor-built forms and embeds — `docs/forms.md`
  - The newsletter — `docs/newsletter.md`
  - Outgoing mail — `docs/mail.md`
  - The website assistant — `docs/chatbot.md`
  - SEO: structured data, scores and the AI assistant — `docs/seo.md`
  - Programmatic landing pages and places — `docs/landing-pages.md`
  - Careers — `docs/careers.md`
  - The blog — `docs/blog.md`
  - Brands, categories and the company profile — `docs/catalogue.md`
  - Menus — `docs/menus.md`
  - Popups — `docs/popups.md`
  - Sliders and galleries — `docs/sliders.md`
  - The media library and uploads — `docs/media.md`
  - The rich-text editor and CMS pages — `docs/editor.md`
  - The console's chrome — `docs/admin-console.md`
  - The public site's chrome — `docs/site-chrome.md`
  - Motion — `docs/motion.md`
  - Theme generation — `docs/theming.md`
  - Site themes — `docs/themes.md`
  - Email to ticket — `docs/tickets.md`
  - Icon packs — `docs/icons.md`
  - Content blocks — `docs/blocks.md`
  - The section page builder — `docs/page-builder.md`
  - Messaging — `docs/messaging.md`
  - Engineer visits — `docs/visits.md`
  - Online meetings — `docs/meetings.md`
  - Custom fields and content types — `docs/custom-content.md`
  - Importing a WordPress / WooCommerce site — `docs/wordpress-import.md`
  - Backups — `docs/backups.md`
  - Distribution: the release zip, the setup wizard, the updater — `docs/distribution.md`
  - The chart kit — `docs/charts.md`
  - The installable website (PWA) — `docs/pwa.md`
  - Look and feel: textures, illustrations, progress, onboarding — `docs/look-and-feel.md`
  - Events — `docs/events.md`
- Conventions · Definition of done · Scope limits · Known risks

### Next.js: rendering, caching and data

**`npm run build` requires a reachable API.** Index pages are prerendered. A
build that cannot reach the API deliberately *fails* (`web/src/lib/build-phase.ts`)
rather than baking "We could not load…" into static HTML for Google to crawl.
Set `API_BASE_URL` in the **build** environment, not just at runtime. At runtime
the same failure degrades gracefully and the site stays up.

**A `[slug]` route is served from the ISR cache only if it exports
`generateStaticParams`, and for months none did.** In Next 16 that export is
what enters a dynamic-segment route into the route cache; without it the page
is rendered on every request whatever its fetches are cached as, never sends
`x-nextjs-cache`, and shows as `ƒ` in the build table. Every detail page —
solutions, services, industries, posts, case studies, KB, vacancies, landing
pages, store products and categories — was in that state, measured at 1.5–4.5s
TTFB against a local API. They export an empty list now (nothing enumerated at
build; each path renders on its first request) and answer in tens of
milliseconds from the cache. **What that costs**: a request-time API —
`cookies()`, `headers()`, `searchParams` — or a `cache: "no-store"` fetch in
one of those renders is a 500 ("Page changed from static to dynamic at
runtime"), not a fallback. `/products/[slug]` stays dynamic for exactly that
reason (it awaits `searchParams` for the category listing's filters), so does
`/blog/category/[slug]` (it awaits `searchParams` for `?page=` — the review of
2026-09-21 found it as "the one `[slug]` route without the export", and it is
the same case), and the CMS catch-all `[slug]` stays dynamic so a crawler's
junk URLs do not each become a cached not-found on disk. `npm run perf` prints the header per route;
a `-` there means rendered every time.

**The store's basket count is a client component fed by `/api/store/basket`,
and that is what lets the shop cache.** `BasketIndicator` used to call
`getCart()` during render — a cookie read — so every store product and
category page was dynamic for every visitor, basket or not. The server draws
it empty, the page is cached whole, `useBasket()` fills the count after mount
and again on the `tw:cart` window event that Add to basket and Remove
announce. And **`revalidatePath("/store", "layout")` must not come back** to
the cart actions: it would purge every cached shop page for every visitor on
each Add to basket. `/api/store/basket` answers 204 with no API call when
there is no cookie, so a crawler still never mints a cart — and it answers
**without the cart's token** (`BasketView`), which it used to hand to browser
JavaScript from inside `data` while the cookie holding it was httpOnly.

**A console save has to `updateTag` the collection, and ten action files
never did.** Every detail fetch carries its collection's tag as well as its
own (`["solutions", "solution:<slug>"]`), and every create/update/delete in
blog, brands, case studies, industries, knowledge base, pages, products,
services, solutions, FAQs and the store's products and categories calls
`updateTag(<collection>)` — before that, an edit reached the public page only
when the fetch's revalidate window ran out, five to ten minutes, which a probe
renaming a solution through the real form proved. Verified after: HIT before
the save, the new title on the next request. **A delete purges only once the
API accepted it**: the twelve content lists' delete actions ran
`deleteX(id).catch(() => null)` and then purged and reported "deleted" whatever
happened; a refusal now redirects with `?done=not-deleted` and purges nothing,
and the pages delete no longer calls `revalidatePath` on a slug taken from the
form (2026-09-26). An anonymous form submission purges nothing at all —
`submitFormAction` carried a `revalidatePath("/")` nothing needed.

**The proxy holds the redirect table in memory.** `proxy.ts` used to call
`/redirects/lookup` on every request under ten content prefixes — pages that
exist included — and `next: { revalidate }` has no effect in a proxy, so each
was a Laravel boot and a query to be told "no". It fetches `GET /redirects`
into a `Map` once per process, refreshes in the background after 60s through
`event.waitUntil`, and calls `lookup` only on a hit, because that is what
records the hit. Two consequences: a rename takes up to a minute to redirect,
and CMS pages at `/{slug}` are covered now, which the prefix list left out
while each check cost a round trip. The matcher skips `purpose: prefetch`.

**Nothing assigned to a menu location is `{data: null}` in a 200, not a
404.** Next's data cache stores only a 200, so as a 404 the four `/menus/*`
fetches in the marketing layout were live round trips on every render of an
install with nothing assigned — for ever. Same for anything else that
"answers 404 for the ordinary case": it will be refetched on every render.

**A `next/link` at a route handler prefetches it.** Both CSV exports are plain
`<a download>` - the newsletter's subscriber export shipped as a `ButtonLink` and
built the whole file on the server every time the screen loaded.

**A public setting takes up to ten minutes to reach the site.** `lib/settings.ts`
revalidates at 600s, and the console's own save calls `updateTag("settings")` so
an edit made there applies at once. Changing a row in the database directly does
not, which reads exactly like the setting being ignored.

**The public settings' path-to-URL map is derived, not listed.** Every public
setting whose key ends in `_path` gets a `_url` (and the media row's width and
height) built from `Str::beforeLast($key, '_path')`. It used to be a
hand-written array of four, and a hand-written list of keys on one side of the
wire is this project's most repeated bug — `admin_path` spelled with the API's
resource names, `schema_type_options` written out twice. Nine banner paths would
have been nine chances to miss one, and a missed one is a picture the frontend
can never resolve with nothing failing and nothing saying so.

**A setting written through the API does not reach the site until the cache
turns over.** The console's own save calls `updateTag("settings")`; a `PATCH`
from a script does not, so `lib/settings.ts`'s 600s window stands and the page
goes on rendering the old value. Same trap as editing a row in the database
directly, one layer up — and in development the fetch cache lives in
`.next/cache/turbopack`, so it wants a kill-by-PID, `rm -rf .next` and a
restart rather than a reload.

**Being published and being in the menu are separate decisions.**
`show_in_menu` on solutions, services, industries and product categories, and
the mega menu asks for it with `?in_menu=1` — the index pages call the same
endpoints without it and still get everything. The menu used to map *every*
record, so it grew without limit; a catalogue outgrows a navigation long before
it outgrows itself. It defaults to **true**, because the alternative empties the
navigation on the deploy that runs the migration. `getMegaMenu()` drops a
section whose items all end up unticked rather than rendering an empty panel —
the header decides whether a top-level link opens a panel by whether a section
exists for it.

**Settings are strings, so read booleans through `settingEnabled()`.** `"0"` is
truthy in JavaScript, so `if (settings.registration_enabled)` is true for a
toggle that is switched *off*. `lib/site-settings.ts`.

**A `loading.tsx` under `(marketing)` breaks hydration on every public
page, and the reveal observer is why.** With one, the page streams in after
the shell has hydrated; `reveal.tsx` sees the streamed markup, stamps
`data-aos-animate` on whatever is in view, and React then hydrates that
segment against props that never carried the attribute — "a tree hydrated
but some attributes didn't match", on `/careers`, `/team` and the blog, found
by the audit's console check within a minute of adding one. The console has
a `loading.tsx` (nothing there reveals); the portal's predates this. The
public site does without, and its detail routes are ISR-cached anyway.

**Never ISR-cache a user's search query.** `publicApi.products()` and
`publicApi.knowledgeArticles()` take a `cache` flag — pass `false` when `q` is
present. Caching search fills the cache with single-use entries and serves a
stale empty result for the whole revalidate window. The registration form's
company lookup (`/api/companies`) was the one route handler still doing it
(`revalidate: 300`); it is `no-store` since 2026-09-26.

**Portal auth guard is on `web/src/app/portal/(app)/layout.tsx`.**
`portal/login/` sits *outside* that route group deliberately — guarding it too
would redirect to itself forever.

**Slugs are the URL contract.** `CatalogueSeeder` sets every slug explicitly,
because `Str::slug` produced `enterprise-wi-fi` and `it-infrastructure-amc`
while the frontend linked to `enterprise-wifi` and `amc`. Eight of nine were
wrong and the sitemap was publishing URLs that 404'd. Changing a slug now means
adding a redirect — the `redirects` table and `web/src/proxy.ts` handle it.

**`/products/[slug]` resolves to a category *or* a product.** The brief requires
both `/products/switches` and `/products/cisco-cbs350-24t-4g` under one segment.
See `products/[slug]/resolve.ts` — category endpoint first, product second.

**Knowledge-base search matches tags and a punctuation-stripped title**, so
"wifi" finds "Wi-Fi". See `KnowledgeArticle::scopeSearch`. Users do not type
hyphens.

**`apiFetch` JSON-encodes its body; multipart needs `apiUpload`.** A FormData handed to the first arrives as `{}` and Laravel answers "the file field is required" — which reads as the upload being rejected rather than as never having been sent. Measured.

**A `next/link` pointing at a route handler prefetches it.** The subscriber
export was a `ButtonLink`, so merely *loading* the screen built a complete CSV of
the whole list on the server — fetched, cached and thrown away. Measured. A
route handler is not a page: use a plain `<a download>`.

**`redirect()` throws an error whose `digest` starts with `NEXT_REDIRECT`, not
whose `message` equals it.** A `catch` that tries to recognise and re-throw it
swallows it instead — the campaign was created while the screen said it had not
been. Keep `redirect()` outside the `try` rather than trying to identify it.

**Marketing chrome lives in `(marketing)/layout.tsx`, not the root layout.**
It used to be in the root, which wrapped the admin console and the customer
portal in the public mega menu and footer. Each area now supplies its own
`<main id="main">` too, because the root no longer does and the skip link
targets it.

**The homepage reads the CMS, not `content/site.ts`.** Solutions, categories,
industries, case studies and posts are fetched like every other index page —
they were static, so renaming a solution changed every page except the one
people land on first. What remains in `content/site.ts` is genuinely static
page furniture — partner logos — and the **fallbacks**
for the "Why Technoware" block, whose words moved into settings on
2026-09-21 (`why_*`, `testimonial_*`, `amc_*` in the `homepage` group):
the steps as `title|body` lines, the AMC list one per line, both edited as
rows through `settings/lines-field.tsx`. The web-services grid went on
2026-09-29: the Services section draws the CMS's services, grouped by
service category (`docs/catalogue.md`). The testimonial and the AMC card
have switches of their own (`testimonial_enabled`, `amc_enabled`) — never
"leave blank to hide": the public `/settings` map drops a blank, so the site
cannot tell cleared from never-set, and a blank falls back to the constants
like every other row.

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
set. **And not on a page a secret addresses** (2026-09-26): `/order/*`,
`/newsletter/unsubscribe/*` and `/store/notify/cancel/*` render no tag, carry
`Referrer-Policy: no-referrer` (`next.config.ts`), and GA4's `page_location`
everywhere is origin + path + the campaign parameters only. The order page
used to be `/order/{n}?token=…` — its access token reported to GA4 and the
Meta Pixel on every confirmation.

**An order's token lives in a cookie, never in a rendered URL.** Links (the
emails, Cashfree's return URL, `Order::url()`) go to `/order/{n}/open?token=…`,
a route handler that sets an httpOnly cookie scoped to `/order/{n}` and 303s
to the clean page; the checkout action sets the same cookie and redirects clean;
the page, `PayButton`, `RevealCode` and their actions read it
(`lib/order-access.ts`) and never take the token as a prop. A `?token=` still
arriving at the page (an old email) is redirected through `/open`, never
rendered with. The token must be 64 hex characters — the mock's is too.

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

**`lib/settings.ts` is `server-only`; the pure helpers live in
`lib/site-settings.ts`.** The header is a client component and needs
`telHref`. Importing it from the fetching module pulls `server-only` into the
client bundle and every page 500s. Types and pure functions go in the second
file; anything that fetches stays in the first.

**In a Server Action, `updateTag()` — not `revalidateTag()`.** `updateTag`
gives read-your-own-writes, so an editor sees the change immediately instead
of waiting out the revalidate window. (In Next 16 `revalidateTag` also takes a
second argument now, so the old one-arg call is a type error, not a silent
no-op — but reach for `updateTag` here regardless.)

---

### Images

**Every public image goes through `/_next/image`, and `unoptimized` is for
the console's previews and the UPI QR code only.** 27 `unoptimized` props and
27 raw `<img>`s cited a stale reason — `remotePatterns` has been derived from
the asset origins since `ASSET_ORIGIN` existed — so a 300px card downloaded
the 2560px original and the homepage's LCP element was a 1.2MB JPEG. Five
things that came with switching:

- **WebP only, five widths.** AVIF encodes five to ten times slower and this
  server encodes on the first request per width; under `npm run audit`'s
  burst that showed up as `/_next/image` answering 504. `deviceSizes` is
  `[640, 828, 1200, 1920, 2560]`. `npm run warm-images` fetches every variant
  a route references one at a time — after a deploy, and before measuring
  against `php artisan serve`, which answers one request at a time. It reads
  the raw asset URLs in the RSC payload as well as the `<img>`s, because a
  `fade` or `zoom` slider draws only its current slide: `/store`'s fourth
  slide was on the page as data and not as markup, was never warmed, and
  answered 504 under the audit with everything else warm.
- **`images.dangerouslyAllowLocalIP` is derived, never set by hand.** Next 16
  refuses an optimiser upstream that resolves to a private IP; the API on a
  development machine is one, so every image was `400 "url" parameter is not
  allowed` and the site rendered without pictures — and the audit did not see
  it, because it filtered "Failed to load resource" out of its console check.
  The exception is granted only when a configured asset origin is loopback or
  RFC 1918; `ASSET_ORIGIN=https://api.technoware.in` keeps the guard. **The
  asset origins are `ASSET_ORIGIN`, or `API_BASE_URL` only when that is
  unset** — they were both, always, so a production build with an internal
  `API_BASE_URL=http://127.0.0.1:8000` switched the guard off (2026-09-26).
  **The audit now fails a route on any 4xx/5xx image response from this origin.**
- **React Flight emits a preload hint for every non-lazy raw `<img>` in a
  server component, and a `<Link>` prefetch executes it.** With a raw `<img>`
  in `PageHero`, every page linking to `/support` and `/resources` in its nav
  downloaded those pages' banners too — ~1MB — and Chrome logged "preloaded
  but not used" on every route, which only `next start` shows (dev disables
  prefetch). `next/image` is a client component; its preload runs during the
  page's own render and never rides in another page's payload. **A raw eager
  `<img>` in a server component is a download on every page that links here.**
- A `fill` image needs a `sizes`; without one it assumes `100vw` and fetches
  the widest variant. The hero `Slider` takes `sizes` for that reason — at
  the default it fetched a 1920px, 507KB WebP for a 640px column.
- A `next/image` `src` ending `.svg` is passed through unoptimised (query
  stripped first), so the placeholder art and the brand logos are unchanged.

**A third-party frame is a poster until it is pressed.** The blog's YouTube
embed and, since 2026-09-18, the contact page's map (`components/contact/map-embed.tsx`):
the map iframe was `loading="lazy"` and still cost `/contact` 430KB of
Google's script on load — 723KB of JavaScript against ~295KB on every other
route, which is what `npm run perf` is for — and set Google's cookies before
anybody had agreed to anything, the claim the consent banner exists not to
make. Nothing leaves the browser until the button is pressed.

**One image on the site has no fixed-height well: the case-study cover.**
Every other cover and thumbnail sits in an `h-40`/`h-44`/`h-56` box, so a slow
image cannot move anything. That one is full-width, and it carries
`aspect-[1200/630]` for the same reason — the ratio the cover generator
produces and the one og:image wants.

### Bundles

**Turbopack keeps an application module whole.** Importing one glyph from
`icons.tsx` shipped every one of ~130 — 47KB, 14KB gzipped — on every public
page, and it was still there after every identity-icon lookup had moved to
the server, which is how it was measured rather than assumed. Client
components import their chrome glyphs from `icons-ui.tsx`; `icons.tsx`
re-exports them so server code keeps one import path. `ErrorState` lives in
its own module for the same reason: the public error boundary is a client
component that dragged `IconTile` and the map in behind it. The identity
tiles in the header arrive from `lib/navigation.ts` as rendered elements — a
server component may pass JSX to a client component, and React serialises the
markup rather than the component.

**A console client component imports its glyphs from `icons-ui.tsx` too,
and `IconField` is the one exception, loaded through `next/dynamic`.** Seven
console files imported one or two chrome glyphs from `@/components/icons`
and so carried the map; `IconPen`, `IconGrid`, `IconLayers` and
`IconSearchChart` moved to `icons-ui` for them. `IconField` needs the whole
map by design — it is the picker that shows every glyph — so the four entity
forms import it from `icon-field-lazy.tsx`, which makes it its own chunk
arriving after the form's. Server-rendered still, so the hidden `icon` input
is in the markup.

**The website assistant mounts after the page is idle**, through
`ChatLoader` and `next/dynamic` with SSR off, so its ~16KB chunk never
competes with the paint. And the page-enter animation plays on client
navigations only: rendered by the server, `both` held a cold load at
`opacity: 0` for 320–380ms before the largest element could count as painted.

### Motion and the Tailwind v4 transform trap

**Scroll reveals are `data-aos` attributes, not a library.** Tag a section
`data-aos="fade-up"`; `components/ui/reveal.tsx` observes it. Two rules the
CSS in `globals.css` depends on and that are easy to break:
*translate vertically only* — nothing clips overflow, so a horizontal
translate fails the audit's zero-tolerance overflow check on most routes —
and *the hidden start state must never carry a transition*, or content
visibly fades **out** before it can fade in. The whole thing is scoped under
`html[data-aos-ready]`, set by JS after hydration, so no-JS and
reduced-motion users get the content unhidden and static.

**Tailwind v4 translate utilities set the CSS `translate` property, not
`transform`.** So `transition-transform` on a `translate-x-full` panel
animates nothing and it simply appears — which is exactly what happened to the
mobile drawer until the computed value was measured mid-flight instead of the
class name being trusted. Transition `translate`.

**A transitioning element cannot take focus on the first frame.** The
drawer transitions `visibility` over 300ms, and at progress zero the computed
value is still `hidden` — so `.focus()` on something inside it silently does
nothing and `document.activeElement` never changes. It looks exactly like a
broken ref. `site-header.tsx` waits on rAF until the element reports
`visibility: visible`, bounded at 30 frames.

**The mobile drawer is `layout/mobile-drawer.tsx`, and the header owns only
`open` and the toggle.** It was inside `SiteHeader`'s one 650-line function
with the top bar, the desktop nav and the mega-menu state until 2026-09-14;
the focus trap, the scroll lock and the rAF focus hand-off moved with it, and
it hands focus back through `returnFocusTo`. `_drawer-focus-probe.mjs` checks
all four. `settings-form.tsx` had the same shape one screen over — 530 lines
of copy tables in a `"use client"` file — and is `settings-copy.ts` +
`settings-fields.tsx` + the form now.

**The mobile drawer stays mounted and is shown by class.** `{open && …}` has
nothing to transition on the way out. `visibility` is in both transitions
deliberately: CSS flips it to `visible` immediately on the way in and holds it
until the transition ends on the way out, so the panel is still painted while
it slides away — and while closed it is what keeps the off-screen
`translate-x-full` out of `documentElement.scrollWidth`, which is the
zero-tolerance overflow check. `inert` is the other half; `opacity-0` alone
leaves every link focusable.

**The nav's animated underline transitions `scale`, not `transform`.** Tailwind
v4's `scale-x-*` utilities set the CSS **`scale`** property — the same shape as
the `translate` trap that made the mobile drawer appear instead of sliding — so
`transition-transform` on a `scale-x-0` rule animates nothing and the underline
simply appears. It is `after:transition-[scale]`, and it was verified by sampling
the computed value **mid-flight** (0.86 at 70ms) rather than by reading the class
name: a value read on the same tick is the start state and one read after 200ms
is the end state, and neither says whether anything animated.

**Motion is a set of ancestor-keyed attributes stamped by the area layouts,
and the console is excluded by construction.** Six settings in the `motion`
group (`lib/motion-choices.ts` is the one list; the API checks an id's shape,
the frontend falls back to the first entry, which is always the site as it
moved before the group existed). `(marketing)/layout.tsx` and
`portal/(app)/layout.tsx` spread `motionAttrs()` onto their wrappers and every
rule in `globals.css` is `[data-motion-buttons="shine"] .btn` — never keyed on
`<html>` — so the admin layout, which stamps nothing, cannot be reached by any
of them, and a picker tile can carry the same attribute to preview the real
rule. The rules are unlayered on purpose: most override a Tailwind utility
already on the element (`hover:-translate-y-px`, the reveal's start state) and
unlayered CSS beats `@layer utilities` without `!important`. Three things
every one of them keeps: nothing widens the document (reveals translate
vertically or scale *down*, the loader is `position: fixed` and
`display: none` while idle, the aurora blobs sit inside hosts that clip);
nothing changes a computed `color` or `background-color`, which is all the
contrast audit reads, so opacity, transform and filter are free; and **a
hidden start state lives only inside `prefers-reduced-motion: no-preference`**,
because the global rule at the top of that section disables every animation
and transition and an element left at `opacity: 0` would stay there.

**Motion has four durations and two curves, and they are tokens.**
`--duration-fast/base/slow/exit` (150/200/300/140ms) and `--ease-brand` /
`--ease-exit` in `@theme`, used as `duration-(--duration-base)` and `ease-exit`.
Every literal `duration-200/300/150` outside `components/velora/` was migrated
to them on 2026-09-14 (72 sites); a new one is a mistake. The same pass fixed
thirteen `transition-transform` utilities sitting beside a `rotate-*`,
`scale-*` or `translate-*` — the v4 trap this file records four times, found
in the accordion chevrons, the FAQ's plus, the mega menu's caret and every
image zoom — and replaced Tailwind's `shadow-lg`/`shadow-2xl` with `shadow-3`
and the new `--shadow-float` for the floating layer. **Leaving is shorter than arriving and
accelerates**: the drawer, the chat panel and the mega menu carry the exit
timing on their closed state and the arrival's on their open variants; a toast
now fades for `--duration-exit` before its row is removed, where it used to
blink out. The route loader is `scaleX`, never `width`. The basket ring
runs **three times and stops** — infinite is for loaders. Two exceptions,
both at the client's request and both mostly rest: the assistant launcher's
burst cycle repeats until the panel is opened, and the cart badge's
(`cart-badge.tsx`, `cart-hop` and its three companions) repeats until the
shop is opened — and only that: it also stopped on hovering the link and
on a basket with anything in it, and the client found it silent within a
minute of testing — the burst is the first 1.4s of an 8s cycle, and the
stop is kept in `sessionStorage` so the header's and the drawer's copies
stop together.
`globals.css` says why beside each. `scripts/probes/cart-burst.mjs`
samples the badge mid-flight and at rest.

**The four carousels share one hooks module, and what stays in each is what
differs.** `lib/hooks/use-carousel.ts` — `useMotionOk()` (the reduced-motion
query read on mount, never at render), `useDocumentHidden()`,
`useAutoplay(active, ms, tick)` with the two-second floor, and `wrapIndex()`
— replaced four byte-identical copies in `slider.tsx`, `cards-slider.tsx`,
`gallery.tsx` and `store-hero.tsx`. Each keeps its own `goTo`, because a
scroll, a state swap and a FLIP are three different moves, and the hover
pause stays a state of its own beside the hidden-tab pause: the first cut
merged them and a tab coming back would have un-paused a slider somebody
was pointing at. The gallery keeps a plain `visibilitychange` listener
rather than the hook, because its rule is one-way (hiding the tab *unsets*
the override) and setting state from an effect on a hook's value is what
`react-hooks/set-state-in-effect` refuses.

### Hosts, ports and the three URLs

**And the API at `127.0.0.1:8000`, never `localhost:8000` — the opposite way round, for an opposite reason.** `php artisan serve` binds IPv4 only, and on this machine `localhost` resolves to `::1` first, where a connection to port 8000 does not get refused — it **hangs** (measured at the 2s timeout) — so every client waits out its Happy Eyeballs timer, ~200–300ms, before falling back to IPv4. Two things pay that. The Next server, on every API fetch it makes. And **the browser, per image**: `asset()` echoes the request's host into every logo and cover URL a response carries, so with `API_BASE_URL=http://localhost:8000` the page told the browser to fetch `http://localhost:8000/storage/…`, and the PHP server answers `Connection: close`, so no connection was ever reused. Measured on the homepage's brand strip in Chromium: **3.7–7.2s per 1–20KB SVG, the last one 9.6s after navigation, and 10–24ms after the one-line change** — the same file, 215ms via `localhost` and 2ms via `127.0.0.1` in curl. It never reaches production, where `api.technoware.in` is real DNS behind Apache, which is why nothing in the audits reports it; it does distort every perf number taken on this machine. Worth knowing beside it: the dev server sends no `Cache-Control` for `/storage/`, so the browser refetches every logo on every navigation here, where Apache's `.htaccess` gives them a year.

**Dev at `localhost:3000`, not `127.0.0.1:3000`** — or set
`allowedDevOrigins` (already done in `next.config.ts`). `next dev` 403s its
own JS chunks when the Origin host is one it does not recognise, which
serves a page whose client bundle never loads: no hydration, and nothing in
the UI to say so.

**`config('app.frontend_url')` is the production domain, on every machine.**
`FRONTEND_URL` in `api/.env` is pinned there because canonicals, the sitemap
and generated share URLs all have to be right regardless of where the code is
running. That makes it exactly the wrong base for a link a *person* clicks: the
SEO overview's "open this page" link, built on it, sent a developer working at
localhost to the live site. The console and the public site are one Next
application on one origin, so anything meant to be clicked from the console
ships as a **path** and lets the browser supply the origin.

**`php artisan serve` runs without OPcache, and that is most of its latency.**
The no-op `/api/v1/` answered in 200–370ms here and in 14–18ms with
`zend_extension=opcache` — the rest is PHP compiling the framework on every
request, which production PHP-FPM never does. `technoware:profile` reports
query counts and wall time *inside* the kernel for that reason: those are the
figures that survive the move to a real server. Enable it in Laragon's
`php.ini` (`zend_extension=opcache`, `opcache.enable_cli=1`) before believing a
TTFB measured against the dev server.

**One hostname has to win, and changing it means changing three values that
nothing checks against each other.** `CANONICAL_HOST` in `web/.env` redirects
every request arriving at another host — www to bare, or the reverse — from
`proxy.ts`, before the redirect-table lookup. The three that must agree:

| | |
|---|---|
| `CANONICAL_HOST` (web) | where visitors are sent |
| `NEXT_PUBLIC_SITE_URL` (web) | `metadataBase`, so every canonical and `og:url` |
| `FRONTEND_URL` (api) | the canonical on 11 models, the sitemap, campaign, order and unsubscribe links — **and the exact string `config/cors.php` allows** |

Redirecting to `www` while the canonicals name the bare domain tells a crawler
that the page it was just sent to is not the real one, which is worse than
having no redirect at all. `FRONTEND_URL` is additionally the host the mail
OAuth `redirect_uri` is compared against, so a callback arriving on the other
form of the name is refused.

**An environment variable rather than a setting, deliberately.** It runs on
every request before anything else, so a database-backed value would be a round
trip on the hot path — and it has to keep working while the API is down, which
is exactly when a redirect loop would be unrecoverable. **Leave it unset in
development**, or `localhost:3000` redirects away and the dev server cannot be
used.

**Set `hostname` and `port` separately, never `host`.** Assigning `URL.host` a
value carrying no port *leaves the existing port alone*, so behind Plesk — where
the internal request arrives at `127.0.0.1:3000` — the redirect came out as
`https://www.technoware.in:3000/…`, a port nothing public listens on. It looks
perfectly correct in development, where the retained port is the one the browser
wanted. The host is read from `x-forwarded-host` before `host` for the same
family of reason: compare the internal host and the check never matches, which
is an infinite redirect.

**The API sees the visitor's address only because the Next server tells it,
and believes it only from the Next server.** Every public request reaches
Laravel from Next, so until 2026-09-26 `$request->ip()` was the Next host for
everybody: every per-IP throttle was one bucket for the site, and five wrong
passwords locked an account (staff too) for all. Now every uncached API call
— `apiFetch` without `revalidate`, `apiUpload`, `proxyMultipart` and the route
handlers that fetch directly — sends `X-Forwarded-For: <visitor>` from
`clientIpHeaders()` (`lib/client-ip.ts`), which takes the rightmost
non-loopback entry the edge appended, **never the header as received**
(`CLIENT_IP_HEADER=x-real-ip` for an edge that sets that instead). Laravel
believes `X-Forwarded-For` — and no other forwarded header — from
`TRUSTED_PROXIES` only (`api/config/trustedproxy.php`, default loopback). A
cached read never carries it: its cache key includes the headers. Get
`TRUSTED_PROXIES` wrong and the site is back to one bucket, silently — the
README's deploy section says how to check.

### Type, measure and overflow

**The mobile legibility floor lives in `globals.css`, not in components.**
A `@media (width < 40rem)` block near the bottom of the file lifts every form
control to 16px — iOS Safari zooms the page when you focus anything smaller,
and does not zoom back — and lifts a fixed list of sub-12px arbitrary text
utilities to 12px. It is unlayered, which is how it beats Tailwind's
`@layer utilities` without `!important`. Two consequences: a **new** arbitrary
size below 12px is not covered automatically (that is what
`npm run audit:mobile` is for), and a control with a **fixed** width will
truncate once its text grows — that is what broke the ticket row's
`w-[112px]` selects.

**The public site has a 12px type floor; the console does not.** The
homepage ran 30 elements under 12px at 1440px — status chips at 10.5px, every
piece of mono metadata at 11.5px. The lift is an unlayered rule in
`globals.css` scoped to `.public-site`, a class set by `(marketing)/layout.tsx`
on a wrapper that exists only to carry it. The console keeps the denser scale
deliberately — it is a tool worked at a desk for hours, and the rows that
density buys are the point — and its phone floor is the `width < 40rem` block,
which still covers everything. **A class still reading `text-[10.5px]` is not
a mistake**: that is the size it renders at outside `.public-site`.

**A `whitespace-nowrap` that fixes a wide screen can overflow a narrow one.**
"Basket is empty" wrapped to three lines at 1440 once the search took half
the strip — a flex item's minimum is its min-content, one word for prose —
and unbreakable it ran 28px past a 320px screen where it shares a row with
Apply. It is `lg:whitespace-nowrap`; the phone audit is what said so.

**The public site's vertical rhythm is `.section-y` / `.section-y-lg`, not
`py-*`.** Those two paddings were spelled out as `py-16 lg:py-20` and
`py-19 lg:py-23` in 28 places across 21 files, so "the sections are too far
apart" was a find-and-replace over the whole marketing site rather than a
number to change. They live in `@layer components` beside the type roles, for
the same reason: a `py-*` utility on the same element still wins, so a section
that genuinely needs its own spacing can say so. The console does not use them
— its density is deliberate.

**Introductory copy is `.measure`, not a `max-w-[..ch]` of its own.** The same
paragraph role — a sentence or two under a heading — had been given six
different caps: 60ch on Profile, 62ch on `PageHero`, 70ch on the SEO and mail
panels, 80ch on `PageHeader`, the settings blurbs and the theme picker. Profile
and Settings are one click apart and introduced themselves at widths 25%
different. Same fix and same reasoning as `.section-y`: one class in
`@layer components`, so it is a number to change.

**Scanned is not read, and that line does not fall at the `/admin` boundary.**
The first cut of `.measure` kept it out of the public site on the grounds that
marketing copy is read rather than scanned — which put `PageHero`'s lede on the
wrong side. A hero lede is one or two sentences skimmed on the way to the
content, exactly like a console intro; the thing that is actually read is
`Prose`, and that keeps 68ch. At 1920px the hero lede went from 724px to
1074px, 42% of its container to 62%, and half the ledes on the site dropped
from two lines to one.

**A narrow measure is still usually correct, and "use the whole width" is not
the fix.** At 1920px the console's content area is 1504px, and an uncapped
paragraph at 13px runs to **185 characters per line** — long enough that the
eye cannot reliably find the start of the next one. 92ch is the wide end of
what is readable.

**What is narrow for layout must not be folded into `.measure`.** `CtaBand`
and the homepage support band sit centred at 52ch, where a long line has no
left edge to return to. The footer and mega-menu caps are column widths. None
of these are measures.

**A page heading has no width cap at all, and that reverses an earlier
decision.** `PageHero`'s h1 was capped at 20ch and the homepage hero's at 21ch,
on the argument that display type is set for shape rather than for reading —
two or three short lines read as a title where one long ribbon does not. That
holds for a headline somebody wrote to fit, and it does not hold for a **name**,
which is most of what `PageHero` is given. A product is called "Lenovo ThinkPad
E14 (i5, 16GB, 512GB SSD)" whether or not that fits twenty characters, and the
cap broke the line mid-parenthesis with half the row empty beside it — which
reads as a rendering fault rather than as typesetting. The heading still wraps
when it genuinely runs out of room: `whitespace-nowrap` would put a long title
through the right edge of a 320px screen and fail the overflow check.

**`ch` shrinks with the font size, which is why small text looks cramped.**
80ch of 13px muted text is 656px, while `Prose` at 68ch of 16px is ~700px — so
the one-line intro above a table had *less* room than the long-form body copy
below it. The character count is the right thing to specify; just do not read
the number as a width. `EmptyState` was the worst of it at 38ch — 324px inside
1464–1688px, **19–22% of the room it had**, centred, so it read as an island
rather than as a message. Now 56ch.

The caps on admin table cells (42/44/46ch) are **not** this and must not be
folded into it: those set a truncated column's floor, and changing one changes
the table's layout. See the note on `max-w-[..ch]` and `truncate` below.

**A scroll container inside a grid item still widens the column.** `overflow-x-auto`
on a `<pre>` keeps the *page* from scrolling, and contributes the content's
min-content width to whatever grid item holds it all the same — the mailbox
wizard's `grid gap-5` went to 567px at 360 on the crontab line in
`DeliveryStatus`, every field and radio card with it, while the `<pre>`
scrolled happily inside. `w-0 min-w-full` on the scroll container is the fix:
a width of zero contributes nothing and the min-width fills the box back out.
`min-w-0` on the grid item is the other half where the item is yours to edit.

**A page can scroll horizontally with no element over the edge, and that is
text.** The dashboard's "Today" axis label is `whitespace-nowrap` in a slot one
thirtieth of the row wide — about 9px at 320px — so a 30px word painted past
the card while its *box* stayed comfortably inside. `audit:mobile` names the
element responsible by scanning boxes, so it reported "the page scrolls by 2px"
and named nothing at all, which is the signature of this and worth recognising:
measure text nodes with a `Range`, not `getBoundingClientRect` on elements.
`text-right` looked like the fix and only changed which edge it hung off; the
label is anchored to the **row** with `absolute right-0` instead, because
widening its slot would drag every weekly tick out of line with the column it
dates — that row and the bars above it are two flex rows that agree only by
having equal children.

### How the audits behave

**The audit waits for the network to go quiet before it measures.** Against
`next dev` a route's CSS arrives as chunks load, so a computed style read too
early is the *previous* stylesheet's answer — the 404 page's cards measured
pure white while `data-scheme` already said dark, and the run reported fourteen
contrast failures against a page that is flawless in a build. `settle()` waits
for `networkidle` and then for two identical style samples. **A contrast
failure that will not reproduce against `npm run start` is this, not a bug.**

**A "preloaded using link preload but not used within a few seconds" warning
on an entity form is the dev server being busy, not a bug.** The three forms
that load `IconField` through `next/dynamic` (solutions, services,
industries) reported it once, 130 routes into a full run on a fresh
`.next`, when the lazy icon chunk and lucide's took longer than Chrome's
grace period to execute; the same three passed at once on their own. Re-run
the named routes alone before reading it as a regression — a build never
shows it, and a full run against `npm run start` is the tie-breaker.

**And a `MaxListenersExceededWarning … 11 drain listeners added to [Gzip]`
on `/admin` is a Node stream heuristic, not a leak in this code.** It is
the dev server's own compression: the dashboard's response is one large
streamed RSC payload (thirty days of series, the charts, the queue), and
while it is written faster than gzip drains, each pending write parks a
`drain` listener on the one stream — eleven crosses Node's default and it
warns once. `next dev` forwards process warnings to the browser console,
which is the only reason the audit can see it; `next start` forwards
none. Reproduced on 2026-09-17 on a two-minute-old server, warm, on
`/admin` alone, with the dashboard unchanged since the 15th and every
other console route clean — and nothing in `src/` attaches a listener to
any stream. A full run against `npm run start` is the tie-breaker here
too.

**`npm run audit` fills a basket before it looks at `/checkout`.** That route
redirects to an empty cart, which is correct behaviour and made the most
important form on the site unauditable. `PREPARE` in `audit.mjs` opens the shop,
opens the first product and presses Add to basket — through the real screens
rather than by writing a cookie, so the add-to-basket path is exercised on every
run as a side effect. Same argument as driving the sign-in through its own form.

**A browser check that sets one scheme key tests light.** `audit.mjs` writes
*both* `tw_scheme_site` and `tw_scheme_console`, in an `addInitScript` so the
value is there before the pre-paint script runs. Setting one key, or setting it
after the first navigation, produces a run that reports on the light palette
while claiming to test dark — which has happened to this project twice.

**A slide's caption gradient must use an opaque colour stop, never a
semi-transparent one — the audit cannot see through a translucent stop to the
photo behind it.** The first real slide content this component carried (five
stock photographs with headings) reported a caption at 1.04:1 in an otherwise
untouched, previously-passing page. `gradientStops()` in `audit.mjs` discards
any stop that fails its own opacity check — deliberately, so a translucent
*flat* background is not mistaken for a solid one — but that same check
applied to a *gradient* stop threw the caption's `rgba(18,20,13,.85)` away
entirely, leaving nothing between the text and whatever opaque colour sat
further up the ancestor chain: the section's own `bg-surface`, near-white in
light mode. It had never been exercised before, because no slide had ever
carried a heading or caption. `from-dark to-transparent` — a fully-opaque
near-black stop fading to nothing, the same pattern `blog-hero.tsx` already
uses for an identical photo-caption fade — is what the check can actually see.

**Gradient text is the ink, not the ground, and the audit reads it that way
since 2026-09-18.** An element with `background-clip: text` and a gradient
used to be graded as ink-on-its-own-gradient — Launch's section headings
(brand ink to accent ink) reported 2.78:1 on a section where every stop of
them clears 4.5. `audit.mjs` now takes the gradient's stops as the text
colours (the worst of them) and walks the ground from the parent, which is
what the reader sees the words on. Keep the stops graded inks — `brand-ink`,
`accent-ink` — and a gradient heading passes for the same reason a flat one
does.

**Gradient text reaches its descendants, and the audit follows it since 0.114.0.** A kinetic heading's words are spans painted by the heading's `background-clip: text` gradient; graded alone each read the heading's gradient as its ground at 1:1. `audit.mjs` takes the nearest ancestor (four levels) that clips a gradient to text as the ink and grades it against that ancestor's parent.

**A background layer sized to a hairline is not a ground, and the audit knows it since 2026-09-19.** Sentinel's tiles draw their one-pixel brand seam as a `100% 1px` background layer, and `gradientStops()` read its opaque stop as the tile's ground — every summary on the Sentinel homepage at 3.3:1 against a line nothing sits on. It splits the layers now and drops any whose `background-size` has a dimension of 2px or under. `AUDIT_VERBOSE=1` lists every failing element with its colours and class, which is how sixty failures were read as three.

**A Tailwind v4 opacity-modified text colour is invisible to the same audit,
for a different reason.** `text-white/85` resolves through `color-mix(...in
oklab)`, so `getComputedStyle(el).color` reports back an `oklab(L a b /
alpha)` string rather than `rgb()`/`rgba()`. The audit's `parse()` still
matches digits out of it — `oklab(0.999994 0.0000455…)`'s **lightness**
channel gets read as an RGB byte of "1", which reports near-black text on a
photograph and produced a false 1.12:1. `isOpaque()` already knows to treat
`oklab(...)` as unusable "for maths"; `parse()`, called directly on a text
colour, does not. The fix here was local rather than to the shared script: an
arbitrary-value literal, `text-[rgba(255,255,255,.85)]`, bypasses Tailwind's
colour-mix machinery and keeps the computed value a plain `rgba()` at the
identical visual weight — the same exception `CLAUDE.md` already carves out
for a literal on a dark band that does not invert with the scheme. The
general case — any `text-*/NN` utility, anywhere in the product — is not
fixed by this and remains a real gap in `audit.mjs` worth closing on its own.

**A new console module does not join the audits by itself.** Both scripts keep
a hand-written route list, so `/admin/popups`, `/admin/popups/new` and the edit
form were outside every run until they were added — the edit form as a
`DISCOVER` entry, because **nothing seeds a popup** and its id comes from
whatever an editor made. That is the menu builder's history exactly: it carried
183px of horizontal scroll at 320px because no list named it.

### Tokens, schemes and colour

**`--color-err` does two jobs and `--color-err-fill` is the second one.** It is
coloured *text* on a panel — alerts, badges, dashboard figures — so in dark it
inverts to a light pink, and white text on light pink is 2.4:1. That was every
Delete button in the console. Same split, same reasoning as
`--color-brand-ink`: in light the two are the same value, in dark they cannot
be. `bg-err` is now a mistake; use `bg-err-fill` under white text.

**An icon tile is a border and a glyph, with no fill.** `bg-brand-50` came off
all ten of them — the mega menu, the mobile drawer, `Card`, `EmptyState`, the
Resources and Support hubs, and four admin list screens — and the glyph grew to
roughly 60% of the box. The border had to change with it: **`brand-200` does not
invert**, which was harmless behind a `brand-50` fill and is a bright sage
hairline on a near-black card without one, so it is `border-brand-ink/30` — the
same alpha-on-an-inverting-token the dashboard tiles already use. Three tiles
keep their fill and are not icons: the numbered steps on About and the homepage
process, and the initial on a solid disc in the testimonial. A digit floating in
an empty ring is not the same control.

**A chart segment takes its colour from `TONE_STROKE`, never a hex and never
an SVG `<text>`.** `verification-donut.tsx` draws one `<circle pathLength=100>`
per verdict with a stroke class from the same map the legend's swatch and the
row's badge use, so the three agree by construction. The figure in the centre
is HTML over the SVG: SVG text is measured after viewBox scaling and lands
under the phone audit's 12px floor.

**`--color-*-fill` now exists for all four status tones, not just `err`.** The
toast puts a white glyph on a solid badge, which is the second job
`--color-err-fill` was invented for; `ok`, `warn` and `info` needed the same
split the moment anything did that to them, because in dark their text colours
are light tints and white on a light tint is about 2.1:1. Every value is
measured: worst case 4.55:1 white-on-fill and 3.18:1 fill-on-its-own-panel.

**Alerts, badges and error states take their colours from tokens, never
literals.** All three paired an inverting `*-soft` background with hexes picked
for the light palette, so in dark every alert in the console and the portal was
dark maroon text on a near-black panel — 1.53:1. It survived every audit for
months because **the contrast check only measures what is on the page**, and no
audited route rendered an alert by default. Borders are now the same token at
`/25` alpha so they cannot drift from the text again. The dark bands — the
NOC panel, the support band, the CTA card — sit on grounds that stay dark in
both schemes, so their colours do not invert; they are still tokens
(`--color-dark-muted-brand`, `--color-dark-warn`, `--color-dark-warn-fill`)
rather than the four literals they were, because a literal in three files is
three places to move one colour.

**Streamline (home.streamlinehq.com) is the named source for icons and
illustrations from 2026-09-14**, alongside Velora for components — 300,000+
icons in 52 sets and 35,000 illustrations, which is the first place to look
for a *subject* an editor cannot find or a spot illustration a page needs.
Its licence is per set and decides what may be vendored: the sets marked
**open source are CC BY 4.0** — vendor them with a credit and a link to
streamlinehq.com in the file's docblock, which a public repository can
carry; the other free sets permit commercial use with attribution
recommended; the premium sets need the client's own plan and must not be
committed here. Two rules of this file still hold whatever the set: a
vendored icon is re-drawn to `base` (stroke 1.7, round caps) and registered
under *this project's* key, and it is measured at 20px before it ships — a
filled outline that reads at 34px and mushes at 20px is what Freepik's set
taught. Streamline's terms also forbid offering its icons "as assets
available for users" of a builder-style app; the console's icon picker is
for the client's own editors, not the public, which is the reading taken
here — note it, because a future feature that lets a visitor pick an icon
would cross that line.

**An icon name in `iconMap` is a value stored in MySQL.** `solutions.icon`,
`services.icon` and `product_categories.icon` hold the key, so adding one is
free and renaming or removing one silently blanks the icon on every record
pointing at it. Forty-one of the 88 are borrowed from Lucide through
`fromLucide`, which spreads the shared `base` so they carry this set's 1.7
stroke instead of Lucide's 2 — mixed weights in one grid read as sloppy before
anyone can say why. They are registered under *this project's* names, not
Lucide's, so a rename upstream is not a data migration here. Do not re-export
the library wholesale: an editor handed 1,600 icons cannot find any of them.

**Light, dark and system, keyed on `data-scheme` set before first paint.** A
blocking inline script in the root layout reads **`tw_scheme_site` or
`tw_scheme_console`** from localStorage — the public site and the console keep
separate preferences, and the script picks the key from the path — and falls
back to `prefers-color-scheme`; anything later — an effect, a
deferred module — paints the wrong scheme first, and a white flash on every
cold load is worse than not offering dark. Both palettes are emitted in one
inline `<style>`, dark second, because `:root` and `:root[data-scheme="dark"]`
have equal specificity and the winner is source order.

**A token that inverts cannot be paired with a literal colour.** Three things
broke on that: `body { background: #fff }` was a literal, so in dark every
token flipped except the canvas behind them — 31 failures on the homepage from
one declaration, now `var(--color-page)`. `bg-ink text-white` and the `onDark`
button's `bg-card` both assumed which side was light. And the status tokens
(`err`, `ok`, `warn`, `info`) are chosen to read on white, so they get their
own `:root[data-scheme="dark"]` block.

**`--color-brand-ink` exists because `brand-600` was doing two jobs.** It was
both a fill under white text and coloured text on the page. In light both want
the same value; in dark they want opposite ones, and no single token can be
both — the version of dark mode that ships without this split is the one where
every link is invisible. `brand-600` stayed the fill; 91 `text-brand-600/700`
became `text-brand-ink`, which in dark takes the theme's 300 step.

**`<html>` carries `suppressHydrationWarning`, and must keep it.** The blocking
script in the root layout writes `data-scheme` and `color-scheme` onto that
element before React runs — which is the entire point of it, and the server
cannot know the value because it lives in the visitor's localStorage. Without
the attribute React logged a hydration mismatch on **every page of the site**,
public and admin. The cost was never the message: a console that always holds
one hydration error is one where nobody will notice the next. It suppresses
that element's own attributes and text only, so a genuine mismatch inside the
tree still reports.

**`lib/themes.ts`, `lib/presets.ts` and `lib/palette.ts` are the only places
a hex may live.** A theme — generated, or the one legacy ramp — overrides
the same `@theme` custom properties `globals.css` declares, emitted inline on
`:root` by the root layout via `themeCss()`, so every existing `bg-brand-600`
picks it up without a component changing. `themeVars()` is the same pairs as
an object; the settings picker sets them as inline style on a preview wrapper
so **real components render inside the palette being chosen** — a mock made
of inline colours would be a second implementation of the theme. The setting
is `appearance.theme` (a preset id, a legacy id, or `custom`) plus
`theme_primary…theme_text` and `theme_font_display/body`, all public because
the frontend cannot paint the page without them; an unknown id falls back to
the house preset and a non-hex colour falls back *per field*, so one bad key
cannot blank the site. `olive`, the old default's id, is aliased to
`technoware`, whose light ramp is still the hand-tuned one — "the default
install looks the same" is a promise about pixels.

**A fill's text is a token, never `text-white`, because in dark the fill is
bright.** `--color-brand-on` (and `secondary-on`, `accent-on`) is white in
light and near-black in dark — the same split `brand-ink` makes for coloured
text, arrived at from the other side. The dark `600`/`700` steps used to be the
light ramp's own, OKLCH lightness .48 under white: on a near-black page that
is a mid-tone slab, and no fill under white text can pass 4.5:1 above roughly
L .60, so "make the buttons brighter" had no answer while the text stayed
white. `darkRamp()` now lifts `600` to L .76 and `700` to .70 at 1.4× the
chroma, `on` is `tint(0.12, hue)`, and `pushUntil()` walks the fill *darker*
until `on` passes — which it does at once, measured live at 9.37:1. Forty-four
elements changed from `text-white` to `text-*-on` on a `bg-*-600/700`; the
dark audit is what found the two that were missed, because a white glyph on a
bright fill is a contrast failure it names. **`800`/`900` stay dark under
white** — `CtaBand` and every `bg-dark` band keep `text-white`,
and the gate checks `white on brand-900` and `white on accent-900` for that
reason. The dark ground moved with it: `darkNeutrals()` page L .16 → .13 at
chroma .012, so the theme's hue is in the black the way a navy dashboard's is,
and the icon tiles start at L .78.

**Tailwind is v4 — CSS-first.** Tokens live in `web/src/app/globals.css` under
`@theme`. There is no `tailwind.config.ts` and there should not be. The v3-style
config in `design/design-system.html` is superseded.

**The type roles live in `@layer components`, not `@layer utilities`.**
`display-1/2/3` and `lede` in `globals.css`. `.lede` sets a `color`, and while
it sat in the utilities layer — defined after Tailwind's own — it won on
source order against every `text-*` colour utility beside it. So
`className="lede text-dark-muted"` silently rendered in the light
`--color-muted`: the homepage support band was 2.55:1 on a near-black panel.
In the components layer any utility beats them, which is what those class
lists already read like. Nothing combines them with a size or weight utility
today; if you add one, it will now win.

**Instrument Sans ships two weights, and a third must be added back
deliberately.** 600 and 700 only. CSS font matching resolves `font-medium` to
the 600 face without complaint, so a 500 will *look* like it worked while
shipping nothing — if a real 500 is wanted, vendor the file. The weight was
dropped because exactly one element on the whole site used it.

**Two colours fail WCAG AA while looking perfectly fine:**
- `--color-brand-500` (#6f8641) is 4.07:1 on white. Use `--color-brand-600`
  (7.53:1) for coloured **text**; brand-500 is for fills only.
- `--color-warn` was #a9711a (3.83:1 on `--color-warn-soft`), now #8a5c10.
  Do not revert it.

**An icon that stands for a thing is coloured; an icon that does a job is
not.** Anything registered in `iconMap` is an *identity* icon — a solution, a
category, an industry — and renders through `IdentityIcon`, which gives it a
fluorescent hue derived from its own map key. **Adding one later needs nothing:
register it in `iconMap` and it is coloured.** Everything used directly —
`IconArrowRight`, `IconChevronDown`, `IconCheck`, `IconMenu`, `IconClose`, the
social marks — keeps `currentColor`, because an arrow inside a white-on-brand
button turning lime is a defect rather than decoration. The split is enforced
by which path renders it, not by a list anyone has to maintain.

The hues are twelve fixed tokens rather than a colour computed per name,
because a generated colour cannot be contrast-checked in advance and these
are. True neon does not survive a light surface — `#39ff14` on white is 1.4:1 —
so the *hue* is fluorescent and the lightness is whatever clears WCAG 1.4.11's
3:1: darker on light, genuinely neon on dark. `npm run neon` re-derives every
value; re-run it if the palette or the surfaces change. The worst case for a
dark icon is the **darkest** light row it can sit on (`surface-2`), not white
— getting that backwards produced a 2.98:1 icon that looked fine.

### Forms

**React 19 resets a form after a function action completes, including a
refused one, and every form in the product uses `<Form>` because of it.**
`components/ui/form.tsx`. The reset is deliberate on React's part and right for
the common case — post a reply, the box empties — but it fires just the same on
a 422, so a form whose entire job is to come back and name the wrong field came
back with every field blank. Measured before the fix: `/contact` cleared all
six, `/portal/register` all six, `/admin/blog/new` its slug and excerpt. This
file previously asserted the opposite — "the inputs are uncontrolled ... so a
failed action loses nothing" — which was true under React 18 and had been wrong
since the upgrade. **Nothing caught it**: a form losing its contents is not
something `npm run audit` can see, and the note that would have made somebody
check was the note stating it could not happen.

`<Form action={x} state={state}>` snapshots the submitted values on submit and
puts them back when the state is a refusal — `error` or `fieldErrors`, which is
how every one of them reports a refusal. There are 84 `<Form>`s; 77 carry a
state, and the other 7 are one-press forms — delete, sign out — with nothing
typed into them to lose. On anything else it does **nothing**, so React's
own reset stands and a successful reply still empties the box. Its snapshot is keyed by
control name — **and by value for a checkbox or radio**, because a grid of
checkboxes shares one name (`sections` on the popup form, roles on staff) and
keyed by name alone the map held only the last box's state, so a refused save
put every box back to whatever the last one was: tick About, submit with
nothing else, and the tick was gone. Two things are
deliberately not put back: a **password**, which is the one field every browser
treats as special and which nobody should leave on screen for the next person,
and a **file**, which cannot be set from script at all — so a refused upload has
genuinely lost the choice and the form has to say so rather than look attached.

**Do not "fix" this by moving the defaults instead.** That was the first cut —
copy each control's value into its `defaultValue` on submit, so React's
"restore to defaults" restores rather than clears. It is order-independent,
which is the appeal, and it does not survive a re-commit: React writes
`defaultValue` back from its own props whenever an element's props change, and
the props that change are `aria-invalid` and the `aria-describedby` `Field` adds
when it renders a message. So on `/contact` it kept `name` and `phone` and
cleared `email` and `message` — **the fields the server complained about are
exactly the fields it cannot keep**. It reads as working and is worthless.

### UI primitives

**A modal is a real `<dialog>`, via `components/ui/modal.tsx`.** Focus is
trapped, Escape closes it, the rest of the document goes inert to a screen
reader, and it renders in the top layer — so it cannot be clipped by an
ancestor's `overflow` or lose a z-index argument with the sticky console
header. A hand-rolled trap is a hundred lines that has to be right on the first
tab press and the last. Two project-specific wins: a closed `<dialog>` computes
to `display: none`, so it contributes nothing to `documentElement.scrollWidth`
and cannot trip the overflow check that the mobile drawer needs `visibility` to
survive; and the browser restores focus to whatever opened it.

**Listen for the dialog's own `close` event.** Escape and the backdrop close
the element directly, so a component tracking `open` in React state never hears
about it — the state stays `true`, the effect sees no change, and the dialog
can never be reopened. That is the classic native-dialog bug and it looks like
a broken button.

**`Alert` lives in its own client module and is re-exported from `input.tsx`.**
Closing one needs state, and `"use client"` at the top of `input.tsx` would
drag `Field`, `Input`, `Select` and `Textarea` — every form control in the
console — over the client boundary with it. All sixty-five call sites keep the
import path they had. It is **dismissible by default**: the message is about
the reader's screen, and an × on some alerts and not others is a control people
stop looking for. Its button is 24px rather than the 16px the glyph wants,
because an alert routinely carries a link in its body and the audit fails an
undersized target that has another within 24px of its centre.

**`Alert` and `Toast` are different things and both are right.** An `Alert` is
part of what a screen *says* — a validation summary belongs above the form it
is about, in the flow, still there when you scroll back. A toast is about what
just *happened*: it overlays instead of reflowing, and it leaves. The console's
`?done=` convention was rendering the second as the first, an inline panel that
pushed the record down the page and stayed until the next navigation, to say
"that worked". `components/ui/toast.tsx`, mounted by the admin and portal
layouts.

**In the console every outcome is a toast, and the switch is the area, not
the call site.** The client asked (2026-09-15) for every console notice to
arrive the same way — a card that floats in, counts down and leaves. The
admin layout wraps its screens in `AlertsAsToastsProvider`
(`components/ui/alert-mode.tsx`), and inside it a *dismissible* `ok` or
`err` `Alert` raises a toast from an effect keyed on tone and title and
renders nothing inline — 149 call sites moved by one provider. `info` and
`warn` stay inline everywhere, and so does anything passed
`dismissible={false}`: those are standing information about the screen. A
failure still stays until dismissed. The toast carries a **countdown bar**
that drains over its life in the panel's own colour at low opacity, written
as `scale`; with motion allowed its `animationend` *is* the clock, so
pausing the bar on hover pauses the timer and the two cannot disagree, and
under reduced motion a plain timer stands in. How long is
`console_notice_seconds` in Settings → General (default 10), read by the
admin layout and passed to `ToastProvider` as `okDuration`; the public site
and the portal keep five. Measured: "Saved" on the brand form arrives as a
toast with a 10s bar, no inline alert, pauses under the pointer, leaves on
its own.

**The live regions are mounted empty and stay mounted**, which is the same trap
`PasswordField` documents for `Field`'s `note`: a live region that appears with
its message already inside it has not *changed*, so nothing is announced.
There are **two** of them, because politeness is a property of the region and
not of the item — a failure interrupts, a confirmation waits for a gap, and one
region can only ever do one of those.

**A failure never dismisses itself.** `ok` and `info` go after five seconds;
`warn` and `err` stay until dismissed. News that vanishes before it is read is
an error somebody hits again with no idea why the first attempt did nothing.
The clock pauses on hover *and* on focus — without the second, a toast can
expire while focus is on its own dismiss button, which drops focus to the top
of the document.

**`?done=` keys name the thing, not the verb.** A bare `deleted` meant "the
vacancy, and its applications were kept" on one screen and "the application and
its CV are gone" on another — two facts behind one word, which one map cannot
hold. Hence `vacancy-deleted` and `application-deleted`. And the copy is a
**lookup, never a sentence from the URL**: a query parameter is
attacker-controlled, and a toast is exactly the chrome somebody would believe.

**The bridge handles a key and strips it, or leaves it entirely alone.**
Stripping an unrecognised `?done=` would pull the rug from the screens that
deliberately keep an inline `Alert` — `/admin/applications/[id]` explains that
a status change does not email the candidate, which is standing information
about the control rather than a confirmation, and it would vanish mid-read.

**Reading a focus ring immediately after Tab measures a transition, not a
rule.** `transition-all` on the button primitive includes `outline-color`, so a
computed style read on the same tick returns a colour part-way to the target —
which is how the two-tone focus ring was twice recorded as "not applying to
`<button>`" when it always did. Wait out the 200ms, or ask Chrome which rules
matched (`CSS.getMatchedStylesForNode`) rather than what the value currently
is. Inputs are the deliberate exception: `focus:outline-none` in the shared
`field` class suppresses the outline so the brand-100 glow is the only ring.

**`Field` wires `aria-describedby`; it did not, for a long time.** It built
`${htmlFor}-hint` and `${htmlFor}-error`, rendered both paragraphs, and pointed
nothing at either — so every hint and every validation message in the product
was visible text a screen reader could not associate with the field it belonged
to. It now clones the control to add the attribute, error winning over hint,
and a caller's own `aria-describedby` winning over both. `hint` is a
`ReactNode` for the same reason: the SEO panel's character counters live in
that slot, and being described-by without being a live region is exactly right
for a counter — read on focus, silent on every keystroke.

**A character counter must count what will publish, not what was typed.** The
SEO panel's counters fall back to the derived title or description when the
override is blank, and say "(derived)" when they do. Counting the empty
override would report "0 characters" for a record whose automatic title is
perfectly good, and send an editor to fix something that is not broken. Its
30–60 and 70–160 are the same numbers as `App\Support\SeoScore` and have to
stay that way.

**Every password input goes through `PasswordField`.** It carries the
reveal toggle and the Caps Lock warning, and a password field is the one input
that gives no feedback about what you typed — while five failures lock the
account out. The warning uses `Field`'s `note` prop, which mounts an empty
`role="status"` paragraph as soon as `note` is *defined*: a live region
rendered with its message already inside it is not an update, so nothing is
announced. `note=""` is how a field arms the region ahead of time.

**Two utilities writing the same CSS property means one of them is dead.** The
sign-in panel set `bg-linear-135 from-brand-900 to-brand-700` *and* an
arbitrary `[background-image:…]` grid, so the brand gradient never rendered
and the panel was the parent's near-black. Both layers now live in one
`background-image`, with a `background-size` value per layer — a single pair
would tile the gradient along with the grid.

**Every `<select>` and file input goes through the primitives.** `Select` and
`FileInput` in `components/ui/input.tsx`. A raw `<select>` renders with the OS
appearance and no chevron; a raw `type="file"` renders an unstyled "Choose
file" — the Settings General tab showed three in a row.

**`Pagination` has a `numbered` mode for the blog and the compact strip
stays for the console.** A reader jumps to the last page or back to where
they were; a console list is worked one page at a time and wants the count.
`pageWindow()` never bridges adjacent numbers with an ellipsis — `1 … 3`
hides exactly one page, and a control that hides one page is worse than the
page.

**`Button` has a `pending` prop, and it goes on the submitting button only.**
It disables, marks `aria-busy` and puts a spinner before the label; the
`{pending ? "Sending…" : …}` swaps stay. Where one `pending` state governs
several buttons (`order-panels.tsx`, `edit-image-dialog.tsx`) the others keep
`disabled={pending}`, or every sibling spins for one press. Raw `<button>`s
were left alone — the first mechanical pass caught three of them and `tsc`
refused the prop.

**`Card` has three shapes, and a hand-rolled panel is a mistake.** The
default is the hover-lifting card every public grid renders; `href` makes it
a `Link` whose whole tile navigates (the homepage's category, industry,
service and case-study tiles, and the product page's related grids — which
each used to copy the hover recipe by hand because `Card` rendered a plain
`<div>` and an anchor cannot wrap one); `interactive={false}` makes it a
static panel for the console and the portal, with `as` for the `<section>`
or `<li>` the markup around it wants and `padding` for the denser scale. The
32 `<section className="rounded-lg border border-line-strong bg-card p-N">`
copies across the console were codemodded onto it, and `cardTint(hue)` is
exported so the wash a card takes from its icon is one formula. A link card
must hold no other interactive element. The homepage's `FinalCta` was a
drifted copy of `CtaBand` and is gone: `CtaBand` takes `tone`, `size`,
`backdrop` and `className` instead.

**`Breadcrumbs` prepends Home; a caller must not pass it too.** Every CMS page
did, so `/privacy`, `/terms`, `/downloads` and every page an editor adds
rendered Home twice, collided `key={c.path}` on `"/"` — a React duplicate-key
error on each — and declared Home twice in the `BreadcrumbList` a search engine
reads. Nine other callers had always got this right; the CMS template was the
one that did not.

### The console: navigation, forms and tables

**The sidebar's rows are data in `nav-items.tsx`, and the client component
never imports the icon map.** `admin-nav.tsx` is `"use client"` and used to
import 36 glyphs from `@/components/icons` — the whole ~130-icon module, the
Turbopack trap below — for a menu. The server layout now calls `renderNav()`,
which filters the rows by role and renders each icon to an element, and the
client receives rows whose `icon` is already JSX; its own imports are the
three chrome glyphs from `icons-ui`. The neon hue travels as a string and is
applied through a `--neon` variable on the row, because whether it applies
depends on the pathname and only the client knows that. **`admin-nav.tsx`
imports `nav-items` as `import type` only** — a value import would drag the
map straight back in. `AdminNavRolesTest` reads `nav-items.tsx`.

**The admin nav is an accordion, and only one section is ever open.** That
is enforced by storing *which* section is open (`string | null`) rather than
which are open — a set would make "one at a time" something every toggle has
to remember. `admin-nav.tsx`. Section panels use the `hidden` attribute; the
mobile drawer cannot, because **Tailwind v4's preflight declares
`[hidden] { display: none !important }`**, so a responsive `lg:block` can
never win it back. Anything that must reappear at a breakpoint needs the
`hidden` *class*, not the attribute.

**A nav row whose href is a prefix of its siblings needs `exact`.** Adding
`/admin/store` made the overview read as active on Orders, Products, Categories,
Discount codes and Reports at once. `admin-nav.tsx` has carried the flag for
`/admin` since the dashboard shipped, for exactly this.

**That map and `routes/api/*.php` are two hand-written lists on opposite sides of
the wire**, which is the drift that has already produced `admin_path` spelled
with the API's resource names and `schema_type_options` duplicated in TypeScript.
Here it is silent both ways: wrong in one direction it hides a screen somebody is
entitled to use, in the other it offers a link that 403s. `AdminNavRolesTest`
reads the nav and compares it against the real middleware — changing a role in
one place and not the other fails it by name.

**A screen nothing links to does not exist.** The newsletter's six screens sat
behind one sidebar entry, so Groups was reachable from a single sentence inside
the import wizard and Templates from nowhere at all. That is not a
discoverability nicety: a campaign is addressed to groups, so with no way to
*reach* Groups there were none, the Audience tab correctly reported "There are
no groups yet", and the module was reported as missing a feature it had had all
along — the multi-select, the CRUD and the API were complete and untouched. The
fix was `newsletter/layout.tsx` plus `NewsletterNav`, a strip rather than six
more entries in the sidebar, which is an accordion of four sections that adding
six links to would make the newsletter louder than Content.

**An admin action whose button is conditional on the status it changes cannot
report success into its own component.** `revalidatePath` re-renders, the
status is now `active`, the pending-only button unmounts, and the success
message goes with it — the first browser run approved an account and reported
nothing at all. Those actions `redirect(...?done=…)` and the page renders the
outcome from the URL. *Failure* still returns into the component, because a
failure changes no status and keeps the button mounted, which is where the
error belongs.

**`lib/admin/` is `server-only`, one module per console domain and an
`index.ts` that re-exports them, so `@/lib/admin` is still the import path.**
It was one 3,160-line file until 2026-09-14; `_shared.ts` holds `token()`
and the `query()` builder. Its *types* may cross into a client
component; its functions may not. A client component that needs one calls a
Server Action instead — the same rule `lib/settings.ts` documents for
`telHref`.

**A boolean setting is a `SettingSwitch`** (`components/admin/setting-switch.tsx`):
the visible checkbox beside the controlled hidden `1`/`0` input every settings
action posts, re-asserting its own state after a submit. The promo screen, the
info bar and the ticket mailbox each carried a copy until 2026-09-21.

**Admin form buttons go in `FormActions`.** It pins the row to the bottom of
the viewport while the form is taller than the screen — on a populated product
the buttons sat below the editor and two repeaters — and warns before a
half-filled form is discarded: `beforeunload` for a refresh or a closed tab,
and a capture-phase click listener on the document for an in-app link,
because the App Router exposes no interception for a client-side route
change and `Link` honours `defaultPrevented`. Every mounted bar registers a
"dirty?" check in one module-level set and one listener asks them all;
`confirmLeave()` is exported for anything that navigates through the router
(the command palette). The Back button is the one way out it cannot see.
**Ctrl/⌘ S presses the bar's own submit button**, or `onSave` on a screen
that saves through a function. `scripts/probes/form-guard.mjs` measures both.

**A screen that saves through a function, not a `<form>`, uses
`useSaveStatus()` and still renders `FormActions`.** The menu builder and the
campaign editor each carried `{dirty, saving, message}`, a `{tone, text}`
outcome and their own `beforeunload` effect, and drew their own sticky bar
beside the one every form uses. `lib/hooks/use-save-status.ts` is the trio —
`touch()` on every edit, `run(save, "Saved.")` around the action so `saving`
cannot be left true by a throw — and `FormActions` takes `dirty` as a prop
for a bar that is not inside a form, with `SaveStatus` for the "Unsaved
changes" line. **Reorder arrows go through `ReorderButtons`**
(`components/admin/reorder-buttons.tsx`): the seven repeaters each drew
their own pair, two through a local `Move`. It disables at the ends, names
the subject for a screen reader ("Move slide 3 up") and offers `dense` for a
row already holding five 24px controls. **A date is never `new
Date(x).toLocaleString()`** — with no locale the server formats in en-US and
the browser in whatever it has, which is a hydration error on every screen
that shows one (the campaign editor's "Last test sent" was). `lib/dates.ts`
pins `en-IN`; seventeen call sites were moved onto it.

**`Pagination` renders a count even when there is one page.** It used to
return null, which took the record count away with the pager — and one page is
exactly when nothing else on the screen answers "how many are there?". It also
carries the per-page control, whose options stop at 100 because every admin
index caps `per_page` at 100 — a "200 per page" option would hand back 100 rows
under a label claiming 200. A list screen must pass `per_page` into both its
getter and `Pagination`'s `params`, or the choice is forgotten on the next
page.

**Every admin screen's title goes through `PageHeader`.** It owns the `h1`,
the back link, the intro paragraph and the row they share — 46 screens used to
hand-roll that in five different class combinations, and the component existed
unused the whole time, exactly as `FilterBar` did. Chrome that shares the
title's row is passed as **children** rather than as `meta`/`actions` props:
the row is a flex container and the caller already says which side a thing
belongs on by whether it carries `ml-auto`.

The intro paragraph is not on every screen and should not be — it appears
where a screen does something non-obvious (Settings, SEO, Media, Staff,
Redirects, FAQs, Tickets, Profile) and nowhere else. `/admin/tickets/[reference]`
is the one screen still building its own header: the reference and its badges
sit *above* the subject, which `PageHeader` has no slot for, and adding one
used exactly once would be worse than the exception.

**Admin list screens must use `FilterBar`/`FilterField`, not their own
`<form>`.** All sixteen used to hand-roll the identical form element and size
their own controls, so one row held a 32px select, a 34px input and a 44px
button on three baselines at three font sizes. `FilterBar` carries the
`admin-filters` class and `globals.css` normalises every control inside it to
one height — that rule is guarded to `>= 40rem` on purpose, because the mobile
block lifts controls to 16px and both are unlayered, so an unguarded 13px here
would silently undo the iOS zoom fix.

**`?tab=` opens a form on a named panel, and is read once.** `Tabs` takes the
id from the URL as its *starting* panel and never writes it back — which is a
different thing from driving the tabs from the URL, the thing its docblock
rules out, because clicking between them is still free and still cannot lose
what has been typed. All ten entity forms name their SEO panel `seo`, so
`/admin/blog/1?tab=seo` is uniform. Without it, "go and fix this title" from
the SEO overview landed on the Content tab of a nine-field form: it had
pointed at the record and not at the problem.

**A `Field` in a flex row sits 18px taller than it looks.** Its wrapper carries `mb-[18px]`, which is right for the stacked forms it was written for and wrong the moment one shares a row with a button: flex alignment uses the **margin box**, so `items-end` puts the button's bottom edge level with the bottom of that margin rather than with the control. It reads as a misaligned button and is actually a margin nobody can see — measured at exactly 18px. `Field` takes a `className` for this; pass `mb-0` in a toolbar row. A `hint` makes it worse rather than causing it, so moving the hint out is half a fix.

**Every image field browses the library *and* uploads, and both live in the same dialog.** `MediaBrowser` carries the uploader, so anywhere it is used — the body editor, the cover field, the gallery, the newsletter's image blocks — gains "upload one now" for free. Before this the cover and gallery fields could upload but not browse, which is how a library ends up holding four copies of one logo under four hashed names.

**Uploading one file from the picker picks it; uploading several does not.** Uploading a single image *while choosing an image* is unambiguous, and an extra click to select the thing you just added is a click that exists only because the dialog was not paying attention. Five is a different intent: they land in the library, the grid refreshes with them at the front, and nothing is chosen.

**`onPick` hands back the `url` **and** the `path`, and they are not interchangeable.** An editor inserts the URL; a field that saves a cover stores the path. `url` carries `?v=<updated_at>` so an edited image is not served from cache, and a stored path with a query string on it is a filename that does not exist.

**A `Select` needs `variant="float-static"` on its `Field`.** A select always
has a value, so the animated label has nothing to be displaced by and renders
*on top of* the chosen option. `Field`'s docblock says so; the first cut of the
SEO panel's two dropdowns did it anyway, and it is only visible in a browser.

**`Tabs` reads `children[i]` positionally — one JSX child per declared tab —
and a form with more top-level siblings than tabs loses everything past the
count, silently.** Found while building `StoreCategoryForm` from the same
template as `job-form.tsx`: the Jobs form declared three tabs (Content, The
role, SEO) but had **six** top-level children inside `<Tabs>` — the role panel,
two loose `<Field>`s (requirements and the qualifications intro), a
`<fieldset>`, and `SeoPanel`, each a separate sibling rather than one wrapped
panel. `children[2]` — the third array entry, meant for the SEO tab — was the
loose "What they will do" field; everything after it, including `SeoPanel`
itself, was never in the DOM at all. **A vacancy's SEO override, its
requirements text and its qualifications checklist were all unreachable from
the console**, not hidden — verified with a Playwright probe reading
`page.locator(...).count()` before and after: 0 and 0 for the missing fields,
the wrong text under the SEO tab, and 1/1/correct-content after wrapping "The
role"'s scattered siblings in a single `<>...</>` Fragment. A static AST sweep
(`scripts/_tabs-audit.mjs`, TypeScript compiler API, not a JSX regex) over
every other tabbed admin form confirmed this was the only instance: the other
twelve either build `tabs` from the same array they map for children
(`settings-form.tsx`) or already wrap each panel in exactly one element.

**Admin list tables have three layouts, not two.** Cards below `md`,
table with the `min-w-[NNNpx]` floor released between `md` and `xl`, and the
floor honoured at `xl`. That middle band exists because the floors are wider
than the space available — and 1024px is *worse* than 900px, since the
sidebar appears at `lg` and takes the content area from 810px to 710px. The
last column was clipped by up to 210px, contained by `overflow-x-auto` so
nothing flagged it.

**`truncate` decides what is painted; `min-w-0` decides what may be demanded.**
A grid item's automatic minimum size is its **min-content**, so an ellipsised
media URL in the campaign block list — one unbreakable 300px run — sized the
whole column to 490px and every field on that tab rendered 490px wide inside a
342px phone. The text was being truncated correctly the entire time. Both the
`ul` and the `li` needed `min-w-0`, because each is a grid item in its own
right.

**A `max-w-[..ch]` on a `truncate`d cell sets the column's floor.** A
max-width clamps an element's min-content contribution but never lets it fall
below, so the ticket subject's flat `max-w-[44ch]` held that column at 407px
however narrow the screen. `min-w-0` alone does not help and `max-w-full` is
worse — it resolves against an auto-width parent, which is no cap at all. The
cap has to *scale* with the room. Tickets also hides Category and Due between
`md` and `xl`: its two inline selects need ~205px each to show "Pending
customer", and five columns plus those do not fit 691px.

**Admin list tables become cards on a phone**, via `.admin-table` plus a
`data-label` on every `<td>`. The wrapper's `overflow-x-auto` means a 760px
table never overflows the page, so it passes every check while being unusable
— you read it through a 360px window, scrolling sideways once per row. If you
add a column to one of the fifteen list screens, add its `data-label` too, or
that cell renders unlabelled on mobile.

**CMS admin routes bind by id, not slug** (`{blog_post:id}`).
`Sluggable::getRouteKeyName()` returns `slug`, and an edit form that changes
the slug it is addressed by breaks mid-save.

**The thirteen entity forms keep a draft in `localStorage`, and it never
touches the server.** `components/admin/form-draft.tsx`, placed inside the
`<Form>`: every ten seconds while something has been typed (and at once when
the tab is hidden) the named controls' values are written under the route's
key — never a file, never a password — and on return an `Alert` offers
Restore or Discard. Submitting clears it. Restore writes each value back
through the prototype's setter and an `input` event, which is what makes a
React-controlled field take it, and then announces `tw:draft-restored` on
the form so `EditorField` re-keys Summernote from its hidden input — the one
control nothing else could refresh. A restore cannot *create* a control: a
repeater row added and never saved is the one thing a draft loses.
`scripts/probes/form-draft.mjs` measures it on the new-post form, which it
never submits; Summernote reports on keyup and React commits a tick later,
so a snapshot taken on the same tick misses the last keystrokes.

**Every CMS entity form is tabbed, and no panel is ever unmounted.**
Nine forms (blog, knowledge base, case studies, pages, solutions, services,
industries, product categories, products) split into Content / Media /
Related / SEO via `components/admin/tabs.tsx`. Inactive panels are hidden with
the `hidden` attribute because they sit inside **one** form — unmounting takes
their inputs out of the DOM, and a missing checkbox reads as false. That is
the bug that used to drop posts from `sitemap.xml` when the SEO panel was
collapsed, and it is now one mistake away from doing it to four panels at once.

The other half is `components/admin/form-tabs.tsx`: a 422 landing on a hidden
panel would otherwise be invisible — "could not save", every visible field
fine. `buildFormTabs` maps Laravel's error keys (including nested `seo.title`
and `faqs.0.question`) to the owning tab, badges it, and jumps there. **A new
field must be added to its tab's `fields` list**, or its errors are silently
charged to the first tab.

### Sanitising, escaping and the CSP

**The CSP is split into an enforced half and a Report-Only half, and that is
not fence-sitting.** `script-src` is the directive that matters and the one
this application cannot tighten: the App Router streams its RSC payload in
inline `<script>` tags whose contents differ per page, so they can be neither
hashed nor enumerated, and the only precise way to allow them is a per-request
nonce — which forces every page to render dynamically. This site prerenders its
index pages deliberately, to the point that a build with an unreachable API
*fails* rather than bake a stale error page into static HTML, so buying
`script-src` at the cost of static rendering trades a measured property for a
defence-in-depth one. So `base-uri`, `object-src`, `form-action` and
`frame-ancestors` are **enforced** — they cost nothing, cannot break an
integration, and are the four that turn a foothold into an escalation — and the
full policy ships alongside as Report-Only.

**`npm run audit` fails on any CSP violation the Report-Only policy reports.**
A header nothing checks is a header that drifts the first time somebody adds an
integration, and a report-only policy that nobody reads protects no one. The
audit listens for `securitypolicyviolation` on every route, so "this policy
could be enforced" is a measured claim across the whole route list rather than
a hopeful one — and promoting it is then moving one string, with evidence.
The listener is registered on the **context**, once: `addInitScript`
accumulates, so registering it per route reports each violation as many times
as routes already visited.

**`next.config.ts` is *imported* before Next assigns `NODE_ENV`.** A
`const dev = process.env.NODE_ENV !== "production"` at module scope is
therefore `true` even during `next build`, which baked `'unsafe-eval'` and a
websocket origin into the *production* policy, silently. Read it inside
`headers()`, which runs after the assignment.

**`headers()` is evaluated at build time** and written into
`.next/routes-manifest.json`. So everything the CSP is built from is read in
the **build** environment — `ASSET_ORIGIN` included, exactly like
`API_BASE_URL`. Setting one only at runtime changes nothing, and the header
will not say so.

(Worth knowing how that was nearly missed: `pkill` does not kill a Node process
reliably here, so the first "fixed" reading came from the previous server still
holding port 3000. Kill by PID and confirm the port is free before believing a
header.)

**Shortcodes are expanded into components, never into HTML.** A CMS body can
carry `[slider slug="hero"]` or `[form slug="contact"]`. `lib/shortcodes.ts` splits the *already sanitised*
HTML into segments and `ProseWithShortcodes` renders a real `<Slider>` between
them, so the slug reaches the DOM as a React prop. **Never expand a shortcode
by string substitution** — the sanitiser has already run by then, so an editor
typing `"><script>` would own every page embedding it. The attribute is
additionally restricted to slug characters, so a malformed shortcode renders as
the literal text that was typed.

**Rich text is sanitised on write, in `prepareForValidation()`.** `Prose`
renders CMS bodies through `dangerouslySetInnerHTML`, so `HtmlSanitiser` is
the only thing between a content-manager account and script on every visitor's
page. A new rich-text field must be declared in the request's
`richTextFields()` or it bypasses the sanitiser entirely — and the allowlist
in `config/purifier.php` is deliberately the exact set the editor's toolbar can
produce and `prose.tsx` styles, so widening one without the other ships either
markup the site renders unstyled or a button that silently does nothing.
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

**A cookie-authenticated route handler that changes something checks
`Origin` first** — `isSameOrigin()` in `lib/same-origin.ts`, inside
`proxyMultipart` for every upload handler and in the impersonation handler.
`sameSite: "lax"` already keeps the session cookies off a cross-site POST; the
check does not rely on that. An absent `Origin` passes (not a browser), a
`null` one does not.

**Two settings groups are private and must stay that way.** `mail` holds the
SMTP credentials and `integrations` holds the API key. They are excluded from
the public `/settings` whitelist, marked `is_secret`, encrypted at rest, and
never returned to the browser — the admin response says only whether a value
is set. A blank submit means "unchanged", because the form can never show the
current value; clearing one is a separate endpoint. When adding a setting, ask
which of those two lists it belongs on before adding it to the seeder.

**Every `href` an editor types is `App\Support\LinkPattern`.** A path, an
http(s) URL, `mailto:` or `tel:` — and the path branch refuses `//host` and
`/\host`, which a browser reads as another site. Menus, popups, content
blocks, the promo band, slider slides and gallery items all use it; the last
two took any string, so `javascript:` saved on a slide ran for whoever
pressed it. Social profiles must be http(s), and the three analytics ids are
held to their published shapes, since they are interpolated into inline
scripts. An FAQ answer saved through any entity form's `faqs[]` is sanitised
(`SanitisesRichText` adds `faqs.*.answer` to every request), as it always was
on the FAQ screen.

**A map embed URL is validated against Google's host on write.** It becomes an
`iframe src` on the contact page, and an unchecked one is somebody else's page
rendered inside ours.

### Laravel conventions

**`throttle:N,M` counts per route.** The framework's unnamed limit keys on the
caller alone, so all ~80 throttled routes shared one counter per caller —
twenty JavaScript error reports answered 429 on `auth/login`.
`ThrottleRequestsPerRoute` is registered over the `throttle` alias in
`bootstrap/app.php` and adds the route's name (methods + URI without one), so a
new route gets its own counter by writing `throttle:N,M` as before; nothing
per-route to remember. `RateLimitScopeTest` pins it with the proxy rule above.

**A log line an operator needs must clear the shipped `LOG_LEVEL`.** Both
`.env` and `.env.example` ship `LOG_LEVEL=warning`, so `logger()->info(...)` is
discarded — which is what was happening to the password-reset audit record
while its own comment claimed an operator could read it. The two endpoints that
answer identically whatever happens (password reset, and registering with a
known address) log at `warning` for that reason: the response is deliberately
uninformative, so the log is the only trace there is.

**Do not put `email:dns` on a public form.** It is a DNS lookup on the request
path, and this project has already measured what an uncontrolled network call
there costs: an unreachable SMTP host took a contact-form submission from 0.2s
to 12.5s. It also buys little, because the confirmation email is a far stronger
proof that an address exists than an MX record.

**A morph map is enforced** (`AppServiceProvider`). Polymorphic rows store
`"product"`, not `App\Models\Product`. So: register any new polymorphic model
there; **never** compare `$model->author_type === Foo::class` (use `instanceof`);
set the relation with `->associate()`, never by assigning `*_type` by hand.

**`Model::preventLazyLoading` is on outside production.** Eager-load everything
an API Resource serialises or it throws.

**A heredoc interpolates variables and nothing else.** `{self::BRAND_900}`
was written into every generated placeholder image verbatim, so the gradient
had invalid stop colours and all 33 rendered as black rectangles — art that
reads as broken rather than as a placeholder. `PlaceholderImage` assigns the
constants to locals first. Regenerating is a re-run of the seeders, except the
brand logos: `DemoContentSeeder` only fills a blank `logo_path`, deliberately,
so a real logo survives a re-seed.

**An all-time figure is computed in SQL and held for a minute, never
loaded into PHP per view.** The ticket dashboard's medians, SLA share and
category chart pulled every answered ticket into a Collection on every
view — 19–23s each at 200,000 tickets, measured on 2026-09-19 — and are
one window-function or aggregate query each now, the whole `metrics`
block under `Cache::remember` for 60s (`DashboardController::METRICS_CACHE_KEY`).
Same family: `whereDate`/`whereYear`/`whereMonth` wrap the column in a
function and cannot use its index; range with `whereBetween`. And an
index is added for a *named* query on a table that grows, and a strict
left prefix of a composite on the same table is dropped — the migration
`2026_09_19_160000_tune_indexes_for_speed` names each one, and
`docs/design-audit-2026-09-19.md` has the before-and-after.

**`Setting::get()` is memoised per request through `Cache::memo()`, and
forgetting it has to go through the same repository.** A blog listing of twelve
posts ran 28 queries, 24 of them re-reading one cached map — `Cache::get` per
call, per row — and every request paid three to ten of those at boot for the
mail configuration. The memoised repository reads the store once per request;
`Setting::flushCache()` forgets through `Cache::memo()` because a plain
`Cache::forget()` clears the store and leaves the request's memo answering with
the old map. It is a scoped binding rather than a `static`, because a static
survives from one test's application to the next.

**A public resource's `seo` key is `$this->seo()` from `IncludesSeo`**, beside
`IncludesSchema`: twelve resources carried the same `relationLoaded`
expression under the same comment. An update request that differs from its
store request by nothing but `sometimes` and an `ignore()` extends it and
calls `$this->sometimes(parent::rules())` from `SometimesRules` (the
redirect pair does); the CMS pairs whose rules differ in substance stay two
classes, and the trait's docblock says which is which.

**`response()->json($resource)` drops the `data` wrapper.** It serialises
through `jsonSerialize()`, which returns the resolved array; the wrapper is
added by `toResponse()`. So a created record comes back shaped unlike every read
of one, the client's `res.data` is undefined, and the console reports a failure
for something it just created. This has now happened on **two** modules — menus
and campaigns — so use `(new Resource($model))->response()->setStatusCode(201)`.
`NewsletterTest` pins it.

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

**Notifications must never fail a request.** Everything goes through
`App\Support\Notifier`, which logs and swallows. A ticket that is already
committed must still return 201 when the mail server is down — telling a
customer their ticket failed while it sits in the database means they send it
again. The internal-note guard is at the **call site** in the admin reply
path, not inside the notification: an engineering note reaching a customer
inbox is the worst failure this system has, and the check belongs where
anyone reading that method will see it.

**`staff` middleware guards the whole admin group.** `role:` already refuses a
customer token, but logout, `me` and change-your-own-password are reachable by
every role by design and each carried its own inline `instanceof User` check.
The third was added without one and a customer token could call it. One
middleware on the group cannot be forgotten; the inline checks are gone.

**`$request->user()` on a route outside `auth:sanctum` is always null, and it
reads as working.** It resolves the *default* guard, which nothing on a public
route has ever populated — so a signed-in caller arrives indistinguishable from
an anonymous one and every branch behind "is somebody signed in" is dead code.
It shipped twice: on blog comments, where the customer link, the name override
and the `account` scoring signal all did nothing, and on the **chatbot**, where
`customer_id` was never stamped, so every conversation looked anonymous on the
console and a signed-in customer asking for help was handed a link to the
sign-in page. Nothing threw and nothing was logged either time, because a
comment and a conversation are both stored perfectly well without any of it.

Two halves, and both are needed. The API names the guard — `$request->user('sanctum')`,
narrowed with `instanceof Customer` so a staff token cannot put a `User` id in a
column that means a customer. And the **Server Action has to forward the portal
token**, which neither did: these endpoints are public by design, so the token
is the only thing that can say who is asking.

**And the reason it survived is the test.** Both were covered by
`actingAs($customer, 'sanctum')`, which stages the authentication by hand and
therefore tests the controller rather than the wiring — the trap
`RepathsLandingPages` already records, in its exact form. The tests that pin it
now send a real `Authorization: Bearer` header; reverting either guard fails
exactly the new test and leaves the old one green, which is the whole
demonstration.

### Tooling and editing on this machine

**Editing a file with Python on Windows silently rewrites every line ending,
and `.gitattributes` pins `*.php` to LF.** `pathlib.Path.write_text` opens in
text mode, so every `
` becomes `
` — which is invisible in a diff, invisible
to `php -l`, and breaks the first thing that compares a **multi-line string**.
It took out `ChatTest`'s prompt-injection assertion: the test builds the
expected fence block as a literal in the source, `Assistant` joins its lines
with `"
"`, and the two stopped matching while both were correct. The failure
reads as a broken fence, which is the one thing that test exists to prove is not
broken. Use `write_bytes(s.encode("utf-8"))`, or check with
'` afterwards.

**`routes/api.php` is the tree and `routes/api/*.php` are the leaves.** The
one file was 1,333 lines, and every role's block was a scroll through every
other role's. It now holds only the three nested groups — `v1`,
`auth:sanctum`, the `admin` prefix with its `staff` and `activity`
middleware — and `require`s a file inside each closure: `public.php`,
`portal.php`, `admin-auth.php` and one `admin-<role>.php` per role. A `Route::`
call at a required file's top level registers into whichever group is open, so
the middleware tree is unchanged and `php artisan route:list` was byte-identical
before and after. **A role file must stay inside its `role:` group**: the file
opens with the `Route::middleware('role:…')->group(` line for that reason, and
moving a route between files moves it between roles. The `media/move`-above-
`media/{id}` ordering rule still applies *within* a file; it cannot apply
across two, since each is required whole.

**The majors are Laravel 13, PHPUnit 12, Next 16.3, React 19.3, ESLint 9 and
TypeScript 5.9 — and the last two are pinned by what `eslint-config-next`
can run, not by choice.** Brought up on 2026-09-16 (Laravel 12.67 → 13.32,
PHPUnit 11 → 12, Tinker 2 → 3, every Symfony and Guzzle patch, Next 16.3.1 →
16.3.5, React 19.2 → 19.3, Playwright 1.63, `@types/node` moved from 20 to
the 24 this machine runs). What the Laravel 13 guide named and this
codebase met: `config/sanctum.php` names `PreventRequestForgery` (the
renamed CSRF middleware), and `config/cache.php` is published for one key,
`serializable_classes => false` — the framework falls back to "anything"
when it is absent, every cache write here is an array or a scalar, and the
suite runs on the array store so a cached object would surface on the file
store in development rather than in a test. The cache prefix changed shape
with the framework default (`technoware-cache-`), which orphaned the old
entries harmlessly. Two upgrades were tried and reverted with evidence:
**ESLint 10** crashes `eslint-config-next`'s bundled `eslint-plugin-react`
(`getReactVersionFromContext` reads an API ESLint 10 removed) and
**TypeScript 7** is outside `typescript-eslint`'s `<6.1.0` range, so `tsc`
passed and `npm run lint` could not start. **jQuery stays on 3**: Summernote
0.9 is written against it and 4.0 removes the deprecated APIs it uses.
Re-try each when `eslint-config-next` moves; nothing else is waiting on them. **Re-tried 2026-09-20 against `eslint-config-next` 16.3.5**: ESLint 10.11 still crashes in its bundled `eslint-plugin-react` (`react/display-name`: `contextOrFilename.getFilename is not a function`), `typescript-eslint` 8.70 still pins TypeScript `<6.1.0`, and Summernote is still 0.9.1 — all three stay where they are.

**Static analysis is Larastan at level 5 with a baseline, and the baseline is
a debt register, not an allowlist.** `composer analyse` must print "No errors"
before a commit. `phpstan-baseline.neon` holds what the codebase still
reports — 302 entries on 2026-09-18, down from 929 — so that a *new* finding
fails while the old ones wait. Do not regenerate the baseline to make a run
pass; fix the finding or, if it is a false positive, add an `@phpstan-ignore`
with the reason. Regenerate it only after a change that makes the analyser
see more, so the register shrinks: two of those happened on 2026-09-18 and
are now conventions. **Every relation method carries its generic return
type** — `/** @return HasMany<Faq, $this> */` — because without it a
relation is a bare `Model` and every attribute read through it was an
"undefined property" (431 of the old entries); 161 methods were annotated
from their own bodies. And **`parseModelCastsMethod: true`** is set in
`phpstan.neon`, because every model here declares its casts in the `casts()`
method and Larastan reads that method only when told to — without it every
enum-cast attribute was a string to the analyser, which is where 215
`method.nonObject`/`nullsafe.neverNull` entries came from. Most of what
remains is `?->` on an attribute the migration says is non-null: harmless,
and not rewritten, since a partially selected model can still hand back
null. Every API Resource carries a `/** @mixin \App\Models\X */`, which is
what lets the analyser see `$this->title` through `JsonResource`'s magic
`__get` — without it every resource was a wall of undefined-property noise.
The analyser reads the migrations (`databaseMigrationsPath`) to type columns.

**Long Bash commands are truncated in this harness**, which presents as
`unexpected EOF while looking for matching quote` from a heredoc that is
perfectly well formed. Write long files with the Write tool rather than
`cat <<'EOF'`.

**A newly created `layout.tsx` may need the dev server restarted.** The file was
correct and the nav rendered nowhere, in the browser and in the served HTML —
Next's watcher on Windows had not picked up a layout added to an existing route
segment. Same family as the `pkill` note under "Sanitising, escaping and the CSP": believe the
process, not the file. Restart before concluding the code is wrong.

**Passing routes to an audit through Git Bash needs `MSYS_NO_PATHCONV=1`.**
A leading-slash argument is rewritten into a Windows path, so
`node scripts/audit.mjs /admin/newsletter` navigates to
`C:/Program Files/Git/admin/newsletter` and every route reports "could not
load". And **do not pipe the audit to `tail` when the exit code matters** — a
pipeline reports the last command's status, so a run in which nothing loaded
comes back as 0.

**The probes a rule cites live in `web/scripts/probes/` and are committed;
a `_*.mjs` or `probe-*.mjs` beside them is a throwaway and is gitignored.**
Eleven were promoted on 2026-09-14 — motion, motion-fixes, slider-flicker,
velora, nav, cards-slider, upload-progress, embed-html, drawer-focus,
newsletter-motion, blog-hero — because each pinned a measured bug that a
rule in this file still quotes, and a gitignored probe is invisible on the
next machine. They take `BASE` (default `http://localhost:3000`) and sign in
only through `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` (plus `NAV_CM_*` /
`NAV_SE_*` for the per-role nav probe): **no probe carries a credential**, and
the two that used to were changed on the way in. Each opens with a docblock
saying what it measures and how to run it. A one-off screenshot script stays
an underscore file and is deleted when its question is answered.

**A hydration warning on `<style id="theme-tokens">` naming
`data-merge-styles` is Turbopack, not the layout.** It appears in a tab that
was open while `globals.css` was edited under a running dev server — the
client finds the dev CSS-merge `<style>` where the server rendered ours — and
it is gone on a clean restart; both audits, which fail on any console error,
report none there. Restart before treating it as a bug in the root layout.

**`allowImportingTsExtensions` is on, and the three palette modules import
each other with `.ts`.** `scripts/theme-contrast.mjs` runs them under Node's
`--experimental-strip-types`, which resolves relative imports only with an
extension; Next's bundler resolution is indifferent. Without it the gate
cannot import the generator it exists to check.

**Running a production build in the same directory as a live `next dev`
corrupts the dev server, and it presents as a runtime bug in whatever you were
last testing.** Both processes read and write `.next`. Verifying this session's
change with `npm run build` while a dev server was serving `localhost:3000`
left that dev server's live behaviour altered — before the actual marquee-gap
bug was found and fixed, the same page was independently measured scrolling at
roughly a tenth of its declared speed. Killing the dev server by PID, deleting
`.next`, and starting one clean instance was what made the animation
measurable at all — the same "kill by PID and confirm the port is free before
believing a header" rule this file already states, for a new way of tripping
over it. Do not run `next build` against a directory a dev server is actively
using.

### Testing

**`withHeaders` is sticky across requests in a Laravel test.** A header-less call
after one that set `X-Cart-Token` still goes to the same basket — which made a
coupon test add three of something and report a discount twice the expected size.

**Browser tests must not mutate the seeded admin account.** The audit signs
in with `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` and only reads, which is
fine. Anything that *changes* a credential — a password-reset walkthrough, for
instance — needs its own throwaway staff account, created through
`POST /admin/staff` and deleted afterwards. Driving the real admin through a
reset changes the password on the developer's machine, and they find out the
next time they try to sign in.

**`phpunit.xml` pins `DB_DATABASE` to `technoweb_test`.** Feature tests use
`RefreshDatabase`, which drops and re-migrates whatever connection it is
given. Without that line the suite destroys the development database — it did,
once.

**`assertJson` matches a *subset*, so `['data' => []]` is satisfied by a
response full of rows.** The first cut of `CompanySuggestionTest` asserted the
prefix rule that way and **passed with the rule reverted to a substring match**
— a control run that proves the test, not the code. `assertExactJson` is what
that wanted. Worth knowing generally: an assertion about something being
*absent* cannot be written with `assertJson`.

---

## Modules

One line per rule. The full account of each is in the linked file, and a
new rule goes in both places.

### The store — `docs/store.md`

A separate catalogue with prices; baskets, checkout, payment, stock, coupons, digital codes, the Merchant Center feed, wishlists, spec filters, product video, the Meta catalogue.

- "Paid" has one definition and three screens read it.
- The public order page's alert reads `paid_at` too: a cash-on-delivery order is confirmed and unpaid, and it said "Payment received" until 2026-09-16.
- An order's token is never the address of a rendered page (2026-09-26): links go to `/order/{n}/open?token=`, which sets an httpOnly cookie at `path=/order/{n}` and 303s clean; the page and its actions read the cookie (`lib/order-access.ts`), Analytics skip `/order/*`, `no-referrer` there.
- "Out of stock" has one definition too, and it is the one the tile links to.
- Overselling is a switch on the shelf, so it lives where the stock does.
- With oversell on, `inStock()`, `scopeOutOfStock()`, `CartItem::availableQuantity()`, the checkout gate and `Settlement::takeStock()` all agree, and stock goes negative on purpose.
- A model's in-memory defaults must match its columns.
- A digital product with no codes left is out of stock silently.
- "Stock in" was recorded nowhere, and a counter cannot be made to remember.
- `StockLedger::adjusted()` compares, because the form posts a level and not a change.
- A product with variations is counted per variation and never on the parent.
- A movement is written on the affected row count, never on having tried.
- The report has no opening or closing balance and that is deliberate.
- `StockLedger` never fails what it is recording.
- There is no `Cancellation` reason because nothing puts stock back.
- A dashboard figure is null, never zero, when nothing has been measured.
- The report ranges on `placed_at`, not `created_at`.
- `diffInDays` returns a float in Carbon 3.
- Money in a CSV is a plain decimal, not a formatted amount.
- There is one CSV writer in the application.
- Four ways to pay, and only one of them settles by itself.
- Cashfree is the second gateway (`CashfreeProvider`, 2026-09-18): rupees on the wire converted on integers and strings never a float, the browser's return confirmed by asking Cashfree's API rather than by a signature, the webhook signed over `timestamp . rawBody` with the client secret; sandbox or production is a setting. Not yet driven against a real account.
- "Did we get paid" and "has the order progressed past payment" stopped being the same question.
- `OrderStatus::Confirmed` exists for cash on delivery alone.
- Cash on delivery cannot carry a licence.
- A COD ceiling is a real setting, not a nicety.
- Availability is checked only for a method somebody named.
- Switched on is not the same as offered.
- The sales-order email and the order page read one array, and the email lists every line.
- Account numbers never reach the checkout.
- `ManualPayment` is the one path that can make an order paid, and it is not a dropdown.
- Nothing in the console can mark an order paid.
- An order's stamps are set on arrival and never cleared.
- The dispatch notice is sent on the status change, not on the tracking form.
- The invoice is uploaded, never generated.
- An internal note has no key on the customer's resource at all.
- A digital code is assigned once, and the constraint that guarantees it is not the obvious one.
- Codes are encrypted at rest, with a SHA-256 fingerprint beside them.
- A code on its own is not a delivered product, so an activation procedure goes with it.
- The product overrides the default where it *says* something.
- The procedure is emailed and the code still is not.
- Lines sharing a procedure share an email.
- A missing PDF is skipped, never thrown on.
- The email renders the procedure as text, not as HTML.
- An endpoint with no control behind it is a feature that does not exist — the code reveal shipped that way.
- A code is never in an ordinary read.
- `digital_auto_fulfil` decides whether codes go out by themselves.
- Running out never fails a payment.
- A coupon is stored on the basket as a code, never as an amount.
- A coupon that has become unusable does not fail the order.
- Coupon usage is a table, not a counter.
- Usage is recorded at checkout, not at payment.
- The store emitted no structured data at all, and the marketing catalogue emitted the wrong kind.
- A feed is data, and the RSS is rendered where the escaper lives.
- Google's two price fields are the other way round from the columns, and the first cut got it wrong.
- Availability is three-valued, and `inStock()` is not the source.
- `track_stock` was null on an unsaved model, and the test that found it passed for the wrong reason.
- The SKU is never offered as a manufacturer part number.
- `feed_include` is a separate decision from `status`.
- Google rejects SVG, and this library is largely SVG placeholder art.
- Delivery, handling and the return window are three settings read from one place.
- `/returns` and `/shipping` are seeded placeholders, and `PageSeeder` overwrites all four policy pages on re-run.
- `AggregateRating` and `Review` are emitted on the store Product graph from published reviews only (2026-09-26), never invented; the catalogue has neither.
- The promo band on the shop front is `/admin/store/promo` under Store, a store manager's screen, not a run of fields at the foot of Settings → Store (2026-09-20): its rows are the `store_promo` settings group, left out of the settings strip like the info bar, written through `PATCH /admin/store/promo`, which refuses any key outside the eight by name — settings as a whole stay `role:admin`.
- Two tiles sit above the band (2026-09-21): seven `store_tile_{1,2}_*` rows each in a `store_tiles` group, the same screen and the same endpoint, whose per-key checks run by suffix; a tile draws only when switched on with a heading or a picture, one alone takes the whole row, the ratio applies from `lg` only.
- The store products screen shows the feed's production address with a copy button and a plain `<a download>` at the path (never a `Link` — it prefetches, and this handler builds the whole feed).
- `/google-shopping-feed.xml` is the feed at a second address; shipping declares `store_shipping_service` and a transit window (`store_transit_days_min/max`, never backwards); `PolicyRedirectSeeder` answers `/refund-policy`, `/terms-and-conditions` and the rest as 301 rows.
- The store's catalogue is not the site's catalogue, and that is the whole shape of the module.
- Money is paise, as integers, everywhere — and GST is extracted, never added.
- A cart line is a pointer and an order line is a snapshot.
- GST is stored once at the order, never per line.
- `GET /cart` is a read that writes, so it is throttled and pruned.
- The basket is a token in an httpOnly cookie, because guest checkout is a requirement.
- A guest who pays gets an account, and it is `active`.
- The checkout re-reads and re-prices everything, under a lock.
- The address is required by the basket, not by the form.
- The PIN code is asked for first, and it fills the three fields under it.
- Everything it writes stays editable, and that is load-bearing rather than polite.
- The table is vendored, not depended on.
- `lib/pincode.ts` is `server-only` and the lookup is a route handler.
- A failed lookup never touches the address.
- Payment: the browser's word is a convenience and the webhook is the truth.
- Idempotency is the unique index on `payments.gateway_payment_id`, not a check.
- A webhook always answers 200.
- The webhook signature is over the raw body.
- Razorpay's two secrets are not interchangeable.
- A stock shortfall never refuses a payment.
- A payment for the wrong amount is recorded and settles nothing.
- The shop's search suggestions are a listbox, and the two datalists are not the precedent for them.
- A card's hover images mount on the first hover, not with the grid.
- The basket strip is the shop's own chrome, not an addition to the site header.
- A sticky element is held by its **own parent's** box and by nothing further up, so the shop's filter strip is a direct child of the wrapper spanning the shop and carries the container's gutter itself (2026-09-23) — nested one `Container` deep inside the first section it released at the pagination and slid behind the header, which the wrapper added in September could never have fixed.
- The two promo tiles sit directly above the trust strip; the checkout says **Mobile** while the wire key stays `phone`, checked for shape as an Indian mobile; `orders.customer_note` is the buyer's optional note and is never `notes`, which is `Order::notes()`, the desk's own.
- The strip sticks at **every** width from 2026-09-23 (the client's ask), and the store grids are two-up on a phone with the card's type one rung smaller below `sm` — which is what `product-card.tsx`'s own note already described while every grid said `sm:grid-cols-2`.
- Every Add to basket in a row of product cards sits on one line, in every theme (the client, 2026-09-28): the actions row is the card's last part with `mt-auto` (it used to be the price, and a wrapped discount badge moved the button); a theme that lays the card out itself stretches the body to the row's height (Editorial, and Datacenter's column) and never sets a `margin-top` on `[data-tile-actions]`. `scripts/probes/store-cart-level.mjs` measures all twelve themes.
- Place order fires Velora's confetti from the press, only when the form passes the browser's own validation; the order page's larger burst on arrival stays.
- A refund is a `payments` row with status `refunded` (`ManualRefund`, `POST …/orders/{number}/refunds`): an amount, a reference, who confirmed it; partial refunds add up, the amount completing what was paid makes the order `refunded`, and nothing calls a gateway (2026-09-20).
- The catalogue imports and exports (2026-09-20, `CatalogueExport`/`CatalogueImport`): one CSV row per product and per variation with `parent_sku`, money as plain decimals; the import is a dry run then a commit, matched by SKU — a variation's SKU updates the variation, a product's the product, an unknown one creates a product, and nothing ever creates a variation; a blank cell leaves a column alone; stock moves through `StockLedger::adjusted` with the import named; a store-specific column guesser, because the newsletter's reads "name" as a first name.
- Reviews (2026-09-26, `docs/store.md` "Reviews"): one per customer per product (a second write edits it), signed-in customers only, every write back to `pending`; Verified is a line on the customer's `Order::paid()` order, variant from the line's snapshot; the product's `rating_average`/`rating_count` are written only by `ReviewSummary` from the review's own hooks; the product page renders the first page from the ISR cache and asks `/api/store/reviews` and `/api/store/reviews/mine` after mount; stars are `--color-rating`/`--color-rating-empty` from `ratingFor()`, gated at 3:1.
- The portal login's `?return=` is a same-site path or `/portal` (`safeReturnPath`), read by the page and again by both actions.
- `technoware:request-reviews` is hourly, inside quiet hours, once per order (`review_requested_at` stamped before the send, whatever happens), `store_review_request_days` after dispatch — or after payment when nothing ships — and never for an order still waiting to be dispatched.
- Specification filters are chosen per category from the labels its products carry (2026-09-26, `filter_specs`, the category form's Filters tab): `store_product_specs` is a derived index of each product's sheet and its active variations' options on normalised keys, rebuilt after commit and once per product (`SpecIndex::queue`, a timestamp guard, never a pending set) and by `technoware:rebuild-store-specs`; `?spec[Label][i]=` is OR within a label and AND across, a label nothing carries ignored; `/store/categories/{slug}/facets` counts each label under the *other* choices, and only the unfiltered answer is cached. `/store` filters through `AutoApplyForm`; the ISR category page never reads `searchParams` and links to `/store` instead.
- A store product's videos (2026-09-26, up to four, `ProductVideos`): a YouTube link is stored as its id through `YouTube::id()`, a file is an MP4/WebM the media library holds, the poster a raster from it; the gallery's shop mode (`store`) draws them after the pictures as a nocookie click-to-play facade (never `i.ytimg.com`) or `<video preload="none">`, `media-src` names the asset origins, and `subjectOf` names a YouTube video only when a poster was uploaded. The well magnifies with `scale` and a following `transform-origin` from `lg` with a fine pointer; the lightbox zooms 1–3× (click, keys, Ctrl-wheel, pinch, drag to pan) and `go()` resets it.
- The Meta catalogue (2026-09-26): `/meta-catalogue.xml` and `.csv` are the Google feed's rows mapped at the frontend sink (`lib/meta-catalogue.ts`) — back-order is `available for order`, no stock count, the CSV formula-guarded — behind `meta_catalogue_enabled` (public `store` group, on; off is a 404), listed with copy buttons and plain `<a download>` on the store products screen with a "How to connect".
- A back-in-stock notice is a row that is stamped once (2026-09-20, `stock_notices`): `POST /store/products/{slug}/notify` answers 202 whatever happened, `StockLedger::record()` on a positive delta dispatches `SendStockNotices` after commit, and the job re-checks `inStock()` when it runs, skips the suppression list, sends `back_in_stock` and stamps `notified_at`; a repeat request re-arms. `notices_waiting` on the admin product, `?notices=1`, `attention.awaiting_stock`.
- Abandoned-basket reminders (2026-09-25, `docs/store.md` "Abandoned baskets"): the checkout saves email and mobile on blur (`PATCH /cart/contact`, `contact_consent_at` stamped only while reminders are on), a portal Bearer claims an unclaimed basket (never a "View as"), and `technoware:remind-abandoned-carts` sends `cart_reminder_1`/`_2` plus `Messenger::notify` — idle on `updated_at`, which nothing in the reminder path moves (query-builder writes); claimed by a conditional UPDATE; inside `QuietHours`; never to the suppression list. The link carries `restore_token`, never the cart token; the unsubscribe is the newsletter's own route taking that token. Settings are the private `store_reminders` group because `store` is public and one row is a coupon code. A reminded basket is pruned at 90 days, not 30, so the dashboard's `recovered` (null when none reminded) counts over its whole window.
- A wishlist is a basket-shaped token for a guest and the account for a customer (2026-09-25, `wishlists`/`wishlist_items`, `Wishlists`): a token never reaches an account's list (its summary sends `token: null`, which makes the Next server forget the cookie), a request carrying both — and `issueToken()` at sign-in, when `lib/auth.ts` forwards `X-Wishlist-Token` — merges the guest's in, never under "View as"; the hearts and the strip's count are client islands fed by one `useSyncExternalStore` fetch of `/api/store/wishlist` (204 with nothing in hand), so the shop stays cached; `SyncWishlistStock` from every `StockLedger::record()` arms empty shelves and tells armed lines once, `SendWishlistPriceDrops` from the product/variation `updated` hooks tells once per drop of `store_price_drop_min_percent`, both claimed by a conditional update, inside `QuietHours` (re-dispatched to `nextOpening()` otherwise) and off the suppression list.
- The browser's Razorpay return is bound to the order (2026-09-26): `createSession()` writes `orders.gateway_order_id`, the return must name it (`hash_equals`), and `GET /v1/payments/{id}` must say captured or authorised, that order, INR — its `amount` goes to `Settlement`, whose check a return without one used to skip. `Settlement::recordReturn()` refuses a return with no amount rather than recording it (a failed row would make the genuine webhook a no-op). Cancelling an unpaid order releases its coupon use; `POST /cart/coupon` answers an off, expired or not-yet-started code like an unknown one (`Coupon::isLive()`). A guest order only fills blank saved details; `/checkout` reads the portal token by guard name, forwarded by the Server Action. `activation_procedure`, `activation_pdf_path` and `digital_auto_fulfil` are out of public `/settings` (`PublicSettings::PRIVATE_KEYS`); an import commit's file is rebuilt from its last segment (`ImportUpload`).

### Customers and addresses — `docs/customers.md`

Account lifecycle, registration, the one address definition, company suggestions.

- A customer account has a lifecycle, not a switch.
- The registration endpoint must never reveal whether an address exists.
- A login refused on status returns 403 with a `reason`, and the frontend branches on that, never on the message.
- A ticket customer and a store customer are one row, and the address columns follow from that.
- `shipping_address` is null on the account while it is the same, and a copy on the order.
- Both addresses are validated whenever anything ships, not whichever one the parcel goes to.
- One `AddressFields` component renders both blocks, keyed by a name prefix.
- A customer's address lives on their account and is editable from the portal.
- Nothing there is required, and the checkout's version is.
- `App\Support\Address` is the one definition of an address.
- `Address::same()` exists because `===` on two addresses is wrong the moment one has been through MySQL.
- `isBlank()` ignores `country` and `same()` does not.
- The profile's address fields are read from the form on every save, unlike every other field on that screen.
- A company name is suggested from the ones already on file, and that is the one endpoint here that answers a question about the customer list.
- If that stops being true the fix is one line.
- It is a `<datalist>`, not a combobox.
- "View as" (2026-09-21) mints an `impersonation` token of its own for an hour, never a `portal` one and never through `issueToken()`; `/auth/me` reports `meta.impersonated`; the console reaches it through a POST-only route handler because both cookies are `sameSite: lax`.
- `portal_enabled` closes the portal (2026-09-29, `EnsurePortalEnabled`, middleware `portal`): every customer-principal route — the eight public `/auth/*` doors and everything behind `customer` — answers 403 `reason: portal_disabled`, so a token issued before the switch dies with it; staff are untouched, and guest checkout, visit requests, the wishlist and the chat are deliberately not closed. The website renders `PortalClosed` on `/portal/*` and `navWithoutPortal()` drops every portal link from the chrome, built-in lists and assigned menus alike (`isPortalHref`).
- An unconfirmed account is passed over (2026-09-26): `Checkout::accountFor()` does not join a guest order to one, `TicketPiper` confirms it before attaching mail, and the first confirmation — link, code or piped mail — replaces the password nobody proved, ends every session, then joins the address's paid guest orders (`Customer::markEmailVerified()`, `Checkout::claimOrders()`). A portal email change un-confirms the address and mails the new one. `verify-email` checks the token before it answers, so a confirmed address and an unknown one get the same 422; `already_verified` is always false.

### Sign-in — `docs/auth.md`

Codes, passwords, the two principals and what they must never share.
- Fifteen sign-in backgrounds since 2026-09-24: the seven after Vengeance UI (wave grid, aurora, fluid morph, twisting ribbon, animated rays, perspective grid, light lines) are re-drawn on the same 2D canvas — no three.js, no framer-motion — in `components/layout/backdrop-scenes/`, the loop and palette staying in `auth-backdrop.tsx`; scenes receive the pointer (the wave grid ripples from it).

- `default_login_method` decides which step a sign-in form opens on.
- The two principals must not share anything keyed on a value they both hold.
- A sign-in code is the third secret with that shape, and `sign_in_codes` is keyed on `(audience, email)` for exactly that reason.
- Codes are the default way in and passwords are a link away.
- `request-code` writes a row for an address with no account.
- Mail goes out inside `request-code`, so a known address answers measurably slower; the throttle bounds it and a queue worker is the fix.
- A code confirms an unverified address, and the support desk has to be told.
- Codes make the mailbox the only factor, and for the console that is a reduction.
- One input for the code, never six boxes.
- Both doors render one form: `components/auth/sign-in-form.tsx` takes the three Server Actions, the reset path and the register path as props, and `admin/login/login-form.tsx` and `portal/login/login-form.tsx` are the two wrappers that pass them. The refusal panel (`pending_approval`, `email_unverified`) is in the shared form and simply never fires for the console, whose actions set no `reason`.
- Beside the sign-in form is a setting (`login` group, Settings → Sign-in screen): the picture or one of eight canvas animations drawn in the theme's own tokens over `bg-dark`, intensity and speed beside it; `lib/login-backdrop-choices.ts` is the one list, shape-checked by the API, `auth-backdrop.tsx` draws it, still under reduced motion. `login_message` is rich text (`cms` profile) drawn centred over it through `Prose onDark` in place of the tagline.
- `password_login_enabled` is enforced by both login endpoints (2026-09-26): 403 `reason: password_login_disabled` before the credentials are read; `AUTH_PASSWORD_BREAK_GLASS=true` in `api/.env` re-opens *staff* passwords only, for the day mail is broken. A sign-in code's attempt is claimed with a conditional UPDATE before bcrypt runs, so parallel guesses cannot outrun the cap of five.

### Leads — `docs/leads.md`

Every contact form lands in one pipeline; the scoring rubric; the status machine.

- Every contact form in the product lands in one pipeline, and `leads` is its own table rather than columns on `enquiries`.
- The source page cannot be read from the request, and a column filled from `Referer` would measure nothing while looking perfectly plausible.
- Every envelope key begins with an underscore, and that is load-bearing.
- `LeadScore` is a rubric, not a model, and it is scored out of what applies.
- Intent matching needs inflections, and `\bwords?\b` is not enough.
- A lead's status dropdown offers only the moves the API will accept.
- The queue's rows move a lead too — a status select and "Take it" — and `allowed_next` rides on the index for it.
- `contacted_at` is stamped by reaching a state that means somebody replied.
- Nothing merges two enquiries from one address, and that is deliberate.
- `LeadIntake` runs before the notification and can never fail the submission.
- A lead is `role:sales_manager`.
- `enquiries.source` is a *kind* of page and often carries a slug.
- The buying words are the constant plus `lead_intent_words` (Leads → Scoring), and `technoware:rescore-leads` restates the table on them — report only until `--write` (2026-09-20).

### Editor-built forms and embeds — `docs/forms.md`

`FormValidator`, the frame, the raw-HTML snippet and its CORS.

- A form can be framed on somebody else's website, and the whole feature is a chrome-less route plus one CSP exception.
- Two CSP headers are intersected by the browser, not overridden, and that decides the shape of the fix.
- `frame-ancestors *` rather than a per-form allowlist, deliberately.
- An embedded lead must record the host's page, and would not by default.
- The raw-HTML snippet is the second shape of the same feature, and its CORS lives on a frontend route rather than in Laravel.
- That header grants no new capability, which is why `*` is defensible here.
- The generated markup carries three things that must survive being restyled.
- A copied snippet is a snapshot and will go stale.
- A `noindex` page is not required to carry a canonical, and `audit.mjs` says so as a rule rather than as an exemption.
- A form's validation comes from its stored definition, not its payload.
- Sixteen field kinds since 0.117.0 (`FormField::KINDS`; `App\Support\Forms\FieldSpec` says what each means and is *sent* to the console as `meta.kinds/ops/file_accepts/max_upload_kb/max_file_fields` — never a list in TypeScript): `url`, `date`, `radio`, `checkboxes`, `rating`, `file`, `hidden`, and the layout rows `heading` and `step`, which store nothing.
- `show_if` (`{field, op, value?}`) is evaluated twice and the two must agree: `FormValidator::shown()` and `hiddenNames()` in `components/forms/form-logic.ts`. A field its condition hides is **dropped on the server** (not required, not stored); a field whose source is hidden is hidden whatever its operator; a condition may read only an *earlier* field that is not a file, hidden or layout row, refused on save.
- A hidden field's value is the definition's, never the request's, and is absent from the public read.
- A form upload is the second unauthenticated upload after the CV: private disk (`form-uploads/{form}/`), hashed name, extension *and* content checked, at most three file fields, never attached to mail; downloaded only through `GET /admin/forms/{id}/submissions/{sid}/files/{field}`. A form with one is posted as multipart through `apiUpload`; the raw-HTML snippet refuses it.
- The server's HTML is the no-JS form (every step, every conditional field, one submit); `data-form-wait`/`data-form-js` and a four-second `step-end` animation hold the hydrated look and then end. No step panel is unmounted. A step's title is focused with `preventScroll` and scrolled by `scroll-margin-top` — it landed under the sticky header at 390px.
- The field builder re-mounts its list on the form's `reset` event: controlled, unnamed selects and tick boxes are reset by React after any action, a refused one included, and showed the first option while the posted JSON was right. Rows fold; a row with a 422 is always open.
- `redirect_url` is a path or an http(s) URL (`LinkPattern::PAGE_RULE`), followed by the Server Action outside its `try`; the embed frame shows a `target="_top"` link instead of navigating.

### The newsletter — `docs/newsletter.md`

Subscribers, groups, imports, campaigns, tracking, Hunter verification, bounces.

- "The test arrived and the campaign did not" is one thing and nothing else.
- A check must read what will be sent, not what was configured.
- `??` falls through on null and not on an empty string.
- And `?:` reads its left operand, which `??` does not — so swapping one for the other needs a `?? null` in front of it.
- `newsletter_address` falls back to the site's `address`.
- The newsletter is `role:campaign_manager`, and it used to be a lie.
- There is one way to get customers onto the list, and it is the standing group.
- The newsletter is "Campaign" in the sidebar, and top level.
- "Existing customers" is the one group nobody curates, and it must never resurrect an unsubscribe.
- The open pixel and the click links are API URLs; the unsubscribe link is a frontend one.
- A test that matched the URL against a pattern would have passed the whole time.
- Two screens must not hold two definitions of one word.
- Subscriber addresses are verified through Hunter, and a verdict excludes but never suppresses.
- The newsletter's seven screens joined both audit lists with the Verification tab.
- Deleting a campaign is offered in two places and they are not the same control.
- A bounce webhook fails closed, and the reason is the inverse of the payment webhook's.
- The newsletter's one rule is the suppression list, and it is keyed on the address.
- `whereIn('id', <select id join pivot>)` returns a subscriber in two groups twice.
- A campaign is claimed with a conditional UPDATE, not a read-then-write.
- The email renderer is tables and inline styles, and that is not nostalgia.
- The deliverability score is a heuristic and says so.
- CSV is hostile in both directions.
- An audience arrives three ways, and all three go through `SubscriberIntake`.
- `.xlsx` is read without a library and without `ext-zip`.
- A spreadsheet cell is positioned by its `r=` reference, never by counting.
- `mimes:` is worse than useless for a spreadsheet.
- A template's blocks are copied server-side from the template id.
- Only `newsletter_signup_enabled` is published from the `newsletter` group.
- Subscribers come from a mailbox too (2026-09-19, `docs/newsletter.md` "Importing from a mailbox"): a scan ends as a file under `newsletter-imports/`, so review and commit are the CSV import's own (`CsvImporter::dryRun/run`, `NewsletterImport`, groups, the done screen) — the scan is one more way to produce the file.
- A scan is sliced, self-chaining queued work (`ScanMailboxForSubscribers`, 40s a slice, `$timeout` 80 under the database queue's `retry_after` of 90): the scheduler's drain is `queue:work --max-time=50`, so one long job cannot exist; `HarvestState` on the private disk is the memory between slices, and a scan is refused outright when nothing drains the queue.
- To and Cc in every folder, From nowhere: in the Inbox From is vendors, notifications and lists — the audience most likely to complain. Gmail's All Mail and the other virtual folders are skipped by SPECIAL-USE flag (a message deduped by Message-ID besides, since a label files one message twice); junk, trash and drafts by flag then by name, back with `include_junk`; Microsoft 365's Calendar/Contacts/Tasks never.
- The date range is `SINCE`/`BEFORE` on the server's SEARCH *and* a check on the Date header, for servers that ignore the first.
- The newsletter's consent is its own `OAuthConnection::newsletter()` slot borrowing the Ticketing app registration (`credentialsPrefix`), spent by one scan and forgotten when it ends; one-off IMAP credentials are `Crypt`-sealed in the cache under a key only the job chain carries (`ScanCredentials`), never a settings row and never a job payload.
- The review is the reviewer's: per-domain counts with our own domains (minus freemail) and sending infrastructure unticked, role addresses (`AddressKinds`, machine senders — never `info@`) behind a switch, and what is unticked counted as `excluded` rather than written as rows.
- A subject test (`subject_b`, `ab_test_percent`, `ab_wait_hours`) sends a slice under each line and holds the rest as recipient status `held`; `CampaignSender::decide()` picks by opens (tie to A) with a conditional update, from `technoware:decide-subject-tests` every ten minutes or the Send tab's "Decide now"; a campaign under test is still `sending` (2026-09-20).
- A resend is a copy whose audience is the original's non-openers (2026-09-20): `POST …/campaigns/{id}/resend {subject}`, `resend_of_id` unique so the one-resend rule is the index, the set re-filtered through `AudienceResolver::freezeFrom` and the health gate run before anything is written; `TrackingRewriter::unprepare()` puts a copy's links and pixel back, which `duplicate` had never done.
- A sequence step is a campaign row (2026-09-20, `docs/newsletter.md` "Sequences"): `sequence_id`/`sequence_position`/`delay_days` and status `automation`, hidden from the campaigns index and refused by `queue()`, so it has the editor, tracking, unsubscribe and a report for nothing; enrolment is once per subscriber per sequence (a unique index) from `SubscriberIntake`, the group screen or by hand; `technoware:run-sequences` every ten minutes sends, advances, completes or cancels — the scheduler, not a listener, because a delay is a date.
- Hardening, 2026-09-26: a Mailgun bounce `token` is accepted once (`Cache::add` after the signature); the CSV writer and reader use `escape: ''` (RFC 4180 — a backslash-quote smuggled a formula cell past `Csv::escape()`); an xlsx part inflates to at most 50MB and a reference past XFD is skipped; a typed IMAP scan is port 143/993 on a public host (`PublicHost`) and fails with one sentence, not the socket's words.
- A website crawl is a fourth import source (2026-09-28, `docs/newsletter.md` "Crawling a website"): `source = crawl` on the mailbox scan's row, job shape, review and commit (widened to `isScan()`, released per source — a mailbox release forgets the consent); `WebsiteCrawler` reads the start site to depth 0–4 and, in directory mode, each linked business's home and three contact-like pages, through `SafeHttp` only, obeying robots.txt (a refused page spends no page limit) at one request a second per host; `EmailExtractor` reads mailto, JSON-LD, Cloudflare's `data-cfemail` and the `[at]`/`[dot]` spellings, naming each address's business from its card's heading; Hunter domain searches come last within the plan's searches and are not in the verification ledger; the run's industry and location are `defaults` to `CsvImporter::run()`, and `industry_group` makes a group named after it; a scan's commit ignores the request's `mapping` (validation kept only `mapping.email`, so committed rows arrived nameless).

### Outgoing mail — `docs/mail.md`

The queue, the scheduler, transports chosen in Settings, email templates, acknowledgements.

- Mail leaves through the queue, and the three exceptions are deliberate.
- A queued failure is silent, and that is the trap the move introduces.
- The queue is drained by the scheduler, not a daemon.
- An empty queue is not evidence that anything is running, so the scheduler keeps a pulse.
- `MailSettingsProvider` applies when `mail.manager` is resolved, not at boot.
- A bare `queue:work` writes its own pulse on `Queue::looping`, and the panel says which pulse it saw.
- A test for that must set `queue.default` to `database`.
- If nothing is draining the queue, the send happens during the request instead.
- `delivering()` is the one existing definition, `sync` counts as draining, and the answer is memoised in the container, never a static.
- `sendNow` runs no job, so `QueuedMail::failed()` never fires — and `Notifier::guard()` writes `mail_error` for that reason.
- Campaigns are exempt structurally, not by remembering.
- A system email can be switched off, copied and re-addressed per message, and the three decisions live beside the wording without being it.
- The delivery switch is `shouldSend()` on the `Templated` trait, and nowhere else.
- Copies and the sender are applied before the wording's early return.
- Three messages are locked, and the flag lives in the catalogue.
- "Use this wording" could never be turned off from the console, and the fix for that was wrong the first time too.
- Reset clears the wording and keeps the decisions.
- Every enquiry now acknowledges the person who sent it.
- The recipient is found by field *kind*, never by name.
- Neither acknowledgement echoes the submission back, deliberately.
- If the scheduler stops, mail stops silently.
- Outgoing mail is chosen in Settings, and `MailTransport` is the only list.
- SendPulse is a preset SMTP, not a bridge: host and port fixed, only the login and the *SMTP* password asked for.
- Two of the three API bridges ship; SES does not.
- A transport can be stored that this server cannot build.
- Laravel's Mailgun factory reads `secret`; Brevo's transport reads `key`.
- A field two transports share must be rendered once, not once per panel.
- The mail test takes an optional recipient, and the body is what keeps it safe.
- `mail_error` exists because `Notifier` swallows.
- The OAuth redirect is compared to this site's callback path exactly — `CallbackPath::assert()`, one path per mailbox: `/admin/settings/mail/callback` for outgoing mail, `/admin/settings/tickets/callback` for the ticket mailbox, `/admin/newsletter/subscribers/import/mailbox/callback` for a subscriber scan, and none accepts another's.
- Google's SMTP scope is full mailbox access and there is no narrower one.
- A mail settings change takes effect on the next request.
- The `log` transport gets its own channel at `debug`.
- Every ticket notification carries `Auto-Submitted` and `X-Auto-Response-Suppress` (`MailHeaders::machine()`), piping on or off; the Reply-To points at the support mailbox only while it is being read (`InboundMail::replyTo()`), and the acknowledgement's closing line follows the same switch.
- Mail lines are text (2026-09-26): `Markdown::withSecuredEncoding()` in `AppServiceProvider`, so `[x](https://evil)` typed into a public form is not a link in the acknowledgement; a line that means a link is an `HtmlString` (`BackInStock`); `Placeholders::fill()` entity-encodes `[ ] ( ) !` too. A stored secret goes only where it was saved for: `mailgun_endpoint` is one of `MailTransport::MAILGUN_ENDPOINTS`, a new `smtp_host`/`inbound_imap_host` needs its password typed again in the same save, and both hosts are public on a mail port (SMTP 25/465/587/2525, IMAP 143/993).

### The website assistant — `docs/chatbot.md`

Retrieval, grounding, intake, the console. `docs/chatbot-architecture.md` is the design; this is the trap list.

- The website assistant is mounted beside `Analytics`, and for the same reason.
- Nothing retrieved means the model is never called.
- Two more retrieval rules, both measured and both about `grounded` rather than about the wording of an answer.
- The assistant's kill switch must be thrown from the console, not the database.
- Who is asking can change mid-conversation.
- `ChatJourneyTest` tests the joins, not the rules.
- The chat panel resumes a conversation, and for months it did not.
- `npm run audit` never sees the panel open.
- A message bubble is `[overflow-wrap:anywhere]` and the assistant's is a `div`.
- A scrollable region needs `tabIndex={0}`.
- Retrieved copy is fenced, because it goes into a *system* message.
- Four of the specification's five injections never reach a model at all.
- Retrieval is cached for five minutes and the products are not in it.
- Conversation summarisation is asked for by the specification and is not built, on measurement.
- The daily cap bounds the bill and nothing showed how close a day had run.
- The most useful screen in the module is the one listing what it could not answer.
- And since 2026-09-18 it can write the page: "Draft an article" on an unanswered group has the AI SEO assistant draft a `KnowledgeArticle` (`App\Support\Seo\Ai\ArticleBrief`, `POST chat/unanswered/brief`) with `[CHECK: …]` wherever a fact would go — the model is given no facts and told not to invent one — tagged `assistant-draft`, born `draft`, the group marked handled with its id. `docs/seo-ai.md`.
- The chat console is `role:admin`, and there is no way to edit or delete a transcript.
- Thumbs are offered on a grounded answer only.
- The assistant's intent detection is a word list, and two entries in it were wrong in ways only running it found.
- A chatbot lead is a lead, not a `chat_lead`.
- A `ChatConversation` is in the morph map.
- A chat action is stored on the message, not worked out when it is read.
- A brand in the assistant links to `/products?brand=…`, never `/brands/…`.
- The chat panel transitions `translate` and `scale`, never `transform`.
- The thread sits on `brand-50` and the assistant's replies are cards on it; measured open in both schemes, since the audit never sees it open.
- The intake has a judge (`IntakeJudge`, `chatbot_smart_intake`, on by default): with a key, the model reads each answer first — junk refused, a name lifted out, a mid-intake question answered with the step re-asked on the same message — and the PHP rules still have the last word; without a key or past the cap the machine is unchanged.
- The thread's ground is `chatbot_background` (`--chat-bg` / `--chat-bg-ink`, ink derived, blank = `brand-50`); the typing dots are `currentColor` so they read on it.
- The launcher's animation is `chatbot_animation`, eleven styles from `ChatSettings::ANIMATIONS` keyed by `data-chat-motion` on the disc while nothing has opened the panel; every one stops the same way and sits inside the reduced-motion guard.
- The widget's name, colour, icon, text size and name-on-the-launcher are public `chatbot_*` settings handed in by the layout as a `ChatLook` (`lib/chat-look.ts`); a chosen colour becomes `--chat-accent`/`--chat-accent-ink` with the ink derived server-side, and the launcher's hover glow is `.assistant-launcher:hover` in `globals.css`.
- The fence marker is stripped until nothing changes (a nested `---WEBSITE ---WEBSITE COPY---COPY---` made one), and the title and labelled fields sit inside the fence with the excerpt; only the label is outside (2026-09-26).

### SEO: structured data, scores and the AI assistant — `docs/seo.md`

`StructuredData`, `SeoScore`, `schema_type`, the overview screen and the suggest-only assistant.

- All JSON-LD is built in `App\Support\StructuredData` and rendered by `JsonLd`.
- Escaping stays at the sink and must not move.
- `schema` is gated on `withSchema()`, never on the route.
- Nothing in a graph is guessed.
- `LocalBusiness` is only ever emitted for a place.
- Every AI call goes through **OpenRouter** since 0.116.0 (`OpenRouterProvider`, the one `AiProvider` binding; setting `openrouter_api_key`, env `OPENROUTER_API_KEY`): model ids are OpenRouter's (`google/gemini-2.5-flash` the default, `openai/…` beside them) and a provider's models answer only when that provider's key is in the OpenRouter account (BYOK) — which is what "Test this model" on Settings → API keys proves, in OpenRouter's own words; `chatbot_model` and `seo_ai_model` are `integrations` rows drawn on that tab beside the key, so the key, both choices and the test are one screen. A 200 can carry an `error` object or no `choices`; both are failures. Gemini may fence its JSON, so `SeoAssistant::decode()` strips a fence. The `MoveAiToOpenRouter` upgrade step prefixes a stored bare id with `openai/` and deletes `openai_api_key`, never copying it.
- The AI SEO assistant suggests and never writes, and that is structural.
- It reuses the chatbot's provider rather than adding a second integration.
- Two trust levels go into one prompt and the difference is load-bearing.
- The catalogue in that context is derived, never typed.
- Links are selected from a numbered list of real pages, never composed.
- `AiModel` is the one allowlist here that does *not* fall back.
- `og_image_path` was scored for months with no field to set it.
- The SEO overview's Recheck does not `revalidatePath`.
- That endpoint still collects every record, and must.
- The Recheck button and the score it changes are in different `<td>`s.
- `schema_type` is a dropdown, and it now does something.
- `Product`, `LocalBusiness` and `JobPosting` have exactly one option.
- The allowlist is resolved on the way *out* as well as validated on the way in.
- The options are sent by the API, never listed in TypeScript.
- A SEO score is out of what *applies* to a record, never out of everything.
- Nothing in the score fetches the rendered page.
- A failed check and an issue are not the same list.
- A path in an API response that names a console route is not the API's own.
- Two record types carried `HasSeo` and were absent from `/admin/seo`.
- `StoreCategory` had no SEO capability at all, and the reasoning for that was wrong.
- The sitemap's `included()` filter had a real gap, under a comment that explained why it didn't need one and was wrong.
- A category's public index has to eager-load `seo` for `included()` to see it.
- Google Analytics 4 is read the same way (`App\Support\Seo\GoogleAnalytics`, 2026-09-20): the same service account through `GoogleServiceAccount`, `ga4_property_id` the one setting of its own, one report an hour for the overview's `analytics` column and `?analytics=no_views`, the store funnel's product views per window, `ga4_error` in Google's words, null never zero.
- Search Console is read, never written (`App\Support\Seo\SearchConsole`, 2026-09-18): a service-account JSON key in `integrations`, the account signs its own RS256 JWT (no SDK), one cached read an hour keyed by path for the overview's Search column and `?search=no_clicks`, one per page per hour for the assistant's "queries this page already appears for"; a Google refusal goes to `gsc_error` in Google's words and the column is absent, never a failed screen. `speakable` on every article and service graph names `h1` and `.lede`, so the lede every theme's hero renders is what an assistant may quote.
- A paginated listing carries a self-referencing canonical (`listingMetadata()` in `lib/seo.tsx`, `?page=N` on the canonical, "— page N" on the title) and a filtered view — a search term, a facet, a month — is `noindex, follow`; the sitemap's `lastmod` is each record's `updated_at` (every public resource carries it) and an index page's is the newest it lists, never the build time; `robots.txt` disallows every `noindex` route and names the AI crawlers as allowed on purpose; `/llms.txt` and `/llms-full.txt` are built from the API like the sitemap (`lib/llms.ts`); the `Organization` node carries `@id`, `sameAs` from Settings → Social and a `PostalAddress` parsed off the address's last line, and the API's `publisher` nodes point at it; IndexNow pings ride on `HasSeo`'s `saved`/`deleted` (`App\Support\IndexNow`, off until launch); the AI assistant runs in bulk from the overview (`POST seo/ai/bulk`, one queued job per record, `?ai=pending` the review queue). `docs/seo-audit-2026-09-18.md` is the audit these came from.
- Every content record can carry **answer blocks** (2026-09-21, `docs/aeo-geo-contract.md`, `docs/aeo-geo-samples.md`): `answer_blocks` on eleven entities through `HasAnswerBlocks`, nine kinds in `App\Enums\AnswerBlockKind` whose `heading()` is what the page draws them under, replaced wholesale like `faqs`, a draft never on the public read; FAQs widened to the same eleven owners; `EntityLinks::for()` builds the public `entity` block from *loaded* relations only, and `StructuredData::answerFaqs()` is the one `FAQPage` gate (never under two entries).
- `AeoScore` and `GeoScore` are the `SeoScore` shape — scored out of what applies, `failed[]` with a hint each — on every `/admin/seo` row as `{value, band}` and in full from the single-record read; `?aeo=`/`?geo=` filter by band, `?aeo_check=`/`?geo_check=` by one failed check (their own parameters: the three rubrics share `internal_links` as a key), `meta.site_score.aeo/.geo` carry the averages with their own `top_issues`, and the assistant's eight AEO/GEO actions (`docs/seo-ai.md`) suggest and never write — `improve_answer` needs a `block_id`, refused by bulk.
- Answer blocks are drawn on the page (2026-09-21, `docs/seo.md` "Answer blocks on the page"): `AnswerBlocks` groups the published blocks by kind under the API's `heading` — never a heading typed in TypeScript — as `h2` sections (definition a lede, `who_for`/`why` short sections, facts and features the checklist, use cases cards, comparison a two-column table, steps the numbered list, questions the FAQs' own `<details>`), with the FAQs **merged** into the questions group; `RelatedEntities` draws `entity` as "Related" collections; both mounted after the body on every detail page with the trait.
- **One `FAQPage` per page, and it is the API's** `faq_schema` (a sibling of `schema`, absent under two entries): `FaqList` emits none since 2026-09-21, and the landing page — the one FAQ-bearing record outside the contract — builds its own under the same two-entry rule; `knowsAbout`/`areaServed` on the `Organization` node come from `organization_knows_about`/`organization_area_served`, two JSON strings on the public `/settings` map; `/llms-full.txt` quotes each record's definition and its questions.

### Programmatic landing pages and places — `docs/landing-pages.md`

Brand × category and place × service pages that a thin page cannot publish; the locations tree.

- A landing page's URL is composed from records it does not own, so those records have to move it.
- The path constituents re-save one row at a time.
- `published_at` is stamped in the model, not the controller.
- A location's level is validated against the tree that will exist, not the payload.
- Places are a tree, and `state` is derived from it.
- The tree does not shape the URL.
- A cycle is invisible, so it is refused in validation.
- `location_service` and `location_solution` replaced a heuristic, and that is the most important change in the location half.
- Substance is never inherited up or down the tree.
- Programmatic landing pages exist, and the whole design is about refusing to make them.
- A landing page is `role:seo_manager`, not `content_manager`.
- `TextSimilarity` is shingles, not `similar_text`.
- `landing_pages.path` is the identity, and resolution is one lookup.
- `Sluggable` is not used on `LandingPage`, and that is not an oversight.
- Nothing seeds a location, and nothing should.
- The location half is proposed on a shorter leash than the catalogue half.
- `technoware:landing-pages` reports by default and never publishes.
- A refused publish saves nothing.

### Careers — `docs/careers.md`

Vacancies, applications and the one unauthenticated upload.

- The vacancies table is `job_openings`, and the model is `JobOpening`.
- A CV is the only unauthenticated file upload in the product.
- Deleting a job application deletes its CV.
- A closing date closes a vacancy by itself.
- Job qualifications and experience levels are lookup tables, not enums.
- A vacancy emits `JobPosting` structured data.
- A blank `location` means remote.
- The vacancy page (2026-09-21): a glance strip under the hero, the two lists as a pair of tinted cards, a sticky aside with the Apply button, and the application as a band beside "What happens next" and the other open roles; the summary stands in for an empty body.

### The blog — `docs/blog.md`

The front's arithmetic, category colours, seeding, comments.

- The blog's front is one 4:3 lead beside three 4:3 rows, and the two columns agree by arithmetic.
- The lead's title sits over the photograph on a gradient whose first stop is held.
- A blog category's colour is a hash of its slug into `--color-tag-1…12`.
- `BlogPostSeeder` creates and never overwrites a written post.
- A blog comment is never published by anything but a person, and never filed as spam by anything at all.
- A control that fills on hover is never `bg-card`: the public site's card-ground rule paints a gradient *image* over that class, so a hover `background-color` sits under it — the category pills went white-on-white on hover (Summit, 2026-09-27) until they took `bg-(--color-card)`.
- The post form carries Featured, Comments and Categories (2026-09-28): the API had accepted `is_featured` and `category_ids` all along and no screen sent them, and `UpdateBlogPostRequest` had no rule for `comments_enabled`, so a post's comments could be set only when it was created. Categories go as the whole ticked set (`[]` files the post under none); `comments_enabled` is read as `!== "0"`, so a submission without the control never closes a post's comments.

### Brands, categories and the company profile — `docs/catalogue.md`

Real logos, the refresh discriminator, category images, service categories, and the three index-page entities.

- The company profile is three index-page entities, and what they do not have is the point.
- The catalogue now carries real manufacturer logos, and that is structural data, not demo content.
- The discriminator for "safe to refresh" is the stored path, not a flag.
- Vendored logos are sanitised on the way to disk like any upload, and `BrandCatalogueTest` plants a `<script>` to prove it.
- HPE Aruba's colour was one `<style>` block away from being lost.
- `BrandResource`'s `logo` carries `?v=<updated_at>` because a real logo replaces a placeholder at the same path.
- New brands need a product before they are visible on the public site.
- The six seeded clients carry sample logos from Freepik (2026-09-21): `resources/client-logos/{slug}.png`, filed by `applyClientLogo()` on the brand-logo rule — written only while the stored path is still the seeder's own — with the Freepik attribution in the docblock.
- A product category carries an `image_path`, the same shape as a solution's `hero_image_path`.
- A brand logo's real colours only read against a light ground, so dark scheme turns every one of them into a flat white silhouette rather than pinning the strip's background to always be light.
- Hardware is compared side by side, and the tray lives in `sessionStorage`; `COMPARE_MAX` sits in a directive-less module because a client module's constant reaches a server component as a reference.
- Services are grouped by **service category** (2026-09-29): taxonomy with no status, page or SEO, `service_category_id` `nullOnDelete`, a picture per service from the library; `GET /service-categories` sends active ones in order, and `ServiceCatalogue` draws them as tabs (one group: a plain `Collection`) on the homepage in every theme and on `/services`, services in no category last as "Other services" — the static web-services grid is gone.
- A category's `image_background` stamps `data-tile-bg` and one `globals.css` rule turns a pictured tile into the picture over an opaque `--color-scrim` foot; the category is not `Sluggable` (its slug is a tab fragment, and a 301 under `/services` would move a service's URL); a save purges `services`.
- A service's `highlights` (2026-09-29) are the chips on its card — the static grid's old `note` as a JSON list, at most six of forty characters, tidied by the model on every write — drawn as `[data-tile-tags]` in the tile's meta, washed in `--tile-hue` while the words keep the meta's ink.

### Menus — `docs/menus.md`

Four locations, record references not URLs, the flat builder, rebuild.

- The site's own index pages are a target type, because they are not records.
- A section stores no morph, and that is not tidiness.
- `technoware:seed-menus` exists because the first screen was the obstacle.
- What a seeded footer costs: three columns stop tracking the catalogue.
- A menu is cached for 600s, so edit it in the console and not in the database.
- The menu builder's rows wrap, and the screen had never been audited.
- A menu item resolves its icon and summary from the record too, not just its href.
- A menu item stores a record reference, never a URL.
- Menus nest three deep, and the cap that went was a *rendering* cap.
- `MAX_DEPTH` is now the only limit, and it is a decision about navigation.
- `Menu::tree()` fetches every item in one query and joins the parents in PHP.
- Validation generates its rules to the depth submitted.
- The builder's indent stops at six levels and then shows the number.
- A menu is written wholesale, which is why it needs no cycle check.
- An unassigned location is a 404, not an empty menu.
- An item whose record is gone is dropped, never rendered dead.
- The builder is a flat list with a depth per row, not a nested drag target.
- There are four menu locations, and one of them renders one level.
- The bottom bar is flat deliberately, and `depth()` says so.
- A top-bar item with children opens a tabbed panel, and the top bar used to be counted flat too.
- A custom item with no address is a heading, and it needs items under it.
- The drawer keeps a panel-bearing item whatever its href.
- And it is kept as a heading, with the buttons' links pruned from under it; a nested list starts under its parent's label.
- The top bar's panel follows `menu_style` like the mega menu and every theme restyles it: `TopBarPanel` takes the same `MenuPanelStyle` — `simple` a 300px grouped list, `semi` 520px with pill tabs across the top, `mega` the 760px tabbed sheet, `big` the width of its widest tab's cards (every pane rendered, the inactive ones at zero height) in 260px slots that wrap at the viewport — stamps `data-topbar-style`, and each `theme.css` carries a `[data-panel="topbar"]` block. Only the height ever follows the count.
- "Open in a new tab" reaches every renderer through `newTabAttrs()`; `toItem` dropped `new_tab` for months while only the footer's mapper carried it.
- A bar's chrome is not its navigation, and an assigned menu must not be able to delete it.
- The top bar's links appear twice and only one copy is the bar.
- All but the last link is hidden below `sm`.
- Two exhaustive-over-two ternaries were silently wrong the moment there were four.
- `saveMenuAction` called `updateTag("settings")` under a comment about the navigation being on every page.
- The bottom bar's default points at the policy *pages*, not their URLs.
- Verify a menu change by renaming an item through the console and reading the public page — asserting the default links is vacuous.
- A `section` item whose page is empty — team, clients, certifications, careers, case studies, blog — is dropped at render by `SiteSection::hasContent()` and returns when the first row is published; the seeded footer's Company column carries Our team, Clients and Certifications now.
- `menus`/`menu_items` were in the Phase 1 schema; the migration that made them usable is an alter, not a second pair.
- Services open to their categories (2026-09-29): Services → each service category (a `service_category` item, linking to its tab `/services#<slug>` while active) → its services, uncategorised last under "Other services"; the built-in panel groups through `lib/service-groups.ts`, `DefaultMenu` writes the same on a rebuild, and an existing assigned menu keeps its flat list until Rebuild. `MegaMenu` gives `h-full` only to an entry without children; a row below the first draws `MenuItem.glyph`, a 16px `IdentityIcon` in its hue.
- A `catalogue` item is a live list: a key from `CatalogueList`, expanded at render into what is published and `show_in_menu`, heading linked to the index, nothing nestable under it; the rebuilt footer's three columns are these, so the footer tracks the catalogue (2026-09-20).

### Popups — `docs/popups.md`

Targeting, matching in the browser, the seen rules, the audit's dismissal.

- A popup is a picture, a message, or both, and "neither" is refused on `body`.
- A popup has no slug at all.
- Sections are expanded into path patterns in `Popup::matchPatterns()`, so `SiteSection` never crosses the wire.
- The match is in the browser because a layout has no pathname.
- `site-popup.tsx` closes the dialog from an effect *cleanup*, not from an effect keyed on the pathname.
- "Already seen" fails closed.
- It is marked seen when it opens, not when it is dismissed.
- MySQL cannot default a JSON column at all.
- The popup opens with focus on the `<dialog>` itself, not on its close button.
- The close button's disc is opaque, and that is the third time this has been written down.
- The disc sits on the card's corner, a third outside it, at 60% opacity until pointed at — element opacity, colours still solid; a sibling of the card because the card clips.
- A published popup made `/checkout` unauditable, and the audit had to learn to dismiss one.
- The popup's picture is `loading="eager"`, never `priority`: it becomes the largest paint when the dialog opens, and lazy there is a dev LCP warning that fails the audit on every targeted page.
- A popup opens on a delay or on exit intent (`trigger`, `PopupTrigger`): the pointer leaving through the top edge, measured as `mouseleave` on `<html>` with `clientY <= 0`; a device that cannot hover falls back to the delay, and `popups.trigger` is a MySQL reserved word that only Eloquent's quoting makes safe.
- The exit listener removes itself the first time it fires — a timer fires once and a pointer leaves a page all afternoon, and left attached it reopened a "once per visit" popup on every exit after it was closed. The probe targets `/about` alone, because only the first matching popup ever opens and a real one on `/` hid the probe's.

### Sliders and galleries — `docs/sliders.md`

Transitions, layouts, captions, the crossfade rules, the lightbox.
- Cylinder and Ripple are the fifth and sixth slider layouts (2026-09-24, after Vengeance UI, MIT, re-drawn): the cylinder places cards with the `transform` function list (`rotateY` then `translateZ` — the individual properties compose the other way) and turns the ring with the `rotate` property one card per step on an unbounded counter; the ripple draws each change with raw WebGL from same-origin `/_next/image` textures (an API-origin image taints the canvas) over the real `<img>`, crossfading without WebGL, on reduced motion or for an SVG. Short sliders fall back to a banner, the cards/fan convention.

- A gallery's transition is a per-gallery setting, and the list is the API's.
- The transition keyframes write `transform`, and must not be mixed with Tailwind's utilities.
- A slider has the same four transitions and a different default, because it was never blank the way a gallery was.
- Stacked cards is a `layout`, not a `transition`, and it is its own component.
- A slide's words arrive by a setting of their own, and the caption is re-keyed to replay it.
- A crossfade is one slide animating in over another that does not move, and three flickers were measured before that was the rule.
- `Slider` picks between two entirely different rendering mechanisms, not four variations on one.
- A slide's image field says how big to make the picture, because `object-cover` cannot tell an editor that on its own.
- `fade` and `zoom` need something opaque behind the photo they are fading in, or the fade reads as a flash of the page.
- A gallery's tabs are a table, and an item names one by slug.
- Renaming a tab has to carry its pictures with it.
- A caption over a photograph cannot be made safe, so the gallery puts it underneath.
- A caption's phone gutter clears the arrows, which only the **middle** row can touch: `px-12` there and `px-4` elsewhere, and the block is `w-full` below `sm` — a flat `px-14` on all nine anchors left a 198px text column at 390px (2026-09-23).
- The gallery renders no heading of its own.
- Its lightbox does not go through `Modal`, and that is a decision.
- The lightbox's autoplay is an override, not a copy.
- A slider has no URL, so it must not use `Sluggable`.
- Deleting `homepage-hero` or `store-hero` is two steps, and the second is `confirm` on the DELETE — `Slider::RESERVED`, 422 without it; the hero was deleted in one press on 2026-09-17 and its slides came back from the binlog.
- `loading="lazy"` inside a scroller defers the slide nobody has reached yet, which is every slide but the first.
- The slide placeholder sits under the media, not over it.
- The lightbox is a flow — the current picture square-on, the neighbours turned away and blurred by offset, a thumbnail strip under it — and the gallery's transition says how the move is drawn (`slide`/`zoom` the placement, `fade` the opacity, `none` nothing).
- Fanned photos is the fourth slider layout (`SliderLayout::Fan`, `fan-slider.tsx`): cards placed by offset in perspective and faded with distance, the words under the picture, a pill of arrows and dots; every card is one element type, or the card becoming current remounts and does not animate.

### The media library and uploads — `docs/media.md`

Upload paths, limits, the SVG sanitiser, in-place edits, the bin, alt text.

- An SVG is a document, so the media library sanitises one on write.
- `api/public/.htaccess` sets `nosniff` on everything and a sandbox CSP on `.svg`.
- `CoverField` takes a `fit`, and the default is still `cover`.
- Every upload in this product goes through a Server Action, and Next caps a Server Action body at 1MB.
- The effective upload limit is a *minimum* across three ceilings.
- Every upload shows a real percentage, and the mechanism is a route handler plus `XMLHttpRequest`, never a Server Action.
- A form-mode `FileDrop` renames nothing.
- The measured bar reads "Processing…" at 100.
- Two drop zones must not both handle one drop.
- An upload loop needs try/finally.
- An absolute API URL cannot be an `<a href>`, and the failure is a 500 rather than a 401.
- Ticket attachments had never worked from the interface, and nothing could have caught it.
- Both attachment route handlers call `lib/stream-attachment.ts`; the two *endpoints* they ask stay two, because the portal's checks ownership and refuses internal notes and the console's must not.
- A media URL carries `?v=<updated_at>`; a path never does.
- An in-place edit archives the previous bytes *before* it runs.
- Deleting a media file fills a bin and keeps the bytes.
- A bulk route must be declared above `media/{id}`.
- GD sets two traps and both are invisible in a screenshot.
- The media library's right-click menu is not the only way in.
- The grid is worked from the keyboard, and it has one tab stop — arrows, Space, Enter, Delete, `x`.
- Uploads are multi-file and drag-and-drop, and both go through one `UploadProvider`.
- Resize is raster-only, and the UI says so before the request.
- Image alt text is a property of the file, not of the page using it.
- So is the focal point (2026-09-20): `media.focal_x`/`focal_y`, both or neither, null is the centre; `MediaMeta` (was `MediaAlt`) hands every resource a `*_focus` beside its `*_alt`, and `lib/focal.ts` makes it `object-position` — it only ever moves the crop, and an unset point renders byte-identically to before.
- And the assistant can propose it: "Suggest alt text" in the Edit dialog (`App\Support\Seo\Ai\AltText`, `POST media/{id}/alt-suggest`) sends the picture as a `data:` URL to a vision-capable model and puts one sentence in the field for the editor to edit; raster only, under 4MB, suggest-only.
- Deleting a media folder does not delete its files.
- Every image preview is the same control, and it has no options.
- A `CoverField` needs the URL, not just the path.
- A form-mode `FileDrop` takes a paste, lists rows and appends (2026-09-21): `paste` listens on the surrounding form for `kind === "file"` items and renames the clipboard's `image.png` to `pasted-<stamp>.png` (the file's name, not the field's); every file is a row with a thumbnail, the size and a 24px remove, keyed by an id given on arrival; a pick, a drop and a paste each *append* and the hidden input is rebuilt through `DataTransfer`; `max`/`maxBytes` restate the API's caps from `lib/ticket-attachments.ts`; the list empties on the form's `reset`. A thumbnail's object URL is made and revoked in one effect and written straight to the `<img>`. `scripts/probes/ticket-paste.mjs`.
- Files sent with the ticket itself hang off `tickets`, not a message, and were drawn on neither ticket page until 2026-09-21.
- A replacement carries the upload's `mimes:` check and stores the detected mime, never the client's `Content-Type` (2026-09-26).

### The rich-text editor and CMS pages — `docs/editor.md`

Summernote, the purifier allowlist and `Prose` — three files that must agree.

- Two utilities at the same specificity are decided by load order, and Summernote always loads second.
- Summernote's own stylesheet loads after `globals.css`.
- CMS pages have two templates and the value is allowlisted.
- The editor is Summernote, and three files have to agree about what it may produce.
- The toolbar is the full set, and the two omissions are audit rules rather than taste.
- `styleWithCSS` is off, and turning it on is the trap.
- `HTML.TidyLevel` is `heavy`, and the shipped default would store `<font>`.
- Inline style is an allowlist of *properties*, not an open door.
- A video is an iframe, and the host check is what makes that safe.
- `isBlank()` has a list of elements that *are* content.
- An image in a body goes to the media library, never into the body.
- A custom Summernote button must be given `container`.
- Summernote's dialogs are moved to `<body>` by `dialogsInBody`.
- Summernote ships a light-only stylesheet and the console has a dark scheme.
- Rich text becomes plain text through `HtmlSanitiser::toText()`, never `strip_tags`.

### The console's chrome — `docs/admin-console.md`

Role-filtered sidebar, the settings strip, the activity log, dashboard charts, client errors.

- The sidebar is filtered by role, and the filter is not the access control.
- Filtering the sidebar forced the landing to be decided too.
- A section that mixes roles is a section that cannot be ordered, and "Site" was the only one.
- `scripts/probes/nav.mjs` prints the sidebar per role — measure it, do not reason about it.
- Below `lg` the sidebar is a full-width block behind a drawer toggle (it was a horizontal strip once, and seventeen unlabelled slivers); `npm run audit:mobile` still says whether a new section fits.
- Blog and Careers are sections too, and Careers is the one that spans two roles.
- A group with exactly one visible child renders as that child.
- The settings screen had the same disease one level down, and a wrapping strip is why nobody noticed.
- Settings holds only what the whole console shares; every module's own groups are a "Settings" row at the end of its sidebar section (2026-09-20) — ten screens, one `SettingsForm`, one `GET/PATCH /admin/settings`, all `role:admin`. `SCREENS` in `settings-copy.ts` is the only list: the sidebar rows, each screen's tabs, the palette's entries and `ORDER` are derived from it, and `SettingsScreensTest` reads it against the seeder so every group is drawn on exactly one screen.
- Tickets, Customers, Leads and Campaign are groups for that reason; a role that sees one row still gets one link (`navFor` flattens), and an administrator's collapsed group carries the summed "new since" count.
- The sidebar lights the **longest** matching row, the rule `screenRole` already used (`nav-match.ts`, shared by both) — never add `exact` to a section's root row to fix a double highlight: `screenRole` would then match no row on that section's detail pages and drop their role gate.
- `revalidateSettingsScreens()` is what a settings action calls, never `revalidatePath("/admin/settings")` by name — the mailbox panel lives on `/admin/tickets/settings` now and the old line refreshed a screen nobody was looking at.
- Every panel still stays mounted, and grouping the strip must never change that.
- The activity log records by rule, not by a list of routes.
- Nothing writes a credential into it.
- It is append-only and there is no delete endpoint.
- An activity subject must be in the morph map.
- Sign-in is recorded at the call site, not by the middleware.
- A bar sized against the peak is a shape, not a quantity.
- The ticket volume is two smooth curves with a gradient under each (2026-09-23): SVG with `preserveAspectRatio="none"` and `vector-effect="non-scaling-stroke"`, colours as `var(--color-info)`/`var(--color-ok)` in the gradient stops, a Catmull-Rom tension that never bows past the days it joins, and every label still HTML — the rule about SVG text is about **text**, and a curve cannot be drawn out of divs.
- The console's tile figure and its corner glyph step down one rung below `sm` (26→22px, 32→24px), and "Sign out" is `IconSignOut` there with `aria-label` carrying the name — the words wrapped to two lines in a row that had already given up the account link and "View site" to fit 320px.
- `resolved_at` is stamped on arrival and cleared only by a reopen.
- A chart bar and a badge for the same word share one map.
- Client errors are grouped by fingerprint, and resolving one is a tick that re-opens itself.
- A dashboard tile is a link to the list that produced its number, filtered the way the API counted it.
- Ticket volume is two smooth curves rather than sixty bars (the client, 2026-09-23): SVG with `preserveAspectRatio="none"` and `vector-effect="non-scaling-stroke"`, `var(--color-info)`/`var(--color-ok)` in the gradient stops so nothing is a hex, and a Catmull-Rom spline at a sixth-of-the-span tension so the line never bows past a value nobody recorded. **The labels stay HTML** — the hero diagram's rule: SVG text scales with the viewBox.
- The console keeps its dense desktop scale and steps one rung down below `sm` (the client, 2026-09-23): the stat tiles' 26px figure and 32px corner glyph, sized for six across, shout across a card the width of a 390px screen. "Sign out" is `IconSignOut` below `sm` with the words from `sm`, `aria-label` on the button either way — two words wrapped the header to a second row at 320px.
- The volume chart takes a period (the client, 2026-09-24): `?volume=` on `/admin`, links rather than a client toggle so the page stays server-rendered, buckets chosen by the API (`TicketMetrics::VOLUME_PERIODS` — days, weeks, weeks, months) and cached per period; the tiles stay on thirty days. An icon picker is a one-row field whose grid opens in a `Modal` — never ~130 tiles inline on a page (same day).
- A column heading sorts, and it is a link — `SortTh`, `?sort=`/`?dir=`, allowlisted per list by `ListSort`.
- The ticket queue has a selection bar, and the selection is a module-level store read through `useSyncExternalStore`.
- Ctrl/⌘ K opens a command palette, and its pages are the sidebar's rows plus every settings tab and every setting (`settingsPages()`, from `settings-copy.ts`; `?tab=` opens the panel and `#setting__<key>` scrolls to the field, with `scroll-margin-top` for the sticky header); records come through `/api/admin/search`.
- The sidebar and the tab's title say what arrived while the console was open — `new-since.tsx`, one poll a minute, null for a role that cannot open the screen.
- The screens are guarded by role too: `proxy.ts` overwrites `x-pathname` on every `/admin` request (its own matcher entry, prefetches included), and `requireScreen()` (`lib/admin-screen.ts`) — called by the `(app)` layout **and every page**, because a layout is not re-rendered on a client-side navigation and the browser's router state decides which segments are — decodes it (`screenPath()`), refuses a missing one, asks `screenRole()` and sends `/admin` to `landingFor()` or answers 404; the API still refuses the data regardless (2026-09-20, per page 2026-09-26). A new console page starts with `await requireScreen();`.
- Outgoing webhooks (2026-09-20, `docs/admin-console.md` "Webhooks"): `Webhooks::emit()` is guarded like `Notifier` and never fails the request, takes a closure so the payload is built only when a hook is subscribed, writes one delivery per hook and dispatches `DeliverWebhook` after commit; five attempts with backoff, `X-Technoware-Signature: sha256=` HMAC over `timestamp.body` on the exact bytes sent; the secret is shown once on create and on rotate and never read back; https only and no private host; emitters are model hooks except `order.placed` (from `Checkout`, after the lines exist) and `customer.registered`; deliveries pruned at 30 days.
- The header's palette trigger is hidden below 360px (2026-09-21): the account row is 332px in a 320px screen's 304, and every console screen scrolled by 8px.
- The Bin tab is `IconBin` with a lid that lifts on hover and stays open on the bin view (`.bin-tab`, `transform-box: fill-box`); deleting a folder asks for `YES` typed (2026-09-20).
- Every entity form that carries answer blocks ends on an **AEO** tab (2026-09-21, `docs/aeo-geo-contract.md` §7): `AeoGeoPanel` (the two readiness scores from `GET /admin/seo/{type}/{id}`, "Not scored yet" when absent, plus the assistant scoped to `AEO_ACTIONS` — the keys are the contract, the labels the API's, an unknown action is drawn nowhere), then `AnswerBlocksField` (kinds from the entity's own index's `meta.answer_block_kinds`, hidden JSON `answer_blocks` replaced wholesale like `faqs`, the row key never in the markup or it is a hydration error), then `FaqField` where FAQs are new; Apply reaches the repeaters through `tw:answer-blocks-suggested`/`tw:faqs-suggested` on the form, as drafts. `/admin/seo` sorts and filters on `aeo`/`geo`. `docs/admin-console.md`.
- **Improvement suggestions** sit under each readiness score, in two layers (2026-09-21): the rubric's own — every failed check with its weight and the hint that would earn it, always — and the assistant's "Suggest improvements" (`aeo_analyze`/`geo_analyze`, drawn inline as summary, gaps, what to do, what is already strong; the newest stored analysis on load), only while the assistant is on with a key. The run goes through `AiSeoPanel`'s handle (`ref.run`, `onReady`/`onHistory`/`onSuggestion`) so there is one run, one cap counter and one history, and a quiet run opens no dialog. "Improve an answer" carries a picker of the record's *saved* blocks and posts `block_id`; a row added this session has no id and is not offered. The overview's site card draws "AEO — biggest wins" and "GEO — biggest wins" beside the SEO strip, each chip `?aeo_check=`/`?geo_check=`.
- The portal's ticket thread is a chat (`components/portal/ticket-thread.tsx`): staff on the left with an initials disc, the customer on the right, stacked below `sm`; a staff reply carries five radio-button stars and a report form (`reply-verdict.tsx`, optimistic value with no prop-to-state effect), and a quote glyph that announces `tw:quote` for the reply form to prepend `> ` lines. The verdict lives on the message row (`rating`, `report_reason`, timestamps); only a visible staff reply on the customer's own ticket may be judged, 404 otherwise; the queue filters `?reported=1` and the console shows the stars and the reason under the reply.
- A webhook's host is resolved at send time, every answer must be public, and cURL is pinned to the checked addresses (`CURLOPT_RESOLVE`); a redirect is a failure (`withoutRedirecting()`); on write, a host written as a bare number (`127.1`, `0x7f.0.0.1`) or `::ffff:` is refused. `App\Support\Net\PublicHost` is the one definition, shared with the mailbox scan and the mail settings; tests bind `PublicHost::RESOLVER` so none resolves DNS (2026-09-26).

### The public site's chrome — `docs/site-chrome.md`

Header, footer, banners, the logo cap, phone-width reversals.
- The footer's social links are flip tiles by default (`social_style` `flip`|`dock`, `social_flip_word` of up to 7 letters that sets the tile count — a letter past the last profile is a non-link tile, 2026-09-24/25): letters that turn to the icons on hover or focus-within via the CSS `rotate` property, icons shown outright where nothing can hover, an opacity swap under reduced motion. Reddit is the seventh profile (`social_reddit`, `IconReddit` drawn here; `#FF4500` on the footer 5.39:1, `#D93A00` behind white in the blog sidebar, 4.61:1).

- The site header's desktop nav appears at 1280px, not 1160.
- The footer's newsletter signup is a band, not a column widget.
- The signup's motion is CSS: `translate` on the arrow, one finite heart keyframe inside the reduced-motion guard, no jQuery or GSAP.
- Every first- and second-level page opens on a section banner, and the contrast is a ceiling rather than a hope.
- A height cap on the logo bounds nothing horizontally, and the header has no room to spare.
- The logo's box is reserved from the file's own dimensions, which the API sends.
- The blog's category strip wraps below `sm` and the footer's link columns sit two abreast below `lg` — both reversed on measurement.
- The announcement bar — "Info bar" in the console, `announcement_*` in the settings — has its window decided by Laravel (`announcement_live`), never by the browser's clock.
- Info bar is a screen of its own, `/admin/info-bar` under Site beside Popups, and the `announcement` group is filtered out of the settings strip: it was a sidebar row *and* a settings tab for a day, and two doors to one form is one too many.
- Its stops paint the same in both schemes and one ink is pushed until it clears 4.5:1 on every stop — `announcementBand()`, gated by `npm run themes`.
- Its ticker is the brand marquee's CSS with the gap on the item; only the first copy is real, every repeat is `inert`, and the fade mask sits on a wrapper so it cannot fade the buttons.
- Its third style is `vertical` (2026-09-23): one line at a time rising from the bottom, split on `<br>` and `</p><p>` by `announcementLines()`, held `1.4s + chars/15` (3–9s), paused on hover, focus and a hidden tab. It is a **client island** because each line's in/hold/out are percentages of one keyframe and those depend on how many lines there are, which CSS cannot take as a parameter; the stack is `aria-hidden` with the whole message rendered once `sr-only` beside it. The rise is `--duration-drift` (900ms), the fifth duration token and the only one that times motion nobody asked for.
- The band is 24px on a phone and 27px from `sm` (the client, 2026-09-23), with 12px type below `sm` and both discs at 24px — the tap-target floor, which is what stops it going slimmer.
- **Every style is one line**, and the two that are not the rotator join the lines with a middot: a `<br>` breaks a line even under `white-space: nowrap`, so one message drew 66/33/24px across the three styles until they shared `announcementFor()`'s split.
- Closing it is a fingerprint in `sessionStorage`, hidden before paint by the root layout's script and removed by `useSyncExternalStore`.
- `embeds` is the one settings group stored raw: `reviews_embed` (read for its Elfsight app id and drawn as the `reviews` homepage section) and `body_code` (`custom-code.tsx`, scripts rebuilt so they run), public so the site renders them, `role:admin` to write, never sanitised by design.
- Every dropdown fades in — a first open and a move between two alike, over `--duration-base`, opacity only (the client, 2026-09-27: the instant swap read as a flicker; the utility bar's panels included). The panel being left goes at once by the `:has()` rule at the end of `globals.css`, so a swap is one panel fading in, never two fading over each other; the `data-panel-swap` stamp and `markPanelSwap` are gone. `scripts/probes/menu-switch.mjs` reads the running transitions.
- Every paragraph on the public site runs to its container (the client's decision, 2026-09-16): `.public-site .measure` is uncapped and `Prose` has no cap; the console keeps 92ch, and centred bands, footer columns and captions are layout widths that stay.
- The homepage figures take `stats_colour`/`stats_size`/`stats_animation` (Site → Settings → Homepage) through `lib/stat-look.ts` and `components/ui/stat.tsx`; the chosen hex is pushed to 4.5:1 per ground, the fallback is the palette's brand, a stat line's third column names an icon, and `SupportBand` reads `support_stats` at last. The "Why Technoware" block's words are `why_*`/`testimonial_*`/`amc_*` in the same group (2026-09-21); the three `testimonial_*` rows had been seeded and labelled with nothing reading them. The two stat rows are edited as inputs per figure (`stats-field.tsx`) composed back into the same `value|label|icon` lines, so the wire format never changed; the figure is `StatValue`, which reads `data-stat-animation` off the row's container and counts up, rises or flips once on first view, server-rendered final, still under reduced motion.
- Every figure that stands for something counts up on first view through `components/ui/count-up.tsx` — case-study results, category product counts, the catalogue and search totals, blog category and comment counts, reading times, the theme readouts — written to `textContent` over the server-rendered final figure, once, still under reduced motion; never a price, a date, a phone number, a reference or a slide counter. `stats_animation` ships as `count` for the same reason (2026-09-18).
- The classic hero fits the first screen from `lg` on any viewport under 820px tall: its padding halves there (`lg:[@media(max-height:820px)]:pt-10 …pb-12`), measured from 75px past a 1280×720 to 13px inside it. A stacked phone hero is not asked to fit.
- The shop's category discs are 88px with 58px icons so a corner-filling 3D icon stays inside the ring, with the launcher's glow in the brand colour on hover; the rail's `overflow-x-auto` clips on the cross axis too, so it carries `py-8 -my-8` or the ring and glow are cut flat along the top.
- Its message goes through the `inline` purifier profile — no colours, no headings — and `activation_procedure` now goes through `cms`, which it never had.
- The share row's marks take `--color-social-*` under the pointer only, through `--share-hue` per link (2026-09-21); at rest they stay `text-muted`, where the audit reads. The logo is 31px/128px under `sm`.

### Motion — `docs/motion.md`

Reveals, page transitions, the loader, the splash, the aurora, the beam, the marquee.

- The mega menu's rise had never animated, and the panel used to vanish on close.
- Every `<dialog>` enters and leaves through one class, `dialog-motion`.
- An auto-advancing carousel has a visible Pause button, and the marquee has a toggle.
- Every public card carries Velora's border beam on hover and keyboard focus only; the earlier CSS `.border-beam` and its always-on featured mode are gone (0.47.0).
- Velora's components live under `components/velora/`, and each file says what changed from the registry item and why.
- A reveal style's start state must be `:not([data-aos-animate])`.
- Page transitions are not a `template.tsx`, because a template is keyed on the layout's *immediate* child segment.
- The route-change loader starts from the router's own word, never from a click.
- The first-visit splash is never in the server's HTML as anything but `display: none`.
- The splash shows a loader in the theme's idiom, never the logo (`splash-loader.tsx`, nine of them, CSS under `[data-loader]` beside the splash's own rules): the client's verdict was that a logo reads as a page stalled on its own header.
- The aurora backdrop's opacity is derived per theme, and the audit cannot see it.
- A doubled marquee track needs its gap on the item, not on the parent.
- A raw coordinate jumping at a loop boundary is not itself the defect.
- The cart badge bursts every eight seconds until it has done its job, and the stop lives in `sessionStorage`.
- Nothing arrives at full opacity in the frame it was asked for (2026-09-20, `docs/animation-audit-2026-09-20.md`): four arrival classes in `globals.css` — `settle-in` (inline Alert, tab panels), `rise-in` (compare tray, new-reply pill, cookie banner), `popover-motion` (both search listboxes), `unfold` (the drawer's section) — plus `::details-content` on the FAQ and a `.98` press on `.btn`; arrival is `@starting-style`, leaving is `[data-leaving]` stamped by `usePresence()` (`lib/hooks/use-presence.ts`), which keeps a conditional render mounted for `--duration-exit`; the console is untouched by design, and the command palette, the sidebar accordion and count-ups on figures were rejected, not forgotten.
- Page transitions (0.115.0, `docs/motion.md`): `motion_page` `crossfade`/`slide` are React `<ViewTransition>`s that `PageEnter` renders only for those two ids, named per pathname (`tw-page-<hash>`) so a navigation is an unpaired old and new page, never a morph that glides by the scroll offset; the sticky header is lifted out as `tw-site-header`; `pointer-events: none` on the overlay and none of it under reduced motion. A Cover hero's video is a client island over the picture, which stays the LCP and the poster (no `poster` attribute); it plays only with motion allowed and no Save-Data, and always carries a Pause button.
- Scroll-driven motion (0.114.0, `docs/motion.md` "Scroll-driven motion"): a section's `style.headline` (rise/wipe/shimmer, on word spans `SectionHead` always renders) and `style.scroll` (parallax inside `data-frame` clipped frames only, zoom down from .94, fade) and the `motion_progress` bar are CSS scroll timelines inside both the no-preference and `@supports (animation-timeline: view())` guards — a range stagger, never a delay; shimmer uses `-webkit-text-fill-color`, never `color: transparent`; presets live in `lib/motion-presets.ts` and never touch the splash.
- Every builder and homepage section can choose how it arrives (2026-09-27, `docs/motion.md` "A section's own reveal"): `SECTION_REVEALS` in `lib/motion-choices.ts` — Default, Rise, Fade, Zoom, Drop, Assemble, Cascade, Focus, Unfold, None — each a `data-aos` value, so the site-wide style still shapes it; Assemble and Cascade stagger a section's *pieces* by `animation` with a `from`-only keyframe (never a transition, which would replace a tile's hover), Unfold's clip lives only in its animation (a section clipped to nothing never intersects), and the site-wide list gained Assemble, Cascade and Unfold (`scripts/probes/section-reveal-styles.mjs`); shape-checked by the API (`ThemeOptions::REVEAL`), resolved by `sectionReveal()`; Default is the type's old behaviour and is never stored, an opening hero never animates, a homepage section's default is None; nothing chosen is byte-identical markup.
- The product page's "Add to basket" is four stages that flow (2026-09-21, `components/store/add-to-basket-button.tsx`, `.add-basket` in `globals.css`): the cart rides an absolute track as wide as the run between the outer slots so `translate: 50%`/`100%` are the centre and the right slot, the pill's `overflow: hidden` keeps that track out of `scrollWidth`; the success stage is a `<Link>` and the swap between the two elements is `@starting-style`, gated on `data-from="added"` so a cold load never fades from green; the stage looks sit outside the reduced-motion guard and every transition, keyframe and starting style inside it. `scripts/probes/add-to-basket-motion.mjs`.

### Theme generation — `docs/theming.md`

Five colours to every token, dark neutrals, fonts, the contrast gate.

- `npm run themes` checks 30 palettes — 15 presets, the one legacy ramp and 14 hostile inputs, each in both schemes.
- A theme is generated from five colours, and a typed hex is hue intent, not a literal.
- Dark neutrals are derived from the theme's own hue, and for months they were olive whatever the theme.
- Secondary and Accent drive a defined starting set, and the blurb says so.
- Fonts are the nineteen vendored faces, chosen by id.
- A fluorescent theme keeps its neon in the fill, never in the text.
- The top bar's colour is one more setting, blank by default, and both schemes come from it.
- A theme is not shippable until `npm run themes` passes.
- `preload: false` on every theme face is what keeps ten themes costing what one costs.

### Site themes — `docs/themes.md`

One folder per theme under `web/src/themes/`; four template slots; `site_theme` chooses; `classic` is the site as it was. Step 1 (2026-09-16) built the machinery with zero visible change.

- A theme is code and choosing one is data: `themes.site_theme` is checked for the shape of an id and nothing more, and every wrong value — unknown, blank, removed, failing to import — renders `classic`.
- `classic` is the site as it was on 2026-09-16, moved verbatim with its docblocks and gated on `scripts/probes/html-snapshot.mjs`: 35 routes diffed empty, route table identical, CSS bytes identical.
- Four slots (`Chrome`, `Home`, `PageHero`, `CtaBand`); `page-hero.tsx` and `cta-band.tsx` are dispatchers, so the ~30 pages did not change; every prop is a data-layer type and none is a function — a template cannot fetch, read a cookie or emit `JsonLd`.
- `Card`, `SectionHeader` and `Container` are not slots: `card.tsx` is imported by console client components, and a `server-only` registry behind it is the `lib/settings.ts` 500; themes restyle them under `[data-theme]`.
- The registry is `server-only` with lazy literal loaders — a static import of five themes puts five headers' client islands in every visitor's layout chunk (the `IconField` lesson); client files import `manifests.ts` or `lib/site-theme.ts` only.
- `activeTheme()` is `cache()`d per request and reads the preview store before the settings; `SITE_THEME` in the environment beats the setting and is the production kill switch — process-wide, build-time for `next start`, fresh `.next` per matrix run.
- The preview route is its own dynamic segment; `forcePreviewTheme()` writes a `cache()` store **before the first `await` after `params`** and never from a layout, so no cached render sees a cookie.
- Theme CSS is one `@import` per theme in `themes/themes.css` at the top of `globals.css`, so theme rules lose ties to the 12px floor and the motion rules by design; every rule is scoped under `[data-theme="<id>"]` on `.public-site`.
- Themes is `/admin/themes`, a screen beside Info bar (`STANDALONE_GROUPS`), and the palette picker is "Colour palette"; the Preview link is a plain `<a>` outside the radio's label.
- `Breadcrumbs` lives in `breadcrumbs.tsx` and is re-exported from `page-hero.tsx`, because a template importing the dispatcher that lazily loads it would be a cycle.
- Identical HTML is not identical bytes: streamed `<script>` runs vary in count, `useId` values encode tree position, and a cold dynamic route streams its metadata — the snapshot probe normalises all three.
- Editorial (step 2) is the first real theme: a three-rule masthead whose section rail sticks, a ruled front page whose lead is the slider full-bleed or a fixed picture with the words on it, a headline instead of a banner on every inner page; it redefines the two *type* tokens and never a colour token, and `Card` stamps `data-card` so a theme can restyle it by attribute.
- Datacenter (step 3) is the first of the three technology-company themes asked for on 2026-09-16 (Datacenter, Launch, Terminal replaced bento/immersive/mono): a two-row dark console header with mono readouts from the homepage statistics, a dark hero on the grid holding the slider or `NocPanel` in a bezel, the solutions as a numbered rack, a dark band on every inner page instead of the section banner, an accent rule on every card; the dark-ground tokens do not invert, so its chrome is the same in both schemes and its contrast is arithmetic.
- Theme options (step 4) are one per-theme JSON row, `site_theme_options`, shape-checked by `App\Support\ThemeOptions` *before* `validate()` (the write loop reads the validated copy) and resolved per field in `themes/options.ts`; templates get them as `options`, and a manifest's `ignores` greys a control on the Themes screen rather than hiding it.
- `MegaMenu` takes a `style` — `simple`, `semi`, `mega`, `big` — and `big` positions against the header's container, so a host passing it moves `relative` from its `<ul>` to its `<Container>`.
- A section background is a **local palette**: `SectionBg` sets the background and every token the markup inside resolves (ink pushed to 4.5:1 on every stop, the card re-checked against it, all three coloured-text inks, the dark-band tokens) and sets `color` itself, because `color` inherits as a computed value; `default` renders no wrapper at all.
- Classic's `PageHero` reads `hero_style` (`banner`, `cover`, `split`, `compact`); Editorial and Datacenter ignore it and say so.
- Stock imagery is Freepik through the Magnific connector, resized to 2400px before it goes near the media library.
- Launch (step 5) is the SaaS identity: a floating pill header with one row whose contents are gated by measured widths (the nav is `shrink-0`; utility links from 1440/1680, search from 1760), a bento front page of rounded tiles, pill buttons, a brand-wash panel hero with the picture framed beside the words, two Freepik pictures under `public/themes/launch/`.
- A homepage section row carries `reveal` beside its background (2026-09-27): `cleanSections()` keeps it on a default-ground row for it alone, `HomeSection` draws it as a `data-aos` wrapper inside `SectionBg` for all twelve themes, and the Themes screen offers no Appear for the hero or the closing band.
- Every theme's `Home` is a `SECTIONS` list drawn through `orderSections()` — the stored `section_order` first, the rest in the theme's order, minus the ones with `enabled: false` — and the console's section rows carry the switch and `ReorderButtons` beside the background; a theme that does not draw a section never lists it.
- The classic header's panel helpers live in `components/layout/panel-host.ts` so a theme's chrome hosts the same `MegaMenu` on the same `data-closed` contract; a theme reuses `MobileDrawer`, `SiteSearch` and `CartBadge` rather than writing seconds of them.
- Terminal (step 6) is the CLI identity: mono headings, hairlines and square corners, a prompt header with the sections as paths, a permanent status ticker (the brand marquee's CSS and pause button) under it, two terminal windows for the hero, the solutions as a table; buttons are bracketed by `3px double` side borders because the motion styles own `.btn`'s pseudo-elements; a `sr-only` span inside a scroll box needs the box `relative` or it is a 1px overflow at the page's edge.
- Inner pages change with the theme by attribute: `TeamGrid` stamps `data-card`, `data-team-photo`, `data-team-role`, `data-team-detail` on one markup and each `theme.css` redraws it (two-ink prints that colour on hover, a round photo with a panel sliding over it on Launch, under `(hover: hover)` only); since 2026-09-28 each theme lays the card out its own way from `data-team` and the named pieces (`-name`, `-bio`, `-certs`, `-contact`…) — a staff box, a badge, a listing, a photo with the words on it, a contact card — and `/theme-preview/<id>/team` shows it; the client wall and certification cards carry `data-card`; the hero section is `LOCKED_SECTION` and cannot be switched off.
- Enterprise, Summit and Horizon (step 7) are the three reference-built themes: Enterprise (inspirisys) and Horizon (i2k2) are **children of classic** — `extends`, the registry's loaders accept a `Partial<ThemeTemplates>`, and only the slots they change are theirs; Summit (everestims) is dark at the top on the non-inverting dark tokens and on the page's ground below, because an always-dark page cannot be graded in the light scheme.
- Canvas (step 8) is the client's `DESIGN-claude.md` as a **palette** (`canvas` preset: cream, coral, navy, amber, Fraunces over Inter — through the gate like every other) plus a **theme** (a classic child: 6-6 hero with a dark mockup card, cream feature cards, dark band, comparison cards, the coral callout close; display type at 400, never bolder).
- `DetailFrame` and `Collection` slots wait for the theme that needs them: every detail page draws its own aside, and the index pages differ too much for one slot to be cheap.
- The two logo strips move differently per theme through one `mode` on `LogoMarquee` (`StripMode`, thirteen: marquee, drift, bob, spotlight, parallax, lens, cascade, ring moving by themselves; rise, wipe, pulse, flicker, deal as grids entering on the reveal observer's `data-aos-animate`), and since 2026-09-18 no two themes share a partners mode or a Trusted-by mode — `scripts/probes/strip-modes.mjs` fails on a repeat; the CSS is `[data-strip-mode]` in `globals.css`, inside the reduced-motion guard, stagger by `--i`, the slot as `--slot-w`/`--slot-h`. A tilted-plane `runway` was tried and dropped: it shears the logos, and parallax gives the depth without touching a mark.
- Sentinel, Vantage and Keystone (2026-09-18) are the three built from eset.com, technerd.altisinfonet.in and truenas.com: Sentinel's light display type and glowing brand seam on a dark top; Vantage's see-through pill over a full-bleed `Slider` hero, its glass state keyed by CSS on `:has([data-vantage-dark])` and cleared on scroll, the corner notch made of the slider's own counter and arrows, and the site's heading as a spoken `h1`; Keystone's pill nav group, the gradient close on a heading whose `color` stays the graded ink while the fill is the gradient, and the product in a glowing frame. Vantage's hero is exactly the window (`h-svh`, from the page's top) with the info bar lifted over it and the wrapper's margin `--h-site-header` + `--h-info-bar`, so nothing moves when the pill turns solid (2026-09-28); Keystone's `plate` footer draws the social row once (`Brand social={false}`). Twelve themes, twelve footers (`glow`, `contact`, `plate` joined), twenty-four distinct strip modes.
- A theme's `templates/chrome.tsx` is `themeChrome({ Header, footer, between? })` from `themes/chrome.tsx` — one line naming its header and its footer layout; eight files were the same twenty lines around those two. Classic keeps its own, since it picks the footer per inheriting theme.
- Theme headers share `components/layout/header-parts.tsx` — `useHeaderNav`, `PrimaryNavItems`, `UtilityLinks`, the width gates — and a theme writes only its bar; the five migrated headers render byte-identical markup, measured on every preview.
- Every list of like things is a `Collection` of `Tile`s (`components/ui/collection.tsx`, 2026-09-18) — the home's Products/Certified/Industries/Web services/Case studies/Resources sections, the seven index pages, the hubs, the trust strip and the shop's grids — one anatomy of named parts (`data-collection`, `data-tile`, `-media`, `-body`, `-kicker`, `-head`, `-icon`, `-title`, `-count`, `-summary`, `-meta`, `-cta`), and each `theme.css` carries an idiom block keyed on `[data-collection]` that redraws it: Editorial's ruled index, Datacenter's numbered rack, Terminal's `ls` listing, Launch's bento, Vantage's photo mosaic, Canvas's cream cards, Keystone's gradient edge. Until then those sections and `/store` were classic's markup under every theme. The tile's ground is `.public-site [data-tile]` in `globals.css`, not `bg-card` — the card-ground rule's specificity is one no theme selector reaches — and an idiom selector always carries three attributes; the closing "Learn more" is real markup hidden by the base and shown by the idioms that end on a text link.
- `/resources` gives every tile a hue (2026-09-21) — the routes by position, a post by `tagIndex(category)`, a guide by `hueFor(category)`, a project by its industry's icon — and each `theme.css` states how `[data-collection="routes"]` shows it: grounds and edges only, never a word's colour. The team card is 4:5 with `--member-hue` on the initials tile, the rule and the chips' edges, and pill links that say "Email"/"LinkedIn".
- A homepage tile section never ends on a half-empty row, in any theme (the client, 2026-09-28: Horizon's two case studies sat in a grid of four): the six home `Collection`s pass `fill` (`data-fill="rows"`) and `components/ui/full-rows.tsx`, mounted beside `Reveal`, measures where the items landed (layout offsets, so a reveal's transform does not count) on every change of the grid's own box — a short last row under a full one is marked `data-row-cut` and hidden, a list shorter than one row gets `repeat(n)` columns inline. Measured because the columns are Collection's breakpoints *and* the themes' overrides (Datacenter's two, Launch's twelve-column bento). Never on an index page, which shows everything; without JavaScript the section is the whole selection. `scripts/probes/full-rows.mjs` checks twelve themes at four widths.
- Canvas's cards are solid colour (the client, 2026-09-28, chosen from three rendered options over a navy and a single-brand version): every collection tile (not the shop's products, not the resources routes) and the front page's hand-rolled cards (`data-canvas-fill`) turn through brand, accent and secondary at 600 and then 900, six to a cycle; each fill brings its own ink — the palette's `-on` on a 600, `dark-ink` on a 900 — set as a local palette (`ink`, `ink-2`, `muted`, `faint`, the coloured inks and the hairlines all become it), with `--color-card` left alone so an icon keeps its pale disc. The four statistics under the hero are Google's four colours in order, from `--color-g-*-fill`/`-on` in `globals.css` (Google's product shades with the ink each needs; yellow takes near-black). A card on a fill is never `bg-card` in the markup, or the card-ground gradient paints over it. The words under a heading are softer than it — the same hue's 100 step on a 600 fill (pale in light, dark in dark, so it softens in the right direction in both) and `dark-muted` on a 900 — and every heading sits on a solid Google-colour chip (`--color-g-*-fill` with its `-on`), paired with the fill so blue never sits on blue.
- A decorative bar on a tile is a `::before`, never a background layer wider than 2px: Horizon's 4px bar was graded as the ground under every word on the resources hub (2026-09-21).
- A tile never says how many products a category holds, and an icon and its heading share one line in every theme (the client, 2026-09-19): `Tile` has no `count`, no idiom sets `flex-direction: column` on a `[data-tile-head]`, and Sentinel's hand-rolled category cards, Canvas's and Horizon's solution cards put the icon beside the name. Sentinel offers `heading_align` — the name beside the icon or at the card's far edge — a theme's *own* option: a manifest lists it under `offers`, the Themes screen draws it for that theme alone (the inverse of `ignores`, because a greyed control under every other theme would promise a feature they do not have).
- A section background of "None" (`kind: page`) is the page's own ground and inks in both schemes — the only way a dark band follows the scheme, which no chosen colour can. And a custom colour re-derives the brand *tints* the dark bands write in (`brand-200/300` → the derived brand ink) and clears the derived card for the muted ink too; a slide caption's shade is `--color-scrim`, the theme's dark that no section re-derives, so white words over a photograph keep their ground inside a section painted slate blue (measured 1.6:1 and 3.4:1 before, 2026-09-19).
- The proportion pass (0.108.0, `docs/themes.md` "The proportion pass"): a split is sized by its content (`7fr | 5fr`, Editorial's hero, Horizon's "why"); every moving logo strip renders its list once as `.strip-still` beside `.strip-moving`, swapped by the reduced-motion query, and a wrapped logo list is two to a phone row (`.strip-wrap`); pictured tile strips are grids in Datacenter and Terminal; Launch's bento lead needs a picture; the categories are two to a phone row in every theme, losing the icon and stepping to 14px below 30rem (Datacenter and Terminal excepted) so no name breaks mid-word; a certification's name wraps rather than truncates. Every section of every theme is judged by eye at 360/768/1280/1920.
- Every theme has its own footer through one `layout` on `SiteFooter` (`FooterLayout`, nine of them, the same brand/columns/policy/signup data composed differently, so an assigned footer menu reaches all of them); the chrome contract carries `themeId` so classic's chrome, which Enterprise, Horizon and Canvas inherit, picks theirs through `footerLayoutFor()`. The light-ground layouts use the page's inverting tokens; the dark ones keep `dark-*`.

### Email to ticket — `docs/tickets.md`

The support mailbox read into the ticket system (2026-09-19): IMAP, Gmail and Microsoft 365 over OAuth, the loop rules, the ledger, replies.

- Off by default and, off, reads nothing: every new behaviour is behind `InboundMail::enabled()`, which is the switch *and* enough configuration to attempt a connection.
- Three ways in, all ending in IMAP — `App\Enums\InboundMailProvider` is the list; Gmail and Microsoft authenticate with an OAuth access token as the IMAP password (XOAUTH2).
- `webklex/php-imap`, pure PHP; it declares `ext-zip`, which was switched on in `php.ini` rather than skipped with `--ignore-platform-req` (Composer's platform check would fatal the whole API on a server without it).
- The outgoing and the inbound mailbox share nothing: `OAuthConnection` is `MailOAuth` generalised by *slot* (settings prefix, cache namespace, error key), and a state minted for one slot cannot be spent by the other; `MailOAuth` kept its public API and `OutgoingMailTest` was the refactor gate.
- The inbound consent asks for `openid email` because XOAUTH2 over IMAP authenticates as an address; Microsoft has no refresh-token revocation, so disconnecting from it is a local forget.
- The ledger's unique Message-ID index is the idempotency: the row is written before anything else, a redelivery hits the index, a message without a Message-ID gets a deterministic synthetic one, and a `processing` row untouched for ten minutes is taken over.
- The mailbox flag is the convenience and the index the guarantee: `move` (default, because staff read the inbox by hand) reads everything in the folder and lets the ledger say what is new; `seen` reads unread mail only.
- What never becomes a ticket, in order: our own sending addresses (derived from the settings), staff senders, a sender the provider caught lying (`Authentication-Results` with `dmarc=fail`, `compauth=fail`, or `spf=fail` and no `dkim=pass` — `spoofed`, 2026-09-20), `Auto-Submitted`, `X-Auto-Response-Suppress`, bulk/list precedence, list headers, autoresponder headers, bounces — one data-provider row per rule.
- Ticket, visit and order numbers are `PREFIX-YYYY-NNNNN` with the prefix a setting (2026-09-28, `App\Support\References`, the private `references` group under Settings → Identity): two to six letters or digits starting with a letter, checked on write and again on read — a malformed row falls back to its default (`TW`, `TV`, `ORD`, the numbers already issued) rather than minting one nothing parses. Each sequence is counted per prefix, so a change starts at 00001 and applies to new numbers only. `ReplyParser` matches today's ticket prefix and every one already on a ticket (`References::ticketPrefixes()`), never "any letters", which would read an order number in a customer's email as a ticket. The wizard's `Branding::apply()` sets the ticket and visit prefixes from the company's initials.
- A reply threads onto the ticket only when it is the sender's own open ticket; a closed one or somebody else's reference opens a new ticket with the old reference stripped from the subject, and nothing about the referenced ticket is disclosed.
- `ReplyParser::stripQuoted` is a heuristic cut at the markers real clients write, and keeps the whole text when it would leave nothing.
- An unknown sender gets an Active, verified, approved portal account in the `technoware:customer` shape (or is skipped, by setting); attachments follow the portal's rule through the one `AttachmentStore` both doors share, gated on metadata before the bytes are read.
- A refusal is a banner (`inbound_mail_error`, the server's own words), the command always exits 0, and "Check the connection" is the same probe, read-only.
- `ImapMailbox` is the one part not unit-tested; `Mailbox` is an interface and `InboundMailTest` drives every decision through `FakeMailbox` and the real command.
- Not in v1, written down: no SPF/DKIM verdict on a spoofed From, no Microsoft shared mailboxes; Google Testing-mode consents expire in seven days; the ledger is pruned after 180 days.
- A reply may be marked sensitive (2026-09-21, `is_sensitive`): the body is sealed with `Crypt` in `TicketMessage::sealBody()` on `saving` and opened by the `body` accessor (`withoutObjectCaching()`, or Eloquent re-applies the setter on save over the ciphertext); `TicketReplied` says `SENSITIVE_LINE` instead of the excerpt, no `ticket.replied` webhook is emitted, an undecryptable row answers `UNREADABLE`. The ticket's own `description` takes the same switch (0.85.0): `SealsSensitiveText` is the one definition both models use, `TicketCreated` says its `SENSITIVE_LINE`, the merge note is sealed when the source was, and the ticket's webhooks are still emitted with `description` **redacted** (`WebhookPayload::REDACTED`) — a ticket's existence is what an integration is told, a message is its body. The subject is never sealed.
- A closed ticket sends one satisfaction survey (2026-09-30, `docs/tickets.md` "The satisfaction survey"): `Survey::request()` from `Ticket`'s `updated` hook, once per ticket (`ticket_surveys.ticket_id` unique, row written before the mail, a merged ticket never asked); five rating links to `/ticket-survey/{token}?rating=N` — a link only ever GETs, and the **page records the rating from the browser** (`SurveyForm`'s effect, then every press; feedback worded for low/middling/high follows), never the server render, because scanners fetch every link; the buttons are an `HtmlString`, never Markdown links; the token is in no response; switch `ticket_survey_enabled`, on by default.
- Canned replies (2026-09-20): `canned_replies`, shared across the desk, `role:support_engineer`; `GET /admin/tickets/{ref}/canned-replies` hands the console every body with its placeholders already filled for that ticket through `Placeholders::fillText` — never `EmailRenderer::personalise`, whose docblock says why — so the console inserts text and learns no placeholder rule.
- A merge is one transaction and one notification (2026-09-20): `POST /admin/tickets/{ref}/merge {into}` moves the messages and attachments, closes the source past `canTransitionTo()` with `merged_into_id`, writes `merged_into`/`merged_from` events and an internal note, and sends one `TicketMerged`; refused across customers, on a merged source, and into a ticket that is not open. A merged source reads 200 with `merged_into` on both principals, takes no reply, no reopen and no status change, and `TicketPiper` follows the chain when a reply quotes the old reference.

### Icon packs — `docs/icons.md`

Five packs measured, what each yielded and why the rest were refused.

- Borrowing an icon pack is a measurement, not a decision.
- Sixteen icons came out of 982.
- Tabler is the fourth pack and it yielded ten.
- Icons8 and Flaticon were asked for and refused, and the reason is the licence rather than the drawing.
- The demand for a fifth pack is not there, and it is measurable.
- Reicon is the fifth pack and it yielded four.
- Its "Outline" weight is mixed, and it is the first pack here whose weight cannot be trusted by name.
- Passing the geometry check is not the same as being a subject that is missing; check the key against `iconMap` first (`battery` already existed).
- A key is not registered rather than registered badly: `lab`'s one stroked glyph reads as a telescope at 20px.
- `stroke-miterlimit` is why the generator strips `stroke-*` as a pattern rather than by name.
- `base` and `P` live in `icon-base.ts`, not in `icons.tsx`.
- A wholesale import would have failed invisibly.
- Icon packs are vendored, never depended on — `@tailgrids/icons` declares Babel and SVGR as runtime dependencies.

### Content blocks — `docs/blocks.md`

CTA banners, stat bars, pricing tables and technology stacks (2026-09-24): one entity, shortcodes, the default closing band, three homepage sections.

- One table, `content_blocks`, with a `type`; each type its own layout enum, all with `options()` in the `SliderLayout` shape, sent as `meta.layouts`. The type is fixed once saved — a shortcode names the kind.
- The wire field is `content`, the column `data`: a resource array holding a `data` key is not wrapped, and every read came back without its envelope.
- `BlockRules::for($type, $layout)` asks each layout for exactly what it draws; `after()` checks media that exists, a priced plan, one comparison cell per plan, one picture per stack node. Every text field is plain text; buttons take `PopupRequest`'s link shape.
- A gated download's file never appears in the public read (`has_download: true`); its URL is handed out only by `POST /blocks/{slug}/submit`, which also files `download`/`webinar` leads through `LeadIntake::fromBlock` and mails `block_lead_captured`.
- One published CTA is the default (`makeDefault()`, drafts refused, unpublishing clears it); `GET /blocks/default/cta` is `{data: null}` in a 200. `CtaBand` draws a `band` default through the theme (`ThemeBand`, `kicker`/`primary`/`secondary` on all twelve templates) and any other layout through `CtaBlock`; pages that pass their own `title`/`body` keep them.
- `newsletter_signup_enabled` is a `boolean` row — `Setting::get()` returns `false`, never `'0'`; `/newsletter/subscribe` compared it to `'0'` and never refused anybody until 2026-09-24.
- A scroller holding sr-only children is `relative` (the comparison table, 188px at 360); a stack disc takes no percentage padding (it resolves against the parent's width — the logo box measured 0px in the wide detail card).
- Console at `/admin/blocks/{type}` — the kind in the path, because `?type=` matched no sidebar row and `screenRole()` 404s a screen no row matches. Previews and showcases are `data-reveal-static`: the observer skips them, re-checked at intersection time because an async component streams as its own chunk outside the region first.
- `home_stats_block`/`home_pricing_block`/`home_stack_block` are pickers of published blocks of that kind (API options, anything else refused); `homeBlockSections()` returns only chosen blocks, so none chosen draws no empty band; `HOME_SECTIONS` places them.

### Custom fields and content types — `docs/custom-content.md`

ACF-style fields on existing records and editor-made record types with pages of their own (2026-09-26).

- A group's `targets` is a list of target keys — the morph alias (`page`, `solution`, …, `store_product`) or `entry:<type-slug>` — and `App\Support\CustomFields\Targets` (with `EntryTargets`) is the one list the checklist, the relation select, its choices and the existence rule read.
- `CustomFields` is the one implementation: `rules()` generated from the stored definitions (options a whitelist, a link `http(s)` only, a picture in the library with an image MIME, a linked record in its table), `save()`, `adminValues()`/`definitions()`, `publicFields()`/`publicData()`. A key nobody declared is dropped.
- **Absent `custom_fields` leaves every value alone**: `AcceptsCustomFields` spreads the rules only when the request carries the key, `save()` touches only the keys sent, and a key sent blank clears that field. Rich text is cleaned in `SanitisesRichText` through the request's `customFieldTarget()`.
- A field key is unique across every group on a target (the payload is keyed by it), and `CustomFields::RESERVED_KEYS` (`title`, `slug`, `website`…) are refused.
- Fields are synced **by id**, never replaced wholesale — values cascade with the field row — and a field's kind is fixed once it holds values.
- `hidden` placement means not drawn, never private: `custom_data` on the public read carries every applicable value. The drawn list (`custom_fields`) resolves pictures through `MediaMeta`, links to `{title, path}` and drops a link whose record is no longer public.
- Every target's admin index sends `meta.custom_field_groups` for its "new" form, the `answer_block_kinds` rule; a detail read sends the record's own `custom_field_groups`, `custom_fields` and `custom_field_media`.
- The Fields tab is `CustomFieldsPanel`, **last** and only when a group applies (`Tabs` reads children by position). Its controls are the ordinary primitives named `cf__<key>` plus a hidden `custom_fields_schema`; `customFieldsFromFormData()` rebuilds the object — one hidden JSON value would be an input `<Form>` and `FormDraft` could not restore.
- `CustomFieldDetails` draws the list after the body on the nine target pages and every entry; nothing when empty.
- A content type's slug is a top-level address: refused when it is a frontend route, an API prefix or a server word (`ReservedSlugs`, pinned by `ReservedSlugsTest` reading `web/src/app`), or a CMS page's slug. The catch-all asks for a page first, so a page made later wins.
- An entry's slug is unique **per type** (`Entry::generateUniqueSlug` and a scoped `unique`); `Sluggable`'s 301 works because `urlPrefix()` is the type's slug, read through `typeSlug()` and never a lazy `contentType`.
- Renaming a type writes a redirect for the archive and each entry, re-aims redirects already pointing at the old addresses, and re-attaches `entry:<old>` field groups and relation fields (`ContentType::moveSlug`).
- A type with entries is refused deletion; switching it off 404s the archive and every entry. `Entry::scopePublished` (status, `published_at` not in the future, type active) is the one definition.
- Admin: types bound by id, entries at `/admin/content-types/{type-slug}/entries/{id}`, scoped. Console: `/admin/content-types` and `/admin/content`; two static sidebar rows serve every type by the longest-match rule.
- `[slug]/[entry]/page.tsx` exports an empty `generateStaticParams` (tags `entries:<type>`, `entry:<type>:<slug>`) and reads no request-time API; the archive is a branch of `[slug]/page.tsx` after the page lookup.
- Registered in `SeoController::ENTITIES` (`adminPath()` on the record), `MenuItemType` (`entry`, `content_type`; `Menu::tree()` `morphWith`s the type), menu targets, both searches, FAQ owners, the chatbot retriever, `StructuredData::entry()` (Article or WebPage), the sitemap and `llms.ts`. `AeoScore`/`GeoScore` needed nothing: their lists are catalogue-specific.

### Messaging — `docs/messaging.md`

WhatsApp, RCS and browser push beside the email (Phase 2, 2026-09-25): providers per channel, contacts and opt-in, templates, automations, broadcasts, `Messenger::notify()`.

- `MessageChannel` and one provider enum per channel on the `MailTransport` model (`meta_cloud`/`gupshup`/`twilio`, `google_rbm`/`gupshup`, `fcm`); one `ChannelProvider` per provider over Laravel's HTTP client, no SDK, every one tested with `Http::fake()`. A channel whose provider is blank is off, and `ready()` is the one answer to "may this send".
- Nothing is sent without an enabled automation, a sendable template (WhatsApp approved; RCS and push `not_required`), a ready channel and an **active contact** — and consent comes only from the person: the checkout box, the portal switch, the bell. No console route creates a contact; "View as" may switch a channel off, never on.
- A phone channel reaches the number the caller holds (the checkout's), and the customer's own numbers only when it holds none; push reaches a customer's own browsers only — a guest's token is broadcast-only.
- `notify()` never fails its caller, writes a delivery row per contact and dispatches `afterCommit()`; a promotional event is delayed to `QuietHours::nextOpening()` and `ChannelSender` checks the window again when it runs; with nothing draining the queue a transactional one is sent after the commit (`Notifier`'s rule).
- The worker re-checks contact, template approval and channel at the moment of sending and marks a stale one `skipped`, not `failed`; only `pending` rows send; a delivery's status only moves forward (`rank()`), because callbacks arrive out of order.
- Provider webhooks (`/messaging/webhooks/{channel}/{provider}`) answer 200 always and fail closed: Meta's `X-Hub-Signature-256`, Twilio's `X-Twilio-Signature`, Google's `X-Goog-Signature`, and `messaging_webhook_secret` as `?token=` for the two Gupshups, which sign nothing. A forged STOP would opt people out in silence.
- STOP (and its synonyms, `Contacts::isStop()`) opts the number out; FCM `UNREGISTERED` opts the token out; a Google RBM 404 is a failed message, not an opt-out. A 401/403 writes `messaging_<channel>_error`, the `mail_error` pattern, and a success clears it.
- Templates are plain text through `Placeholders::fillText`. WhatsApp at Meta is named-parameter (`parameter_format: NAMED`); Gupshup and Twilio are numbered, so the body is renumbered by first use (`positionalBody()`) and sent by `provider_template_id`. Editing a reviewed field of a submitted WhatsApp template puts it back to draft.
- Placeholder chips and the phone preview read `MessageEvent::placeholders()` and the API's `meta.samples` (`Samples::value()`), the same values a template test and a provider's review example use — never a list in TypeScript.
- Broadcast audiences are always narrowed to active contacts on the channel; the wishlist source is a no-op until `wishlist_items` exists. Claimed with a conditional UPDATE, frozen into delivery rows, `SendBroadcastBatch` in hundreds; a send is refused on an unapproved template, a channel off or nobody in the audience; cancelling skips what has not gone.
- `role:campaign_manager,store_manager` for templates, automations, broadcasts and contacts (`routes/api/admin-messaging.php`); provider keys and the test send are `role:admin`. The sidebar's `role` takes the same comma-joined pair (`RoleGate`) and `AdminNavRolesTest` compares it as written.
- `GoogleServiceAccount` is parameterised by setting key (`rcs_rbm_service_account`, `push_fcm_service_account`), its cache keyed on both; a replaced key file forgets its token.
- The public `push` group is Firebase's web config; `messaging_whatsapp_live`, `messaging_rcs_live` and `push_live` are derived public bits, so the checkout offers a box and the shop a bell only for a channel that can deliver.
- Push has **no Firebase SDK**: `lib/push-client.ts`, imported on the bell's press, does the installation and registration calls the SDK makes (both hosts in `connect-src`), and `public/firebase-messaging-sw.js` handles the push itself with its fallbacks from `/push/sw-config`. The bell asks nothing on load, waits for the cookie answer where the banner is drawn, and renders inert on the server so the shop stays cached.

### The section page builder — `docs/page-builder.md`

A CMS page laid out as a stack of typed sections (2026-09-26): `pages.blocks` is the list, `template: builder` renders it; no free-form canvas, by the client's choice.

- `pages.blocks` is a list of `{id, type, hidden, background, data}`; `PageSectionType` is the fourteen types, sent as `meta.section_types` and never listed in TypeScript. This reverses the "`blocks` is deliberately absent" comments: their objection was raw JSON in a text field, and a builder validated per type is the editor they asked for.
- `SectionRules::forPayload()` generates rules per row from that row's type, so a 422 is keyed `blocks.N.data.field`; `after()` checks media that exists and is the right kind, references that exist **and are published**, a YouTube link `App\Support\YouTube` can read, unique ids, and the background through `ThemeOptions::background()` — extracted from the homepage-section cleaner so the two cannot drift.
- `normalise()` is what is stored — declared keys only, because `validated()` hands back each `data` whole once the wildcard carries a rule; references are stored as ids, so renaming a slug moves nothing.
- `SanitisesRichText` reads a dotted path after its wildcard (`blocks.*.data.body`); `SanitisesRichTextTest` pins it and the one-level form. A plain-text section field is never rendered as markup.
- `SectionPresenter` is the public shape: hidden sections gone, paths as URLs with alt and focus, a content block inline, a slider/gallery/form as its **current slug** fetched from its own public endpoint, `cards` resolved to the live list now; a dead reference, an empty list or an empty FAQ drops its section.
- A builder page's `faq_schema` counts its visible custom `faq` sections' questions beside its FAQs and question blocks — still one `FAQPage`, still under two entries none; `FaqSection` emits no graph.
- One `h1` either way: an opening `hero` section is the `h1` and draws `Breadcrumbs`, and the route skips `PageHero`; otherwise `PageHero` opens the page. Section headings are `h2`; a tile's or feature's title is `h3` only under a section heading.
- Every section sits in `SectionBg` and carries `data-page-section="<type>"`; a `cards` section is a `Collection` of `Tile`s, so every theme's idiom draws it. `STRIP_MODES` in `page-sections/embed-sections.tsx` mirrors each theme's homepage strip `mode` — change both together.
- The closing `CtaBand` is skipped when a `content_block` section already closes the page with a CTA; page FAQs are left out of the answer blocks when a `faq` section shows them.
- The console keeps the list in the page form (not the Builder tab, which is drawn only for `builder`) and posts it as one hidden JSON input; structural changes dispatch an `input` event on it for `FormDraft` and the leave guard, and `tw:draft-restored` reads it back. `GROUPS` lists the Builder tab whatever the template, so a 422 always has a tab.
- Section fields are the content blocks' editor primitives, unnamed; `blocks/editors/shared.tsx` has an optional `idPrefix`, because many sections of one type on one form would share every id.
- Previews: the unsaved one is a Server Action posting to `POST /admin/pages/preview` (nothing written) that keeps the presented sections ten minutes for that staff session (`lib/admin/preview-drafts.ts`) and returns an id the `xl` `Modal` frames as `/admin/draft-preview/{id}` — **never JSX returned from the action**: a section holding a client component the console page does not import is a "Could not find the module … in the React Client Manifest" error (found 2026-09-26 by driving it); `/admin/pages/{id}/preview` draws the saved ones. Both inside `SectionsFrame` with `ownsH1={false}`, so a hero is an `h2` under the console's own `h1`.
- A section stores `reveal` beside `hidden` and `background` (the card's Appear select, 2026-09-27): `SectionRules::reveal()` stores nothing for `default`, the presenter passes it, and `renderSection()` hands each section its resolved `data-aos` for its own root — no wrapper, so the default markup did not move.
- `SampleBuilderPageSeeder` is one **draft**, create-only, after the blocks/sliders/forms it points at; the audit discovers its Builder tab and saved preview, and its public route is audited by name once published. It gives the hero, media-and-text and testimonial three different pictures: `next/image`'s dev LCP check keys images by URL, so a lazy copy of the hero's photo further down overwrote the eager hero's entry and the preview failed the audit for a hero that was eager (2026-09-27). A section card is `min-w-0` — a grid item, and the collapsed summary's `truncate` held the Builder tab at 488px on a 360px screen.
- `media-src` names the asset origins (a library video — a builder `video` section or a slide — is served from there).
- A section's `style` (0.104.0, `SectionRules::STYLE`): spacing, width, alignment, heading size, anchor, devices — choices only, defaults never stored, applied by one `[data-section-style]` wrapper in `PageSections` that the CSS reads, so no section component knows about it. Width targets `[data-container]` and only narrows; hidden devices are the `hidden` class. `scripts/probes/section-style.mjs`.
- The builder's history is `apply()` in `section-builder.tsx`: compute next from current, push, set — never a push inside a state updater; typing coalesces per section per second; Ctrl/⌘ Z is left to a focused text field. Drag uses a handle, the arrows stay for touch and keyboard; Copy/Paste round-trips `{"tw-section":1,…}` through the clipboard and `localStorage`. `scripts/probes/builder-editing.mjs`.
- The section library (0.106.0, `saved_sections`): a *section* is one section and never a link, a *template* a stack copied with fresh ids; a page places a section linked as `{type:"saved", data:{saved_id}}`, which `SectionPresenter::resolve()` swaps for the library's section (page's id and Hidden kept) in one query before anything else is presented; deleting one still placed linked is a 422 from `linkedFrom()`, and a library edit purges `pages`. `scripts/probes/section-library.mjs`.
- The live preview (0.112.0, `docs/page-builder.md` "Live preview"): from 1400px the page sits beside its sections, redrawn through the unsaved preview 900ms after the last change, a section failing its rules dropped and named rather than stopping it, the next frame loaded hidden and swapped in at the same scroll; `PageSections marked` + `BuilderPreviewBridge` join a press in the frame to its card and a card opened to its section, by same-origin `postMessage`; shown or hidden per browser through `useSyncExternalStore`.
- The homepage as a builder page (0.113.0, `docs/page-builder.md` "The homepage as a builder page"): `homepage_page_id` (Settings → Homepage) names a published builder page, published as `homepage_page_slug` only while it still is one; `theme_section` places one of the active theme's homepage sections through `ThemeSectionSlot` (the theme's `Home` with `options.only`), the theme hero only first; `HeroTitle` renders a homepage hero's heading at the per-request level `PageSections` sets (`h2` when it does not own the `h1`); the page's own slug 301s to `/` and is out of the sitemap; `FullRows` skips `[data-reveal-static]` and React's hidden streaming chunks, or a streamed preview hydrates against stamped grids.
- Draft with AI (0.116.0, `POST /admin/pages/ai-draft`, `PageDraft`): a brief becomes a **draft** builder page from ten section types; facts are `[CHECK: …]`, never invented (no stats, quotes, prices, clients); links, pictures and icons are indices into lists it is shown; no HTML from the model; every section passes the save's own rules or is dropped and counted; it shares the SEO assistant's switch, key, model and daily cap. Refusals render inside the dialog — a toast behind a `<dialog>` is inert and unseen.
- Diagram (0.115.0, `flow`): 2–6 `{icon?, title, note?}` steps whose HTML arrows draw on their own view timelines, across from `md` and down below it; a Cover hero takes `video_path` (cover only, cleared by the console on a layout change).
- Scroll story (0.114.0, `story`): 2–6 `{title, body, image_path}` steps; the markup holds the stacked and the sticky layout and CSS picks — sticky pictures on named view timelines (`timeline-scope`) from `lg` with motion and support, an inline picture per step otherwise; `SectionRules::messages()` takes the blocks for per-type wording (`TYPE_MESSAGES`).
- Team, downloads, countdown, columns and map (0.111.0, `people-sections.tsx`): `team` is a live list drawn by `TeamGrid`, so every theme's team idiom reaches it; `downloads` resolves each library file to url/size/extension and drops a missing one; `countdown` stores a wall-clock time and the read sends an instant with its offset plus the API's `ends_label`, the clock read through `useSyncExternalStore` with a null server snapshot; `columns` bodies are rich text a second list deep — `SanitisesRichText::cleanAt()` walks any number of `*`s; `map` reuses `MapEmbed` and the `map_embed_url` host rule.
- An imported page's widgets become sections (0.110.0, `docs/wordpress-import.md` "What the import recognises"): `Rendered/RenderedSections` walks the rendered HTML and asks `Rendered/Recognisers/*` (class-token patterns, anchored per token; an item is claimed only when nothing inside matches too); neighbours of one kind merge (`Piece::MERGES`); every piece must pass its target's rules or stays text; forms, pricing blocks and galleries are published records made by `Parts` in the commit only and counted in the review under `page_parts` as `info` reasons; a form is one per plugin id across pages; a price is paise only in rupees with a period; `GutenbergSections` hands unmapped blocks to the same recognisers. The commit cursor carries `planned` too.
- Comparison, timeline, before/after and testimonials (0.109.0): a comparison is a `<table>` from `sm` and one card per plan below it; `cells` is a list of plain values kept by position (`keep()`'s `['*']` branch); the before/after divider is a native range input; the comparison editor writes a removed plan in **one** `set`, because each `set` starts from the same snapshot. **A page's own content** is offered first in an empty builder — `POST /admin/pages/sections-from-body` (`BodySections`, split at `<h2>`s, nothing written) or one text section — and a builder page with no sections renders its body. WordPress pages arrive laid out as sections (`page_layout`, default `sections`; `GutenbergSections` from `content.raw`, `BodySections` for classic/Elementor/shortcode pages; a second run lays out only a page still `default` with no blocks; `LinksStep` rewrites inside sections). `docs/page-builder.md`, `docs/wordpress-import.md`.
- Figures, steps, tabs, checklist and call to action (0.107.0, `visual-sections.tsx`): proportion is the component's — never more columns than items, short last rows centred (`rowItem()`, literal Tailwind class names only), read lists (bars, vertical steps) beside a sticky heading from `lg`; meters animate on `data-aos-animate`, `from`-only; a `cta` section is `ThemeBand` and closes the page. `normalise()` `ksort`s sections and items, because `validated()` returns a section whose fields are all under a wildcard after the ones behind it. `/theme-preview/<theme>/page/<slug>` previews a builder page in any theme. `scripts/probes/section-bands.mjs`.

### Engineer visits — `docs/visits.md`

A customer asks for an engineer on site with up to three preferred times; the desk confirms one (2026-09-26).

- It is a request, not a booking — the client's choice over a live calendar: `preferred` (what was asked, a JSON **list** of `{date, window}`, best first, the window stored by key) and `scheduled_start_at` (what the desk agreed) are separate answers, and only `POST /admin/visits/{reference}/confirm` sets a time.
- `App\Support\Visits\VisitSettings` is the one reader of the `visits` group, falling back per field; the console refuses a value that would parse to nothing (`refusalFor`); six keys are public by name (`PUBLIC_KEYS`), `visits_email` and `visit_default_minutes` are not.
- `PreferredTimes::check()` refuses short notice, the horizon, a day not offered, a closed date, an unknown window and a repeat — each on `preferred.{i}.date`/`.window`, the names the form's inputs carry, rows keyed by an id so removing one re-numbers the names and not the values.
- The guest's 64-hex token is answered once on create, compared with `hash_equals`, absent from every resource and webhook; a wrong token is the same 404 as a wrong reference. The email link is `/visit/{reference}/open?token=`, a route handler that moves it into an httpOnly cookie scoped to `/visit/{reference}` and 303s (a **relative** `Location`) to the clean page.
- A signed-in customer is stamped from `$request->user('sanctum')` narrowed to `Customer`, never an impersonated token; the Server Action forwards the portal token. `my/visits` is scoped by `customer_id` alone.
- Three doors (guest link, portal, console), one `VisitActions`: cancel, reschedule, confirm, move — mail through `Notifier`, channels through `Messenger`, webhooks through `Webhooks`.
- A reschedule is not a state: the desk moving a confirmed visit keeps it `confirmed` (event `rescheduled`, email `visit_rescheduled`); a customer asking for other times returns it to `requested` and clears the agreed time. Confirming a visit ever confirmed before is a move.
- `Confirmed` is never in `allowed_next` and `PATCH` refuses it — a time is what confirms. `confirmed_at`/`completed_at`/`cancelled_at` are never cleared; `reminded_at` is cleared when the time changes, and stamped at confirmation inside 24 hours so no reminder follows the booking.
- The `.ics` is by hand (`Visits\Ics`): UTC with `Z`, `UID` = the reference so a move updates the event, CRLF and 75-octet folding, escaped text, `METHOD:PUBLISH`; attached to the built-in message, so an edited wording keeps it.
- `technoware:remind-visits` every fifteen minutes, claimed with a conditional UPDATE on `reminded_at`, transactional (no quiet hours).
- Seven emails for five classes (`VisitRequestReceived` and `VisitConfirmed` two each); the customer's receipt repeats their chosen times and never their notes. `MessageEvent` gains `VisitRequested`, `VisitConfirmed`, `VisitReminder`; the opt-in is the checkout's, sourced `visit`.
- It files a lead, channel `visit` (`LeadIntake::fromVisit()`); `visit_request` is in the morph map, and the lead links back.
- `role:sales_manager,support_engineer` (`routes/api/admin-visits.php`, one comma-joined row in `nav-items.tsx`); settings `role:admin` at `/admin/visits/settings`; `staff_note` is on the admin resource only.

### Online meetings — `docs/meetings.md`

A customer books a video call at a slot the slot engine proved free; the company's Google calendar makes the event and the Meet link (2026-09-29). Wire shapes: `docs/meetings-contract.md`.

- A booking, where a visit is a request: two diaries can be read, a site visit needs a person to decide. Off by default (`meetings_enabled` 0, no type, no host); it files a lead, channel `meeting`.
- A host holds `meeting_host` **explicitly** and is active — the admin's implicit pass never makes somebody bookable; no hours of their own means `meeting_default_hours`; a host with meetings to come cannot be deleted, deactivated or lose the role (422), and a new email re-syncs their future events through the sweeper.
- `Availability` works in `APP_TIMEZONE` as timestamps; every label on the wire is the API's, and a `start` without an offset is a 422. The meeting widened by its type's buffers must miss time off, other meetings' stored `blocked_from`/`blocked_until` and — when set — Google busy; an unreadable calendar is unknown and never blocks; the public answer never names the host.
- No double booking is the lock, not the slot list: `MeetingActions` opens its transaction by locking the candidate hosts' `users` rows in id order, re-reads the clash and picks the least-booked free host; lead, notices, webhook and sync follow the commit. "Just taken" and "not on offer" are two different 422s on `start`.
- The console skips notice and window (never the past) and goes outside hours or over Google busy only behind two ticks — never over a meeting booked here. The contact and per-IP caps bind the public door only.
- The guest token is answered once, `hash_equals`, never in a resource; `/meeting/{reference}/open?token=` moves it into a path-scoped httpOnly cookie. Cutoff and reschedule cap refuse on `meeting`; outcomes only after the start; a signed-in customer is `user('sanctum')` narrowed, never "View as".
- Google (`GoogleCalendar`, own OAuth slot, `calendar.events` + `calendar.events.freebusy`): one company calendar, our own event id so a retried insert is a 409 read as success, a move PATCHes time and attendees and never the conference, nothing the customer typed but name and address, another account's event left alone, never throws, rate limits back off 30s/2m/10m.
- Sync runs after the commit; `technoware:sync-meetings` sweeps each minute, claimed by a conditional UPDATE, to `MAX_ATTEMPTS` (5) — then the desk is told once and the customer gets our `.ics`. A meeting booked with nothing connected stays on the `.ics` path for life.
- `MeetingNotices` picks the confirmation from what the sync did (link, `.ics`, or wait); a move or cancel carries the `.ics` exactly when the confirmation did. Reminders are claimed by inserting `(meeting, offset, starts_at)`, a past offset is written sent at booking, no quiet hours.
- "Schedule a meeting" finds customers through `GET /admin/meetings/customers` (the diary's roles, 8 at most, LIKE escaped), never the palette's search, which shows customers to support only; "Open the customer" is drawn only for a role that can open it.
- Diary `role:sales_manager,support_engineer`, types `sales_manager`, hosts/Google/settings `admin`, `/admin/my-meetings` `meeting_host` scoped to `host_id`. `{meeting}` binds by `PREFIX-YYYY-NNNNN` (`meeting_reference_prefix`, `DeriveMeetingPrefix` upgrade step).

### Importing a WordPress / WooCommerce site — `docs/wordpress-import.md`

System → WordPress import (2026-09-27): scan → dry run → review → commit, every phase a sliced queued job (`RunWordPressImport`); complete and accountable rather than perfect — what has no home here is named, grouped by reason, before anything is written.

- The site is read over `wp/v2` (an application password) and `wc/v3` (a read-only REST key), both Basic auth, sealed in the cache by `SealedCache` for the scan's job chain only and forgotten when it stops; the commit needs no credentials, the harvest is JSONL on the private disk and deleted when the import completes or expires (three days).
- Every request goes through `App\Support\Net\SafeHttp` (extracted from `DeliverWebhook`, which uses it too): public addresses only, pinned with `CURLOPT_RESOLVE`, at most three redirects followed by hand with each hop re-checked, never https → http, `Authorization` dropped when the host changes. `WORDPRESS_IMPORT_ALLOW_PRIVATE` opens it to a local WordPress only under `APP_ENV=local`.
- One loop does the dry run and the commit (`Importer::run`), with a cursor on `progress`; a dry-run step marks what it will create (`ImportMap::plan()`) so later steps see it coming, and changing a review decision re-runs the dry run so the counts shown are the commit's.
- `wordpress_import_map` (site hash + source type + id → morph alias + id, old URL) is the identity: a second import of the same site updates rather than copies, and never changes a slug.
- Orders are history, inserted in their final state and never through `Checkout`/`Settlement`/`moveTo()`; updated with `saveQuietly()`; numbered `WC-{n}` outside `Order::nextNumber()`'s sequence; `review_requested_at` stamped; shipping and fees are service lines so the lines add up to the total; GST is WooCommerce's recorded tax.
- Catalogue prices follow the review's `tax_basis` when WooCommerce added tax on top; order totals never change; a non-INR shop imports no products, coupons or orders.
- Media is fetched on demand (`Context::media()`) through `MediaUploader::storeFromPath()` — the upload's extension list against the bytes, size and megapixel limits, the SVG sanitiser, `finfo`'s MIME.
- Customers arrive active, unconfirmed, with a random password (sign-in by code confirms them and claims their guest orders) and join "Existing customers" through their own hook, as the client decided; the review names the sequences that would email them. Per-record IndexNow pings are suppressed (`IndexNow::suppressed`). Staff are never created; menus arrive unassigned.
- Yoast titles that are only the title plus the old site's name, and canonicals pointing at the old site, are never copied — and a Yoast head is used only when its canonical is the record's own address (without its index Yoast repeats the first post's head on every post; measured on a real site). The application password reads `wc/v3` too; a WooCommerce key is optional. Old-site staff roles are not imported as customers. ACF kinds are inferred and changeable in the review; repeaters, groups, galleries and relationships are named and not kept.
- Redirects: a 301 from every imported record's old address, plus `/shop` → `/store`, never over a route, page or archive this site serves. "Plain" permalinks (`/?p=62`, `/?product=cap`) are stored as `/?{name}={value}` and `proxy.ts` looks them up **on the home path only**, keeping the rest of the query; a shop category's old address is read from `wp/v2/product_cat`, never assumed to be `/product-category/`.

### Backups — `docs/backups.md`

System → Backups (2026-09-27): the database and the uploaded files, full and incremental, to S3 / S3-compatible, Google Drive and SFTP / FTPS / FTP at once, and restores from the console or `technoware:backup-restore`.

- A backup is a folder per destination — `database.sql.gz` (whole, every time), `files-NNN.zip` volumes, `index.json.gz`, and `manifest.json` uploaded **last**, so a folder without one never finished. An incremental holds the files whose size or mtime differs from the *previous* backup's index; `.env` is never included and the screen says to keep `APP_KEY` elsewhere.
- The worker is `technoware:backups-work` on the **scheduler, not the queue** (every minute, in the background, 40s, a cache lock): during a restore every other scheduled event — the queue drain included — skips its turn (`routes/console.php` ends by adding `skip(RestoreMode::active())` to all of them), which a queued restore could not have.
- Every resumable loop does one unit of work before it looks at the clock; checking first let a run that began late do nothing, and the next the same.
- `backups.preserve_tables` — the queue, the cache, the three backup tables — are left out of every dump and never dropped by a restore, and no foreign key leaves the backup tables (`users` is rebuilt under them).
- The dump is `mysqldump` (password in a 0600 `--defaults-extra-file`, `--skip-add-locks`) or `PhpDumper` where there is no binary, no `proc_open` or over 150 MB; the PHP one reads columns once per dump and does not `START TRANSACTION` inside a caller's.
- Destinations are chunk-shaped with resume state on the `backup_uploads` row: S3 through `async-aws/s3` (never the AWS SDK; its booleans are the strings `'true'`/`'false'`), Drive over `Http` on its own `OAuthConnection::backupDrive()` slot (`drive.file`), FTP/FTPS on ext-ftp (not declared in composer, so a server without it still boots), SFTP on phpseclib. Three attempts, then that destination fails alone and the backup is `completed_with_errors`.
- Hosts go through `PublicHost` on save and at connect, the extension is handed the checked IP, FTP ignores the `PASV` address, a custom S3 endpoint is pinned with `resolve`; `BACKUP_ALLOW_PRIVATE_HOSTS` in `.env` is the only way to a LAN host. SFTP pins the host key (`host:port SHA256:…`) on first contact and refuses another; a new host or endpoint needs its secret retyped.
- A multi-line secret (an SSH key, a service-account JSON) is a textarea in the settings grid: a password `<input>` strips line breaks and a PEM key without them is unreadable. A setting key ending `_path` is drawn as a media picker, which is why the FTP folder is `backup_ftp_folder`.
- Retention deletes **whole chains**; `auto` becomes a full when there is nothing sound to build on (no index here, a chain at `backup_max_chain`, a destination missing the chain, a restore since).
- A restore is planned and checked before anything moves (chain complete, schema no newer than this code's newest migration), takes a `pre_restore` safety copy of the database, verifies every download's sha256, then imports with restore mode on (`EnsureNotRestoring`: 503 except `admin/backups*` and `admin/auth/*`), extracts over the live tree, and runs `migrate` for an older schema.
- `SqlImporter` resumes by byte offset at statement boundaries and skips `@OLD_*`/`@saved_cs_client`, `SQL_LOG_BIN`, `GTID_PURGED`, `USE` and **`LOCK TABLES`** — a pause between a lock and its unlock held the table and every later `migrate` waited on it for ever (the round-trip test hung for eleven minutes on exactly that).
- `BackupPaths::restoreTarget()` is the zip-slip check: only `public/…`/`private/…`, no `..`, no absolute path or drive letter, never the excluded folders.
- The console's restore result is `dismissible={false}` — a dismissible ok `Alert` in the console becomes a toast and was gone before anyone read it.
- `BackupRestoreTest` cannot use `RefreshDatabase` (a `DROP TABLE` commits its transaction); it builds the schema only when missing and ends on `migrate:fresh`.

### Distribution — `docs/distribution.md`

One signed zip per version, installed by a browser wizard and updated from System → Updates (2026-09-28); white-label, for Plesk and cPanel. The sending checklist is `release/RELEASING.md`; the customer's manual is `manual/`, shipped as `MANUAL/`.

- An install is `<home>/{api,web,config,storage,updates}`: `bootstrap/home.php` moves the environment to `config/api.env` and storage to `../storage` when that file exists, and `public/index.php` asks it for the maintenance file; a checkout has neither and is unchanged. `web/start.js` (`release/start.js`) loads `config/web.env` and requires the standalone `server.js`.
- The website is one **portable** build (`TW_PORTABLE_BUILD=1`, `output: "standalone"`): nothing naming a site is baked at build. The Report-Only CSP is emitted by `proxy.ts` from `lib/security-headers.ts`; `remotePatterns` take `/storage/**` on any host and the proxy refuses an `/_next/image` whose `url` is not the runtime `ASSET_ORIGIN`; the origin is `siteUrl()` (`SITE_URL`) and the company `brandName()` (`SITE_NAME`) — never a `NEXT_PUBLIC_*` read, which Next inlines into server code too. Index pages bake their error state and `loadHome()` an empty homepage; the wizard and the updater purge through `/api/internal/revalidate` (`INTERNAL_TOKEN`) and warm in **two passes**, because the first request after a purge is still the stale copy.
- The product is **ALTIS TECH-CMS** from 0.97.0 (2026-09-28), and the customer's company is never that name — that is `company_name` and `SITE_NAME`. The zip and the folder it unpacks into are `altis-tech-cms-<version>` (`PRODUCT_ID` in `release/build.mjs`: no spaces or capitals, because it ends up in cron lines and panel paths), `release.json` carries `product` and `product_name`, the wizard's heading names it, and `ReleasePackage::PRODUCTS` still accepts `technoware`, the id the 0.96 zips carry. Whether a 0.96 install takes an `altis-tech-cms` zip is decided by *its* `ReleasePackage`, not this one: the installed updater reads the new zip.
- A zip's file times are local time with no zone, and Next takes a prerendered page's age from its file's mtime (`lastModified: mtime`), so a release built in India and unpacked on a UTC server had every page hours in the *future*: never stale, immune to the wizard's purge (`revalidatePath` expires only older entries), and a fresh Plesk install showed the build's default theme and menu for hours while pages rendered on demand showed the chosen one (2026-09-30). `release/zip.php` writes 2020-01-01 on every entry, and the wizard's and updater's warm steps run `Updater::agePrerenderedPages()` before the purge; the symptom is `x-nextjs-cache: HIT` on index pages with the old theme and no such header on `/blog`.
- The build needs a Linux sharp: `release/build.mjs` swaps it in on Windows (`--os/--cpu/--libc`), and `.github/workflows/release.yml` builds on Ubuntu. It never builds in `web/` — a staging copy under `release/work/`.
- `release.json` lists every shipped file's sha256 and is signed with Ed25519 (`release/keys/`, gitignored; public half `api/config/release.php`); `ReleasePackage` refuses unsigned, tampered, `--worktree` (unless `RELEASE_ALLOW_TEST_BUILDS`), older and below-`min_from` zips, and every unpacked file is checked against its hash.
- The wizard (`api/public/install/` → `api/install/Wizard.php`, outside the docroot) is framework-free until `config/api.env` exists, one short request per step, unlocked by `storage/install.key`, 404 once `config/install.json` exists; it runs `InstallSeeder` (+ `DemoSeeder` only when ticked), `Branding::apply()` (every seeded setting naming the original company, and the ticket and visit number prefixes from the company's initials), `UpgradeSteps::markAllDone()`, and puts the server's own address in `TRUSTED_PROXIES`.
- The updater (`Updater`, a JSON run file on shared storage — **keys added, never renamed**, the previous release's copy drives a rollback) swaps `api` after the response in `terminating()` (guarded by the run's id and status, since a long-lived process repeats every collected callback) and `web` last, just before its restart; `UpdateMode` closes everything but `admin/system/*` and `admin/auth/*` and every scheduled event but the heartbeat, until the warm step. The safety copy is a `pre_update` backup (`Backup::SAFETY_TRIGGERS`); rollback swaps the `.prev` folders back and restores it when the update migrated.
- Steps are driven by the run's own `key` (`POST /api/v1/system/updates/continue`, `X-Update-Key`, `Updater::stepWithKey`), because a rollback's restore drops `personal_access_tokens` while those steps drive it; `EnsureNotRestoring` keeps `admin/system/*` and that path open under `RestoreMode` too. Every folder move is skipped once done (a retry finishes a half swap), a rollback swaps `web` back in `optimize()` like an update, and a path is refused for a *segment* that is `..` — Next's catch-alls are `[...rest]`. All three were found by the end-to-end rollback from real zips.
- A one-off "run this after deploying" is an **upgrade step** (`app/Support/Upgrade/Steps/`, listed in `UpgradeSteps::STEPS`, recorded in `system_upgrade_steps`), never a README line. `SettingsSeeder` and `RoleSeeder` run on every update.
- `optimize` never runs in a test (it writes the real `bootstrap/cache`); `Updater::useHome()` is the test seam. A step raises a web request's `max_execution_time` and never sets one where there is none: an unconditional `set_time_limit(90)` put a wall-clock limit on the whole test process on Windows and aborted the suite. `SystemUpdateTest`, `SystemStatusTest`, `BrandingTest`.

### The chart kit — `docs/charts.md`

`components/charts/` (0.100.0): AreaChart, BarList, Donut, Funnel, Heatmap, Sparkline; the console's dashboards draw with it.

- Marks are SVG in a stretched 0..100 box, every word is HTML (axis, ticks, read-out, the dots on it); colours are `CHART_TONES` (`var(--color-*)` by meaning), a delta's arrow is coloured and its words stay `ink-2`.
- `AreaChart` is the one client island: the read-out is clamped from a width read in the event handler, never on render; one tab stop, arrows/Home/End/Escape, a polite live region; legend toggles never hide the last series; Compare draws `previous` dashed; Table and CSV carry the same numbers; `format="paise"` labels money with `compactPaise`.
- Arrival is `[data-chart-draw|grow|grow-centre|sweep|cell]` in `globals.css`, `from`-only keyframes inside the reduced-motion guard, once on paint.
- `niceMax` for every axis, `percentChange` (null under five) for every delta, a funnel only from a cohort (`leads.funnel`), never a status snapshot.
- `StatTile` takes `spark` and `delta` and is the one figure tile — the store's `Figure` and the chat's `Total` now render through it.
- Skeletons are shaped (`components/admin/skeletons.tsx`): a `loading.tsx` in every console `[id]`/`new`/record route, `<Suspense>` with `DashboardSkeleton` on `/admin`. `scripts/probes/charts.mjs`.

### The installable website (PWA) — `docs/pwa.md`

Manifest, generated icons, one service worker, an offline page and an install card (0.100.0), from the public `pwa` settings group.

- One worker at `/`: `/sw.js` imports `firebase-messaging-sw.js`, and `lib/push-client.ts` reuses an existing registration — a second script at `/` would replace the first and drop the push subscription.
- The worker's configuration is its query string (`pwa=1|0`, `v=<APP_VERSION>`); off deletes the `tw-*` caches on the next visit and never unregisters (that would end push).
- Never cached: signed-in, paying and secret-bearing routes (`PWA_NEVER_CACHE` in `lib/pwa.ts` and the list in `sw.js` — change both), non-GET, other origins (bar `/storage/` images), RSC payloads.
- Not registered under `next dev` unless `PWA_IN_DEV=1`; the offline page is precached with every `/_next/static` file its HTML names.
- The install card: from the second page, never over `[data-cookie-banner]` or the compare tray, a month quiet once dismissed, iPhone gets Share instructions; below `sm` a 4.5rem right gutter keeps it clear of the launcher. `scripts/probes/pwa.mjs` checks 360 and 1280.
- `/offline`, `/pwa-icon`, `sw.js` and `manifest.webmanifest` are in `ReservedSlugs`.

### Look and feel — `docs/look-and-feel.md`

Section textures, spot illustrations, the ticket stepper and the "Getting started" checklist (0.101.0).

- A section texture (`grain|mesh|glow|grid|dots`) is a property of the shared background, checked by `ThemeOptions::background()` for the homepage and the builder alike, and drawn by `SectionBg` as an empty sibling `<span data-texture>` — never an ancestor of text, so the contrast audit still grades the ink against the ground. `scripts/probes/textures.mjs`.
- Illustrations are `components/ui/illustrations.tsx`, token colours mixed into `--color-card`, no text, `aria-hidden`; `EmptyState` draws `empty` unless given `illustration` or an `icon`, and `compact` makes its title a `<p>` under the card's own heading. In SVG, spread a shared props object **before** the prop it should not override.
- The ticket stepper is `Stepper` + `ticketSteps()`; an order's journey is `OrderTimeline`, and there is no second order mapping.
- `GET /admin/onboarding` answers each step from real state (the seeders' exact sample values), never a tick; the card folds per browser through `useSyncExternalStore`.
- Corners and spacing are `theme_radius`/`theme_density` (`lib/look.ts`): the defaults stamp no attribute and `.section-y` multiplies by `var(--density, 1)`, so an untouched install is pixel-identical; the attributes go on the public, preview and portal wrappers, never the console's. Looks (`LOOK_PRESETS`) set palette, fonts, corners and spacing together.
- `theme_surface` (flat/elevated/outline) sets only `box-shadow` and `border-color` on cards — never the ground the audit requires; `motion_cards` (lift/tilt/float/still) is a motion id, and `tilt` ships `CardTilt` only when chosen, as a `transform` inside the fine-pointer, motion-allowed guard. Do not add a pointer effect on a tile's `::before`/`::after`: four themes draw with them. `scripts/probes/cards.mjs`.
- The appearance tab's live preview frames `/theme-preview/current` and posts `themeTokensCss()` — the root layout's own function — to `PreviewBridge`; same-origin, framed, shape-checked messages only. `scripts/probes/look.mjs`.

### Events — `docs/events.md`

Seminars, webinars and trade shows with a page each and optional free registration (0.118.0). Wire shapes: `docs/events-contract.md`.

- An event is `HasSeo` + `Sluggable` at `/events/{slug}`; registration is `none`, `open` or `external`, free, with an optional capacity, waiting list, closing time and seats-per-booking. No payment and no recurrence — each date is its own event, and Duplicate makes a draft copy.
- **`online_url` is structurally absent from every public read**, the `.ics` at `/events/{slug}/calendar` and the schema graph (whose `VirtualLocation` is the page). It is sent only to registrants, and gated on format wherever it is sent: an in-person event with a stale link stored emails none.
- **The typed address proves nothing.** The public register door never changes or exposes an existing registration: a repeat from an address holding a live one writes nothing, re-sends that registration's own email (once per ten minutes per address per event) and answers **exactly what a stranger would be answered** — so a double press on the last seat reads "This event is full." A cancelled registration is revived like a newcomer under a **rotated token**. `manage_path` is in no response; the manage link exists only in the emails.
- `App\Support\Events\Availability` is the one definition of `none/external/open/waitlist/full/closed/ended`; no seat count is ever published (`few_left` is one bit). Capacity is counted in **seats** over confirmed, inside a transaction that opens by locking the event row.
- The waiting list is a strict queue: promotion (on a cancel, a smaller party, a delete, a raised capacity) stops at the first party that does not fit, and a newcomer joins behind anybody already waiting even when seats are free.
- The event page is ISR-cached (empty `generateStaticParams`, tags `events` + `event:<slug>`); the registration panel asks `/api/events/[slug]/availability` (`no-store`) **after mount** and never in the render. Every label on the wire (`date_label`, `time_label`, `day`, `month`) is the API's.
- `/events/registration/{token}` is a page a secret addresses: dynamic, `noindex`, outside Analytics, `no-referrer`, out of the service worker's cache and `robots.txt`. The API route is plural (`/events/registrations/{token}`), the token 64 lower-case hex or a 404 before any controller runs.
- Events CRUD is `role:content_manager`; registrations are `role:content_manager,sales_manager` (`routes/api/admin-events.php`). A sales manager cannot read the events list, so `meta.event` on the registrations list is everything that screen knows (`has_started` included), and `SCREEN_GATES` in `nav-items.tsx` gates `/admin/events/{id}/registrations` — no sidebar row can, since the id is mid-path.
- A registration's status select is drawn from the API's `allowed_next`; `attended`/`no_show` only once the event has started, by the API's clock. Confirming past capacity is a 422 the console may retry with `force`.
- Admin datetimes are wall-clock `Y-m-d\TH:i` in `APP_TIMEZONE` both ways. `notify_registrants` emails `event_changed` only when the time, place, format or links actually moved.
- The index tiles are a `Collection` (`data-collection="events"`), so every theme's idiom draws them; `event-tiles.tsx` stamps `data-event-row`/`data-event-end` so a count that is not a multiple of three leads with one or two wide tiles rather than ending on an orphan. A cover is cropped to the tile's well — keep its subject central.
- `technoware:remind-events` every fifteen minutes, claimed by a conditional UPDATE; `event_reminder_hours` 0 sends none. Seven emails in the catalogue; `event.registered` webhook; every registration (staff-added too) files a lead, channel `event`.
- `events`, and every other frontend top-level route, is refused as a **CMS page's** slug since 0.118.0 (`ReservedSlugs::pageSlugRule()`, only when the slug is changing) — it used to be checked for content types alone.

## Conventions

- Never hard-code a hex. If a colour is not in `globals.css`, it does not ship.
- **Never a card without a ground** (the client's rule, 2026-09-18). On the public site every `bg-card` box takes a card→surface-2 gradient from one unlayered rule in `globals.css`, because in light `--color-card` and `--color-page` are both white and a card on the page was a border standing in for a surface; `npm run audit` fails a card-shaped box whose ground is transparent or the same colour as what it sits on. A hand-rolled tile is `bg-card`, never `bg-surface` on a `bg-surface` section and never border-only; `brand-ink` is pushed to 4.5:1 on surface-2 as well, since it is now every card's lower stop.
- `font-mono` is for data only — ticket IDs, IPs, SKUs, throughput. Never prose.
- Ticket status and priority are **PHP enums**, not lookup tables. Transition
  rules live in `TicketStatus::canTransitionTo()`.
- Ticket attachments live on the **private** disk and stream through an
  authorised controller. Never expose a public URL.
- Internal ticket notes (`is_internal`) must never reach a customer-facing
  response. The customer controller uses `publicMessages`, not `messages`.
- Commit `api/` and `web/` together — nearly every change spans both.
- Reuse the primitives in `web/src/components/ui/` (Button, Card, Badge, Input,
  Field, Form, Alert, EmptyState, ErrorState, PageHero, Breadcrumbs, FaqList,
  Prose, SpecTable, CtaBand) rather than writing new one-off markup.
- A form driven by a Server Action is `<Form action={…} state={state}>`, never a
  bare `<form>`. A bare one throws away everything typed into it the moment the
  server refuses the submission.

## Definition of done

Not a checklist to read — a command to run:

```bash
npm run dev                 # or npm run start against a build
npm run audit               # in another terminal
```

One-time setup: `npx playwright install chromium`.

`web/scripts/audit.mjs` drives a real browser over every route and fails on:

- WCAG AA contrast failures — **against every stop of a gradient**, not just
  flat background colours. A gradient is a `background-image` with a
  transparent `background-color`, so reading only the latter walks past it to
  the page and grades text against the wrong ground: that reported the blog's
  YouTube facade at 1.09:1 when it really paints at 14.76:1, and could as
  easily have hidden a real failure the other way. The worst stop is taken,
  because a gradient varies across the element. Text in a box under 2x2px is
  skipped — `sr-only` is announced and never painted, and grading its colour
  grades something that does not exist
- any JavaScript error or warning the page logs (`pageerror` and
  `console.error`), which nothing checked before — the class of defect the
  `Breadcrumbs` double-`Home` was
- WCAG AA contrast failures (alpha-composited backgrounds handled
  correctly, and measured against each element's **own** text — it used to
  skip anything over 140 characters, which exempted six elements on the
  homepage alone, one of them a 2.55:1 failure)
- heading-level jumps, or anything other than exactly one `<h1>`
- horizontal overflow at 1280px or 360px
- tap targets under 24px that also fail WCAG 2.2's spacing exception
- a missing canonical URL, malformed JSON-LD, or an unescaped `<` inside it
- anything the Report-Only Content-Security-Policy would have blocked
- any image on this origin that answers 4xx/5xx — `/_next/image` refusing an
  upstream, most likely, which the console filter above deliberately passes over
- a card-shaped box on the public site with no ground: transparent, or the
  same colour as the nearest opaque ancestor under it with no gradient —
  the client's "never a card without a background" rule, kept by measurement

It exits non-zero, so CI can gate on it. Pass routes to check specific pages:
`node scripts/audit.mjs /admin /admin/tickets`.

**Speed is measured separately, and is not a gate yet.** `npm run perf` runs
Playwright over the main routes against a production build — never `next dev`
— with a fresh browser context per route, and prints per route the
`x-nextjs-cache` header (the ISR proof), TTFB, LCP with the element responsible
and its bytes, CLS, and bytes on the wire by type; it writes a JSON snapshot
for diffing. `php artisan technoware:profile` is the API half: every public
GET through the kernel with the query log on. Both are rulers rather than
gates because the numbers on this machine are dominated by things production
does not have — no OPcache under `artisan serve`, one PHP worker — and a gate
written against them would be a gate against the laptop. Run `npm run
warm-images` before `perf`, or the single-worker API times the optimiser out
and reports 504s that are the dev server rather than the site.

**It covers the console by default when `ADMIN_LOGIN_EMAIL` /
`ADMIN_LOGIN_PASSWORD` are set, and finds record screens itself** — 115 routes
rather than 23. Detail and edit screens cannot be hard-coded, because ids come
from the seeder and change with every `migrate:fresh`, so `DISCOVER` opens each
index and takes the first row. That closed the last big hole: every CMS *edit*
form was unaudited, as was the ticket detail. An index that yields nothing says
so on the console rather than silently shrinking the run.

Three bugs lived in the gap: `Alert`/`Badge`/`ErrorState` at 1.53:1 in dark for
months, a dashboard 500, and every `destructive` button at 2.4:1 in dark across
twelve edit screens. It always *could*
sign in, but the default list was public-only, so the 24 screens behind the
login were checked only when somebody remembered to name them. Two bugs lived
in that gap: `Alert`/`Badge`/`ErrorState` shipping 1.53:1 text in dark mode for
months, and a dashboard 500 that the very next run caught. Set the credentials
before calling a run clean.

`npm run audit:mobile` is the phone half, and it is stricter: 320/360/390/414
px, and it **names the element** responsible rather than reporting that the
page overflows by 42px. It covers the public site, the signed-in portal and
the whole admin console — 77 routes — given credentials:

```bash
ADMIN_LOGIN_EMAIL=…  ADMIN_LOGIN_PASSWORD=…      # /admin/*
PORTAL_LOGIN_EMAIL=… PORTAL_LOGIN_PASSWORD=…     # /portal/* (portal is skipped without these)
PORTAL_TICKET=TW-2026-00007                      # optional, adds the conversation view
```

Two of its checks are worth knowing because both caught real bugs that look
fine in a screenshot: **an element inside an `overflow-x-auto`/`hidden`
ancestor is treated as contained**, not as overflow — otherwise every
decorative background blob is a false positive — and **SVG text is measured
after viewBox scaling**, because `getComputedStyle` reports user units. A
diagram marked `fontSize="8.5"` was rendering at 5.4px.

**Every bug of consequence in this project was found by running it, not by
reading it** — two independently-written string constants disagreeing is
invisible to static analysis. Verify in the browser before calling something
finished.

---

## Scope limits (from the client brief, as amended — do not exceed)

The original brief excluded any transaction. The client then asked for the
store (`docs/store.md`), so the line is now this: **the shop sells, the
catalogue does not.** `/store` carries a basket, checkout, payment through a
gateway or offline, coupons, stock and digital codes, and a manually
uploaded invoice; the marketing catalogue at `/products` stays a **catalogue**
with "Request Information" CTAs and no price. Still excluded, and not to be
built: quotations, renewals, subscriptions, domain or hosting control panels,
and a CRM beyond the lead pipeline (`docs/feature-ideas-2026-09-20.md`, "Not
suggested, and why"). The invoice is uploaded, not generated — a decision
about GST compliance rather than about scope, and one the feature-ideas
document reopens.

**Amended 2026-09-26: engineer visit requests.** The client asked for customers
to request a site visit and for staff to confirm the time (`docs/visits.md`).
That is intake, not a CRM: a request files a lead like every other form, and
the desk confirms or cancels it. Still not a scheduling system — there is no
availability calendar, no slot capacity and no engineer calendar sync.

**Amended 2026-09-29: online meetings.** The client asked for customers to
book a video call at a free time (`docs/meetings.md`). That one *is* a
booking — working hours, a slot engine and a Google Calendar event with a
Meet link — because a call needs only two diaries, where a site visit needs
a person to decide. It is still intake: every booking files a lead. Engineer
visits stay a request, and nothing here takes a payment.

**Amended 2026-10-06: events.** The client's roadmap asked for events
(`docs/events.md`): a page per seminar, webinar or trade show and free
registration with a capacity and a waiting list. Still intake — every
registration files a lead. Not to be built: paid tickets, recurring events,
badge printing or check-in apps.

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
  - The whole company profile from `CompanyProfileSeeder`: four invented
    team members, six fictitious clients, three certifications with made-up
    certificate numbers, and the partner tiers on Cisco and Fortinet — the
    last being a claim about a third party. All create-only, so replacing
    them in the console is permanent.
  - The three sample events from `SampleEventSeeder` (0.118.0, demo only):
    published, titled "Sample …", dated from the day they were seeded, with
    generated covers and an `example.com` join link. They make `/events`
    non-empty on a demo install; delete them before launch.
  - The sample builder page from `SampleBuilderPageSeeder` (2026-09-26) at
    `/sample-builder-page` — a draft, every word a placeholder, and a
    Big Buck Bunny YouTube id standing in for a real video.
  - The sample content blocks from `ContentBlockSeeder` (2026-09-24): every
    one a draft except `site-audit`, the default closing band, whose words
    are the band's own; the stat samples reuse the hero's invented figures
    and the pricing sample (AMC plans) is invented outright.
  - The placeholder hardware and installation services from
    `SampleServiceSeeder` (2026-09-29, demo only), filed under the two
    service categories beside Web services: every word invented — and the
    thirteen Freepik sample pictures it gives every seeded service
    (`resources/service-images/`), which need the attribution while they
    stand.
- **With no logo uploaded, the header draws the company's name as text**
  (`web/src/components/layout/logo.tsx`, 2026-09-28) — it drew a literal
  "TECHNOWARE" on every white-label install until then. Upload the real mark
  in Settings → General.
- **`/privacy` and `/terms` are placeholder copy.** They read as real policy
  and are not. Needs a qualified legal review before launch.
- **The repository is public.** No secrets are committed and history is clean,
  but one accidental `git add -f .env` would be scraped within minutes.

See @README.md for setup detail, Plesk deployment and the full change history,
and @API.md for the endpoint reference — every route, what it returns, and the
behaviour that is not obvious from the signature.
