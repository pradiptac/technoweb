# Design audit — 2026-09-19

Front end, back end and the database, on `phase-3-admin-cms` at 0.67.0
(the mailbox import), with everything in the working tree. Three passes:
a **design review** of each side against the project's own rules and the
React/Next and Laravel practice guides loaded for it; the **measured
audits** the Definition of done names (`npm run audit` light and dark,
`npm run audit:mobile`, `php artisan technoware:profile`, the API suite,
Larastan); and a **database pass** that read every query against a dump
of every index and then proved the changes on 200,000 synthetic tickets.

Prior audits this builds on and does not repeat:
`deep-code-audit-2026-09-03.md`, `review-2026-09-14.md`,
`ux-audit-2026-09-15.md`, `perf-audit-2026-09-18.md`,
`seo-audit-2026-09-18.md`.

**Gates, all green after the changes below:** 1,286 API tests (1 skipped —
the SES build), Larastan "No errors", Pint, `tsc`, `eslint`, the four
newsletter routes and the campaign editor clean in light, dark and at
320–414px; the full route list's result is at the foot.

---

## 1. Backend design

Reviewed for fat controllers, N+1 paths outside test coverage, unbounded
reads on tables that grow, locking and idempotency on money and stock,
role boundaries, job and scheduler discipline, and duplicated definitions
of one concept. The reviewer's own summary: "unusually disciplined for
the areas in scope" — checkout and settlement lock rows in id order and
re-price inside the transaction, `Settlement` is idempotent on the unique
`gateway_payment_id` and catches the race rather than checking first,
`DigitalFulfilment` claims a code with a conditional UPDATE and an
affected-row check, every job declares `$tries`/`$timeout` under the
database queue's 90s `retry_after`, every scheduled entry that could
overlap is `withoutOverlapping`, every export is `lazyById` or aggregate
SQL, every admin index paginates with a stable tiebreak.

Three findings, all fixed:

### 1.1 The ticket dashboard loaded the whole desk into PHP — fixed, measured

`TicketMetrics::firstResponseHours()`, `resolutionHours()` and
`slaFirstResponse()` each pulled every answered ticket's two timestamps
into a Collection to sort for a median or count a comparison, and
`openBy('category')` loaded every open ticket *with its category* to
group in PHP. All-time figures by design, so the cost grows with the
desk's history — and the dashboard is the first screen every staff
session opens.

All four are one query now: the median through `ROW_NUMBER() OVER` and
`COUNT(*) OVER` (MySQL 8 has no `MEDIAN`; the two middle rows are averaged
exactly as the PHP did), the SLA share as `SUM(first_responded_at <=
due_at)`, the category grouping as `GROUP BY ticket_category_id` with the
six names fetched afterwards. And the whole `metrics` block is held in the
cache for sixty seconds (`DashboardController::METRICS_CACHE_KEY`): a
chart a minute old describes the same desk, and one staff member's view
now pays for the next twenty.

Measured on 200,000 synthetic tickets in `technoweb_test`:

| | before | after |
|---|---|---|
| median first response | 19,173 ms | 666 ms |
| SLA share | 23,120 ms | 260 ms |
| open by category | 23,250 ms | 1,480 ms |

The remaining second in "open by category" is a full scan of a table
whose synthetic two-thirds are open; a real desk is mostly closed and
the `(status, …)` index prefix does the work. It is behind the cache
either way.

### 1.2 `bulk()` looked the assignee up once per ticket — fixed

Assigning fifty tickets to one engineer ran fifty identical
`SELECT * FROM users WHERE id = ?` for the sake of a name in each event
line. `TicketController::staffName()` memoises per request.

### 1.3 `SeoController::ENTITIES` had no test keeping it honest — fixed

The list of record types the SEO overview scores is hand-written and had
drifted three times (`JobOpening`, `StoreProduct`, `StoreCategory` each
carried `HasSeo` for months with no score and no Recheck button).
`SeoEntityCoverageTest` reflects over `app/Models` for the trait and
compares both ways, the `MorphMapCoverageTest` shape: the commit that adds
`HasSeo` to a model is the commit this fails on.

### 1.4 Also changed on the way past

- `CustomerGroupSync` removed stale members with `whereNotIn($emails)`
  bound from every active customer's address — a parameter list that grows
  with the customer base, run nightly and on every customer save. It is an
  anti-join (`whereNotExists` against active customers on the same
  lower-cased, trimmed comparison the loop makes) now.
- `ContentController::posts()` filtered the blog archive with
  `whereYear`/`whereMonth`, which wraps the column in a function and
  cannot use the `(status, published_at)` index. It is a `whereBetween`
  over the year's or month's bounds (`archiveWindow()`); a month sent
  without a year is ignored rather than matched across every year.
- `ChatMetrics::today()` summed tokens with `whereDate('created_at', …)`,
  the same non-sargable shape; `whereBetween(startOfDay, endOfDay)` and
  the new index take it from 329 ms to 3 ms at 200,000 messages.

## 2. Database

The development tables hold ten rows each, so `EXPLAIN` says `ALL` about
everything and proves nothing. The pass was: dump every table's columns
and indexes (106 tables), read every query in `app/` against it, and
then seed 200,000 tickets and 200,000 chat messages into
`technoweb_test` to time each change with and without its index.

The schema was already in good shape — every foreign key, every slug and
token unique, composite indexes on the filtered-and-ordered pairs the
list screens use (`(status, priority, created_at)`, `(customer_id,
status)`, `(newsletter_campaign_id, status)`, …), and the morph pairs
indexed. What the migration `2026_09_19_160000_tune_indexes_for_speed`
changes:

**Added**, each for a named query on a table that grows:

| index | serves | measured |
|---|---|---|
| `tickets(created_at)` | the dashboard's 30-day series, the volume trend, the sidebar's once-a-minute "new since" poll | series 386 → 24 ms |
| `tickets(resolved_at)` | the resolved half of the same series | (with the above) |
| `tickets(due_at)` | `?overdue=1` and the dashboard's overdue count | 378 → 313 ms on synthetic data where two-thirds are overdue; a real desk's few overdue rows are what the index is for |
| `leads(created_at)`, `enquiries(created_at)` | the "new since" poll | — |
| `chat_messages(created_at)` | the chat dashboard's window and today's tokens | 329 → 3 ms |
| `payments(gateway_order_id)` | the webhook's fallback lookup when a gateway names its own order id | — |
| `newsletter_events(campaign, event_type, created_at)` | the campaign report's hourly opens/clicks series, index-only now; replaces `(campaign, event_type)`, its prefix | — |
| `media(deleted_at, created_at)` | every library listing is `deleted_at IS NULL ORDER BY created_at DESC`; replaces `(deleted_at)`, its prefix | — |

**Dropped**, each a strict left prefix of a composite on the same table,
which MySQL already uses for the same lookups — a write per insert that
bought no read: `seo_suggestions(seoable_type, seoable_id)`,
`certifications(status)`, `clients(status)`, `team_members(status)`,
`popups(status)`.

**Considered and left alone:** FULLTEXT on the search columns (`/search`
is `LIKE` by design, documented as "needs replacing at five figures", and
FULLTEXT's tokeniser would change what `CBS350-24T` matches); a
`(status, ticket_category_id)` index for the category chart (the
optimiser did not choose it on the synthetic data and the block is
cached); an index on `first_responded_at` for the median (measured: no
gain — the window function scans anyway).

The migration is reversible (`down()` restores every index) and was run
up, down and up on the development database.

## 3. Frontend design

Reviewed for request waterfalls, client/server boundaries and bundle
weight, fetch caching, Server Actions' invalidation and `redirect()`
placement, duplicated definitions against the API, effects that should
be events, and the accessibility structure the audits cannot measure.
Every `[id]/page.tsx` sampled parallelises its record and picker fetches;
every action checked invalidates the right tag with `redirect()` outside
its `try`; nothing in `lib/admin/*` or `lib/portal.ts` passes `revalidate`;
every client icon import is from `icons-ui`; every raw `<dialog>` outside
`Modal` is a documented exception; the 0.67.0 mock mirrors the API.

Two findings, both fixed:

### 3.1 `locations/[id]` fetched the record, then its pickers — fixed

The one edit screen still paying two round trips: `locationPickers()`
needs only the id, which `params` already held. `Promise.all`, as every
sibling screen does.

### 3.2 `ThreadRefresh` adjusted state from an effect, through a microtask — fixed

`components/portal/ticket-live.tsx` set the "new replies" pill from a
`useEffect` on the `count` prop, wrapped in `queueMicrotask` so
`react-hooks/set-state-in-effect` would not see it — one render more per
poll, achieved by dodging the rule. It keeps the previous prop in state
and adjusts during render now, React's own shape for state that follows
a prop; no effect, no microtask, no `useRef`.

### 3.3 By eye

Screenshots of the dashboard, the ticket queue, the mailbox wizard, the
homepage and the store at 1440px, read against the hierarchy and density
critiques:

- **Mailbox wizard**: the stopped-queue panel said "A campaign is sent by
  background jobs, so this one will be accepted and then sit at
  Sending" — on a screen where a *scan* is refused, not accepted.
  `DeliveryStatus` takes a `subject` now and the wizard passes `scan`.
- **Homepage ticker** read "appointmPRICES SLASHED" — the stored
  `announcement_message` was garbled (a previous editing session), not
  the marquee; the row was corrected. Worth knowing: it looked exactly
  like the doubled-track overlap `docs/motion.md` records.
- **Homepage hero** appeared as empty dark cards in the first screenshot
  and correct in the second: the dev server encoding five WebP variants
  on first request, the `npm run warm-images` note in CLAUDE.md, not a
  defect.
- **Dashboard**: nine equal-weight tinted tiles with no single entry
  point. Deliberate for a screen worked at a desk, and the tints are
  semantic (red overdue, amber leads, green published). Not changed.
  "Open by category" truncates its labels at ~12 characters
  ("Network / Co…"); the full name is in the title attribute. Minor.
- **Store**: hero, filter strip and category discs read in the right
  order; nothing to change.

### 3.4 Measured

Found by `npm run audit:mobile` while verifying the mailbox screens:

- **A scroll container inside a grid item still widens the column.** The
  crontab line in `DeliveryStatus` sits in a `<pre overflow-x-auto>`,
  which kept the *page* from scrolling and still contributed its content's
  min-content width to the wizard's `grid gap-5` — every field and radio
  card in that column was 567px wide at 360, while the `<pre>` scrolled
  happily inside. `w-0 min-w-full` on the scroll container is the fix,
  and it is recorded in CLAUDE.md under "Type, measure and overflow".
- The subscribers screen's three header buttons overflowed 320 by 68px
  with the third button added — `flex-wrap`.
- The callback path in the wizard's "no OAuth client" alert and on the
  callback page is one unbreakable 52-character run — `[overflow-wrap:anywhere]`.

Full route list: see the foot of this file.

## 4. API profile

`php artisan technoware:profile`, 31 public endpoints: 1–13 queries each,
1.3–28 ms of SQL, the heaviest `/menus/primary` (6 queries, 28 ms, cached
600 s in front) and `/search` (13 queries, 17 ms). Unchanged from the
2026-09-18 speed audit and not the subject of this pass; the tables the
public site reads are the small ones.

## 5. What was not done

- No FULLTEXT search, for the reason in §2.
- No caching of the newsletter dashboard's aggregates (they read
  recipient rows through `(campaign, status)` and are per-campaign
  manager, not per session); revisit when a campaign list is in the
  hundreds.
- The `overdue` index's gain could not be shown on synthetic data whose
  distribution is nothing like a desk's; it stays because the query shape
  is right and the cost is one small index.

---

## Route audit results

Recorded after the fixes above, with a throwaway administrator.

**`npm run audit` (light), 155 routes: 152 clean.** The three reports are
the two dev-server artefacts CLAUDE.md already names, not the site:
`/industries` and `/case-studies` had a cover answer `504` from
`/_next/image` — the single-worker API encoding WebP variants under the
audit's burst, the reason `npm run warm-images` exists — and `/admin`
logged Node's `MaxListenersExceededWarning … drain listeners added to
[Gzip]`, the dev server's own compression of the dashboard's streamed
payload ("How the audits behave"). Neither reproduces against
`npm run start`.

**`npm run audit:mobile`, 111 routes at 320/360/390/414: all clean.**

**`php artisan test`: 1,286 passed, 1 skipped (8,499 assertions).**
