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

**Below `lg` that sidebar is a horizontal strip, so adding a group is an
overflow risk and not a free change.** It has already been seventeen unlabelled
16px slivers once. `npm run audit:mobile` is what says whether a new section
fits; do not add one without running it.

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

**`SECTIONS` is the only list, and `ORDER` is derived from it**, because the
two going out of step is how this went wrong in the first place. Three groups —
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

**Client errors are grouped by fingerprint, and resolving one is a tick that
re-opens itself.** Both error boundaries used to `console.error` and nothing
else, which recorded a crash in a console nobody was watching on a device we do
not have — and the public site had no boundary at all, so a visitor got Next's
bare "Application error". Reports upsert on a unique fingerprint (area +
message + digest), because read-then-write races the moment two browsers hit one
bug together. Every report clears `resolved_at`, so a fix that did not hold says
so; only `technoware:prune-client-errors` removes rows, on `last_seen_at` —
a bug first seen a year ago and again this morning is current.
