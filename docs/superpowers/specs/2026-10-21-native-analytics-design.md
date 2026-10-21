# C3 — Cookieless native analytics (0.188.0)

**Status:** design approved in conversation 2026-10-21; this spec awaits review.
**Roadmap:** Technoware 2.0, track C (corporate), third release.

## Purpose

A client with no Google account still gets honest traffic figures from the
first day, for every visitor, without a consent prompt. The site counts its own
visits: no cookie, no local storage, no third party, nothing personal stored.

## The client's decisions (2026-10-21)

1. **Beside GA4.** Native counting is always available and is what the
   console's own figures read. GA4 and the Meta Pixel stay as optional extras,
   still behind the consent banner. The SEO overview's views column and the
   store funnel read the native figures.
2. **What is counted:** page views and visitors, top pages, sources and
   campaigns, devices, countries — plus **conversions**, **site search terms**
   (with the searches that found nothing) and **downloads and outbound links**
   (including phone, email and WhatsApp taps). Scroll depth and time on page are
   **not** counted.
3. **Who sees it:** administrators, SEO managers and content managers open the
   Analytics screen; store managers see the shop funnel on the store dashboard;
   sales managers see conversions by source on the leads screen.
4. **Retention:** raw page views for **90 days**; daily totals kept for good.

## Collection

### The beacon

A client island, `AnalyticsBeacon`, mounted in `(marketing)/layout.tsx` beside
`Analytics`, sends one `navigator.sendBeacon("/api/collect", …)` per page view —
on the first load and on every App Router navigation (a pathname change, never
a search-param change alone). The body is plain JSON text:

```json
{ "k": "pageview", "p": "/solutions/networking", "r": "https://www.google.com/",
  "u": { "source": "newsletter", "medium": "email", "campaign": "oct" }, "w": 1440 }
```

- `p` is the path only; the query string is never sent except the UTM tags,
  which travel separately in `u` (`utm_source`, `utm_medium`, `utm_campaign`).
- `r` is `document.referrer` on the first view of a page load and empty on an
  in-site navigation (the source of a visit is where it arrived from).
- `w` is the viewport width, bucketed on the server.
- One delegated `click` listener sends `k: "outbound"` (a link to another
  host), `k: "download"` (a link to `/api/downloads/…`, a `download` attribute,
  or a file extension in the library's list), and `k: "contact"` for `tel:`,
  `mailto:` and `wa.me` links, each with the link's target in `t`.

It sends nothing when:

- native analytics is switched off (`native_analytics_enabled` is a public
  setting, read by the layout);
- the browser sends **Do Not Track** or **Global Privacy Control**;
- the page is one a secret addresses — the same list that keeps `Analytics`
  off: `/order/*`, `/newsletter/unsubscribe/*`, `/store/notify/cancel/*`,
  `/preview/*`, `/visit/*`, `/meeting/*`, `/events/registration/*`,
  `/ticket-survey/*` — or the console, the portal, or an API route;
- the browser holds the staff cookie (`lib/admin-cookie.ts`): staff browsing
  their own site are not visitors.

### The route handler

`POST /api/collect` (Next) reads the text body, adds the visitor's address
(`clientIpHeaders()`, the rule every uncached call follows) and user agent,
and forwards to the API. It always answers **204** and never waits on the API
longer than two seconds — a beacon has no one to tell.

### `POST /collect` (Laravel, public)

Throttled per route and per caller (the existing limiter); **204 always**,
including for a body it discards. It:

1. Refuses silently: a user agent matching the bot list (`App\Support\Analytics\Bots`,
   a vendored pattern list), no user agent, a path that does not start with `/`
   or names an excluded prefix, an address in `native_analytics_exclude_ips`
   (CIDR ranges, private setting), a body over 2 KB.
2. Computes the **visitor**: `sha256(daily_salt . ip . user_agent . host)`,
   truncated to 16 bytes. The salt is random, held in the cache under the date,
   and replaced at midnight in `APP_TIMEZONE`; yesterday's is deleted. The raw
   address is never stored or logged.
3. Derives:
   - **device** from the user agent and width — `desktop`, `tablet`, `phone`;
   - **browser** and **OS** families (a small vendored parser, families only,
     never a version);
   - **country** — the edge's header when present (`cf-ipcountry`,
     `cloudfront-viewer-country`), else a vendored IPv4/IPv6-to-country table
     (`App\Support\Analytics\Geo`, db-ip "IP to Country Lite", CC BY 4.0, with
     the credit in its docblock and the manual), else unknown;
   - **source** from the referrer and UTM tags: a UTM source wins; else the
     referrer's host, named for the common ones (Google, Bing, LinkedIn,
     Facebook, X, Instagram, YouTube, WhatsApp) and grouped into a **channel** —
     `search`, `social`, `email`, `referral`, `campaign`, `direct`; this site's
     own host is direct.
4. Writes one `analytics_hits` row.

### Site search terms

Recorded **where the search runs**, not by the beacon: `GET /search` and the
shop's search (`/store/products?q=` and its suggestions) write `k: "search"`
with the term (trimmed, lower-cased, at most 100 characters), the scope (`site`
or `shop`) and the result count. A term that looks like an email address or a
phone number is not stored. Throttled with the visitor so one script cannot
fill the list.

### Conversions

Written **server-side where they already happen**, never from the browser:

| Event | Where |
|---|---|
| `enquiry` | `LeadIntake` — the contact form, editor-built forms, the chatbot, blocks |
| `order_placed`, `order_paid` | `Checkout`, `Settlement` |
| `visit_requested`, `meeting_booked` | `VisitActions`, `MeetingActions` |
| `event_registered` | `EventActions` |
| `newsletter_signup` | `SubscriberIntake` from a public form |

Each is attributed, in this order:

1. the `PageContext` envelope the request carries (`_source_url`, `_referrer`,
   `_utm_*` — every public form already posts it), which names the page and the
   source of the visit that sent it;
2. else the **same day's entry hit for the same visitor hash**, computed from
   the address and user agent the request carries (the Next server forwards
   `X-Forwarded-For` on every uncached call already, and will forward
   `User-Agent` beside it for this);
3. else `direct`, with no page.

A visitor cannot be followed past midnight by design, so a purchase made the
day after the visit that brought someone is attributed to the day it happens
on. A conversion carries a value only for an order (paise).

A conversion recorded must never fail the request that caused it — the
`Notifier` rule.

## Storage

- **`analytics_hits`**: `id`, `day` (date), `at` (datetime), `kind`
  (`pageview`, `outbound`, `download`, `contact`, `search`, or a conversion
  name), `path` (≤ 255), `visitor` (binary 16), `channel`, `source`, `medium`,
  `campaign`, `referrer_host`, `device`, `browser`, `os`, `country` (char 2),
  `target` (≤ 255: the outbound URL, the search term, a conversion's reference),
  `results` (int, a search's count), `value_paise`, `entry` (bool: the first
  page view of that visitor that day). Indexed on `day`, `(day, kind)`,
  `(day, path)`. Pruned at **90 days**.
- **`analytics_daily`**: one row per `day` × `dimension` × `key` × `kind` with
  `views`, `visitors`, `entries`, `value_paise`; dimensions `page`, `channel`,
  `source`, `campaign`, `device`, `browser`, `os`, `country`, `target`, `total`.
  Built nightly by `technoware:analytics-rollup` for every closed day not yet
  rolled (resumable, idempotent: a day is rebuilt whole). **Kept for good.**
  Visitors in a daily row are exact for that day; across days they are summed
  and labelled "visits" in the console, since a person cannot be followed from
  one day to the next by design.
- **Reports for a range** read `analytics_daily` for closed days plus
  `analytics_hits` for today, through one `App\Support\Analytics\Report`.

## The API (staff)

`role:admin,seo_manager,content_manager` unless noted.

- `GET /admin/analytics/summary?from=&to=&compare=previous|year|none` —
  visitors, views, entries, views per visit, the bounce share (single-view
  visits), conversions, each with the comparison and a daily series.
- `GET /admin/analytics/breakdown?dimension=&from=&to=&kind=&limit=` — the
  top rows of one dimension.
- `GET /admin/analytics/pages/{path}` — one page's series, sources and
  conversions.
- `GET /admin/analytics/search?from=&to=&scope=` — terms, counts, and the
  "found nothing" list.
- `GET /admin/analytics/now` — page views in the last 30 minutes and their
  pages (no visitor list).
- `GET /admin/analytics/export?…` — the breakdown as CSV through the one CSV
  writer.
- The store dashboard's funnel (`role:store_manager`) and the SEO overview's
  `analytics` column read `Report`; GA4's figures remain where GA4 is
  connected, beside them, labelled.
- `GET /admin/leads/sources?from=&to=` (`role:sales_manager`) — conversions by
  channel and source.

Every label on the wire (dates, channel names, country names) is the API's.
A figure over no data is **null, never zero**.

## The console

- **Site → Analytics** (`/admin/analytics`): a period picker (7 / 30 / 90 days,
  this month, last month, custom) with a comparison; tiles for visitors, views,
  views per visit, bounce share, conversions; an area chart; top pages, entry
  pages, channels and sources, campaigns, devices, browsers, countries,
  conversions by source, search terms and "found nothing", outbound and
  download clicks. A row opens its page's own view. Built with the chart kit
  (`components/charts/`). A **Now** tile polls once a minute while visible.
- The store dashboard and the leads screen gain their panels for their roles.
- The dashboard widget list gains an optional **Traffic** panel.
- Help: manual chapter 38, help-routes for the new screen.

## Settings

The `analytics` group (public, already holding the GA4 and Pixel ids) gains
`native_analytics_enabled` (on). A private `native_analytics` group holds
`native_analytics_exclude_ips` (one CIDR per line, validated) and
`native_analytics_count_staff` (off). The console shows, on Settings →
Infrastructure, what is collected and why it needs no consent, in one paragraph.

## Privacy

- No cookie, no `localStorage`, no fingerprint beyond the day's salted hash; the
  raw address is never written to the database or a log.
- The consent banner is unchanged and still governs GA4 and the Pixel only; the
  privacy-policy placeholder gains a paragraph describing native counting.
- DNT and GPC are honoured. The Report-Only CSP needs nothing new: the beacon
  posts to the site's own origin.

## Performance

- The beacon is one small client module loaded after idle, like the chat
  launcher; it adds no request to the page's own render and never blocks.
- `POST /collect` does one insert and no reads beyond a cached salt and the
  geo table (memory-mapped binary search over a vendored file).
- Reports over 90 days read daily rows, never raw hits, except for today.

## Testing

- Feature: collection (hash rotation, raw IP never stored, bot and excluded
  paths and IPs dropped, staff skip, DNT/GPC handled in the beacon, 204 always,
  throttle), source and channel derivation (table of referrers and UTM cases),
  device/country derivation, search recording (email/phone terms dropped),
  every conversion source writes once and never fails its request, rollup
  idempotence and the 90-day prune, reports (null over no data, comparison
  arithmetic, today merged with closed days), role narrowing.
- Web: a check script for the beacon's path and referrer rules; tsc, lint.
- Probe: walk five pages with in-site navigation, press an outbound and a
  download link, search for nothing, then read `/admin/analytics` and check the
  numbers; confirm a signed-in staff browser adds nothing.
- Audits: `/admin/analytics` light, dark and mobile; the public site's audit
  confirms no new console error and no CSP report.

## Out of scope

Scroll depth, time on page, heatmaps, session recordings, funnels beyond the
store's, user-level journeys, a public share link, real-time beyond the Now
tile, importing GA4 history.

## Release

API.md, `docs/analytics.md`, CLAUDE.md module block, the mock, manual chapter
38 and help, VERSION.md 0.188.0.
