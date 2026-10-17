# Site health

A worklist of what needs fixing in what editors wrote (0.181.0): links that
lead nowhere, records nobody has touched for a long time, and mistakes a
screen reader trips on. Every row says what is wrong, on which record, and its
**Fix** button opens the right tab of that record's form. Administrators also
get a score and its trend.

It reads. It never writes to a record — not a link, not a picture, not a
status. A suggestion that edited content by itself would be an editor nobody
hired.

---

## Whose records, and what it checks

**`App\Support\Health\Kinds` is the one list of what is checked.** It is
`Revisions`' fourteen kinds less `saved_section` (a library section is not a
page, so a dead link inside one is found on the page that places it) plus
`certification`, which is checked for expiry only — it has no body, no links
and no sections. Roles, labels, console paths and morph aliases come from
`Revisions`, `SeoController::ENTITIES` and the models' own `adminPath()`, so a
fifteenth kind is a line in `Revisions` and one here, not a third list.

**Every route narrows by `Kinds::allows()`, and a finding the caller does not
own is a 404.** The routes sit behind the union of the three owning roles
(`content_manager`, `store_manager`, `seo_manager`) and the controller then
asks, per finding, the `EnsureUserHasRole` question for that kind's owner. A
store manager is told nothing about a blog post — not that it has a problem,
not that it exists, which is why the answer is a 404 and not a 403.

**`meta.score`, `meta.links_due` and the trend are an administrator's alone.**
The score is a statement about the whole site, and a content manager reading
"72%" would be reading a number that includes records they cannot see and
cannot fix. The group tiles beside it are administrators' too: an editor gets
the list and its filters.

**Bulk is scoped by the same rule, and a foreign id is simply missing.**
`POST /admin/health/bulk` answers `{updated, refused: []}`; an id outside the
caller's kinds appears in neither list, so the endpoint cannot be used to
probe which ids exist. `refused` is always empty and is kept only so the shape
is `POST /admin/tickets/bulk`'s.

---

## The checks

Fourteen, each with a group and a fixed severity (`Findings::CHECKS`).

| Group | Check | Severity |
|---|---|---|
| Links | `link_internal_dead`, `link_external_dead` | error |
| | `link_anchor_missing` | warning |
| | `link_redirected` | notice |
| Out of date | `stale`, `event_past_featured`, `vacancy_closed`, `certification_expired` | warning |
| Accessibility | `image_no_alt` | error |
| | `heading_jump`, `link_text_vague`, `link_empty`, `table_no_header`, `video_no_title` | warning |

**The words are the API's.** `Findings::sentence()` writes the sentence,
`fieldLabel()` the place ("Section 3", "Cover picture"). The console never
composes a message from the check key, so a wording fix is one file.

**A heading jump is counted from level 1.** The page supplies its own `h1`, so
a body that opens with an `h3` has skipped a level, and one that opens with
`h2` has not. Only the first jump per field is reported: the second is usually
the same mistake repeated.

**A picture's description is the library's, by path.** Alt text is a property
of the file (`MediaMeta::alt`), so a picture with no description is reported
once per place it is used, and fixing it in the media library clears every one
at the next check. An `<img>` typed into a body is checked on its own `alt`
attribute — a missing one is reported, an empty one (`alt=""`, a decorative
picture) is a decision.

**Hidden sections and custom code are not read.** A hidden section is not on
the page, so a dead link in it hurts nobody until it is shown; a custom-code
section's HTML is a developer's, pasted raw by design, and linting it would
report things nobody can fix from the form. `Content::of()` walks sections
generically by key name (`href`, `*_path`, `body`, `html`), so a section type
added later is covered without this file changing.

**A page reads its sections only when it uses them.** A page's builder blocks
count only when `template` is `builder`; every other record's only when
`body_layout` is `sections`. The column can hold blocks the page is not
showing, and those would be findings about text nobody sees.

**Staleness has a threshold per kind, and some kinds have none.** The private
`health` settings group holds `health_stale_<alias>` in whole months, 0 meaning
never (`HealthSettings::STALE_DEFAULTS`: pages, solutions, services, products
and shop products 18; knowledge articles, landing pages and events 12; blog
posts, case studies, tenders, vacancies and custom content 0). A blog post is
dated, so by age it is never out of date. A **past event** is never "stale" by
age — it is `event_past_featured` if it is still ticked featured, and nothing
otherwise — and a vacancy past its closing date and a certification past its
`valid_until` are listed whatever their threshold. `stale` is only asked of
published records.

---

## Links

**An internal link is judged cheapest first** (`LinkTarget::judge`): a
published record's own path; one of the site's index pages (`SiteSection`);
an active redirect, which is a *notice* with the address to use instead; a
file under `/storage/` checked on the public disk. Only what none of those
answers is `ask`, and only an `ask` costs a request. Most links are settled
without leaving the database.

**`ask` goes to `WEB_INTERNAL_URL` and nowhere else — never `FRONTEND_URL`.**
`FRONTEND_URL` is the production domain on every machine, so asking it would
report a draft page on a developer's laptop as dead because production does
not have it, and on production would send the server out over the internet to
reach itself. With no `WEB_INTERNAL_URL` an `ask` stays `unknown` and produces
no finding: not knowing is not an error.

**An internal link is dead on the first failure; an external URL needs two.**
Our own site failing to answer is decisive. Another website timing out is
weather. `HealthLink::isDead()` is that rule in one place: `failed` and
(`internal` or `fails >= 2`). A first external failure is rechecked the next
day, then weekly.

**"Failure" for an internal link is any `failed` result, not only a 404** — a
5xx, a timeout and a refused connection count too. So **a wrong or down
`WEB_INTERNAL_URL` marks every internal link that the cheap checks cannot settle
as dead**, on one sweep. Check it (System → Status shows the website's own
health) before reading a sudden wall of dead internal links as editors' errors.

**401, 403 and 429 are `unknown`, never a failure.** Those are a server
telling a robot to go away — a login wall, a bot filter, a rate limit — and
the page is fine for a person. Counting them would fill the list with
LinkedIn. `unknown` leaves `fails` where it was.

**The probe is one tiny request.** `LinkProber` sends `HEAD`, falls back to
`GET` only on a 405/501 (or a redirect, for an external link, so the chain is
followed), and always asks `Range: bytes=0-0`: a link to a 200 MB firmware file
must cost a header, not a download. A server that ignores `Range` is stopped by
`SafeHttp`'s size cap (`max_bytes`), and **the cap firing is not a failure**:
the headers had already arrived, so the real status is read from the aborted
transfer and judged like any other answer (the first cut treated "aborted" as
ok, which hid a 404 behind a big error page).

**An internal link never follows a redirect.** The website is asked at a
private address the operator configured; following a redirect would carry that
allowance to wherever the site sends the request. The website's answer is
read with `on_headers`, which stops the transfer once the status is known, and
any 3xx from it counts as ok — the site is redirecting, so the path exists.
The registered redirect table already covered the case that matters, and says
so as a notice.

**Everything external goes through `SafeHttp`.** Public addresses only, pinned
to the checked address, redirects followed by hand and re-checked at every
hop. A health checker is an outbound request whose target an editor chose, and
that is precisely the shape of a server-side request forgery. Only the
internal `ask` reaches a private address, and only the one in
`WEB_INTERNAL_URL`.

**`HEALTH_ALLOW_PRIVATE` is for development and is read through config.** It
lets the checker probe an external link on this machine (a staging site on the
LAN), is honoured only under `APP_ENV=local`, and is `config('app.health_allow_private')`
— never `env()` in the class, which returns null once the config is cached.

**One request per host per second.** `technoware:check-links` (every 15
minutes, `withoutOverlapping`, a 50-second budget, 60 links a run) sleeps
between two requests to one host. It shortcuts: a run that has many links to
one slow host works through them in order and may spend its budget there. When
the backlog is the problem, `meta.links_due` (administrators) shows it.

**`health_links` is the cache, and `health_link_refs` is who links where.** A
URL is probed once however many records mention it, and when a link's
dead-or-alive answer *changes*, exactly the records that link to it are
rechecked through `health_link_refs` — not the whole site, and not on the next
nightly sweep. Refs are replaced whole on each check of a record, so a link
removed from a body stops pointing at it. A link nothing refers to, created
more than a day ago, is deleted by the sweep.

**External checking can be switched off** (`health_external_links`). The
checker then skips external rows, no `link_external_dead` is raised, and the
links already stored simply wait.

---

## Findings

**Findings are stored and replaced whole per record.** `Findings::replace()`
takes everything the checker found for one record and, in one transaction,
upserts each by fingerprint and deletes the rest. There is no "fixed" flag: a
problem that is gone is gone, and a row that remains is a problem that is
there. A returning finding keeps `first_seen_at` and its `ignored_at`.

**The fingerprint includes the detail, so a changed problem is a new one.**
It is the sha1 of the kind, id, check, field and the detail's identity — the
URL, the text, the heading levels. An editor who ignored "this link is dead"
and then pointed it at a different dead URL should be told, not silenced. The
other half: **the fingerprint leaves out the volatile keys, `months` and
`status`** (`Findings::VOLATILE`). "Not edited for 19 months" becomes "20"
next month and a 404 becomes a 410; neither is a new problem, and without the
exclusion every ignored staleness came back monthly. The full detail is still
stored, so the sentence is current.

**Ignoring is a property of the finding, not of the record.** `ignored_at` and
`ignored_by` on the row; `POST …/{id}/ignore` and `…/restore`, both
idempotent. An ignored finding is out of the default list, out of the score and
out of the tiles, and shown under **Ignored** so it can be put back.

**A recheck after a save is queued and cheap.** One loop in `AppServiceProvider`
registers `saved` and `deleted` listeners for every kind in `Kinds::aliases()`
— no trait on fourteen models, so a fifteenth is covered by being in the list.
`saved` dispatches `CheckRecordHealth` after commit; `deleted` forgets the
record's findings and refs. **Both are guarded like `Notifier`: a recheck that
cannot be queued is logged at `warning` and never fails the save.** The
operator sees a missing recheck within a day; the editor must not see a failed
save because the queue was down.

**The published-path set is forgotten only when an address could have moved —
and at most every ten seconds.** `LinkTarget::paths()` caches
`SeoController::publishedPaths()` for 600 s; forgetting it on *every* save made
an import of a thousand pages rebuild a thousand times (O(n²)). The listener
forgets only for a new record or when `slug`, `status` or `published_at`
changed, and `Cache::add('health:paths-forget-debounce', 1, 10)` limits it to
one per ten seconds. A stale set can only turn a judged link into an `ask`,
which the probe then answers, so correctness survives; the cost is a link
judged by a request rather than by the cache for a few seconds.

**`saveQuietly` and query-builder writes skip the recheck.** Models fire no
event for them. The nightly sweep covers them, and the importers that write
that way are re-swept the same night.

---

## The sweep and the score

**`technoware:health-sweep` (02:50) rechecks every record, sliced at 40
seconds.** It dispatches `SweepHealth`, which works a kind at a time by id
cursor (`lazyById(100)`), and when its 40-second budget is spent dispatches the
next slice with `(kindIndex, afterId)` and returns — the mailbox scan's shape,
and for the same reason: the scheduler drains the queue with
`--max-time=50`, so one long job cannot exist. A record that throws is logged
and skipped; the slice goes on. The last slice writes the day's snapshot,
deletes snapshots older than 400 days and unreferenced links older than a day,
and stamps `health:last_sweep_at`, which the page shows as "last checked".

**The score is the share of published, checked records with no unignored error
or warning.** `Score::now()` = `round(100 × (published − bad) / published)`,
where `bad` is the distinct records with at least one such finding.

- **Drafts are unscored.** An unfinished draft with a placeholder link is a
  work in progress, not a fault. Its findings are stored (`subject_published`
  false) and listed so they can be fixed before publishing, but they do not lower
  the score.
- **Notices are free.** A redirected link still works; telling an editor about it
  must not cost them points.
- **Null, never zero, when nothing is published.** Zero would read as "everything
  is broken".
- The trend is `health_snapshots`: one row per day (`score`, `records_checked`,
  `counts`), the last 90 days sent as a series, `change` against the most recent
  snapshot at least 30 days old and null while there is none.

**The score is one number and the list is the product.** An administrator
reading 94% should open the list, not argue with the number; every finding is a
record and a button.

---

## Shortcuts and their limits

- **`LinkTarget::paths()` rebuilds the whole published-path set.** Fine to a few
  thousand records; past that, a per-kind index. It also treats a record as live
  by status alone — an inactive store category or hidden tag counts as present, so
  the cost is a missed dead link, never a false alarm.
- **`Score::now()` and `Score::snapshot()` load every record of every kind** to
  count the published ones. Fine now; past roughly 20,000 records, a status count
  per kind. The index calls `Score::now()` on every administrator read — cache it
  if the list becomes slow.
- **No job de-duplication.** Two quick saves of one record queue two checks.
  `replace()` is idempotent, so the second finds nothing to change; the cost is a
  duplicate crawl of the links already cached, which is cheap.
- **Relative `href`s without a leading `/`** (`../about`, `page.html`) are skipped
  by `classify()` rather than resolved against the page's address.
- **The check list is fixed in code.** Fourteen checks with fixed severities;
  there is no per-check switch, and none is planned — the settings turn off
  external probing and staleness, which are the two that depend on the outside
  world and on editorial rhythm.

---

## The screens

- **`/admin/health`** (Content → Site health): the list, filtered by
  `group`, `severity` and `type`, `?show=ignored`, bulk Ignore / Stop ignoring.
  **Fix** is `admin_path` + `?tab=`, and `Findings::tabFor(field, alias)` picks
  it: `blocks.*` fields open `builder` on a page and `sections` on every other
  record (the two tab ids differ — `page-form.tsx` and `record-sections.tsx`),
  anything else opens the form's first tab.
- **`/admin/health/settings`** (Content → Site health settings, administrators):
  the `health` group on a settings screen of its own. **Not** a tab on the main
  settings strip — it is a module's settings, and `SCREENS` in `settings-copy.ts`
  puts it beside the module.
- **The dashboard panel** is an administrator's and is `defaultHidden`: a new
  panel appearing on an established dashboard is a change nobody asked for.
  `/admin` asks the API for the panel only when it is not put away.
- A phone gets cards, not a table, as every console list does.
