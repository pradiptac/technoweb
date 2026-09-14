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
  - Icon packs — `docs/icons.md`
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
reason (it awaits `searchParams` for the category listing's filters), and the
CMS catch-all `[slug]` stays dynamic so a crawler's junk URLs do not each
become a cached not-found on disk. `npm run perf` prints the header per route;
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
there is no cookie, so a crawler still never mints a cart.

**A console save has to `updateTag` the collection, and ten action files
never did.** Every detail fetch carries its collection's tag as well as its
own (`["solutions", "solution:<slug>"]`), and every create/update/delete in
blog, brands, case studies, industries, knowledge base, pages, products,
services, solutions, FAQs and the store's products and categories calls
`updateTag(<collection>)` — before that, an edit reached the public page only
when the fetch's revalidate window ran out, five to ten minutes, which a probe
renaming a solution through the real form proved. Verified after: HIT before
the save, the new title on the next request.

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
stale empty result for the whole revalidate window.

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
  audit now fails a route on any 4xx/5xx image response from this origin.**
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
blink out. The route loader is `scaleX`, never `width`. The cart wiggle and
the basket ring run **three times and stop** — infinite is for loaders.

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

**Admin form buttons go in `FormActions`.** It pins the row to the bottom of
the viewport while the form is taller than the screen — on a populated product
the buttons sat below the editor and two repeaters — and warns before a
refresh discards a half-filled form. That warning cannot see an in-app
navigation: `beforeunload` does not fire for a client-side route change, so a
sidebar click still discards without asking.

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

**Two settings groups are private and must stay that way.** `mail` holds the
SMTP credentials and `integrations` holds the API key. They are excluded from
the public `/settings` whitelist, marked `is_secret`, encrypted at rest, and
never returned to the browser — the admin response says only whether a value
is set. A blank submit means "unchanged", because the form can never show the
current value; clearing one is a separate endpoint. When adding a setting, ask
which of those two lists it belongs on before adding it to the seeder.

**A map embed URL is validated against Google's host on write.** It becomes an
`iframe src` on the contact page, and an unchecked one is somebody else's page
rendered inside ours.

### Laravel conventions

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

**`Setting::get()` is memoised per request through `Cache::memo()`, and
forgetting it has to go through the same repository.** A blog listing of twelve
posts ran 28 queries, 24 of them re-reading one cached map — `Cache::get` per
call, per row — and every request paid three to ten of those at boot for the
mail configuration. The memoised repository reads the store once per request;
`Setting::flushCache()` forgets through `Cache::memo()` because a plain
`Cache::forget()` clears the store and leaves the request's memo answering with
the old map. It is a scoped binding rather than a `static`, because a static
survives from one test's application to the next.

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

**Static analysis is Larastan at level 5 with a baseline, and the baseline is
a debt register, not an allowlist.** `composer analyse` must print "No errors"
before a commit. `phpstan-baseline.neon` holds the ~1,200 findings the codebase
already had when the tool arrived — mostly `property.notFound` on Eloquent
attributes the models do not declare — so that a *new* finding fails while
the old ones wait. Do not regenerate the baseline to make a run pass; fix the
finding or, if it is a false positive, add an `@phpstan-ignore` with the
reason. Every API Resource carries a `/** @mixin \App\Models\X */`, which is
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

A separate catalogue with prices; baskets, checkout, payment, stock, coupons, digital codes, the Merchant Center feed.

- "Paid" has one definition and three screens read it.
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
- `AggregateRating` and `Review` are absent from every graph, deliberately.
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

### Sign-in — `docs/auth.md`

Codes, passwords, the two principals and what they must never share.

- `default_login_method` decides which step a sign-in form opens on.
- The two principals must not share anything keyed on a value they both hold.
- A sign-in code is the third secret with that shape, and `sign_in_codes` is keyed on `(audience, email)` for exactly that reason.
- Codes are the default way in and passwords are a link away.
- `request-code` writes a row for an address with no account.
- Mail goes out inside `request-code`, so a known address answers measurably slower; the throttle bounds it and a queue worker is the fix.
- A code confirms an unverified address, and the support desk has to be told.
- Codes make the mailbox the only factor, and for the console that is a reduction.
- One input for the code, never six boxes.

### Leads — `docs/leads.md`

Every contact form lands in one pipeline; the scoring rubric; the status machine.

- Every contact form in the product lands in one pipeline, and `leads` is its own table rather than columns on `enquiries`.
- The source page cannot be read from the request, and a column filled from `Referer` would measure nothing while looking perfectly plausible.
- Every envelope key begins with an underscore, and that is load-bearing.
- `LeadScore` is a rubric, not a model, and it is scored out of what applies.
- Intent matching needs inflections, and `\bwords?\b` is not enough.
- A lead's status dropdown offers only the moves the API will accept.
- `contacted_at` is stamped by reaching a state that means somebody replied.
- Nothing merges two enquiries from one address, and that is deliberate.
- `LeadIntake` runs before the notification and can never fail the submission.
- A lead is `role:sales_manager`.
- `enquiries.source` is a *kind* of page and often carries a slug.

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
- Two of the three API bridges ship; SES does not.
- A transport can be stored that this server cannot build.
- Laravel's Mailgun factory reads `secret`; Brevo's transport reads `key`.
- A field two transports share must be rendered once, not once per panel.
- The mail test takes an optional recipient, and the body is what keeps it safe.
- `mail_error` exists because `Notifier` swallows.
- The OAuth redirect is compared to this site's callback path exactly.
- Google's SMTP scope is full mailbox access and there is no narrower one.
- A mail settings change takes effect on the next request.
- The `log` transport gets its own channel at `debug`.

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
- The chat console is `role:admin`, and there is no way to edit or delete a transcript.
- Thumbs are offered on a grounded answer only.
- The assistant's intent detection is a word list, and two entries in it were wrong in ways only running it found.
- A chatbot lead is a lead, not a `chat_lead`.
- A `ChatConversation` is in the morph map.
- A chat action is stored on the message, not worked out when it is read.
- A brand in the assistant links to `/products?brand=…`, never `/brands/…`.
- The chat panel transitions `translate` and `scale`, never `transform`.

### SEO: structured data, scores and the AI assistant — `docs/seo.md`

`StructuredData`, `SeoScore`, `schema_type`, the overview screen and the suggest-only assistant.

- All JSON-LD is built in `App\Support\StructuredData` and rendered by `JsonLd`.
- Escaping stays at the sink and must not move.
- `schema` is gated on `withSchema()`, never on the route.
- Nothing in a graph is guessed.
- `LocalBusiness` is only ever emitted for a place.
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

### The blog — `docs/blog.md`

The front's arithmetic, category colours, seeding, comments.

- The blog's front is one 4:3 lead beside three 4:3 rows, and the two columns agree by arithmetic.
- The lead's title sits over the photograph on a gradient whose first stop is held.
- A blog category's colour is a hash of its slug into `--color-tag-1…12`.
- `BlogPostSeeder` creates and never overwrites a written post.
- A blog comment is never published by anything but a person, and never filed as spam by anything at all.

### Brands, categories and the company profile — `docs/catalogue.md`

Real logos, the refresh discriminator, category images, and the three index-page entities.

- The company profile is three index-page entities, and what they do not have is the point.
- The catalogue now carries real manufacturer logos, and that is structural data, not demo content.
- The discriminator for "safe to refresh" is the stored path, not a flag.
- Vendored logos are sanitised on the way to disk like any upload, and `BrandCatalogueTest` plants a `<script>` to prove it.
- HPE Aruba's colour was one `<style>` block away from being lost.
- `BrandResource`'s `logo` carries `?v=<updated_at>` because a real logo replaces a placeholder at the same path.
- New brands need a product before they are visible on the public site.
- A product category carries an `image_path`, the same shape as a solution's `hero_image_path`.
- A brand logo's real colours only read against a light ground, so dark scheme turns every one of them into a flat white silhouette rather than pinning the strip's background to always be light.

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
- There are four menu locations, and two of them render one level.
- The flat two are flat deliberately, and `depth()` says so.
- A bar's chrome is not its navigation, and an assigned menu must not be able to delete it.
- The top bar's links appear twice and only one copy is the bar.
- All but the last link is hidden below `sm`.
- Two exhaustive-over-two ternaries were silently wrong the moment there were four.
- `saveMenuAction` called `updateTag("settings")` under a comment about the navigation being on every page.
- The bottom bar's default points at the policy *pages*, not their URLs.
- Verify a menu change by renaming an item through the console and reading the public page — asserting the default links is vacuous.
- `menus`/`menu_items` were in the Phase 1 schema; the migration that made them usable is an alter, not a second pair.

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
- A published popup made `/checkout` unauditable, and the audit had to learn to dismiss one.

### Sliders and galleries — `docs/sliders.md`

Transitions, layouts, captions, the crossfade rules, the lightbox.

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
- The gallery renders no heading of its own.
- Its lightbox does not go through `Modal`, and that is a decision.
- The lightbox's autoplay is an override, not a copy.
- A slider has no URL, so it must not use `Sluggable`.
- `loading="lazy"` inside a scroller defers the slide nobody has reached yet, which is every slide but the first.
- The slide placeholder sits under the media, not over it.

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
- A media URL carries `?v=<updated_at>`; a path never does.
- An in-place edit archives the previous bytes *before* it runs.
- Deleting a media file fills a bin and keeps the bytes.
- A bulk route must be declared above `media/{id}`.
- GD sets two traps and both are invisible in a screenshot.
- The media library's right-click menu is not the only way in.
- Uploads are multi-file and drag-and-drop, and both go through one `UploadProvider`.
- Resize is raster-only, and the UI says so before the request.
- Image alt text is a property of the file, not of the page using it.
- Deleting a media folder does not delete its files.
- Every image preview is the same control, and it has no options.
- A `CoverField` needs the URL, not just the path.

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
- Below `lg` that sidebar is a horizontal strip, so adding a group is an overflow risk and not a free change.
- Blog and Careers are sections too, and Careers is the one that spans two roles.
- A group with exactly one visible child renders as that child.
- The settings screen had the same disease one level down, and a wrapping strip is why nobody noticed.
- `SECTIONS` is the only list, and `ORDER` is derived from it.
- Every panel still stays mounted, and grouping the strip must never change that.
- The activity log records by rule, not by a list of routes.
- Nothing writes a credential into it.
- It is append-only and there is no delete endpoint.
- An activity subject must be in the morph map.
- Sign-in is recorded at the call site, not by the middleware.
- A bar sized against the peak is a shape, not a quantity.
- `resolved_at` is stamped on arrival and cleared only by a reopen.
- A chart bar and a badge for the same word share one map.
- Client errors are grouped by fingerprint, and resolving one is a tick that re-opens itself.

### The public site's chrome — `docs/site-chrome.md`

Header, footer, banners, the logo cap, phone-width reversals.

- The site header's desktop nav appears at 1280px, not 1160.
- The footer's newsletter signup is a band, not a column widget.
- The signup's motion is CSS: `translate` on the arrow, one finite heart keyframe inside the reduced-motion guard, no jQuery or GSAP.
- Every first- and second-level page opens on a section banner, and the contrast is a ceiling rather than a hope.
- A height cap on the logo bounds nothing horizontally, and the header has no room to spare.
- The logo's box is reserved from the file's own dimensions, which the API sends.
- The blog's category strip wraps below `sm` and the footer's link columns sit two abreast below `lg` — both reversed on measurement.

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
- The aurora backdrop's opacity is derived per theme, and the audit cannot see it.
- A doubled marquee track needs its gap on the item, not on the parent.
- A raw coordinate jumping at a loop boundary is not itself the defect.

### Theme generation — `docs/theming.md`

Five colours to every token, dark neutrals, fonts, the contrast gate.

- `npm run themes` checks 30 palettes — 15 presets, the one legacy ramp and 14 hostile inputs, each in both schemes.
- A theme is generated from five colours, and a typed hex is hue intent, not a literal.
- Dark neutrals are derived from the theme's own hue, and for months they were olive whatever the theme.
- Secondary and Accent drive a defined starting set, and the blurb says so.
- Fonts are the nineteen vendored faces, chosen by id.
- A fluorescent theme keeps its neon in the fill, never in the text.
- A theme is not shippable until `npm run themes` passes.
- `preload: false` on every theme face is what keeps ten themes costing what one costs.

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
  - The whole company profile from `CompanyProfileSeeder`: four invented
    team members, six fictitious clients, three certifications with made-up
    certificate numbers, and the partner tiers on Cisco and Fortinet — the
    last being a claim about a third party. All create-only, so replacing
    them in the console is permanent.
- **The logo is a text placeholder.** `#4A5A2A` is sampled from a screenshot,
  not the real file. See `web/src/components/layout/logo.tsx`.
- **`/privacy` and `/terms` are placeholder copy.** They read as real policy
  and are not. Needs a qualified legal review before launch.
- **The repository is public.** No secrets are committed and history is clean,
  but one accidental `git add -f .env` would be scraped within minutes.

See @README.md for setup detail, Plesk deployment and the full change history,
and @API.md for the endpoint reference — every route, what it returns, and the
behaviour that is not obvious from the signature.
