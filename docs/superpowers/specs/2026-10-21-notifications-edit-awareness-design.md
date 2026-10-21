# C2 — The notification bell, mentions, team notes and edit awareness (0.187.0)

**Status:** approved in conversation on 2026-10-21. This is the written spec for review.
**Track:** 2.0 roadmap, track C, release C2.
**Module note to write:** `docs/notifications.md`.

## What it is for

Staff work on the same records and the same desk without seeing each other.

- Nothing in the console says that something now needs *you*. The sidebar's "N new" counts are per queue, not per person, and B6's alerts go only by email and push.
- Nobody can ask a colleague about a record from inside it.
- Two people can open the same page, and the second save silently overwrites the first.

C2 adds four things:

1. **A bell** in the console's top bar, listing what is addressed to you.
2. **@mentions** in the threads staff already write in, and in a new team-notes thread on content records.
3. **Presence** — "Ravi is also editing this" on an edit screen.
4. **A stale-save guard** that refuses a save which would overwrite somebody's newer one, and says so.

## The client's decisions (2026-10-21)

| Question | Answer |
|---|---|
| What goes in the bell | **C**: B6's alerts, things addressed to you personally, and @mentions |
| Where a mention can be written | **B**: ticket internal notes, lead notes, order notes, and a new team-notes thread on the records that have page history |
| How far edit awareness goes | **B**: a guard on save, plus a live "is editing" / "saved a newer version" strip. No field-level merge |
| How a mention or assignment reaches someone | **C**: the bell, plus email and browser push, following each person's B6 preferences, with a new "Mentions and assignments" switch |
| Approach | **1**: one notifications table of our own, plus small tables for notes and presence |

## Assumptions

- The console only. The portal gets no bell and no mentions.
- No sockets. The bell's count rides on the existing once-a-minute poll; presence is a 20-second heartbeat.
- B6's alert email and push are unchanged. The bell adds a row for each alert fire and sends nothing twice.

## Part 1 — notifications

### The table: `staff_notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | |
| `user_id` | fk users, cascade | who it is for |
| `kind` | string(30) | `App\Enums\StaffNotificationKind` |
| `line` | string(240) | the sentence, written by the API |
| `path` | string(240), nullable | a **console path**, never a URL |
| `subject_type` | string(40), nullable | a morph alias |
| `subject_id` | bigint, nullable | |
| `actor_id` | fk users, nullOnDelete, nullable | who caused it |
| `actor_name` | string(120), nullable | copied, so the line survives the account (the activity-log rule) |
| `read_at` | timestamp, nullable | |
| `created_at` | timestamp | |

Indexes: `(user_id, read_at)`, `(user_id, created_at)`. No `updated_at`.

Rows are pruned by `technoware:prune-staff-notifications`, nightly, 90 days after `created_at`.

### The kinds (`StaffNotificationKind`)

Each kind has a label, a group and whether it may email and push.

**Group `mention`:**
- `mention_ticket` — in an internal note on a ticket
- `mention_lead` — in a lead note
- `mention_order` — in an order note
- `mention_note` — in a record's team note

**Group `assigned`:**
- `ticket_assigned` — a ticket assigned to you
- `lead_assigned` — a lead assigned to you
- `visit_assigned` — an engineer visit assigned to you
- `meeting_booked` — a meeting booked with you as host, by anyone but you
- `ticket_customer_reply` — the customer replied on a ticket assigned to you
- `job_finished` — a WordPress import, site import, subscriber scan or crawl, product import, backup or restore you started, now `completed` or `failed`

**Group `alert`:**
- `alert` — a B6 rule fired for you. The line is the one the alert email carries.

### The writer: `App\Support\Notifications\Notifications`

`Notifications::send(User $to, StaffNotificationKind $kind, string $line, ?string $path, ?Model $subject = null, ?User $actor = null, bool $deliver = true)`

**The rules, in order:**
1. **Never to the actor.** If `$to` is `$actor`, nothing is written.
2. **Only to an active account.**
3. **Only for someone who can open `$path`.**
   - The check is `ScreenAccess::can(User, path)`.
   - It mirrors the console's `screenRole()`: the role table of nav rows, longest prefix wins, and an administrator passes.
   - It lives in PHP as a list derived from `nav-items.tsx`. `AdminNavRolesTest` gains a case asserting the two agree.
   - A path that matches no row is refused.
4. **One row per (person, kind, subject, source)** within one call. For example, a note mentioning one person twice is still one row.
5. **The `Notifier` rule.** Any failure is logged at `warning`, and the caller's request still succeeds.

**Delivery.** When `$deliver` is true and the kind may deliver, the row is also sent by:
- **email**: a `StaffMentioned` / `StaffAssigned` mail, queued, through `Notifier`, editable in the template catalogue as `staff_mentioned` and `staff_assigned`;
- **browser push**, through B6's `StaffPush`.

Each channel follows that person's `staff_preferences`:
- `alert_email`, `alert_push`;
- a new **`notify_mentions`** boolean, default true, drawn as "Mentions and assignments" on Your account → Notifications;
- quiet hours, which hold back push and never email.

The site-wide switch **`alerts_mentions_enabled`** (in the private `alerts` group, on by default) turns delivery off for everybody. The bell still fills.

`alert` rows are written with `$deliver = false`, because B6 has already emailed and pushed them. `job_finished` delivers to the bell only, so a long import does not email its starter.

### Where each kind is sent from

All are called **after commit** (`DB::afterCommit` or the model's own after-commit hook):

| Kind | Where |
|---|---|
| `ticket_assigned` | the ticket's `assigned_to` changing to a person (`Ticket` updated hook, which already writes the event) |
| `ticket_customer_reply` | the portal and inbound-mail reply paths, to the ticket's assignee |
| `lead_assigned` | `Lead` `assigned_to` changing |
| `visit_assigned` | `VisitRequest` `assigned_to` changing |
| `meeting_booked` | `MeetingActions` after a booking, to the host |
| `job_finished` | each import's, and the backup's and restore's, transition to `completed` or `failed`, to its `uploaded_by` / `created_by` |
| `alert` | `AlertCheck`, beside each new fire it writes |
| mentions | Part 2 |

### API (staff-wide, not role-gated — each row is the caller's own)

- **`GET /admin/notifications?filter=unread|all&page=`** — the caller's rows, newest first, 30 a page.
  - Each row: `{id, kind, group, line, path, actor_name, read_at, created_at}`.
  - `meta.unread`, and `meta.kinds` (`[{value, label, group}]`).
- **`POST /admin/notifications/{id}/read`** — another person's row is a 404.
- **`POST /admin/notifications/read-all`** — returns `{updated}`.
- **`GET /admin/new-since`** gains `notifications_unread` (an integer). The bell's count rides on the sidebar's existing once-a-minute poll; no new request is made on every screen.

These are declared beside the existing `admin/notifications/preferences` routes and do not collide with them: `preferences` is a literal declared above `{id}`.

### In the console

- **The bell:**
  - in the top bar, beside the help "?", from `sm`;
  - below `sm` it is "Notifications" in the account menu;
  - a red count from the poll, capped at "9+", with the number in its `aria-label` ("Notifications, 4 unread").
- **The drawer** is `Modal size="side"`:
  - Unread / All tabs, the newest 30, and "Mark all read";
  - each row is the kind's glyph, the line, the time ago (`lib/dates.ts`) and an unread dot;
  - pressing a row marks it read and goes to its `path`;
  - an empty list is an `EmptyState`.
- **Every word is the API's.** The console has no list of kinds or sentences.
- **No animation** beyond `dialog-motion` and the existing badge pop.

## Part 2 — mentions and team notes

### Writing a mention

**The picker** (`components/admin/mention-field.tsx`) wraps a textarea:
- typing `@` followed by letters opens a listbox from `GET /admin/mentionable?scope=&q=` (up to 8);
- choosing an entry inserts `@Full Name ` and adds that person's id to a hidden `mentions` value;
- removing the text does not remove the id, because the server decides.

The note stays plain text. Every screen that shows notes today renders it unchanged, plus a highlight on `@Name` runs that match a mentioned person (`lib/mentions.ts`).

**`GET /admin/mentionable?scope=&q=`** (staff-wide, throttled 60/min):
- `scope` is `ticket`, `lead`, `order`, or a morph alias of a team-notes kind;
- it answers `[{id, name}]`: active staff whose role can open that scope's screen, plus administrators, matched on name or email prefix, at most 8;
- an unknown scope is a 422.

### Who is told: `App\Support\Notifications\Mentions::resolve($body, $ids, $scope, $author)`

A person is notified when **all** of these hold:
- their id was sent in `mentions[]`;
- the saved text still contains `@` followed by their exact name;
- they are active and can open the screen (rule 3 above);
- they are not the author.

At most 10 people per note. Extra ids beyond 10, ids that fail a test, and duplicate ids are dropped silently — never a 422, so a typo cannot refuse a note.

### The existing threads

| Endpoint | Change |
|---|---|
| `POST /admin/tickets/{ref}/reply` | takes `mentions[]`, **read only when `is_internal` is true**. A customer-visible reply never mentions anybody, whatever is sent |
| `POST /admin/leads/{id}/notes` | takes `mentions[]` |
| `POST /admin/store/orders/{n}/notes` | takes `mentions[]` |

The line reads "Asha mentioned you on ticket TW-2026-00041", with the path to that record's console screen. **It never carries the note's text**, so a customer's details do not spread into email.

### Team notes on records: `record_notes`

| Column | Type |
|---|---|
| `id` | bigint |
| `subject_type`, `subject_id` | morph alias + id, indexed together |
| `user_id` | fk users, nullOnDelete |
| `author_name` | string(120), copied |
| `body` | text, plain, at most 2,000 characters |
| `mentions` | json list of notified ids |
| `created_at` | timestamp |

**Kinds.** Every kind in `App\Support\Revisions` (14):
- `page`, `saved_section`, `blog_post`, `knowledge_article`, `case_study`, `solution`, `service`, `product`, `store_product`, `event`, `tender`, `job_opening`, `entry`, `landing_page`.

`App\Support\Notifications\NoteKinds` reads that list; it is not a second copy.

**Who.** The owning role from `Revisions::roleFor()`, or an administrator. Anybody else is a 403. A note on a record that has gone is a 404.

**API** (behind `role:content_manager,store_manager,seo_manager`, narrowed per kind, the `/admin/revisions` rule):
- **`GET /admin/record-notes?type=&id=`** — oldest first: `{id, author_name, body, mentioned: [{id, name}], created_at, can_delete}`.
- **`POST /admin/record-notes`** — `type`, `id`, `body` (required, ≤ 2,000), `mentions[]`. Answers **201** with the note. Throttled 20/min.
- **`DELETE /admin/record-notes/{id}`** — by the author or an administrator, else a 403. **204**.

Notes are never edited. Deleting a record deletes its notes: one deleted listener per kind, beside the health listeners in `AppServiceProvider`. `record_note` joins the morph map.

**On the edit screen:**
- a **"Team notes"** button with a count, in the `PageHeader` row beside Share preview and History;
- a server component; **never inside the record's `<Form>` or `<Tabs>`**;
- it opens a `Modal size="side"` with the thread and a `MentionField`;
- posting a note is a Server Action of its own, so it never submits the record and a refused save never loses a note;
- the 14 edit screens add the button. A screen with no record yet (the "new" screens) shows nothing.

## Part 3 — edit awareness

### Presence: `edit_presence`

| Column | Type |
|---|---|
| `id` | bigint |
| `user_id` | fk users, cascade |
| `subject_type`, `subject_id` | |
| `dirty` | boolean |
| `last_seen_at` | timestamp |

The table is unique on `(user_id, subject_type, subject_id)`. A row older than 60 seconds is ignored. `technoware:prune-edit-presence` (hourly) deletes rows older than an hour.

**`POST /admin/presence`** (staff-wide, narrowed to the kind's owning role like the notes; throttled 12/min per person, enough for two tabs at one beat each 20s):
- **Body:** `{type, id, dirty}`.
- **It upserts** the caller's row and answers `{others, saved}`:
  - `others: [{name, dirty, since}]` — everyone else seen in the last 60 seconds, never the caller;
  - `saved: {at, by}` — the record's `updated_at`, and the name on its newest page-history version.

**`DELETE /admin/presence`** with `{type, id}` removes the caller's row. It is sent with `navigator.sendBeacon` on leaving, best effort.

**The client** (`components/admin/edit-presence.tsx`):
- mounted by `FormActions` when the form is given `presence={{type, id}}`;
- beats every 20 seconds while the tab is visible, and once at once;
- `dirty` is the leave guard's own answer;
- a hidden tab stops beating.

**The strip** sits above the form, as an `info` `Alert` with `dismissible={false}`, in a `role="status"` region. It says one of:
- "Ravi is also editing this — unsaved changes." (several people: "Ravi and Asha are also editing this.")
- "Ravi has this open."
- "Ravi saved a newer version at 10:14. Reload to see it — your save will ask before overwriting." This shows when `saved.at` is later than the form's `base_updated_at`.
- Nothing when you are alone.

### The stale-save guard

**The form:**
- the 14 edit forms post a hidden `base_updated_at`, the record's `updated_at` as loaded (ISO 8601 with the offset);
- the Server Action forwards it, and `overwrite` when present.

**The API** (`App\Support\Notifications\StaleGuard::check($request, $model)`), called by the update action of each of the 14 kinds before anything is written:
- **No `base_updated_at`:** no check, so scripts, imports, bulk actions and the AI drafts are untouched.
- **`overwrite` is true:** saved, and an activity-log line `overwrote` is written with the record and the time of the version replaced.
- **Otherwise, the stored `updated_at` (to the second) is later than `base_updated_at`:** a **422 on `stale`**:
  - "Ravi saved this at 10:14, after you opened it." The name comes from the newest page-history version, else "Somebody".
  - `meta.stale: {at, by}` is sent beside the message.

**The screen** shows the refusal inline, above `FormActions`, as a non-dismissible `warn` `Alert`. `<Form>` already restores the typing. The alert holds two buttons:
- **"Load the newer version"** — first keeps the typing in the form's `FormDraft` (a draft is written now, not on its ten-second timer), then reloads. The draft banner then offers Restore.
- **"Save mine anyway"** — submits the same form again with `overwrite=1`.

### What must not move `updated_at`

The guard is only as true as the timestamp. The plan must find every write that moves a watched record's `updated_at` without a person saving the form, and move it off the timestamp.

- **Known:** `ContentController::helpful()` uses the model's `increment('helpful_count')`, which **touches `updated_at`**. It becomes a query-builder increment, the `DownloadFiles::count()` rule.
- **To check:** the health sweep, the search indexer, the review summary, `SpecIndex`, the stock ledger, tag stamping, IndexNow, and revision recording.

Two people saving within the same second is a known gap: the timestamp has no finer grain. It is accepted rather than fixed with a version column.

## Failure handling

- No notification, delivery, mention, presence beat or note can fail the save, reply, assignment or booking that caused it.
- If the bell's count can't be read, no number is shown.
- If the presence call fails, the last strip is kept; it never claims you are alone.
- All text is plain, stored as typed and rendered escaped. No sanitiser path, no HTML from anybody.
- A notification line never contains a note's body, a customer's contact details or a ticket's text — only who, what kind, and the record's name or reference.

## Testing

**`StaffNotificationsTest`:**
- one row per person per thing;
- none for the actor;
- none for an inactive account;
- none for somebody whose role cannot open the path;
- the B6 alert check writes a row and sends no second email;
- delivery follows `alert_email`, `alert_push`, `notify_mentions` and quiet hours, and the site switch;
- read, read-all, another person's row is a 404;
- prune at 90 days;
- `new-since` carries `notifications_unread`.

**`MentionsTest`:**
- the picker lists only staff who can open the scope;
- an id with its name deleted from the text is not notified, and neither is the author;
- at most 10;
- an id that fails a test is dropped, not refused;
- an internal ticket note notifies and a customer-visible reply never does, whatever is sent — through the **real endpoint** with a real Bearer header;
- lead and order notes;
- the line carries no note text.

**`RecordNotesTest`:**
- the owning role only, per kind (store manager on a shop product, SEO manager on a landing page, a 403 across);
- deleted by the author or an administrator only;
- deleted with the record.

**`EditPresenceTest`:**
- others listed, never yourself;
- a row older than 60 seconds is ignored;
- `saved` names the newest version's author;
- narrowed by role.

**`StaleSaveTest`:**
- for a page, a product and a shop product: refused when changed; allowed with `overwrite` and logged; unchecked without `base_updated_at`;
- a "helpful" vote does not move a knowledge article's `updated_at`.

**`AdminNavRolesTest`:** `ScreenAccess` agrees with `nav-items.tsx`.

**Probes:**
- `scripts/probes/edit-awareness.mjs` — two browser contexts, two throwaway staff on one page:
  - the strip appears in each;
  - a save from one makes the other's save refused;
  - Load the newer version keeps the typing as a draft;
  - Save mine anyway goes through.
- `scripts/probes/notifications.mjs` (extended) — a mention in a team note reaches the other person's bell; opening it marks it read.

**Audits:** `audit.mjs` and `mobile-audit.mjs` gain the bell drawer and the team-notes drawer at their screens.

## Release

0.187.0 ships:
- `docs/notifications.md` and a CLAUDE.md module block;
- an API.md section;
- the mock: the bell, notes, presence and `mentionable`;
- `manual/37-notifications.md` and its README row, with the help regenerated;
- the `help-routes` entry;
- the VERSION.md and `web/src/lib/version.ts` bump.

## Out of scope

- live sockets;
- editing a note;
- mentions in the portal or in customer-visible replies;
- field-level merging of two people's edits;
- notifications about records nobody was addressed about ("pages I once edited");
- a team-notes thread on the desk records (visits, returns, meetings, customers), which keep their staff-note fields;
- a version column for sub-second conflicts.
