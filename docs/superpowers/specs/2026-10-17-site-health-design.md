# Site health centre — design

Roadmap 2.0, item B2. Ships as **0.181.0**. Agreed with the client in chat,
2026-10-17.

## What it is for

A to-do list of problems in what editors have written — broken links, stale
pages, accessibility mistakes — where every row says what is wrong, where it
is, and opens the field that fixes it. Above the list, for administrators only,
one site-wide score with its trend.

What the client chose:

| Question | Choice |
|---|---|
| Who it is for | Both: the list for editors, the score and trend for administrators |
| Which links | Internal **and** external; external checked weekly, reported only after failing twice |
| What is stale | An age threshold per kind of record, editable; past events, closed vacancies and expired certifications flagged at once |
| Accessibility depth | Stored content only — what editors typed, nothing rendered |
| Who sees it | Everyone sees the findings on the records their role owns; administrators see everything and the score |
| Shape | Stored findings, kept current by saves and the scheduler |

Not in this release: email digests and alerts (B6), rendered-page checks
(contrast, tap targets — `npm run audit` stays the developer's tool), year
mentions in prose, auto-fixing anything.

## Records in scope

The kinds `App\Support\Revisions` already lists, with their owning role and
body columns, **except `saved_section`** (a library item is not a public page):
`page`, `blog_post`, `knowledge_article`, `case_study`, `solution`, `service`,
`product`, `store_product`, `event`, `tender`, `job_opening`, `entry`,
`landing_page`.

For each record the checker reads the kind's body columns (rich text) and,
where the record has them, its `blocks` (the builder's sections, every text
field and every `*_path`) and its cover/hero picture.

One extra kind takes the stale check only: `certification` (`valid_until`),
owned by `content_manager`.

The list lives in one place, `App\Support\Health\Kinds`, built from
`Revisions` plus the certification row. Nothing else lists kinds.

## The checks

`App\Support\Health\Checks` — one method per group, each taking a record and
returning findings. A finding is `{check, severity, field, detail}`.

### Links

Every `href` in a body and every link field in a section (button `href`,
card links, layout widget links). Skipped: `mailto:`, `tel:`, `javascript:`
(the sanitiser already refuses it), and a bare `#`.

| Check key | Severity | When |
|---|---|---|
| `link_internal_dead` | error | an internal link resolves to nothing |
| `link_redirected` | notice | an internal link works only through a redirect; `detail.to` is the address to use |
| `link_external_dead` | error | an external URL has failed twice in a row (see "External links") |
| `link_anchor_missing` | warning | `#id` on the same page names no anchor the page has (`style.anchor` of a section, an `id` in the body) |

**An internal link is judged cheapest first:**

1. It is a published record's own public path (the `public_path` the SEO
   overview already computes for every kind).
2. It is an index page in `App\Support\SiteSection`.
3. An active redirect starts at it → `link_redirected`.
4. It is under `/storage/` → the file must exist on the public disk.
5. Otherwise the website is asked: `HEAD` (then `GET` if refused) to
   `config('app.web_internal_url')` else `FRONTEND_URL`, through the same code
   path as external links, cached in `health_links` under that URL. 2xx/3xx
   is alive; 404/410 is dead; anything else is unknown and reported nothing.

"Internal" means a path, or an absolute URL whose host is `FRONTEND_URL`'s
(www and bare both).

### Stale

| Check key | Severity | When |
|---|---|---|
| `stale` | warning | published, and `updated_at` older than the kind's threshold in months (0 = never) |
| `event_past_featured` | warning | an event that has ended and is still `is_featured` |
| `vacancy_closed` | warning | a published vacancy past its closing date |
| `certification_expired` | warning | a published certification past `valid_until` |

Thresholds are the private `health` settings group (below).

### Accessibility

| Check key | Severity | When |
|---|---|---|
| `image_no_alt` | error | a picture with no alt text: an `<img>` in a body with empty/no `alt`, or a stored `*_path` (cover, section picture) whose library file has none. `field` names where; `detail.path` the file |
| `heading_jump` | warning | a body's headings skip a level (the page title is the `h1`, a body's first heading should be `h2`) |
| `link_text_vague` | warning | link text, trimmed and lower-cased, is one of a fixed list ("click here", "here", "read more", "more", "learn more", "this link", "link") or is the URL itself |
| `link_empty` | warning | a link with no text and no `aria-label`/image alt inside |
| `table_no_header` | warning | a `<table>` in a body with no `<th>` |
| `video_no_title` | warning | a video section or layout widget with no title/caption |

Bodies are parsed with `DOMDocument` over the stored (already sanitised) HTML.
`HtmlSanitiser::toText()` is not used here: the checks need the markup.

### Ignoring

Any finding can be ignored ("not a problem"). It stays ignored while its
fingerprint is unchanged; a changed detail is a new finding.

## Storage

### `health_findings`

| Column | |
|---|---|
| `id` | |
| `subject_type`, `subject_id` | morph alias + id; every kind is already in the morph map |
| `check` | string(40), a key above |
| `severity` | `error` / `warning` / `notice` |
| `field` | string(120): `body`, `overview`, `blocks.3.data.body`, `cover_image_path`… |
| `detail` | JSON: `url`, `status`, `to`, `path`, `text` (link text, cut to 120 characters) — only the keys the check uses |
| `fingerprint` | char(40), sha1 of subject, check, field and canonical detail; **unique** |
| `first_seen_at`, `last_seen_at` | |
| `ignored_at`, `ignored_by` | nullable; `ignored_by` → `users` `nullOnDelete` |

A recheck of a record replaces its findings: rows whose fingerprint came back
keep `first_seen_at` and `ignored_*` and get a new `last_seen_at`; new ones are
inserted; the rest are deleted. There is no "fixed" flag.

Index: `(subject_type, subject_id)`, `(severity, ignored_at)`.

### `health_links`

| Column | |
|---|---|
| `id` | |
| `url_hash` | char(40), sha1 of the URL; **unique** |
| `url` | text |
| `host` | string(255), for per-host pacing |
| `internal` | boolean |
| `status` | nullable smallint: last HTTP status, null for no answer |
| `result` | `pending` / `ok` / `failed` / `unknown` |
| `fails` | tinyint, failures in a row |
| `checked_at`, `next_check_at` | |

A link is **dead** at `fails >= 2`. Which records link to which URL is
`health_link_refs` (`health_link_id`, `subject_type`, `subject_id`, unique),
replaced on every recheck of a record; a link with no refs is pruned by the
sweep.

### `health_snapshots`

One row per day: `date` (unique), `score` (nullable), `records_checked`,
`counts` JSON (`{links: {error, warning, notice}, stale: {…}, accessibility: {…}}`).
Pruned after 400 days.

## Jobs

### On save

`AppServiceProvider` registers a `saved` and a `deleted` listener on every
class `Kinds` lists (one loop, no trait on thirteen models): on save it dispatches
`CheckRecordHealth(alias, id)` **after commit**; on delete it deletes the
record's findings. External links the job meets are upserted into
`health_links` (with `next_check_at = now` when new) and into its refs, so a newly added dead link is tried within fifteen minutes.

Guarded like `Notifier`: a failure to dispatch is logged at `warning` and
never fails the save.

### Nightly sweep

`technoware:health-sweep` at 02:50. Sliced like the mailbox scan — 40 s a
slice, a cursor `(kind, last id)` in the cache, self-chaining on the queue —
because the stale checks change with the clock, not with saves, and a save
hook can be missed by an import or a query-builder write. It re-runs every
record's checks, then writes the day's snapshot. A record whose check throws
is logged at `warning` and skipped.

### Link checker

`technoware:check-links` every fifteen minutes, off while
`health_external_links` is off (internal rows still run).

- Takes up to 60 rows with `next_check_at <= now`, oldest first.
- At most one request per host per second; a host already asked this second
  waits for the next run.
- `SafeHttp` only: public hosts, pinned, redirects followed hop by hop and each
  re-checked, no credentials, 10 s timeout, the response body not read.
  `HEAD`, then `GET` when the host answers 405/501. User agent
  `<company name> link checker (+FRONTEND_URL)`.
- 2xx/3xx → `ok`, `fails = 0`, next check in 7 days.
- 404, 410, 5xx, no answer, a refused host → `failed`, `fails + 1`; next check
  in 1 day after the first failure, 7 days after that.
- 401, 403, 429 → `unknown`, `fails` unchanged, next check in 7 days. Bot
  blocking is not a dead link.
- When a row crosses `fails >= 2` (or back to 0), the records linking to it are
  rechecked so their findings appear (or go).

`HEALTH_ALLOW_PRIVATE=true` lets it fetch a private host, honoured only under
`APP_ENV=local`.

## Settings

Private group `health`, `role:admin`:

| Key | Default |
|---|---|
| `health_external_links` | `1` |
| `health_stale_page`, `_solution`, `_service`, `_product`, `_store_product` | `18` |
| `health_stale_knowledge_article`, `_landing_page`, `_event` | `12` (an event's threshold applies to an upcoming one only) |
| `health_stale_blog_post`, `_case_study`, `_tender`, `_job_opening`, `_entry` | `0` (never) |

Months, 0–60, a 422 outside it.

## API

All under `/admin/health`, staff-wide (the `/admin/search` rule), each finding
narrowed in the controller to the kinds `Revisions::allows()` gives the caller
(certifications: `content_manager`). A finding on a kind the caller does not
own is a 404.

| Method | Path | |
|---|---|---|
| `GET` | `/admin/health` | Paginated findings. `?group=links\|stale\|accessibility`, `?severity=`, `?type=<alias>`, `?ignored=1`, `?per_page=` (max 100). Errors first, then warnings, then notices, oldest first, ending on id. Each row: `id`, `check`, `group`, `severity`, `sentence` (the API's words), `field`, `field_label` ("Body", "Section 3", "Cover picture"), `detail`, `subject {type, type_label, id, title}`, `admin_path` (the record's edit screen with `?tab=`), `first_seen_at`, `ignored_at`. `meta`: `summary` (counts per group × severity, the caller's kinds only, ignored excluded), `score` (**administrators only, else absent**: `{value, series: [{date, score}] (90 days), change (vs 30 days ago, null without a snapshot then)}`), `last_sweep_at`, `links_due`, `groups`, `severities`, `kinds` (only the caller's) |
| `POST` | `/admin/health/{finding}/ignore` | Answers the row |
| `POST` | `/admin/health/{finding}/restore` | |
| `POST` | `/admin/health/recheck` | `{type, id}`: runs the record's checks now (external links read from the cache, not fetched) and answers its findings. Throttled 30/min |
| `POST` | `/admin/health/bulk` | `{ids (≤ 100), action: ignore\|restore}` → 200 `{updated, refused}` |

**The score** is the share of checked published records with no unignored
error or warning finding, 0–100, rounded; null when nothing was checked.
Drafts are checked and listed but not scored. A notice never lowers it.

## Console

`/admin/health`, "Site health", in the Content section beside Detail templates
(System is administrators-only by design). One sidebar row whose
role is `content_manager,store_manager,seo_manager` (`RoleGate`), so every
owning role reaches it; `AdminNavRolesTest` compares it as written. The page
starts with `await requireScreen()`.

1. **Administrators only:** the score as a `StatTile` with a sparkline and
   delta, a one-line explanation of how it is counted, and three tiles
   (Links, Stale, Accessibility) showing errors and warnings; a tile links to
   the list filtered to its group.
2. **Everyone:** `FilterBar` (group, severity, kind, ignored), then the
   `.admin-table` with `data-label`s: severity badge, record (title + kind),
   the sentence, where, first seen, and the actions Fix (a link to
   `admin_path`), Recheck, Ignore. A tick column and bulk Ignore through the
   existing row-selection store. `Pagination`. `EmptyState` when nothing is
   found ("Nothing to fix.").
3. A footer line: when the sweep last finished, how many links are waiting —
   "never" with a link to System → Status when the scheduler has not run.

Settings at `/admin/health/settings` (administrators): the external switch and
the thresholds — a `SCREENS` entry in `settings-copy.ts` (area Content) saved
through the ordinary `PATCH /admin/settings`, with `HealthSettings::refusalFor()`
joining the per-key checks there.

A `health` dashboard panel (`WIDGETS`, administrators only, **hidden by
default**): the score and the three worst findings.

## Safety

- Outbound requests only through `SafeHttp`; never a private host outside local
  development.
- A finding holds a URL, a status, a library path and at most 120 characters of
  link text — never page text.
- The checker never writes to a record.
- One record's failure never stops a sweep; a save never fails because a check
  could not be queued.

## Testing

- `HealthChecksTest` — each check key, a passing and a failing case, on real
  records through the model; control-run by reverting each rule.
- `HealthLinksTest` — fail twice before reporting, 403/429 as unknown, the
  next-check schedule, per-host pacing, `SafeHttp` refusing a private host.
  `Http::fake()` with `preventStrayRequests()`.
- `HealthAccessTest` — a store manager never sees a page's finding, a content
  manager never sees a shop product's, only an administrator receives `score`;
  a real `Authorization: Bearer` header.
- `HealthSweepTest` — a sweep paused after one slice finishes with the same
  findings and one snapshot.
- Probe `web/scripts/probes/health.mjs` — a throwaway post with a dead
  internal link through the real form, the finding listed, Fix → correct the
  link → save, the finding gone after the recheck; then delete the post.
- `npm run audit` and `npm run audit:mobile` with `/admin/health` and its
  settings screen added to both route lists.

## Docs and release

`docs/health.md` (module note) and its line block in CLAUDE.md; an API.md
section; the mock's routes; `manual/31-site-health.md` and its
`help-routes.ts` entry; `VERSION.md` and `web/src/lib/version.ts` at 0.181.0.
