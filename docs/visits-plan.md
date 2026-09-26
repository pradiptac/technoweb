# Engineer visit requests — plan (2026-09-26)

The client asked for "engineer visit booking (a site survey) with time slots"
and chose **"request a time, staff confirm"**: the customer offers preferred
dates and part-of-day windows, staff pick the actual appointment and confirm
it. There is no live availability calendar. Free to request, no payment.

**Scope amendment:** CLAUDE.md "Scope limits" says no CRM beyond the lead
pipeline; the client asked for this on 2026-09-26. Record it there as an
amendment (a visit request is intake, and it files a lead).

## Data

`visit_requests`:
- `reference` unique (`TV-YYYY-NNNNN`, the ticket reference shape).
- `customer_id` nullable (a portal Bearer stamps it — read with
  `$request->user('sanctum')` narrowed to `Customer`; never a "View as" token).
- Contact: `name`, `email`, `phone` (the checkout's `CheckoutRequest::MOBILE_PATTERN`), `company` nullable.
- `site_address` JSON via `App\Support\Address` (`rules('site_address')`, `normalise`).
- `service_id`, `solution_id`, `location_id` nullable (nullOnDelete).
- `notes` plain text ≤ 2000 (stored as typed, rendered escaped).
- `preferred` JSON **list** (never a map — the SpecSheet rule) of 1–3
  `{date: Y-m-d, window: morning|afternoon|evening}`.
- `status` — `App\Enums\VisitStatus`: `requested`, `confirmed`, `completed`,
  `cancelled`, `no_show`, with `canTransitionTo()` / `allowedNext()` /
  `options()` / `openStates()` in the `LeadStatus` shape. A reschedule is a
  confirmed visit getting a new time (stays `confirmed`, event logged), or a
  customer asking for new times (back to `requested`).
- `scheduled_start_at`, `scheduled_end_at` nullable; `assigned_to` nullable
  (users, nullOnDelete); `staff_note` (internal, never on a customer
  resource); `cancel_reason` nullable.
- Stamps set on arrival and never cleared: `confirmed_at`, `completed_at`,
  `cancelled_at`; `reminded_at` for the day-before reminder.
- `access_token` 64 hex (random_bytes) for the guest manage link — returned
  once on create, compared with `hash_equals`, 404 on a wrong token.
- `lead_id` nullable (the lead it filed), `source_url`/`source_path`/utm via
  `App\Support\Crm\PageContext`.
- `visit_events` (visit_request_id, user_id nullable, type, from/to, note,
  created_at) — the audit trail, the ticket events shape.

## Settings (`visits` group; the form needs a public subset)

`visits_enabled` (default on), `visit_windows` (lines `key|Label|09:00|12:00`,
defaults morning 09–12, afternoon 12–15, evening 15–18), `visit_days`
(weekdays offered, default Mon–Sat), `visit_min_notice_days` (1),
`visit_max_days` (30), `visit_holidays` (dates, one per line),
`visits_email` (desk address; falls back to `sales_email`),
`visit_default_minutes` (90). Public: enabled, windows (labels), days,
notice, max days, holidays. Screen: a Visits settings row in the new console
section, `SCREENS` in `settings-copy.ts`, `SettingsScreensTest`.

## API

Public (`routes/api/public.php`):
- `GET /visits/options` — services (published, with the locations they are
  offered in), active locations, windows, allowed days, min/max dates,
  holidays. Cacheable.
- `POST /visits` — throttle 5/min, honeypot `website`, the `_source_*`
  envelope; validates each preferred date against days/notice/max/holidays;
  creates the request and an event; `LeadIntake::fromVisit()` (new, beside
  `fromBlock`, channel `visit`, never fails the request); emails the desk and
  acknowledges the customer (no echo of the free text); messaging opt-in
  exactly like the checkout (`Contacts::optIn(..., 'visit', ...)` when a
  phone channel is live); `Messenger::notify` for the new events;
  `Webhooks::emit` `visit.requested`. Answers 201 with `reference` and the
  token **once**.
- Guest manage: `GET /visits/{reference}?token=`, `POST
  /visits/{reference}/cancel`, `POST /visits/{reference}/reschedule` (new
  preferred times → `requested`), token-scoped, 404 on mismatch.

Portal (`routes/api/portal.php`): `GET /my/visits`, `GET
/my/visits/{reference}`, cancel/reschedule for the caller's own.

Admin (`role:sales_manager,support_engineer`, a new
`routes/api/admin-visits.php` required from `routes/api.php` inside the
admin group, or the matching role files — whichever the router structure
supports; `AdminNavRolesTest` must stay green):
- `GET /admin/visits` — `?status=`, `?assigned_to=`, `?unassigned=1`,
  `?from=`/`?to=` (scheduled range), `?q=`, `?sort=`/`?dir=` (`ListSort`),
  `?per_page=` ≤ 100; `meta.statuses`, `meta.awaiting_count`, assignees.
- `GET /admin/visits/{reference}` with events and `allowed_next`.
- `POST /admin/visits/{reference}/confirm` — `start_at` (datetime, IST),
  `minutes`, `assigned_to` → `confirmed`, emails `visit_confirmed` with an
  **.ics calendar attachment** (a small builder, no library), Messenger.
  Confirming again = a reschedule (event + email `visit_rescheduled`).
- `PATCH /admin/visits/{reference}` — status (checked by
  `canTransitionTo`, 422 naming both states), `assigned_to`, `staff_note`,
  `cancel_reason`; cancelling emails `visit_cancelled`.
- Dashboard: `attention.visits_awaiting` / a tile linking to the queue.

Reminders: `technoware:remind-visits`, every 15 min, `withoutOverlapping`:
confirmed visits whose start is within the next 24h and `reminded_at` null →
`visit_reminder` email + `Messenger::notify(VisitReminder)`, claimed with a
conditional UPDATE before sending (the `CartReminders` pattern). Transactional,
not promotional.

`MessageEvent` gains `VisitConfirmed`, `VisitReminder` (and
`VisitRequested` if useful) with labels and placeholders
(`reference`, `visit_date`, `visit_time`, `visit_url`, `service_name`).
Email templates in `MessageCatalogueEntries` (a new `visits` group method
merged in `all()`): `visit_request_received` (desk), `visit_requested`
(customer), `visit_confirmed`, `visit_rescheduled`, `visit_cancelled`,
`visit_reminder`. **Update every hard-coded count** (docblock, `docs/mail.md`,
`CLAUDE.md`, `FEATURES.md`, `API.md`).

## Frontend

- Public page `/book-a-visit` (a `(marketing)` route, dynamic because it
  reads `?service=`/`?location=` to prefill): hero, a short "how it works"
  (request → we confirm by email/WhatsApp → engineer visits), the form: service
  select, location select (optional), `AddressFields` (PIN first) for the
  site, contact fields (prefilled for a signed-in customer through a client
  fetch, never a cookie read that would break caching elsewhere), up to three
  preferred date + window rows (date input with min/max, windows as a
  segmented radio), notes, WhatsApp opt-in when live, honeypot,
  `PageContextFields`; `<Form>` + Server Action; success panel with the
  reference and "we'll confirm by email".
- Guest manage: a route handler `/visit/{reference}/open?token=` that sets an
  httpOnly cookie scoped to `/visit/{reference}` and 303s to the clean
  `/visit/{reference}` (the token never stays in a rendered URL — analytics
  must never see it); the page shows status, the confirmed time or the
  requested windows, and Cancel / Ask for another time.
- Portal: "My visits" in `portal-links.tsx`, list + detail with the same
  actions.
- Console: a "Visits" sidebar group (queue + settings row), queue screen in
  the leads/tickets pattern (`PageHeader`, `FilterBar`, `SortTh`, status
  select from `allowed_next`, `data-label` cards on phones, headline counts
  linking to their filters), detail screen with the confirm form
  (`datetime-local` → IST, minutes, engineer select), status, note, trail.
- Entry points: service and solution detail pages get "Book a site visit"
  → `/book-a-visit?service=<slug>`; the location landing page's "Ask about a
  site visit" → `/book-a-visit?location=<slug>`; `SiteSection` gains
  `book_visit` (`/book-a-visit`) so menus can link it; `robots` allows it.
- Mock API endpoints + sample data; `types/api.ts`; audit lists
  (`scripts/shared.mjs`/`audit.mjs`, `mobile-audit.mjs`: `/book-a-visit`, the
  console queue and a DISCOVER edit, the portal list).

## Docs and tests

`docs/visits.md` (new), a module section in `CLAUDE.md` (one line per rule)
plus the scope amendment, `API.md` routes and notifications table,
`FEATURES.md`. Feature tests: request validation (days, notice, holidays,
max 3, windows), guest token scoping (404), portal scoping, transitions and
422s, confirm sets times + emails with .ics, reminder once and only within
24h, lead filed, roles (sales and support can, content manager cannot),
webhook emitted, catalogue entries render.
