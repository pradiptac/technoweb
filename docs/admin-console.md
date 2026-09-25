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
without a dot, no `.local`/`.internal`/`.lan`/`.home.arpa`. A public name
that *resolves* to a private address still passes — closing that means
resolving at send time and pinning the address, which is written down here
rather than half-done.

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
