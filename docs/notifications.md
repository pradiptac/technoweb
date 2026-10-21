# Notifications, mentions and edit awareness

Three things that let staff work on the same install without stepping on each
other (0.187.0):

- **The bell** — a per-person inbox in the console of mentions, assignments,
  finished long jobs and alerts.
- **Mentions** — `@Name` in a ticket's internal note, a lead note, an order note
  or a team note tells that colleague; **team notes** are a thread on every record
  page history knows.
- **Edit awareness** — who else has an edit screen open, and a save refused when
  somebody saved since it was opened.

The spec is `docs/superpowers/specs/2026-10-21-notifications-edit-awareness-design.md`;
the plan with its eight planning decisions is
`docs/superpowers/plans/2026-10-21-notifications-edit-awareness.md`.

---

## The bell's rows (`staff_notifications`)

One row per person per thing: `user_id`, `kind` (`StaffNotificationKind`),
`line` (≤ 240, the API's sentence), `path` (a console path, never a URL),
`subject_type`/`subject_id`, `actor_id`/`actor_name` (copied, not joined),
`read_at`, `created_at`. Pruned at 90 days (`technoware:prune-staff-notifications`,
03:35).

The eleven kinds and their groups are `StaffNotificationKind` — `mention_*`
(four, group `mention`), `ticket_assigned`, `lead_assigned`, `visit_assigned`,
`meeting_booked`, `ticket_customer_reply`, `job_finished` (group `assigned`) and
`alert` (group `alert`). `options()` is sent as `meta.kinds`; TypeScript lists
none.

### The one writer (`App\Support\Notifications\Notifications`)

`send($to, $kind, $line, $path, $subject, $actor, $deliver)` writes a row and
nothing else may. Five rules, in order:

1. **Never to the actor** — assigning a ticket to yourself tells nobody.
2. **Never to an inactive account.**
3. **Never without a path.**
4. **Never about a screen the person cannot open** — `ScreenAccess::can($user, $path)`.
5. **Never a failure for the caller** — a throw is logged at `warning` and
   swallowed, the `Notifier` rule. A line is cut to 237 characters.

`later()` is `send()` inside `DB::afterCommit`, so a rolled-back save tells
nobody.

**`ScreenAccess` is the sidebar, copied.** `ROWS` is every row of `NAV` in
`nav-items.tsx` (href, role, exact) and `GATES` its `SCREEN_GATES`; the longest
matching row decides, an exact row matches only itself, a path no row matches
is refused, an administrator passes. `AdminNavRolesTest::test_screen_access_mirrors_the_sidebar`
parses the NAV array (only — the account links and `PALETTE_SECTIONS` are not
screens) and fails on any drift.

### Delivery

A row is the bell. **Delivery** — the `StaffMentioned` / `StaffAssigned` email
(`staff_mentioned`, `staff_assigned` in the catalogue) and a browser push — is
extra, and goes only when:

- the kind delivers (`alert` and `job_finished` never do: the alert has its own
  email and push, and a finished import is not worth an email);
- the site switch `alerts_mentions_enabled` (alerts group, Settings →
  Notifications) is on;
- the person's `notify_mentions` (Your account → Notifications, "Mentions and
  assignments") is on;
- then their own `alert_email` and `alert_push` choices, push outside their
  quiet hours.

**Delivery runs after the response** in a web request (`app()->terminating`),
 because a push is an FCM call per device and a customer's portal reply must
 not wait on it; in a job or a command it runs at once. It is guarded on its own:
 a failure after the response is logged, never thrown.

### What writes a row

| Source | Kind | Line | Path |
|---|---|---|---|
| Admin `TicketController::apply()` — a new assignee | `ticket_assigned` | "{actor} assigned {reference} to you." | `/admin/tickets/{reference}` |
| `LeadController::update()` | `lead_assigned` | "{actor} assigned lead #{id} to you." | `/admin/leads/{id}` |
| `VisitController::update()`, `VisitActions::confirm()` | `visit_assigned` | "{actor} assigned visit {reference} to you." | `/admin/visits/{reference}` |
| `MeetingActions::book()` | `meeting_booked` | "Meeting {reference} was booked with you for {date} at {time}." | `/admin/my-meetings/{reference}` |
| Portal `storeMessage()`, `TicketPiper::reply()` | `ticket_customer_reply` | "The customer replied on {reference}." | `/admin/tickets/{reference}` |
| `JobFinished` | `job_finished` | "{label} has finished." / "failed." / "is ready to review." | the job's screen |
| `AlertCheck::run()` — each new fire | `alert` | the alert's own line | the alert's link |
| The three desk notes and team notes | `mention_*` | "{actor} mentioned you on …" | the record |

**A line never carries a subject, a body or contact details** — only a
reference, a number or a record's title.

`Notifications::assigned()` and `::customerReplied()` are the two helpers the
assignment and reply sources share.

**`JobFinished`** listens on five models' `updated` (one `watchAll()` in
`AppServiceProvider`): WordPress and site imports (`ready`, `completed`,
`failed`), newsletter imports that are scans (`ready`, `failed` — a CSV import
has no long wait), backups (`completed`, `completed_with_errors`, `failed`) and
restores. It tells `uploaded_by` / `created_by`. **A backup with a safety trigger
(`pre_restore`, `pre_update`) is not announced** — it is a step inside a restore
or an update that reports for itself. `expired` is never announced. Every status
write found goes through the model's `update()`, so there is no query-builder
write to patch; `tell($fresh)` exists for one if it is ever added.

### The API

`GET /admin/notifications?filter=unread|all` (30 a page, `meta.unread`,
`meta.kinds`), `POST /admin/notifications/{id}/read` (another person's row is a
404), `POST /admin/notifications/read-all`. `GET /admin/new-since` adds
`notifications_unread`, so the bell rides on the sidebar's minute poll and makes
no request of its own until it is opened.

### The console

`NotificationBell` (`components/admin/notification-bell.tsx`) sits in the top
bar between Help and Ask ALTIS, from `sm`; on a phone the account menu carries
"Notifications" (`tw:notifications`). **No number is drawn when the count could
not be read, and a failed load says so — it is never "Nothing unread".** Its
empty state is a paragraph, not `EmptyState`: that imports `IconTile`, and with
it the whole icon map, onto every console page.

---

## Mentions (`App\Support\Notifications\Mentions`)

**The server decides who is told.** `resolve($body, $ids, $path, $author)`:

- reads `mentions` **raw** — never validated, so a malformed value can never
  refuse a note; a non-list is no mentions, ids are positive integers, at most 50
  looked at;
- honours an id only while `@Their Name` is still in the saved text
  (case-insensitive), the person is active, can open `$path`, and is not the
  author;
- tells at most **ten** (`Mentions::MAX`).

A ticket's mentions are read **only for an internal note** — a public reply goes
to the customer, and the console's picker is off unless "Internal note" is ticked.

`GET /admin/mentionable?scope=&q=` (staff-wide, 60/min) is the picker's list:
`ticket`, `lead`, `order`, or a page-history kind (`NoteKinds::indexPath`); an
unknown scope is a 422. Prefix match on a name word or the email, eight at most,
only people who can open the screen.

**The console sends one hidden `mentions[]` input per person**, not one JSON
value: the ticket reply posts multipart when it carries a file, and the API must
still read a list. `mentionIdsFrom(formData.getAll("mentions[]"))` in
`lib/mentions.ts`; `scripts/mentions.check.mjs` pins the helpers.
`MentionField` sets the textarea through the prototype setter and an `input`
event, so `<Form>`, `FormDraft` and the leave guard see a choice as typing.
`@Name` is highlighted in team notes only (decision 5).

## Team notes (`record_notes`)

A thread per record of the kinds page history knows — `NoteKinds::aliases()` is
`Revisions::aliases()`, never a second list, and `NoteKinds::PATHS` holds their
console addresses (`MentionsTest` fails a kind added without one). Behind
`role:content_manager,store_manager,seo_manager`, narrowed per kind by
`Revisions::allows()`, the `/admin/revisions` rule.

- `GET /admin/record-notes?type=&id=`, `POST` (`{type, id, body ≤ 2000, mentions}`,
  20/min), `DELETE /admin/record-notes/{id}` — the author or an administrator.
- The body is plain text, stored as typed and drawn as React text.
- Notes (and presence rows) are deleted with their record, by one `deleted`
  listener per kind in `AppServiceProvider`.

The console's **Team notes** button sits beside History on all fourteen edit
screens (`RecordNotesPanel`), never inside the record's `<Form>` or `<Tabs>`;
it is not drawn for an account that cannot read the thread.

---

## Presence (`edit_presence`)

`POST /admin/presence {type, id, dirty}` (12/min) writes the caller's row and
answers `{others: [{name, dirty, since}], saved: {at, by}}` — others seen in the
last **60 seconds**, never the caller; `saved.by` is the newest page-history
version's author. `POST /admin/presence/leave` deletes the row. Rows unseen for
an hour are pruned hourly.

`EditPresence` beats every 20 seconds while the tab is visible, at once when it
comes back, and says goodbye with `sendBeacon` on `pagehide` and on unmount (a
client-side navigation fires no `pagehide`). **A failed beat keeps the last
answer**, so a dropped connection never claims the screen is yours alone.
`dirty` is `isAnyFormDirty()`. Mounted at the top of each form, beside
`FormDraft` (decision 4).

## The stale-save guard (`App\Support\Notifications\StaleGuard`)

`StaleGuard::check($request, $model)` is the **first line of the fourteen
update methods**. Only a request carrying `base_updated_at` is checked, so
scripts, imports, bulk actions and the AI drafts are untouched; an unreadable
value is not checked. When the stored `updated_at` is newer (to the second) the
save is refused:

```json
{ "message": "Ravi saved this at 14:32, after you opened it.",
  "errors": { "stale": ["…"] },
  "meta": { "stale": { "at": "…", "by": "Ravi" } } }
```

— "You saved this at … in another tab" when the newest version is the caller's
own (decision 6), and "Somebody" when the newest page-history version is older
than the record's `updated_at` (a save that changed only related rows records no
version, so its author is not known — never a wrong name).

**Every one of the fourteen update methods ends with `StaleGuard::touch()`**
(`touchQuietly`: no revision, no recheck, no webhook). A save that changed only
the SEO override, FAQs, answer blocks, custom fields or a relation list is not a
change of the record to Eloquent, and without the touch a colleague's save from
an older base would silently overwrite it. `overwrite: true` saves anyway and writes `overwrote` to the
activity log with `replaced_version_at`.

The console: every edit form posts a hidden `base_updated_at`; the update
actions forward `staleFields(formData)` and map the refusal with `staleState()`
(`lib/admin/stale.ts`), which `<Form>` treats as a refusal and so keeps the
typing. `StaleAlert` offers **Load the newer version** (writes the draft now via
`tw:draft-save-now`, then reloads — the draft banner offers Restore) and **Save
mine anyway** (resubmits with `overwrite=1`, and removes that input straight
after the submit has read it, or the next stale save would overwrite silently).
`FormDraft` never stores `base_updated_at` or `overwrite`, so a restored draft
carries the base the person has now loaded. The section library editor saves
through a function and does the same through `LibraryResult.stale` (decision 7).

**The known gap:** two saves inside one second are not told apart.

### Nothing but a person's save may move `updated_at`

The guard reads `updated_at`, so a system write that moved it would refuse a
save for nothing. Audited for 0.187.0:

- **moved off the timestamp** (base-query writes now): a knowledge article's
  helpful vote **and its view count** (every public view used to touch it), a
  shop sale's stock decrement on the product (`Settlement::takeStock`), a
  return's restock on the product (`ReturnActions`), and the investor alerts'
  claim and outcome writes on an entry (`InvestorAlerts`, `EntryController`).
- **already off it:** `ReviewSummary` (`toBase`), `Tags::stamp` (`DB::table`),
  site-health `Findings` and `LinkProber`, the search `Indexer` (their own
  tables), `Revisions` (`content_revisions`).
- **left:** a variation's stock — the product's `updated_at` is what the guard
  reads; and writes inside the person's own save (`tags_set_at`).

A new system writer to one of the fourteen kinds must use the base query.
`StaleSaveTest::test_system_writes_do_not_move_updated_at` pins the knowledge
base half.

---

## Planning decisions (the plan's header)

1. `ready` counts as finished for imports — that is when the starter must act.
2. The product CSV import sends no `job_finished`: it runs in the request.
3. Leaving a screen is `POST /admin/presence/leave` (a beacon cannot `DELETE`).
4. `<EditPresence>` sits at the top of each form and reads `isAnyFormDirty()`.
5. `@Name` is highlighted in team notes only, not the three desk threads.
6. A clash with the caller's own save reads "You saved this … in another tab".
7. The library editor has a function-based stale UI.
8. `AdminJobOpeningResource` gained `updated_at`.
