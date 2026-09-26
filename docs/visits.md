# Engineer visits

A customer asks for an engineer to come to their site; the desk picks the
time. Built 2026-09-26 from `docs/visits-plan.md`. Each note is a rule and the
reason behind it; the one-line form of every rule is in `CLAUDE.md` under
"Modules". Add a new note here **and** its one-line rule there.

**It is a request, not a booking, and that is the client's decision.** Asked
for "engineer visit booking with time slots", the client chose "request a
time, staff confirm" over a live availability calendar. So there are two
answers on every row, from two people, and neither overwrites the other:
`preferred` is what the customer asked for — one to three `{date, window}`
pairs, best first — and `scheduled_start_at`/`scheduled_end_at` is what the
desk agreed. Nothing public can create an appointment; only
`POST /admin/visits/{reference}/confirm` sets a time. Free to request, no
payment, and it is intake, so it files a lead — recorded in `CLAUDE.md` as an
amendment to "Scope limits".

**`preferred` is a JSON list, never a map keyed by date.** MySQL reorders JSON
object keys (the `App\Casts\SpecSheet` trap); a list keeps the order the
customer ranked their choices in, and the ranking is content. The window is
stored as its **key** (`morning`), never its label, so renaming "Morning" to
"Before lunch" in the settings relabels every request already made rather
than orphaning them — `VisitText` reads the label as it is today, and a key
since removed reads as itself.

**`App\Support\Visits\VisitSettings` is the only reader of the `visits`
group.** The form, the validation and `GET /visits/options` ask the same
questions — which days, which parts of the day, how much notice, how far
ahead, which dates closed — and three parsers is three answers. Every reader
falls back per field: an unparseable window line is skipped, a nonsense notice
reads as the default, and an install that never ran the seeder gets what the
seeder would have written. The console refuses a value that would parse to
nothing (`VisitSettings::refusalFor`, called from `SettingController`) rather
than saving it and quietly reading the default.

**The four date rules are checked by the API against the settings at the
moment of the request, and each refusal names its row.** A date input's `min`
and `max` stop the obvious, but a Sunday, a holiday, or a window removed since
the form loaded get through any browser. `PreferredTimes::check()` refuses
`preferred.{i}.date` for short notice, the horizon, a day not offered and a
closed date, `preferred.{i}.window` for a window that is not offered, and the
same date and window chosen twice. The form names its inputs
`preferred.{i}.date`, so the refusal lands under the row it is about; the rows
are keyed by an id of their own, so removing the middle one re-numbers the
names while the values stay with their row.

**The group is private; six keys are published by name.**
`VisitSettings::PUBLIC_KEYS` — the switch, windows, days, notice, horizon and
holidays — reach the public `/settings` map the way `ChatSettings::PUBLIC_KEYS`
does. `visits_email` (the desk's address, else `sales_email`) and
`visit_default_minutes` stay private. The form itself reads
`GET /visits/options`, which is the same six plus the published services,
solutions and active locations, cacheable for five minutes.

**A guest's token is handed out once and never stays in a URL.** The request
answers `201` with the reference and a 64-hex `access_token` — the order's
rule, compared with `hash_equals`, absent from every resource and every
webhook, and a wrong token is the same 404 as a wrong reference. The email
link is `/visit/{reference}/open?token=…`, a frontend **route handler** that
puts the token in an httpOnly cookie scoped to `/visit/{reference}` and
answers 303 to the clean `/visit/{reference}` — so the secret is never in an
address bar, a history entry, a shared screenshot or an analytics hit. The
redirect is a relative `Location`, because behind Plesk `request.url` is
`127.0.0.1:3000`. The success panel sets the same cookie from the Server
Action, so "View or change your request" works without the email.

**A signed-in customer is stamped by naming the guard, and "View as" is not.**
`POST /visits` is public, so `$request->user()` is always null there
(CLAUDE.md, "reads as working"); the controller reads
`$request->user('sanctum')`, narrows it to `Customer`, and refuses an
impersonated token — a request filed under somebody's account should be one
they made, the rule the basket's claim follows. The Server Action forwards the
portal token for exactly this. `my/visits` is scoped by `customer_id` alone: a
guest request with the same address is not pulled in by email.

**Three doors, one set of moves: `App\Support\Visits\VisitActions`.** The
guest link, the portal and the console reach `cancelByCustomer`,
`rescheduleByCustomer`, `confirm` and `move`; the doors decide who is asking
and nothing else, so a cancellation emails the desk from every door or from
none. Every mail goes through `Notifier`, every channel message through
`Messenger`, every webhook through `Webhooks` — all guarded, so a saved visit
is never reported as failed.

**A reschedule is not a state.** The desk moving a confirmed visit leaves it
`confirmed`, writes a `rescheduled` event and sends `visit_rescheduled`; a
customer asking for other times sends it back to `requested`, clears the
agreed time (kept in the trail) and emails the desk `visit_request_changed`.
Confirming a visit that was ever confirmed before is a move — the "moved"
wording and a calendar file that updates the old one — whatever its status in
between.

**`Confirmed` is reached through the confirm endpoint only.** It is absent
from every `allowed_next`, and `PATCH` refuses it with a 422 saying to set a
time: a confirmed visit with no appointment is the one state the reminder and
the calendar file cannot read. `completed` and `no_show` correct to each
other; `cancelled` reopens to `requested`. `confirmed_at`, `completed_at` and
`cancelled_at` are stamped on arrival and never cleared.

**The `.ics` is twenty lines by hand, and each rule in it is load-bearing.**
`App\Support\Visits\Ics`: UTC times with a `Z` (a `TZID` needs a `VTIMEZONE`
block, and IST has no DST to describe); `UID` is the reference so a moved
visit updates the existing calendar event; an increasing `SEQUENCE`; CRLF and
lines folded at 75 octets (Outlook is strict); text escaped for backslash,
semicolon, comma and newline; `METHOD:PUBLISH`, not `REQUEST` — it is a note
of an appointment, not an invitation with RSVP buttons nobody reads. It is
attached to the built-in `MailMessage`, and `Templates::apply()` rewrites that
same object's subject and body, so an edited wording still carries the file.

**The reminder is owed per time, and the confirmation stands in for one inside
a day.** `technoware:remind-visits` every fifteen minutes takes confirmed
visits starting within 24 hours with `reminded_at` null, claims each with a
conditional UPDATE before sending (the `CartReminders` pattern) and sends
`visit_reminder` plus `MessageEvent::VisitReminder`. Transactional, so no
quiet-hours gate. `reminded_at` is the one stamp that is cleared — when the
time changes, because a visit moved to another day is owed a new reminder —
and a visit confirmed less than a day ahead is stamped at confirmation, so no
reminder arrives fifteen minutes after the booking.

**Seven emails for five classes.** `VisitRequestReceived` is two (a new
request, and the customer changing one — both to the desk), `VisitConfirmed`
is two (booked and moved), and `VisitRequested`, `VisitCancelled` and
`VisitReminder` one each; the catalogue is thirty-nine entries. The customer's
receipt repeats the dates and windows they chose — choices from lists the
site offered — and **never the notes they typed**, the `EnquiryAcknowledged`
rule: a message the server sends to any address typed into a public form.
The desk's copy carries the notes; it goes to the desk's own address.

**It files a lead, channel `visit`.** `LeadIntake::fromVisit()` beside
`fromBlock()`, before the announcement, and it never fails the request. The
visit links its `lead_id`; the lead's detail resource carries `visit`
(reference and console path) and the lead screen links back. `VisitRequest`
is in the morph map as `visit_request` — as a lead's source it must be, or
the intake would throw and be logged as "intake failed".

**The messaging opt-in is the checkout's.** One unticked box per phone
channel that is live (`messaging_*_live`), `Contacts::optIn(..., 'visit', ...)`
on submit, and `MessageEvent` gains `VisitRequested`, `VisitConfirmed` and
`VisitReminder` — all transactional — with `reference`, `service_name`,
`visit_date`, `visit_time` and `visit_url` (the portal for an account holder,
the token link for a guest).

**`role:sales_manager,support_engineer`.** A site survey starts a sale and
scopes an installation, and on this desk either may ring the customer back —
so the queue is one row carrying both roles, spelled the way the route's
middleware spells it, in `routes/api/admin-visits.php` and `nav-items.tsx`
(`AdminNavRolesTest` compares the two). Settings are `role:admin` with every
other group, at `/admin/visits/settings`. The dashboard's `visits` block —
waiting for a time, and today's diary — is null for any other role.

**The desk's note never reaches the customer.** `staff_note` is on the admin
resource only; the customer's `VisitRequestResource` has no key for it, no
engineer, no lead and no source — structurally, the `status_note` rule. The
cancel reason is sent to the customer and says so on the console's field.

**What is not built, deliberately.** No availability calendar or slot
capacity (the client's choice), no engineer calendar sync, no SMS (the
messaging channels cover WhatsApp and RCS), no `visit.*` webhook beyond
`visit.requested`, and no prune — a visit request is a service record, kept
like a ticket.
