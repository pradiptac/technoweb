# Digest and alerts — design (B6, 0.185.0)

Date: 2026-10-18. Roadmap item B6 of the 2.0 plan, the last of the smart track,
after 0.184.0 AI images.

## Intent

The console tells people what needs them without their having to look. Each
staff member gets a short **digest** of their own figures on a schedule they
choose, and **alerts** the moment something they own goes wrong — by email and,
if they want it, as a browser notification. Nothing is written by a model.

## The client's decisions

| Question | Answer |
|---|---|
| What | **C**: both a digest and alerts |
| Who decides | **C**: each staff member chooses on their profile; an administrator sets the defaults and can change anybody's |
| Delivery | **C**: email and browser push in the console |
| Which alerts | **B**: a fixed set of eight, each switched on or off, with an adjustable threshold |
| Noise | **A**: once per thing, re-armed only after it clears; one batch per check; push quiet hours per person (email still goes) |
| Digest content | **A**: the copilot's figures for the person's roles, with a change against their last digest; no AI |
| Architecture | **1**: digest from `Copilot\Questions::for()`, alerts as `AlertRule` classes, a fired-log table, mail queue plus FCM, scheduler-driven |

## What exists and is reused

- `App\Support\Copilot\Questions::for(array $roles): list<Question>` — every
  figure, sentence and console link the digest shows. `answer()` returns
  `['figure', 'sentence', 'href']`; `href` is null when the figure is 0.
- The scopes the screens already use: `Ticket::open()`, `Ticket::overdue()`,
  `Lead::open()`, `OrderReturn::waiting()`, `Order::paid()`,
  `QueueHealth::read()` (`stalled`), `Backup`, `HealthSnapshot`.
- `App\Support\Messaging\Providers\Fcm` and `GoogleServiceAccount` — push
  through the account the messaging module already configures; `push_live` is
  the switch the website already reads.
- `web/src/lib/push-client.ts` and `/sw.js` — one service worker at `/`; the
  console is the same origin.
- The email catalogue (`Templated`), `Notifier`, the queue drain, the
  scheduler.

## API

### Preferences — `staff_preferences`

One row per staff member, created on first read from the administrator's
defaults (never stored for somebody who has changed nothing until they save).

| Column | Values | Default |
|---|---|---|
| `user_id` | unique, cascade on delete | — |
| `digest` | `off`, `daily`, `weekly` | `alerts_default_digest` (`weekly`) |
| `digest_hour` | 0–23, `APP_TIMEZONE` | 8 |
| `digest_weekday` | 1–7 (ISO, Monday 1) | 1 |
| `digest_skip_quiet` | bool — send nothing on an all-zero day | false |
| `alerts` | JSON map rule key → bool; an absent key means on | `{}` |
| `alert_email` | bool | true |
| `alert_push` | bool | true |
| `quiet_start`, `quiet_end` | `HH:MM`; push only | `21:00`, `08:00` (a window may cross midnight) |
| `last_digest_at` | datetime | null |
| `last_digest_figures` | JSON map question key → int | null |

`App\Support\Alerts\StaffPreferences::for(User): StaffPreference` is the one
reader; it fills an unsaved row from the defaults.

### The digest — `App\Support\Digest\DigestBuilder`

`build(User $user): Digest` runs `Questions::for($user->roleSlugs())` and keeps
each answer. For each question whose figure is an `int` in both this answer and
`last_digest_figures`, it records the change; amounts and timings get none.
`Digest` holds `items` (non-zero figures, each `{label, figure, sentence, href,
change}`), `clear` (the labels of zero figures, joined into one "All clear: …"
line) and `allZero`.

- `technoware:send-digests`, **hourly**: for every **active** staff member whose
  `digest` is not `off`, whose `digest_hour` is the current hour (and, for
  `weekly`, whose `digest_weekday` is today), and whose `last_digest_at` is not
  today — build, and unless `allZero && digest_skip_quiet`, queue a `StaffDigest`
  mail. Then store `last_digest_at` and `last_digest_figures` (ints only). A
  skipped all-zero day stores the time and not the figures.
- `StaffDigest` is a catalogue email (`staff_digest`), editable and switchable
  like the rest. Links are absolute on `FRONTEND_URL` (they are clicked from an
  inbox). A change reads "up 3" / "down 2" / nothing when unchanged.
- "Send me today's digest" (`POST /admin/notifications/digest/send`) sends now
  and does **not** touch `last_digest_*`.

### Alerts — `App\Support\Alerts`

`interface AlertRule { key(): string; role(): Role; label(): string;
threshold(): ?Threshold; current(): Collection<AlertHit> }`. An `AlertHit` is
`{subject: string, line: string, href: string}` — `subject` is a stable key for
once-per-thing (`ticket:41`, `system`), `line` a short sentence naming the
record by its reference and **never** a customer's email, phone or message
text, `href` a console path.

`Rules::all()` is the one list:

| Key | Role | Hits | Threshold setting (default) |
|---|---|---|---|
| `ticket_critical_unassigned` | support_engineer | `Ticket::open()`, priority Critical, `assigned_to` null, created more than N minutes ago | `alert_ticket_critical_minutes` (30, 5–1440) |
| `ticket_overdue` | support_engineer | `Ticket::overdue()` | — |
| `lead_hot_untouched` | sales_manager | `score_band` hot, status `new`, created more than N hours ago | `alert_lead_hot_hours` (2, 1–168) |
| `order_not_dispatched` | store_manager | `Order::paid()`, not dispatched, not cancelled or refunded, with something to ship, paid more than N days ago | `alert_order_dispatch_days` (2, 1–30) |
| `return_waiting` | store_manager | `OrderReturn::waiting()`, requested more than N days ago | `alert_return_days` (2, 1–30) |
| `mail_stalled` | admin | `QueueHealth::read()` oldest job older than N minutes | `alert_mail_minutes` (10, 5–1440) |
| `backup_failed` | admin | the newest backup failed or completed with errors, or none completed in 36 hours while backups are on | — |
| `health_drop` | admin | today's health score is at least N below the best of the last seven days | `alert_health_points` (10, 1–100) |

Each rule also has `alert_<key>_enabled` (on). The settings are a private
`alerts` group (`role:admin`) beside `alerts_default_digest`; each threshold is
range-checked with a 422 on its row.

**Once per thing.** `alert_fires`: `rule`, `subject`, `user_id`, `fired_at`,
`cleared_at`, unique on (`rule`, `subject`, `user_id`) for open fires. A hit
fires for a person only when they have no open fire for it; when the subject
drops out of `current()`, every open fire for it is cleared, so it can fire
again later. Rows cleared more than 30 days ago are pruned
(`technoware:prune-alert-fires`, nightly).

**The check.** `technoware:check-alerts`, every **five minutes**:

1. Run each enabled rule's `current()` inside its own try/catch; a throw is
   logged at `warning` and that rule is skipped for this run (and nothing is
   cleared for it).
2. Clear the open fires whose subject is no longer a hit.
3. For each active staff member: the rules whose role they hold (an
   administrator holds all), that they have not switched off, minus the hits
   they already have open fires for. Write the fires **first**, then send — a
   failed send does not resend the batch next time.
4. One `StaffAlerts` email (catalogue key `staff_alerts`) when `alert_email`,
   and one push when `alert_push`, they have a browser, and it is not inside
   their quiet hours. Push skipped in quiet hours is not kept for later.

"Send a test alert" sends a fixed sample batch to the caller only, writing no
fire.

### Staff push — `staff_push_subscriptions`

`user_id`, `token` (unique), `label` (browser and OS from the user agent),
`last_seen_at`, `failed_at`. Separate from `message_contacts` on purpose: a
staff alert must never join a broadcast audience.

- `POST /admin/push/subscribe {token}` — upserts for the caller (a token moved
  to another account is re-assigned). 422 while `push_live` is off.
- `DELETE /admin/push/{id}` — the caller's own; another's is a 404.
- `StaffPush::send(User, title, lines[], href)` calls `Fcm` with title "N things
  need you" (or the one hit's line), up to three lines, and the console path
  (the hit's own, or `/admin` for several). `UNREGISTERED` deletes the row;
  another refusal stamps `failed_at`. It never throws.

### Endpoints

All staff-wide (`admin-auth.php`), narrowed by the controller.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/notifications/preferences` | `{data: prefs, meta: {rules: [{key, label, threshold_label, on}], push_live, browsers: [{id, label, last_seen_at}]}}` — rules are those the person's roles hold. `?user=<id>` for an administrator; anybody else is a 403 |
| `PATCH` | `/admin/notifications/preferences` | The columns above; `alerts` keys outside that person's rules are a 422. `?user=` as above |
| `POST` | `/admin/notifications/digest/send` | Throttled 6/min. 202 |
| `POST` | `/admin/notifications/alerts/test` | Throttled 6/min. 202 |
| `POST` | `/admin/push/subscribe` | Throttled 20/min |
| `DELETE` | `/admin/push/{id}` | 204 |

## Web

- `types/notifications.ts`; `lib/admin/notifications.ts` (server-only) and
  Server Actions.
- `components/admin/notifications-panel.tsx`: the digest choices, the alert
  switches with their threshold words, email/push switches, quiet hours, "Alerts
  in this browser" (imports `lib/push-client.ts` on press, drawn only while
  `push_live`), the browser list, the two send buttons. `RecordSwitch`/
  `SettingSwitch` for booleans, `<Form>`, `FormActions`.
- The profile screen gains a Notifications section; Staff → an account gains a
  Notifications tab rendering the same panel with `?user=`.
- Settings → Alerts: the `alerts` group drawn by `settings-copy.ts`.
- The service worker shows a staff push the way it shows a customer's; its
  click opens the console path.
- Glyphs from `icons-ui.tsx`; dates through `lib/dates.ts`; the mock answers
  the preferences with defaults and `push_live: false`.

## What leaves the server

By email: the digest's figures and sentences, and alert lines naming records by
reference. By push, to Google's FCM: a title, up to three alert lines and a
console path. No customer contact details, no message text, nothing to a model.

## Testing

- Each rule: a record just inside and just outside its threshold; the scope it
  reuses is the one the screen's filter uses.
- Once per thing: a hit fires once across two checks; clearing then returning
  fires again; two people each get their own fire.
- Batching: three hits make one email and one push.
- Quiet hours: inside the window email goes and push does not, including a
  window crossing midnight.
- A rule that throws spares the other seven and clears nothing for itself.
- Roles: a support engineer never gets a store rule; an administrator gets all;
  a switched-off rule and a switched-off person get nothing.
- Digest: due-hour and weekday selection, once a day, the change against the
  last digest, the all-zero line, skip-quiet, inactive staff skipped.
- Push: FCM faked under `Http::preventStrayRequests()`; `UNREGISTERED` deletes
  the row; a failing push still sends the email.
- Endpoints: `?user=` for an administrator only; an alert key outside the
  person's rules is a 422; another's browser is a 404.
- `scripts/probes/notifications.mjs`: the profile panel saves and reloads; the
  push control is absent while push is not live.
- Audits (light, dark, mobile) on the profile and a staff account, with a
  throwaway administrator.

## Not in this release

- Slack, WhatsApp or SMS delivery of alerts.
- Alerts an editor defines.
- An in-console notification bell (C2).
- Any AI.

## Release

0.185.0: `docs/digest-alerts.md`, a CLAUDE.md module block, an API.md section,
`manual/35-digest-and-alerts.md` with its README row and the help regeneration,
VERSION.md and `version.ts`, the full suite once.
