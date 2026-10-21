# Native analytics

This site counts its own visits (0.188.0): page views, searches, downloads,
calls, emails and enquiries, with no cookie, no storage in the browser and no
third party. It does not replace Google Analytics 4 — the two run side by side —
but the console's own figures (Analytics, the store funnel, the leads' sources,
the SEO overview's Analytics column, the dashboard) read these counts first.

The spec is `docs/superpowers/specs/2026-10-21-native-analytics-design.md`; the
plan is `docs/superpowers/plans/2026-10-21-native-analytics.md`.

---

## What is counted, and what never is

**Counted**: a `pageview` of every public page, an `outbound` click to another
site, a `download`, a `contact` click (a `tel:`, `mailto:` or WhatsApp link), a
`search` (the site's and the shop's), and seven conversions — `enquiry`,
`order_placed`, `order_paid`, `visit_requested`, `meeting_booked`,
`event_registered`, `newsletter_signup` (`App\Support\Analytics\Kinds`).

**Never counted**, in this order:

- The console, the portal, the API, `/_next` and every page a secret addresses —
  `Collector::EXCLUDED`, and `NEVER` in `web/src/lib/analytics-beacon.ts`
  mirrors it. `analytics-beacon.check.mjs` carries a third copy, with a comment
  saying so: change all three together.
- A browser that sends **Do Not Track** or **Global Privacy Control**: the
  beacon stays silent and the route handler drops what arrives with either
  header.
- A bot (`Bots::is`, a pattern over the browser's name), a visit from an
  address in `native_analytics_exclude_ips`, and a request marked as a signed-in
  staff browser while `native_analytics_count_staff` is off.
- The address and the browser's full name are **never stored**. A hit holds the
  page, the source, a device class, a browser family, an operating system, a
  country, and the daily code below.

A conversion is a fact rather than a browser looking, so it skips the bot check
(`order_paid` from a gateway's webhook is still an order). The switch and the
excluded addresses apply to it — except `order_paid`, which skips the excluded
addresses and the staff rule too: money arrived whoever confirms it, and an office
that excludes its own address must not lose its COD, bank and UPI revenue.

---

## The visitor code, and why no consent is needed

`Visitor::hash` is the first 16 bytes of `sha256(day's salt | address | browser
| the site's host)`. The salt is random, made by the day's first hit, held in the
cache until the end of that day in the app's timezone and then gone. Gone means
deleted: the file and database cache stores never remove an expired key that is not
read again, so `technoware:analytics-rollup` (00:20) `Cache::forget`s the salts of
the previous three days (`Visitor::forget`; three, so a missed run is caught up).
`Visitor::salt` makes another if the key expires between `add` and `get`, and
returns `''` when the cache refuses writes — `Collector` then records nothing,
because an unsalted hash would follow a person for ever. So:

- the same person on the next day is a different code, and nobody — including us
  — can join the two;
- the address is not recoverable from the code, and is not stored anywhere;
- nothing is written to the browser, so there is nothing for the cookie law to
  ask about. The consent banner (`cookie_consent_enabled`) governs GA4 and the
  pixel, not this.

A **visit** is therefore "one code on one day", which is why the console says a
visit resets at midnight and why a visitor who returns after midnight is a new
visit.

---

## How a hit gets in

1. `AnalyticsBeacon` (in `(marketing)/layout.tsx`, mounted after the page is
   idle, the chat loader's rule) sends one `navigator.sendBeacon` to
   `/api/collect` per page view and per qualifying click. It takes `enabled` as
   a prop from the settings and **never reads a cookie** — the layout is
   ISR-cached.
2. `app/api/collect/route.ts` reads at most 2 KB, drops DNT/GPC, forwards the
   body to `POST /collect` with the visitor's address (`clientIpHeaders()`),
   their browser as `X-Visitor-Agent` and, when the `tw_admin_session` cookie is
   present, `X-Visitor-Staff: 1`. It answers 204 whatever happens, inside two
   seconds.
3. `POST /collect` answers 204 always and has **no throttle middleware**:
   `Collector` rate-limits per address (`RateLimiter`, 120 a minute, beacon
   kinds only) and silently drops beyond it. Server-side conversions are never
   rate-limited — an office behind one address must not lose real orders.
4. `Collector::record` is the one writer of `analytics_hits` and never throws.
   `X-Visitor-Agent` and `X-Visitor-Staff` are believed only from a
   `TRUSTED_PROXIES` address.

### Staff

The route handler forwards the staff cookie's presence; the API drops the hit
unless `native_analytics_count_staff` is on. A **conversion recorded on a
request authenticated as staff** (a lead typed in at the desk, a registration, a
meeting) is not a visitor's and is skipped (`Conversions::record`), with one
exception: `order_paid` is counted whoever records it, because money arrived.

### The entry source

The first pageview of a visitor's day is the **entry** (`entry = true`) and
carries the source: `Source::of` reads the referrer and the UTM tags into a
channel (`search`, `social`, `email`, `referral`, `campaign`, `direct`), a
source name, a medium, a campaign and the referrer's host. A later view or a
conversion **keeps the visit's entry source** unless it carries a source of its
own — a UTM tag, or a referrer that is not this site. A conversion reads the
form's envelope (`PageContext`: referrer and `utm_*`) first, then the visitor's
same-day entry hit, then direct.

`order_paid` takes the attribution of **its own order's `order_placed` hit**
(`Conversions::placed`: kind, target = the order number and the order's day in the
app's timezone, else by number alone) — the same visitor, channel, source, medium,
campaign, referrer host, page, device, browser, OS and country — so a payment
confirmed by a webhook or by staff is credited to the visit that placed the order.
With no placed hit it is recorded as direct.

### Search and conversions where they happen

`Conversions::search` is called by `SearchController` (the site search) and
`StoreController` (the shop's `?q=`) **only when the request carries `record=1`**
(absent means do not record). The website sends it from the `/search` results page
and from the shop listing a person lands on after submitting a search, and never
from the header's type-ahead (`/api/search`, debounced: "fir", "fire", "firewal"),
the 404 page's suggestions or the shop's suggest box. A term counts **once per
visitor, scope and day** (`Cache::add` on a hash of the visitor code, scope and
term, expiring at the end of the day). The term is lower-cased, whitespace folded, at
most 100 characters, and **dropped when it contains `@` or seven digits** (a
phone number, an order number with a person behind it). `results` is the count
the page showed; a `NULL` count was never recorded and is not "found nothing".
Conversions are recorded from `Order`'s `created`/`updated` hooks, `LeadIntake`,
`SubscriberIntake` (signup and banner sources only — a person signing up, not an
import) and the visit, meeting and event doors. A command or a worker has no
visitor, so it records nothing.

---

## Storage, the rollup and the prune

`analytics_hits` holds the raw rows. `technoware:analytics-rollup` (00:20)
rebuilds each closed day whole into `analytics_daily` (dimension, key, kind,
views, visitors, entries, bounces, value) in one transaction, so running it twice
changes nothing. `technoware:prune-analytics-hits` (03:55) deletes raw rows older
than 90 days **only once their day is rolled up**: the totals stay, the rows go.

**"Conversions" counts a paid order, not a placed one.** `Kinds::COUNTED` is every
conversion kind except `order_placed`: the report's `conversions` figure, and
`breakdown?kind=conversions` (which the console's Conversions-by-channel panel
reads, so there is no list of kinds in TypeScript). `order_placed` hits stay stored
and can be asked for on their own kind ("Orders placed"); counting it beside its
`order_paid` counted one order twice.

A **bounce** is a visitor with exactly one pageview that day. The `entry`
dimension stores `visitors = 0`: it counts entries, and the API sends `visitors:
null` for it.

### `Report` and today

`App\Support\Analytics\Report` is the one reader: `summary`, `series`,
`breakdown`, `search`, `now`, `pages`, `productViews`, `rows`. Closed days come
from `analytics_daily`, **summed by the database** per (dimension, key, kind)
— and per day for a series — never loaded row by row; **today is merged in from the raw hits** (`Rollup::rows`
for today), so a figure is live without waiting for midnight. Yesterday reads
zero until the 00:20 rollup. The "Now" tile reads only yesterday onward (the
`(day, kind)` index) so it does not scan the table. The search list and the per-page view read raw hits,
so they cover **at most the last 90 days** whatever range is chosen, and the
screen says so.

---

## The console

- **Analytics** (`/admin/analytics`, `admin,seo_manager,content_manager`) —
  the period (7, 30 or 90 days, this month, last month, custom dates) and compare (previous period, same dates last year,
  none), seven tiles, a by-day chart with the previous period dashed, then
  panels: top pages, entry pages, channels, sources, campaigns, devices,
  browsers, countries, conversions by channel, searches, searches that found
  nothing, links to other sites, downloads, calls/emails/WhatsApp. Each panel
  has a CSV. "Right now" is the pageviews of the last 30 minutes.
- **One page** (`/admin/analytics/page?path=`) — views and visits by day, where
  its visitors came from, and the conversions made on it
  (`conversions: [{kind, label, count, value_paise}]`).
- The **store funnel** (`funnel.product_views`, `views_source`), the **leads**'
  sources (`GET /admin/leads/sources`), the **SEO overview**'s Analytics column
  (`meta.analytics.source`) and the **dashboard**'s Traffic panel read the same `Report`.
- **GA4 fallback**: when native counting is **off**, the console's figures fall
  back to Google Analytics 4 if it is connected (`views_source` and
  `meta.analytics.source` say `ga4`); never both in one column.

---

## The country table

`Geo::country` reads one of two committed binaries, `api/resources/geo/country-v4.bin`
and `country-v6.bin` (packed ranges, binary-searched with a static file handle —
nothing is loaded whole), or a CDN country header (`CF-IPCountry` and the like)
when one is present. They are built from **db-ip "IP to Country Lite"**
(CC BY 4.0, https://db-ip.com) by `php scripts/build-geo.php` from `api/`; the
licence asks for a credit, which the manual's chapter 38 carries. Rebuild it once a quarter; it adds ~15 MB to the repo and
the release zip each time, so do not rebuild casually.

---

## The switches

| Setting | Where | Meaning |
|---|---|---|
| `native_analytics_enabled` | Site → Settings → Analytics (`analytics` group, public) | Off: nothing is counted and the beacon is not mounted. Seeded **on** |
| `native_analytics_exclude_ips` | Settings → Infrastructure (`native_analytics`, private) | One address or CIDR range per line; checked on save by `Collector::refusalFor` |
| `native_analytics_count_staff` | Settings → Infrastructure | Off (seeded), a signed-in staff browser adds nothing |

`native_analytics_enabled` is read through `settingEnabled()` (a string), and by
`Collector::enabled()` on the API side.

---

## Traps

- **`headless` is a bot.** A Playwright browser says so in its agent, and is
  rightly not counted: `scripts/probes/native-analytics.mjs` sets a Chrome agent
  on its visitor context.
- **A redirect, a refresh or a quick navigation can lose the first view.** The
  beacon waits for the page to be idle; a visitor who leaves within a second is
  not counted. That is the price of not delaying the paint.
- **The first page view carries the referrer and the UTM tags; later ones do
  not.** It is the entry hit's source that later events borrow.
- **Do not add a cookie read to the marketing layout** for the staff rule: it
  would make every public page dynamic. The route handler decides.
- **An excluded path in one list and not the other** counts a page the API would
  refuse (or the reverse). Change `Collector::EXCLUDED` and `NEVER` together.
- **`/admin/analytics/pages` is not the list of pages** — it is one page's view
  (`?path=`). The ranking is `breakdown?dimension=page`.
