# Events

Something with a date that people attend — a seminar, a webinar, a product
demonstration, a stand at a trade show — with a page at `/events/{slug}` and,
optionally, a free registration. Built for 0.118.0 against
`docs/events-contract.md`, which holds the wire shapes; this file is the
rules and the reasons. Each note is a rule and why it is one; the one-line
form of every rule belongs in `CLAUDE.md` under "Modules". Add a new note
here **and** its one-line rule there.

**An event is a page with a date, and nothing here takes a payment.** It is
content, so its CRUD is `role:content_manager` and sits with the pages; it
carries `HasSeo`, `Sluggable` (a slug change writes its 301) and FAQs like
every other CMS entity. Registration is free, intake rather than commerce,
and every registration files a lead — the amendment to "Scope limits" that
engineer visits and online meetings already made. There are **no recurring
events**: each date is its own row, and `POST /admin/events/{id}/duplicate`
is how a series is made — a draft copy under "(copy)" and a free slug, with
the FAQs and without the registrations or the SEO override (two pages with
one hand-written title is the duplicate the SEO overview exists to find).

**Status alone decides whether an event is public.** There is no
`published_at` — the case study's rule — because an event's date is
`starts_at`, and a second date meaning "when this page went up" is one nobody
would set. A draft or an archived event is a 404 on the page, the
availability read, the calendar file and the register endpoint alike; a
**past** event stays readable, because its page is a record of what was on
and a link to it must not rot the day after.

**An event is upcoming until it ends — or, with no end, until the end of the
day it starts on.** Somebody looking at "what's on" at two in the afternoon
wants the seminar that began at ten. `Event::scopeUpcoming()` and
`scopePast()` are the two halves of that one rule in SQL, `isPast()` the
same rule on a model, and `is_past` on every row is its answer.

**Every label on the wire is the API's.** `date_label`, `time_label`,
`format_label`, `status_label`, `closes_label` and the three parts of the
date tile (`day`, `month`, `year`) are written by `App\Support\Events\EventText`
in `APP_TIMEZONE`. A date formatted in a browser is in that browser's zone
and a date formatted by the Next server is in the server's; a seminar at
three in Mumbai is at three whoever is reading. Times cross the wire as
ISO 8601 **with the app zone's offset**; the console's form reads and writes
wall-clock `Y-m-d\TH:i` — what `<input type="datetime-local">` holds — with
`starts_at_iso` beside it for anything that needs the instant.

**`online_url` is on no public read, structurally.** The join link goes to
people who registered: in the confirmation email, the reminder, the "details
changed" message and the calendar file attached to them. `EventResource` and
`EventDetailResource` do not name the column — absent, not stripped, the
lesson the ticket module's internal notes taught — and neither does
`StructuredData::event()`, whose `VirtualLocation` carries the **page's**
URL: markup is read by everybody, and a crawler that indexed a Meet address
would have published the door to the room. The chatbot's retriever, the
`event.registered` webhook and the public `.ics` do not read it either.
`EventTest` asserts the key is missing *and* that the address appears nowhere
in the response body.

**The venue is null for an online event, whatever the row still holds.** A
form switched from "in person" to "online" keeps the hall it was drafted
with; a page saying "Online" beside a hall's name sends somebody to the
hall. The public resources null `venue_name`, `venue_city`, `venue_address`
and `map_url` when the format has no venue; the console still shows them.

## Registration

**Three modes, not a switch.** `none` is an announcement; `external` is a
button to somebody else's sign-up (`external_url`, required); `open`
registers here, with an optional `capacity`, a waiting list, a closing date
and `max_seats` per registration. Only `open` has a capacity that means
anything — the public `registration` block reports `has_capacity` and
`waitlist` as false for the other two.

**`App\Support\Events\Availability` is the one definition of open, full,
waiting list, closed and ended.** The availability endpoint, the register
endpoint and the console's counts must not give three answers, so all three
build one from the event and its `EventCounts`. The checks run in the order
of the reasons a person would be given: a mode that does not register here;
an event that has **started** (`ended` — once the doors are open there is
nobody to confirm in time); a closing date that has passed; then the room.
`waitlist` is "full, and the waiting list is on" **and also** "seats are
free but somebody is already waiting" — see the queue, below. `full` exists
only without a waiting list.

**No count is ever published.** The page is told a state and one bit,
`few_left`: a capacity is set and a fifth of it or less, but at least one
seat, remains (`left * 5 <= capacity`, so 8 of 40 and never 1 of 4). The
page itself is ISR-cached and carries only how the panel is *built*;
`GET /events/{slug}/availability` is asked after mount and sends
`Cache-Control: no-store`, because a seat count baked into a cached page
would be a figure from ten minutes ago.

**Capacity is counted in seats, never in registrations.** One registration
may be a party of four. `EventCounts` reads registrations and seats by
status in one grouped query — for a page of events as well as for one — and
`heldSeats` is what capacity is compared with: the confirmed seats plus the
seats of anybody since marked attended or no-show, who held one until the
day. Before an event starts the two are the same number.

**Seats are decided under a lock on the event row.** Every move that can
change how many seats are taken — register, cancel, promote, a status move,
a change of party size — opens its transaction with
`Event::…->lockForUpdate()`, counts again, and only then writes. Two people
taking the last seat at the same moment queue behind one another, and the
second counts after the first has written. The availability endpoint is a
courtesy to the page; this is the guarantee. `EventTest` reads the query log
to prove the order: lock, count, insert.

**One registration per address per event.** The unique index on
`(event_id, email)` is the rule (the address is lower-cased first).

**A typed address proves nothing, so the public door never changes and never
exposes a registration that already exists.** Anybody can type anybody's
address into a public form — the rule sign-in learnt (`docs/customers.md`:
"the code and the link prove the inbox, never who typed"). The first cut of
this module believed them: registering again replaced the stored name and
seats and answered with the registration's own manage link, which is a way
to shrink or cancel somebody else's place — and, on a full event, to free a
seat for oneself. `EventActions::register()` now holds to four rules, and
`EventTest` pins each:

- **The manage link is in the emails and in no response.** The register 201
  is `{message, data: {status, seats}}` and nothing else. The link goes to
  the mailbox, which is the only thing that proves whose it is.
- **A repeat from an address that holds a live registration writes
  nothing** — confirmed, waiting, attended or no-show alike. Not the name,
  not the seats, not the note; no lead, no webhook, no notice to the desk.
  The test compares the row's raw attributes before and after.
- **That registration's own message is sent again**, to the address on
  file: the confirmation, or the waiting-list message. It is how somebody
  who lost the email gets their link back, and how the owner of a mailbox
  learns somebody is using their address. **At most once every ten minutes
  per address per event** (`EventActions::RESEND_MINUTES`, claimed with an
  atomic `Cache::add` on `events:resend:{event}:{sha1(email)}`): the route's
  throttle bounds one caller, and this bounds what any number of callers can
  do to one inbox. Being a cache key, it is forgotten when the cache is
  cleared — the cost of which is one extra email. Attended and no-show are
  sent nothing; the event has happened.
- **The answer is exactly what a brand-new address sending the same body
  would get at that moment** — the same status from the same count, or the
  same 422 on `registration` or `seats`. `placement()` decides it from the
  locked event and a fresh count and is not passed the existing row, and the
  response is built from the request alone, so the two cannot differ: the
  test asserts the repeat's body equals a stranger's, byte for byte.

**That last rule costs something, and it is accepted.** Somebody who presses
Register twice on the last seat reads "This event is full." the second time
— while their confirmation is in their inbox both times. A response that
reassured them ("you are already registered") is a response that tells a
stranger who is coming, and one that kept their seats out of the count is
one that answers differently for a known address. The email is where the
reassurance goes.

**A cancelled registration is no registration.** The row is revived with
the details sent, placed by the room exactly like a newcomer, and its
**token is rotated** — a link emailed for the cancelled registration cannot
manage the revived one. That is no more than anybody can already do with an
address that has never registered. It is an arrival like any other, so the
lead, the desk's notice and the webhook follow.

**There is no update path through the public door, for anybody.** A
signed-in customer's bearer token stamps `customer_id` on a first
registration or a revival and grants nothing else. Changing a party's size
is: cancel from the manage link and register again, or ask the desk, which
edits the row. The desk's own "add" refuses an address that already holds a
live registration with a 422 on `email` naming its status, for the same
reason seen from the other side — that row is on the screen, and a second
form should not silently rewrite it.

**The waiting list is a queue.** `EventActions::promote()` walks it oldest
first (`waitlisted_at`, then id) and **stops at the first party that does
not fit** — a single at the back does not overtake three at the front. For
the same reason a newcomer joins the list, rather than taking a free seat,
while anybody is waiting. It runs whenever seats may have come free: a
cancellation from any door, a smaller party, a registration deleted, a
capacity raised or removed. `waitlisted_at` is the queue position rather
than `created_at`, because a registration cancelled and revived rejoins at
the back. A party the queue cannot seat is the desk's to resolve: confirm
it with `force`, or raise the capacity.

**The honeypot gets the ordinary answer.** `website` carries no validation
rule on purpose — a `prohibited` rule tells a bot which field gave it away.
A filled one is answered 201 in the success shape — `status: confirmed`
and the seats sent — and nothing is stored or sent.

**A signed-in customer is stamped by naming the guard.** The route is
public, so `$request->user()` is always null there; the controller reads
`$request->user('sanctum')`, narrows to a `Customer`, and refuses an
impersonated ("View as") token — a registration filed under somebody's
account should be one they made. The test sends a real `Authorization:
Bearer` header.

## The registrant's own link

**The token is in the registrant's emails, and nowhere else.** Not the
register response, not a resource, not the webhook. 64 hex characters,
`$hidden` on the model, compared with `hash_equals`, and rotated when a
cancelled registration is revived. The public routes hold it to
`[0-9a-f]{64}` in the route itself, so anything else under
`events/registrations/` never reaches a controller, and a well-formed token
that is nobody's is the same 404. Those routes are declared above
`events/{slug}`, and `registration` / `registrations` are refused as event
slugs (`Event::RESERVED_SLUGS`, with "Registration" as a title deriving
`registration-2`) because the site's manage page lives at
`/events/registration/{token}`.

**The manage page shows no contact details.** It is addressed by a link —
one that may be forwarded or left open on a shared screen — so it carries
the name, the seats, the status and the event, and no email, phone, note or
staff field. `can_cancel` says whether the button would be accepted.

**Cancelling is closed once the event has started**, and for anything
already marked attended or no-show; a second press on a cancelled
registration answers the same shape and sends nothing. The cancellation
email goes to the address that registered whoever cancelled — it is also how
the owner of a mailbox learns somebody cancelled in their name.

## The console

**Rules that span two fields are checked against what the event will be.**
`ends_at` after `starts_at`; `registration_closes_at` not after the start; a
venue unless the format is online; an `external_url` when the mode is
external; a join link before an online or hybrid event that registers here
can be **published**; a capacity not below the seats already held (the 422
names the figure). `StoreEventRequest` resolves each half from the request
when it is sent and from the stored event when it is not, so a `PATCH`
carrying only `status: published` is held to the stored format and link —
the location-level lesson: an invariant checked only when both halves arrive
together is not an invariant. `UpdateEventRequest` is the store request
through `SometimesRules`.

**Speakers, the agenda and FAQs are replaced wholesale; absent leaves them
alone.** `[]` clears. The two lists are JSON arrays of small objects rebuilt
from their declared keys, in the editor's order. Every text in them is plain
text; only `body` and FAQ answers are rich text, and both go through
`SanitisesRichText`. A cover and a speaker's photo must be library
**images** — `mime like image/%`, not in the bin.

**"Tell everyone registered" is a tick, never automatic.**
`notify_registrants` on a `PATCH` sends `event_changed` to each **confirmed**
registrant only when the save actually moved the time, the place, the format
or the join link. Fixing a typo in a venue's name is not news, and forty
people emailed about it is forty people who stop reading the next one. The
message states the event as it now stands and carries the calendar file
again. A new start resets `reminded_at` for the confirmed — the reminder
belongs to a time — unless they were just told and the event is already
inside the reminder's window.

**An event with registrations is archived, not deleted.** `DELETE` is a 422
on `event` while any registration exists, cancelled ones included: those
rows are who was told what, and the leads they filed point back at them.

**Registrations are `role:content_manager,sales_manager`.** Whoever runs the
event needs the list to run it; the sales desk needs it because every
registration is a lead it follows up. The event's own CRUD stays
`content_manager` — so a sales manager cannot list events, and reaches a
registrations screen from the desk's email, the lead, or a link; `meta.event`
on that screen carries the title, the date and the counts for exactly that
reason. `AdminNavRolesTest` reads the console's nav against these.

**The desk uses the same implementation as the public door.**
`App\Support\Events\EventActions` is the `VisitActions` mould: register,
cancel, promote, a status move, a change of party size, a delete, and the
announcement. `force` lets the desk go past the capacity, a closing date or
the start when adding somebody, confirming a waiting party or growing one —
the desk may overbook, but only by saying so — and nothing lets anybody
register for an event whose mode is not `open`. `attended` and `no_show` are
what happened on the day, so neither is accepted before the event starts;
they correct to each other and back to `confirmed`. A registration reached
through another event's id is a 404.

**A dropdown offers only what a `PATCH` accepts.** Every admin registration
carries `allowed_next` — itself first, then the moves
`EventRegistrationStatus::canTransitionTo()` allows, less `attended` and
`no_show` until the event has started — the leads' and visits' rule. What it
cannot promise is room: confirming a waiting party is still held to the
capacity, and that refusal names the seats. `meta.event` on the list and
beside every registration write carries `has_started` (the same clock),
`status`, `time_label`, `max_seats` and `waitlist_enabled` with the counts,
because a sales manager cannot read the event itself and that screen has
nowhere else to learn them.

**The join link and the venue follow the format, wherever they are sent.**
The console keeps what was typed when the format changes, so an in-person
event can still hold a join link and an online one a hall. Every place that
sends either asks the format first — `EventFormat::isOnline()` before the
link goes into a confirmation, a reminder, a "details changed" message or a
registrant's `.ics`; `hasVenue()` before a venue reaches a page, a graph, a
message or a calendar's LOCATION, which reads "Online" otherwise.
`EventAdminTest` renders all of them for both cases.

**The token is in no admin response**, and the export escapes every cell.
The CSV goes through `App\Support\Newsletter\Csv`, the one writer in the
application: a name beginning `=` is a formula to Excel, and a public form
is exactly where somebody types one.

## Mail, reminders and the calendar file

**Seven messages for six classes, all editable, all through `Notifier`.**
`EventRegistrationConfirmed` is two — the confirmation and
`event_waitlist_promoted`, the same facts with a different opening line.
Nothing here can fail the request: the mail, the `event.registered` webhook
and the lead are all sent after the transaction has committed, each through
its guard. The desk's notice goes to `events_email`, else `sales_email`.

**The waiting-list message carries no join link and no calendar file.**
Neither is theirs until a place opens, and a calendar entry for an event
somebody may not get into is one they turn up for.

**The reminder is sent once, by a conditional UPDATE.**
`technoware:remind-events` runs every fifteen minutes; `EventReminders::due()`
is a confirmed registration, not yet reminded, for a published event
starting within `event_reminder_hours`, and `send()` claims the row
(`reminded_at IS NULL`) through the query builder before anything goes, so
two overlapping runs cannot both win. **Zero hours sends no reminder** — an
answer, not a missing value. Somebody confirmed inside the window has
`reminded_at` stamped by the confirmation itself, which is what stops a
reminder landing a quarter of an hour after "you are registered".

**Two calendar files, one UID.** `EventIcs::forEvent()` is what anybody may
download (`GET /events/{slug}/calendar`): no join link, by construction.
`forRegistration()`, attached to the registrant's messages, adds the join
link and their manage link. Both carry `event-{id}` as the UID — the id, not
the slug, so renaming the event keeps the entry — and the event's
`updated_at` as the sequence, so a registrant who downloaded the public file
first has one calendar entry, updated, and a change announced later outranks
the file sent before it. An event with no end is drawn as an hour. The file
itself is `App\Support\Ics`: UTC with a `Z`, CRLF, folded at 75 octets.

## Where else an event appears

- **`SiteSection` `events`** (`/events`), dropped from a menu until an event
  is published — past or upcoming; a page of what has been on is still a
  page. **`MenuItemType::Event`** points at one event and resolves to null,
  so the item is dropped, the day it is unpublished.
- **`SeoController::ENTITIES`** (`event`, console route `events`), the FAQ
  owners, `SchemaTypes` (`Event`, refinable to `BusinessEvent` or
  `EducationEvent`), `IndexNow` through `HasSeo`.
- **Site search** gains an `event` group (published, what is coming ahead of
  what has been, the date as each result's `kicker`); the console's palette
  gains one for a content manager.
- **The chatbot's retriever** reads published events that have not finished,
  with the date and the place opening the excerpt.
- **The page builder's `cards`** gains the source `events`: upcoming,
  soonest first, `kicker` the date and `meta` the place or "Online".
- **`LeadIntake::fromEvent()`** — channel `event`, once per registration.
- **`events` is a reserved slug** (`ReservedSlugs`), which it was not: until
  0.118.0 it was the example a custom content type was given. An install
  that made a content type at `/events` has it shadowed by this module's
  static route, and must rename the type (which writes the redirects) —
  nothing does that automatically.
- **A CMS page cannot take one of the site's own routes either**, which the
  page forms had never checked: Next resolves a static segment before the
  page catch-all, so a page saved at `/events` — or `/blog` — is one nobody
  can open, with nothing saying so. `ReservedSlugs::pageSlugRule()` refuses
  a typed slug that is a frontend route, and `StorePageRequest` refuses a
  title whose derived slug would be one (most pages are made with the slug
  left blank). Only when the slug is changing, so a page already sitting on
  one can still be saved; and only the frontend's routes, not the API
  prefixes and server words a content type is also kept off.

## Settings

The private `events` group, read only by `App\Support\Events\EventSettings`:
`events_email`, `event_reminder_hours` (0–168, default 24) and
`event_max_seats` (1–20, default 5 — the default for a new event's
`max_seats`). The console refuses a value that would read as nonsense
(`EventSettings::refusalFor`, called from `SettingController`) rather than
saving it and quietly reading the default. Nothing in the group is public:
the page learns an event's own `max_seats` from the event.

## Placeholder content

`SampleEventSeeder` — called from `DemoSeeder` only, and only while the
table is empty — makes three published events dated from the day of
seeding, each wearing a **generated** cover (`PlaceholderImage`, its title
and kind on it, at `media/seed/events/{slug}.svg`, written only while that
event's cover is blank — never a picture borrowed from the library, which
dressed placeholder events in somebody's real artwork): a seminar with a capacity and a waiting list, a webinar whose join
link is an `example.com` address that opens nothing, and a trade show with
external registration. Every title says "Sample"; all three are on the
must-not-ship list. Nothing seeds an event on an ordinary install.
