# Online meetings — the API contract

The shapes the four builders code against (2026-09-29). The TypeScript copy
is `web/src/types/meetings.ts`; the mock answers with it (`web/mock-api.mjs`).
Change all three together. The rules and the reasons behind them are
`docs/meetings.md`; the rules below are the ones a screen depends on.

**Times.** Every time on the wire is ISO 8601 with its offset
(`2026-10-06T15:30:00+05:30`). A POSTed `start` without an offset is a 422.
Every label — `date_label` ("Tue 6 Oct 2026"), `time_label` ("15:30 – 16:00",
or "15:30" on a slot), `timezone` ("IST") — is written by the API in
`APP_TIMEZONE`. Draw the labels; never format a time in the browser except to
add "(… your time)" when the visitor's zone differs.

**References.** `PREFIX-YYYY-NNNNN`, the prefix the `meeting_reference_prefix`
setting (default `MT`). Every `{reference}` / `{meeting}` route is held to
`[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}`, so `meetings/options`, `meetings/slots` and
`meetings/google` never bind as one.

**`type`** in every request is the meeting type's **slug**.

## Public — `routes/api/public.php`

| Method | Path | Name | Answer |
|---|---|---|---|
| GET | `/meetings/options` | `meetings.options` | `{data: MeetingOptions}` — cacheable (`revalidate: 300`, tag `meetings`) |
| GET | `/meetings/slots?type=&from=&to=` | `meetings.slots` | `{data: MeetingSlotRange}` — every date in the range, `count` 0 when closed or full. 60/min, `no-store` |
| GET | `/meetings/slots?type=&date=` | `meetings.slots` | `{data: MeetingSlotDate}` — `slots: [{start, end, time_label}]`, never which host |
| POST | `/meetings` | `meetings.store` | 201 `{message, data: MeetingBooking}`. 5/min |
| GET | `/meetings/{reference}?token=` | `meetings.show` | `{data: CustomerMeeting}`; a wrong token and a wrong reference are the same 404 |
| POST | `/meetings/{reference}/cancel` | `meetings.cancel` | body `{token}` → `{message, data: CustomerMeeting}`; 422 inside the cutoff |
| POST | `/meetings/{reference}/reschedule` | `meetings.reschedule` | body `{token, start}` → `{message, data: CustomerMeeting}`; 422 inside the cutoff, past the cap, or on a taken `start` |

`MeetingOptions`: `enabled`, `types[] {id, name, slug, description, minutes}`
(active and public, in order), `step` (15/30/60), `min_notice_hours`,
`max_days`, `min_date`, `max_date` (`Y-m-d`), `holidays[]`, `timezone`
(IANA), `timezone_label`, `agenda_max`.

`POST /meetings` body: `type`, `start` (a `start` from the date answer,
exactly), `name`, `email`, `phone` (an Indian mobile, the checkout's rule),
`company?`, `agenda?` (plain text, ≤ `agenda_max`), `message_opt_in[]?`
(`whatsapp`, `rcs`), honeypot `website`, the `_source_*` envelope. 403 with a
sentence while `meetings_enabled` is off. 422 on `start` — "That time was
just taken — choose another." — when no host is free any more; the page
clears the choice and refetches the times. 422 on `email` past
`meeting_max_open_per_contact`, and on `start` past the per-IP daily cap
(`meeting_daily_ip_cap`). A
portal token forwarded by the Server Action stamps the customer (never a
"View as" token).

`MeetingBooking`: `reference`, `access_token` (64 hex — here and nowhere
else), `starts_at`, `date_label`, `time_label`, `timezone`.

`CustomerMeeting`: `reference`, `status`, `status_label`, `meeting_type
{name, slug, minutes}`, `host_name`, `name`, `email`, `phone`, `company`,
`agenda`, `starts_at`, `ends_at`, `date_label`, `time_label`, `timezone`,
`meet_url` (null unless scheduled and made), `cancel_reason` (cancelled
only), `can_cancel`, `can_reschedule`, `reschedules_left`,
`change_cutoff_hours`, `created_at`. No token, no staff note, no Google
internals.

The guest page is `/meeting/{reference}`, reached through
`/meeting/{reference}/open?token=` (a route handler: token → httpOnly cookie
scoped to `/meeting/{reference}`, 303 to the clean page), the visits pattern.

## Portal — `routes/api/portal.php` (`customer`, `portal`)

| Method | Path | Name | Answer |
|---|---|---|---|
| GET | `/my/meetings` | `my.meetings.index` | paginated `CustomerMeeting[]`, newest first |
| GET | `/my/meetings/{reference}` | `my.meetings.show` | `{data: CustomerMeeting}`; another customer's is a 404 |
| POST | `/my/meetings/{reference}/cancel` | `my.meetings.cancel` | `{message, data}` |
| POST | `/my/meetings/{reference}/reschedule` | `my.meetings.reschedule` | body `{start}` → `{message, data}` |

A portal customer books through `POST /meetings` with the token forwarded.

## Console

Every route is under `/api/v1/admin`, named `api.v1.admin.*`. `{meeting}`
binds by reference.

### `admin-meetings.php` — `role:sales_manager,support_engineer`

| Method | Path | Name | Answer |
|---|---|---|---|
| GET | `/meetings` | `meetings.index` | `AdminMeetingIndex` |
| GET | `/meetings/slots?type=&date=&host=` (or `from=&to=`) | `meetings.slots` | `{data: AdminMeetingSlotDate}` (or the range) — each slot's free `hosts[]`; `outside_hours=1` and `google_busy=1` widen it for the confirm ticks |
| POST | `/meetings` | `meetings.store` | 201 `{data: AdminMeeting}` |
| GET | `/meetings/{meeting}` | `meetings.show` | `{data: AdminMeeting}` with `trail` |
| PATCH | `/meetings/{meeting}` | `meetings.update` | `staff_note`, `status` (`completed`/`no_show`, only after the start) → `{data}` |
| POST | `/meetings/{meeting}/move` | `meetings.move` | `{start, host_id?, outside_hours?, override_google_busy?}` → `{data}` |
| POST | `/meetings/{meeting}/cancel` | `meetings.cancel` | `{reason?}` → `{data}` |
| POST | `/meetings/{meeting}/resync` | `meetings.resync` | → `{data}` (Retry on a failed Google sync) |

Index filters: `status`, `host`, `type`, `mine=1`, `from`/`to` (`Y-m-d`, on
the start), `q`, `needs_outcome=1`, `google=failed`, `sort`/`dir` (`ListSort`),
`per_page` ≤ 100. `meta`: pagination, `statuses[] {value, label, open}`,
`types[] {id, name, slug, is_active}`, `hosts[] {id, name}`, `sources[]`,
`needs_outcome_count`, `today_count`, `google_failed_count`, `sorts[]`,
`timezone`, `timezone_label`.

Staff `POST /meetings` body: `type`, `start`, `host_id?` (else the
least-booked free host), `customer_id?`, `name`, `email`, `phone?`,
`company?`, `agenda?`, `outside_hours?` and `override_google_busy?` (the
confirm ticks). Skips min-notice and the window; can never overlap a booking
made here.

`AdminMeeting`: `id`, `reference`, `status`, `status_label`, `is_open`,
`needs_outcome`, `allowed_next[] {value, label}` (itself first),
`meeting_type {id, name, slug, minutes}`, `meeting_type_id`, `host_id`,
`host_name`, `host {id, name, email}`, `customer_id`, `name`, `email`,
`phone`, `company`, `agenda`, `starts_at`, `ends_at`, `date_label`,
`time_label`, `timezone`, `minutes`, `blocked_from`, `blocked_until`,
`source`, `source_label`, `created_by`, `reschedule_count`, `cancel_reason`,
`cancelled_at`, `completed_at`, `staff_note`, `lead_id`, `meet_url`,
`google {status, status_label, event_id, account, attempts, error}`, the
`source_*`/`utm_*` columns, `admin_path`, `trail[] {id, type, from, to, note,
actor_name, created_at}` (detail only), `created_at`, `updated_at`.
Built by `App\Http\Resources\Admin\MeetingResource`.

### `admin-meeting-setup.php` — `role:sales_manager`

| Method | Path | Name |
|---|---|---|
| GET/POST | `/meeting-types` | `meeting-types.index` / `.store` |
| GET/PATCH/DELETE | `/meeting-types/{meetingType}` | `meeting-types.show` / `.update` / `.destroy` |

`AdminMeetingType`: `id`, `name`, `slug`, `description`, `minutes` (15–240),
`buffer_before`/`buffer_after` (0–120), `is_public`, `is_active`,
`sort_order`, `host_ids[]` (empty = every eligible host), `hosts[] {id, name,
eligible}`, `meetings_count`, timestamps. Index `meta.eligible_hosts`.
DELETE is a 422 while the type has meetings.

### `admin-meeting-hosts.php` — `role:admin`

| Method | Path | Name |
|---|---|---|
| GET | `/meeting-hosts` | `meeting-hosts.index` |
| GET | `/meeting-hosts/{user}` | `meeting-hosts.show` |
| PUT | `/meeting-hosts/{user}/hours` | `meeting-hosts.hours` — `{hours: [{weekday, start, end}]}`, replaced; `[]` = the defaults |
| POST | `/meeting-hosts/{user}/time-off` | `meeting-hosts.time-off.store` — `{starts_at, ends_at, note?}` |
| DELETE | `/meeting-hosts/{user}/time-off/{timeOff}` | `meeting-hosts.time-off.destroy` |

`MeetingHost`: `id`, `name`, `email`, `is_active`, `uses_default_hours`,
`hours[] {weekday (ISO 1–7), start, end}`, `time_off[] {id, starts_at,
ends_at, note, label}`, `upcoming_count`, `free_busy` (`visible`, `unknown`,
`not_connected`). Index `meta`: `default_hours[]`, `timezone`,
`timezone_label`. A host is `is_active` and holds `meeting_host`
**explicitly** — the admin role's implicit pass does not count.

### `admin-meeting-google.php` — `role:admin`

| Method | Path | Name |
|---|---|---|
| GET | `/meetings/google` | `meetings.google.status` → `MeetingsGoogleStatus` |
| POST | `/meetings/google/authorize` | `meetings.google.authorize` — `{redirect_uri}` → `{data: {url}}` |
| POST | `/meetings/google/callback` | `meetings.google.callback` — `{code, state}` → `{data: {account}}` |
| POST | `/meetings/google/disconnect` | `meetings.google.disconnect` |
| POST | `/meetings/google/test` | `meetings.google.test` (6/min) |

`MeetingsGoogleStatus`: `is_connected`, `account`, `connected_at`,
`client_configured`, `calendar_id`, `error`, `callback_path`
(`/admin/meetings/google/callback`), `synced_future_count`.

### `admin-my-meetings.php` — `role:meeting_host`

| Method | Path | Name |
|---|---|---|
| GET | `/my-meetings` | `my-meetings.index` — `AdminMeetingIndex`, scoped to `host_id` |
| GET | `/my-meetings/{meeting}` | `my-meetings.show` — another host's is a 404 |
| PATCH | `/my-meetings/{meeting}` | `my-meetings.update` — `staff_note`, the outcome |

## Settings

Group `meetings` (private; `/admin/meetings/settings`, `role:admin`):
`meetings_enabled` (options), `meeting_default_hours` (`days|start|end` per
line, e.g. `mon-fri|10:00|18:00`), `meeting_slot_step` (options 15/30/60),
`meeting_min_notice_hours`, `meeting_max_days`, `meeting_holidays`,
`meeting_reminders` (`1440,60`), `meetings_email`,
`meeting_block_google_busy` (options), `meeting_change_cutoff_hours`,
`meeting_max_open_per_contact`, `meeting_max_reschedules`,
`meeting_daily_ip_cap`. Read only through `App\Support\Meetings\MeetingSettings`.
The public `/settings` map carries `meetings_enabled`, `meeting_slot_step`,
`meeting_min_notice_hours`, `meeting_max_days`.

Group `meetings_google` (private): `meetings_google_oauth_client_id`,
`_client_secret` (secret), `_refresh_token` (secret), `_account`,
`_connected_at`, `meetings_google_calendar_id` (blank = `primary`),
`meetings_google_error`. OAuth prefix `meetings_google_oauth_`.

## Shared server pieces (Step 0)

- `App\Support\Meetings\MeetingCalendar` (interface), bound to
  `NullMeetingCalendar` in `AppServiceProvider::register()`.
- `MeetingSettings`, `MeetingText` (labels), `Meeting::manageUrl()` /
  `publicUrl()` / `portalUrl()` / `adminPath()` / `record()` /
  `tokenMatches()`, scopes `scheduled`, `upcoming`, `needsOutcome`.
- `WebhookPayload::meeting()` — the admin resource less `staff_note` and
  `trail`.
- `MessageEvent::Meeting{Scheduled,Rescheduled,Cancelled,Reminder}`,
  `WebhookEvent::Meeting{Scheduled,Rescheduled,Cancelled}`
  (`meeting.scheduled` …).
- Emails `meeting_scheduled`, `meeting_booked_internal`,
  `meeting_rescheduled`, `meeting_cancelled`, `meeting_reminder`,
  `meeting_link_ready`, `meeting_sync_failed`, one notification class each.

## Changes after step 0 (agent A, the API core, 2026-09-29)

What the controllers actually answer, where it differs from or adds to the
above. The TypeScript types already match everything not listed here.

**Error keys.** A refusal about the meeting as a whole — not scheduled any
more, already started, inside the customer cutoff, past the reschedule cap —
is a 422 on **`meeting`** (e.g. `errors.meeting[0]`: "It is less than 12
hours to the meeting, so it can no longer be changed here…"). A time is
refused on `start` with one of two sentences: `"That time was just taken —
choose another."` (it was a slot and no host is free any more) or `"That is
not one of the times on offer — choose another."` (off the step, outside the
window, a closed day). A start without an offset is `start: "Choose a time
from the list."`. Staff naming a host who cannot take the type: `host_id`.
A console start in the past: `start: "That time has already passed."`.

**Public `/meetings/slots`** answers `Cache-Control: no-store, private`.
`from`/`to` are both required when `date` is absent (422 on `date`
otherwise), `to` ≥ `from`, at most **62 days** apart (422 on `to`). An
unknown, inactive or non-public type is a 422 on `type`. While
`meetings_enabled` is off the range answers every date with `count: 0` and
the date answer `slots: []` (the page says "get in touch"); `POST` answers
403.

**Caps.** `meeting_max_open_per_contact` counts future scheduled meetings
whose email **or** mobile matches (the mobile is stored in E.164,
`+919876543210`); refused on `email`. The per-IP cap counts meetings
created today (app clock) from the address; refused on `start`. **Neither
applies to a console booking.**

**`POST /meetings`** stamps `source: portal` when a portal customer is
signed in (never under "View as"), else `site`.

**Guest and portal cancel/reschedule** answer `{data: CustomerMeeting,
message}`. A customer's move keeps their host when that host is free at the
new time, else the least-booked free host takes it (the public slot list is
"any host free"). Each customer move adds one to `reschedule_count`; staff
moves do not.

**Admin `/meetings/slots`** also takes **`exclude=<reference>`**: that
meeting's own block is left out, so a move can overlap where it is now. Each
slot's `hosts[]` entries carry `{id, name, outside_hours, google_busy}` — the
per-host flags; the slot-level `outside_hours`/`google_busy` are true only
when **every** listed host needs that override (i.e. the tick is required
whoever is chosen). Without `outside_hours=1`/`google_busy=1` both are
always false. `type` may be the slug or the id, of any **active** type
(public or not). The range form (`from`, `to`) answers `days[]` like the
public one.

**Admin `POST /meetings`** answers **201 `{data: AdminMeeting}`** with the
trail. `phone` is optional and free-form here; `agenda` ≤ 5000. A booking
for an existing customer (`customer_id`) files **no lead**; a console
booking never records messaging opt-ins, the IP or page context.

**Admin `PATCH /meetings/{meeting}`** takes an optional **`note`** beside
`status` — written on the outcome's trail line. `status: cancelled` is a
422 ("Use Cancel…"); `scheduled` likewise. `completed_at` is stamped on the
first `completed` and never cleared.

**Admin `POST /meetings/{meeting}/resync`** is a 422 on **`google`** when
the calendar is not connected, or when the meeting has lived on the `.ics`
path from the start (`google.status: off` with no event id) — see "The
confirmation" below. Otherwise it resets the attempts, records
`google_retried`, and syncs.

**Admin index**: `sort` keys are `starts`, `created`, `name`, `host`,
`status` (`meta.sorts`); default order is scheduled first by start
ascending, then everything else by start descending. Also `source=` filters.
`type=` takes a slug or an id. `meta.hosts` is every eligible host (for
`/my-meetings`, just the caller). The counts in `meta` are over the whole
scope (for `/my-meetings`, that host's).

**Meeting types**: `POST` answers 201. `slug` is optional (derived from the
name, made unique); `host_ids` must all be active holders of `meeting_host`
(422 on `host_ids` otherwise). `DELETE` answers `{message}`; a type with
meetings is a 422 on **`type`**.

**Meeting hosts**: the index lists everyone holding `meeting_host`
explicitly, **active or not** (so `is_active` can be false), ordered by
name. `time_off[]` lists only stretches that have not ended. Hours `end` may
be `24:00`. `POST …/time-off` answers **201** with the host (`{data:
MeetingHost}`); `starts_at`/`ends_at` without an offset are read on the app
clock (a `datetime-local`). `DELETE …/time-off/{id}` answers the host; a
time-off row of another user is a 404. `free_busy` is decided by one
`calendar->busy()` call over the next day.

**Dashboard**: `GET /admin/dashboard` carries `meetings: {today,
needs_outcome}` for admin, sales and support, `null` otherwise. (The route
itself is `role:support_engineer`.)

**Leads**: every lead resource carries `meeting: {reference, admin_path} |
null` — filled on the detail read (where `source` is loaded).

**Staff guards**: `DELETE /admin/staff/{id}` is a 422 with `message` "This
person hosts N upcoming meetings — reassign them to another host first
(Meetings → move)."; `PATCH` answers the same sentence on `is_active`
(deactivating) or `roles` (dropping `meeting_host`). Changing a host's email
re-syncs their upcoming meetings.

**Trail event `type`s**: `booked` (to = the when-label, note = source and
host), `rescheduled` (from/to = when-labels; note names a host change and
"Moved by the customer."), `cancelled`, `completed`, `no_show`,
`confirmation_sent` (to = `link` or `ics`), `link_sent`, `reminded`,
`google_failed` (note = Google's words), `google_retried`.

**The confirmation** (`App\Support\Meetings\MeetingNotices`):
- not connected at booking → marked `off`, `meeting_scheduled` with our
  `.ics` at once. **A meeting booked while nothing was connected stays on
  the `.ics` path for life** — connecting later never invites its customer
  a second time;
- synced with a link → `meeting_scheduled` with the link, no `.ics`; synced
  without a link yet → nothing until the link arrives;
- failed with `google_attempts >= MeetingSync::MAX_ATTEMPTS` (5) → the desk
  gets `meeting_sync_failed` once per give-up, the customer the `.ics`
  confirmation if they had none; a later sync with a link →
  `meeting_link_ready`;
- a move or cancellation email carries our `.ics` (a cancellation's is
  `STATUS:CANCELLED`, higher SEQUENCE, same UID) exactly when the
  confirmation did; a move before any confirmation sends no "moved" email.
- The `meeting.rescheduled` webhook adds `previous` (the old when-label).

**Reminders**: `technoware:remind-meetings`, every five minutes. When a
missed run leaves two offsets due at once, both are claimed and one
reminder goes.
