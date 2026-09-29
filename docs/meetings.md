# Online meetings

A customer books a video call with somebody at the company, at a time that is
actually free, and gets a Google Meet link (2026-09-29). Each note is a rule
and the reason behind it; the one-line form of every rule is in `CLAUDE.md`
under "Modules". Add a new note here **and** its one-line rule there. The
wire shapes — every route, body and answer — are `docs/meetings-contract.md`,
kept beside `web/src/types/meetings.ts` and the mock.

**It is a booking, and engineer visits are still a request.** The two sit
side by side on purpose. A visit sends a person to a site, so the desk has to
decide a time; a call needs only two diaries, so the customer can pick a slot
the slot engine has already proved free. That is why this module has a live
availability calendar and calendar sync while `docs/visits.md` has none —
recorded in `CLAUDE.md` as an amendment to "Scope limits". Free to book, no
payment, and it is intake, so it files a lead (channel `meeting`), exactly as
a visit does.

**Off by default.** `meetings_enabled` ships `0`, nothing seeds a meeting
type and nobody holds `meeting_host`, so a new install offers no booking page
until somebody has decided who takes calls and when. `/book-a-meeting`
answers "get in touch" while it is off and `POST /meetings` is a 403.

## Hosts

**A host holds `meeting_host` explicitly, and the administrator's implicit
pass does not count.** `admin` passes every role check, which is right for
reaching a screen and wrong for being offered to customers: an install's
first administrator would otherwise be bookable by the public from the day
meetings were switched on. So the slot engine, the host list and the type
form all ask for the role on the account itself, and `is_active`.

**A host with no hours of their own works the defaults.** `meeting_default_hours`
is `days|start|end` per line (`mon-fri|10:00|18:00`); a host's own hours
replace it wholesale and `PUT …/hours` with `[]` goes back to it. `end` may be
`24:00`. Time off is a stretch with a start and an end, read on the app clock
when it arrives without an offset (a `datetime-local`).

**A host cannot be removed from under their meetings.** Deleting a staff
account, deactivating it or taking `meeting_host` away is a 422 naming how
many upcoming meetings they hold, with "reassign them … first (Meetings →
move)". Changing a host's email sends every future meeting back to Google
(`HostSync`), because the invitation is addressed to the account's email and
Google would otherwise go on inviting a mailbox that may no longer be theirs.
It is queued for the minute sweeper, never done inside the Save.

## The slot engine

`App\Support\Meetings\Availability`. **Everything is worked in `APP_TIMEZONE`
and compared as Unix timestamps**, never as a string with "IST" written into
it; every label on the wire (`date_label`, `time_label`, `timezone`) is
written by the API, and the browser draws them and only adds "(… your time)"
when the visitor's zone differs. A `start` posted without an offset is a 422.

A start `s` is a slot for a host when the host is a candidate for the type
(an empty allowed list means every eligible host; a list whose hosts have all
gone means nobody), `[s, s + minutes)` lies inside that day's working hours
and the day is not a holiday, the meeting **widened by the type's buffers**
overlaps none of the host's time off, their scheduled meetings' blocks, or —
when `meeting_block_google_busy` is on and the calendar is connected — their
Google busy times, and `s` sits on a step boundary aligned to the hour, inside
the notice and the window.

**Each meeting stores its own block**, `blocked_from`/`blocked_until`,
carrying *its* buffers. A type's buffers changing later cannot then reach back
and make yesterday's bookings overlap.

**A Google calendar the connected account cannot read is unknown, and
unknown never blocks.** Refusing every slot because one free/busy read failed
would take the booking page down with Google; offering a slot that turns out
busy costs one moved call. The free/busy read sits on the booking page's
request, so it is one call for every host, four seconds at most, believed for
five minutes.

**The public answer never says which host.** A slot is "somebody is free";
the host is chosen when the booking is written.

## Booking without overlap

`App\Support\Meetings\MeetingActions`. **A host can never be double-booked,
and the proof is the lock, not the slot list.** `book()` and `move()` run in
`DB::transaction(…, 3)` whose **first statement is the lock** — MySQL takes a
transaction's read snapshot at its first ordinary read, so anything read
before the lock could predate a competing booking's commit. A booking locks
every candidate host's `users` row in one query ordered by id, so two bookings
can never lock in opposite orders; a move locks the meeting and then the
hosts. Inside the lock the clash is re-read, the least-booked free host is
chosen (fewest meetings that week, lowest id on a tie), and the row and its
first trail line are written. Nothing else happens in the transaction: the
lead, the opt-ins, the notices, the webhook and the calendar sync follow the
commit.

**A time taken while the visitor was choosing is a 422 on `start` that says
so** — "That time was just taken — choose another." — and the page clears the
choice and refetches. A time that was never on offer (off the step, outside
the window, a closed day) gets a different sentence, because the fix is
different.

**The console can go outside working hours and over a Google busy time, and
never over a meeting booked here.** Two confirm ticks (`outside_hours`,
`override_google_busy`) widen those halves of the check for a staff booking
or move; nothing widens the clash check. A staff booking skips the notice and
the window but never the past, and without `host_id` goes to the least-booked
free host like a public one.

**Two caps bound the public door and neither applies to the console.**
`meeting_max_open_per_contact` counts future scheduled meetings whose email
**or** mobile matches (the mobile stored in E.164), refused on `email`;
`meeting_daily_ip_cap` counts today's bookings from the address, refused on
`start`. A person booking five calls is either a mistake or a script, and the
desk would otherwise find out by attending them.

## Actions

**Four doors, one class.** The public form, the guest link, the portal and the
console each check who is asking and call `MeetingActions`; what a cancel or a
move *means* is decided once.

**The guest's 64-hex token is answered once, on create**, compared with
`hash_equals`, and absent from every resource and webhook; a wrong token and a
wrong reference are the same 404. The email link is `/meeting/{reference}/open?token=`,
a route handler that moves the token into an httpOnly cookie scoped to
`/meeting/{reference}` and 303s to the clean page — the visits and order
pattern, so the token never sits in a rendered URL or an analytics hit.

**A customer can change a meeting up to `meeting_change_cutoff_hours` before
it, and move it `meeting_max_reschedules` times.** Past either, the refusal is
a 422 on **`meeting`** — a refusal about the meeting as a whole, not about a
field. A customer's move keeps their host when that host is free at the new
time, else the least-booked free host takes it, because the public slot list
is "any host free". Staff moves count against nothing.

**`completed` and `no_show` are outcomes, set only after the start**, and
`completed_at` is stamped on the first and never cleared. `cancelled` and
`scheduled` are refused on `PATCH`: cancelling sends mail and frees the slot,
so it is its own endpoint.

**A signed-in customer is stamped from `$request->user('sanctum')` narrowed
to `Customer`**, never an impersonated "View as" token, and the Server Action
forwards the portal token — the rule the chatbot and blog comments were
caught without. A console booking for an existing customer files no lead.

## Google Calendar

`App\Support\Meetings\GoogleCalendar`, on its own OAuth slot
(`meetings_google_oauth_*`, callback `/admin/meetings/google/callback`, the
`CallbackPath` rule). The consent asks for `calendar.events` and
`calendar.events.freebusy` plus `openid email`: the first to write events, the
second because reading *other people's* free/busy is what the slot engine
needs and `calendar.events` does not reach it.

**Every meeting is an event on the company's calendar, organised by the
connected account, with the host and the customer invited and a Meet link on
it.** Not the host's own calendar: one connection, not one per member of
staff, and a host leaving takes no events with them.

**We choose the event id** — sha1 of the app key, the reference and
`google_event_seq`, inside Google's base32hex alphabet — so an insert that
timed out and is retried answers 409 rather than making a second event, and
the 409 is read as success and followed by a GET.

**A move is a PATCH of the time and the whole attendee list, never the
conference**, so the Meet link stays the one the customer already has; it is
sent only when Google's copy differs, so a re-run never mails everybody an
"updated invitation" about nothing.

**Nothing the customer typed goes into the event but their name and
address.** Google mails the event, from the company's domain, to whatever was
typed into a public form; the agenda and the manage-token link stay in our
own email.

**An event made under another account or calendar is left alone** and the
meeting marked `off`: the connected account cannot change it, and a second
event would invite everybody twice.

**It never throws, and Google's own words go to `google_error`.** A 429, or a
403 whose reason is a rate or quota limit, backs every sync off for 30s, 2
minutes, then 10.

## Syncing

`App\Support\Meetings\MeetingSync`, called **after the commit**: a Google call
must not hold a host's row lock, and a Google failure never fails or undoes a
booking. With a worker draining the queue the job is dispatched; with none it
runs inline once and the sweeper does the rest.

**`technoware:sync-meetings` is the sweeper**, every minute, claiming each
meeting with a conditional UPDATE. `MeetingSync::MAX_ATTEMPTS` (5) is the cap
it and the confirmation listener share: a meeting `failed` with that many
attempts has failed for good, which is when the desk gets
`meeting_sync_failed` (once per give-up) and the customer the `.ics`
confirmation. The console's Retry resets the attempts and records
`google_retried`.

**A meeting booked while nothing was connected stays on the `.ics` path for
life.** Connecting an account later never invites its customer again: they
already hold our calendar file, and Google's invitation would put the call in
their calendar twice under two UIDs. Resync on such a meeting is a 422 on
`google`.

## The confirmation

`App\Support\Meetings\MeetingNotices` decides which email goes, from what the
sync did: not connected → `meeting_scheduled` with our `.ics` at once; synced
with a link → `meeting_scheduled` with the link and no `.ics`; synced with no
link yet → nothing until it arrives; given up → the `.ics`, and a later sync
that finds a link sends `meeting_link_ready`. A move or cancellation carries
our `.ics` exactly when the confirmation did — a cancellation's is
`STATUS:CANCELLED` with a higher `SEQUENCE` and the same UID — and a move
before any confirmation sends no "moved" email. The desk's copy is
`meeting_booked_internal` to `meetings_email`. The `.ics` is built by hand
(`MeetingIcs`), on the rules `docs/visits.md` records for `Visits\Ics`.

## Reminders

`App\Support\Meetings\MeetingReminders`, from `technoware:remind-meetings`
every five minutes, one per offset in `meeting_reminders` (`1440,60` — a day
and an hour). **Claimed by inserting `(meeting, offset, starts_at)`**, whose
unique key stops two runs sending one reminder and means a moved meeting owes
fresh rows without anything being deleted. An offset already past when the
meeting is booked or moved is written sent at once, so a call booked for this
afternoon is not sent "starts in 24 hours" a minute later; two offsets due at
once send one reminder, the nearer. Transactional, so no quiet hours.

## The console

`/admin/meetings` (`role:sales_manager,support_engineer`) is the diary: the
list, a slot picker for scheduling and moving, the two ticks, outcomes, the
trail and Retry. Types are `/admin/meetings/types` (`sales_manager`); hosts,
their hours and time off, Google and the settings are `role:admin`.
`/admin/my-meetings` is a host's own list (`role:meeting_host`), scoped to
`host_id` — another host's meeting is a 404. The dashboard carries
`meetings: {today, needs_outcome}` for the roles that can open the diary, and
a lead made by a meeting links back to it.

**References are `PREFIX-YYYY-NNNNN`, the prefix `meeting_reference_prefix`**
(`App\Support\References`, default `MT`), and every `{meeting}` route is held
to that shape so `meetings/options`, `meetings/slots` and `meetings/google`
never bind as one. The upgrade step `DeriveMeetingPrefix` gives an install
that already chose its ticket letters a matching meeting prefix, and leaves one
somebody chose alone.

## Verified

`MeetingTest`, `MeetingAvailabilityTest`, `MeetingGoogleTest` and
`UpgradeMeetingPrefixTest` — the slot engine's every rule, a taken
slot refused and passed to a second free host, the least-booked choice, the
caps, the cutoff and the reschedule cap on both
customer doors, the console ticks, outcomes, the trail, the Google event's
shape, the 409, the move PATCH, the rate-limit back-off, the sweeper's cap and
Retry, the `.ics` path for life, the reminders' claim, and the staff guards —
against a faked Google. **Not driven**: a real Google Workspace consent and a
real Meet link; the calendar is tested only against faked responses. Nor is
the lock exercised by two requests at the same instant: the tests book one
after another, and the lock's ordering is argued above rather than raced.
