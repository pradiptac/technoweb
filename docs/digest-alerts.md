# Digest and alerts

Two ways the console tells a staff member what needs them, without their
having to open it (0.185.0):

- **The digest** is a summary of the copilot's figures for their roles, sent
  daily or weekly at the hour they choose, each figure set beside what the
  previous digest said.
- **An alert** arrives within five minutes of something going wrong. It comes
  by email and, when they want it, as a browser notification. It is sent once
  per thing.

Each person chooses their own on **Your account → Notifications**. An
administrator sets the site's defaults and thresholds on **Settings →
Notifications** (the `alerts` group), and can change anybody's choices from that
person's Staff screen.

---

## The digest (`App\Support\Digest`)

`DigestBuilder::build($user, $previous)` asks `Copilot\Questions::for($roles)`
and nothing else. Every figure, sentence and link is the copilot's, so the
digest and the drawer cannot disagree, and no model writes a word of it.

- **A figure of 0 or null** goes into the one "All clear: …" line, never a row
  of its own. A digest with every figure at zero has `allZero`.
- **A change** ("up 3", "down 1") is shown only when both this figure and the
  stored one are whole numbers and they differ. A money figure such as "₹2,45,000"
  gets no change line.
- **Zeros are stored too** (`Digest::$zeros`, `figures()`), so a count that goes
  from 0 to 3 reads "up 3" rather than nothing.
- **When:** `DigestBuilder::due()` checks the hour, in the site's timezone, and
  for a weekly digest the ISO weekday. `off` is never due.

`technoware:send-digests` runs **hourly at :05**:

- It considers active staff only.
- It skips anyone whose `last_digest_at` is already today, so two runs in an
  hour send one digest.
- It stamps `last_digest_at` even when it sends nothing. A person who asked to
  skip quiet days (`digest_skip_quiet`) and has all zeros is still marked done
  for the day.
- It stores the figures only when it sends, so the next change is against what
  the person last saw.
- Somebody who never saved gets the site default (`alerts_default_digest`,
  weekly) at 08:00 on Mondays. The first send writes their row.

"Send me today's digest" on the profile sends the same digest at once and
touches neither `last_digest_at` nor the stored figures.

## The alerts (`App\Support\Alerts`)

Eight fixed rules, in `Rules::all()`. Each reads the scope the screen it links
to uses, so the alert and the list agree.

| Rule | Who | Fires on | Threshold |
|---|---|---|---|
| `ticket_critical_unassigned` | support | an open, critical, unassigned ticket | `alert_ticket_critical_minutes`, 30 (5–1,440) |
| `ticket_overdue` | support | `Ticket::overdue()` | — |
| `lead_hot_untouched` | sales | a hot lead still New | `alert_lead_hot_hours`, 2 (1–168) |
| `order_not_dispatched` | store | a paid order that needs shipping and has not been dispatched | `alert_order_dispatch_days`, 2 (1–30) |
| `return_waiting` | store | `OrderReturn::waiting()` | `alert_return_days`, 2 (1–30) |
| `mail_stalled` | admin | the oldest queued email older than the threshold | `alert_mail_minutes`, 10 (5–1,440) |
| `backup_failed` | admin | the latest backup not completed, or none completed in 36 hours (only while backups are on) | — |
| `health_drop` | admin | today's health score below the best of the seven days before by at least the threshold | `alert_health_points`, 10 (1–100) |

A line names a record by its reference or id ("Hot lead #42 has had no reply for
3 hours"), **never** a customer's name, address, telephone or words. Each rule
returns at most 50 hits.

**Who holds a rule.** `Rules::holds()` checks `isAdmin()` first, because
`User::hasRole()` does not pass an administrator. An administrator holds all
eight.

**Once per thing.** `alert_fires` keeps one row per (rule, subject, person),
because MySQL has no partial unique index:

- A new hit writes the row with `updateOrCreate`, `fired_at` now and
  `cleared_at` null.
- A thing that stops matching gets `cleared_at`.
- If it matches again later, the same row is re-armed and it fires again.

**The check** (`technoware:check-alerts`, every five minutes,
`withoutOverlapping`) does these steps in order:

1. It clears every open fire of a rule switched off for the site.
2. It runs each rule inside its own try/catch, so a rule that throws skips only
   itself.
3. It clears fires whose subject is no longer hit.
4. For each active person, it collects the new hits of the rules they hold and
   want.
5. It writes the fires **before** sending, so a send that fails does not repeat
   on the next check.
6. It sends one email and one push for the whole batch.

The email is `StaffAlerts` (`staff_alerts` in the catalogue). The push title is
the line itself for one alert, or "N things need you" for several.

## Push for staff (`StaffPush`, `staff_push_subscriptions`)

Staff browsers have their own table, never `message_contacts`. That table is
customers' consent, with its own opt-in rules.

- **Sending:** `Fcm::pushTo()`, up to three lines.
- **A revoked token:** `UNREGISTERED` (`ProviderException::$revoke`) deletes the
  row.
- **Any other failure:** it stamps `failed_at`, which shows as "Not reachable".

**Remove never calls `unsubscribe()`.** A customer push subscription made in the
same browser shares the FCM token, and unsubscribing would end that too. Remove
deletes our row and nothing else.

**Quiet hours hold back push, never email.** `StaffPreference::quietAt()`
handles a window that crosses midnight; equal start and end mean never quiet.
"Send a test alert" ignores quiet hours.

## What leaves the server

- **Email:** through the site's own mail settings.
- **Push:** to Firebase Cloud Messaging, carrying the line and a console path.
- **Nothing else:** no model is called, and nothing is sent to a third party.

## Settings and endpoints

- **The `alerts` group** (private, `role:admin`): `alerts_default_digest`, one
  `alert_<rule>_enabled` switch per rule, and the six thresholds.
  `AlertSettings::refusalFor()` holds each threshold to its range.
- **The endpoints** are in API.md, "Admin — digest and alerts". `?user=` is an
  administrator's alone; an `alerts` key outside the person's rules is a 422;
  a browser not yours is a 404.

## Commands

| Command | When |
|---|---|
| `technoware:check-alerts` | every five minutes |
| `technoware:send-digests` | hourly at :05 |
| `technoware:prune-alert-fires` | 03:25 — deletes fires cleared more than 30 days ago |

## Known limits

- Email and browser push only: no Slack, WhatsApp or SMS.
- The eight rules are fixed. An editor cannot define an alert.
- An alert batch is capped at 50 lines per rule.
- Push has been tested against a faked FCM only, never a real Firebase account
  on this machine.
- The console panel's `<Form>` is keyed on the saved values. React resets a form
  after a successful action, and the hour select went back to its old default
  until it was keyed (found by `scripts/probes/notifications.mjs`).
