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
php artisan test                     # HtmlSanitiser unit tests
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

**`npm run build` requires a reachable API.** Index pages are prerendered. A
build that cannot reach the API deliberately *fails* (`web/src/lib/build-phase.ts`)
rather than baking "We could not load…" into static HTML for Google to crawl.
Set `API_BASE_URL` in the **build** environment, not just at runtime. At runtime
the same failure degrades gracefully and the site stays up.

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

**The mobile drawer stays mounted and is shown by class.** `{open && …}` has
nothing to transition on the way out. `visibility` is in both transitions
deliberately: CSS flips it to `visible` immediately on the way in and holds it
until the transition ends on the way out, so the panel is still painted while
it slides away — and while closed it is what keeps the off-screen
`translate-x-full` out of `documentElement.scrollWidth`, which is the
zero-tolerance overflow check. `inert` is the other half; `opacity-0` alone
leaves every link focusable.

**Dev at `localhost:3000`, not `127.0.0.1:3000`** — or set
`allowedDevOrigins` (already done in `next.config.ts`). `next dev` 403s its
own JS chunks when the Origin host is one it does not recognise, which
serves a page whose client bundle never loads: no hydration, and nothing in
the UI to say so.

**The admin nav is an accordion, and only one section is ever open.** That
is enforced by storing *which* section is open (`string | null`) rather than
which are open — a set would make "one at a time" something every toggle has
to remember. `admin-nav.tsx`. Section panels use the `hidden` attribute; the
mobile drawer cannot, because **Tailwind v4's preflight declares
`[hidden] { display: none !important }`**, so a responsive `lg:block` can
never win it back. Anything that must reappear at a breakpoint needs the
`hidden` *class*, not the attribute.

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

**The audit waits for the network to go quiet before it measures.** Against
`next dev` a route's CSS arrives as chunks load, so a computed style read too
early is the *previous* stylesheet's answer — the 404 page's cards measured
pure white while `data-scheme` already said dark, and the run reported fourteen
contrast failures against a page that is flawless in a build. `settle()` waits
for `networkidle` and then for two identical style samples. **A contrast
failure that will not reproduce against `npm run start` is this, not a bug.**

**`--color-err` does two jobs and `--color-err-fill` is the second one.** It is
coloured *text* on a panel — alerts, badges, dashboard figures — so in dark it
inverts to a light pink, and white text on light pink is 2.4:1. That was every
Delete button in the console. Same split, same reasoning as
`--color-brand-ink`: in light the two are the same value, in dark they cannot
be. `bg-err` is now a mistake; use `bg-err-fill` under white text.

**The vacancies table is `job_openings`, and the model is `JobOpening`.**
Laravel owns `jobs` — it is the database queue's table, and
`QUEUE_CONNECTION=database` means it is in use. That collision is how the
careers migration failed the first time it ran.

**An SVG is a document, so the media library sanitises one on write.** A
browser runs whatever script an SVG carries the moment its URL is opened, which
made every upload to the public disk stored active content on the API origin.
`App\Support\SvgSanitiser` keeps an **allowlist** of elements and attributes
and drops everything else — a denylist cannot be finished from memory here, and
`<animate attributeName="href" values="javascript:…">` is the payload that
proves it: the dangerous value is not in the attribute at parse time. The bytes
are cleaned **before** they reach the disk, so there is no window in which the
raw file is fetchable, and a file the XML parser cannot read is refused with a
422 rather than repaired. `MediaController` carried a comment claiming "no
svg-as-document" with `svg` in the allowlist four lines below it for months,
which is the argument for `tests/Unit/SvgSanitiserTest.php` having one test per
vector: the first cut of the class never scrubbed the **root** element's own
attributes, and `onload` on `<svg>` is the payload that needs no interaction at
all.

**`api/public/.htaccess` sets `nosniff` on everything and a sandbox CSP on
`.svg`.** The sanitiser is the boundary; this is the half that holds for a file
type nobody thought to sanitise, since without `nosniff` a browser may
re-classify a file by its bytes rather than its Content-Type. Two traps in
writing it: **`<LocationMatch>` is not permitted in `.htaccess`** — it is a
server-config directive and Apache answers 500 for the whole vhost if it
appears there — and scoping the sandbox policy to `/storage/` rather than to
`.svg` would take PDFs with it, because `sandbox` stops Chrome's built-in
viewer rendering one inline and a datasheet would download instead of opening.

**A landing page's URL is composed from records it does not own, so those
records have to move it.** `LandingPage`'s `saving` hook recomputes `path` and
writes the 301 — correct, and never enough, because nothing saved the page when
a **constituent** was renamed. Fixing a typo in a brand name moved every page
under that brand and wrote no redirect: live, ranking URLs turning into 404s
from a screen nobody associates with landing pages at all. `RepathsLandingPages`
hooks `updated` on Brand, ProductCategory, Service, Solution and Location and
re-saves what points at them. It survived review because the test that covered
it called `$page->touch()` after the rename — which proves the model event
fires and proves nothing about anything firing it. **A test that stages the
trigger by hand is testing the mechanism, not the wiring.**

**The path constituents re-save one row at a time.** A mass `update()` skips
model events, and the events are what write the path and the redirect — fast
and wrong there is a set of moved URLs with no redirects behind them, which is
the original bug reintroduced to save a query. Same reasoning as the CV prune.

**`published_at` is stamped in the model, not the controller.** It was on the
update path only, so the endpoint that could publish a page in one request was
the one that left the column null. On the model it holds for both endpoints,
the seeder and `technoware:landing-pages` alike.

**A location's level is validated against the tree that will exist, not the
payload.** The check used to return early unless the request carried
`parent_id`, so a PATCH sending only `level` skipped it — a city inside a state
could be promoted to `country` and the tree contradicted itself with every page
under it still resolving. Both fields are now read from the request where it
carries them and from the record where it does not. The check also runs
**downwards**: widening a node strands its children rather than itself, so
nothing on the edited row is wrong and a check that reads only that row sees
nothing.

**A CV is the only unauthenticated file upload in the product.** It goes to the
`local` disk — whose root is `storage/app/private`, and which is what "the
private disk" means here; there is no disk called `private` and asking for one
throws — under a hashed name, and is streamed by one route behind the admin
session. The upload allowlist checks `mimes:` **and** `mimetypes:`, because a
`.php` renamed `.pdf` passes the first and fails the second. No archives: zip
through a public form is "post me anything". `cv_path` and `cv_disk` never
appear in a response — a storage path in JSON is the first half of making a
file fetchable.

**Deleting a job application deletes its CV**, via the model's `deleting` hook
rather than in the prune, so it holds however a record is removed. The prune
therefore deletes rows **one at a time**: a mass `delete()` skips model events,
and fast-and-wrong there is a folder of strangers' CVs that no record points
at. Retention is `application_retention_days` (private `security` group,
default 180) with a 30-day floor.

**A closing date closes a vacancy by itself**, in three places that must agree:
the listing drops it, the detail 404s, and the apply endpoint refuses with a
422. The third is not redundant — a tab left open across the date would
otherwise post into a role nobody is hiring for.

**Job qualifications and experience levels are lookup tables, not enums** —
the opposite call from `TicketStatus`, because "B.E. Computer Science" is a
value the client adds to rather than a lifecycle code branches on. Neither can
be deleted while a vacancy uses it.

**A vacancy emits `JobPosting` structured data**, which is what puts it into
Google Jobs. `validThrough` and `baseSalary` are omitted rather than faked when
the closing date or salary is blank — salary is optional per role by design.
**A blank `location` means remote**, said in the admin field's own hint,
because it has to mean *something*: Google indexes no posting that carries
neither a `jobLocation` nor `jobLocationType: TELECOMMUTE`, and a role with an
empty location was previously emitting neither. `identifier` and
`directApply` are there too — the second because the form is on the page rather
than behind a job board.

**Places are a tree, and `state` is derived from it.** India -> West Bengal ->
Kolkata -> Salt Lake, via `parent_id` and a `LocationLevel` of country / state /
city / area. The `state` column is gone: a string beside a `parent_id` is a
second answer to one question, and the two disagree the first time a subtree
moves. `Location::state()` walks to the nearest state ancestor; `fullName()`
gives "Salt Lake, Kolkata, West Bengal" and leaves the country off, because
nobody says the country to somebody in it.

**The tree does not shape the URL.** Pages stay at `/locations/kolkata`, not
`/locations/west-bengal/kolkata` — nesting them would make a two-segment place
path indistinguishable in shape from `/locations/kolkata/networking`, which is
the ambiguity `landing_pages.path` exists to avoid. Slugs are unique across the
whole tree for the same reason.

**A cycle is invisible, so it is refused in validation.** Every node in a loop
still resolves and still renders; it is simply unreachable from a root, so a
branch disappears from the site and nothing reports an error.
`Location::wouldCycle()` and a level check (`canSitUnder`) are enforced in
`LocationRequest`. A level may be *skipped* — a city directly inside a country
is ordinary, and forcing an invented intermediate row produces a page about a
region nobody searches for. `parent_id` is `restrictOnDelete`, and the
controller refuses first with a sentence naming the children.

**`location_service` and `location_solution` replaced a heuristic, and that is
the most important change in the location half.** The generator used to pair
every place with the first two published services — an arbitrary combination an
editor then had to invent copy for, which is the shortest path there is to a
template with a noun substituted in. Now the pairing is a fact somebody
entered: `LandingPageQuality` refuses a `<service> in <place>` page unless the
service is ticked on that place, and `LandingPageOpportunities` proposes only
what is ticked. It is also what `areaServed` in the structured data is built
from, so the panel on the page and the markup a crawler reads cannot drift.

**Substance is never inherited up or down the tree.** Kolkata having a response
time does not let West Bengal publish. A state page assembled from its cities'
facts says nothing about the state, which moves the template problem up a level
rather than solving it.

**All JSON-LD is built in `App\Support\StructuredData` and rendered by
`JsonLd`.** It used to be built where it was *rendered* — six helpers in
`lib/seo.tsx` plus five hand-rolled blocks inline in page components, eleven
files that all had to agree about what an Article is. They did not: the blog and
the case study both declared `dateModified: published_at`, so an article revised
two years later told Google it had never changed, and both named the
Organization as `author` while the record had carried `author_id` the whole
time. The frontend could only emit what a resource happened to expose; `sku`,
`dateModified` and the coverage pivot were all sitting in the database unused.

**Escaping stays at the sink and must not move.** `StructuredData` returns
arrays; `JsonLd` serialises and escapes `<` to its `\u003c` form. `JSON.stringify`
does not escape `<`, so a CMS field containing `</script>` closes the block and
everything after it becomes live markup — and `npm run audit` fails on any
JSON-LD block containing a literal `<`.

**`schema` is gated on `withSchema()`, never on the route.** A nested resource
inherits its parent's route name, so `routeIs('*.show')` made every product
inside `/solutions/networking` believe it was a detail view — each built a
Product graph, touched `brand` and `category`, and with `preventLazyLoading` on
the endpoint 500'd. `ProductResource` has carried a comment about this exact
trap for its `seo` key the whole time and it was walked into anyway, so there is
a test now: `StructuredDataTest::test_a_nested_record_carries_no_graph...`.

**Nothing in a graph is guessed.** `availability` is nullable with no default —
defaulting it to `InStock` would make every block look complete and would be a
claim about stock this business has never made. There is no `price` at all,
because the brief rules out anything transactional; Google will report a missing
price for Product and that is the correct outcome for a catalogue that does not
sell online. `graph()` prunes nulls **recursively**: a top-level filter leaves
`offers.availability: null` in the output, and a null in JSON-LD is a malformed
value for a declared field rather than "unknown".

**`LocalBusiness` is only ever emitted for a place.** It asserts a physical
presence, so putting it on every page of a site with one office is a claim to
serve everywhere from nowhere. A landing page about a place gets it; a catalogue
one gets `CollectionPage` — not `Product`, however tempting, because a listing
marked up as a single item is the structured-data equivalent of the thin page
the module exists to prevent.

**Programmatic landing pages exist, and the whole design is about refusing to
make them.** `/brands/{brand}`, `/brands/{brand}/{category-or-solution}`,
`/locations/{place}` and `/locations/{place}/{service-or-solution}` are
generated from combinations the catalogue already supports. The brief that
asked for them also named the risk — thousands of thin pages is a manual action
against the whole domain — so the module is built so a thin page **cannot be
published**, rather than being discouraged from it. Five rules, each blocking a
different route to a doorway page:

1. **Existence is earned from data, never enumerated.** `LandingPageOpportunities`
   asks the catalogue which intersections hold stock. Against the seeded
   catalogue the grid holds **160 combinations and it returns 2** — the other
   158 are pages about hardware nobody carries.
2. **Publication is gated server-side**, in `LandingPageRequest::withValidator`,
   returning 422 with the reasons keyed on `status`. Not a warning in the
   console: the failure mode is two hundred pages, and a warning is what
   somebody clicks past on a Friday.
3. **Near-duplicate intros are refused.** The check that matters, because it is
   the only one a determined template does not survive — a second page with the
   city swapped has evidence, length and its own title. See `TextSimilarity`.
4. **Distinct title and description**, on the same length bounds as `SeoScore`,
   read from that class rather than copied.
5. **A cap on published pages** (`landing_page_cap`, private `seo` group,
   default 40). The only rule about the set rather than the page, and the only
   one somebody has to raise deliberately.

**A landing page is `role:seo_manager`, not `content_manager`.** It is not
content — it is a decision about which queries the site competes for, and
getting it wrong costs the ranking of pages nobody touched. Same role that owns
the redirect table and the SEO overview.

**`TextSimilarity` is shingles, not `similar_text`.** Five-word runs, Jaccard.
`similar_text` is a longest-common-substring measure with no notion of word
order, worst-case O(n³), and it reports ~80% for two paragraphs that share
nothing but English. The threshold — **0.35** — was measured rather than
picked: on realistic copy a paragraph with the city name substituted scores
0.67, one with the city *and* a clause reworded scores 0.55, and two intros on
the same subject written separately score **0.00**. Nothing at all falls between
0.01 and 0.54, so the line sits in an empty band rather than at the edge of
either population. `tests/Unit/TextSimilarityTest.php` pins both ends; do not
move it without re-measuring. Stop words are deliberately *not* stripped — they
are most of what makes one sentence structurally identical to another, which is
the signal being looked for.

**`landing_pages.path` is the identity, and resolution is one lookup.**
`/products/[slug]` has to try the category endpoint and then the product
endpoint because two kinds of record share a segment; that cost is documented
and this deliberately does not repeat it. The whole path is a unique column, the
frontend is two catch-all routes hitting `/landing-pages/lookup?path=`, and a
page can be re-pointed without its URL moving.

**`Sluggable` is not used on `LandingPage`, and that is not an oversight.** That
trait owns one slug and writes a 301 from `urlPrefix()/old`. A landing page's
URL is composed from two or three *other* records' slugs, so renaming a brand
moves it without anything on its own row changing. The model recomputes `path`
in a `saving` hook and writes the redirect from old to new — same guarantee,
arrived at differently. `tests/Feature/LandingPageTest.php` pins it.

**Nothing seeds a location, and nothing should.** A `locations` row is a claim
that engineers attend sites in that city. Inventing them is the doorway pattern
*and* a false statement about the business — the same mistake as the invented
Mumbai address already on the must-not-ship list. A location may be created with
just a name, and no page about it may be **published** until one of
`office_address`, `response_time` or `summary` is filled in: a page that names a
city and says nothing specific about it is a template with a substitution.

**The location half is proposed on a shorter leash than the catalogue half.**
`LOCATION_SUGGESTIONS = 2` caps how many service and solution pages are offered
per place — six services in five cities is thirty drafts, which is thirty
introductions somebody will write from one template. The place's own page is
always offered first, because it is the one page per city unambiguously worth
having.

**`technoware:landing-pages` reports by default and never publishes.**
`--create` is opt-in, `--limit` defaults to 10, and everything it makes is a
draft with an empty introduction — which is exactly a page the gate refuses.
The machine proposes; nothing it proposes reaches the public site without
somebody writing prose that is not a near-duplicate of prose that exists.

**A refused publish saves nothing.** The request is rejected whole, which is
right for an API and unkind on its own — so the form says so, and says the text
is still on screen. The inputs are uncontrolled and `EditorField` holds its own
state, so a failed action loses nothing; what was missing was anybody saying it.

**"The test arrived and the campaign did not" is one thing and nothing else.**
A test send goes out **inside the request**; a campaign is sent by queued
`SendCampaignBatch` jobs. So with nothing draining the queue the test lands in
the inbox, the campaign sits at `sending` for ever, every recipient stays
`pending`, and **nothing is written anywhere** — no exception, no log line, no
`mail_error`, because a queued send cannot throw during the request. The screen
looks like a send in progress, which is exactly what it is minus the part that
does the sending.

On the server that is the scheduler’s cron entry. On a development machine it is
`php artisan schedule:work`, or `php artisan queue:work` to deliver at once.
`App\Support\QueueHealth` is shared by the settings screen and the campaign
report so both read one threshold, and the report warns when the oldest job is
over two minutes old — the age is the figure that matters, not the count: a
hundred jobs queued in the last ten seconds is a busy minute, one job sitting for
an hour is a broken deployment.

**A check must read what will be sent, not what was configured.** The
newsletter's postal-address check read the `newsletter_address` setting, and it
was wrong in both directions. It **passed** for a campaign whose footer had no
address — the footer is rendered when a campaign is *saved* and `html_content` is
stored, sending never re-renders, so filling the setting in afterwards turned the
check green while the message that went out still broke the law it exists to
satisfy. And it **failed** for a campaign whose footer block carried a perfectly
good address that nobody had also typed into Settings, which is the one somebody
actually hit: the console insisting an editor had not done the thing they had
just done, on a check that blocks sending. `HealthCheck` now resolves the address
the way `EmailRenderer` does — the campaign's own footer block, then the
configured one — and then requires it to appear in the rendered HTML. The
unsubscribe check beside it had always read the HTML; this is the same rule.

**`??` falls through on null and not on an empty string.** The footer block
stores `address => ''` for a field somebody left alone, so
`$b['address'] ?? $branding['address']` let a blank block beat the configured
address and the footer rendered with none at all. `?:` is what that wanted: the
block overrides where it *says* something.

**`newsletter_address` falls back to the site's `address`.** Two settings asked
for one fact under two names and only one was read, so a site with its postal
address on the Contact screen had a newsletter insisting there was no address
anywhere. The branding array already fell back from `newsletter_company` to
`company_name`; not doing the same for the address was the whole of it. All three
call sites go through `App\Support\Newsletter\Branding` now, because they had
already drifted apart once.

**The newsletter is "Campaign" in the sidebar, and top level.** It sat inside
Site on the grounds that a fifth section for one module was too much — right
about the section, wrong about the depth. A campaign is something somebody sits
down to do, on its own schedule, the way Tickets and Customers are; buried beside
Sliders and Redirects it read as configuration. The **URL stays
`/admin/newsletter`**: renaming a route to match a label breaks every bookmark
and buys nothing.

**"Existing customers" is the one group nobody curates, and it must never
resurrect an unsubscribe.** `newsletter_groups.source = 'customers'` identifies
it — not the name or slug, which are editable — and `CustomerGroupSync`
recomputes its membership from the customer table on a `saved` hook and nightly.
Every addition goes through `SubscriberIntake`, which checks the suppression list
*before* the subscriber lookup, so somebody who left the list stays off it
however many times the sync runs. **The obvious implementation — write the
subscriber row and the pivot directly — passes every other test in the suite and
fails exactly that one**, which is why the test exercises all three routes back
in: the sweep, the hook, and a plain `touch()`.

Losing active status takes somebody out of the **group** and does nothing else:
a suspended account has not asked to stop hearing from the company, and deciding
that for them is not the sync's to make. Deleting the group or editing its
members is refused with a 422 *and* hidden in the console — both would appear to
work and be undone.

**Two screens must not hold two definitions of one word.** `delivered` on the
campaign list was written against `delivered_at` and the report counts a
recipient row at status `sent`. Nothing sets `delivered_at` — it needs a provider
webhook this deployment does not have — so the list reported 3 and the report
reported 4 for one send, one click apart, and whichever figure somebody quoted
was wrong somewhere else. Same argument as `TONE_BAR` being shared by the chart
and the badge.

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

**A newly created `layout.tsx` may need the dev server restarted.** The file was
correct and the nav rendered nowhere, in the browser and in the served HTML —
Next's watcher on Windows had not picked up a layout added to an existing route
segment. Same family as the note below about `pkill` and port 3000: believe the
process, not the file. Restart before concluding the code is wrong.

**Passing routes to an audit through Git Bash needs `MSYS_NO_PATHCONV=1`.**
A leading-slash argument is rewritten into a Windows path, so
`node scripts/audit.mjs /admin/newsletter` navigates to
`C:/Program Files/Git/admin/newsletter` and every route reports "could not
load". And **do not pipe the audit to `tail` when the exit code matters** — a
pipeline reports the last command's status, so a run in which nothing loaded
comes back as 0.

**The activity log records by rule, not by a list of routes.**
`App\Support\ActivityLogger` is called from one middleware on the whole admin
group — the same argument as `staff`, since a check at 67 call sites is a check
missed at one of them, and the missed one is what somebody comes looking for.
What counts as worth recording is decided by rules that already cover routes
nobody has written: **every DELETE**, **every `store`**, and anything under
staff, customers, settings or auth. An enumerated list would leave a new route
silently unlogged. Routine content edits are deliberately absent; the CMS keeps
those, and a log that records everything is one nobody reads.

**Nothing writes a credential into it.** `context` is built from an allowlist
of keys, never a request body — that body carries the SMTP password. The
settings write records *which* keys changed and never their values.

**It is append-only and there is no delete endpoint.** The one thing that
removes rows is `technoware:prune-activity`, which deletes by age. A log its own
subject can prune to taste is evidence of nothing. Retention is
`activity_retention_days` (private `security` group, default 90) with a 30-day
floor enforced in the command, so a typo cannot destroy the trail.

**An activity subject must be in the morph map.** `enforceMorphMap` throws for
an unregistered model, which threw away the first deletion ever recorded — the
row was dropped entirely. Anything bindable in an admin route now has an entry,
and the logger degrades to a null subject rather than losing the line if one is
ever missed again.

**Sign-in is recorded at the call site, not by the middleware**, because the
sign-in route is deliberately outside the admin group — you cannot be
authenticated to authenticate. A *failed* sign-in is recorded too, and
`user_id` stays null even when the address matches a real account: the row is
about an attempt, not about that person.

**A bar sized against the peak is a shape, not a quantity.** The dashboard's
volume chart drew its tallest bar at full height whether it stood for two
tickets or two hundred, with no axis, no baseline and dates only at the two
ends — so it looked identical for a busy month and a quiet one. It now scales
against an even-numbered ceiling (so the midpoint gridline is a whole ticket,
not 1.5 of one) and labels every seventh day. The two series sit **side by
side, not stacked**: an opened ticket and a resolved one are different events,
so a stack implies a total that means nothing — and each was sized against the
peak independently before being stacked, which would have drawn a column of
twice the plot height on a day that peaked in both.

**`resolved_at` is stamped on arrival and cleared only by a reopen.** It was a
pair of ternaries reading "now() if we are moving to this status, null
otherwise", and the ordinary lifecycle is `resolved → closed` — so closing a
ticket erased the moment it had been resolved. Everything the dashboard says
about throughput reads that column, so the resolved series could only count
tickets still sitting in Resolved and the median resolution time was computed
over every ticket *except* the ones actually finished. The customer-facing
`reopen()` had always cleared them explicitly, which is the rule the admin path
now follows too, via `TicketStatus::isOpen()`. `tests/Feature/TicketLifecycleTest.php`
pins it; reverting the one line fails exactly two of the six.

**A chart bar and a badge for the same word share one map.** `TONE_BAR`,
`statusTone` and `priorityTone` are exported from `components/ui/badge.tsx`, so
"Critical" is the same red in the priority chart as in the ticket list. Two
maps would drift the first time somebody restyled one. Bars are fills behind no
text, so they answer to WCAG 1.4.11's 3:1 against their track rather than
4.5:1 — and the neutral tone is `bg-muted`, not the badge's `bg-surface-2`,
because the track *is* surface-2 and a bar the colour of its own track is not a
bar. **An API that returns a display string cannot be coloured**: that is what
`status_breakdown` did, and every bar fell back to grey.

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

**What is narrow for layout must not be folded into `.measure`.**
`PageHero`'s h1 at 20ch and the homepage's at 14ch are display type, capped for
shape: a 42px heading run across 1728px is one long ribbon where two or three
short lines read as a title. `CtaBand` and the homepage support band sit
centred at 52ch, where a long line has no left edge to return to. The footer
and mega-menu caps are column widths. None of these are measures.

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

**A log line an operator needs must clear the shipped `LOG_LEVEL`.** Both
`.env` and `.env.example` ship `LOG_LEVEL=warning`, so `logger()->info(...)` is
discarded — which is what was happening to the password-reset audit record
while its own comment claimed an operator could read it. The two endpoints that
answer identically whatever happens (password reset, and registering with a
known address) log at `warning` for that reason: the response is deliberately
uninformative, so the log is the only trace there is.

**A customer account has a lifecycle, not a switch.** `customers.status` is
`pending` / `active` / `rejected` / `suspended` (`App\Enums\CustomerStatus`),
and **only `active` may sign in**. It replaced `is_active`, which could not
tell "waiting for a human" from "switched off by a human" — two states that
want opposite words in front of whoever is at the sign-in form. Dropping that
column broke `EnsureUserIsCustomer`, which still read it: the missing attribute
evaluated as false and *every* authenticated portal request 403'd. The
middleware and the login now both call `canSignIn()`, so there is one answer to
"may this account be here".

**The registration endpoint must never reveal whether an address exists.** New,
already-registered and honeypot-tripped all return the same 202 and the same
sentence. Anything else turns the form into a membership oracle — submit
addresses, read which come back "already taken", and you have a list of this
company's customers, which for a support portal is a list worth phishing. The
real account holder is told by email instead; they are the only party entitled
to know. `tests/Unit`-style coverage for this is in
`tests/Feature/CustomerRegistrationTest.php`, which asserts the two responses
are byte-identical rather than merely both successful.

**A login refused on status returns 403 with a `reason`, and the frontend
branches on that, never on the message.** `email_unverified` gets a resend
button; `pending_approval` gets an info panel with nothing to press, because
there is nothing the person can do. A message string is written to be read by a
person and will be reworded; a screen that changes shape when somebody fixes a
typo in a sentence is a screen nobody can maintain. `ApiError` carries `reason`
for this.

**Do not put `email:dns` on a public form.** It is a DNS lookup on the request
path, and this project has already measured what an uncontrolled network call
there costs: an unreachable SMTP host took a contact-form submission from 0.2s
to 12.5s. It also buys little, because the confirmation email is a far stronger
proof that an address exists than an MX record.

**An admin action whose button is conditional on the status it changes cannot
report success into its own component.** `revalidatePath` re-renders, the
status is now `active`, the pending-only button unmounts, and the success
message goes with it — the first browser run approved an account and reported
nothing at all. Those actions `redirect(...?done=…)` and the page renders the
outcome from the URL. *Failure* still returns into the component, because a
failure changes no status and keeps the button mounted, which is where the
error belongs.

**Settings are strings, so read booleans through `settingEnabled()`.** `"0"` is
truthy in JavaScript, so `if (settings.registration_enabled)` is true for a
toggle that is switched *off*. `lib/site-settings.ts`.

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

**The SEO overview's Recheck does not `revalidatePath`.** That would refetch
the whole overview — 0.9s and 73KB, because the endpoint collects every record
to answer the duplicate checks — and re-render fifty rows to change one number,
with every score on screen blinking at once and nothing saying which was
rechecked. `GET /admin/seo/{type}/{id}` returns one row at 0.29s and 1.5KB, and
the row swaps its own score in.

**That endpoint still collects every record, and must.** Two of the thirteen
checks are "does another record publish this exact title" and the same for the
description, so a record scored in isolation cannot see a duplicate and comes
back with a score that is *too high*. A recheck quietly reporting better news
than the list is worse than no recheck at all.

**The Recheck button and the score it changes are in different `<td>`s**, so
they share a row-scoped context (`RowScoreProvider`). The provider renders no
DOM, which matters: an element between `<tbody>` and `<tr>` is invalid table
markup and browsers silently reparent it outside the table.

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
`/25` alpha so they cannot drift from the text again. The literals still in
`noc-panel.tsx`, `sections.tsx` and `cta-band.tsx` are correct: those sit on
dark bands that stay dark in both schemes.

**An icon name in `iconMap` is a value stored in MySQL.** `solutions.icon`,
`services.icon` and `product_categories.icon` hold the key, so adding one is
free and renaming or removing one silently blanks the icon on every record
pointing at it. Forty-one of the 88 are borrowed from Lucide through
`fromLucide`, which spreads the shared `base` so they carry this set's 1.7
stroke instead of Lucide's 2 — mixed weights in one grid read as sloppy before
anyone can say why. They are registered under *this project's* names, not
Lucide's, so a rename upstream is not a data migration here. Do not re-export
the library wholesale: an editor handed 1,600 icons cannot find any of them.

**Every upload in this product goes through a Server Action, and Next caps a
Server Action body at 1MB.** `next.config.ts` sets `serverActions.bodySizeLimit`
to cover the largest request the API accepts — a ticket reply is five
attachments at 10MB. The default failed anything bigger than a small image with
a **500 and nothing on screen**, because the action throws before its own body
runs and there is no error path to report from: small test images passed and
photographs did not, which is why it presented as "most of the time it does not
upload" rather than as a size rule. It is a transport ceiling, not a policy —
setting it below the API's limits does not enforce them, it breaks them
silently.

**The effective upload limit is a *minimum* across three ceilings**: the
`media_max_kb` setting, `upload_max_filesize` and `post_max_size`. A setting
above php.ini does nothing except break uploads in a way the console cannot
explain, so `App\Support\UploadLimits` clamps it, Settings shows php.ini's own
figures, and the endpoint refuses a value above them. `post_max_size` is the
one that bites hardest: exceed it and PHP throws away the *entire* body, so
Laravel reports the file as missing rather than as too large.

**Progress on an upload is counted in files, not bytes.** Byte progress needs
`XMLHttpRequest.upload.onprogress`, and a Server Action emits no progress
events at all. A percentage animated on a timer is worse than none — it is the
one part of an upload people watch to decide whether something has hung. If
byte progress is ever wanted it needs a route handler proxying the multipart
body.

**Two drop zones must not both handle one drop.** The library keeps a
whole-grid target *and* the upload panel inside it. `stopPropagation` on the
inner one stops the outer's `onDrop` running — and that handler is the only
thing that clears its "Drop to upload" overlay, so the file uploaded and the
screen stayed covered until a reload. The panel marks itself `data-filedrop`
and the outer target skips a drop that landed inside one *after* resetting its
own overlay. Never nest a `FileDrop` in a `FileDrop`: both fire and the files
upload twice.

**An upload loop needs try/finally.** `redirect()` works by throwing, so a 401
escapes the async block, leaves `busy` true and `progress` set, and every later
upload returns at the guard having done nothing and said nothing — an expired
session turns the uploader off until a reload.

**A media URL carries `?v=<updated_at>`; a path never does.** Resize, crop,
rotate and replace all rewrite the file **in place**, because the path is the
identity records store and keeping it is what lets an edit reach every page
already using the image. Which means the URL does not change either, and the
browser goes on serving what it has — the console refetched the row and showed
the old picture. Reported as "the gallery does not refresh". The version is on
`url` only: `path` is what a record stores, and a stored path with a query
string is a filename that does not exist.

**An in-place edit archives the previous bytes *before* it runs.**
`App\Support\MediaHistory` — afterwards there is nothing left to copy, and
snapshotting after the fact looks identical from outside while storing the new
bytes every time. Capped at ten, and pruning goes one row at a time because the
model's `deleting` hook is what removes the file.

**Deleting a media file fills a bin and keeps the bytes.** Nothing tracks which
records reference a path, so the mistake is found by somebody opening a page
and seeing a hole in it. A restore has to put back the *exact* published URL,
which re-uploading under a new hashed name would not — so the file is held
until it is purged. `restore` and `purge` take a plain `{id}`: route-model
binding applies the default scope and 404s for every file in the bin.

**A bulk route must be declared above `media/{id}`.** Laravel matches in
declaration order, so `media/move` underneath binds `{id}` to the literal
"move" and 404s from model binding — a routing bug that reads as a missing
record. `MediaLibraryTest` pins it.

**GD sets two traps and both are invisible in a screenshot.** `imagerotate`
measures **anticlockwise**, so clockwise degrees are subtracted from 360 —
wrong is invisible at 180 and exactly wrong at the two angles anybody uses.
And `IMG_FILTER_CONTRAST` is **inverted**: a positive value flattens, so
passing a "more contrast" slider straight through reads as a weak filter
rather than a backwards one. Both are pinned by tests that assert on real
pixels, and mid-grey is the one value that cannot demonstrate contrast — it is
the fixed point the filter pivots around.

**`lib/admin.ts` is `server-only`.** Its *types* may cross into a client
component; its functions may not. A client component that needs one calls a
Server Action instead — the same rule `lib/settings.ts` documents for
`telHref`.

**Summernote's own stylesheet loads after `globals.css`.** It ships from the
dynamically imported editor chunk, so a one-class override merely *ties* its
one-class rule and loses on source order — which is how the console's dark
scheme ended up with near-white text on `#fff` at 1.11:1 across the colour
palette, the link dialog and the help sheet. Count the selectors; two classes
beat one, and `.note-modal-footer a` needs three.

**The media library's right-click menu is not the only way in.** Every tile
and folder also carries a visible ⋯ button opening the same menu — right-click
alone is unreachable on touch and by keyboard, and this console is gated on
audits that would fail it. `media/item-menu.tsx`.

**Uploads are multi-file and drag-and-drop, and both go through one
`UploadProvider`.** The toolbar's file input and the drop zone over the grid
sit in different parts of the tree, so the shared state is context rather than
two copies — otherwise dropping files reports in one place and choosing them
reports in another. Files upload **one at a time**: a server action per file
also revalidates the page, and twenty at once makes the count meaningless and
hides which one failed. The drop zone counts dragenter/dragleave depth, since
both fire again for every child crossed, and it must `preventDefault` on
dragover or the browser opens the file and navigates out of the console.

**Resize is raster-only, and the UI says so before the request.** GD cannot
scale a vector, so the API returns 422 for an SVG and the menu item is
disabled with the reason in its `title`. All 33 seeded images are SVG, so this
is the common case here, not the corner one.

**Image alt text is a property of the file, not of the page using it.**
It is written once in the media library ("Edit details") and resolved by path
through `App\Support\MediaAlt`, which memoises one `path => alt_text` map per
request. Four public resources expose it — `cover_image_alt`, `hero_image_alt`,
`image_alts` — and the frontend falls back to a derived name only where one
would actually help a reader. **A new `<img>` on a CMS-driven image should read
that field, not invent a string from the record's title**: a name is not a
description of the picture, and every duplicate of it is one more place to
change when the real photography lands.

**Deleting a media folder does not delete its files** — `folder_id` is
`nullOnDelete` and they move to Unfiled. The confirmation dialog says so,
because "Delete folder" reads like it takes the contents with it.

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

**`schema_type` is a dropdown, and it now does something.** It was free text
that *nothing read* — `StructuredData` decides `@type` from the model, so an
editor could type `Recipe` on a network switch and the markup would not
change. Turning it into a select made that worse rather than better: a text box
invites a guess, a dropdown is a promise. So `App\Support\SchemaTypes` owns a
short allowlist per derived base type, and every alternative is a **drop-in** —
same required properties, no new mandatory ones. `Article` may narrow to
`BlogPosting` or `NewsArticle`; a `WebPage` may become `AboutPage`,
`ContactPage` or `CollectionPage`. `FAQPage` and `ItemList` are deliberately
absent from those lists because both require a property the swap cannot supply,
and a page declaring itself an `FAQPage` with no `mainEntity` is marked up as
something it is not.

**`Product`, `LocalBusiness` and `JobPosting` have exactly one option**, and
their control is rendered **disabled with the reason** rather than hidden — the
same pattern as the mail panel's uninstalled transport and the media library
refusing to resize an SVG. Removing the field on some screens and not others is
a question an editor has to go and ask somebody.

**The allowlist is resolved on the way *out* as well as validated on the way
in.** `SeoRules::rules()` is static and has no record, so it checks the union;
`SchemaTypes::resolve()` narrows per record when the graph is built. A stored
value outlives the rule that accepted it, and the graph is the wrong place to
discover that — so a type the record cannot support falls back to the derived
one rather than throwing.

**The options are sent by the API, never listed in TypeScript.**
`resolvedSeo()` carries `schema_type_options`, because the console builds the
dropdown from it and Laravel validates against it — two hand-written copies of
one list of strings is exactly the drift nothing type-checks across the wire.
It is absent from `SeoResource`, so it never reaches a public response;
`JobOpeningResource` was returning the raw resolved array and now goes through
`SeoResource` like every other public resource, which is what keeps it that
way.

**A `Field` in a flex row sits 18px taller than it looks.** Its wrapper carries `mb-[18px]`, which is right for the stacked forms it was written for and wrong the moment one shares a row with a button: flex alignment uses the **margin box**, so `items-end` puts the button's bottom edge level with the bottom of that margin rather than with the control. It reads as a misaligned button and is actually a margin nobody can see — measured at exactly 18px. `Field` takes a `className` for this; pass `mb-0` in a toolbar row. A `hint` makes it worse rather than causing it, so moving the hint out is half a fix.

**Every image field browses the library *and* uploads, and both live in the same dialog.** `MediaBrowser` carries the uploader, so anywhere it is used — the body editor, the cover field, the gallery, the newsletter's image blocks — gains "upload one now" for free. Before this the cover and gallery fields could upload but not browse, which is how a library ends up holding four copies of one logo under four hashed names.

**Uploading one file from the picker picks it; uploading several does not.** Uploading a single image *while choosing an image* is unambiguous, and an extra click to select the thing you just added is a click that exists only because the dialog was not paying attention. Five is a different intent: they land in the library, the grid refreshes with them at the front, and nothing is chosen.

**`onPick` hands back the `url` **and** the `path`, and they are not interchangeable.** An editor inserts the URL; a field that saves a cover stores the path. `url` carries `?v=<updated_at>` so an edited image is not served from cache, and a stored path with a query string on it is a filename that does not exist.

**A `Select` needs `variant="float-static"` on its `Field`.** A select always
has a value, so the animated label has nothing to be displaced by and renders
*on top of* the chosen option. `Field`'s docblock says so; the first cut of the
SEO panel's two dropdowns did it anyway, and it is only visible in a browser.

**A SEO score is out of what *applies* to a record, never out of everything.**
`App\Support\SeoScore` has each check declare whether it applies before it
declares whether it passed, and divides by the applicable weight. An industry
has no body column, so scoring it against the content checks would park every
industry in the fifties with nothing an editor could do — and a score you
cannot move is one nobody looks at twice. It also means setting a focus
keyword can *lower* a score, which is correct: four checks apply only once one
is set, and the alternative is a score that rewards leaving the field blank.

**Nothing in the score fetches the rendered page.** Every check reads what is
stored, so it can grade a draft that has never been published and cannot see
rendered Core Web Vitals or a broken outbound link. That is the trade, and it
is the same reason `email:dns` is banned on a public form: an uncontrolled
network call on the request path has already cost this project 12.5 seconds
once.

**A failed check and an issue are not the same list.** `with_issues` on
`/admin/seo` means the five conditions it has always meant. Scoring a title
*under* 30 characters is right; calling it an issue took that headline from 23
records to 48 out of 54, and a figure flagging nearly everything has stopped
pointing anywhere. Each check carries its own `issue` flag rather than a
constant naming the keys, so the distinction lives with the rule.

**A path in an API response that names a console route is not the API's own.**
`admin_path` on the SEO overview was spelled `blog-posts` and
`knowledge-articles` — the API's resource names — while the console serves
those at `/admin/blog` and `/admin/knowledge-base`. Two of nine record types
linked to a 404 from the one screen whose whole job is finding records to go
and edit, and nothing type-checks a string built on one side of the wire
against a route table on the other.

**`config('app.frontend_url')` is the production domain, on every machine.**
`FRONTEND_URL` in `api/.env` is pinned there because canonicals, the sitemap
and generated share URLs all have to be right regardless of where the code is
running. That makes it exactly the wrong base for a link a *person* clicks: the
SEO overview's "open this page" link, built on it, sent a developer working at
localhost to the live site. The console and the public site are one Next
application on one origin, so anything meant to be clicked from the console
ships as a **path** and lets the browser supply the origin.

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

**Admin list tables have three layouts, not two.** Cards below `md`,
table with the `min-w-[NNNpx]` floor released between `md` and `xl`, and the
floor honoured at `xl`. That middle band exists because the floors are wider
than the space available — and 1024px is *worse* than 900px, since the
sidebar appears at `lg` and takes the content area from 810px to 710px. The
last column was clipped by up to 210px, contained by `overflow-x-auto` so
nothing flagged it.

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

**A height cap on the logo bounds nothing horizontally, and the header has no
room to spare.** `logo_path` is a setting, so the file decides its own aspect
ratio: the first real upload came out 252px wide inside a 342px console bar and
pushed Sign out off the screen at 360px, and 61px past the edge of the public
header at 320px. Both flanking groups are `shrink-0` — the consultation CTA and
the menu button are a fixed 150px that must not shrink — so the mark is capped
at **120px below `sm`** and released above it. Nothing in the repository
changed to cause that: it arrived with the upload, which is why no commit is
findable for it and why a client swapping the logo can reintroduce it if the
cap is ever removed.

**The logo's box is reserved from the file's own dimensions, which the API
sends.** `logo_width` and `logo_height` ride alongside `logo_url` on the public
`/settings` (same for `favicon_` and `login_image_`), read from the `media` row
by path. Before that, `Logo` declared a hard-coded 180x40 to next/image while
the client's mark is 600x81 — so the browser held 126px open, painted 207px
once the bytes arrived, and **the entire navigation beside it jumped right on
every cold load**. Reported as "logo coming late and the menu moves"; the final
position was correct, which is exactly what makes this read as a rendering
fault rather than as a wrong number. A guess cannot be right here — the file is
whatever was uploaded — so the only fix is to know. The 180x40 fallback remains
for a path with no media row behind it, and reintroduces the shift for that one
case, which is the best available when nothing is knowable.

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

**A browser check that sets one scheme key tests light.** `audit.mjs` writes
*both* `tw_scheme_site` and `tw_scheme_console`, in an `addInitScript` so the
value is there before the pre-paint script runs. Setting one key, or setting it
after the first navigation, produces a run that reports on the light palette
while claiming to test dark — which has happened to this project twice.

**`npm run themes` checks 30 palettes, not 15** — every theme in both schemes.
Passing it is necessary, not sufficient: `AUDIT_SCHEME=dark npm run audit` runs
the browser audit against the dark palette, and that is what caught the canvas
and the status tokens.

**Fifteen themes, and `lib/themes.ts` is the only other place a hex may live.**
A theme overrides the same `@theme` custom properties `globals.css` declares,
emitted inline on `:root` by the root layout, so every existing `bg-brand-600`
picks it up without a component changing. The setting is `appearance.theme`,
public because the frontend cannot paint the page without it, and an unknown
value falls back to the default rather than half-applying.

**A fluorescent theme keeps its neon in the fill, never in the text.** The
five bright themes (`acid`, `electric`, `hotwire`, `flare`, `ultra`) put the
fluorescent hue at brand 300-500 — buttons, chips, and the whole dark scheme —
while brand-600/700 and `brandInk` are deep versions of the same hue, because
`#39ff14` on white is 1.4:1 and no gate will ever pass it. Their ramps were
*searched* against `scripts/theme-contrast.mjs` rather than chosen by eye; neon
picked by hand does not survive it. Watch `brand-ink on brand-50` in **dark**:
`darkScheme()` gives every theme the same fixed dark wash for brand-50 while
`brandInk` becomes the theme's own brand-300, so that pairing is the one a
bright theme fails first — it is what `ultra` failed on at 4.36:1.

**A theme is not shippable until `npm run themes` passes.** The audit fails the
build on any WCAG AA failure, so eighteen text-on-background pairings are
checked for all ten before a browser ever sees them — that gate caught Fiber
Teal's `faint` at 4.41:1 while the colour was being chosen. Passing it is
necessary, not sufficient: the real audit is then run under each theme, because
only a browser composites alpha overlays.

**`preload: false` on every theme face is what keeps ten themes costing what
one costs.** next/font preloads each declared family by default and all nine
variables sit on `<html>`, so the browser fetched all nine whatever the active
theme — measured at 11 font files on one homepage. Unpreloaded, a face is
fetched only when something is set in it: three families on the wire, and the
display one swaps with the theme.

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

**One image on the site has no fixed-height well: the case-study cover.**
Every other cover and thumbnail sits in an `h-40`/`h-44`/`h-56` box, so a slow
image cannot move anything. That one is full-width, and it carries
`aspect-[1200/630]` for the same reason — the ratio the cover generator
produces and the one og:image wants.

**Two colours fail WCAG AA while looking perfectly fine:**
- `--color-brand-500` (#6f8641) is 4.07:1 on white. Use `--color-brand-600`
  (7.53:1) for coloured **text**; brand-500 is for fills only.
- `--color-warn` was #a9711a (3.83:1 on `--color-warn-soft`), now #8a5c10.
  Do not revert it.

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

**Mail leaves through the queue, and the three exceptions are deliberate.**
That five-second SMTP timeout in `config/mail.php` was a floor under the
failure, never a fix — an unreachable host took a contact-form submission from
0.2s to **12.5 seconds**, long enough for a visitor to press Send twice and for
a handful of concurrent submissions to occupy every PHP worker there is. Eleven
notifications now carry `App\Notifications\Concerns\QueuedMail` and
`implements ShouldQueue`; **`use Queueable` alone queues nothing**, which is
why every notification here carried that trait for months and every one of them
was still sent inline.

`SignInCodeIssued`, `ResetPassword` and `VerifyCustomerEmail` stay
**synchronous**, and each says so in its own file, because an unqueued
notification now reads as an oversight. Somebody is sitting at a form waiting
for that exact message; the queue is drained once a minute, and a six-digit
code that takes a minute is a sign-in nobody can use. The cost is that the
timing side-channel `SignInCodes` documents stays open on that one route.

**A queued failure is silent, and that is the trap the move introduces.**
`Notifier::guard()` catches a send that throws — but a queued notification only
*dispatches* during the request, so the guard has nothing to catch and a dead
mail server yields a console that looks perfectly healthy while every receipt
stops. `QueuedMail::failed()` writes `mail_error`, the same banner a failed
test writes, so the operator's path back to health is unchanged.

**The queue is drained by the scheduler, not a daemon.** `queue:work
--stop-when-empty --max-time=50` every minute, `withoutOverlapping`. The
scheduler is the only background process this deployment is known to have and
four commands already depend on it; asking for a supervised worker as well is a
second operational requirement, and mail that silently stops because nobody set
it up is worse than mail that is a minute late. A short-lived worker also
**re-boots each run**, which matters here: mail is configured in the console and
`MailSettingsProvider` applies it at boot, so a daemon would hold the settings
it started with and a changed SMTP password would apply to web requests and not
to the queue.

**If the scheduler stops, mail stops silently** — nothing throws, nothing is
logged, no `mail_error` is written. `GET /admin/settings/mail` therefore reports
`queue.pending`, `queue.failed` and `queue.oldest_seconds`, and the settings
screen warns when the oldest waiting job is over five minutes old. The **age**
is the figure that matters, not the count: a hundred jobs queued in the last ten
seconds is a busy minute, one job sitting for an hour is a broken deployment.

**A form's validation comes from its stored definition, not its payload.**
`FormValidator` builds the rules from `form_fields`. Unknown keys are dropped
rather than rejected, selects are validated against their own options, and
`website` is reserved for the honeypot — a field of that name is refused on
write, because it would silently disable the trap.

**Shortcodes are expanded into components, never into HTML.** A CMS body can
carry `[slider slug="hero"]` or `[form slug="contact"]`. `lib/shortcodes.ts` splits the *already sanitised*
HTML into segments and `ProseWithShortcodes` renders a real `<Slider>` between
them, so the slug reaches the DOM as a React prop. **Never expand a shortcode
by string substitution** — the sanitiser has already run by then, so an editor
typing `"><script>` would own every page embedding it. The attribute is
additionally restricted to slug characters, so a malformed shortcode renders as
the literal text that was typed.

**A menu item stores a record reference, never a URL.** `menu_items` holds
`(target_type, target_id)` and resolves `/solutions/<current slug>` when it is
rendered; only a `custom` item has a `url` of its own. A stored URL rots the
first time somebody fixes a typo in a slug — and the navigation is on *every
page*, so that is a sitewide 404 caused by an edit made on a screen nobody
associates with menus. Same failure `RepathsLandingPages` exists for, avoided
by not storing the derived value at all. `MenuTest` pins it: rename a solution,
and the menu follows without anything touching the menu.

**A menu is written wholesale, which is why it needs no cycle check.** The
console submits the tree it drew and `MenuController::syncItems()` reads
`parent_id` and `sort_order` off the *shape* of the payload rather than
trusting them in it — so a loop is not refused, it is unrepresentable in a
nested array. `Location` needs `wouldCycle()` because it is edited one row at a
time by `parent_id`, which is exactly where a loop can be written. `MenuItem`
carries a comment saying so, because the absence looks like an oversight.

**An unassigned location is a 404, not an empty menu.** `/menus/{location}`
answers 404 when nothing is assigned and the frontend falls back to `mainNav`
and the CMS-driven mega panels — so an install that never opens the menu screen
renders exactly what it renders today, and switching over is an editorial act
rather than a deploy. Same shape as the homepage hero, where an absent slider
leaves the NOC panel in place. An assigned-but-*empty* menu is a real answer and
comes back as `[]`; the frontend still falls back for it, because a header with
no links in it is indistinguishable from a broken site.

**An item whose record is gone is dropped, never rendered dead.**
`resolveUrl()` returns null when the record was deleted or lost its slug.
Emitting it anyway puts a link to `/solutions/` in the site header; emitting it
without an href puts an inert word in a navigation bar, which reads as a broken
page rather than a missing entry. The console shows those as **Broken** for the
same reason — otherwise a dead entry looks identical to a live one until
somebody notices the header is short.

**The builder is a flat list with a depth per row, not a nested drag target.**
Nesting the DOM means a drop zone inside a drop zone — the defect the media
library had to be fixed for, where both handlers fire — and it makes every drag
answer "before, after or inside?" from a pointer position, which is the part of
a hand-rolled tree that is wrong on the diagonal. One list plus an integer makes
reordering and re-parenting the same operation; `nest()` converts once, at save.
It is what WordPress does, for the same reasons. **Depth is clamped on every
change** rather than at each call site, so drag, delete and move can all be
careless about it and still leave a list `nest()` can read. Every row also
carries Up/Down/Indent/Outdent buttons: this console is gated on audits that
fail an interface a keyboard cannot drive, and dragging is never the only way.

**Menus were in the Phase 1 schema and unused for months.** `menus` and
`menu_items` were provisioned with the original 30 tables and nothing was ever
built on them, while the header's links stayed hard-coded in `content/site.ts`.
The migration that made them usable is an **alter**, not a second pair of
tables — a duplicate would have collided on a fresh database, which is exactly
how it was found: the first `migrate` failed on a table that already existed.

**The newsletter's one rule is the suppression list, and it is keyed on the
address.** `newsletter_suppressions` outlives every subscriber row, so deleting
somebody and re-importing them from a spreadsheet cannot resurrect a
subscription they withdrew. `SubscriberIntake` is the only way onto the list
and checks it **before** looking the subscriber up — a suppressed person keeps
their row, so asking the row first lets an import quietly reactivate them.
`AudienceResolver` is the read half and asks the same list. Staff may lift a
hard bounce and may **not** lift an unsubscribe: one is a fact about a mailbox,
the other is somebody's decision.

**`whereIn('id', <select id join pivot>)` returns a subscriber in two groups
twice.** `IN` is a set-membership test that cannot duplicate — and MySQL is free
to flatten it into a semi-join, where the pivot's duplicate rows survive.
Measured as `rows=3 ids=3,3,4`, which is a person receiving one campaign twice.
The audience is a `whereExists` predicate on the outer row, which cannot express
the duplicate. Reverting it fails exactly its own test.

**A campaign is claimed with a conditional UPDATE, not a read-then-write.** Two
requests both reading `ready` both send, and there is no unsend — the same shape
as `SignInCodes::consume()`. Recipients also carry a unique index per campaign,
and each batch re-reads the recipient's status immediately before sending, so
somebody who unsubscribes during a long send does not get the rest of it.

**The email renderer is tables and inline styles, and that is not nostalgia.**
Outlook renders with Word's HTML engine — no flex, no grid, no reliable
`<style>` — and Gmail strips `<head>`. The one `@media` block only *narrows* a
layout that already reads at full width, so a client that drops it shows the
desktop version rather than a broken one. `{{unsubscribe_url}}` is a
placeholder filled per recipient and the health check refuses a campaign whose
HTML lacks it.

**The deliverability score is a heuristic and says so**, scored out of the
checks that *apply* — the rule `SeoScore` follows. Nothing here can see the
sending domain's reputation, which matters more than everything it can see. The
legal checks (unsubscribe link, sender identity, postal address, text part) are
**blocking**, reported separately from the number, and re-run on the server at
the moment of sending rather than read from a stored score.

**CSV is hostile in both directions.** Read: strip the BOM, sniff the encoding
and the delimiter — a German Excel exports semicolons, and assuming commas
reports every row invalid. Write: escape any cell starting `=`, `+`, `-` or `@`,
because Excel executes it and an export is a file somebody opens in Excel. The
import is a **dry run then a commit**: reporting afterwards means the moment
somebody notices they mapped Company onto the surname column is the moment after
twelve hundred rows were written.

**An audience arrives three ways, and all three go through `SubscriberIntake`.** A spreadsheet, the portal customer list, and a pasted block of addresses. The paste takes what a paste actually looks like — one per line, or comma- or semicolon-separated, and `Name <address>` as a mail client writes it, keeping the name — because the alternative is telling somebody with eleven addresses to fill a four-field form eleven times. It is **split on separators, not scanned with one email-shaped regex**: scanning finds addresses inside words and inside URLs, and an importer that invents recipients is worse than one that misses a malformed line somebody can see.

**`.xlsx` is read without a library and without `ext-zip`.** `phpoffice/phpspreadsheet` is tens of megabytes to answer one question, and `ZipArchive` is not compiled in on this development machine — an import that works on one deployment and says "please save as CSV" on another is worse than one that simply works. `App\Support\Newsletter\Xlsx` reads the ZIP central directory itself and inflates with `gzinflate`, which is zlib and is effectively universal. The legacy binary `.xls` is a different format entirely and is **named and refused**, because parsed as text it yields one unreadable column and several thousand "invalid address" rows.

**A spreadsheet cell is positioned by its `r=` reference, never by counting.** A row with an empty column simply omits that `<c>` element, so `A,C` arrives as two cells and a reader that appends them in order shifts everything left from the gap — the company column silently becomes the first-name column for some rows and not others. That is not a crash, it is bad data, and it is what the gap test in `NewsletterTest` exists for.

**`mimes:` is worse than useless for a spreadsheet.** It validates the extension *guessed from the MIME type*, and an xlsx is a zip — so whether a real workbook passes depends on how complete the server's magic database is, and a file that imports on one machine and is refused on another is the worst kind of rule. `extensions:` on the name plus a magic-byte check on the contents, which is stronger than either. The careers form's `mimes` + `mimetypes` pairing still stands where the type is a real one.

**`apiFetch` JSON-encodes its body; multipart needs `apiUpload`.** A FormData handed to the first arrives as `{}` and Laravel answers "the file field is required" — which reads as the upload being rejected rather than as never having been sent. Measured.

**`response()->json($resource)` drops the `data` wrapper.** It serialises
through `jsonSerialize()`, which returns the resolved array; the wrapper is
added by `toResponse()`. So a created record comes back shaped unlike every read
of one, the client's `res.data` is undefined, and the console reports a failure
for something it just created. This has now happened on **two** modules — menus
and campaigns — so use `(new Resource($model))->response()->setStatusCode(201)`.
`NewsletterTest` pins it.

**A `next/link` pointing at a route handler prefetches it.** The subscriber
export was a `ButtonLink`, so merely *loading* the screen built a complete CSV of
the whole list on the server — fetched, cached and thrown away. Measured. A
route handler is not a page: use a plain `<a download>`.

**`redirect()` throws an error whose `digest` starts with `NEXT_REDIRECT`, not
whose `message` equals it.** A `catch` that tries to recognise and re-throw it
swallows it instead — the campaign was created while the screen said it had not
been. Keep `redirect()` outside the `try` rather than trying to identify it.

**A template's blocks are copied server-side from the template id.** The gallery
omits `blocks` deliberately — ten templates at six kilobytes each is sixty to
draw a grid of names — so a browser asked to post them back has nothing to post,
and the campaign arrives empty with nothing saying so. Copied rather than
referenced: editing a template must not rewrite a campaign already written, and
a sent campaign is immutable.

**Only `newsletter_signup_enabled` is published from the `newsletter` group.**
The public whitelist is by group, which is the right default — but that group
also holds the from-address and the batch sizes, and the site needs exactly one
fact from it: whether to draw the signup form. Named explicitly in
`ContentController::settings()` so it stays one considered exception rather than
a second whitelist that grows.

**A slider has no URL, so it must not use `Sluggable`.** That trait writes a
301 on every slug change, which for a slider would point `/sliders/old` at
`/sliders/new` — two URLs that have never existed — and the proxy would
answer a real request with a redirect into a 404. `Slider` generates its own
unique slug in ten lines instead.

**`loading="lazy"` inside a scroller defers the slide nobody has reached yet,
which is every slide but the first.** All of a carousel's slides are in the DOM
at once inside `overflow-x-auto`, so slides two onwards are not "below the
fold" in any sense a person would recognise — they are simply not scrolled to,
and the browser waits. Pressing Next therefore *started* the download and the
reader watched an empty box for as long as the network took. `Slider` now
eager-loads whatever is within one slide of the current index, **wrapping**:
`goTo` wraps in both directions, so the slide before the first is the last one,
and a plain `Math.abs(i - index)` calls that the furthest away rather than
adjacent. Neighbouring *videos* stay at `preload="metadata"` deliberately — an
image is tens of kilobytes and buys an instant slide, a video is megabytes
fetched for something nobody asked to watch.

**The slide placeholder sits under the media, not over it.** Over the top it
would have to be removed at exactly the right moment, and it would cover a
video's own poster — which paints immediately and is a better placeholder than
any skeleton. Under it, the media covers it as it paints. It still clears on
load, because `motion-safe:animate-pulse` running forever behind every loaded
slide is wasted work, and **`img.complete` is checked in a ref callback as well
as `onLoad`**: a cached file can finish before React attaches the handler, so a
placeholder cleared only by the event would sit over a picture that is fully
there — on every visit after the first. `onError` clears it too, or a broken
image pulses for ever.

**CMS pages have two templates and the value is allowlisted.** `default` caps
the body at 72ch; `wide` drops the cap, for a page built around an embedded
slider or gallery. The API refuses anything else with a 422, because a template
the frontend does not know would fall back silently — a page laid out the wrong
way with nothing saying why. A slider embedded by shortcode carries no measure
of its own, so the template is what decides its width.

**Rich text is sanitised on write, in `prepareForValidation()`.** `Prose`
renders CMS bodies through `dangerouslySetInnerHTML`, so `HtmlSanitiser` is
the only thing between a content-manager account and script on every visitor's
page. A new rich-text field must be declared in the request's
`richTextFields()` or it bypasses the sanitiser entirely — and the allowlist
in `config/purifier.php` is deliberately the exact set the editor's toolbar can
produce and `prose.tsx` styles, so widening one without the other ships either
markup the site renders unstyled or a button that silently does nothing.
Covered by `tests/Unit/HtmlSanitiserTest.php`; add a case when you touch it.

**The editor is Summernote, and three files have to agree about what it may
produce.** `rich-text-editor.tsx` decides which buttons exist,
`config/purifier.php` decides what survives the save, and `prose.tsx` decides
what the live site styles. Both failure directions are silent: a button whose
markup the allowlist drops looks like it worked until the page is reloaded, and
a tag the allowlist admits that `Prose` does not style renders as unstyled
markup on a public page. Change them in that order.

**The toolbar is the full set, and the two omissions are audit rules rather
than taste.** No `h1` — the page renders exactly one and it is the record's
title, so a second in the body fails `npm run audit` on every screen showing
it. No `h5`/`h6` — the same audit fails a heading-level jump. Everything else
Summernote ships is on: colour, highlight, font family and size, alignment,
indent, line height, tables, sub/sup, code blocks, rules, video and full screen.

**`styleWithCSS` is off, and turning it on is the trap.** With it on,
`document.execCommand` writes CSS instead of elements: Bold becomes
`<span style="font-weight:bold">`, which carries no emphasis for a screen
reader and which `Prose` does not style — and Underline becomes
`text-decoration-line`, a longhand the CSS allowlist does not name, so it was
being **dropped on save with nothing reporting it**. That was measured in a
browser, not reasoned about. Off, the same commands emit `<b>`, `<u>` and
`<font>`, which is why `b`, `i`, `strike` and `font` are in the allowlist: they
are what a browser actually hands over, and leaving them out does not produce
semantic markup, it produces a Bold button that does nothing.

**`HTML.TidyLevel` is `heavy`, and the shipped default would store `<font>`.**
HTMLPurifier's deprecated-element transforms all sit in the top band while the
default is `medium`, so at the default a `<font color>` is simply *kept* —
allowlisted, written to the database, and rendered as a deprecated element.
At `heavy` it is rewritten to a `<span style>` whose declaration is then
validated property by property. `HTML.TidyRemove` exempts `u` and `s`, whose
transforms are a loss rather than a normalisation: both are real elements the
allowlist admits and `Prose` styles, and flattening them into spans throws the
markup away to reproduce the appearance.

**Inline style is an allowlist of *properties*, not an open door.** Seven
toolbar controls work by writing inline CSS, so refusing `style` outright would
break them — but HTMLPurifier parses each declaration and validates the value
against the property's own grammar, so `expression(...)` and
`url(javascript:…)` are refused for not being valid values rather than by being
on a denylist. `position`, `display` and `z-index` are absent deliberately:
those are what let body content leave its own box and cover the page's chrome.

**A video is an iframe, and the host check is what makes that safe.**
`URI.SafeIframeRegexp` pins it to YouTube and Vimeo, anchored so
`youtube.com.attacker.test` cannot pass — the same trap `App\Support\YouTube`
documents for `str_contains`. Summernote's own list runs to nine hosts and each
is a decision about who may run code in a frame here, so the set is stated in
three places that must agree: that regexp, the editor's toolbar, and
`frame-src` in `next.config.ts`. A host allowed in one and not the others is
either a video that vanishes on save or one that saves and renders as an empty
box.

**`isBlank()` has a list of elements that *are* content.** A body holding only
a video has no text, and the old check — no text and no `<img>` — therefore
discarded it whole, after HTMLPurifier had kept the iframe perfectly. `<img>`
was sufficient exactly while it was the only childless element the allowlist
admitted. `CONTENTFUL_TAGS`.

**An image in a body goes to the media library, never into the body.**
Summernote inlines a chosen, dropped or pasted file as a base64 `data:` URI by
default — ~540KB in a MySQL TEXT column for a 400KB photograph, carried by
every read of that record, and invisible to the library, so it can never be
found, renamed, given alt text or deleted. `uploadEditorImageAction` posts it to
`/admin/media` instead and inserts the returned URL, which also puts it through
the SVG sanitiser that a `data:` URI would have gone around. The **Library**
button beside it inserts one already there — without it, reusing an image means
uploading a second copy under a second hashed name.

**A custom Summernote button must be given `container`.** Summernote's own
Buttons module wraps `ui.button` with a method that sets it; a custom button
calling `context.ui.button` directly skips that, and `TooltipUI.show` then
reads `.top` off `undefined` — on hover, so the button works and the console
fills with a TypeError the moment anyone points at it.

**Summernote's dialogs are moved to `<body>` by `dialogsInBody`.** Every CMS
form here is one `<form>`, and a dialog left where it is built puts its inputs
inside that form — so Enter while typing a URL into the link dialog submits the
record. The consequence is that those dialogs are **not** inside `.cms-editor`
and cannot be styled through it; the rules for them in `globals.css` are scoped
to Summernote's own class names.

**Summernote ships a light-only stylesheet and the console has a dark scheme.**
Every panel, border and button is re-pointed at the theme's tokens in
`globals.css` — no literal colours, since every one of those surfaces inverts.
`AUDIT_SCHEME=dark npm run audit` measures the CMS edit screens, which is
exactly where the editor is, so left alone it is a white slab in a near-black
page that fails the contrast gate rather than merely looking wrong. The
editable area is pinned to 16px there too: the `width < 40rem` block lifts every
*form control* to 16px for iOS, and a contenteditable div is not one.

**Rich text becomes plain text through `HtmlSanitiser::toText()`, never
`strip_tags`.** `strip_tags` deletes a tag without leaving anything in its
place, so the end of one block runs into the start of the next — the
downloads page published *"…asked for.Remote supportWhen an engineer…"* as its
meta description, and that is what a search engine showed. `toText` spaces
**block** tags only: doing it for every tag breaks the other way, since
`<strong>ten</strong>ths` is one word. It feeds all nine `defaultSeo()`
descriptions and the plain-text half of the notification emails.

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

**Outgoing mail is chosen in Settings, and `MailTransport` is the only list.**
Six transports — SMTP, Gmail via OAuth, Brevo, Mailgun, SES and log — with the
enum owning each one's label, its fields, its composer package and whether that
package is installed. The settings screen builds its form from
`transports[].fields` and `MailSettingsProvider` configures Laravel from the
same enum, so adding one is a case rather than a change in four files that then
have to agree. **Every one of them also speaks plain SMTP**, so the `smtp`
transport reaches Brevo, Mailgun or SES with no bridge at all.

**Two of the three API bridges ship; SES does not.** `symfony/brevo-mailer` and
`symfony/mailgun-mailer` are required, along with `symfony/http-client`, which
both call at runtime while declaring it dev-only — install either bridge without
it and the first send fails. `aws/aws-sdk-php` is **deliberately absent**: it is
~50MB of vendor on every deploy for a transport nobody has chosen yet, and
`composer require aws/aws-sdk-php` is the whole of turning SES on.

That makes `isAvailable()` a live path rather than a defensive one. It is a
`class_exists`, so it describes *this server* rather than composer.json: SES is
offered, disabled, and labelled with the command that installs it — the same
rule the media library follows when it refuses to resize an SVG. Better than a
class-not-found the next time a ticket tries to send a receipt.

**A transport can be stored that this server cannot build.** Choosing SES in
the dropdown is impossible — the option is disabled — but a stored value
survives a vendor directory changing under it, which is exactly the case
`MailSettingsProvider` guards: it logs and leaves `.env` in charge rather than
half-applying a transport that would throw on the next send, and the test button
answers 422 with the install command. The "not installed" alert is therefore
reachable **only from stored state**, so no audited route renders it — it was
measured by hand at 5.36:1 light and 7.57:1 dark. That is the same gap that let
`Alert` ship 1.53:1 in dark for months.

**Laravel's Mailgun factory reads `secret`; Brevo's transport reads `key`.**
Both are "the API key" and both are a string in a config array, so nothing —
not the type checker, not a code review — distinguishes them. The wrong one
produces `Undefined array key "secret"` at *send* time, from a screen that had
just reported the settings saved. `MailSettingsProvider::applyMailgun()` is the
only place that spelling is decided, and
`tests/Feature/OutgoingMailTest.php` builds each API transport for real to pin
it: reverting the one word fails exactly two of the nineteen.

**A field two transports share must be rendered once, not once per panel.**
`mail_api_key` belongs to Brevo *and* Mailgun, and the mail panel keeps every
transport's fields mounted — so a panel-per-transport layout put two inputs
with the same `id` and `name` in one form. The label then focuses the hidden
twin, and the browser submits both values for one key. It appeared to work only
because a blank secret means "unchanged" and the empty one was discarded; that
is a rule from the settings API holding the form together by accident.
`mail-panel.tsx` renders the deduplicated union and hides what the chosen
transport does not read.

**The mail test takes an optional recipient, and the body is what keeps it
safe.** It defaults to the signed-in administrator; an address may be given
because the question it usually answers is whether mail reaches *outside*, and
a Gmail inbox proves SPF, DKIM and reputation in a way the same domain cannot.
What stops that being an open relay is that **the caller cannot influence a
byte of what is sent** — one fixed sentence, an authenticated administrator,
six a minute, and the recipient written to the activity log. The input carries
no `name`: it sits inside the settings form, and a named field would either be
saved as a setting or silently dropped depending on its prefix. Enter is
intercepted for the same reason — the default action there is "save every
setting on the screen".

**`mail_error` exists because `Notifier` swallows.** A committed ticket must
still answer 201 when mail is down, which is right for SMTP where failure means
an outage — and not enough for OAuth, where a refresh token expiring is a
certainty. Without it the console looks healthy while every receipt stops
arriving. A failed refresh or send writes it, Settings shows a banner, a
successful test clears it. **Do not "fix" this by making Notifier throw.**

**The OAuth redirect is compared to this site's callback path exactly.** It is
echoed to Google and reused at exchange, so an unchecked value is an open
redirect ending with somebody else holding a code for this mailbox.
`str_contains` would accept `technoware.in.attacker.test` — the same reasoning
`App\Support\YouTube` already follows. The `state` is server-side and
single-use for the matching reason.

**Google's SMTP scope is full mailbox access and there is no narrower one.**
`https://mail.google.com/` is what SMTP AUTH accepts; `gmail.send` is send-only
and works only against the Gmail HTTP API, which is a different transport.
`access_type=offline` *and* `prompt=consent` are both required or no refresh
token comes back at all — and the connection then dies in an hour, looking like
a bug in the exchange.

**A mail settings change takes effect on the next request**, because
`MailSettingsProvider` applies it at boot. Save, then test. In a test, re-boot
the provider and `Mail::purge()` — the manager caches a built mailer per name,
so new configuration reaches nothing until the old instance is dropped.

**The `log` transport gets its own channel at `debug`.** Laravel's log mailer
calls `$logger->debug(...)`, and both `.env` files ship `LOG_LEVEL=warning` — so
choosing "write to the log" produced a cheerful "sent" and nothing on disk
anywhere. It now writes to `storage/logs/mail.log` on a channel pinned to
`debug`. Exactly the trap the password-reset audit line was already caught by.

**Two settings groups are private and must stay that way.** `mail` holds the
SMTP credentials and `integrations` holds the API key. They are excluded from
the public `/settings` whitelist, marked `is_secret`, encrypted at rest, and
never returned to the browser — the admin response says only whether a value
is set. A blank submit means "unchanged", because the form can never show the
current value; clearing one is a separate endpoint. When adding a setting, ask
which of those two lists it belongs on before adding it to the seeder.

**`lib/settings.ts` is `server-only`; the pure helpers live in
`lib/site-settings.ts`.** The header is a client component and needs
`telHref`. Importing it from the fetching module pulls `server-only` into the
client bundle and every page 500s. Types and pure functions go in the second
file; anything that fetches stays in the first.

**A map embed URL is validated against Google's host on write.** It becomes an
`iframe src` on the contact page, and an unchecked one is somebody else's page
rendered inside ours.

**Notifications must never fail a request.** Everything goes through
`App\Support\Notifier`, which logs and swallows. A ticket that is already
committed must still return 201 when the mail server is down — telling a
customer their ticket failed while it sits in the database means they send it
again. The internal-note guard is at the **call site** in the admin reply
path, not inside the notification: an engineering note reaching a customer
inbox is the worst failure this system has, and the check belongs where
anyone reading that method will see it.

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

**The two principals must not share anything keyed on a value they both
hold.** Both password brokers pointed at `password_reset_tokens`, whose primary
key is the email address — so a token issued to a *customer* reset the *staff*
account at the same address. Verified working before the fix, and it is
privilege escalation into the admin console. Customers now have
`customer_password_reset_tokens`. This is the same shape as the id collision
between `Customer` and `User` that `EnsureUserIsCustomer` exists for.

**A sign-in code is the third secret with that shape, and `sign_in_codes` is
keyed on `(audience, email)` for exactly that reason.** Not filtered by
audience after the lookup — keyed on it, in every query, because "the check
that is applied afterwards" is the one somebody removes while refactoring.
`SignInCodeTest` pins both directions, and deleting the audience clause from
`SignInCodes::consume()` fails precisely those two tests. The audience values
are the Sanctum token names already in use, `portal` and `admin`, so there is
one vocabulary for which principal is meant rather than two that must be kept
in step.

**Codes are the default way in and passwords are a link away.** The rules that
matter, each blocking something specific: hashed at rest, ten-minute expiry,
**five wrong entries burn the code** — the attempt cap is what actually closes
six digits, since a rate limit only slows guessing — single-use via a
conditional `UPDATE` on `consumed_at IS NULL` with the affected row count
checked, and a new code retiring any still outstanding. `random_int`, never
`mt_rand`.

**`request-code` writes a row for an address with no account.** Nothing is
sent, but the work done has to look the same from outside or the sign-in form
becomes the membership oracle `/auth/register` goes out of its way not to be.
The frontend has the other half of that rule: **the form advances to the code
step whatever happened**, because a form that only advanced for addresses it
recognised gives away precisely what the API withholds.

**One gap in that is real and is not closed.** Mail goes out inside the
request, so an address with an account behind it answers measurably slower —
measured here at 1.6s against 1.0s. The throttle bounds how fast that can be
walked; the fix is a queue worker, which is the deployment change `Notifier`
has wanted since tickets shipped.

**A code confirms an unverified address, and the support desk has to be told.**
Delivering a code and having it typed back is exactly the proof
`/auth/verify-email` asks for, so `email_unverified` cannot arise from this
path. The confirmation therefore fires `CustomerRegistered` the way the
verification endpoint does — without it a customer confirms by signing in,
waits for approval, and is in nobody's queue, which is the quiet failure in the
whole feature.

**Codes make the mailbox the only factor, and for the console that is a
reduction.** A password sign-in needed the mailbox *and* something known. It is
deliberate, it was asked for, and it is reversible from Settings without a
deploy: `otp_admin_login_enabled`. `password_login_enabled` is a separate
switch on purpose — mail is configured from the console and can be
misconfigured from the console, so an install that has turned passwords off and
then broken SMTP has locked every administrator out, and the way back in is a
database edit.

**One input for the code, never six boxes.** `components/ui/code-field.tsx`.
Six inputs breaks paste, announces six unlabelled fields to a screen reader,
needs hand-written backspace handling, and puts six targets inside the 24px
clearance the audit enforces. `autoComplete="one-time-code"` is the attribute
that earns the shared component: it is what lets a phone offer the code from
the notification, and it is exactly the thing that gets left off one of two
copies.

**`staff` middleware guards the whole admin group.** `role:` already refuses a
customer token, but logout, `me` and change-your-own-password are reachable by
every role by design and each carried its own inline `instanceof User` check.
The third was added without one and a customer token could call it. One
middleware on the group cannot be forgotten; the inline checks are gone.

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

**In a Server Action, `updateTag()` — not `revalidateTag()`.** `updateTag`
gives read-your-own-writes, so an editor sees the change immediately instead
of waiting out the revalidate window. (In Next 16 `revalidateTag` also takes a
second argument now, so the old one-arg call is a type error, not a silent
no-op — but reach for `updateTag` here regardless.)

---

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
  Field, Alert, EmptyState, ErrorState, PageHero, Breadcrumbs, FaqList, Prose,
  SpecTable, CtaBand) rather than writing new one-off markup.

---

## Definition of done

Not a checklist to read — a command to run:

```bash
npm run dev                 # or npm run start against a build
npm run audit               # in another terminal
```

One-time setup: `npx playwright install chromium`.

`web/scripts/audit.mjs` drives a real browser over every route and fails on:

- WCAG AA contrast failures (alpha-composited backgrounds handled
  correctly, and measured against each element's **own** text — it used to
  skip anything over 140 characters, which exempted six elements on the
  homepage alone, one of them a 2.55:1 failure)
- heading-level jumps, or anything other than exactly one `<h1>`
- horizontal overflow at 1280px or 360px
- tap targets under 24px that also fail WCAG 2.2's spacing exception
- a missing canonical URL, malformed JSON-LD, or an unescaped `<` inside it
- anything the Report-Only Content-Security-Policy would have blocked

It exits non-zero, so CI can gate on it. Pass routes to check specific pages:
`node scripts/audit.mjs /admin /admin/tickets`.

**It covers the console by default when `ADMIN_LOGIN_EMAIL` /
`ADMIN_LOGIN_PASSWORD` are set, and finds record screens itself** — 80 routes
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
the whole admin console — 53 routes — given credentials:

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
- **The logo is a text placeholder.** `#4A5A2A` is sampled from a screenshot,
  not the real file. See `web/src/components/layout/logo.tsx`.
- **`/privacy` and `/terms` are placeholder copy.** They read as real policy
  and are not. Needs a qualified legal review before launch.
- **The repository is public.** No secrets are committed and history is clean,
  but one accidental `git add -f .env` would be scraped within minutes.

See @README.md for setup detail, Plesk deployment and the full change history,
and @API.md for the endpoint reference — every route, what it returns, and the
behaviour that is not obvious from the signature.
