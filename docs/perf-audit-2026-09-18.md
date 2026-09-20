# Speed audit — 2026-09-18

Measured, not read: `npm run perf` against a production build
(`next build` + `next start`, images warmed, fresh browser context per
route, cold and warm hit each), `php artisan technoware:profile` for the
API, the build's own output for the bundles, and a static pass over the
codebase against the React/Next performance rules (waterfalls, bundles,
caching, rendering). Snapshot: `web/perf-2026-09-18T06-53-03-326Z.json`.

**One number to hold onto while reading this: on this machine every API
round trip costs 0.65–1.2s**, measured with curl against `php artisan
serve` (`/solutions` 0.67s for 11ms of work inside the kernel). That is PHP
compiling the framework on every request — OPcache is off here — and it
never reaches production, where PHP-FPM with OPcache answers the same
endpoint in 14–18ms (`README.md`, "three settings that decide how fast the
API answers"). Everything below separates what is the laptop from what is
the site.

## 1. What is fast

| Route | cache | TTFB cold / warm | LCP cold / warm | JS |
|---|---|---|---|---|
| `/solutions/networking` | HIT | 28 / 23 ms | 476 / 472 ms | 301 KB |
| `/industries/manufacturing` | HIT | 27 / 16 ms | 532 / 460 ms | 301 KB |
| `/case-studies` | HIT | 35 / 26 ms | 648 / 492 ms | 293 KB |
| `/knowledge-base/…` (article) | HIT | 28 / 18 ms | 368 / 192 ms | 302 KB |
| `/blog/…` (post) | STALE → HIT | 157 / 26 ms | 652 / 248 ms | 303 KB |
| `/` | STALE → HIT | 227 / 46 ms | 2084 / 780 ms | 293 KB |

Every ISR route answers from the cache in tens of milliseconds, LCP is
under 800ms warm on all of them, CLS is 0 on 20 of 22 routes, and the JS
on the wire is 293–307KB on every route — one bundle, no route-specific
bloat. The API side is tight: 1–8 queries per public endpoint, 2–4ms each,
the heaviest (`/search`) 13 queries in 35ms inside the kernel. The things
CLAUDE.md records as fixed stay fixed: WebP only, `/_next/image` for every
public image, the map and the assistant deferred, fonts unpreloaded except
the two in use.

## 2. Findings, in order of cost

### P1 — Every route prefetches 25–36 pages it is not on (medium, easy)

The cold `/` makes **21 `fetch` requests for 104KB**; `/products` 32 for
152KB; a blog post 36 for 162KB. That is the App Router prefetching the RSC
payload of every `<Link>` in the viewport — the mega menu's panels, the
footer's forty links — after load. It costs more bytes than the JavaScript
(293KB) on most routes, and on a phone it is data spent on pages the
visitor did not ask for. `prefetch={false}` on the footer's columns and
the policy row, and on the mega menu's panel links (the panel is opened by
hover, so prefetch on hover — `prefetch="auto"` with the link becoming
visible when the panel opens — already covers the case that matters),
leaves prefetch on the primary nav and in-content links, where a click is
likely. Expected: fetch requests per route from ~28 to under 10, ~100KB
less per cold visit.

Files: `components/layout/site-footer.tsx` (`FooterLinks`, `BottomRow`),
`components/layout/mega-menu.tsx`, `components/layout/top-bar-panel.tsx`.

### P2 — The dynamic routes pay two or three API round trips per request (medium here, low in production)

| Route | cache | TTFB cold / warm | why |
|---|---|---|---|
| `/products/switches` | none | 1810 / 968 ms | `resolveProductSlug` (category, then products) then `brands()` — three calls, two of them sequential |
| `/products/servers` | none | 945 / 1097 ms | same |
| `/store` | none | 222 / 984 ms | four calls in `Promise.all` — already parallel; the TTFB is one round trip plus render |
| `/search?q=switch` | none | 5186 / 4489 ms | one call; measured at 0.9s alone with curl — the 5s was the run's own load on a one-worker API |
| `/products`, `/blog`, `/knowledge-base`, `/contact` | none | 150–220 ms | one call each |

Two things to do, one of them structural.

**Parallelise the category listing.** `products/[slug]/page.tsx` awaits
`resolveProductSlug()` and only then `publicApi.brands()`. Brands do not
depend on the resolution; start both at once. That is the whole gap between
`/products/switches` (1.8s) and `/products/servers` (0.9s) — one round trip.

**Cache the unfiltered index and stream the filtered one.** `/store`,
`/products` and `/blog` are dynamic because they read `searchParams` for
`?q=`, `?page=`, `?category=`. The common visit carries none of those, and
it is rendered on demand anyway. Next 16's `cacheComponents` (the shipped
form of PPR) is built for this: the hero, the category rail, the promo
band and the trust strip become a static shell served from the cache, and
only the listing — wrapped in `<Suspense>` and reading `searchParams` —
streams. TTFB for `/store` goes from ~1s to the shell's tens of
milliseconds, and LCP (the hero slide, today 1.3s warm) no longer waits
for the API at all. It is one config flag plus a Suspense boundary per
route, and it changes what "dynamic" costs everywhere; the trap CLAUDE.md
already records ("Page changed from static to dynamic at runtime") applies
in reverse, so it wants the audit run over the store after the change.

Until then, in production, each of these is one or two 15ms calls and the
figures above shrink by 40×. The order of the two fixes: brands first
(five minutes), `cacheComponents` when there is a day to verify it.

### P3 — The homepage's LCP is a 132KB hero slide (low; cold only)

`/` cold: LCP 2084ms, the element the first slide at `w=1920` (132KB),
77 requests, 1.1MB on the wire of which 447KB is images. Warm it is 780ms.
The slide already carries `priority` and `sizes`; the 1920px variant is the
right one for a 1280px viewport at 1.5× and there is no cheaper one to ask
for. What would move it: the slider's *other* slides (the 4th slide's raw
URL is in the RSC payload, so it is discovered and fetched) — lazy-load
every slide but the first, which `fade`/`zoom` sliders draw only on their
turn anyway; and `fetchpriority="high"` on the first slide's `<img>`, which
`next/image` sets from `priority` already. Expect a couple of hundred
milliseconds, cold only.

### P4 — One route shifted (CLS 0.23 on `/solutions`, cold, once)

Not reproduced in three fresh contexts afterwards (0 each); the warm hit was
0. The likeliest cause is the display face arriving after first paint on a
cold font cache — three font files, 109KB, `display: swap` — and the
solutions grid's headings reflowing. `next/font/local` already applies
metric-compatible fallbacks; if it recurs under `npm run perf`, the fix is
`display: "optional"` on the display face (no swap, no shift; the fallback
stays for that visit) or a `size-adjust` on the fallback. Watch, do not
fix blind.

### P5 — All twelve themes' CSS ships to every visitor (low)

The main stylesheet is 283KB raw / 43KB gzipped, of which the
`[data-theme=…]` rules are 61KB raw / ~7KB gzipped. Only one theme is ever
active on an install. Importing each theme's `theme.css` from its
`templates/index.ts` — which the registry already loads lazily — would put
a theme's rules in the chunk of the pages that render it. Seven kilobytes
per visit; worth doing when the theme CSS grows again, not before.

### P6 — Two API endpoints do repeat work per request (low)

- `/menus/{location}` runs `SiteSection::hasContent()` for every `section`
  item — five `exists` queries — on every render of a menu with them, and
  the layout asks for four menus. 20 queries a layout render, each ~2ms,
  served from Next's cache for 600s so rarely paid — but `Cache::memo()`
  per request, the pattern `Setting::get()` uses, makes it five for all
  four.
- `MediaAlt` loads the whole `path → alt_text` map from `media` on every
  request that renders an image (`select alt_text, path from media where
  alt_text is not null`), memoised per request. It grows with the library.
  A cached map, flushed in the media write paths, is one `Cache::remember`.

### Not findings

- **Bundle**: 293–307KB of JS per route, one shared bundle; `icons.tsx` is
  server-only, `IconField` and the editor are their own chunks, the
  assistant mounts on idle. No barrel-import trap left to fix.
- **Images**: every public image is WebP through the optimiser, every `fill`
  has `sizes`, every well is fixed-ratio (CLS 0 on 20 routes proves it).
- **Third parties**: none load without consent; the map is a poster; the
  reviews embed and `body_code` are the client's own choice.
- **Fonts**: two faces preloaded, the other seventeen `preload: false`.

## 3. Production settings that matter more than any of the above

From `README.md`, restated because they are worth 40× and cost nothing:

1. **OPcache on** (`opcache.enable=1`, `validate_timestamps=0` under
   Plesk's PHP-FPM) — 200–370ms → 14–18ms per API call.
2. `php artisan optimize` on deploy — config, routes (~400), events cached.
3. `CACHE_STORE=file` (or Redis) — settings, throttles and the heartbeat
   are cache reads on every request.
4. `npm run warm-images` after each deploy — the first visitor to a page is
   not the one who pays for the WebP encodes.
5. `ASSET_ORIGIN` and `API_BASE_URL` in the **build** environment.

## 4. Order of work

| # | Item | Effort | Gain |
|---|---|---|---|
| 1 | P2a — start `brands()` beside the slug resolution | 10 min | −1 round trip on every category listing |
| 2 | P1 — `prefetch={false}` on footer and panel links | 1 h | ~100KB and ~20 requests per cold visit |
| 3 | P2b — `cacheComponents` + Suspense on `/store`, `/products`, `/blog` | 1 day incl. audits | dynamic index TTFB from ~1s to ~30ms |
| 4 | P3 — lazy the non-first slides | 1 h | cold homepage LCP |
| 5 | P6 — memo the section checks, cache the alt map | 1 h | API headroom under load |
| 6 | P5 — per-theme CSS chunks | 2 h | 7KB gz per visit |
| — | P4 — watch `/solutions` CLS in the next `perf` run | — | — |

Re-measure after each with `npm run warm-images && npm run perf` against
`npm run start`, and compare the two JSON snapshots.
