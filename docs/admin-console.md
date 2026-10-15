# The console's chrome

Role-filtered sidebar, the settings strip, the activity log, dashboard charts, client errors.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**The sidebar is filtered by role, and the filter is not the access control.**
`EnsureUserHasRole` is, on every route; `admin-nav.tsx` only stops the console
offering what it knows will be refused. Before it, all 24 destinations were shown
to everyone, so a content manager was offered Settings, Staff and the activity
log and got a 403 from each — a menu that is mostly locked doors teaches people
to distrust the whole thing, and it buries the handful of rows they actually work
in. A group whose every child is hidden is dropped rather than rendered empty,
the rule `getMegaMenu()` already follows.

**Filtering the sidebar forced the landing to be decided too.** `/admin` is the
ticket dashboard and needs `support_engineer`, so signing in put a campaign
manager on “We could not load the dashboard” with, now, no dashboard link to
explain it — a confusing landing turned into a dead one. `lib/admin-landing.ts`
sends each role somewhere it can actually use, and **`/admin/profile` is the
fallback** because every role reaches it.

**A section that mixes roles is a section that cannot be ordered, and "Site"
was the only one.** It carried fourteen rows across three of them — five
`content_manager` (Menus, Sliders, Galleries, Popups, Forms), four
`seo_manager` (SEO, Landing pages, Places, Redirects) and five `admin`
(Settings, Email templates, Staff, Activity, JavaScript errors) — which made it
both the longest group in the sidebar and the only one holding more than one
person's work. Those two facts were the same fact: Menus above SEO above Staff
is three lists concatenated, and there is no order that improves it.

It is **Site / SEO / System** now, split on the role, at five, four and five.
No row moved to a different role and no href changed, which is what keeps
`AdminNavRolesTest` meaningful — the only edit to a row was the label of
`/admin/seo`, from "SEO" to **"Overview"**, because "SEO › SEO" reads as a
mistake and Store and Assistant already name their first row that way.

**The two halves of that failed differently, which is why it was measured in a
browser rather than reasoned about.** `scripts/_nav-probe.mjs` signs in twice
and prints what each account is shown. An **administrator holds every role and
saw all fourteen**, so the sidebar's worst section was the one only
administrators could see in full. A single-role holder was never shown a long
list at all — the filter had always cut it to their own rows — so for them
nothing was long and the *heading* was what was wrong, a redirect filed under
"Site". Measured after: 7 sections for an administrator, and a
`content_manager` is shown Content, Catalogue and Site with SEO and System
**absent rather than empty**, which is the existing "drop a group whose every
child is hidden" rule doing the work.

**Below `lg` the sidebar is a full-width block behind a drawer toggle** — it
was a horizontal strip once, and seventeen unlabelled 16px slivers before that.
`npm run audit:mobile` is what says whether a new section fits; do not add one
without running it.

**Blog and Careers are sections too, and Careers is the one that spans two
roles.** Blog, Blog categories and Comments were a third of a nine-row Content
group spent on one subject and are their own section now; Content keeps
Knowledge base, Case studies, Pages, FAQs and Media. The cost of that one is a
press to reach Blog from elsewhere, and it is smaller than it looks: `groupFor`
opens the section holding the current route, so arriving anywhere in the blog
opens all three and moving between them is free.

Careers puts Vacancies beside the Applications it receives — the two halves of
one job, and previously the two furthest-apart rows in the sidebar. They are
gated apart deliberately (a CV has no business with whoever edits the blog), so
**only an administrator holds both roles and sees both rows**.

**Which is why a group with exactly one visible child renders as that child.**
The sibling of "drop a group whose every child is hidden", and the rule that
makes a two-role section affordable: without it a content manager would get a
section called Careers containing one link, which is the complaint this file
already records about "Your account" living inside "Site". Measured in a
browser: an administrator sees 9 sections and 46 rows; a content manager sees 4
sections, 21 rows and **Vacancies as a plain row** in the section's position; a
support engineer sees 5 top-level rows with **Applications among the queues** —
which is exactly the sidebar they had before any of this.

**The settings screen had the same disease one level down, and a wrapping strip
is why nobody noticed.** Twenty tabs in a `flex flex-wrap` row do not overflow
— they wrap, so every audit passes and the cost is vertical: measured at two
rows at 1440px, three at 1024px and **six rows, 230px, at 390px**, which put
the first field 528px down a phone screen. `TabDef` now takes an optional
`section`, and `settings-form.tsx` groups the twenty into six — Site, Content,
Shop, Messaging, Access, Privacy. **Be honest about what that bought**: one row
of tabs at every width, but two strips instead of one, so at 1440px the first
field moved 275px → 276px. The gain is scanning, and narrow widths (528 → 449).

**`SCREENS` is the only list, and `ORDER` is derived from it** (it was
`SECTIONS`, one screen's chips, until 2026-09-20 — see "Settings by section"
below), because the two going out of step is how this went wrong in the first
place. Three groups —
`blog`, `portal` and `security` — had been added to the settings table since
`ORDER` was last touched, so they sorted to the end **and rendered their tab as
their own raw lowercase key**, which is what `GROUP_TITLES[group] ?? { title:
group }` does: a sensible fallback and a silent one. `portal` was the worst of
them, because a perfectly good title sat in `GROUP_TITLES` under the key
`support` — the group had been renamed and the title never followed. A group
no section claims now falls into "Other" rather than into a lowercase tab.

**Every panel still stays mounted, and grouping the strip must never change
that.** Tabs outside the open section are hidden with the `hidden` attribute
rather than dropped from the list, so each of the twenty panels keeps
`aria-labelledby` pointing at an element that is in the document. Verified by
counting in a browser before and after: 20 panels, 233 controls and 142
`setting__` names both times.

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

**The volume chart has a period, and the API decides the buckets (the
client, 2026-09-24).** Monthly, Quarterly, Half-yearly and Yearly are links to
`/admin?volume=…`, not a client toggle: the dashboard is a server component
fed by `/admin/dashboard`, and a choice in the URL survives a refresh and a
shared link. `TicketMetrics::VOLUME_PERIODS` is the one list — thirty days,
13 and 26 Monday weeks, twelve calendar months — because 365 daily points is
a line nobody can read a spike off. Counts are taken per day in SQL and
bucketed in PHP, so the grouping is identical on every database, and every
bucket is present as zero when empty (the `dailyVolume` rule one level up).
Each period is cached for a minute under its own key beside the metrics
block; `metrics.volume` stays the thirty-day series the tiles are measured
over. The axis labels one bucket in N so six or seven fit at 320px, and the
last label is anchored to the row as "Today" / "This week" / "This month",
for the reason the note below gives.

**An icon picker is a field and a dialog.** `IconField` is one row — the
glyph, its name, browse and clear — and the ~130 tiles open in a `Modal`
with the name under each and the search focused; picking closes it. The
inline grid it replaced was eight rows per homepage statistic. The hidden
input is unchanged, so the entity forms' Server Actions did not move.

**The ticket volume is two curves, and this is the one chart here that is SVG
(the client, 2026-09-23).** Opened and resolved as smooth lines with a gradient
fading under each, in the `--color-info` and `--color-ok` the legend already
used — referenced as `var(...)` inside the gradient stops, so a scheme change
repaints the chart and no hex reaches the file.

The rule at the top of `metrics.tsx` says bars are divs because SVG text is in
user units and the hero's diagram once rendered a label set at 8.5 as 5.4px.
That rule is about **text**, and it is unchanged: every label on this card is
still HTML. What changed is the shape — a curve through thirty points cannot be
built out of block elements, where a bar is a rectangle and could.

Three things make the drawing honest. `preserveAspectRatio="none"` stretches
the plot to the card's box and `vector-effect="non-scaling-stroke"` stops that
turning a 2px line into a smear. The smoothing is a Catmull-Rom spline at the
standard sixth-of-the-span tension, so the line passes through every measured
day and never bows into a value nobody recorded — a chart that dips below zero
between two quiet days is drawing tickets that were never opened. And the hover
targets stay one transparent HTML column per day, because a `<title>` inside a
stretched path is a target the width of the stroke.

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

**And it is two curves now, not sixty bars (the client, 2026-09-23).** The
axis, the even ceiling, the weekly dates and the side-by-side argument above
all still hold — what changed is the mark: an opened and a resolved curve with
a gradient fading out under each, which is what makes two overlapping series
readable where two overlapping opaque areas are not. Four things it is bound
by. It is **SVG**, which every other chart here is not, and the rule that kept
them as divs is about *text*: a label inside a viewBox is in user units and the
hero's diagram once rendered an 8.5 as 5.4px — so the shape is SVG and every
label on the card stays HTML. `preserveAspectRatio="none"` lets the plot take
whatever box the card gives it and `vector-effect="non-scaling-stroke"` is what
stops that turning a 2px line into a 60px smear. The colours are
`var(--color-info)` and `var(--color-ok)` **in the gradient stops** — the two
the legend already used, referenced as tokens, so a scheme change repaints the
chart with everything else. And the smoothing is a Catmull-Rom spline at a
sixth-of-the-neighbouring-span tension, which keeps every control point inside
the span it belongs to: a curve that dips below zero between two quiet days is
drawing tickets nobody opened. The per-day figures stay as an HTML overlay of
transparent columns carrying the same `title` the bars carried, because a
`<title>` inside a stretched path is a target the width of the stroke.

**The tiles step one rung down below `sm`, and the console keeps its desktop
density everywhere else (the client, 2026-09-23).** `StatTile`'s figure was
26px and the metrics tile's corner glyph 32px, both sized for six tiles across
a desk monitor; on a phone each tile is the width of the screen and the number
shouts across an empty card. `text-22 sm:text-[26px]` and `size-6 sm:size-8`.
Nothing goes under 12px, and the density that the rest of the console buys with
its small type is the point of a tool worked at a desk for hours — this is the
one place the phone gets a different number.

**"Sign out" is a glyph below `sm`.** Two words in a row that has already given
up the account link and "View site" to fit 320px, so it wrapped and made the
header a row taller than anything in it. `IconSignOut` under `sm`, the words
from `sm`, and `aria-label="Sign out"` on the button at both widths — the name
is on the control rather than in it, so nothing reading the page ever meets a
button called nothing. A 16px glyph in `px-2.5 py-1.5` is 36x28, both past the
24px floor the phone audit enforces.

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

**Client errors are grouped by fingerprint, and resolving one is a tick that
re-opens itself.** Both error boundaries used to `console.error` and nothing
else, which recorded a crash in a console nobody was watching on a device we do
not have — and the public site had no boundary at all, so a visitor got Next's
bare "Application error". Reports upsert on a unique fingerprint (area +
message + digest), because read-then-write races the moment two browsers hit one
bug together. Every report clears `resolved_at`, so a fix that did not hold says
so; only `technoware:prune-client-errors` removes rows, on `last_seen_at` —
a bug first seen a year ago and again this morning is current.

**A dashboard tile is a link to the list that produced its number, filtered
the way the API counted it.** `?open=1` on the queue is `Ticket::open()`,
`?overdue=1` is `overdue()`, `?status=active` on customers is the customers
figure, and so on — every tile carries the filter its count was taken with,
so the figure and the screen behind it cannot disagree (the rule the store's
`attention` block already follows). The one tile that links conditionally is
"New enquiries": it opens the leads pipeline only when the caller has it,
because the tile is shown to every role and the list 403s for most of them.

**A column heading sorts, and it is a link.** `components/admin/sort-th.tsx`
renders `?sort=<key>&dir=asc|desc` over the list's current filters — first
press ascending, second flips it — and the API's `ListSort` allowlists the
key per list (`tickets`: subject, priority, due, status, created; `customers`:
name, company, status, created; `orders`: customer, total, placed, status;
`products`: name, sku, status, updated) and falls back to the list's own
order for anything else. A server component on purpose: the table sorts with
no JavaScript, the URL says how, and `aria-sort` on the active heading is
what a screen reader is told. Every ordering ends on the primary key, so a
page boundary cannot show one row twice.

**The ticket queue has a selection bar, and the selection is a module-level
store.** `admin/(app)/tickets/bulk.tsx` — a tick per row, a tick-all in the
header, and a bar above the table (the media library's `SelectionBar`, for
tickets) with a status, an assignee and a priority, each of which may be left
alone, sent as one `POST /admin/tickets/bulk`. The table is server-rendered,
so the ticks and the bar are separate client islands with no client parent to
own the state; `useSyncExternalStore` over a replaced-never-mutated `Set` is
how each reads it. The API applies each ticket in its own transaction and
answers with what moved and what it refused by reference, and the bar shows
both halves — a toast for the count, the refusals in place. The selection
clears when the page's rows change, and `TicketRowActions` is keyed on the
status and assignee it shows so a change made from the bar (or another tab)
re-mounts the row's controls rather than leaving them on the value they
opened with. `scripts/probes/ticket-bulk.mjs` measures the bar and the
sortable headings; it addresses rows by reference, because the queue orders
by priority and changing one moves the row.

**Ctrl/⌘ K opens a command palette, and its pages are the sidebar's rows.**
`admin/(app)/command-palette.tsx`, mounted in the bar with a button for
anybody without the shortcut. Two sources in one listbox: the console's own
screens — `palettePages()` in `nav-items.tsx`, the same role-filtered rows the
sidebar renders, as plain `{label, href, group}` so the client bundle carries
no icons — match from the first character; records come from
`/api/admin/search` (the API's `/admin/search`, each group present only for a
role that may open it) 200ms after the last keystroke from two characters. A
`<dialog>` of its own rather than `Modal`, because the input is the title;
`role="combobox"` with `aria-activedescendant` over the list, so the arrows
move a highlight the input never loses focus for, and every row is a real
link so a middle-click still opens a tab. Two measured details: Chrome spends
the first Escape on a non-empty `type="search"` clearing it and the dialog
never sees it, so the input closes the palette on Escape itself; and the
button's 30px at 320 was exactly the scheme toggle's margin, which is `sm:`
now. `scripts/probes/command-palette.mjs` measures it.

**A part of a screen is a row too, found by words its screen does not carry**
(2026-10-08). The client searched "cron" and got nothing: the scheduler's
command is a card on System status, and the palette matched a row's label
and group only. `PALETTE_SECTIONS` in `nav-items.tsx` lists such parts —
a label, the screen's path with the part's own id as the hash, and
`keywords`, the other words somebody types for it — and a `PalettePage` may
carry `keywords`, which the palette matches and never shows. Kept only for a
role whose sidebar names the screen, the settings rows' rule. The part's
heading needs a `scroll-mt-*`, or it lands under the sticky header. Add a
row there when a screen gains something people will look for by name.

**The sidebar says what arrived while the console was open, and so does the
tab.** `admin/(app)/new-since.tsx`: a poller in the layout asks
`/api/admin/new-since` (the API's staff-wide `GET /admin/new-since?since=`,
three counts and nothing else — the dashboard proper builds thirty days of
metrics and is the wrong thing to run once a minute from every open tab)
once a minute while the tab is visible, for what was created after the
moment the console was opened, kept in `sessionStorage`. Tickets and Leads
carry a badge; the title takes a "(3) " prefix, restored by a
`MutationObserver` when Next rewrites `<title>` on navigation, because the
tab strip is what people glance at from elsewhere and is the whole reason to
poll. Opening a queue marks it seen — the count at that moment is
remembered per key, so the two badges clear independently while the API's
`since` never moves. Each count is **null, never zero, for a role that
cannot open the screen**: a badge on a screen that 403s is worse than none.
Measured with a ticket created by hand while a signed-in tab sat on
Settings: "(1) Settings", a 1 on Tickets, both gone on opening the queue.

**Info bar is a screen, not a settings tab.** `/admin/info-bar`, under Site
beside Popups, renders `AnnouncementPanel` inside a form of its own that
posts through `saveSettingsAction` — which PATCHes only the `setting__*`
names it finds, so a form carrying the nine `announcement_*` rows saves
those and touches nothing else — and `settings-form.tsx` filters the
`announcement` group out of its strip. For a day it was both: a sidebar row
deep-linking into `/admin/settings?tab=announcement` and the same panel as a
tab of Settings, which the client read as a duplicate, correctly. The nav
test maps `info-bar` to the `settings` API prefix, since that is the gate
it is behind.

**Ctrl/⌘ K finds every settings tab and every setting (2026-09-17).** The
client: "it cannot find this level — it should find the last level of the
settings options, otherwise it is not useful". The sidebar had one row,
Settings, with twenty tabs behind it and five to fifteen fields each;
"Social profiles" and "Assistant colour" were unreachable from the
palette. `palettePages` appends `settingsPages()` for a role that can open
Settings: one row per tab (`/admin/settings?tab=social`, which `Tabs`
reads once as its starting panel) and one per setting
(`/admin/settings?tab=chatbot#setting__chatbot_colour`, the id every
generated control carries), built from `settings-copy.ts` — the one list
— so a setting added there is in the palette without anybody remembering
it. A hash target landed under the console's sticky header (measured at
y=0 with the header over it); `[id^="setting__"] { scroll-margin-top:
7rem }` puts it at y=112. Measured through the palette: "social prof"
finds the tab, "assistant colour" finds the field, Enter lands on it with
the right tab open.

**The screens are guarded by role, not only the sidebar (2026-09-20).** A
role that could not reach an API used to reach the page and read its error
state — "could not load" as the answer to "you may not be here". `proxy.ts`
forwards the path as `x-pathname` for `/admin` (a layout cannot see its own
pathname), and the console layout asks `screenRole()` in `nav-items.tsx` —
the longest sidebar row whose href is the path or a parent of it, `exact`
rows matching only themselves — whether `permits()` the account. `/admin`
for a role without the dashboard redirects to `landingFor()`; anywhere else
is `notFound()`. The profile has no row and needs none. The API still
refuses the data regardless: this is the page agreeing with it. Measured as
a content manager: `/admin` → `/admin/blog`, `/admin/users` and
`/admin/settings` and `/admin/store/orders` 404, `/admin/blog` and
`/admin/profile` 200.

**It had three holes, closed 2026-09-26.** A `Purpose: prefetch` request
skipped the proxy (the matcher's `missing` rule), so `x-pathname` reached the
layout as the browser sent it — or not at all, and a missing path skipped the
check. A client-side navigation never re-ran it, because the layout is kept
across navigations and the browser's router state decides which segments the
server renders. And the path was matched undecoded, so `/admin/%73ettings`
rendered Settings while matching no row. Now: `proxy.ts` has a second matcher
entry, `/admin/:path*` with no `missing` rule, and overwrites `x-pathname` on
every console request (and strips one sent anywhere else); the check is
`requireScreen()` in `lib/admin-screen.ts`, called by the layout and as the
first line of **every page** under `admin/(app)` (158 of them — a new page must
do the same), and it decodes and folds the path through `screenPath()` in
`nav-match.ts` and refuses when there is none. Pages rather than per-section
layouts, because any layout can be skipped by a request whose router state
claims to hold it; the page is the one segment always rendered.

**The media library's Bin is its glyph, and its lid moves (2026-09-20).**
`IconBin` in `icons-ui.tsx`, drawn in two groups so `globals.css` can lift
and tilt the lid on hover and hold it open while the bin is the view — the
lid *is* the state, which is what earns the console its one animated icon.
`transform-box: fill-box` makes the lid hinge on its own right end. Deleting
a folder asks for `YES` typed before the button enables: the files were
always kept (they go to Unfiled), but a folder is how a hundred uploads were
filed and a two-click dialog beside a rail of folders is what a slip lands
on. The word is cleared whenever the dialog opens for a different folder.

## Webhooks

`/admin/webhooks`, `role:admin`, beside Staff (2026-09-20). A hook is a
name, an https URL, a list of events and a secret; every subscribed event
is a signed POST to that URL, retried through the queue, logged per hook.
The API side is `App\Support\Webhooks\Webhooks` (emit), `DeliverWebhook`
(the job), `WebhookPayload` (what each event carries) and `WebhookUrl`
(what may be pointed at); `WebhookTest` pins each rule below.

**A message marked sensitive emits no `ticket.replied`** (2026-09-21), the
internal-note rule for the same reason and one more: the delivery row holds
the payload in clear, and the delivery screen shows it. `docs/tickets.md`.

**A webhook never fails the request that caused it.** `Webhooks::emit()` is
wrapped whole, like `Notifier::guard()`: a failure is logged at `warning`
and never thrown, because the ticket or the order is already committed and
a request that fails on the announcement is one the customer sends again.
The payload is a **closure resolved inside the guard, only when a hook is
subscribed** — the first cut evaluated `WebhookPayload::subscriber($row)`
as an argument, outside the try/catch, and a subscriber created without an
explicit status (null in memory, `active` in the row) threw on
`$this->status->value` and took `NewsletterTest` down. The builders re-read
a row whose defaulted column is still null, so the payload is the row as the
console reads it.

**Emitted from the model's own state change wherever one expresses it.**
`Ticket::created`, `Ticket::updated` with `status` changed (`from`/`to`
added), `TicketMessage::created` when not internal (the message added — an
internal note is refused at the source, so no emitter has to remember),
`Order::updated` when `paid_at` goes from null to set (`order.paid`: the one
definition of paid, whether the gateway settled it or `ManualPayment`
recorded it) and when `status` changes, `Lead::created`,
`FormSubmission::created`, `NewsletterSubscriber::created` (once per address
— `SubscriberIntake` enriches an existing row and never re-creates it).
Two are not hooks: `order.placed` is one line in `Checkout` after the lines
are written, because at `Order::created` they do not exist yet; and
`customer.registered` is one line beside each `CustomerRegistered`
notification, because "registered" there means "address confirmed", which
no column alone says.

**The delivery row rides in the caller's transaction and the job is
dispatched after commit.** `DeliverWebhook::dispatch($id)->afterCommit()`:
a rolled-back checkout leaves neither a row nor a job, and a job can never
run before the row it names exists.

**Signed over `timestamp . "." . body`, and the bytes signed are the bytes
sent.** `WebhookDelivery::envelope()` encodes `{id, event, created_at,
data}` once; that string goes out through `withBody()` and into the HMAC
as-is. `X-Technoware-Event`, `X-Technoware-Delivery`, `X-Technoware-Timestamp`
and `X-Technoware-Signature: sha256=…` are the four headers, with
`User-Agent: Technoware-Webhooks/1.0`. A receiver that verifies over its own
re-encoding of the JSON will see a mismatch that looks like a wrong secret,
and the form says so beside the URL.

**The secret is shown once.** Minted server-side (`whsec_` + 48 hex from
`random_bytes`), stored through the `encrypted` cast, added beside the
resource on the 201 and on a PATCH carrying `rotate_secret: true`, and on
no read — `WebhookResource` never carries it, so no list or edit screen can
leak it, and `has_secret` is the most it says. The console keeps the form
on screen after a create to show it in a `warn` alert that cannot be
dismissed, with a copy button. It never lands in the activity log: it is
never in a request body, and `secret` is on `ActivityLogger`'s `NEVER` list
besides; the create test asserts the row holds no trace of it.

**Fails closed on a private host.** `WebhookUrl::refusal()` on write:
https only, no credentials in the URL, no IP literal in a private or
reserved range in either family (`FILTER_FLAG_NO_PRIV_RANGE |
NO_RES_RANGE`, so the ranges are PHP's list), no `localhost`, no bare name
without a dot, no `.local`/`.internal`/`.lan`/`.home.arpa` — and, since
2026-09-26, no address written as a bare number (`127.1`, `0x7f.0.0.1`,
`0177.0.0.1`, `2130706433`) or as IPv4-in-IPv6 (`::ffff:127.0.0.1`), which
`FILTER_VALIDATE_IP` does not call addresses and the resolver reads as
loopback.

**And at send time, the address is resolved, checked and pinned
(2026-09-26).** The response excerpt is shown in the console, so a webhook
that reached `169.254.169.254` or a service on the LAN was a way to *read*
the inside of the network. `DeliverWebhook` resolves the host through
`App\Support\Net\PublicHost`, refuses any private, reserved, loopback,
link-local, CGNAT or IPv4-mapped answer (recorded like any other refusal and
retried), and hands cURL exactly the addresses it checked
(`CURLOPT_RESOLVE`), so a second DNS answer cannot be substituted. **A
redirect is a failure** (`withoutRedirecting()`): followed, a 302 from a
public host to the metadata service took the request past every check and
down to plain http. `PublicHost` is the one definition of "a host this server
may connect to on somebody's say-so", shared with the newsletter's mailbox
scan and the SMTP/IMAP settings; tests bind `PublicHost::RESOLVER` so no test
performs a DNS lookup.

**Retries through the queue: five attempts, `[60, 300, 1800, 7200, 43200]`
seconds.** Anything but a 2xx — a 4xx, a 5xx, a refused connection, a
timeout (`Http::timeout(10)` under a job `$timeout` of 15) — records
`response_status` and the first 500 characters of the answer, sets
`next_attempt_at` from the backoff and throws; the fifth failure lands in
`failed()`, which marks the row `failed` and writes the server's own words
onto the hook's `last_error`, which the list shows as an `err` badge and a
2xx clears. Attempts are counted before the send, so one the worker dies
inside still counts. A hook switched off between attempts is not sent to:
the delivery is marked failed with that reason rather than left pending.

**Ping and redeliver are a person asking for a specific send**, so the
subscription list is not consulted and — unlike `emit()` — a failure is the
answer and is thrown. Both answer 202 with the delivery, because the send is
a queued job and its outcome lands on the row. A redelivery is a **fresh
row** with the same payload and a new id: the log keeps what happened the
first time, and a receiver that dedupes on the delivery id would otherwise
drop the resend as a duplicate of the one it never got.

**A delivery's payload is on the detail read only.** The list carries
event, status, attempts, the server's answer and the timestamps; fifty
orders are not fetched to draw fifty lines. A delivery under another hook's
URL is a 404, never a 403.

**Pruned at thirty days** by `technoware:prune-webhook-deliveries`, nightly
beside the other prunes, in chunks of a thousand. Each row is a stored
payload — an order, a lead with a telephone number — and a month is longer
than any retry and long enough for a quiet hook to be noticed.

**The console.** The list is name, URL, events, active, last delivered and
the last error; the form is name, URL, the event checkboxes from
`meta.events` (the API's list, never TypeScript's), the active select and,
on the edit screen, Rotate secret as a second submit button (`name=
"rotate_secret"`) so rotating also saves and the new secret arrives in the
same action state the form already reads. The edit screen's tabs sit
*around* the form, not inside it: the Deliveries tab holds a table whose
rows each carry a one-press Redeliver `<Form>`, and a form inside a form is
one the browser drops silently. Send a ping is in the `PageHeader` row and
lands on `?tab=deliveries`. Both screens are in both audit lists, the edit
screen as a `DISCOVER` entry because nothing seeds a webhook.

## Settings by section (2026-09-20)

**Settings holds only what the whole console shares.** The client's rule:
`/admin/settings` had grown to twenty-six tabs behind seven chips, with the
shipping charge beside the SMTP password and the blog's comment switch beside
data retention. It keeps identity (General, Contact, Social profiles), the two
sign-in doors (Sign-in screen, Sign-in — both serve staff and customers), the
infrastructure every module spends (Outgoing mail, API keys) and Data
retention. Everything a module owns is a **"Settings" row at the end of that
module's sidebar section**: Site → Settings (homepage copy, palette, motion,
page banners, embeds, analytics, consent), Blog → Settings, Content → Media
settings, SEO → Settings (defaults, the assistant, IndexNow), Store → Settings
(the shop, delivery, licences, payments), Campaign → Settings, Leads →
Scoring, Tickets → Email to ticket, Customers → Portal, Assistant → Settings.
Info bar, Themes and the Promo banner keep the screens they had.

**Ten screens, one component, one endpoint, one role.** Every screen is
`SettingsScreen` (`settings/settings-screen.tsx`) over `SettingsForm`, fed by
the same `GET /admin/settings` and saved through `saveSettingsAction` —
`PATCH /admin/settings`, `role:admin`. A store manager sees Store without its
Settings row and a campaign manager sees Campaign as the single link it always
was: every new row is `admin`, the sidebar filters by role, and a group with
one visible child flattens. Opening a module's settings to that module's role
would need a per-group endpoint with a decision per secret (Razorpay keys to a
store manager?), and the client chose administrators only; the Promo banner is
the one narrow door of that kind, and the pattern to copy if that changes.

**`SCREENS` in `settings-copy.ts` is the list.** Path, title, area, lede, save
label, which status reads a panel needs (`mail` for the transport panel,
`inbound` for the mailbox panel), and the groups in sections. The sidebar rows,
each screen's tabs, `ORDER`, `sectionFor()` and the command palette's tab and
field entries — now at whichever screen draws the group — are all derived from
it. A screen with one group draws no tab strip; only System keeps section
headings, because seven flat tabs measured one row at every width. Each `path:`
and each `groups: [...]` stays on one line: `SettingsScreensTest` reads them by
regex, seeds the settings table, and fails by name when a group is drawn on no
screen (it would fall into "Other" on System under its raw key) or on two (it
would be saved from whichever was opened last), when a listed group does not
exist, when a screen has no `role: "admin"` sidebar row, or when it has no
`page.tsx`. Reverting `indexnow` out of the SEO screen fails exactly that test.

**Tickets, Customers, Leads and Campaign became groups to carry their row.**
For an administrator that is one more click from another section — the
accordion opens the section holding the current page, so it costs nothing
while working inside it — and the "new since" count a collapsed group would
hide is summed onto the group header (`groupArrived` in `admin-nav.tsx`).

**The sidebar lights the longest matching row.** `isOn` was any-prefix, so on
`/admin/tickets/settings` both Tickets and Email to ticket lit. `exact` on
Tickets looked like the fix and is the wrong one: `screenRole()` — the role
gate on every console path since 2026-09-20 — is longest-prefix, and an
`exact` Tickets row would match no row on `/admin/tickets/TW-…`, which
`permits()` reads as "nothing gates this". Both now call `bestRow()` in
`nav-match.ts`, a module with no imports so the client nav may value-import
it. Measured: every settings screen lights exactly one row, and a content
manager on a ticket detail still gets the 404.

**A settings action refreshes every screen.** Eight `revalidatePath("/admin/settings")`
calls — the save, a cleared secret, mailbox connect/disconnect/test, the
three provider tests — would each have refreshed the one screen the panel no
longer lives on. `revalidateSettingsScreens()` in `settings/revalidate.ts`
loops `SCREENS`.

**Deep links moved with the groups, and the OAuth callbacks did not.**
`/admin/settings?tab=tickets` became `/admin/tickets/settings` on the mailbox
consent page's Back button; `?tab=integrations` still opens API keys. The
callback *routes* — `/admin/settings/mail/callback`,
`/admin/settings/tickets/callback` — are registered with Google and
`CallbackPath::assert()` compares them exactly, so they stay where they are.

**Eleven groups gained a `FIELD_ORDER`, and thirteen fields a label.** The
plain-grid groups (social, blog, media, store, portal, auth, analytics,
security, …) drew in the API's alphabetical order and were absent from the
palette, which lists fields from `FIELD_ORDER`; `comments_closed_after_days`
was its own label. `scripts/probes/settings-screens.mjs` measures the lot:
every screen renders, the union of `setting__*` names across the ten is the
201 the one screen carried with none on two screens, one lit row per screen,
a Ctrl+S save on Blog → Settings reads back after a reload, and Ctrl+K finds
"close comments", "email to ticket" and "delivery service" at their new
addresses.

**A boolean setting is one component (2026-09-21).** `SettingSwitch` in
`components/admin/setting-switch.tsx`: the visible checkbox beside a
controlled hidden input carrying `1`/`0` — an unchecked checkbox posts
nothing, and every settings action PATCHes only what it finds, so a bare
checkbox could switch a thing on and never off — re-asserting its own checked
state after every render, because React 19 resets a form's controls when its
action completes. Three screens carried their own copy: the promo banners
(state-owning), the info bar (stateless, with a panel-level loop re-asserting
every checkbox) and the ticket mailbox (inline). Controlled, because the
value usually drives something else on the screen. The same review pass moved
seven ad-hoc `en-GB` date formatters onto `lib/dates.ts` (`dateTimeShort` is
new — a queue's timestamp without the year), eight `<section … bg-card>`
panels onto `Card`, and three drifted helper copies into `lib/`
(`format-bytes.ts`, `initials.ts`, `request-host.ts`).

**It is a sliding switch since 0.135.0** (the client: "all settings 0/1
should be replaced by animated sliding small switch. it can save the space
of each settings page"). Three parts:

- `components/ui/switch.tsx` is the drawing and nothing else: a real
  `<input type="checkbox" role="switch">` laid over a 36×20 track at zero
  opacity, the track its next sibling with a look keyed on `peer-checked` /
  `peer-focus-visible` / `peer-disabled`. **Not `sr-only`**: clipped to a
  pixel the control cannot be pressed where it is drawn, which a screen
  reader's touch exploration and Playwright's `setChecked()` both need (two
  existing probes tick a setting that way). The input is 24px tall, the
  tap-target floor, and the track takes no pointer events. Still a checkbox, so a label's `htmlFor`, Space, a form's
  own posting (the email templates post `name`/`value="1"` after a hidden
  `0`) and every existing `checked` work unchanged. The thumb moves with the
  CSS `translate` property — `peer-checked:after:translate-x-4` sets
  `translate`, so the transition names `translate`; `transition-transform`
  would animate nothing. The track at rest is `faint`, on it is `brand-600`,
  and the thumb is `card` at rest and `brand-on` when on — both invert, since
  in dark the resting track is light and the 600 fill bright, and a white
  thumb would vanish into either.
- `SettingSwitch` composes it beside the hidden `1`/`0` input, as before.
  `SettingSwitchField` lost its bordered box — the box was most of the height
  of a screen of switches.
- **A row whose options are exactly `0` and `1` is a switch**
  (`onOffNotes()` in `settings-fields.tsx`, called before the `ChoiceField`
  branch). Those rows — the four backup switches, online meetings, "leave
  out busy Google times", basket reminders — were dropdowns "because the
  options' descriptions are the point"; the description now sits under the
  label and follows the state. Decided by the options, never by a list of
  keys, so a two-choice row with other values (`dispatched`/`paid`) stays a
  dropdown and the next on/off row the API describes needs nothing here.

Also moved onto it: the three ways of paying on the payments tab (a
hand-written Offered/Not offered `<select>`), "This is a variable font", the
theme's per-section Show, and the email templates' two switches. **Not
moved, on purpose**: tick boxes on record forms (Featured, Show in menu, a
custom field's checkbox) — those are a record's fields, and a grid of
relation tick boxes is a list, not a set of switches.

`scripts/probes/setting-switch.mjs` reads every screen's path out of
`settings-copy.ts` and fails on an Off/On `<select>`, a bare tick box
posting a `setting__` key, or a switch whose hidden value disagrees with it;
it samples the thumb's `translate` part-way through the slide, toggles from
the keyboard, and saves one setting over and back to prove the state
survives React's form reset and a reload.
## The AEO tab (2026-09-21)

Every entity form that carries answer blocks — pages, products, store
products, product categories, store categories, brands, services, solutions,
blog posts, knowledge articles, industries — ends on an **AEO** tab
(`docs/aeo-geo-contract.md` §7). It is appended after SEO so every existing
tab keeps its place, and the brand form, which had one pane, gained `Tabs`
for it. The tab is one JSX child holding three things in order:

- `AeoGeoPanel` (`components/admin/aeo-geo-panel.tsx`): the AEO and GEO
  readiness scores with their failed checks, read on mount through a Server
  Action from `GET /admin/seo/{type}/{id}` — the overview's own Recheck read
  — and re-read by its Recheck button, so a save can be re-scored without a
  reload that would cost the form. Either score the API has not sent is
  "Not scored yet", never zero; a 404 there (a brand is not on the SEO
  overview) is "not scored" too. Under the scores, the same `AiSeoPanel` the
  SEO tab draws, with `scope="aeo"`: it renders the actions in
  `AEO_ACTIONS` and the SEO tab's instance renders every other, so an action
  the API has not learnt appears on neither and a button's label is always
  the API's. Apply on `answer_blocks`, `product_qa` and `faq_suggest` hands
  the rows to the repeaters below through two form events
  (`tw:answer-blocks-suggested`, `tw:faqs-suggested`), as drafts, unsaved —
  the SEO panel's "put into the form, never the record" rule.
- `AnswerBlocksField` (`components/admin/answer-blocks-field.tsx`): the
  repeater, `FaqField`'s shape — rows in state, one hidden JSON `answer_blocks`
  the API replaces the set from. Its kind select is `meta.answer_block_kinds`
  from the entity's own admin index (`getAnswerBlockKinds()` in
  `lib/admin/aeo.ts`, one row's worth, so a store manager who cannot read
  `/admin/solutions` still gets the list); with no list the existing rows
  keep their raw kind and nothing can be added, said on the screen. The
  question is required when the kind `asks_question` and offered as optional
  otherwise; the answer counts against 600 in `Field`'s `hint`; the rich-text
  `detail` mounts its editor on demand, since one Summernote per block on a
  tab most records never open is a lot of editor. A row with nothing typed
  is dropped; a `question` block missing its question is sent and refused by
  the API onto this tab, never thrown away in silence. **The row key is never
  in the markup**: a module-level counter that reached a DOM `id` hydrated
  differently on the server, where the module lives across requests, and
  that was a hydration error on the first audit run.
- `FaqField`, for the seven entities that gained FAQs with the feature; the
  four that had them keep them on Related, and the AEO tab's `fields` lists
  only `answer_blocks` there.

`/admin/seo` carries AEO and GEO as sortable columns (`SortTh`, `?sort=aeo|geo`)
and two band filters (`?aeo=`/`?geo=` of `poor`/`fair`), a dash where a record
is unscored. The store product form gained `warranty` and `applications` on
Content and a Related tab with the `service_ids` picker, whose options fall
back to the record's own `services` when `/admin/services` could not be read.

**AEO and GEO improvement suggestions (2026-09-21).** Two layers under each
readiness score on the AEO tab, and the difference is who wrote them. The
first is the rubric's: every failed check with its weight and a hint saying
what would earn it, from `AeoScore`/`GeoScore` through
`GET /admin/seo/{type}/{id}` — always there, costs nothing, and is the
honest floor of the feature. The second is the assistant's: "Suggest
improvements" runs `aeo_analyze` or `geo_analyze` and draws the result
inline — summary, gaps, what to do in order, what is already strong, and
when it was asked — rather than in the AI panel's dialog, because the
question was about *this* score and the answer belongs under it. Only while
the assistant is on with a key: `AiSeoPanel` tells the readiness panel
through `onReady`, and with it off the button is not drawn (the rule the
panel follows everywhere).

Two things about the plumbing that are decisions. **There is one run path.**
The readiness panel does not call `runSeoAiAction` itself; it asks the AI
panel through a handle (`ref.run(action, extra, {quiet: true})`) and hears
back through `onSuggestion`, so the "N left today" counter and the history
move once whichever button was pressed — the AI panel's own "Analyse for
answers" lands under the score too. `onHistory` hands over the stored
suggestions on load so a form reopened shows the newest analysis rather
than a blank the editor has to pay for again. And **a quiet run opens no
dialog**: the caller draws the words, and the dialog would show them twice.

**"Improve an answer" names its block.** The API requires `block_id` (422
with a sentence without one — it rewrites what is *stored*), so the button
carries a `Select` of the record's saved blocks, labelled by kind and the
question or the first words of the answer; a row added this session has no
id and is not offered, and with nothing saved the button is disabled and
its title says why. The forms pass `blocks={record?.answer_blocks}` to
`AeoGeoPanel`, which filters to the ones with an id.

**The overview's site card draws three "biggest wins" strips**, the SEO
one it always had and one per readiness score, from `meta.site_score.aeo`
and `.geo`'s own `top_issues`. Each chip opens the records failing that one
check through `?aeo_check=` / `?geo_check=` — their own parameters rather
than `?check=`, because the three rubrics share `internal_links` as a key
and one parameter could not say whose failure is meant. The filtered list's
banner names the score ("… is the AEO problem").

**The header's search button is hidden below 360px (2026-09-21).** The
account row is the logo, the palette's trigger, the three-way scheme toggle
and Sign out: 332px in the 304px a 320px screen leaves, so every console
screen scrolled sideways by 8px — found by the phone audit on the ticket
screens, and on every other route once looked for. The palette is still
opened by Ctrl/⌘ K and the sidebar's own filter box is the way to find a
screen on a phone; from 360px the row fits with room.

## Table view: density, columns and the sticky header (0.119.0)

`web/src/app/admin/(app)/table-view.tsx`, `web/src/lib/table-view.ts`, two
blocks in `globals.css`. Measured by `scripts/probes/table-view.mjs`.

**One control, and no list screen knows it exists.** There are about seventy
hand-written `.admin-table`s. A chooser built into each would be seventy
edits, and the seventy-first screen would forget — which is this project's
most repeated bug in a new place. So the control lives in the console's
header and works on whatever table the page happens to hold.

**It reads the page and writes only CSS.** The headings come from the one
`main table.admin-table` on the screen, read through a `MutationObserver`
behind `useSyncExternalStore` — a DOM read is what that hook is for, and an
effect that set state from one is what `react-hooks/set-state-in-effect`
refuses. What goes back is a `<style>` of `nth-child` rules and nothing else.
No attribute is stamped on any table and no node is inserted beside one, so
there is nothing for React to disagree with when the list re-renders or
streams in: `reveal.tsx` and `FullRows` both paid for stamping markup they did
not own.

**Hidden columns are remembered by heading, not by position.** A column
inserted in a later release must not silently hide its neighbour. The stored
value is a list of heading texts under `tw_table_cols:<screen>`, resolved to
indexes against the live table on every render; a heading that is no longer
there matches nothing. The screen key folds ids (`/admin/forms/7/submissions`
→ `/admin/forms/:id/submissions`), because that is one table with different
rows. A sort arrow is stripped from the heading before it is compared, or
sorting a column would un-hide it.

**Three columns are never offered**: the first (the row's identity, and the
card's heading on a phone), one with no heading, and the actions column.
**A screen with two tables gets density only** — they would share one set of
`nth-child` rules and not one set of columns.

**All of it starts at `md`.** Below that a row is a card of labelled lines
with no header row, where a hidden column would be a detail missing with
nothing to show that anything is. The rule's media query and the button's
`hidden md:grid` say the same thing.

**Compact is on `<html>` before first paint.** The root layout's blocking
script already reads `localStorage` for the scheme; it sets
`data-console-density="compact"` for console paths in the same pass, so a
list never draws roomy and then tightens. The CSS is scoped to
`[data-console]`, stamped by the admin layout alone, because the portal draws
`.admin-table`s under a different header. It changes cell padding and half a
pixel of type: measured on the SEO overview, 95px rows became 84px, and a row
holding a 32px select is still as tall as its select.

**The sticky header is measured, and the first cut was a breakpoint.** A
sticky cell sticks to its nearest *scroll container*, and every list sits in
an `overflow-x-auto` wrapper — which makes the wrapper that container, so the
head scrolled away with the rows. `overflow-x: clip` clips without creating
one, and the head then sticks to the viewport, under the bar (`h-13` plus its
hairline). The price: a clipped wrapper cannot be scrolled sideways.

The first cut paid that price by starting at 90rem, on the reasoning that the
widest floor was 1040px and the content area at 1440 is 1142px. It was wrong:
the SEO overview's floor is 1240px, and 1380px or 1500px with Search Console
or Analytics connected. A sweep of all 95 sidebar screens at 1440 found that
one table 98px wider than its wrapper — its last column cut off with no
scrollbar to reach it, while `documentElement.scrollWidth` reported nothing,
because clipped is contained. The probe had been run on that very screen and
passed. So no breakpoint can make the promise. `TableView` already reads the
table; it now also compares each table's `offsetWidth` with its wrapper's
`clientWidth` (on mutations and on `resize`) and renders a hidden
`<span data-table-fits>` while every table fits. The CSS is
`[data-console]:has([data-table-fits])`, from `xl`. Without the marker —
no JavaScript, a table too wide, the moment before the first read — the
wrapper keeps its scrollbar and the head scrolls away as it always did.
Neither measured width changes when the rule switches, so it cannot flicker.
Measured after: SEO at 1280 and 1440 scrolls sideways, and is sticky at 1920
where it fits; the activity log is sticky at all three.

**Not built**: sorting on every list (each needs its own `ListSort`
allowlist in the API), and saved views shared between staff — these
preferences are one browser's.

## Customising the dashboard (0.120.0)

`web/src/lib/dashboard-view.ts`, `web/src/app/admin/(app)/dashboard-customise.tsx`,
`dashboard-actions.ts`, and `page.tsx` / `metrics.tsx` beside them. Measured
by `scripts/probes/dashboard-view.mjs`. No API change.

**One list of panels.** `WIDGETS` names the seven — At a glance, Ticket
figures, Ticket volume, When tickets arrive, Tickets by status, Sales
pipeline, High priority — and the order it is written in *is* the default.
The page builds a map of panels by key, the dialog draws its rows from the
same list, and the Server Action cleans what it is sent against it. The four
tile groups under At a glance can be hidden one at a time as
`glance.<group>`.

**The metrics section became three components.** `DashboardMetricsPanel` was
one `<section>` holding the four figures, the volume chart with its two bar
lists, and the heatmap, spaced by margins of its own. They are
`TicketFigures`, `TicketVolume` and `TicketArrivals` now, and none carries a
margin: the page spaces whatever order it draws.

**A cookie, where the table view uses `localStorage`.** The table view only
writes CSS over a table that is already on the page. The dashboard is
different in three ways that all point the same way: it is rendered on the
server from one API call, so a preference only the browser can read would
draw the default and then rearrange it; a hidden panel should not be in the
markup at all; and the order on screen has to be the order in the document,
which a CSS `order` does not give a keyboard or a screen reader. So the
arrangement is `tw_dashboard_<staff id>` — httpOnly, since only the server
reads it; scoped to `/admin`; keyed by account so two people sharing a
browser keep their own. It is a preference about one screen and never
reaches the API.

**The default is never stored.** Saving the default — or pressing Reset and
Save — deletes the cookie. A stored copy of today's default would pin the
order, and a panel added in a later release would land wherever an old cookie
happened to leave room. For the same reason `cleanView()` is an allowlist
both ways: an unknown key is dropped, and a panel the stored order does not
mention is appended in its default place among the rest.

**Only what this role can draw is offered.** The API sends `leads: null`,
`visits: null` and `meetings: null` to a role without them, so
`availableFor()` reads the dashboard's own answer and the dialog lists
exactly those panels: a support engineer is offered six, with no Sales
pipeline switch that could never show anything. A panel a role cannot see
keeps its place at the end of the stored order.

**The button needs the dashboard's answer, and the heading must not wait for
it.** `PageHeader` renders at once and the body streams under a skeleton, so
the button is its own `<Suspense>` in the header's row. Both ask
`loadDashboard()`, which is `cache()`d — one request per render — and the
fallback is a span of the button's height (32px, not the `sm` button's 44, so
the dashboard's first row does not move down to make room for a control).

**Spacing belongs to the pair of rows.** A panel that opens on a bare heading
("Last 30 days", "High priority") wants air above it, and so does whatever
follows the unboxed ticket list; two cards sit a card-gap apart. `gapAbove()`
decides from the row and the one before it, and in the default order it
yields 0, 32, 12, 12, 12, 36px — the dashboard's old margins exactly, which
the probe asserts. Tickets by status and Sales pipeline are `half` panels:
neighbours share a row from `lg`, and one alone keeps its half, because a
ring and its legend stretched across the whole screen is a wide empty card.

**The dialog closes with the page, not before it.** Save calls the Server
Action inside a transition; the first cut then called `setOpen(false)`
directly, which is an urgent update — the dialog closed at once and uncovered
the *old* dashboard for as long as the re-rendered one took to stream
(seconds on this machine), which reads as a Save that did nothing and failed
the probe exactly that way. `startTransition(() => setOpen(false))` after the
await commits the close together with the new page; the button reads
"Saving…" until then.

**Not built**: a per-account arrangement stored on the server (it would
follow somebody to another computer; it needs a column and an endpoint),
resizing a panel, and panels for the store or the newsletter, which have
dashboards of their own.

## Dashboard tiles are one height (0.121.0)

The client asked why the tiles were not the same size. Only "New leads"
carries a trend line, and `StatTile`'s compact layout drew it *under* the
label: that tile was 102px, the grid row stretched its three neighbours to
match, and every other group stayed at 66px. On a screen wide enough for two
groups to share a row, the shorter group's panel was stretched to the taller
one's height and left a blank strip under its tiles.

Two changes. The trend line rides on the figure's own line, between the
number and the glyph (`h-5 min-w-0 flex-1`), so it adds no height — every
tile is 66px at 1920, 1440, 1280 and 768, and 65–66px two abreast at 390. And
the tile list is `flex-1` inside a `flex-col` panel, so if a group ever is
taller than its neighbour the tiles fill the panel rather than leaving a
strip. The non-compact tile (the four ticket figures) keeps its line under
the note, where all four are one row of one height.

## Draft share links (0.138.0)

A client or a colleague without an account cannot read a draft, and reviewing a
page by screenshot loses everything that makes it a page. **Share preview**, on
the edit screen of twelve kinds of record (pages, blog posts, knowledge-base
articles, case studies, solutions, services, catalogue products, shop products,
events, vacancies, custom content entries and landing pages), makes a private
link that anyone holding it can open signed out, until it expires or is
revoked.

**The preview is the public detail read, not a second implementation of it.**
Each public controller's `show()` used to load its relations and build its
resource inline; the load-and-build half is now a public `present…()` method
(`ContentController::presentPage()`, `presentPost()` and the rest,
`CatalogueController::presentProduct()`, `StoreController::presentProduct()`,
`EventController::present()`, `CareersController::present()`,
`ContentTypeController::present()`, `LandingPageController::present()`), which
`show()` calls after its own published check and `PreviewController` calls
with none. A field added to a detail resource therefore reaches the preview
with nobody remembering to, and everything the public read withholds (an
event's `online_url`, a download's address) is withheld here for the same
reason. `PreviewLinkTest` compares the preview's keys with the published
record's for each of the twelve kinds, so a route that stopped using
`present…()` fails by name. `schema` and `faq_schema` are removed: a preview
emits no structured data. A knowledge-base preview is not a view (`show()`
increments before it calls `present…()`).

**`App\Support\PreviewLinks` is the one list**: alias → model → owning role,
and the `present()` switch. Keys are morph-map aliases (`preview_link` is in
the map, because the revoke route binds it), and the role is the one that owns
the record's own screen — `content_manager` for ten kinds, `store_manager` for
`store_product`, `seo_manager` for `landing_page`. The routes sit behind the
union of the three and `PreviewLinkController` narrows to the kind's owner, so
`role:` is not repeated per kind, and an administrator passes every one by the
same rule `EnsureUserHasRole` applies.

**One live link per record, replaced not added.** Making a link deletes the
old one in the same transaction, so there is never a moment with none and
never two. There is no unique index on the record: expiry, not absence, is what
makes a row dead, and an index would turn "replace" into a conflict to resolve.

**One 404 for every dead token.** Unknown, expired, revoked, replaced and a
record deleted since all answer the same, the token is held to 64 lower-case
hex characters by the route, and it is compared with `hash_equals`. The read is
throttled 30 a minute and answers `Cache-Control: no-store`. A view is counted
with a query-builder `increment`, so `updated_at` does not move.

**The website renders the real page.** `/preview/[token]` (`force-dynamic`, no
`generateStaticParams`) asks `publicApi.preview()`, files the record in the
request's preview store (`lib/preview-store.ts` — a React `cache()`, the
`forcePreviewTheme` pattern), and renders the detail route's own default
export with the params it would have had at its own address. The twelve
`publicApi` detail fetchers ask the store first and answer `{data: record}`
from it; with an empty store, which is every ordinary request, they are the
fetches they were. Landing pages are told apart by their stored path
(`/brands/…` or `/locations/…`), an entry carries its type's slug, and a
product skips the category lookup in `resolveProductSlug()`. No detail page
was copied, so a new theme or a new section is previewed for free. `JsonLd`
renders nothing while the store is filled, which also silences `Breadcrumbs`
and the careers page's own `JobPosting` — the sitewide Organization block in
the layout is not controlled by it, because a layout can render before the
page has filled the store.

**A page a secret addresses.** `/preview` is on every list that names
`/ticket-survey`: Analytics' `SECRET_PATHS`, the `no-referrer` headers in
`next.config.ts`, `robots.txt`, `PWA_NEVER_CACHE` in `lib/pwa.ts` **and**
`NEVER_CACHE` in `public/sw.js` (change both), and the coming-soon curtain's
`NEVER_CURTAINED` — a client reviewing a draft must reach it before launch.
The page's metadata is `noindex, nofollow`, and `preview` is a reserved slug.
`NotFoundHit` already skipped `/preview/`.

**The console.** `components/admin/preview-link-panel.tsx` is a server component
that reads the link (`getPreviewLink()`: a 403 or a 404 returns null and the
panel draws nothing, so a content manager looking at a shop product's screen is
not offered a button that would be refused) and hands it to
`preview-link-dialog.tsx`, a client island: a `Modal` with one `<Form>` and two
submit buttons, `intent=create` and `intent=revoke`. It sits in the
`PageHeader` row — never inside the record's `<Form>`, where a form in a form
is invalid markup, and never as a child of `<Tabs>`, which reads children by
position. Three decisions worth knowing: **refusals render inside the dialog**
(a toast raised behind a top-layer `<dialog>` is inert and unseen); **the
address is built from the browser's origin** with `useSyncExternalStore`
(server snapshot empty), because the API sends a path and `FRONTEND_URL` is
production on every machine; and **the action returns the link as it is now**
and calls no `revalidatePath`, because re-rendering the edit screen would throw
away a half-written form (the reason the SEO overview's Recheck gives).

**What the preview found.** `BlogPost::neighbours()` compared `published_at`
with null for a draft and threw an illegal-operator exception, so a draft post
had no page at all; it returns no neighbours when the post has no date. It was
invisible until something rendered a draft.

`scripts/probes/preview-link.mjs` makes a link for the first record of each of
the twelve lists, opens it signed out at 360 and 1280, and revokes it.

## Bulk actions (0.139.0)

Tick boxes on the console's content lists and a bar over the ticked rows: **Publish**,
**Move to draft**, **Archive**, **Delete**. Thirteen lists have all four (blog posts,
knowledge articles, case studies, solutions, services, pages, catalogue products, shop
products, events, vacancies, downloads, custom content entries, landing pages); five
have no `status` and are delete-only (industries, brands, product categories, shop
categories, service categories — a shop category has an on/off switch, not a status).

**One route per list, 200 always.** `POST /admin/{list}/bulk` with `{ids: [1..100], action}`,
declared above the list's `{id}` route in its role file and under the same role as its CRUD
(entries: `/admin/content-types/{type-slug}/entries/bulk`, scoped to the type). It answers
`{updated: [ids], refused: [{id, title, message}]}` whatever happened; an id that does not exist
is in neither list. The body is `BulkActionRequest`, or `BulkDeleteRequest` (publish/draft/archive
are a 422 on `action`) for a list without a status.

**Each record is handled alone, through the single-record path.** `HandlesBulk::runBulk()` loads
the ticked rows and takes them one at a time, each in its own transaction. A delete calls the
controller's private `remove()`, which `destroy()` calls too; a status change is the model's
ordinary `update()`. Never a mass `update()` or `delete()`: those skip model events, and the events
are the work — a product's slug released, a category's children promoted to its parent, a redirect
written, an IndexNow ping, a download's private file removed, `published_at` stamped. Asking for
the status a record already has changes nothing and is not judged again.

**A refusal is a sentence on that record, not a failed batch.** An `HttpException` or a
`ValidationException` becomes `refused[].message` (the first message) and the batch goes on. Where
a rule lived only in a FormRequest it was extracted so both paths read one definition:
the event join link in `App\Support\Events\PublishCheck`, the download "a file first" rule in
`DownloadFiles::publishRefusal()`, the landing page gate through `LandingPageQuality::candidate()`
and `publishReasons()` (the request builds its candidate through the same method), and "publishing
without a date means now" in `App\Support\PublishStamp` (`WritesCmsEntities` and the entries
controller delegate to it). The delete refusal is `destroy()`'s own: an event with registrations.

**The activity log.** A DELETE is recorded by rule; a POST named `bulk` is not, so `runBulk()`
sets the count it deleted on the application's request (a form request is a copy, its attributes go
nowhere) and `ActivityLogger` records action `destroy` with context `{action: delete, count}` —
no ids, no titles. A status change, and a delete in which everything was refused, write nothing.

**The console.** `components/admin/row-selection.tsx` is the one client module: a module-level
store read with `useSyncExternalStore` and **keyed by a `scope` string per list**, so ticks on the
blog never show on the tickets; `RowTick`, `TickAll` (indeterminate when part of a page is ticked)
and `BulkBar`. The ticket queue and the review queue used to carry a private copy each and now share
the store (their own bars keep their own controls). The bar is sticky, wraps, asks for confirmation
on Delete in a real `<dialog>` that says how many, shows a toast for the count, lists the refusals in
place (`title — message`) until dismissed, and clears the selection after any finished action and when
the page's rows change. Each list page has a first column with an **unheaded** `<th>` holding `TickAll`
and a `<td data-label="Select">` with the row's tick; `TableView` takes the first column **that has a
heading** as the row's identity, so the title stays un-hideable. Each list's Server Action is a few
lines over `runBulkAction()` (`lib/admin/bulk.ts`): `updateTag` for the tags that list's own saves
purge, and `revalidatePath` of the list, **only when `updated` is not empty**.

**Pre-existing, fixed on the way.** The delete actions for custom content entries, vacancies, shop
products and shop categories purged and reported "deleted" whatever the API answered; they now follow
the rule the twelve other lists do (refusal → `?done=not-deleted`, purge nothing).

`scripts/probes/bulk-actions.mjs` drives it on throwaway blog posts at 1280 and 360.

## Switches on record forms (0.152.0)

Every boolean on a record form is the small sliding switch the settings screens
got in 0.135.0. Before, a record form spent three styles on the same question: a
tick box (`is_active`, `show_in_menu`), a Yes/No `<Select>` (`is_featured`,
`comments_enabled`, `allow_oversell`, `feed_include`, `returnable`, `track_stock`,
`is_active` on staff, webhooks, redirects, coupons and shop categories) and the
block editors' `Toggle`.

`RecordSwitch` (`components/admin/record-switch.tsx`) is a labelled `Switch` with a
hint line, posting `1` or `0` under the field's own name. The checkbox is named,
uncontrolled and `value="1"`; a hidden `0` of the same name follows it. Because
`FormData.get()` returns the first entry, every Server Action keeps reading
`=== "1"` (or `!== "0"`), and "off" is a real answer instead of a missing key.
The checkbox being named is what makes it work inside the rest of the form
machinery with nothing special: `<Form>` puts it back after a refused save (it
snapshots a checkbox by name and value), `FormDraft` snapshots and restores it
the same way, and `buildFormTabs` charges a 422 on the field to the tab that
lists the name. The hidden `0` is skipped by `<Form>` (hidden inputs are set by
code) and by `FormDraft` (`data-switch-off`). A switch that drives something else
on the form (the shop product's Count stock, which hides Back-orders) is
controlled with `checked`/`onChange`; the block editors' `Toggle` draws a plain
`Switch` bound to its path in the content object.

Left as tick boxes: the bulk-select ticks in tables, grids of choices that are a
list rather than a yes/no (roles, groups, sections, qualifications), a repeater
row's compact tick (field `required`, a menu item's "new tab", a variation's
oversell), and one-press options on an action (`force`, `notify`,
`notify_registrants`).

**Fixed on the way.** The shop product form's Back-orders choice was never read
by its action, so it could not be saved from the console; the action now sends
`allow_oversell` whenever the control was drawn (a product counting stock with no
variations). A client's Featured box posted `on` and its action read `"on"`, and
a popup's "Open in a new tab" the same; both are `1` now, like the rest.

`scripts/probes/record-switch.mjs` opens a handful of the forms, checks each
boolean is a `role="switch"` with its hidden `0` and no Yes/No select remains,
and round-trips a throwaway redirect's Active on and off (including a refused
save keeping the typed state).
