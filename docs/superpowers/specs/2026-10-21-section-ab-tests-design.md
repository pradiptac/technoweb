# C4 — Section A/B tests (0.189.0)

Track C of the 2.0 roadmap. Builds on C3 (0.188.0, cookieless native
analytics): every figure here is a C3 hit, so a test needs native analytics
switched on.

## Purpose

An editor wants to know whether a different heading, wording, picture or
button on one section of a page brings more enquiries (or clicks, orders,
sign-ups) than what is there now — and to make the better one the page's
content with one press, without a developer, a third-party tool, a cookie or
a consent banner.

Success: an editor starts a test from the page builder in under a minute,
visitors see one version or the other with no flicker, the console says in
plain words which is ahead and how sure that is, the editor is told in the
bell when the answer is clear, and "Use version B" puts B into the page
through the ordinary page save.

## The client's decisions (2026-10-21)

- **Scope:** one section on a builder page; the editor makes version B (its
  own heading, words, picture, buttons); a 50/50 split.
- **Who sees which:** chosen at random per browser tab, kept in
  `sessionStorage` for that tab. No cookie, nothing that outlives the tab, no
  consent question.
- **The goal:** one per test, picked by the editor — a press on a button or
  link inside the tested section, or one of C3's conversion kinds.
- **Ending:** the console reports confidence in plain words; the editor is
  told in the bell when it is clear; one press applies the winner and ends
  the test. Nothing changes the page by itself.
- **Where:** builder pages only (`template: builder`), the page chosen as the
  homepage included. Not detail templates, not record body sections.

## How a version is chosen (the approach)

Both versions are in the cached page; the one the tab did not get is hidden
before the page paints. Considered and rejected: a proxy rewrite to a variant
address (it cannot read `sessionStorage`, so keeping a visitor on one version
would need a cookie) and a swap after hydration (version A shows first, then
the section jumps).

- **The running tests travel with the settings.** The public `/settings` map
  carries `ab_tests_running`: the ids of every running test, comma-joined,
  absent when there are none (the map drops blanks). It is purged with
  `updateTag("settings")` when a test starts or ends, so it is never more than
  the settings window old. At most **20** tests run site-wide.
- **The root layout's pre-paint script** (the one that already stamps
  `data-scheme`) reads `ab_tests_running`, and for each id: takes the tab's
  choice from `sessionStorage` key `tw_ab` (a JSON map of id → `a`|`b`), or
  draws one with `Math.random() < 0.5` and stores it; then stamps
  `data-ab-<id>="a|b"` on `<html>`. `<html>` already carries
  `suppressHydrationWarning`, so nothing mismatches. Public pages only — the
  console and the portal are skipped by the same path test the script already
  makes. A blocked `sessionStorage` falls through the script's `try` and the
  visitor sees A.
- **The section renders both versions.** `PageSections` wraps a section under
  a running test in `<div data-ab-test="<id>">` holding two children,
  `data-ab-v="<id>a"` and `data-ab-v="<id>b"`, each the ordinary section
  component given that version's data, and one static `<style>`:
  `html[data-ab-<id>="b"] [data-ab-v="<id>a"], html:not([data-ab-<id>="b"]) [data-ab-v="<id>b"] { display: none }`.
  Without JavaScript, or for a crawler, the attribute is absent and A shows.
  Background, style, reveal and anchor are the section's own and shared by
  both.
- **`display: none` is the only hiding.** It takes the hidden version out of
  the accessibility tree and out of `documentElement.scrollWidth`. The
  section's anchor id is put on the wrapper, never twice.
- **Search engines** see both versions in the HTML with B hidden, which
  Google treats as acceptable for a time-limited test (not cloaking: crawler
  and visitor get the same HTML). Structured data is built from A only — a
  `faq` section's B questions never join `faq_schema`.

## Data

- **`section_tests`**: `id`, `page_id` (`cascadeOnDelete`), `section_id`
  (the block's uuid), `name` (≤ 120), `status` (`draft`, `running`, `ended`),
  `variant_b` (JSON: the B version's `data`, stored as a section's `data` is,
  normalised by `SectionRules::normalise()`), `goal` (`click` or a value of
  `Kinds::CONVERSIONS`), `started_at`, `ended_at`, `winner` (`a`, `b`, null),
  `applied_at`, `notified_at`, `results` (JSON snapshot of the figures when it
  ended), `created_by` (`nullOnDelete`), timestamps.
  `App\Enums\SectionTestStatus` holds the three states and their moves:
  draft → running → ended; draft is deleted, never ended.
- **`section_test_tallies`**: `section_test_id` (`cascadeOnDelete`), `day`,
  `visitor` (binary 16, C3's day hash), `variant` (`a`|`b`), `converted_at`
  (nullable). Unique on (`section_test_id`, `day`, `visitor`). One row is one
  visitor-day that saw the section. Kept until the test is deleted; the 90-day
  hit prune does not touch it.

## Measurement

- **Exposure.** The C3 beacon's pageview body gains `x`: an object of test id
  → variant for every `[data-ab-test]` on the page, read from `<html>`'s
  `data-ab-*` attributes (`{"12":"b"}`), absent when there is none. The
  Collector, for each id that is a **running** test on that page path (the
  page's own `/{slug}`, or `/` while it is the homepage page), upserts
  the tally row for (test, day, visitor): a new row takes the variant; an
  existing row takes the newest variant **unless it has converted** (a visitor
  with two tabs is credited to the version seen last before the goal). Bots,
  excluded IPs, staff and DNT/GPC are already dropped by C3 before this runs.
- **A click goal.** The beacon's delegated listener sends `k: "ab_click"`,
  `t: <test id>` for a press on an `a` or `button` inside a visible
  `[data-ab-test]`, at most once per test per page view. The Collector stamps
  `converted_at` on that visitor's tally row for a running test whose goal is
  `click`; with no row (the pageview was lost) it writes one with the variant
  the beacon sends in `v`. It is not an `analytics_hits` row.
- **A conversion goal.** When the Collector records a conversion kind
  (C3's `LeadIntake`, order, newsletter, event, meeting, visit hooks), it
  stamps `converted_at` on every tally row of that visitor and day whose test
  is running with that goal and has none yet. The conversion and the exposure
  must share C3's same-day visitor hash; a goal reached on another day is not
  credited, and the screen says so.
- **The figures**, per variant: `visitors` (tally rows), `goals` (rows with
  `converted_at`), `rate` (goals ÷ visitors, null over none).

## Deciding

`App\Support\Tests\Verdict` is the one implementation.

- A two-proportion z-test on the two rates; **confidence** is the one-sided
  probability that the leader really converts better, from the normal
  distribution, rounded down to a whole percent.
- **Nothing is called** until each version has at least **300 visitors and 10
  goals**; before that the verdict is `collecting`, with what is still needed
  ("About 180 more visitors to go").
- Then: `leading` (one version ahead, under 95%), `clear` (95% or more), or
  `level` (the rates within a tenth of each other after 2,000 visitors each).
- Every sentence is the API's: "Version B is ahead: 4.1% against 3.2%, 96%
  sure, after 1,240 visitors." / "Too close to call yet." / "No clear
  difference after 4,100 visitors — either version will do."
- **The bell.** `technoware:check-section-tests` (hourly) sends the creator
  (or, if gone, every content manager) a `section_test_result` notification
  once, when a running test first becomes `clear` or `level`, or when it has
  run **60 days**; `notified_at` is the claim, by conditional update.
  `Notifications::send` and `ScreenAccess` decide as for every other kind.
  Nothing is changed on the page.

## Ending and applying

- **End test** (either version kept): sets `ended`, `ended_at`, `winner`,
  snapshots `results`, purges `settings` and the page.
- **Use version B**: in one transaction, writes `variant_b` into the section's
  `data` through the same path a page save takes (so page history records a
  version, `StaleGuard::touch` runs, and the stored page passes
  `SectionRules`), then ends the test with `winner: b` and `applied_at`.
  If B no longer passes the current rules (a picture deleted since), it is a
  422 naming the field and nothing changes.
- **Keep version A**: ends with `winner: a`.

## Rules

- Only a published builder page's section, and only these types are offered:
  every type except `theme_section`, `subnav`, `custom_code`, a linked library
  section (`saved`), and `countdown`. B is the same type as A and validated by
  `SectionRules::for(type)` (and `after()` for its media and references); a
  rich-text field in B is sanitised as A's is.
- **One running test per section, at most three per page, twenty site-wide.**
  Each is a 422 on `section_id` with a sentence.
- **A section under a running test is locked.** A page save that changes its
  `data`, type or deletes it is a 422 on `blocks.N.data` (or `blocks`) naming
  the test ("This section is being tested. End the test first."). Its
  background and style may still change — both versions share them. Deleting
  the page deletes its tests.
- A test needs `native_analytics_enabled`: starting one with it off is a 422
  ("Switch native analytics on first."). Switching analytics off later leaves
  tests running with no new figures; the screen says why.
- Unpublishing the page leaves the test running and counting nothing; the
  list marks it "Page not published".
- `role:content_manager` throughout.

## The API (staff, `role:content_manager`)

- `GET /admin/section-tests` — every test, running first, with the page's
  title and path, the section's type and heading, the goal's label, both
  variants' figures and the verdict (`state`, `confidence`, `sentence`).
  `?status=`, `?page_id=`. `meta`: `goals` (`[{value, label}]` — `click` and
  the conversion kinds with C3's labels), `limits`, `analytics_enabled`.
- `POST /admin/section-tests` — `page_id`, `section_id`, `name`, `goal`,
  `variant_b`. Creates a draft. **201**.
- `GET` / `PATCH` / `DELETE /admin/section-tests/{id}` — PATCH changes `name`,
  `goal` and `variant_b` on a draft only; DELETE a draft or an ended test.
- `POST /admin/section-tests/{id}/start` · `/end` (`keep: a|b`) · `/apply`.
- `GET /admin/pages/{id}` adds `section_tests`: the page's tests by section id
  (`{id, status}`), so the builder can mark and lock a card.
- The public `GET /pages/{slug}` adds `test: {id, data}` to a section under a
  running test, where `data` is B presented exactly as a section's `data` is
  (`SectionPresenter`), and nothing for a draft or ended test.
- `POST /collect` accepts `x` on a pageview and the beacon kind `ab_click`
  with `t` and `v`; both are dropped silently when malformed.

## The console

- **In the page builder**, a section card on a published builder page offers
  "Test a variant" (types allowed only). It opens a dialog holding the
  section's own editor, preloaded with A's data, for version B; a goal select;
  a name defaulting to "<page> — <section heading>"; Save as draft / Start.
  The preview frame shows B when the dialog is open. A card under test carries
  a "Testing" badge and its fields are read-only, with "Open the test".
- **Content → A/B tests** (`/admin/section-tests`): one row per test — page,
  section, goal, the two rates side by side with a bar each, the verdict
  sentence, the days it has run; Running / Drafts / Ended tabs; an empty list
  says how to start one. A test's own screen shows the figures per day (the
  chart kit's `AreaChart`, two series), both versions side by side in a
  preview frame, and End test / Use version B / Keep version A with a
  confirmation naming what happens to the page.
- A sidebar row under Content, a palette entry, a `ScreenAccess` row, a help
  section and a tour step on the list.

## The audits

- `audit.mjs` counts headings among **rendered** elements only (skip an
  element with no client rects), so a hidden version's `h1` is not a second
  `h1`. Everything else it measures already ignores `display: none`.
- A probe, `scripts/probes/section-ab.mjs`, starts a test on the sample
  builder page with a throwaway admin, loads the page in two contexts with
  `tw_ab` seeded `a` and `b`, checks that exactly one version is visible with
  no layout shift, that a second load in the same tab keeps the version, that
  the beacon body carries `x`, that a press sends `ab_click`, then applies B
  and checks the page's content and history.

## Testing

- PHP: the start/end/apply moves and their refusals; the lock on page save;
  rules for B (type, media, references, sanitised rich text); the Collector's
  tally upsert (new row, newest variant, converted rows frozen, unknown or
  ended test ignored, wrong path ignored); click and conversion crediting,
  same day only; `Verdict` against worked figures (below the floor, leading,
  clear at 95%, level); the hourly check notifies once; the public read
  carries `test` for running only; `/settings` carries `ab_tests_running`.
- Web: a check script for the pre-paint choice (stored choice reused, a fresh
  draw stored, a blocked storage falls to A); tsc, lint, the probe, both
  audits including mobile.

## Out of scope

More than two versions, uneven splits, testing a whole page or a theme,
tests on detail templates or record sections, automatic winner application,
multi-armed bandits, Bayesian figures, testing across days for one visitor,
per-segment results (device, source).

## Release

API.md, `docs/section-tests.md`, a CLAUDE.md module block, the mock, manual
chapter 39 and its help sections, VERSION.md 0.189.0.
