# Technoware REST API — `/api/v1`

Every read and write in the product goes through this API. The Next.js
frontend never touches MySQL.

Generated from the live route table (`php artisan route:list`). If you add a
route, add it here — a reference that has silently drifted is worse than none.

---

## Conventions

**Base URL** — `https://api.technoware.in/api/v1` in production,
`http://127.0.0.1:8000/api/v1` locally.

**Always send `Accept: application/json`.** Without it Laravel answers
unauthenticated requests with an HTML redirect and you get a 500 instead of a
401. Every client in this repo sets it.

**Versioning** — the whole surface sits under `/v1` so a breaking change can
ship as `/v2` without stranding the deployed frontend.

**Response envelopes** — a single record is `{ "data": {…} }`. A collection is
either `{ "data": [...] }` or, when it paginates, `{ "data": [...], "meta": {…}, "links": {…} }`.
Index endpoints backed by a paginator return `meta.current_page`,
`meta.last_page`, `meta.per_page` and `meta.total`. These are **not**
interchangeable: products, blog, knowledge base and every admin index
paginate; solutions, services and industries return a plain collection.

**Errors** — `{ "message": "…" }`, plus `{ "errors": { "field": ["…"] } }` on a
422. Status codes used: 401 unauthenticated, 403 wrong principal or missing
role, 404 not found (also returned instead of 403 where a 403 would confirm a
record exists), 422 validation, 429 rate limited.

**Rate limits** — `POST /enquiries` 10/min, `POST /auth/login` and
`POST /admin/auth/login` 10/min, `POST /tickets` 20/min. Login additionally
throttles per email+IP after 5 failures, so one attacker cannot lock out a
whole office.

---

## Authentication

Two entirely separate principals, and the distinction is load-bearing:

| | Customers | Staff |
|---|---|---|
| Model | `Customer` | `User` |
| Log in at | `POST /auth/login` | `POST /admin/auth/login` |
| Token name | `portal` | `admin` |
| Cookie (frontend) | `tw_session` | `tw_admin_session` |
| Reaches | `/tickets`, `/auth/*` | `/admin/*` |

Both return `{ "token": "…", "customer"|"staff": {…} }`. Send it as
`Authorization: Bearer <token>`. Tokens last 14 days and logging in again
revokes the previous token of the same name.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/register` | Customer self-registration. Public, throttled 5/min |
| `POST` | `/auth/verify-email` | Confirm an address. Public, throttled 10/min |
| `POST` | `/auth/resend-verification` | Public, throttled 5/min |
| `POST` | `/auth/request-code` | Customer. Public, throttled 5/min. Answers 202 always |
| `POST` | `/auth/verify-code` | Customer. Public, throttled 10/min. Answers exactly like `login` |
| `POST` | `/admin/auth/request-code` | Staff. Public, throttled 5/min |
| `POST` | `/admin/auth/verify-code` | Staff. Public, throttled 10/min |
| `POST` | `/auth/login` | Customer. Public, throttled |
| `POST` | `/auth/logout` | Customer. Revokes the current token |
| `GET` | `/auth/me` | Customer |
| `POST` | `/admin/auth/login` | Staff. Public, throttled |
| `POST` | `/admin/auth/logout` | Staff. Revokes the current token |
| `GET` | `/admin/auth/me` | Staff, with roles. **Not role-gated** — every role needs to be able to check its own session |

**A staff token cannot use the portal endpoints and a customer token cannot
use the admin ones** — both directions return 403. This is enforced by
middleware (`EnsureUserIsCustomer`, `EnsureUserHasRole`) rather than in
controllers, because the portal authorises by comparing the caller's id to a
ticket's `customer_id`: those ids come from two different tables and collide
whenever the numbers happen to match.

The frontend keeps tokens in httpOnly cookies and calls the API server-side.
Browser JavaScript never sees a token.

### Signing in with a one-time code

**The default way in, for both principals**, with the password form a link
away. Two steps: `request-code` mails a six-digit code, `verify-code` spends it
and answers exactly what `login` answers — `{token, customer|staff}`, or the
same 403 and `reason` on a refusal.

**A code is bound to its audience.** `sign_in_codes` is keyed on
`(audience, email)`, so a code minted at `/auth/request-code` is refused at
`/admin/auth/verify-code` and the reverse. That is not belt-and-braces: it is
the same shape as the bug the shared `password_reset_tokens` table produced
once, where a token issued to a *customer* reset the *staff* account at the
same address.

**`request-code` answers `202` and one sentence, always** — unknown address,
real address, and an address sent a code moments ago alike. A code row is
written either way, so the work done does not differ. One honest gap: mail
goes out inside the request, so an address with an account behind it takes
measurably longer to answer. The throttle bounds that side-channel; a queue
worker closes it.

**Every way a code can be no good is one 422**: wrong, expired, already spent,
burnt by too many attempts, and never issued at all.

**Five wrong entries burn the code.** The attempt cap is what actually closes
six digits — a rate limit only slows guessing down. Codes live ten minutes, are
hashed at rest, are single-use (claimed with a conditional `UPDATE`, so two
simultaneous submissions mint one token), and a newly issued code retires any
still outstanding for that address.

**A code confirms an unverified address.** Delivering one and having it typed
back is exactly the proof `POST /auth/verify-email` asks for, so
`email_unverified` cannot arise from this path — and the confirmation fires
`CustomerRegistered` to `support_email`, or a customer would confirm, wait for
approval, and be in nobody's queue.

**Staff attempts reach the activity log**: `login` on success,
`login_failed` with `bad_code` or `account_inactive`, and
`login_code_requested` for *every* address a code is asked for. `user_id` stays
null on the last two — a run of requests against addresses that do not exist is
the only trace enumeration leaves.

Three public settings in the `auth` group decide what is offered:
`otp_login_enabled`, `otp_admin_login_enabled` and `password_login_enabled`.
They are public because both sign-in screens render before anybody is
authenticated. `password_login_enabled` is the escape hatch: mail is configured
from the console and can be misconfigured from it, so an install that has
turned passwords off and then broken SMTP has locked itself out.

**Delivery is a channel, and email is the only one installed.**
`App\Enums\SignInChannel` owns the list the way `MailTransport` does. SMS is
present and reports itself unavailable — it needs a gateway, a DLT-registered
template, and a phone number on every account, none of which is code.

### Roles

`admin`, `support_engineer`, `content_manager`, `seo_manager`. **An `admin`
passes every role check implicitly**, so a route only ever declares the
specific role it needs.

### Self-registration

Three steps, and each proves something the next one needs: **register** creates
a `pending`, unverified account; **verify** proves the person can read the
address they typed; **approve** is a staff decision in the console. Anyone on
the internet can complete the first two, and only a human can take the third.

A customer's `status` is one of `pending`, `active`, `rejected`, `suspended`,
and **only `active` may sign in**. It replaced the `is_active` boolean, which
could not tell "waiting for a human" from "switched off by a human" — two
states that want opposite words in front of whoever is at the sign-in form.

**Every response from `/auth/register` is identical**, whether the address is
new, already registered, or arrived with the honeypot filled: `202` and one
sentence. Anything else makes the form a membership oracle — submit addresses,
read which come back "already taken", and you have a list of this company's
customers, which for a support portal is a list worth phishing. The real
account holder is told separately, by email, because they are the only party
entitled to know an account exists.

**The honeypot field is `website`**, matching the contact form.

**A login that fails on status returns `403` with a `reason`**, not a
validation error: `email_unverified`, `pending_approval`, `rejected`,
`suspended`. The frontend renders a different screen for each — "confirm your
address" carries a resend button, "waiting for approval" has nothing to offer
and must not pretend otherwise. Branch on `reason`, never on `message`. A
*wrong password* still returns 401 whatever the account's status: the status is
not something a wrong password earns.

**Confirmation tokens are hashed at rest**, single-use, and expire in 24 hours.
A wrong token, an expired one, an already-spent one and an unknown address all
return the same 422 — the same rule the password reset follows.

**The support desk is notified when an address is confirmed**, not when the
form is submitted. An unconfirmed row is noise, and a form open to the internet
would otherwise turn the support inbox into a spam folder.

**`registration_enabled` closes the door.** With it off the endpoint answers
403 and the frontend 404s the route. It lives in the public `portal` settings
group, because a toggle the site cannot read is a toggle that does nothing —
which is exactly what `portal_enabled` was until this feature gave it a reader.

---

## Public endpoints

No authentication. Cacheable; the frontend ISR-caches most of these.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | Version banner and endpoint list |
| `GET` | `/products` | Paginated. `?q=` search, `?category=`, `?brand=`, `?sort=`, `?page=` |
| `GET` | `/products/{slug}` | |
| `GET` | `/product-categories` | Plain collection, each with `product_count`. `?in_menu=1` as above |
| `GET` | `/product-categories/{slug}` | Adds `related_solutions` |
| `GET` | `/brands` | Brands that have a published product. Plain collection |
| `GET` | `/sliders/{slug}` | One carousel and its slides. 404 when unpublished **or empty** |
| `GET` | `/menus/{location}` | The navigation for `primary` or `footer`. **404 when nothing is assigned** |
| `GET` | `/forms/{slug}` | An editor-built form's definition. 404 when unpublished **or fieldless** |
| `POST` | `/forms/{slug}` | A submission. Throttled 10/min, honeypot field `website` |
| `GET` | `/careers` | Open vacancies. `?department=`, `?type=`. Plain collection |
| `GET` | `/landing-pages` | Published programmatic pages. `?kind=`. Plain collection |
| `GET` | `/landing-pages/lookup?path=/brands/cisco` | One page, or 404 |
| `GET` | `/careers/{slug}` | 404 when unpublished **or past its closing date** |
| `POST` | `/careers/{slug}/apply` | multipart. Throttled 5/min, honeypot `website`, CV required |
| `GET` | `/solutions` | Plain collection. `?in_menu=1` narrows it to the mega menu's items |
| `GET` | `/solutions/{slug}` | Includes benefits, technologies, related products, industries, FAQs |
| `GET` | `/services` | Plain collection. `?in_menu=1` as above |
| `GET` | `/services/{slug}` | |
| `GET` | `/industries` | Plain collection. `?in_menu=1` as above |
| `GET` | `/industries/{slug}` | |
| `GET` | `/blog` | Paginated, published only, newest first |
| `GET` | `/blog/{slug}` | |
| `GET` | `/case-studies` | Published only |
| `GET` | `/case-studies/{slug}` | Includes the `results` figures |
| `GET` | `/knowledge-base` | Paginated. `?q=` search, `?category=` |
| `GET` | `/knowledge-base/{slug}` | |
| `GET` | `/pages` | Published CMS pages, **without bodies**. For the sitemap |
| `GET` | `/pages/{slug}` | CMS pages — `/privacy`, `/terms`, `/downloads` |
| `GET` | `/ticket-categories` | Powers the submit-a-ticket form |
| `GET` | `/settings` | Site settings. **Whitelisted by group**, see below |
| `GET` | `/search?q=` | Site-wide search, grouped by type. Min 2 characters, 5 per group |
| `GET` | `/redirects/lookup?path=/blog/old-slug` | 200 with `{data:{to,status}}`, or 404 |
| `POST` | `/enquiries` | Contact form. Throttled 10/min, honeypot field |

**`?sort=` is a whitelist of three orderings** — `featured` (the default),
`name` and `newest` — and an unrecognised value falls back to the default
rather than returning 422. A sort parameter is the kind of thing that arrives
mangled from an old bookmark, and an error page is a worse answer than the
catalogue's own order. Every ordering ends on `name` so the sequence is total:
without a tiebreak, a page boundary can show one row twice and hide another,
because MySQL is free to order equal rows differently between two queries.

**Catalogue search matches the brand name as well as the product's.** The
manufacturer is rarely in the product's own name — "6100 48G Switch" is an
Aruba and nothing in that string says so — and searching a hardware catalogue
by brand is the first thing this audience tries. It returned nothing.

**`/brands` lists only brands with a published product.** A facet that can
only ever return an empty result is worse than an absent one: the visitor
reads the empty page as "they do not carry this" rather than "that filter was
never going to match".

**A category's detail response carries `related_solutions`.** A category has
no solutions of its own — the relation lives on the product — so it is the
distinct set across everything published in it, capped at six. It is the one
cross-link a category listing can offer that is not more hardware: someone
reading a switch listing is usually part-way through a networking project.

**`/menus/{location}` answers 404 when no menu is assigned**, and that is the
whole of what makes menus additive. The frontend falls back to the navigation
built into the site, so an install that never opens the menu screen renders
exactly what it renders today. An empty 200 would blank the header. An assigned
but *empty* menu is a different answer and comes back as `[]` — somebody
deliberately emptied it — though the frontend still stands the built-in
navigation in, because a header with no links is indistinguishable from a
broken site.

**Every `href` is resolved from the record, not stored.** A menu item holds
`(target_type, target_id)`; only a `custom` item has a URL of its own. So
renaming a slug on that record's own edit screen moves the navigation with it,
instead of leaving a 404 in the header of every page. **An item whose record has
been deleted is dropped from the response** rather than emitted without an
href — an inert word in a navigation bar reads as a broken page, and a link to
`/solutions/` is worse. Its children go with it, since they were reachable only
underneath it. Inactive items are dropped too, and keep their place in the
order.

**A slider with no slides is a 404, not an empty carousel.** The frontend's
fallback is "render nothing" — and on the homepage, "render the NOC panel
instead" — so an empty success would produce a track with two arrows that do
nothing.

**A YouTube slide stores the video id, never the URL that was pasted.** The id
becomes an iframe src, and an unchecked src is somebody else's page inside this
origin — the same reasoning as the contact page's map embed. `App\Support\YouTube`
accepts watch, share, embed and shorts links and refuses everything else,
including `youtube.com.attacker.test`, which is why the host is compared
exactly rather than with `str_contains`. Covered by `tests/Unit/YouTubeTest.php`;
add a case when you touch it.

**Slides are replaced wholesale**, like `faqs`. Omitting the key leaves them
alone; sending `[]` clears them, which has to be possible or the last slide
could never be removed. `sort_order` is renumbered from the array's order, so
an editor moving a slide does not also renumber the ones around it.

**A form's validation is generated from its stored definition, never from the
payload.** `App\Support\FormValidator` builds rules from the `form_fields`
rows: a key no field declares is **dropped, not rejected** — a stale tab should
not get a 422 it cannot act on, but its value must not be stored either — and a
select is checked against its own options, so they are a whitelist rather than
a suggestion.

**`notify_email` never appears on the public endpoint.** It is gated on the
request being an authenticated admin one rather than on remembering to strip
it, because publishing it hands a spammer the address every submission lands
in.

**The honeypot is `website`, and that key is refused as a field name** with a
422 that says why — a field called `website` would silently disable the trap.
A filled honeypot returns the normal success response and stores nothing:
telling a bot it was caught is telling it what to change.

**Submissions outlive their form.** `form_id` is `nullOnDelete` and the slug is
stored alongside it, so deleting a form keeps what people sent through it.

**`?in_menu=1` is a navigation filter, not a publishing one.** The four
endpoints that feed the mega menu accept it; without it they return everything,
because the index pages need everything. `show_in_menu` defaults to true, so a
record is in the navigation until somebody decides otherwise — the opposite
default would empty the menu on the migration that adds the column.

**`/settings` returns a whitelist, not a filtered dump.** Only the `general`,
`contact` and `social` groups are public; the same table also holds SEO
defaults and the portal toggle. "Return everything except what I remembered to
hide" is the wrong default on an unauthenticated endpoint — a setting added
later is private until somebody deliberately makes it public. Null and empty
values are dropped, so a caller gets `undefined` rather than a blank string.
The response is a flat `{ "data": { "key": "value" } }` map.

**`/pages` exists so the sitemap can find CMS pages.** They are rows, not
routes, so nothing could enumerate them and `/privacy`, `/terms` and
`/downloads` were all missing from `sitemap.xml`. It returns
`PageSummaryResource` — id, title, slug, updated_at and the resolved `seo` —
deliberately without `body`: building a list of URLs has no use for the HTML,
and the cost of shipping it grows with every page an editor adds.

**`/search` ranks an exact part number first.** This audience searches
`CBS350-24T` far more often than it searches prose, and putting that below a
product whose description happens to contain the string is the difference
between a search people use and one they stop using. Each group reports the
total it found, not the number returned — "5 results" is a lie when there are
23. Terms under two characters return nothing rather than most of the
catalogue.

It is LIKE against a handful of columns, not a search engine. That is a
deliberate ceiling for a catalogue in the hundreds: the database is already
there, and a Scout driver plus a Meilisearch container is a lot of
operational surface for this corpus. It needs replacing at five figures; the
shape of the endpoint would not change.

**Never ISR-cache a search response.** `?q=` has an unbounded key space, so
caching it fills the cache with single-use entries and serves a stale empty
result for the whole revalidate window. `publicApi.products()` and
`publicApi.knowledgeArticles()` take a `cache` flag for exactly this.

**Knowledge-base search matches tags and a punctuation-stripped title**, so
`wifi` finds "Wi-Fi". People do not type hyphens.

---

## Customer portal

`Authorization: Bearer <portal token>`. Every query is scoped to the
authenticated customer — no code path here can reach another customer's data.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | Public. Returns token + customer |
| `POST` | `/auth/logout` | Revokes the current token |
| `GET` | `/auth/me` | The signed-in customer |
| `PATCH` | `/auth/profile` | Name, email, company, phone, password. Changing the password revokes every other session |
| `GET` | `/tickets` | `?status=`, `?per_page=` (max 50) |
| `GET` | `/tickets/summary` | Counts by status for the dashboard |
| `POST` | `/tickets` | multipart. `subject`, `description`, `ticket_category_id`, `priority`, `attachments[]` |
| `GET` | `/tickets/{reference}` | Bound by reference (`TW-2026-00001`), not id |
| `POST` | `/tickets/{reference}/messages` | multipart. `body`, `attachments[]` |
| `POST` | `/tickets/{reference}/close` | |
| `POST` | `/tickets/{reference}/reopen` | |
| `GET` | `/ticket-attachments/{id}` | Streams the file |

**Internal notes never appear here.** The customer controller loads
`publicMessages`, not `messages`, and the attachment download refuses
anything hanging off an internal note.

**Attachments live on the private disk** and only ever stream through this
authorised endpoint. There is no public URL for one.

---

## Admin — tickets (`role:support_engineer`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/dashboard` | Counts, high priority, status breakdown, and a `metrics` block: 30-day volume, trend, median first response and resolution, SLA rate, open by priority and category |
| `GET` | `/admin/users` | Active staff, for assignment pickers |
| `GET` | `/admin/tickets` | `?status=`, `?priority=`, `?assigned_to=`, `?unassigned=1`, `?overdue=1`, `?q=`, `?per_page=` (max 100). Critical first, then oldest |
| `GET` | `/admin/tickets/{reference}` | Includes internal notes and the audit trail |
| `PATCH` | `/admin/tickets/{reference}` | `status`, `priority`, `assigned_to`, `ticket_category_id` |
| `POST` | `/admin/tickets/{reference}/reply` | multipart. `body`, `is_internal`, `attachments[]` |
| `GET` | `/admin/ticket-attachments/{id}` | Staff download — no ownership check, and internal-note attachments are allowed |

**`status_breakdown` is keyed by the status value, not its label.** It used to
send `"In progress"` — a decision about how to word something on a screen,
taken in the data layer. The dashboard wants to colour those bars the way it
colours the badges, and it had a sentence where it needed a status, so every
bar fell back to grey. `open_by_priority` always sent raw values; this is the
same endpoint agreeing with itself.

**The dashboard's `metrics` are medians, not means**, and `null` rather than
zero when nothing has been measured — zero reads as "instant". `sla_first_response`
carries the sample it was taken from, because 100% of two tickets and 100% of
two hundred are not the same claim. `volume_trend.change` is `null` when the
previous window was empty: going from no tickets to some is not a percentage.
The 30-day series fills empty days with zeroes, or a chart drawn from it puts
a busy Tuesday next to a busy Friday as though they were consecutive. See
`App\Support\TicketMetrics`.

Status changes are validated against `TicketStatus::canTransitionTo()`; an
illegal move returns 422 naming both states. Every change is written to the
ticket's event log. Assigning an unassigned `open` ticket moves it to
`assigned` automatically, and a customer-visible reply on an `open` ticket
moves it to `in_progress` and stops the first-response SLA clock — an
internal note does neither.

---

## Admin — careers

| Method | Path | Role | Notes |
|---|---|---|---|
| `GET`/`POST` | `/admin/job-openings` | content_manager | `?status=`, `?q=` |
| `GET`/`PATCH`/`DELETE` | `/admin/job-openings/{id}` | content_manager | Bound by **id** |
| `GET`/`POST` | `/admin/job-qualifications` | content_manager | |
| `PATCH`/`DELETE` | `/admin/job-qualifications/{id}` | content_manager | Delete refuses while in use |
| `GET`/`POST` | `/admin/job-experience-levels` | content_manager | |
| `PATCH`/`DELETE` | `/admin/job-experience-levels/{id}` | content_manager | Delete refuses while in use |
| `GET` | `/admin/applications` | support_engineer | `?status=`, `?job=`, `?q=`. `meta.new_count`, `meta.retention_days` |
| `GET` | `/admin/applications/{id}` | support_engineer | |
| `POST` | `/admin/applications/{id}/status` | support_engineer | `status`, `note` (staff-only) |
| `GET` | `/admin/applications/{id}/cv` | support_engineer | Streams the file. The only way to read one |
| `DELETE` | `/admin/applications/{id}` | support_engineer | Deletes the CV with the record |

**Vacancies are content; applications are not.** A CV and an employment history
have no business with whoever edits the blog, so the two halves sit under
different roles.

**The CV has no URL.** Private disk, hashed name, streamed through the route
above. `cv_path` and `cv_disk` are absent from every response and must stay
absent.

**A closed vacancy refuses applications**, not just hides itself — the endpoint
checks, because a tab left open across the closing date would otherwise post
into a role nobody is hiring for.

**Applications outlive their vacancy.** `job_opening_id` is `nullOnDelete` and
the title is copied onto the row, the same rule `form_submissions` follows.

**Retention is 180 days**, configurable, pruned nightly, with a 30-day floor.
The CV is deleted with the row.

**Every detail response carries a `schema` object** — the page's JSON-LD, built
by `App\Support\StructuredData`. Products get `Product` with `sku`, `brand` and
a price-less `Offer`; services and solutions get `Service` with `provider` and
an `areaServed` built from the places they are assigned to; blog posts, case
studies and knowledge articles get `Article`/`TechArticle` with a real
`dateModified` and, where the record has one, a real author; a landing page gets
`CollectionPage` or `LocalBusiness`.

**Index responses deliberately do not.** Twenty products means twenty graphs,
each costing a brand and a set of image URLs, for markup nothing renders.

**It is gated on the resource being the page, not on the route name.** A nested
resource inherits its parent's route name, so a route check made every product
inside `/solutions/{slug}` build its own graph and 500 the endpoint under
`preventLazyLoading`. Controllers call `->withSchema()` on the one record that
is the page.

**Nothing in a graph is invented.** `availability` is omitted unless an editor
set it, and there is no `price` anywhere — the brief rules out anything
transactional, and a plausible guess in structured data is a lie a search engine
acts on.

## Admin — landing pages (`role:seo_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/landing-pages` | `?status=`, `?kind=`, `?q=`, `?per_page=` (max 100). Drafts first. `meta.cap`, `meta.published`, `meta.kinds` |
| `GET` | `/admin/landing-pages/opportunities` | Combinations the catalogue supports and nothing covers. `?kind=` |
| `POST` | `/admin/landing-pages` | |
| `GET`/`PATCH`/`DELETE` | `/admin/landing-pages/{id}` | Bound by **id** |
| `GET`/`POST` | `/admin/locations` | `?q=`, `?active=`, `?level=`. A tree: `parent_id`, `level`, `service_ids[]`, `solution_ids[]` |
| `GET`/`PATCH`/`DELETE` | `/admin/locations/{id}` | Delete refuses while pages point at it |

**`role:seo_manager`, not `content_manager`.** A landing page is not content —
it is a decision about which queries the site competes for, and the cost of
getting it wrong lands on pages nobody touched. The role that already owns the
redirect table and the SEO overview owns this.

**Publishing is refused, with reasons, keyed on `status`.** Sending
`status: published` for a page that has not earned it returns **422** and
`errors.status` is a list of sentences written to be read by whoever pressed the
button — "This reads as 80% the same as *Cisco Networking Hardware*". Five
conditions, each blocking a different route to a doorway page: evidence
(3 published products in the exact intersection, or a location with something
concrete recorded), at least 40 words of written introduction, that introduction
not being a near-duplicate of another page's, a distinct title and a description
within the lengths a search result displays, and the published count being under
`landing_page_cap`. See `App\Support\LandingPageQuality`.

**A page may always be saved as a draft.** Nothing here obstructs work in
progress; it obstructs publishing work in progress. A refused publish saves
*nothing* — the request is rejected whole — which the console says explicitly.

**`opportunities` is what the catalogue supports, not the grid.** Against the
seeded catalogue the cross product is 160 combinations and this returns 2.
`meta.skipped_locations` says why each place was passed over, because "no
opportunities" from a console listing three cities reads as a broken feature
when the real answer is that nobody has written the local detail.

**Every response carries the gate's verdict**, not just the status:
`publishable`, `failures[]` and `checks[]`. A list of drafts that says only
"draft" cannot tell an editor which one is three sentences from finished and
which is a duplicate to delete.

**`evidence` is never returned publicly.** It records why a page was proposed —
a question asked months later, when the catalogue has moved and the answer
cannot be recomputed. Publishing internal counts tells anyone who curls the
endpoint how the site is assembled.

**A location cannot be deleted while pages point at it.** `location_id` is
`nullOnDelete`, so deleting one leaves its pages addressed at nothing — a live
URL resolving to a page that no longer knows which city it is about.
Deactivating is the answer to "we stopped covering that place".

**Nothing seeds a location.** A row is a claim that engineers attend sites
there, and no page about a place may publish until one of `office_address`,
`response_time` or `summary` is filled in — **per place**, never inherited from
a parent or a child.

**Places are a tree.** `parent_id` plus a `level` of country / state / city /
area. `state` is not a column: it is derived from the nearest state ancestor, so
there is one answer to where somewhere is. A cycle returns 422 on `parent_id`
and a level that cannot sit inside its parent returns 422 on `level` — a loop is
invisible otherwise, since every node in it still resolves and is merely
unreachable from a root. Levels may be skipped.

**`service_ids[]` and `solution_ids[]` say what is done there**, replaced
wholesale like every other relation. That list does three jobs: it gates whether
a `<service> in <place>` page may be published, it is all
`/admin/landing-pages/opportunities` will propose, and it is what `areaServed`
in the structured data is built from.

## Admin — activity log (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/activity` | `?action=`, `?q=` (actor name, address, record label), `?per_page=` (max 100). Newest first. `meta.retention_days` and `meta.actions` |

**Read-only, and there is deliberately no write path.** No store, update or
destroy. The only thing that removes rows is the scheduled
`technoware:prune-activity`, which deletes by age and cannot be aimed at a
particular line.

**`role:admin`, not `support_engineer`.** It records colleagues' actions.

**What is recorded** is decided by rule rather than by a list: every DELETE,
every creation, and anything under staff, customers, settings or auth — plus
staff sign-in, sign-out and *failed* sign-in. Routine content edits are not
recorded.

**The actor is copied, not joined.** `actor_name` and `actor_email` are stored
on the row, and `actor.exists` says whether the account is still there. A log
that forgets who did something once they leave has failed at the point it is
being read.

**`context` is an allowlist, never a request body.** A settings write records
which keys changed and never their values.

## Admin — customers (`role:support_engineer`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/customers` | `?status=`, `?q=` (name, email, company), `?verified=0\|1`, `?per_page=` (max 100). Pending first, oldest first within it. `meta.pending_count` counts the whole table |
| `GET` | `/admin/customers/{id}` | |
| `PATCH` | `/admin/customers/{id}` | `name`, `email`, `company`, `phone` |
| `POST` | `/admin/customers/{id}/approve` | Activates it and emails them |
| `POST` | `/admin/customers/{id}/reject` | `note` (staff-only). Revokes every token |
| `POST` | `/admin/customers/{id}/status` | `status` of `active` or `suspended`, plus `note` |
| `POST` | `/admin/customers/{id}/resend-verification` | |

**`role:support_engineer`, not `role:admin`.** Deciding whether somebody is a
customer is support-desk work; behind the administrator role every registration
would wait on one of two people.

**Nothing here deletes a customer.** A portal account is what tickets hang off,
so removing one either orphans a support history or takes it with it. `suspended`
is the answer to "make this account stop working".

**Approving an unconfirmed address is allowed**, and the UI says so before it
happens. Staff know their own customers and a phone call is better proof than
an inbox — but it has to be a decision somebody takes knowingly.

**Rejecting or suspending revokes every token.** One that leaves a live session
running is one in name only.

**`status_note` is staff-only** and never appears on `CustomerResource`, which
is what a customer sees of themselves. It is a judgement about a person,
written for colleagues.

**Changing a customer's email un-verifies it** and sends a fresh confirmation
link. Otherwise editing an approved account is a way to point it at any inbox
at all.

**Status is not settable through `PATCH`.** It moves through the three action
endpoints, each of which does something besides writing the column — sends an
email, stamps who decided, revokes tokens. A status settable through the form
would be a way to suspend an account while leaving its session alive.

## Admin — CMS (`role:content_manager`)

All five verbs per entity, all bound **by id, not slug** — the edit form
changes the slug it is addressed by, so a slug-bound route would break
mid-save.

### Entities

| Entity | Base path | Beyond the common fields |
|---|---|---|
| Blog posts | `/admin/blog-posts` | `author_id`, `published_at`, cover image. `reading_minutes` is derived on save and not accepted |
| Knowledge articles | `/admin/knowledge-articles` | `tags[]`, `knowledge_category_id`, `published_at`. `view_count`/`helpful_count` are read-only telemetry |
| Case studies | `/admin/case-studies` | `client_name`, `industry_id`, `results[{value,label}]`, cover image. **No `published_at`** — status alone decides |
| Solutions | `/admin/solutions` | `problem_statement`, `overview` (rich text), `benefits[]`, `technologies[]`, `icon`, `hero_image_path`, `sort_order`, `product_ids[]`, `industry_ids[]`, `faqs[{question,answer}]` |
| Services | `/admin/services` | `icon`, `sort_order`, `faqs[{question,answer}]`. No `published_at` |
| Industries | `/admin/industries` | `icon`, `sort_order`, `solution_ids[]`. Titled `name`, **not** `title`, and has **no `status`** — an industry is reference data the catalogue points at, not something you draft |
| Pages | `/admin/pages` | `template`, `published_at`. No `summary`. `blocks` is deliberately not accepted — the column exists for block-assembled pages, which need a block editor; raw JSON here would let a typo corrupt a page invisibly |
| Product categories | `/admin/product-categories` | `parent_id`, `icon`, `sort_order`. Titled `name`, and **no `status`** — taxonomy, like industries. `description` is plain text, not rich |
| Products | `/admin/products` | `sku`, `brand_id`, `product_category_id`, `specifications`, `features[]`, `images[]`, `datasheet_path`, `is_featured`, `sort_order`, `solution_ids[]`, `related_product_ids[]`, `faqs[]`. Titled `name`. **No `published_at`** — status alone decides |
| Brands | `/admin/brands` | `logo_path`, `sort_order`, `is_featured`. Titled `name`, and **no `status` and no `seo`** — a brand is a filter facet on the product listing, not a page |
| Sliders | `/admin/sliders` | `autoplay`, `interval_ms`, `slides[]`. Titled `name`, and **no `seo`** — a slider is embedded in a page, it is not one |
| Forms | `/admin/forms` | `submit_label`, `success_message`, `notify_email`, `fields[]`. Plus `GET /admin/forms/{id}/submissions`. Titled `name`, and **no `seo`** |

Common to all: `title`, `slug`, `summary`/`excerpt`, `body`, `status`
(`draft`/`published`/`archived`) and a nested `seo` object — with the two
exceptions called out above.

| Method | Path |
|---|---|
| `GET` | `/admin/{entity}` — `?status=`, `?q=`, `?page=`, `?per_page=`, plus the entity's own filter |
| `POST` | `/admin/{entity}` |
| `GET` | `/admin/{entity}/{id}` |
| `PATCH` | `/admin/{entity}/{id}` |
| `DELETE` | `/admin/{entity}/{id}` |

### Pickers

Read-only lists that populate relation selects in the edit forms.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/admin/knowledge-categories` | `{id, name, slug}` |

**Every other picker is just that resource's CRUD index.** `/admin/products`,
`/admin/industries`, `/admin/brands` and `/admin/product-categories` each
serve both jobs — ask for `?per_page=100` and read `id` and `name` off the
rows, which are never detail-only.

An earlier cut had a second endpoint for industries, which forced the CRUD one
to be named `/admin/industry-records` — a URL that exists only to dodge a
collision is a sign the collision should not exist. `/admin/products` was the
same shape until products gained full CRUD, and went the same way.

### Media

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/media-folders` | `{id, name, media_count}` |
| `POST` | `/admin/media-folders` | `name`, unique |
| `DELETE` | `/admin/media-folders/{id}` | **Keeps the files** — they become unfiled |
| `GET` | `/admin/media` | Paginated. `?q=` on filename, **alt text, description and tags**, `?folder=` (an id, or `unfiled`), `?kind=image\|file`, `?sort=`, `?direction=`, `?trashed=1`, `?per_page=` (default **10**, max 100) |
| `POST` | `/admin/media` | multipart `file` + optional `alt_text`, `folder_id` |
| `PATCH` | `/admin/media/{id}` | `filename`, `alt_text`, `description`, `tags[]`, `folder_id` |
| `POST` | `/admin/media/move` | `ids[]`, `folder_id` (null means Unfiled) |
| `POST` | `/admin/media/copy` | `ids[]`, optional `folder_id`. Duplicates the bytes |
| `POST` | `/admin/media/delete` | `ids[]`. To the bin, not off the disk |
| `POST` | `/admin/media/{id}/resize` | `width`, `height`, `thumbnails[]` of 90/120/180, `as_copy` |
| `POST` | `/admin/media/{id}/crop` | `x`, `y`, `width`, `height`, optional `out_width`/`out_height`, `as_copy` |
| `POST` | `/admin/media/{id}/transform` | `operation` of `rotate`/`flip`/`adjust`, plus `degrees`, `axis`, `brightness`, `contrast`, `greyscale`, `as_copy` |
| `POST` | `/admin/media/{id}/replace` | multipart `file`. Same bytes, **same path** |
| `GET` | `/admin/media/{id}/versions` | Superseded copies, newest first |
| `POST` | `/admin/media/{id}/versions/{version}/restore` | Puts an archived copy back |
| `GET` | `/admin/media/{id}/download` | Streams it under its human filename |
| `DELETE` | `/admin/media/{id}` | To the bin. The file stays |
| `POST` | `/admin/media/{id}/restore` | Back out of the bin, at the same path |
| `DELETE` | `/admin/media/{id}/purge` | For real: row, file and every version |
| `POST` | `/admin/media/trash/empty` | Purges everything in the bin |

**`?sort=` is a whitelist of four** — `created_at` (the default), `updated_at`,
`filename` and `size` — and an unrecognised value falls back rather than
returning 422, the same rule the catalogue's `?sort=` follows. The default
*direction* depends on the column: A-Z for a name, newest and largest first for
everything else, because the sensible direction is a property of the column
rather than a constant.

**Every ordering ends on `id`.** Thirty files uploaded by one seeder share a
`created_at` to the second, and MySQL is free to order equal rows differently
between two queries — so without a tiebreak a page boundary shows one file
twice and hides another. This is the library where that bites, not the
catalogue.

**`description` and `tags` are not a second alt text**, and conflating them is
an accessibility bug rather than a tidy simplification. Alt text is announced
*in place of* the image on every public page that renders it; a description is
a working note for whoever files assets and reaches no public response at all.
One field doing both yields either alt text nobody can search or a paragraph
read aloud to somebody who asked what the picture shows.

**Tags are normalised, and their order is kept.** Trimmed, lower-cased, blanks
dropped, de-duplicated — "Hero", "hero " and "hero" are one label that would
otherwise filter as three. The order survives because an editor putting the
most important label first meant it, which is also why the column is a JSON
**array**: MySQL reorders JSON *object* keys, the bug `App\Casts\SpecSheet`
exists for.

**A copy duplicates the bytes**, never the row alone. Two rows sharing a path
is a delete that silently breaks the other and a crop that silently edits it,
and nothing here counts references. A row whose file has gone is skipped rather
than failing the batch.

**An edit rewrites the file in place, and `as_copy` is the other intent.**
Records store a *path*, so editing in place is what lets a crop reach every
page already using the image — and `as_copy` is "I want the cropped version as
well". Each answer silently ruins the other case, so the console asks rather
than assuming.

**Every in-place edit archives the previous bytes first.** `App\Support\MediaHistory`
copies them aside *before* the operation — afterwards there is nothing left to
copy, and snapshotting after the fact looks identical from outside while
storing the new bytes every time. Ten versions per file, because these are full
copies on the public disk; pruning deletes the files through the model's own
`deleting` hook, so a mass delete would leave them orphaned.

**Deleting fills a bin and keeps the file.** Nothing in this product tracks
which records reference a path, so the delete dialog has always had to admit it
cannot say what will break — which means the mistake is found by somebody
opening a page and seeing a hole in it. A restore has to put back the *exact*
URL that was already published, which re-uploading the same bytes under a new
hashed name would not do; so the path is held until the file is purged.
`restore` and `purge` take a plain `{id}` rather than a bound model, because
route-model binding applies the default scope and answers 404 for every file in
the bin.

**The bulk routes are declared above `media/{id}`.** Laravel matches in
declaration order, so `media/move` under the parameterised route binds `{id}`
to the literal string "move" and 404s from model binding — a routing bug that
reads as a missing record. There is a test for exactly that.

**`replace` keeps the path and refuses a different extension.** The extension
is part of the address every record already points at, and the content type is
served from the file on disk rather than the row, so a JPEG at a `.png` address
is a real mismatch. An SVG replacement goes through the same sanitiser an
upload does — skipping it would be a way to put unsanitised markup at an
address the library already trusts.

**The listing carries `meta.library`** — counts, total bytes, the accepted
extensions and the size limits — so the console can say what is allowed from
the same list the upload rule uses. A panel built from its own copy is wrong
the first time somebody widens the real one.

**`url` carries `?v=<updated_at>` and `path` never does.** An edit keeps the
path deliberately, so without a version the browser goes on serving the copy it
already holds and the console shows the old picture after a successful resize.
`path` is what a record stores, and a stored path with a query string in it is
a filename that does not exist.

**Media search covers the alt text, not just the filename.** The stored name
is a hash, the human filename is often `img_4821`, and the alt text is the one
field that says what the picture shows — which is what someone hunting for a
photograph actually types.

**Deleting a folder never deletes what is in it.** `folder_id` is
`nullOnDelete`, so the files return to the unfiled view. A folder is a label;
the files are the expensive thing, and losing a hundred uploads to one
confirmation dialog is not a mistake anyone recovers from.

**`?folder=unfiled` and no `folder` parameter are different questions** — the
first means "files in no folder", the second means "everything".

**A square thumbnail crops; it does not squash.** `resize` scales the whole
frame, because the caller named exact dimensions — but a 90x90 thumbnail of a
4:3 photograph has to cut a square out of the middle. Scaling the frame into a
square is what the thumbnails did at first, and a round 300px circle in an
800x400 source came back as an ellipse 34x68.

**Crop coordinates are in the image's own pixels.** The client maps whatever
it drew on screen back to natural size before sending; the displayed image is
almost never 1:1. A rectangle past the edge is clamped rather than refused —
a selection is dragged with a pointer, and overshooting by a few pixels is
what hands do.

**Resize and crop rewrite the file in place, and refuse SVG**, with a 422 that
says why. A vector has no pixel size to change, so resizing one would report
success and leave the file exactly as it was — and most of this library is
currently SVG placeholder art, so that would be the common case. Checked
thumbnail sizes become their own media rows rather than hidden variants:
anything the library cannot list is something an editor cannot reach.

**Rename never touches the stored path.** `filename` is metadata; the file
keeps its hashed name, so renaming cannot break a record that already
references the path.

**Uploads accept documents as well as images** — pdf, doc(x), xls(x), csv,
txt, zip — because the Files tab needs something to hold. It stays an
allowlist: these are served straight back to browsers from the public disk,
so the question is what is safe to hand a visitor, not what is safe to store.

**An SVG is sanitised on write, and that is not optional.** A browser treats
one as a *document*, not an image: opening its URL runs any script it carries,
so an unchecked upload is stored active content on the API origin — the same
hole `HtmlSanitiser` closes for CMS bodies, on a file type nobody thinks of as
markup. `App\Support\SvgSanitiser` keeps an allowlist of elements and
attributes and drops the rest, so `script`, every `on*` handler,
`foreignObject`, `use` pointing at a data URI, an inline `style` and an
external DTD all come off. It is an **allowlist** because the vectors are not a
list anyone can finish from memory — `animate` retargeting an `href` is the
example that survives every denylist written from the obvious ones.

Two consequences. The bytes are cleaned **before** they are written, so there
is no window in which the raw file has a live URL. And a file the XML parser
cannot read is refused with a 422 rather than repaired: there is no safe
reading of markup nothing agrees on how to parse. Covered by
`tests/Unit/SvgSanitiserTest.php`, one test per vector — add a case when you
touch it.

Rejecting SVG outright was the other option and is the wrong one here: vector
is the format logos and icons are published in, all 33 placeholder images in
this library are SVG, and an upload form that refuses the format the content is
in gets worked around.

**Alt text lives with the file, and the public resources resolve it by path.**
Records store a path, not a media id — `cover_image_path`, `images[]` — so the
path is the only link from a published image back to the row that describes it.
`App\Support\MediaAlt` loads the whole `path => alt_text` map once per request
and memoises it, because a products index renders twenty images and twenty
queries for twenty short strings is the wrong trade. Public resources therefore
carry `cover_image_alt` (blog, case studies), `hero_image_alt` (solutions) and
`image_alts` (products — a parallel array, same order and length as `images`).

Strictly, alt text describes an image *in context*, and the same photograph can
warrant different wording in two places. For a hardware catalogue the answer is
almost always the name of the thing in the picture, so one description per file
is worth far more than four sets of per-record fields nobody fills in. A
per-use override can be added later without changing the wire shape.

Media goes to the **public** disk — these are cover images and og:image
targets meant to be fetched by browsers and crawlers, the opposite of ticket
attachments. Filenames are hashed; the original is metadata only. Requires
`php artisan storage:link`.

### Things that will bite you

**Rich text is sanitised on write**, against an allowlist that is exactly the
set the console's editor can produce and the frontend styles. `<script>`,
`<style>`, `<form>`, `<object>`, event handlers and `javascript:` URLs are
stripped and cannot be stored. The editor toolbar is a convenience, not the
boundary: the code view lets an editor type raw HTML, and this is what answers
for it.

Three parts of that allowlist are worth stating, because each is a place where
"sanitised" is doing something more specific than removing tags.

**Inline `style` is permitted as an allowlist of properties.** The editor's
colour, highlight, font family, font size, alignment, indent, line-height and
image resize/float controls all work by writing inline CSS, so refusing it
outright would leave seven buttons that appear to work and silently do nothing.
HTMLPurifier parses each declaration and validates the value against the
property's own grammar, so `expression(...)`, `behavior:` and
`url(javascript:…)` are refused for not being valid values of anything listed
rather than by appearing on a denylist that would have to be complete.
`position`, `display` and `z-index` are absent deliberately — those are what
let a body escape its own box and cover the page's chrome.

**Deprecated elements are an input format, never a stored one.** A browser's
`execCommand` emits `<b>`, `<strike>` and `<font color face size>`, so those
are admitted and then rewritten: `<font>` and `<strike>` become a `<span>`
carrying a validated declaration. `<u>` and `<s>` are exempted from that
rewrite and kept as themselves. Nothing deprecated reaches the database.

**An `<iframe>` is allowed for video, restricted to YouTube and Vimeo.** The
element being allowed is not what makes it safe; `URI.SafeIframeRegexp` is, and
it is anchored on the host so `youtube.com.attacker.test` cannot pass — the
same reasoning `App\Support\YouTube` follows for a slide's video and the
contact page's map embed. That list is stated in three places which must agree:
the regexp, the editor's toolbar, and `frame-src` in the frontend's
`next.config.ts`. A host in one and not the others is either a video that
disappears on save or one that saves and renders as an empty box.

`<h1>` is refused. The page renders exactly one and it is the record's title,
so a second in the body is an accessibility failure on every screen showing it.

Covered by `tests/Unit/HtmlSanitiserTest.php` — hostile vectors and the whole
positive set, the latter asserted against the markup a browser actually emits
rather than the markup it ought to. Add a case when you touch the allowlist.

**`schema_type` is an allowlist per record type, and it reaches the markup.**
`seo_defaults.schema_type_options` says what this record may declare itself to
be — `Article`/`BlogPosting`/`NewsArticle` for a post,
`WebPage`/`AboutPage`/`ContactPage`/`CollectionPage` for a page, and exactly
`Product` for a product. Every alternative is a drop-in for the derived type:
same required properties, nothing new made mandatory. `PATCH` validates against
the union of all of them (the rule is static and has no record) and
`App\Support\SchemaTypes::resolve()` narrows per record when the graph is
built, so a mismatched-but-valid value falls back to the derived type instead
of emitting a block that validates as neither. `schema_type_options` is admin
only — it is absent from `SeoResource` and so from every public response.

**`robots` keeps its length rule while the console offers four options.** The
directive vocabulary is open — `noarchive`, `max-snippet:-1` — and a dropdown
constraining what an editor can produce is not a reason to refuse what an
integration might legitimately send.

**`seo` is an override, not the value.** Every field is nullable and null
means "derive it". `GET` returns both: `seo` is what was typed, `seo_defaults`
is what the site falls back to. Send only what the editor actually entered —
copying `seo_defaults` back promotes every derived value into a hard override.

**Changing a slug writes a 301 automatically** into the `redirects` table, so
old URLs keep working and keep their ranking. That is why slugs are safe to
edit and why `/redirects/lookup` exists.

**Publishing without a date sets `published_at` to now** on entities that have
the column. Otherwise a post would be `published` with a null date and the
public scope would filter it straight back out — publishing would look like it
had silently failed.

**Repeating fields are replaced wholesale, not diffed** — `faqs`, `results`,
`benefits`, `technologies`, and the `*_ids` relations. Send the complete
desired set. Omitting a key entirely leaves that relation untouched; sending
`[]` clears it.

**A category cannot be reparented under itself or a descendant.** Either would
cut that branch out of the tree — still walkable from inside the loop, but
unreachable from a root, so the whole subtree would disappear from the
navigation with no error. `PATCH` returns 422 on `parent_id` naming which case
it hit.

**Deleting a category promotes its children to the grandparent**, rather than
letting `nullOnDelete` scatter them to the top level. Products survive both a
category and a brand deletion — they simply lose that association.

**A product's `specifications` is an ordered map**, and the order is the one
the editor set. It survives a round trip only because `App\Casts\SpecSheet`
stores it as a list of pairs: MySQL's JSON type reorders object keys by length
and then alphabetically, so a plain map came back scrambled. The wire format
is still `{"Ports": "24 × 1G"}` in both directions.

**Deleting a product releases its slug.** `Product` is the only soft-deleting
model and nothing lists trashed rows, so the slug would otherwise be held
forever by a record no one can see — and recreating it would be refused by a
uniqueness check naming a phantom. The row is kept (recoverable in the
database) with its slug suffixed, so the URL is free to reuse.

**`related_product_ids` is one-way.** Marking B as related to A does not list
A on B. The two sides are edited separately — an accessory can point at a
switch without the switch listing every accessory back — and a product cannot
be related to itself.

---

## Admin — menus (`role:content_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/menus` | Every menu. `meta.locations`, `meta.types`, `meta.max_depth` |
| `GET` | `/admin/menu-targets?type=&q=` | Records an item can point at. Searched, capped at 50 |
| `POST` | `/admin/menus` | `name`, `location`, nested `items[]` |
| `GET`/`PATCH`/`DELETE` | `/admin/menus/{id}` | Bound by **id** |

**`role:content_manager`, not `role:admin`.** Deciding what the navigation says
is editorial work, and it is the same role that already owns every record those
links point at.

**Items arrive nested and are replaced wholesale**, the rule `faqs` and `slides`
follow. `parent_id` and `sort_order` are read off the *shape* of the payload,
never trusted from it — which is also what makes a cycle unrepresentable rather
than merely refused, so there is no `wouldCycle()` here as there is on
`Location`. Omitting `items` leaves them alone; sending `[]` empties the menu,
which has to be possible or the last item could never be removed.

**Two levels, and a third is a 422 naming the item.** Both locations render the
top-level items and their children and nothing deeper, so a third level would be
data an editor arranges carefully and never sees — the same reason a CMS page
template the frontend does not know is refused rather than falling back
silently.

**`location` is unique when set.** Two menus claiming the header is a question
with no answer. Null is allowed and any number of menus may sit unassigned.

**A custom link's `url` is pattern-checked** — a path, `https://`, `mailto:` or
`tel:` — because it becomes an `href` on every page of the site. An item of any
other type is refused without a `target_id`: it would save happily and then
vanish at render, which reads as the menu losing entries by itself.

**`meta.locations` and `meta.types` are sent by the API**, never listed in
TypeScript — the same rule `schema_type_options` follows.

---

## Admin — settings (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/settings` | Every setting, grouped. `{ "data": { "general": [{key, value, type, group}], … } }` |
| `PATCH` | `/admin/settings` | `settings: [{key, value}]` |

**`role:admin`, not `role:content_manager`.** These are site-wide behaviour —
the portal toggle, support addresses, SEO fallbacks — not page content, and
the `Role` enum already placed configuration under administrator.

| `POST` | `/admin/settings/clear-secret` | `key`. Removes a stored credential |
| `GET` | `/admin/settings/mail` | Which transport, what each needs, and whether a mailbox is connected |
| `POST` | `/admin/settings/mail/authorize` | `transport`, `redirect_uri`. Returns the Google consent URL |
| `POST` | `/admin/settings/mail/callback` | `code`, `state`. Exchanges the code for a refresh token |
| `POST` | `/admin/settings/mail/disconnect` | Forgets the mailbox and revokes it upstream |
| `POST` | `/admin/settings/mail/test` | Sends one real message. Throttled 6/min |

**`mail_transport` is an allowlist of six** — `smtp`, `google`, `brevo`,
`mailgun`, `ses`, `log` — and an unknown value falls back to `smtp` rather than
returning 422, the same rule `?sort=` follows. Blank means "nothing chosen", so
`.env` stays in charge: that is what a first deploy and every development
machine rely on.

**Five of the six transports are installed; SES is not.** Brevo and Mailgun
ship their bridges — `symfony/brevo-mailer` and `symfony/mailgun-mailer` — plus
`symfony/http-client`, which both call at runtime while declaring it only as a
dev dependency. `aws/aws-sdk-php` is deliberately absent: ~50MB of vendor on
every deploy for a transport nobody has chosen. `composer require
aws/aws-sdk-php` is the whole of enabling SES.

So `transports[].available` is `false` for `ses` today, and
`transports[].install` carries the command. The console disables the option and
says why. A *stored* transport this server cannot build is the case that
survives a vendor change: the provider logs and leaves `.env` in charge rather
than half-applying it, and `POST /admin/settings/mail/test` answers 422 naming
the command — never a class-not-found on the next ticket receipt.

**Every one of them also speaks plain SMTP.** Brevo, Mailgun and SES all
publish a host and credentials, so the `smtp` transport reaches any of them with
no bridge at all. The API transports buy better error reporting and immunity to
a host that blocks outbound 587, which shared hosting does.

**The API key is `secret` for Mailgun and `key` for Brevo.** Laravel's Mailgun
factory reads `$config['secret']` with no default, so the name that is right for
one is `Undefined array key` for the other — at send time, not at save time.
Each API transport is built for real in `tests/Feature/OutgoingMailTest.php`
rather than asserted about, since both spellings are just strings in an array
and nothing static tells them apart.

**`redirect_uri` is checked against this site's own callback path exactly.** It
is echoed to Google and used again at exchange, so an unchecked value is an
open redirect ending with somebody else holding an authorisation code for this
site's mailbox. The host is compared for equality — `str_contains` would accept
`technoware.in.attacker.test`, the same reasoning `App\Support\YouTube`
follows. Only `/admin/settings/mail/callback` is accepted, plus localhost for
development.

**The `state` is single-use and server-side.** Without it the callback accepts
an authorisation code from anywhere, and anyone who can make an administrator's
browser open that URL connects *their* mailbox as this site's sender.

**Google's scope is `https://mail.google.com/`, which is full mailbox access.**
There is no send-only scope that works over SMTP AUTH; `gmail.send` is
send-only and accepted only by the Gmail HTTP API, which is a different
transport. That trade is deliberate and written down rather than discovered.

**`access_type=offline` and `prompt=consent` are both required.** Google issues
a refresh token only on a fresh consent, so without them a second connection
succeeds and stores nothing usable — which looks exactly like a bug in the
exchange.

**A refresh is locked.** Google rotates the refresh token on some accounts, and
two requests refreshing at once means the second invalidates the token the
first is holding. On a support desk that is not hypothetical, and it
disconnects the mailbox in a way that looks random.

**`mail_error` is what makes a silent failure visible.** `Notifier` swallows
send failures on purpose — a committed ticket must still answer 201 when mail
is down — which is right for SMTP, where failure means an outage. It is not
enough for OAuth, where a refresh token expiring is a certainty rather than a
fault: without this the console looks healthy while every receipt stops
arriving, and the only trace is a log line under a shipped `LOG_LEVEL` of
`warning`. A failed refresh or send writes it, the settings screen shows it,
and a successful test clears it.

**`/admin/settings/mail/test` is the one endpoint allowed to fail on a mail
error**, and it returns the server's own words rather than something friendlier:
"Connection could not be established with host smtp.example.com:587" says what
to fix.

It takes an optional `email` and defaults to the signed-in administrator.
Sending to an outside inbox is the point of the option: a message to a Gmail
account proves SPF, DKIM and reputation in a way one to the same domain never
can, and before this the only way to check was to edit the account's own
address.

**The body is fixed and no caller can influence it**, which is the line between
this and an open relay. What can be posted is one self-identifying sentence,
from an authenticated administrator, at six a minute, recorded in the activity
log with the recipient — `email` is on `ActivityLogger`'s context allowlist for
this route alone. Somebody holding an administrator session can already change
every address this site sends to; what they must not gain is a way to write
arbitrary mail over its reputation.

**`email:dns` is deliberately absent from the validation**, the same rule the
public forms follow: it is a DNS lookup on the request path, and a send that
fails says more than an MX record that resolves.

**A settings change takes effect on the next request.** The transport is
applied at boot by `MailSettingsProvider`, so the request that saves a setting
is not the one that sends anything through it. Save, then test.

**Only keys that already exist are written.** The settings table is defined by
its seeder; a `PATCH` naming an unknown key ignores it rather than inserting
one, so the endpoint cannot be turned into an arbitrary key/value store. An
empty string is stored as `null`, which is what makes a blank social URL hide
its footer icon instead of linking nowhere.

**Credentials are never returned.** Rows flagged `is_secret` — the SMTP
password and the API key — are encrypted at rest and come back as
`value: null` with `is_set: true`. A blank submit means *unchanged*, because
the form can never show the current value and treating blank as a delete would
wipe the SMTP password on every unrelated save. Clearing one is the separate
endpoint above.

**The `media` group is not public either**, and holds three settings that
change what the library does rather than what a page says: `image_quality`,
`media_max_kb` and `media_max_video_kb`.

**`image_quality` applies to images the application *produces*, not to
uploads.** An upload is stored byte-for-byte — re-encoding somebody's original
throws away quality they cannot get back, and it is the only copy there is.
What is re-encoded is every derived image: a resize, a crop, a thumbnail, a
rotate. `App\Enums\ImageQuality` owns the five presets, and the API sends the
options rather than the console listing them — the same rule
`schema_type_options` follows. JPEG and WebP read the number as *quality*;
PNG reads it as compression *effort*, which is lossless, so "Low" does not
degrade a PNG, it leaves it larger.

**The upload limit is a minimum across three ceilings**, not a number this
application alone controls: the setting, `upload_max_filesize` and
`post_max_size`. A value above either php.ini figure is not a bigger limit, it
is a promise the server will not keep — PHP discards the file, and with
`post_max_size` the whole request body, so Laravel reports the field as
missing. `GET /admin/settings` therefore carries `meta.uploads` with php.ini's
own numbers and whether they are overruling the setting, and `PATCH` refuses a
value above them naming the figure. See `App\Support\UploadLimits`.

**The `mail` and `integrations` groups are not public.** They are absent from
the `/settings` whitelist. Anything added to them stays server-side.

**The `consent` group is public too**, for the same reason — the banner is
rendered client-side and needs every string in it.

**The `analytics` group *is* public, and must be.** A GA4 measurement ID and a
Meta Pixel ID appear in the page source of every site that uses them; there is
nothing to protect, and the frontend cannot inject a tag it cannot read. They
are not secrets and must not be marked as such.

**A `map_embed_url` is validated against `https://www.google.com/maps/embed`**
on write. It becomes an `iframe src` on the contact page, and an unchecked one
is somebody else's page rendered inside this origin.

**Settings whose key ends in `_path`** (the logo and favicon) come back with a
resolved `url` alongside the stored path, so a picker can preview one without
knowing how storage paths map to URLs.

**The public `/settings` also sends each image's natural size** —
`logo_width`/`logo_height`, and the same for `favicon_` and `login_image_` —
read from the `media` row by path, in one query for all three. Without them the
frontend has to *guess* an aspect ratio to reserve space, and a guess about a
file the client uploaded is wrong by definition: the header declared 180x40 for
a mark that is 600x81, so its box was 126px until the image arrived and 207px
afterwards, and the whole navigation beside it jumped right on every cold load.
The final position was correct, which is what made it read as a rendering fault
rather than as a wrong number.

They are strings like every other value in that flat map, and they are
**absent** rather than zero when the path has no media row behind it — typed by
hand, or uploaded before the library recorded dimensions. The lookup is
`withTrashed`, because deleting a media row fills the bin and keeps the bytes:
the path still serves, so the image still renders and its dimensions are still
the truth about it.

---

## Admin — FAQs (`role:content_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/faq-owners` | Grouped picker: solutions, services, products, pages |
| `GET` | `/admin/faqs` | `?q=`, `?owner_type=`, `?owner_id=` |
| `POST` | `/admin/faqs` | `question`, `answer` (rich text), `sort_order`, `owner_type`, `owner_id` |
| `GET`/`PATCH`/`DELETE` | `/admin/faqs/{id}` | |

**An FAQ must name an owner**, though the column allows null. Nothing on the
public site renders an unattached one, so it would be written, saved and never
seen. `owner_type` is the morph key (`solution`), not a class name.

---

## Admin — SEO and redirects (`role:seo_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/seo` | Indexable records, each with a score. `?type=`, `?q=`, `?issues=1`, `?check=`, `?page=`, `?per_page=` (max 200, default 50) |
| `PATCH` | `/admin/seo/sitemap` | `type`, `id`, `sitemap_include` |
| `GET` | `/admin/redirects` | `?q=`, `?source=automatic\|manual`, `?active=` |
| `POST` | `/admin/redirects` | `from_path`, `to_path`, `status_code`, `is_active` |
| `GET`/`PATCH`/`DELETE` | `/admin/redirects/{id}` | |

**`GET /admin/seo/{type}/{id}` re-scores one record.** What the console's
Recheck button calls: the edit form opens in a new tab so working down a
filtered list does not spend your place in it, which leaves the list holding a
score from before the edit. It **still collects every record** — the duplicate
title and description checks cannot be answered from inside one row, and a
record scored alone comes back too high — but returns one row rather than
fifty, which is 1.5KB against 73KB. A record deleted elsewhere returns 404
rather than an empty 200, so the console can tell that apart from "nothing
changed".

**`/admin/seo` paginates, and `?issues=1` is a server-side filter.** The two
arrived together and cannot be separated: the screen used to render every
record and filter for problems in the browser, which is correct only while
everything is on one page. Filter a page client-side and it hides just the
rows that happened to land on it. `meta.with_issues` counts the whole matching
set rather than the page, because it is a headline figure.

**Every record carries a `score`, and the score carries its own reasons.**
`{value, band, passed, checked, failed[]}`, where each entry in `failed` is a
check with a `label`, a `weight` and a `hint` saying what to do about it. A
number on its own tells an editor they have a problem and not one thing to do,
so the checks travel with it.

**It is scored out of what *applies*, not out of everything.** An industry has
no body column and can never earn the content checks; dividing by the full set
would park every industry in the fifties with nothing anybody could do about
it. `checked` is how many applied. That also means two records' scores are
comparable as grades and not as counts.

**Nothing here fetches the rendered page.** Every check reads what is stored,
so this cannot see rendered Core Web Vitals or a broken outbound link — and it
can score a draft that has never been published, which a crawl cannot. Putting
an uncontrolled network call on an admin request is a cost this project has
already measured once, at 12.5s.

**`meta.site_score` is always the whole site**, never the filtered page: it is
a fact about the site rather than a description of what is on screen. Its
`top_issues` are ranked by how many records fail each check *times* what the
check is worth, and each `key` is a value for `?check=` — the figure and the
records behind it are the same query.

**`?check=` filters to records failing one named check**, which is what makes
the headline something you can open. Unknown keys return an empty set rather
than a 422; it arrives from a link, and a stale link should show nothing
rather than an error.

**A duplicate title cannot be seen from inside a filter**, so the endpoint
loads every record whatever `?type=` and `?q=` say and narrows afterwards.
Filter first and every cross-type duplicate silently becomes unique. The
ceiling is a few thousand records.

**`with_issues` counts the five conditions it always counted** — no title, no
description, a title over 60, a description outside 70–160, and noindex — and
not every failed check. Scoring a title *under* 30 characters is right, and
calling it an issue took that headline from 23 records to 48 out of 54. A
figure that flags nearly everything has stopped pointing anywhere.

**`url` is the canonical; `public_path` is where the record actually lives.**
Two differences, both deliberate. It is built from the record's own prefix and
slug rather than read off the canonical — a canonical is an override, and
aiming one at another page is a legitimate thing to do with duplicate content,
so a console link following it would open somebody else's page. And it is a
**path with no origin**, because `frontend_url` is pinned to the production
domain so that canonicals and the sitemap are right, which makes it exactly the
wrong base for a link a person clicks: on a development machine it sent the
editor to the live site. The console and the public site are one application on
one origin, so a path resolves correctly wherever the console is being used.

**`has_override` reads the fields, not the row.** Toggling a record out of the
sitemap creates an override row with no metadata in it, and every record ever
toggled was reporting "Overridden" followed by an empty list of what.

**`admin_path` is a console route, not an API one.** The two differ for blog
posts (`/admin/blog`) and knowledge articles (`/admin/knowledge-base`), and
spelling them with the API's own resource names sent two of the nine record
types to a 404 from the one screen whose job is finding records to go and fix.

**`/admin/seo` is read-mostly.** Editing metadata stays on each record's own
form; a second editor for the same override row would be two implementations of
the same rules. What it adds is the overview — derived versus overridden, and
titles or descriptions outside the lengths search engines display.

**Redirect paths are normalised** to a leading slash and no trailing one, since
the frontend proxy looks them up by exact match. `hit_count` and `last_hit_at`
are telemetry it writes, and are read-only here.

---

## Admin — staff (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/staff/roles` | The four roles with descriptions |
| `GET` | `/admin/staff` | `?q=`, `?role=`, `?active=` |
| `POST` | `/admin/staff` | `name`, `email`, `roles[]`, optional `password`, `is_active` |
| `GET`/`PATCH`/`DELETE` | `/admin/staff/{id}` | |

**Omitting `password` on create generates one** and returns it as
`generated_password` on that response only. It is hashed in the database and
cannot be read again.

**Three lockout guards**, all returning 422: you cannot deactivate or delete
your own account, you cannot remove your own administrator role, and the last
active administrator cannot be deactivated, deleted or demoted. Without the
last one, two administrators can each demote the other.

---

## Notifications

Not endpoints — side effects of existing ones.

| Trigger | Goes to | Notification |
|---|---|---|
| `POST /tickets` | `support_email` setting | `TicketCreated` |
| `POST /tickets` | The customer | `TicketAcknowledged` |
| `POST /tickets/{ref}/messages` | `support_email` setting | `TicketReplied` |
| `POST /admin/tickets/{ref}/reply` | The customer, **unless `is_internal`** | `TicketReplied` |
| `POST /enquiries` | `sales_email` setting | `EnquiryReceived` |
| `POST /auth/register` | The registrant | `VerifyCustomerEmail` |
| `POST /auth/register` (address known) | The **existing** account holder | `RegistrationAttempted` |
| `POST /auth/verify-email` | `support_email` setting | `CustomerRegistered` |
| `POST /admin/customers/{id}/approve` | The customer | `CustomerApproved` |
| `POST /admin/customers/{id}/reject` | The customer | `CustomerRejected` |

**A send failure never fails the request.** `App\Support\Notifier` logs and
swallows: a committed ticket must still answer 201 when mail is down.

**Eleven of the fourteen are queued**, so the request does not wait for SMTP at
all — an unreachable host was measured taking a contact-form submission from
0.2s to 12.5s. The queue is drained by the scheduler every minute, so a message
goes out within about a minute of the thing that caused it.

**Three are sent during the request, deliberately**: the sign-in code, the
password reset and the address verification. Somebody is sitting at a form
waiting for that exact message, and a code that takes a minute to arrive is a
sign-in nobody can use.

**A queued failure writes `mail_error`** through `QueuedMail::failed()`, after
three attempts. Without it a queued send cannot throw during the request, so a
dead mail server would leave a console that looks healthy while every receipt
stops arriving — the failure `mail_error` exists to prevent, reintroduced by
moving the send.

**`GET /admin/settings/mail` reports the queue**: `pending`, `failed` and
`oldest_seconds`. If the scheduler stops, nothing throws and nothing is logged,
so the backlog is the only evidence there is. The age is the figure that
matters — a hundred jobs queued in the last ten seconds is a busy minute; one
job sitting for an hour is a broken deployment.

**The internal-note guard is at the call site**, not inside the notification.

---

## Not built yet

Nothing outstanding in the brief. See `PROGRESS.md` for what remains before
launch, which is content and configuration rather than code.
