# Distribution: the release zip, the setup wizard and the updater

The product ships to customers as one signed zip, per version, and is
installed and updated from the browser. It was built 2026-09-28 for several
customers, each under their own brand, on Plesk or cPanel. The sending
checklist is `release/RELEASING.md`, and the customer-facing account is
`manual/`.

## The shape of an install

```
~/altis-tech-cms/        the unpacked zip; one hosting account holds both domains
  api/                  code only; the API domain's document root is api/public
  web/                  code only; the Node.js app root, startup file start.js
  config/               api.env, web.env, install.json; never touched by an update
  storage/              Laravel's storage; never touched by an update
  updates/              where a release zip is dropped
  api.prev/ web.prev/   the version before the last update, kept for rollback
```

- **`bootstrap/home.php` is the switch.** When `../config/api.env` exists,
  `bootstrap/app.php` reads its environment from there and puts Laravel's
  storage at `../storage`. `public/index.php` asks the same file before Laravel
  loads, so it finds the maintenance file. A development checkout has no
  `config/api.env` and behaves exactly as before.
- **`web/start.js`** (`release/start.js`) reads `../config/web.env` into the
  environment and requires Next's standalone `server.js`. A value set in the
  hosting panel wins over the file. Passenger, used by both panels' Node apps,
  restarts on `touch web/tmp/restart.txt`.

## The portable website build

One build serves every install, so nothing that names a site may be baked in
at build time. `TW_PORTABLE_BUILD=1` (set by the builder) changes four things:

- **The build does not need an API.** `isPrerendering` is false, so the index
  pages bake their error state and `loadHome()` returns an empty homepage.
  Nobody sees either: the wizard and the updater purge every page through
  `/api/internal/revalidate` (bearer `INTERNAL_TOKEN`, shared with the API)
  and warm them before the site opens. The warm loop makes **two passes**,
  because the first request after a purge is answered from the stale copy
  while the new one renders. Measured: a single re-fetch straight after the
  purge still showed the error state, and a second pass seconds later did
  not.
- **The Report-Only CSP is built per request** by `proxy.ts` from
  `lib/security-headers.ts`, so `img-src` and the rest name the runtime
  `ASSET_ORIGIN`. The origin-free headers (the enforced CSP, HSTS, nosniff)
  stay in `next.config.ts`.
- **`images.remotePatterns` accept `/storage/**` on any host**, and
  `proxy.ts` refuses an `/_next/image` whose `url` is not this install's
  asset origin, so the optimiser is nobody else's image proxy. Measured on the
  standalone build: a foreign host got 400 from the proxy, and our own origin
  reached the optimiser.
- **The site's origin is `siteUrl()`** (`lib/site-url.ts`): runtime
  `SITE_URL`, falling back to `NEXT_PUBLIC_SITE_URL`. Next inlines any
  `NEXT_PUBLIC_*` reference into server code at build time too, so the old
  reads named the build machine's origin. `SITE.url` is a getter for the same
  reason. A client component that needs the origin gets it as a prop (the
  forms screen).

Verified on the standalone server with a runtime `web.env`: canonicals, the
sitemap and `img-src` all followed `SITE_URL` and `ASSET_ORIGIN`, and
`/api/health` reported the runtime site URL.

## The product's name

The software is **ALTIS TECH-CMS** from 0.97.0 (2026-09-28). It is the
supplier's name, never the customer's: every page, email and console screen
names the customer's company (`company_name`, and `SITE_NAME` for what the
website decides before a fetch, `lib/brand.ts`). What carries the product's
name:

- **The zip and the folder it unpacks into**, `altis-tech-cms-<version>`
  (`PRODUCT_ID` in `release/build.mjs`). No spaces and no capitals, because
  the folder ends up in cron lines and panel paths, where a space breaks
  things and Linux is case-sensitive. The manual has the customer rename it
  to `altis-tech-cms`.
- **`release.json`**, as `product` (the id) and `product_name`.
- **The setup wizard's** page title and heading (`api/install/view.php`).

`ReleasePackage::PRODUCTS` accepts `altis-tech-cms` and `technoware`, the id
the zips before the rename carry, so this code can still read one of those.
The other direction is not this code's to decide: an install updating reads
the new zip with the `ReleasePackage` *it* shipped with, so a 0.96 install
takes an `altis-tech-cms` zip only if its own list names that id.

## The release zip

`release/build.mjs` builds in `release/work/` (never in `web/`, see CLAUDE.md
on a build beside a dev server):

- from HEAD through a throwaway git index, or from the working tree with
  `--worktree` (for testing; the updater refuses such a zip);
- runs `composer install --no-dev` and `npm ci` plus the portable build;
- on a non-Linux machine, swaps sharp's native binary for the Linux x64 glibc
  build (`--os/--cpu/--libc`);
- writes `api/version.json` and `release.json` (every shipped file's
  sha256, `min_from`, the migrations, the changelog);
- signs `release.json` with Ed25519;
- zips through `release/zip.php`, because PHP is on every build machine and
  Node has no zip writer.

The GitHub workflow `.github/workflows/release.yml` does the same on Ubuntu.

## The setup wizard

It runs at `https://<api domain>/install/`, from `api/public/install/`, which
hands every request to `api/install/Wizard.php` outside the document root:

- **Framework-free until `config/api.env` exists.** After that it boots
  Laravel in-process, since `Artisan::call` needs neither a shell nor
  `proc_open`.
- **One short request per step**, so a 30-second `max_execution_time` still
  finishes. Migrations go through `SlicedMigrator`, one file per call, until
  12 seconds have passed.
- **The key.** The first visit writes `storage/install.key`. Every action
  needs it back in `X-Install-Key`, and a wrong key costs 750 ms.
- **After it finishes**, `config/install.json` exists and `/install` answers
  404 before reading anything else.
- **`TRUSTED_PROXIES`** gets the server's own address and the two domains'
  addresses. On one box the Next server calls the API through its public
  name, so the calls arrive from there; loopback alone would put every
  visitor in one rate-limit bucket. On a shared host, a neighbour on the same
  address could therefore choose their own bucket. That is a rate-limit
  concern only.
- **Clean install versus sample content.** It runs `InstallSeeder` (structure
  and starting points only), plus `DemoSeeder` when the box is ticked, which
  is off by default. `DatabaseSeeder` runs both, so a developer's
  `migrate:fresh --seed` is unchanged. It also calls
  `UpgradeSteps::markAllDone()`, so the first update does not replay history.
- **`Branding::apply()` makes the install the customer's.** Every seeded
  setting naming the original company names theirs, the contact addresses
  become the administrator's, the invented postal address is cleared, and the
  ticket and visit number prefixes become the company's initials
  (`References::initialsOf()`: `Acme Networks` gives `AN-` tickets and `ANV-`
  visits; `ORD` names nobody and stays). See `docs/tickets.md`, "Reference
  numbers".

## The updater

**System → Updates** (`role:admin`) is driven by the browser one `step` at a
time. `App\Support\System\Updater` has the full order and the reasons for it.
The rules that matter:

- **The run state is a JSON file**, `storage/app/private/update/run.json`,
  never a database row. The database is being migrated and the code reading it
  replaced. The previous release's copy of `Updater` drives a rollback, so
  **the run file's keys may be added to but never renamed**.
- **Signature, then hashes.** `ReleasePackage` verifies the Ed25519
  signature against `config/release.php` and refuses an unsigned zip, a
  `--worktree` zip, an older version, and an install older than `min_from`.
  Every unpacked file is then checked against its signed sha256, and every
  listed file must exist. `config/`, `storage/`, `updates/` and `MANUAL/`
  entries in a zip are never written.
- **The API is swapped after the response is sent**, in `app()->terminating()`,
  so the request doing it never loads a class from the other release. The
  callback acts only while the run still says `swapping` with its own id,
  because a long-lived process runs every terminating callback it has
  collected on each request (the test suite found that).
- **The website is swapped last**, just before its restart. Swapped earlier,
  a restarted site would render against an API still answering 503, and the
  old Node process would lazily load chunks from the new build.
- **Maintenance is `UpdateMode`**, `RestoreMode`'s twin. While it is on,
  `EnsureNotRestoring` answers 503 for everything except `admin/system/*` and
  `admin/auth/*`, and the scheduler skips everything but the heartbeat,
  including the backup worker, since the updater drives its own safety copy.
  It is switched off at the start of the warm step, because pages warmed
  against a closed API would bake the error state again.
- **The safety copy is a `pre_update` backup**, database only and local.
  `Backup::SAFETY_TRIGGERS` treats it like `pre_restore`: never part of a
  chain, never counted in the schedule's figures, pruned at 14 days.
- **Rollback** swaps the `.prev` folders back. If the update ran migrations,
  it then restores the safety copy through `RestoreRunner`, which drops every
  table first, so a table the new release added does not survive. Only the
  latest update can be rolled back: the next preflight deletes the previous
  `.prev` folders.
- **Steps are driven by the run's own key**, not only by a session. A
  rollback restores the database through `RestoreRunner`, which drops every
  table first, `personal_access_tokens` included, so for that stretch no
  signed-in request can prove who sent it, and the steps that drive the restore
  stopped at their own authentication. Found by the end-to-end rollback, which
  hung at `rb_database`. Every run carries a random `key` in the run file;
  `POST /api/v1/system/updates/continue` with `X-Update-Key` runs
  `Updater::stepWithKey()`, compared in constant time, only while the run is
  moving, with no table read. The console always steps with it.
  `EnsureNotRestoring` keeps that path and `admin/system/*` open during a
  restore too, because `RestoreMode` closed the updater's own routes under the
  rollback's restore.
- **Every folder move is skipped when it has already happened**, so "Try this
  step again" after a swap that stopped half-way finishes it, rather than moving
  the wrong folder a second time. A rollback swaps the website back in
  `optimize()`, like an update does, not in the API swap. The first cut did it
  in the swap: the old website came back before the old API was ready, and on
  Windows the running Node process held the folder.
- **A path is refused for a segment that *is* `..`**, not for containing one.
  Next's catch-all routes are folders called `[...rest]`, and the first cut
  refused the whole website.
- **`optimize` never runs in a test.** It would write the test settings into
  the real `bootstrap/cache`.
- **A step raises a web request's time limit and never sets one.** It
  calls `set_time_limit(90)` only when `max_execution_time` is between 1 and
  89. The CLI runs unlimited, and an unconditional call there put a
  90-second limit — wall clock on Windows — on the whole PHPUnit process
  after `SystemUpdateTest`, which killed `WordPressImportTest` a minute and
  a half later and aborted the rest of the suite (2026-09-29).

Pinned by `SystemUpdateTest`: a tampered zip, an unsigned zip, a hash
mismatch (stopped before the swap, site reopened), a path climbing out of the
install, the full update and a rollback driven by the key alone, maintenance
scope, and a downgrade. The update test builds a real
signed zip with a key of its own. Also pinned by `SystemStatusTest`.

## Upgrade steps

A one-off "run this after deploying" is a class under
`app/Support/Upgrade/Steps/`, never a line in a README the customer will not
read. The rules:

- **Listed by hand in `UpgradeSteps::STEPS`, in the order they must run.** A
  class nobody names there never runs — the rule `routes/api.php` follows for
  route files.
- **Run by the updater's `steps` stage, one per request, after `migrate` and
  `seed`.** So a step may rely on this release's tables and on the rows
  `SettingsSeeder` and `RoleSeeder` have just made; those two seeders are not
  steps, because they are safe on every update and run on every update.
- **Recorded in `system_upgrade_steps` by id as each one ends**, and never
  run again. A step must still be safe to run twice — a run that stops between
  the work and the record repeats it on "Try this step again".
- **The wizard marks every step done** (`UpgradeSteps::markAllDone()`), so a
  fresh install does not replay history on its first update.
- **Its `description()` is what the run's log shows the customer**, in their
  words: "Point the AI features at OpenRouter.", not a class name.
- **A step is not undone by a rollback that only swaps the code.** The
  safety copy is restored only when the update ran migrations
  (`$run['migrated']`); a release whose only database change is a step leaves
  that change in place under the previous release's code.

The steps so far:

| Step | Release | What it does |
|---|---|---|
| `RebuildStoreSpecs` | 0.96.0 | Rebuilds the shop's specification-filter index (`docs/store.md`) |
| `DeriveMeetingPrefix` | 0.98.0 | Numbers online meetings under the ticket prefix (`docs/meetings.md`) |
| `MoveAiToOpenRouter` | 0.116.0 | Points the AI features at OpenRouter — below |

### `MoveAiToOpenRouter`, and the one step that needs the customer afterwards

From 0.116.0 every AI feature calls OpenRouter instead of OpenAI
(`docs/chatbot-architecture.md`, "The provider is OpenRouter"). An existing
install carries two things in the old arrangement's terms, and the step
settles both:

- **The chosen models are renamed, never swapped.** `chatbot_model` and
  `seo_ai_model` holding a bare OpenAI id — `gpt-4o-mini` — get their maker in
  front, `openai/gpt-4o-mini`, which is OpenRouter's name for the same model;
  sent bare it is refused there as no model at all. A blank stays blank (it
  means "the default", now `google/gemini-2.5-flash`), and a value already
  naming a maker, or one that does not look like OpenAI's, is left exactly as
  it is. `AI_MODEL` in `config/api.env` is a file no step may edit, so it is
  read through the same rename (`AiModel::qualify()`) on every request.
- **The `openai_api_key` row is deleted, and its value is not copied** into
  `openrouter_api_key`, which the seeder has made by then. An OpenAI key is
  not an OpenRouter key: sent there it is refused, and a refused key that
  looks configured reports a provider failure on every call where a blank one
  says what to do. It also takes an encrypted credential nothing reads any
  more out of the database.

**So this update leaves the AI features off until somebody acts**, which no
step can do for them: the customer creates a key at openrouter.ai → Keys,
adds their own provider key in that OpenRouter account (Settings →
Integrations — a free Google AI Studio key for the Gemini models, an OpenAI
key for the GPT ones) and pastes the OpenRouter key into Settings → API keys.
Until then every AI action answers "No OpenRouter key is configured." and
calls nothing, and the website assistant goes on answering with the pages it
finds, as it always has without a model. Because the renamed models are
OpenAI's, an account that holds only a Google AI Studio key must also change
the model to a Gemini one — "Test this model" on the same tab says so in
OpenRouter's words. The customer is told in two places: the manual's settings
chapter (`manual/18-settings.md`, "After updating to 0.116.0", shipped as
`MANUAL/`), and the release's changelog entry, which System → Updates shows
under "What is new" before Apply is pressed. The 0.116.0 entry carries an
"After updating" line for that reason: it is the only one of the two the
customer sees before the AI features stop. **A step that leaves work for the
customer needs that line in its release's entry**, in their words.

`UpgradeOpenRouterTest` pins the registration and the record, the rename,
the delete, the key that is not copied, a key already saved for OpenRouter
that is kept, a second run that changes nothing, and an install holding none
of the rows.

## The scheduler's command (0.128.0)

Everything unattended hangs off one line run every minute, and the part of it
nobody can guess is the path to the **command-line** PHP: in a web request
`PHP_BINARY` is the FPM or CGI binary — under Apache's module, Apache itself.
The wizard worked the path out and showed the line once, on a screen that
cannot be reopened; five console notices printed
`cd /path/to/api && php artisan schedule:run` for somebody to rewrite.

`App\Support\System\SchedulerSetup` is the one definition now, read by the
wizard's last step and by `GET /admin/system/status` (`scheduler.setup`):

- **`phpCli()` is a pure mapping**, pinned row by row in
  `tests/Unit/SchedulerSetupTest.php` because none of these hosts can be
  reached from a development machine: a request served by the CLI names it;
  Plesk `/opt/plesk/php/8.3/bin/php`, cPanel
  `/opt/cpanel/ea-php83/root/usr/bin/php`, CloudLinux
  `/opt/alt/php83/usr/bin/php`; on Windows the `php.exe` beside
  `php-cgi.exe`, or in `PHP_BINDIR` when the binary is `httpd.exe` (XAMPP);
  otherwise the versioned and then the plain binary in `PHP_BINDIR`; plain
  `php` last.
- **`verify()` is the diagnosis**: it runs that binary with a fixed
  `-r "echo PHP_VERSION, '|', PHP_SAPI;"` (three seconds, nothing from the
  request) and reports `php_checked` true only for a `cli` SAPI at
  `Requirements::PHP_MIN` or newer. A binary that will not run is `false` —
  a result. `null` means the host would not let a web request start a
  program at all (`proc_open` disabled, the shared-hosting case): *could not
  be checked*, never a guess dressed as one. Cached ten minutes.
- **The line in each form somebody pastes**: `command` (a control panel's
  box), `cron` (a crontab; null on Windows), `work` (`schedule:work`, a
  terminal left open), `windows_task` (a `schtasks` line; Windows has no
  cron and no `/dev/null`). A path is quoted only when it has to be.
- **The screen** (`system/status/scheduler-guide.tsx`) composes nothing: the
  command with a Copy button, what the check found in words, the steps for
  the panel detected with the others a fold away, and "Check again"
  (`router.refresh()` — a link to the same route is answered from the
  router's own copy). Open while the scheduler is not running, folded once it is. Its
  heading is `#scheduler`, which the dashboard checklist and every "the
  scheduler is not running" notice (backups, mail, the ticket mailbox, the
  campaign report) link to in place of a generic line.
- Pint is not run over `api/install/Wizard.php`: it is outside the app's
  formatting and the fixer rewrites the whole file.

Measured on the development machine (Windows, Laragon): the card printed
`C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe D:\technoweb\api\artisan
schedule:run`, "Checked just now: PHP 8.3.30". The Plesk and cPanel paths
are the unit test's word, not a measurement.

## Speed suggestions (0.144.0)

System → Status carries a **Speed** card (anchor `#speed`, a row in the
command palette): what on this install is slowing the site down, how much it
matters, and where to change it — each answered from the server that is
answering, in the `SchedulerSetup` manner: where the host will not let us look
the state is `unknown` ("could not check"), never a guess.

**The API half**, `App\Support\System\SpeedChecks::run()`, rides on
`GET /admin/system/status` as `speed`:

```
speed: { measured: {boot_ms, db_ms, website_ms},
         summary:  {good, attention, unknown},
         checks:   [{key, group, impact, state, label, detail, fix, snippet}] }
```

`group` is `server`, `app` or `content`; `impact` `high`, `medium` or `low`;
`state` `good`, `attention`, `unknown` or `info` (a fact, nothing to fix — not
counted in the summary). `detail` says what was found with the figure, `fix`
where to change it, `snippet` is an optional generic line to copy (never this
server's own `.env` or a path).

**Every check is wrapped.** A probe that throws becomes `unknown` with a
sentence that does not repeat the exception: a host that disables
`opcache_get_status` or `proc_open` must cost one row, not the screen. A check
that does not apply returns nothing and is left out (OPcache's memory while
OPcache is off). `run()` takes a third argument, extra checks, which is the
seam the test uses to prove it.

The checks, in the order they are listed: `opcache` (installed? on for this
SAPI? hit rate), `opcache_memory` (cache full, under 10% free, or within 90%
of its file slots), `opcache_timestamps` (`validate_timestamps=1` is `info`,
**never** a must-fix: the updater does not restart PHP, so recommending 0
would leave an updated site running old code), `xdebug`, `optimize`
(configuration and routes cached; `info` on a `local` install), `debug`,
`cache_store` (`database` and `array` need attention, `file`/`redis`/
`memcached` are good), `queue` (`sync` is mail sent while the visitor waits;
otherwise `QueueHealth::delivering()`), `log_level`, `autoloader` (the class
map holds 1,500 or more classes), `database` (median of three `select 1`:
≤ 5 ms good, ≤ 25 ms info), `realpath_cache`, `php_version`, `media_cdn`,
`large_images` (library images over 1.5 MB or wider than 2560 px, trashed ones
and SVG ignored, the three largest named), `third_party` (GA4, Tag Manager,
Meta Pixel, the reviews embed and `body_code`: `info`, attention at four) and
`splash`. Every threshold is a constant on the class with its reason beside
it. `app.env` is read from **config**, not the container, so a test can set it.

**Measured figures.** `boot_ms` is the time since `LARAVEL_START` when the
status controller starts (null where the entry point did not define it — a
test run); `db_ms` the median above; `website_ms` the timing of the
controller's existing website health call, null when the website did not
answer, since a timeout measures the timeout. No new network call is made.

**The website half** (`web/src/lib/speed.ts`, `server-only`) adds the two
checks only the Next server can answer: `next_build` (`next dev` is
attention, any other non-production `NODE_ENV` is `info`, production is good)
and `cdn_in_front` (from `lib/cdn.ts`: detected is good, none is `info`).
`withWebsiteChecks()` merges them in and counts the summary again, so the
card's arithmetic holds for what it draws. The card (`speed-card.tsx`) is a
server component: Needs attention (high impact first), Could not check, Good
(folded), For information; its snippets are the scheduler card's `Command`.
`scripts/probes/speed-status.mjs` checks the summary against the rows, a fix
sentence on every attention row, the copy button and overflow at 360 and 1280.

**What it will not say.** Nothing recommends full-page caching of `/admin`,
and `opcache.validate_timestamps=0` is offered only as an option with its
cost. The `database` and `queue` rows measure the server answering, not the
customer's hosting plan.

## Known limits

- **Hosting.** cPanel needs "Setup Node.js App" (CloudLinux/Passenger) and
  room for a Node process of roughly 300–500 MB. PHP-only shared hosting
  cannot run the website half.
- **One hosting account.** Both domains must sit in one account, so that PHP
  can rename and restart the web folder.
- **One rollback.** Only the latest update can be rolled back, and a rollback
  that restores the database loses whatever was written after the update.

## Verified end to end (2026-09-28)

From real zips on this machine:
- the wizard installed 0.96.0 into a scratch home with a fresh database;
- 0.96.1, carrying a throwaway migration, was applied through the API, with
  14,301 files checked, the migration run, the website restarted and warmed;
- it was rolled back, with the database restored and the migration's table
  gone, and the administrator could sign in afterwards.

The harness scripts are throwaway. Rebuild them from this description if
needed. PHP's built-in server needs a fixed-root router, because Laravel's
takes its root from the working directory, which then locks `api/` on
Windows. Node has to be stopped and started around the website swap, which is
what Passenger's `restart.txt` does on a real host.

## A zip's file times, and pages that never went stale (2026-09-30)

**The symptom:** a fresh install on Plesk (a server in UTC, the release built in
India) showed the build's pages — the default theme and palette, a menu with no
dropdowns — on the home page and every index page for hours, while pages
rendered on request (`/blog`, `/store`, a solution's own page) showed the
theme the administrator had just chosen. The wizard's purge had run and said so.
`/api/health` reported the API reachable and the API served the data, which is
what made it hard to see.

**The cause:** a zip stores a file's time as local time with no zone. Built at
19:27 in India, the entries read as 19:27 UTC on the server — four hours *ahead*
of its clock. Next takes a prerendered page's age from the file's modified time
(`file-system-cache.js`: `lastModified: mtime.getTime()`), and
`revalidatePath` expires only entries older than itself. So all thirty-one
prerendered pages looked newer than the purge and newer than their
`revalidate` window: neither the purge nor the five-minute schedule touched
them until the server's clock caught up with the build machine's. Reading the
release's `prerender-manifest.json` ruled out the other suspect (their
`initialRevalidateSeconds` is 300, 120 or 600, not `false`); comparing
`x-nextjs-cache` across routes showed the split.

**The fix, in three places:**

- `release/zip.php` writes the same modified time on every entry —
  2020-01-01 — which is in the past in every zone (a 26-hour spread). A page
  that reads as old is refreshed on its first request, which is what a first
  visit should do.
- `Updater::agePrerenderedPages()` sets any file under `web/.next/server/app`
  dated within the last two minutes or in the future back to two minutes ago,
  and the wizard's warm step and the updater's both call it **before** the
  purge. It covers a zip built before the change and an extractor that does
  not keep times. `PrerenderedPagesAgeTest` pins it.
- Nothing else reads these times: the drift check compares hashes.

**If it happens on an install built before the fix:** in the hosting panel run
`find <home>/web/.next/server/app -type f -exec touch -d '2 hours ago' {} +` (a
scheduled task will do), then call the purge or wait five minutes and load the
page twice. Or wait: the pages refresh by themselves once the server's clock
passes the build's local time.
