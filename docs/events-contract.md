# Events — the wire contract (0.118.0)

What the API sends and accepts for the events module, written before the
three halves (API, public site, console) were built so they could be built
at once. `docs/events.md` holds the rules and the reasons; this file is the
shapes. Kept with `web/src/types/events.ts` and `web/mock-api.mjs`.

An **event** is something with a date that people attend: a seminar, a
webinar, a product demonstration, a stand at a trade show. It has a page at
`/events/{slug}` and, optionally, **registration** — free, with an optional
capacity and waiting list. Nothing here takes a payment, and there are no
recurring events: each date is its own event (the console can duplicate one).
Every registration files a lead, channel `event`.

All times on the wire are ISO 8601 **with the offset** of `APP_TIMEZONE`.
Every label (`date_label`, `time_label`, `format_label`, `status_label`) is
the API's; the frontends never format an event's date themselves.

## Enums

| | values |
|---|---|
| `format` | `in_person`, `online`, `hybrid` |
| event `status` | `draft`, `published`, `archived` |
| `registration_mode` | `none` (no registration: an announcement), `open` (registers here), `external` (a link to somebody else's sign-up, `external_url`) |
| registration `status` | `confirmed`, `waitlisted`, `cancelled`, `attended`, `no_show` — labelled Confirmed, **On the waiting list**, Cancelled, Attended, No-show |
| availability `state` | `none`, `external`, `open`, `waitlist` (full, waiting list on), `full`, `closed` (past `registration_closes_at`), `ended` (the event has started) |

## Public

### `GET /events`

`?when=upcoming` (default; soonest first; an event counts as upcoming until it
**ends**, or until the end of its start day when it has no `ends_at`) or
`?when=past` (newest first). `?format=`, `?featured=1`, `?page=`, `?per_page=`
(max 50, default 12). Published only. Paginated (`data`, `meta`, `links`).

```json
{
  "id": 4, "title": "Wi-Fi 7 for the office: a working session", "slug": "wifi-7-working-session",
  "summary": "Ninety minutes on what Wi-Fi 7 changes for a 200-seat office.",
  "format": "hybrid", "format_label": "In person and online",
  "starts_at": "2026-11-12T15:00:00+05:30", "ends_at": "2026-11-12T16:30:00+05:30",
  "date_label": "Thursday 12 November 2026", "time_label": "3:00 pm – 4:30 pm IST",
  "day": "12", "month": "Nov", "year": "2026",
  "venue_name": "Technoware Experience Centre", "venue_city": "Mumbai",
  "cover_image": "http://…/storage/media/x.jpg", "cover_image_alt": "…", "cover_image_focus": null, "cover_image_blur": null,
  "is_featured": true, "is_past": false,
  "registration_mode": "open",
  "updated_at": "2026-10-06T18:00:00+05:30",
  "seo": { }
}
```

`venue_name`/`venue_city` are null for an `online` event. `seo` as on every
other index row (so the sitemap can honour `sitemap_include`).

### `GET /events/{slug}`

The row above plus:

```json
{
  "body": "<p>…</p>",
  "venue_address": "Unit 4, Lakeview Industrial Estate\nAndheri East, Mumbai 400093",
  "map_url": "https://maps.google.com/?q=…",
  "speakers": [ { "name": "Asha Rao", "role": "Principal network engineer", "photo": "http://…", "photo_alt": "…", "photo_focus": null, "photo_blur": null } ],
  "agenda": [ { "time": "3:00 pm", "title": "What changes in Wi-Fi 7", "note": "Channels, MLO and what a client needs." } ],
  "registration": {
    "mode": "open", "external_url": null,
    "closes_at": "2026-11-11T18:00:00+05:30", "closes_label": "Wednesday 11 November, 6:00 pm",
    "max_seats": 5, "has_capacity": true, "waitlist": true
  },
  "calendar_path": "/events/wifi-7-working-session/calendar",
  "faqs": [ { "id": 1, "question": "…", "answer": "<p>…</p>" } ],
  "faq_schema": { },
  "schema": { }
}
```

- **The join link and the venue follow the format, wherever they are sent.**
  The console keeps what was typed when the format changes, so an
  `in_person` event may still hold an `online_url` and an `online` one a
  hall: the first is never emailed or put in a registrant's `.ics`, and the
  second's venue fields are null on every public read and "Online" in every
  message.
- **`online_url` is never on a public read.** The join link goes only to
  people who registered, in the confirmation email and its `.ics`.
- `map_url` is null unless set; an http(s) URL.
- `speakers` and `agenda` are `[]` when empty, in the editor's order.
- `schema` is a schema.org `Event` (`eventAttendanceMode`, `eventStatus`,
  `location` as a `Place` and/or a `VirtualLocation` whose `url` is the
  **page**, never the join link; no `offers` — nothing is sold).
  `faq_schema` under the two-entry rule, like every other record.
- A draft or archived event is a 404. A past event stays readable.

### `GET /events/{slug}/availability`

Never cached (`Cache-Control: no-store`). What the registration panel asks
after mount, since the page itself is ISR-cached.

```json
{ "data": { "state": "open", "few_left": false, "message": null } }
```

`few_left` is true when a capacity is set and 20% or fewer seats (at least
one) remain. **No count is ever published.** `message` is a sentence for the
states that refuse (`full`, `closed`, `ended`), null otherwise.

### `GET /events/{slug}/calendar`

`text/calendar` — the event as a `.ics` (`Content-Disposition: attachment;
filename={slug}.ics`). No join link in it. 404 for an unpublished event.

### `POST /events/{slug}/register`

Throttled 10/min. Honeypot `website` (filled: the ordinary success answer —
the same shape, `status: confirmed` and the seats sent — nothing stored,
nothing emailed). The `_source_*` envelope as on every public form.

```json
{ "name": "Priya Das", "email": "priya@acme.co.in", "phone": "+91 98765 43210",
  "company": "Acme Foods", "seats": 2, "note": "One of us needs step-free access." }
```

`name` (required, 120), `email` (required, `email:rfc`), `phone` (optional,
30, loosely a phone number), `company` (optional, 160), `seats` (integer
1–`max_seats`, default 1), `note` (optional plain text, 1000).

**201**

```json
{ "message": "You are registered. We have emailed your confirmation to priya@acme.co.in.",
  "data": { "status": "confirmed", "seats": 2 } }
```

- `status` is `confirmed` or `waitlisted` (the message says which); `seats`
  is the number **asked for**.
- **There is no `manage_path`, and no token, in this response.** A typed
  address is not proof of whose it is, so the manage link exists only in the
  emails sent to that address. The page a registrant manages from is
  `/events/registration/{token}` on the site, reached from the email.
- **The same address registering again writes nothing.** When the address
  already holds a live registration (`confirmed`, `waitlisted`, `attended`,
  `no_show`) no column changes — not the name, the seats or the note — and no
  lead, webhook or desk notice follows. That registration's own confirmation
  (or waiting-list message) is sent again to the address on file, at most
  once every 10 minutes per address per event; `attended`/`no_show` are sent
  nothing.
- **The answer to a repeat is exactly what a brand-new address sending the
  same body would get at that moment** — the same 201 `status` and message
  from the current count, or the same 422 on `registration` or `seats` — so
  the response cannot be used to learn whether an address is registered. One
  consequence, accepted: pressing Register twice on the last seat reads
  "This event is full." the second time, while the confirmation is in the
  inbox both times.
- **A cancelled registration is no registration**: the row is revived with
  the details sent, subject to capacity exactly like a newcomer, and its
  token is rotated — a link emailed for the cancelled one stops working.
- There is no update path through this door, a signed-in customer included.
  Changing a party's size is: cancel from the manage link and register
  again, or ask the desk.
- **422 on `registration`** with one sentence when the event's mode is not
  `open`, registration has closed, the event has started, or it is full with
  no waiting list. **422 on `seats`** when more are asked for than are left
  and there is no waiting list ("Only 1 seat is left.").
- A portal `Authorization: Bearer` stamps `customer_id` on a first
  registration or a revival (read with the `sanctum` guard named, narrowed to
  a `Customer`, never an impersonated token). It grants nothing else.

### `GET /events/registrations/{token}`

Throttled 30/min. A token that is not 64 hex, or nobody's, is a 404.

```json
{ "data": {
  "status": "confirmed", "status_label": "Confirmed", "seats": 2, "name": "Priya Das",
  "can_cancel": true,
  "event": { "title": "…", "slug": "…", "date_label": "…", "time_label": "…", "format": "hybrid", "format_label": "…",
             "venue_name": "…", "venue_address": "…", "is_past": false, "calendar_path": "/events/…/calendar" }
} }
```

No email, phone, note or staff field: the page is addressed by a link.

### `POST /events/registrations/{token}/cancel`

Throttled 10/min. Answers the same shape with `status: cancelled`. 422 on
`registration` once the event has started or the registration is already
`attended`/`no_show`. Idempotent for an already-cancelled one. Cancelling a
confirmed registration promotes waiting registrations, oldest first, while
their seats fit.

## Emails (all editable in the catalogue, all through `Notifier`)

| key | to | when |
|---|---|---|
| `event_registration_confirmed` | the registrant | confirmed (with `.ics`; the join link when the event has one; the manage link — the **only** place the link appears). Sent again, throttled, when the address registers a second time |
| `event_registration_waitlisted` | the registrant | placed on the waiting list |
| `event_waitlist_promoted` | the registrant | a place opened (the confirmation's content) |
| `event_registration_cancelled` | the registrant | cancelled by either side |
| `event_registration_received` | `events_email`, else `sales_email` | every new registration |
| `event_reminder` | each confirmed registrant | once, `event_reminder_hours` before the start (`technoware:remind-events`, every 15 min) |
| `event_changed` | each confirmed registrant | the console saved a new time, place or join link **with "Tell everyone registered" ticked** |

Webhook event: `event.registered` (the admin registration resource, no token,
less `staff_note` and `allowed_next`, plus `event: {id, title, slug,
starts_at, ends_at, format, public_path}` — never the join link). Emitted
for a new registration only, not for a repeat from the same address.

## Admin — events (`role:content_manager`)

| | |
|---|---|
| `GET /admin/events` | `?status=`, `?when=upcoming\|past`, `?format=`, `?q=`, `?sort=starts\|title\|status` + `?dir=`, `?per_page=` (max 100, default 20). Default: upcoming soonest first, then past newest first |
| `POST /admin/events` | 201 |
| `GET /admin/events/{id}` | bound by **id** |
| `PATCH /admin/events/{id}` | + `notify_registrants: true` |
| `DELETE /admin/events/{id}` | 200 `{"message": "Event deleted."}`. 422 on `event` while it has registrations ("Archive it instead.") |
| `POST /admin/events/{id}/duplicate` | 201: a **draft** copy, "(copy)", a free slug, no registrations |

`meta` on the index, the read and both writes: `formats[{value,label}]`,
`statuses[{value,label}]`, `registration_modes[{value,label,blurb}]`,
`registration_statuses[{value,label}]`, `max_speakers` (12), `max_agenda` (30),
`timezone` (`"IST"`), `custom_field_groups` is **not** included (events take
no custom fields).

Admin resource — the public detail's fields with paths instead of URLs, plus:

```json
{
  "id": 4, "title": "…", "slug": "…", "summary": "…", "body": "<p>…</p>",
  "status": "published", "status_label": "Published", "is_featured": true,
  "format": "hybrid", "format_label": "…",
  "starts_at": "2026-11-12T15:00", "ends_at": "2026-11-12T16:30",
  "starts_at_iso": "2026-11-12T15:00:00+05:30", "date_label": "…", "time_label": "…", "is_past": false,
  "venue_name": "…", "venue_city": "…", "venue_address": "…", "map_url": null,
  "online_url": "https://meet.example/abc",
  "cover_image_path": "media/x.jpg", "cover_image": "http://…",
  "speakers": [ { "name": "…", "role": "…", "photo_path": "media/p.jpg", "photo": "http://…" } ],
  "agenda": [ { "time": "3:00 pm", "title": "…", "note": "…" } ],
  "registration_mode": "open", "external_url": null,
  "capacity": 40, "waitlist_enabled": true, "max_seats": 5,
  "registration_closes_at": "2026-11-11T18:00",
  "counts": { "confirmed": 12, "confirmed_seats": 21, "waitlisted": 0, "cancelled": 1, "attended": 0, "seats_left": 19 },
  "public_path": "/events/wifi-7-working-session", "admin_path": "/admin/events/4",
  "faqs": [ ], "seo": { }, "seo_defaults": { },
  "created_at": "…", "updated_at": "…"
}
```

- **Datetimes are written and read back as wall-clock `Y-m-d\TH:i`** in
  `APP_TIMEZONE` (what `<input type="datetime-local">` posts), the builder's
  countdown rule. `starts_at_iso` is the instant.
- `seats_left` is null when there is no capacity. `counts` is on index rows too.
- `body`, `faqs`, `seo`, `seo_defaults` on the detail read only (the read,
  both writes and the duplicate) — an index row carries none of the four.
- `meta` rides on the duplicate's 201 too.

Write rules: `title` (required, 160), `slug` (derived when blank, unique),
`summary` (300), `body` (rich text, sanitised), `status`, `is_featured`,
`format`, `starts_at` (required), `ends_at` (nullable, after `starts_at`),
`venue_name` (160) and `venue_city` (80) — `venue_name` required unless the
format is `online` — `venue_address` (500, plain), `map_url` (http(s)),
`online_url` (http(s); required to **publish** an `online` or `hybrid` event
whose `registration_mode` is `open`), `cover_image_path` (a library image),
`speakers[]` (≤ 12: `name` required 120, `role` 160, `photo_path` a library
image), `agenda[]` (≤ 30: `time` 40, `title` required 160, `note` 400, all
plain text), `registration_mode`, `external_url` (http(s), required when the
mode is `external`), `capacity` (nullable integer 1–100000; not below the
seats already confirmed — a 422 naming the figure), `waitlist_enabled`,
`max_seats` (1–20, default from the `event_max_seats` setting),
`registration_closes_at` (nullable, not after `starts_at`), `faqs[]`, `seo`.
Speakers, agenda and FAQs are replaced wholesale; absent leaves them alone.

## Admin — registrations (`role:content_manager,sales_manager`)

| | |
|---|---|
| `GET /admin/events/{id}/registrations` | `?status=`, `?q=` (name, email, company, phone), `?per_page=` (max 100, default 50). Confirmed first, then waiting (oldest first), then the rest newest first. `meta.event`, `meta.statuses` |
| `GET /admin/events/{id}/registrations/export` | CSV, declared above `{registration}`. Every cell escaped (`App\Support\Csv`) |
| `POST /admin/events/{id}/registrations` | Staff add one: the public fields + `force: true` to go past capacity or a closed date. `notify: false` skips the confirmation. 201, with `meta` beside `data`. **422 on `email`** when the address already holds a live registration, naming its status ("…(Confirmed). Edit that one instead.") — the desk edits that row; a cancelled one is revived, under a new token |
| `PATCH /admin/events/{id}/registrations/{registration}` | `status`, `seats`, `staff_note`, `force`. Answers `data` with `meta` beside it. Moving to `cancelled` emails the registrant and promotes the waiting list; `confirmed` from `waitlisted` emails `event_waitlist_promoted`; `attended`/`no_show` only once the event has started (422 otherwise). `confirmed` from `waitlisted`/`cancelled`, and `seats` growing, are held to the room (422 on `status` / `seats`) unless `force: true` |
| `DELETE /admin/events/{id}/registrations/{registration}` | For good. 204 |

A registration addressed through another event's id is a 404.

```json
{
  "id": 31, "event_id": 4, "name": "Priya Das", "email": "priya@acme.co.in", "phone": "+91 98765 43210",
  "company": "Acme Foods", "seats": 2, "note": "…", "staff_note": null,
  "status": "confirmed", "status_label": "Confirmed",
  "allowed_next": [ { "value": "confirmed", "label": "Confirmed" }, { "value": "cancelled", "label": "Cancelled" } ],
  "customer_id": null, "lead_id": 88, "lead_path": "/admin/leads/88",
  "source": "public", "reminded_at": null, "cancelled_at": null,
  "created_at": "2026-10-06T18:10:00+05:30"
}
```

`source` is `public` or `staff`. The token is in no admin response.

`allowed_next` is what the status select may offer **now**, itself first —
`EventRegistrationStatus::canTransitionTo()` plus the clock: `attended` and
`no_show` appear only once the event has started. A dropdown offers only
what a `PATCH` accepts (the leads' and visits' rule); what it cannot promise
is room. Not in the webhook payload.

`meta.event` — on the list and beside every registration write — is what the
screen knows about the event, since a sales manager cannot read
`/admin/events/{id}`:

```json
{ "id": 4, "title": "…", "status": "published",
  "date_label": "Thursday 12 November 2026", "time_label": "3:00 pm – 4:30 pm IST",
  "has_started": false,
  "counts": { "confirmed": 12, "confirmed_seats": 21, "waitlisted": 0, "cancelled": 1, "attended": 0, "seats_left": 19 },
  "capacity": 40, "max_seats": 5, "waitlist_enabled": true }
```

`has_started` is the same clock the status rule and `allowed_next` use.

## Settings — the private `events` group (`role:admin`, `/admin/events/settings`)

| key | |
|---|---|
| `events_email` | where `event_registration_received` goes; blank = `sales_email` |
| `event_reminder_hours` | 0–168, default 24; 0 sends no reminder |
| `event_max_seats` | 1–20, default 5; the default for a new event's `max_seats` |

Nothing in the group is public.

## Where else an event appears

- `SiteSection` key `events` (`/events`, label "Events"; `hasContent()` is a
  published event, past or upcoming) and `MenuItemType::Event` (`event`).
- `SeoController::ENTITIES` (`event`, console route `events`), the FAQ owners,
  site search (`GET /search` gains an events group — `type: "event"`, label
  "Events", each result `{title, excerpt, path, kicker}` with the date as
  `kicker`), the console search (a group of `type: "event"` for a content
  manager), the chatbot retriever, `IndexNow` through `HasSeo`.
- The page builder's `cards` section gains the source `events` (upcoming,
  soonest first; each item's `kicker` is its date, `meta` its place or
  "Online").
- `GET /admin/dashboard` is unchanged.
- **`events` is a reserved address.** A custom content type cannot take the
  slug (`ReservedSlugs`), and a CMS page cannot be created at — or moved to —
  any of the site's own top-level routes, `events` among them: a 422 on
  `slug`, or on `title` when the slug is left blank and would be derived as
  one. `registration` and `registrations` are refused as an *event's* slug.
