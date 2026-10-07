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

**Every limit is per route and per caller** (2026-09-26). A caller is the
signed-in principal, or the client IP; `throttle:N,M` is
`ThrottleRequestsPerRoute`, which adds the route to the key — the framework's
own shared one counter across every throttled route. The client IP is the
connecting address, or `X-Forwarded-For` when the connection comes from
`TRUSTED_PROXIES` (the Next server; `api/config/trustedproxy.php`) — no other
forwarded header is believed from anybody. A direct caller cannot choose its
bucket by sending the header.

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
| `POST` | `/auth/forgot-password` | Customer. Public, throttled. Answers the same whatever the address |
| `POST` | `/auth/reset-password` | Customer. Public. Spends a token and revokes every session |
| `POST` | `/auth/login` | Customer. Public, throttled |
| `POST` | `/auth/logout` | Customer. Revokes the current token |
| `GET` | `/auth/me` | Customer. `meta.impersonated` says whether the session is a staff member's "View as" |
| `POST` | `/admin/auth/forgot-password` | Staff. Public, throttled. **A separate broker and a separate table** |
| `POST` | `/admin/auth/reset-password` | Staff. Public. Spends a token and revokes every session |
| `POST` | `/admin/auth/password` | Staff, authenticated. Change your own password. Not role-gated — every role needs it |
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

**The first confirmation retires the password it did not prove.** However an
address is confirmed — the link, a code, mail piped in from it — the password
on the row is replaced with one nobody knows, every token is deleted, and then
the paid guest orders under the address are joined to it. `/auth/register`
stores a password the caller chose before anybody proved the mailbox, and
anybody can register anybody's address; the code and the link prove the
inbox, never who typed that password. The owner signs in with a code or sets
a password through `POST /auth/forgot-password`.

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

**Switched off, it is enforced by both login endpoints**, not only by the
screens: `POST /auth/login` and `POST /admin/auth/login` answer **403** with
`reason: password_login_disabled` before the credentials are read, one answer
for every address. `AUTH_PASSWORD_BREAK_GLASS=true` in `api/.env` re-opens the
**staff** endpoint only — the way back in when mail is broken — and the
console's refusal is logged as `login_failed` with that reason.

**Delivery is a channel, and email is the only one installed.**
`App\Enums\SignInChannel` owns the list the way `MailTransport` does. SMS is
present and reports itself unavailable — it needs a gateway, a DLT-registered
template, and a phone number on every account, none of which is code.

**The two password brokers do not share a table, and that is the whole of the
fix for a real escalation.** Both used to point at `password_reset_tokens`,
whose primary key is the email address — so a token issued to a *customer* reset
the **staff** account at the same address. Customers now use
`customer_password_reset_tokens`. Same shape as the `Customer`/`User` id
collision `EnsureUserIsCustomer` exists for, and the same reasoning that keys
`sign_in_codes` on `(audience, email)`.

Every reset endpoint answers identically for an unknown address, a known one
and a spent token: one 202 or one 422, one sentence. The audit line is logged at
`warning`, because both `.env` files ship `LOG_LEVEL=warning` and an
`info` line would be discarded — which is what was happening while a comment
claimed an operator could read it.

### Roles

`admin`, `support_engineer`, `content_manager`, `seo_manager`,
`campaign_manager`, `store_manager`, `sales_manager`, `meeting_host`. **An
`admin` passes every role check implicitly**, so a route only ever declares
the specific role it needs. The one exception is `meeting_host`: being
*offered to customers* as a host needs the role on the account itself, and
the implicit pass does not count (see "Online meetings").

### Self-registration

Two steps, or three: **register** creates an unverified account; **verify**
proves the person can read the address they typed; and **approve** is a staff
decision in the console *when the install asks for one*. Anyone on the internet
can complete the first two, and only a human can take the third.

**`customer_approval_required` decides whether the third step exists, and it
defaults to off.** With it off a verified address is enough and the account is
born `active`; with it on the account is born `pending` and waits in the
console's queue. It is a public `portal` setting, so the registration form can
say which of the two is about to happen — a form promising "we will activate it
once we have checked your support agreement" on an install that activates
immediately is a form telling somebody to wait for nothing.

**It fails open, and that is the deliberate half of the trade.**
`Setting::get()` returns the default for a row that does not exist, so an
install that deploys this without re-running `SettingsSeeder` activates
self-registrations rather than parking them in a queue nobody has been told to
watch. The other direction fails *silent*: accounts accumulate as `pending`,
every one of those people is told to wait, and nothing anywhere says why. Run
`php artisan db:seed --class=SettingsSeeder` — it is idempotent — and set it
deliberately either way.

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
return the same 422 — the same rule the password reset follows. **The token is
checked before anything else**: a confirmed address answered 200 with
`already_verified` and the account's `status` whatever token was sent, so a
spent link is now the same 422 and `already_verified` is always `false`.

**The support desk is notified when an address is confirmed**, not when the
form is submitted. An unconfirmed row is noise, and a form open to the internet
would otherwise turn the support inbox into a spam folder.

**`registration_enabled` closes the door.** With it off the endpoint answers
403 and the frontend 404s the route. It lives in the public `portal` settings
group, because a toggle the site cannot read is a toggle that does nothing —
which is exactly what `portal_enabled` was until this feature gave it a reader.

**`portal_enabled` closes the whole portal** (2026-09-29, middleware
`portal`, `EnsurePortalEnabled`). Off, every customer-principal route — the
eight public `/auth/*` routes a customer signs in, registers or recovers
through, and everything behind `customer` — answers **403** with `reason:
portal_disabled`, so a token issued before the switch stops working with it.
Staff routes are untouched. Guest checkout (which still creates the buyer's
account), a guest visit or meeting request, the wishlist and the chat are
not portal sign-ins and stay open. Unset means open, the seeded default.

---

## Public endpoints

No authentication. Cacheable; the frontend ISR-caches most of these.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | Version banner and endpoint list |
| `GET` | `/products` | Paginated. `?q=` search, `?category=`, `?brand=`, `?sort=`, `?page=` |
| `GET` | `/products/{slug}` | Rows and the detail both carry `is_featured`; the catalogue lists those first and the frontend runs the card's border beam on them |
| `GET` | `/product-categories` | Plain collection, each with `product_count`. `?in_menu=1` as above |
| `GET` | `/product-categories/{slug}` | Adds `related_solutions` |
| `GET` | `/brands` | Brands that have a published product. Plain collection. `?partners=1` lists the brands carrying a `partner_tier` instead, products or none |
| `GET` | `/team` | Published team members with their **current** certifications. Plain collection, 200 when empty |
| `GET` | `/clients` | Published clients with their industry. Plain collection, 200 when empty |
| `GET` | `/certifications` | Published, **in-date** company certifications. Plain collection, 200 when empty |
| `GET` | `/sliders/{slug}` | One carousel and its slides. 404 when unpublished **or empty** |
| `GET` | `/popups` | Every live popup, as a **collection**. Ordered, and empty is the ordinary answer |
| `GET` | `/galleries/{slug}` | One picture set, its tabs and its items. 404 when unpublished **or empty** |
| `GET` | `/menus/{location}` | The navigation for `topbar`, `primary`, `footer` or `bottom`. **`data: null` when nothing is assigned**; 404 for an unknown location |
| `GET` | `/forms/{slug}` | An editor-built form's definition: `redirect_url`, `has_files`, `steps`, and `fields[]` each with `settings` and `show_if`. 404 when unpublished **or fieldless** — a form of nothing but headings and step breaks is fieldless |
| `POST` | `/forms/{slug}` | A submission, as JSON or `multipart/form-data` (required when the form has a file field). Throttled 10/min, honeypot field `website`. **201** `{message, redirect_url, data: {id}}` |
| `GET` | `/careers` | Open vacancies. `?department=`, `?type=`. Plain collection |
| `GET` | `/landing-pages` | Published programmatic pages. `?kind=`. Plain collection |
| `GET` | `/landing-pages/lookup?path=/brands/cisco` | One page, or 404 |
| `GET` | `/careers/{slug}` | 404 when unpublished **or past its closing date** |
| `POST` | `/careers/{slug}/apply` | multipart. Throttled 5/min, honeypot `website`, CV required |
| `GET` | `/events` | Published events. `?when=upcoming` (default, soonest first) or `past` (newest first), `?format=`, `?featured=1`, `?page=`, `?per_page=` (max 50, default 12). Paginated. See "Events" |
| `GET` | `/events/{slug}` | One event's page. 404 for a draft or archived one; a past one stays readable. **Never carries `online_url`** |
| `GET` | `/events/{slug}/availability` | `{state, few_left, message}`. `Cache-Control: no-store`. No count |
| `GET` | `/events/{slug}/calendar` | `text/calendar`, an attachment named `{slug}.ics`. No join link |
| `POST` | `/events/{slug}/register` | Free registration. Throttled 10/min, honeypot `website`. **201** `{message, data: {status, seats}}` — no manage link. An address that has registered before is answered exactly as a new one would be, and nothing is written |
| `GET` | `/events/registrations/{token}` | A registrant's own registration. Throttled 30/min. 404 unless the token is 64 hex and somebody's. **Declared above `/events/{slug}`** |
| `POST` | `/events/registrations/{token}/cancel` | Throttled 10/min. Idempotent; promotes the waiting list |
| `GET` | `/solutions` | Plain collection. `?in_menu=1` narrows it to the mega menu's items |
| `GET` | `/solutions/{slug}` | Includes benefits, technologies, related products, industries, FAQs |
| `GET` | `/services` | Plain collection. `?in_menu=1` as above. Each carries `category {id, name, slug}` (null when in none), `image`, `image_alt`, `image_focus`, and `highlights` — the chips on its card, a list of strings, `[]` when none |
| `GET` | `/services/{slug}` | The same two additions |
| `GET` | `/service-categories` | Active service categories in order: `{id, name, slug, description, icon, image_background}`. Plain collection; a category with no published service is the frontend's to hide |
| `GET` | `/industries` | Plain collection. `?in_menu=1` as above |
| `GET` | `/industries/{slug}` | |
| `GET` | `/blog` | Paginated, published only, newest first. `?q=`, `?category=`, `?year=`, `?month=`, `?order=oldest` |
| `GET` | `/blog/taxonomy` | Categories with counts, and archive months with counts. **Declared above `/blog/{slug}`** |
| `GET` | `/blog/featured` | The posts ticked for the hero, newest first when none are. `?limit=` |
| `GET` | `/blog/{slug}/comments` | Approved comments, oldest first. `meta.open`, `meta.total` |
| `POST` | `/blog/{slug}/comments` | Leave one. Throttled 5/10min, honeypot `website`. **Answers 202 always** |
| `GET` | `/blog/{slug}` | |
| `GET` | `/case-studies` | Published only |
| `GET` | `/case-studies/{slug}` | Includes the `results` figures |
| `GET` | `/knowledge-base` | Paginated. `?q=` search, `?category=` |
| `GET` | `/knowledge-base/{slug}` | |
| `POST` | `/knowledge-base/{slug}/helpful` | "Was this helpful?" Throttled 10/min. **204 always** — a draft counts nothing and answers the same, and so does a slug nobody wrote (it used to 404, which made a draft's 204 the tell) |
| `GET` | `/pages` | Published CMS pages, **without bodies**. For the sitemap |
| `GET` | `/pages/{slug}` | CMS pages — `/privacy`, `/terms`, `/downloads`. A `builder` page adds `sections` (see "The section page builder") |
| `GET` | `/ticket-categories` | Powers the submit-a-ticket form |
| `GET` | `/settings` | Site settings. **Whitelisted by group**, see below |
| `GET` | `/search?q=` | Site-wide search, grouped by type. Min 2 characters, **max 100** (422 above), 5 per group. `%` and `_` match themselves. Throttled 240/min under the `search` key — every visitor reaches it through the one Next server |
| `GET` | `/companies/suggest?q=` | Company names already on file. Prefix, min 3 chars, max 5. Throttled 20/min |
| `GET` | `/redirects` | Every active redirect as `{from,to,status}` rows, plus `meta.coming_soon` (boolean — the `coming_soon_enabled` setting, which the proxy acts on) and `meta.media_cdn` (the media CDN's origin while it is switched on, else null). `Cache-Control: max-age=60`. What the frontend proxy holds in memory |
| `GET` | `/redirects/lookup?path=/blog/old-slug` | 200 with `{data:{to,status}}`, or 404. **Records the hit** — the proxy calls it only on a match |
| `POST` | `/enquiries` | Contact form. Throttled 10/min, honeypot field |
| `POST` | `/chat/conversations` | Starts a conversation. Throttled 6/min. Returns the token **once** |
| `GET` | `/chat/conversations/{token}` | The transcript. Throttled 30/min |
| `POST` | `/chat/conversations/{token}/messages` | Ask something. Throttled 12/min |
| `POST` | `/chat/conversations/{token}/lead` | "Have somebody call me." Throttled 5/min, honeypot `website` |
| `POST` | `/chat/conversations/{token}/messages/{id}/rating` | Was that any use. Throttled 30/min |

**`?sort=` is a whitelist of three orderings** — `featured` (the default),
`name` and `newest` — and an unrecognised value falls back to the default
rather than returning 422. A sort parameter is the kind of thing that arrives
mangled from an old bookmark, and an error page is a worse answer than the
catalogue's own order. Every ordering ends on `name` so the sequence is total:
without a tiebreak, a page boundary can show one row twice and hide another,
because MySQL is free to order equal rows differently between two queries.

**`/companies/suggest` is the one public endpoint that answers a question about
the customer list, and the bound is the guard.** It is a **prefix** match, never
a substring — `%meridian%` would let three characters sweep the middle of every
name on file — with a three-character floor, five results, a 20/min throttle and
nothing but names: no count, no id, nothing saying how many people are behind
one. It exists because three people from one firm register over three months and
the console ends up holding the name spelled three ways, which nothing joins.

That is a real trade and it is written down rather than left to be found: it is
acceptable here and `/auth/register`'s membership oracle is not, because an
email address identifies a *person* and is the first half of phishing them,
while this business publishes client names on its own case studies. **If that
stops being true, move the route inside the admin group** — one line, and
nothing else changes. LIKE's own metacharacters are escaped as well as bound,
or a single `%` is a full listing.

**Catalogue search matches the brand name as well as the product's.** The
manufacturer is rarely in the product's own name — "6100 48G Switch" is an
Aruba and nothing in that string says so — and searching a hardware catalogue
by brand is the first thing this audience tries. It returned nothing.

**`/brands` lists only brands with a published product.** A facet that can
only ever return an empty result is worse than an absent one: the visitor
reads the empty page as "they do not carry this" rather than "that filter was
never going to match". The catalogue holds 26 brands with real logos; only the
eight carrying a seeded product answer here today, which is this rule working
as designed rather than a gap.

**A brand's `logo` carries `?v=<updated_at>`.** `logo_path` is a plain stored
path edited in place — a resize, a replace, or swapping a generated
placeholder for the manufacturer's real logo all rewrite the same file at the
same address — so without a version a browser already holding the old bytes
goes on serving them. Same rule `Admin\MediaResource` already follows.

**A category's detail response carries `related_solutions`.** A category has
no solutions of its own — the relation lives on the product — so it is the
distinct set across everything published in it, capped at six. It is the one
cross-link a category listing can offer that is not more hardware: someone
reading a switch listing is usually part-way through a networking project.

**A `section` item whose page has nothing on it is dropped at render.** `team`,
`clients`, `certifications`, `careers`, `case_studies` and `blog` are lists
that can genuinely be empty; `SiteSection::hasContent()` runs the page's own
query and `MenuTree` leaves the item out the way it leaves out an item whose
record was deleted — it comes back when the first row is published. The
other sections are always linked.

**`/menus/{location}` answers `{data: null}` when no menu is assigned**, and
that is the whole of what makes menus additive. The frontend falls back to the
navigation built into the site, so an install that never opens the menu screen
renders exactly what it renders today. An empty array would blank the header.
An assigned but *empty* menu is a different answer and comes back as `[]` —
somebody deliberately emptied it — though the frontend still stands the
built-in navigation in, because a header with no links is indistinguishable
from a broken site.

It is a null inside a 200 rather than a 404, and that changed for a measured
reason: Next's data cache stores only 200s, so as a 404 the four menu fetches
in the marketing layout were live round trips on **every** render of an
install with nothing assigned — cached for nothing, for ever. An unknown
location (`/menus/sidebar`) is still a 404; that is a caller's mistake rather
than a state of the site.

**Every `href` is resolved from the record, not stored.** A menu item holds
`(target_type, target_id)`; only a `custom` item has a URL of its own. So
renaming a slug on that record's own edit screen moves the navigation with it,
instead of leaving a 404 in the header of every page. **An item whose record has
been deleted is dropped from the response** rather than emitted without an
href — an inert word in a navigation bar reads as a broken page, and a link to
`/solutions/` is worse. Its children go with it, since they were reachable only
underneath it. Inactive items are dropped too, and keep their place in the
order.

**A gallery with no pictures is a 404**, the same rule and for the same
reason: the frontend's fallback is to render nothing, so an empty success would
put a tab strip with nothing under it into the middle of somebody's article. An
empty **tab** is a different case and is returned — somebody made it and has not
filled it yet, and hiding it would make the console and the page disagree about
what exists.

**`transition` is an allowlist of four** — `fade` (the default), `slide`,
`zoom`, `none` — and unlike `?sort=` an unrecognised value is **refused** with a
422 rather than falling back. A sort parameter arrives mangled from an old
bookmark and an error page is the worse answer; this arrives from a form the
console drew from `meta.transitions`, so a value outside that list means the two
sides have drifted and silence would hide it. The options carry a label and a
blurb and ride on `meta` of both the index and the record — the index because
the console's *new* screen has no record to read them from, the same reason
`/admin/menus/new` fetches its index for `meta.locations`. The public response
carries the chosen `transition` and no list: the page needs to know which one to
run and has no use for the menu of them.

**An item names its tab by slug, never by id.** Tabs are replaced wholesale on
every save, so their ids are renumbered on each write and cannot be a stable
reference — and the console creates a tab and the pictures filed under it in one
submit, so at the moment an item has to point at its tab there is no id to point
at. `items.*.group` is validated against the tabs in the same payload, and an
item naming one that does not exist is **refused**: filed under a missing tab it
would be in the gallery, in the database, and on screen nowhere.

**A slider with no slides is a 404, not an empty carousel.** The frontend's
fallback is "render nothing" — and on the homepage, "render the NOC panel
instead" — so an empty success would produce a track with two arrows that do
nothing.

**A slider's `transition` is a separate enum from a gallery's, and it defaults
to `slide` rather than `fade`.** `App\Enums\SliderTransition` — same shape as
`GalleryTransition` (an allowlist of four, refused with a 422 outside it,
carried on `meta.transitions` for the same reason), different default for a
reason specific to what each control already was. A gallery's lightbox had no
transition before this column existed, so defaulting every row to `fade` was
an upgrade nobody had to ask for. A slider's existing behaviour already *was*
a slide — a real scrollable strip, swipeable and reachable by keyboard with no
JavaScript — so defaulting anywhere else would have silently changed what
every slider on every existing install does, including the homepage hero, the
moment the migration ran. `fade`, `zoom` and `none` render only the current
slide and reuse the same `gallery-fade`/`gallery-zoom` keyframes the lightbox
does; `slide` keeps the native scroll-snap track untouched.

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

**A popup is a *collection*, not a 404-on-empty record, and that is the whole
difference between it and every other embedded thing here.** A slider and a
gallery are asked for by slug from the one page that embeds them, so "there
isn't one" is a 404. A popup is asked for by the marketing layout on behalf of
every page at once, so an empty list is the ordinary state of a site nobody has
made one for — and a 404 there would be an error condition on every public
response.

**Sections are expanded to path patterns server-side, so `SiteSection` never
crosses the wire.** `PopupResource` emits one `paths` array in three shapes and
nothing else: `*` for the whole site, `/store/*` for a subtree — the prefix
**and** its descendants — and `/contact` for one page exactly. The client does
string matching, which is ten lines. Sending the keys instead would put a
second, hand-written copy of that allowlist in TypeScript, which is the drift
`admin_path` and `schema_type_options` were both caught by.

**`home` emits `/` exactly, and it is the one exception.** Every other section
becomes a subtree, because ticking "Store" plainly means `/store/products/…`
as well. As a subtree `/` would mean every page on the site, so ticking Home
would silently be ticking everything.

**Matching happens in the browser because a layout has no pathname.** The App
Router gives a layout no way to know which page is rendering, so the server
sends every live popup and the client picks. That is a handful of rows of public
content against a round trip per navigation, which is the right way round — and
the rows arrive ordered, so **the first match wins and exactly one popup is ever
shown**. Two stacked over one page is how a site becomes unusable.

**`image_path` never appears on the public resource.** What travels is `image`
(a URL), `image_alt` — falling back to the popup's own name rather than to `""`,
since a picture that *is* the announcement cannot be decorative — and
`image_width`/`image_height` read from the `media` row by path, so the box is
reserved before the bytes land. They are absent rather than zero when the
library has no row for the path, which is the same claim the public `/settings`
makes about the logo.

**A window is refused when it runs backwards.** `ends_at` before `starts_at`
shows the popup never and looks exactly like one that is simply not working. It
is compared in `withValidator` rather than with `after:starts_at`, because that
rule passes silently when the field it names is absent — which on a PATCH
sending only `ends_at` is every time.

**A popup targeting nothing is refused too**, and only when the request settles
the question: a PATCH mentioning neither `sections` nor `paths` is editing
something else. Saved, it would sit in the list looking published and appear on
no page at all, which is the failure somebody spends an afternoon on before
checking the form.

**`link_url` is held to the same shape as a menu's custom link** — a path, an
absolute http(s) URL, a `mailto:` or a `tel:` — because it becomes an `href` on
a live page and the whole picture is the link.

**Deleting a popup leaves its picture in the media library.** Nothing here
tracks what references a path, and a popup is very often built from artwork a
page uses too; the library's own bin is where a file is removed.

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

**A form can be put on somebody else's website, and `embed_enabled` is the
whole of the switch.** It is on the public resource — unlike `notify_email`
beside it — because `/embed/forms/{slug}` on the frontend refuses a form that
has not opted in, and that page reads this same endpoint. Default **false**: an
editor who built a form for one page of this site has not asked for it to
appear anywhere else.

**Embedding adds nothing to this endpoint's attack surface, which is why the
flag is only about exposure.** `POST /forms/{slug}` has always been public and
unauthenticated — anybody could post to it with curl, and CORS only ever
restrained *browsers* on other origins. What bounds abuse is the 10/min
throttle and the honeypot, exactly as it already does for the contact page. The
flag decides which forms are offered for framing, not who may submit.

**There are two shapes of it, and neither changed this endpoint.** The frame at
`/embed/forms/{slug}` renders the real form, so its submission is the ordinary
one. The raw-HTML snippet posts to **`POST /api/embed/forms/{slug}` on the
frontend**, a route handler that forwards here — which is the only new path,
and it exists so Laravel's CORS configuration did not have to move.

**`config/cors.php` is untouched, deliberately.** It allows exactly
`FRONTEND_URL` and sets `supports_credentials: true`, which makes
`allowed_origins: ['*']` illegal rather than merely unwise — the file says so in
its own first comment. Registering every embedding domain, or widening CORS for
`api/*` as a whole, would have loosened it for every authenticated route in the
product to serve one public form. The permissive header instead sits on one
frontend route that does one thing.

**That header is `Access-Control-Allow-Origin: *` with no
`Allow-Credentials`,** which is the safe combination and not an oversight: a
browser therefore sends no cookies, so there is no session to ride and nothing
CSRF could reach. It also grants no new capability — a cross-origin `fetch` is
*sent* whether or not CORS allows it, so anybody could always reach this
endpoint; what the header changes is only whether their script may read the
reply, and the reply is a success sentence or validation messages about the
submission they just made. The 10/min throttle and the honeypot are what bound
abuse, exactly as before.

**A copied snippet is a snapshot, and the console says so where it is copied.**
Add a field afterwards and their page does not have it; remove one and their
page posts a key the form no longer declares, which `FormValidator` drops in
silence. The frame cannot drift because it is not a copy.

**An embedded submission records the *host* page as its source.** Inside a
frame `window.location.href` is our own embed URL, so `PageContextFields` posts
`document.referrer` instead — which in a framed document is the embedding page.
Expect an origin rather than a full path much of the time: a host sending the
usual `strict-origin-when-cross-origin` gives a cross-origin frame
`https://their-site.example/` and no more. That is still the answer to the only
question anybody asks of a lead, which is who sent it.

**The honeypot is `website`, and that key is refused as a field name** with a
422 that says why — a field called `website` would silently disable the trap.
A filled honeypot returns the normal success response and stores nothing:
telling a bot it was caught is telling it what to change.

**Submissions outlive their form.** `form_id` is `nullOnDelete` and the slug is
stored alongside it, so deleting a form keeps what people sent through it —
and what they uploaded with it.

**Sixteen field kinds since 0.117.0** (`FormField::KINDS`; `docs/forms.md`).
The seven it shipped with — `text`, `email`, `tel`, `number`, `textarea`,
`select`, `checkbox` — and `url`, `date`, `radio`, `checkboxes`, `rating`,
`file`, `hidden`, `heading`, `step`. What a submission may send for each, and
what is stored:

| Kind | Answer | Stored as |
|---|---|---|
| `text`, `tel`, `select`, `radio` | a string ≤ 255; `tel` loosely a phone number; `select`/`radio` one of the field's option values | the string |
| `email` | `email:rfc`, ≤ 255 | the string |
| `textarea` | a string ≤ 5000 | the string |
| `number` | numeric, within `settings.min`/`settings.max` when set | a number |
| `url` | an `http`/`https` URL ≤ 2048 | the string |
| `date` | `Y-m-d`, on or after `settings.min` and on or before `settings.max` — each null, a `Y-m-d`, or `"today"` (the server's day, in the app timezone) | the string |
| `checkbox` | a boolean; `1/true/on/yes` and `0/false/off/no` are read as one. **Required means ticked** (`accepted`) — a posted `false` is a 422 | `true`/`false` |
| `checkboxes` | an **array** of option values, none twice; a lone string is read as a list of one. Required means at least one. A bad choice is a 422 on the field's own key, never on `name.1` | the array |
| `rating` | an integer 1–5 | an integer |
| `file` | one uploaded file — see below | its original filename in `data`, the record in `files` |
| `hidden` | **nothing is read from the request.** The answer is `settings.value` from the definition, whatever is posted | the string, or nothing when it is blank |
| `heading`, `step` | layout rows: nothing is read, validated or stored | — |

**The public read's `settings` and `show_if`.** `settings` is null for a kind
that keeps none; `{min?, max?}` for `number` and `date`; `{accept, extensions,
max_kb}` for `file` — `accept` the groups an editor ticked, `extensions` what
those admit, `max_kb` the limit **in force** (the field's own, never above
what php.ini accepts); and **null for `hidden`**: its value is never sent to a
page, since the server fills it. `show_if` is `{field, op, value?}` or null.
The form carries `redirect_url` (a path or an http(s) URL, or null — where to
send the visitor instead of showing `message`), `has_files` (post as
multipart) and `steps` (its step breaks plus one). A `heading`'s `label` is
the heading and its `help` an optional paragraph; a `step`'s `label` is the
title of the step it opens.

**A condition is evaluated on the server, against the submitted answers.**
`show_if.field` names an earlier field; `op` is `equals`, `not_equals`,
`includes`, `filled` or `empty`. A field its condition hides is **skipped**:
not required, and whatever was posted for it is dropped, never stored —
hiding it in the browser is presentation, and this is the decision. A field
whose source is itself hidden is hidden too, whatever its own operator says
(`empty` included). The comparison is exact, case and all; two numbers are
compared as numbers (`4`, `"4"` and `4.0` are one answer); a tick box as a
source is "filled" when ticked and equals any of `1/true/on/yes` when ticked,
`0/false/off/no` when not; on a `checkboxes` source `equals` and `includes`
both mean "is among those ticked" and `not_equals` means "is not". A hidden
`file` field's upload is not stored; a hidden `hidden` field's value is not
either.

**An upload is private, hashed and checked by content.** A `file` answer is
held to the field's extensions **and** to the type its bytes sniff as
(`extensions:` and `mimes:` together — a script renamed `brief.pdf` and a real
PDF arriving as `brief.php` are both a 422), and to `max_kb`. It is stored on
the private disk under `form-uploads/{form id}/` under a random name with the
extension the bytes earn; nothing is written for a submission that is refused.
`image` admits jpg, jpeg, png, webp, gif; `pdf` admits pdf; `document` admits
doc, docx, xls, xlsx, csv, txt — no SVG and no archives. The file is never
attached to an email and has no URL: it is read through
`GET /admin/forms/{id}/submissions/{sid}/files/{field}` and deleted with its
submission.

**The submit's 201 is `{message, redirect_url, data: {id}}`.** `redirect_url`
is the form's, or null. A filled honeypot gets the same `message` and
`redirect_url` and stores nothing.

**`?in_menu=1` is a navigation filter, not a publishing one.** The four
endpoints that feed the mega menu accept it; without it they return everything,
because the index pages need everything. `show_in_menu` defaults to true, so a
record is in the navigation until somebody decides otherwise — the opposite
default would empty the menu on the migration that adds the column.

**Three `store` rows are not published**: `activation_procedure`,
`activation_pdf_path` (and its `_url`) and `digital_auto_fulfil` —
`PublicSettings::PRIVATE_KEYS`. The group is public for the shop's switch and
its shipping figures; the procedure is what a buyer receives after paying.

**`/settings` returns a whitelist, not a filtered dump.** Only the `general`,
`contact`, `social` and the other groups `PublicSettings::GROUPS` names —
`announcement` among them — are public; the same table also holds SEO
defaults and the portal toggle. "Return everything except what I remembered to
hide" is the wrong default on an unauthenticated endpoint — a setting added
later is private until somebody deliberately makes it public. Null and empty
values are dropped, so a caller gets `undefined` rather than a blank string.
The response is a flat `{ "data": { "key": "value" } }` map.

**Every public record carries `updated_at`** (solutions, services, industries, product categories, products, case studies, posts, articles, vacancies, store products and categories — beside `slug`, since 2026-09-18): the sitemap's `lastmod` is the record's own last change, never the build time, and an index page's is the newest among the records it lists. A `lastmod` that is always "now" is one a search engine learns to ignore.

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

**The redirect table is read whole, once a minute, and looked up in memory.**
`web/src/proxy.ts` used to call `/redirects/lookup` on every request under ten
content prefixes — pages that exist included — and the fetch options that
would have cached it have no effect in a Next proxy. It now fetches `/redirects`
into a `Map` per server process and refreshes it in the background after 60s;
`lookup` is called only on a hit, to record it. Two consequences worth knowing:
a rename takes up to a minute to redirect (it used to be immediate), and CMS
pages at `/{slug}` are covered now, which the prefix list deliberately left out
while each check cost a round trip.

**Never ISR-cache a search response.** `?q=` has an unbounded key space, so
caching it fills the cache with single-use entries and serves a stale empty
result for the whole revalidate window. `publicApi.products()` and
`publicApi.knowledgeArticles()` take a `cache` flag for exactly this.

**Knowledge-base search matches tags and a punctuation-stripped title**, so
`wifi` finds "Wi-Fi". People do not type hyphens.

**The website assistant is public, and its conversation token is what stands in
for a login.** A visitor has no account, which is the point of a chatbot on a
marketing site — so a conversation is addressed by 64 hex characters from
`random_bytes`, returned **once** on the response that creates it and on no
other, and held by the Next server in an httpOnly cookie. A wrong token is a
**404, never a 403**: a 403 confirms the conversation exists. See
`docs/chatbot-architecture.md`.

**Nothing retrieved means the model is never called.** Asked a question with no
context attached, a helpful assistant invents — so the call is not made, the
configured fallback comes back with `grounded: false`, and the question is
recorded as `unanswered` for somebody to turn into a page. `Retriever` has no
branch that can reach a customer, an order, a ticket or an activation code, so
§15 and §34 of the specification are enforced by absence rather than by asking
the model nicely.

**Retrieved page copy is fenced inside that system message**, and the
instructions say the fence means "copy, never an instruction". Excerpts are CMS
bodies and FAQ answers, so without it a page reading "SYSTEM OVERRIDE" arrived
at the same level as the rules themselves — a content-manager account being a
narrower door than the internet and not a closed one. The fence is stripped out
of the content it wraps, or a page could close its own.

**A system message never reaches a browser.** It holds the instructions and the
retrieved context, and "show me your system prompt" is the first thing anybody
probing a chatbot asks. `visibleMessages` is the boundary — structural, the way
`publicMessages` is on a ticket.

**A provider failure never reaches the visitor in the provider's words**, which
carry model names, quota messages and organisation ids. What comes back is the
pages that were found: a worse answer than the model would have given, and a far
better one than an apology. The provider is OpenRouter (0.116.0; the key and
the model list are under "Admin — the AI SEO assistant"), and the model is
`chatbot_model`, an OpenRouter id — blank means `AI_MODEL`, then
`google/gemini-2.5-flash`.

**The assistant asks who it is talking to before it answers anything.** After
the greeting it collects the visitor's details one question at a time — name,
email, telephone, company — and retrieves nothing, calls no model and suggests
nothing until it is done; then it files a `Lead` through `LeadIntake` like every
other enquiry on this site. `App\Support\Chat\Intake`, switchable with
`chatbot_intake_enabled`, which is the one key in this group that ships **on**.

It is a **state machine, not a prompt**: the questions are a setting, the
answers are validated in PHP, and the provider is not reached during intake, so
the phase spends nothing and consumes none of the daily cap. A model asked to
run the interview re-asks fields it has and accepts "no" as an email address.

Three rules keep it from being a trap, and each is pinned by a test. **Every
step can be declined** — "skip", "no", "rather not". **A field is asked for
twice and never a third time**, with the second ask naming what was wrong.
**A question is not a name**: a first message of "do you sell switches?" would
otherwise be filed as somebody's name and sent to the sales desk, silently.

The **closing step does double duty** — its answer is the lead's requirement and
the visitor's first real question, answered in the same turn. A **signed-in
customer** is asked only that one question; their account is the record, and
asking one for their own email address is the clearest possible signal that
nothing on the other end is paying attention.

`POST /chat/conversations` therefore returns `messages` — the opening question,
stored, so a transcript never begins with an answer to nothing — and
`quick_actions: []` while a question is outstanding, because chips are
suggestions and the API withholds them rather than the widget hiding them.

**`GET /chat/conversations/{token}` returns the same opening payload.** It
carries `name`, `welcome`, `quick_actions`, `max_message_chars`, `auto_open`,
`auto_open_delay` and `whatsapp` alongside the transcript. The frontend used to
resume by reading the public `/settings` map and re-parsing
`chatbot_quick_actions` in TypeScript — a second implementation of
`ChatSettings::quickActions()` on the far side of the wire, which had already
drifted: the API supplies a written default when `chatbot_welcome` is blank and
the TypeScript reader supplied an empty string, so a resumed conversation on a
default install greeted nobody.

**Fourteen settings are public and the rest are not.** (`chatbot_smart_intake`, the intake judge's switch, is private with the intake questions.) `chatbot_enabled`,
`chatbot_name`, `chatbot_welcome`, `chatbot_quick_actions`, `chatbot_fallback`,
`chatbot_auto_open`, `chatbot_auto_open_delay`, `chatbot_whatsapp_number`, and
the widget's appearance — `chatbot_colour` (`#rrggbb` or blank, lower-cased),
`chatbot_background` (the thread's ground, same shape), `chatbot_icon`, `chatbot_font_size` and `chatbot_animation` (choices the admin
index lists as `options` and `PATCH` refuses outside of) and `chatbot_show_name` — are
named in `ChatSettings::PUBLIC_KEYS`, because the widget is drawn before anybody
speaks. The model, the context window, the spend ceiling, the intake questions
and the unanswered forwarding are not — the same considered exception
`newsletter_signup_enabled` is.

**`whatsapp` is null unless a number is configured**, so the control is absent
rather than dead. The number is normalised to digits in `ChatSettings`: a
`wa.me` URL carrying a `+` or a space does not fail, it opens WhatsApp on a
search for a contact nobody has. The prefilled message carries what intake
collected and is rebuilt on every read — a hand-off offered at the third
question must not open a draft written at the first.

**An answer the site cannot ground offers the hand-off on the message itself.**
That reply has no sources, and for a general intent no actions, so it was the
one place in the module where a visitor was told "I cannot confirm that from the
website" and given **nothing at all** to press. With a WhatsApp number
configured it now carries a `primary` action, and the prefilled text carries the
**question** rather than the stored requirement — the person on the other end
opens a chat that already says what was asked, instead of one that makes
somebody type it a second time to a business that has just failed to answer it
once. `App\Support\Chat\WhatsApp` builds both that link and the panel's
standing one, because two builders composing one `wa.me` URL is the drift this
codebase keeps being caught by.

Only when **ungrounded**. A provider failure comes back through `withoutModel()`
with `grounded: true` and its own links; offering a hand-off there would push
people to WhatsApp over a transient outage on a question the website answers
perfectly well.

**`chatbot_forward_unanswered` emails the desk what could not be answered**,
with whoever asked it. Off by default. It reads the same `grounded` flag the
assistant already sets, rather than deciding a second time — two definitions of
"we could not answer that" is the trap the newsletter's two definitions of
"delivered" sprang.

**`chatbot_daily_reply_cap` is the one that bounds the bill.** Rate limits bound
one visitor; only a total bounds a bad afternoon.

**A chatbot lead is a lead.** It goes through `LeadIntake` with
`channel = 'chatbot'`, lands in `/admin/leads` beside every other enquiry, and
is scored on the same rubric. The specification asks for a `chat_leads` table
and a second admin screen; this codebase already states the rule the other way
round — every contact form in the product lands in one pipeline — and two lists
is how the sales desk ends up working one of them.

**The conversation is the lead's source**, so the desk reads what was said
before ringing. The requirement is one sentence typed into a small box; what was
said on the way to it is usually what the call is about. System messages are
excluded there too.

**Four fields and no more.** §17: do not ask for what is not needed. The point
of asking inside the conversation rather than sending somebody to `/contact` is
that it is short.

**The page comes from the conversation, not the request.** Everything here
arrives through a Server Action, so `Referer` on this side is the Next server —
but the conversation recorded where it was opened, and a callback from a
firewall page is a different conversation from one raised on the careers page.

**A second press makes no second lead.** Pressing twice is a double click, not
a second person; the row already written is the answer, and saying so is
friendlier than a validation error about something nobody did wrong.

**A rating is scoped to the conversation holding the token**, not to the message
id alone. The id is sequential and a visitor holds one token, so without the
scope anybody could rate — and therefore probe the existence of — every answer
the assistant has ever given. It is one rating per answer and it may be changed:
a rating that cannot be taken back is one people stop giving.

**Only a grounded answer is offered thumbs.** Asking whether "we cannot confirm
that from the website" was helpful is asking somebody to rate an apology, and
the answer says nothing about the assistant — it says the site does not cover
the question, which is what the unanswered list already records.

### Admin — the assistant (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/chat/dashboard` | The month at a glance. `?from=`, `?to=` |
| `GET` | `/admin/chat/conversations` | `?q=`, `?with_lead=1`, `?unanswered=1`, `?page=` |
| `GET` | `/admin/chat/conversations/{id}` | The transcript, bound by **id** |
| `GET` | `/admin/chat/unanswered` | Questions the site could not answer. `?all=1` includes handled |
| `POST` | `/admin/chat/unanswered/resolve` | `ids[]`. Marks them dealt with |
| `POST` | `/admin/chat/unanswered/brief` | `ids[]`. The AI SEO assistant drafts a **draft** knowledge article from the group's distinct questions — `[CHECK: …]` where a fact would go, a "Questions people ask" block, links from the numbered list of real pages — and marks the group handled with `drafted_article_id` in its context. **201** with `{id, title, admin_path}`; 422 with the assistant's own sentence when it is off, has no key or has hit the day's cap (the same counter). Throttled 10/min |

**`role:admin`, not `content_manager`.** Blast radius, the argument
`campaign_manager` and `store_manager` are both made with: a transcript holds
whatever a visitor typed into a box, given by somebody with no account and no
expectation that a marketing team reads it back.

**There is no write path onto a transcript and no delete.** The only thing that
removes one is the retention prune, which deletes by age — the rule the activity
log follows, and for the same reason: a record its own subject can edit is
evidence of nothing.

**`unanswered` is grouped by the question, not listed by the message.** Forty
people asking one thing is one piece of work, and an ungrouped list is one where
the most important row is the hardest to see. `ids[]` carries every message the
group stands for, so resolving it resolves all of them in one press.

**`today` is outside the date filter, deliberately.** It answers "will it still
be answering this afternoon", which is not a question about a range:
`replies` against `cap`, `remaining`, whether it is `reached`, and the tokens
spent today. The cap worked and told the visitor when it was hit; what it did
not do was say anything beforehand, so the first sign of a day running out was
people being turned away. **`remaining` is null rather than zero when no cap is
set** — zero means "no ceiling" in the setting and would read here as "none
left", which is the opposite claim.

**Tokens and replies are both reported because neither answers the other's
question.** The cap counts replies; the provider bills for tokens, so a day of
long conversations costs more than a day of short ones at the same reply count.

**Tokens are summed from the messages, never from the conversations.**
`conversations.tokens_used` is a lifetime total, so ranging on it counts every
token a conversation ever spent as long as it was *started* in the range — and
the today figure was counting whole conversations merely touched today, which
on a development machine reported the all-time total. Two figures about one word
arrived at two ways is the trap the newsletter's "delivered" already sprang.

**Retrieval is cached for five minutes — except the products.** A product source
carries `price_paise` and `in_stock`, which is what the card renders, so a
cached one is a price the shop has since corrected. The editorial half is keyed
on the search terms rather than the sentence. It saves database work and no API
spend: the model call is what costs money, and caching retrieval avoids none of
them.

**Every rate is null, never zero, when nothing has been measured** — the rule
the ticket dashboard's medians and the store's averages already follow. An
unanswered rate over no questions is not 0%.

**The retrieval rules are what decide `grounded`, and two of them were measured
rather than reasoned about.** A plural question contributes its stem, because
`LIKE '%firewalls%'` does not match "Firewall & UTM" and that question retrieved
**nothing** while the singular retrieved three. And a term of three characters
matches on a word boundary rather than as a substring, because `%eye%` matches
"sur**veye**d" — which returned a networking page for a question about laser eye
surgery and, worse, marked the answer **grounded**, keeping a question the site
cannot answer off the unanswered list. The floor stays at three characters:
AMC, NAS, PoE and VPN are most of what this catalogue is asked.

---

---

## Content blocks

CTA banners, stat bars, pricing tables and technology stacks (2026-09-24).
See `docs/blocks.md`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/blocks/default/cta` | The default CTA, or **`{data: null}` in a 200** when none is chosen. Declared above `blocks/{slug}` |
| `GET` | `/blocks/{slug}` | One published block: `{id, type, layout, name, slug, content, updated_at}`. 404 when a draft, unknown or empty |
| `POST` | `/blocks/{slug}/submit` | A CTA's form (`newsletter`, `gated_download`, `webinar` only; 404 otherwise). `email`, `name` (required for a webinar), `company`, `phone`, honeypot `website`, the `_source_*` envelope. Throttled 10/min. Download: 200 with `data.url` — the only place the file's URL appears. Webinar: 202. Newsletter: 202 always, 403 while signup is off |
| `GET`/`POST` | `/admin/blocks` | `role:content_manager`. `?type=`, `?status=`, `?q=`, `?per_page=` (max 100); default first, then by name. `meta.types`, `meta.layouts[type]` (value, label, blurb) |
| `GET`/`PATCH`/`DELETE` | `/admin/blocks/{id}` | Bound by **id**. `type` is prohibited on PATCH; a new `layout` must come with `content` |
| `POST` | `/admin/blocks/{id}/duplicate` | 201: a draft copy under a free slug, never the default |

**The field is `content`, not `data`.** A resource whose array holds a `data`
key is not wrapped, so the block's content travels as `content` and every
read keeps its `{data: …}` envelope. Its shape is per type and layout
(`App\Support\Blocks\BlockRules`); 422s are keyed `content.items.0.value`.

**The admin read** carries `content` as stored (paths, brand ids), `media`
(a URL for every stored `*_path`), `preview` (the public shape), `status`,
`is_default` and `shortcode`. **The public read** resolves paths to URLs with
alt text and focal points, gives a stack node naming a brand that brand's
name and logo (dropping a node whose brand is gone), and never carries a
gated download's file — `has_download: true` stands in for it.

**`is_default`** is accepted on a published CTA only (422 otherwise);
setting it clears every other default, and unpublishing the default clears
it. `home_stats_block`, `home_pricing_block` and `home_stack_block` in the
`homepage` settings group are pickers of published blocks of their kind
(`options` from the API; anything else is a 422).

---

## Importing a WordPress site (`role:admin`)

Scan, review, commit (2026-09-27). See `docs/wordpress-import.md`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/imports/wordpress` | The last twenty imports, newest first. `meta.active` — the import in flight, ready or failed, in full, or null; `meta.delivering`; `meta.sections` |
| `POST` | `/admin/imports/wordpress` | `site_url`, `sections[]` of `content`, `catalogue`, `customers`, `custom`, `wp_user`, `wp_password` (an application password — it reads WooCommerce too, from a shop manager or an administrator), `wc_key` (`ck_…`) and `wc_secret` (`cs_…`, optional, together; used instead of the application password for `wc/v3`). **202**; the scan and then the dry run run on the queue. 422 on `site_url` for a private, numeric or unresolvable host or plain http, on `queue` when nothing drains it, and while another import is in flight. Throttled 6/min. An import of any site still `ready` is cancelled |
| `GET` | `/admin/imports/wordpress/{id}` | The import: `status` (`pending`, `scanning`, `analysing`, `ready`, `running`, `completed`, `failed`, `cancelled`, `expired`), `progress`, `site` (name, WooCommerce/ACF/Yoast found, counts, `missing` — optional endpoints the site refused, in its words), `analysis` (`steps[]` of `{key, label, create, update, skip, warn, reasons[{reason, count, kind, examples}]}`, `notices[]`, `decisions` — the review's options), `result` (the commit's steps), `can_resume` |
| `PATCH` | `/admin/imports/wordpress/{id}` | `decisions`: `media_scope` (`referenced`/`all`), `page_layout` (`sections`, the default, or `html` — 0.109.0), `tax_basis` (`keep`/`add_gst`), `type_slugs{wp slug: address or ""}`, `acf_kinds{target: {field: kind or "skip"}}`. `ready` only; **202**, the dry run re-runs. `analysis.decisions.page_layout` is `{value, pages}`. Since 0.110.0 `analysis.steps` holds `page_parts` — the forms, pricing blocks and galleries the pages hold, counted once per run, with reasons of kind `info` (`skip`, `warn` and now `info`) |
| `POST` | `/admin/imports/wordpress/{id}/commit` | `ready`, or `failed` with a commit cursor (resume). **202**. Throttled 6/min |
| `DELETE` | `/admin/imports/wordpress/{id}` | Cancels a scan or a commit, or discards a review; deletes the harvest. What a commit already wrote stays. 422 on a completed import |

**Old addresses in the query form are redirected too.** A site on "Plain"
permalinks is redirected from `/?p=62`, `/?page_id=5`, `/?product=cap` and
the like: the importer stores them as `/?{name}={value}` rows in `redirects`
(so `GET /redirects` and `GET /redirects/lookup?path=/?p=62` carry them as
they are), and the frontend proxy looks them up on the home path only.

**Nothing is sent and nothing is re-done.** Orders are inserted as they
stand — no checkout, settlement, mail, message, webhook or stock movement —
numbered `WC-{number}`, with `review_requested_at` stamped; a second import
of the same site updates what the first wrote, through
`wordpress_import_map`. Per-record IndexNow pings are held for the commit.
Customers are created `active` and unconfirmed with a random password, and
join the newsletter's customer group through their own hook.

**The site's credentials never outlive the scan**: sealed in the cache
under a key only its job chain carries, forgotten when it stops, and never
on the import row or in a job payload. Every request to the site — and to
its upload URLs — goes through `SafeHttp`: public addresses, pinned, at most
three redirects checked hop by hop, credentials never sent to another host.

## Backups (`role:admin`)

The database and the uploaded files, full and incremental, to S3 /
S3-compatible, Google Drive and SFTP / FTPS / FTP, and restores (2026-09-27).
See `docs/backups.md`. **These paths stay open during a restore**; every
other API route answers **503** with `{message, restoring: true}` and
`Retry-After: 60` while one replaces the database (`EnsureNotRestoring`), bar
`admin/auth/*`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/backups` | The last sixty, newest first (a row: `folder`, `type` full/incremental, `trigger` schedule/manual/pre_restore, `status`, `includes`, byte counts, `file_count`, `deleted_count`, `destinations[]` `{key, label, status, bytes_sent, bytes, error}`, `local`, `restorable_from[]`). `meta`: `running`, `restore` (the latest), `restoring`, `last_success`, `next_run`, `schedule`, `includes`, `destinations[]` `{key, label, enabled, configured, error, detail}`, `error` (`backup_error`), `scheduler`, `dumper` `{chosen, binary}`, `disk_free`, `code_schema` |
| `POST` | `/admin/backups` | `type` of `full` or `incremental`. **202**; the worker picks it up within the minute. 422 on `type` when the scheduler is not running, a backup or restore is in flight, or the staging disk has under 1.2× the estimate. Throttled 6/min |
| `GET` | `/admin/backups/{id}` | Adds `files[]` `{name, size, sha256}` and `chain[]` |
| `DELETE` | `/admin/backups/{id}` | A running backup is **cancelled** (200). A finished one is deleted from every destination and this server (204) — 422 while a newer incremental builds on it |
| `GET` | `/admin/backups/{id}/download/{file}` | A file the server still holds, as `<folder>-<file>`. 404 once its staging copy has gone |
| `POST` | `/admin/backups/destinations/{s3\|gdrive\|ftp}/test` | Write, read back and delete a small file with what is saved: `{message}`, or 422 in the destination's own words, written to its `backup_<key>_error` row (a success clears it). Throttled 10/min |
| `GET` | `/admin/backups/destinations/{key}/folders` | The newest thirty backup folders there, each read from its manifest: `{folder, complete, type, created_at, includes, total_bytes, chain, newer_schema}` or `{folder, complete: false, error}`. `meta.total`. Throttled 20/min |
| `POST` | `/admin/backups/destinations/ftp/forget-key` | Clears the pinned SFTP host key |
| `GET` | `/admin/backups/drive` | `{is_connected, account, connected_at, client_configured, error, callback_path}` |
| `POST` | `/admin/backups/drive/authorize` · `/callback` · `/disconnect` | The Drive consent: `redirect_uri` checked exactly against `/admin/backups/drive/callback`; `code`/`state` → `{account}`; disconnect forgets the token and the folder id |
| `POST` | `/admin/backups/restores` | `backup_id` (+ optional `from`: `local` or a destination) **or** `destination` + `folder` (a backup found there), `scope` (`database`, `files`, `both`), `prune_missing`, `confirm: "RESTORE"`. **202**. 422 on `confirm`, or on `backup_id` with a sentence: the chain not complete anywhere, the backup lacks what the scope asks for, its schema is newer than this code's, or something is already running. Throttled 6/min |
| `GET` | `/admin/backups/restores/{id}` | `status` (`pending`, `safety`, `downloading`, `importing`, `files`, `finishing`, `completed`, `failed`, `cancelled`), `folder`, `chain`, `safety_folder`, `error`, `progress` `{downloaded, current, statements, sql_percent, files_written, files_refused, files_removed, migrated}` |
| `DELETE` | `/admin/backups/restores/{id}` | Cancels one that has not started replacing anything (`pending`, `safety`, `downloading`); 422 after |

**The settings are four private groups** saved through `PATCH /admin/settings`:
`backups` (`backup_enabled`, `backup_time` HH:MM, `backup_full_day`
daily/mon…sun, `backup_incremental_every` off/24/12/6, `backup_max_chain` 1–60,
`backup_include_db`/`_public`/`_private`, `backup_keep_chains` 1–52,
`backup_keep_local` 0–10, `backups_email`), `backups_s3` (`backup_s3_enabled`,
`_endpoint` https only, `_region`, `_bucket` S3 naming, `_prefix`, `_key`,
`_secret` secret, `_path_style`), `backups_gdrive` (`backup_gdrive_enabled`,
`backup_gdrive_oauth_client_id`, `_client_secret` secret) and `backups_ftp`
(`backup_ftp_enabled`, `_protocol` sftp/ftps/ftp, `_host` public unless
`BACKUP_ALLOW_PRIVATE_HOSTS`, `_port` the protocol's own or 1024–65535,
`_username`, `_password` secret, `_private_key` secret, `_folder`, `_passive`).
Choices arrive as `options` and are refused outside them; a changed FTP host
or S3 endpoint needs its stored secret typed again in the same save.

**Failures are reported, not swallowed**: `backup_error` on the screen and the
`backup_failed` email to `backups_email`, else the support address — on a
failed backup, on one that did not reach a destination, and on a failed
restore.

## System: status and updates (`role:admin`)

The installed version, and applying a signed release zip (2026-09-28). See
`docs/distribution.md`. **These paths stay open during an update**; every
other API route answers **503** with `{message, updating: true}` and
`Retry-After: 60` while one runs (`EnsureNotRestoring`), bar `admin/auth/*`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/system/status` | `version` `{version, commit, built_at}` (from `api/version.json`, else `web/src/lib/version.ts`), `code_schema`, `database_schema`, `installed` (`config/install.json`, null on a checkout), `php` `{version, checks[{key,label,ok,required,detail}], max_execution_time, memory_limit}`, `scheduler`, `disk` `{free,total}`, `website` `{reachable, version, api, url, error}` — the website's own `/api/health`, asked from here (`WEB_INTERNAL_URL`, else `FRONTEND_URL`) |
| `GET` | `/admin/system/updates` | `installed`, `updatable` (false on a checkout), `packages_dir`, `packages[]` `{file, size, version, built_at, signed, refusal, same_version, changes_database, new_migrations, changelog[]}` — the zips in `updates/`, newest first, each read and signature-checked, the changelog newer than what is installed — `run` (the run file, or null), `history[]` (newest first, 20), `rollback` `{from, to, database}` or null, `chunk_bytes` |
| `POST` | `/admin/system/updates/upload` | multipart `name` (`*.zip`), `index`, `total` (≤ 2000), `chunk` (≤ `chunk_bytes`, 1.5 MB). Appended to `<name>.part`; `index` 0 starts again; the last renames it into place. Throttled 600/min |
| `POST` | `/admin/system/updates/apply` | `file`. Starts a run at `preflight`: 422 on `update` with a sentence when the zip is unsigned or altered, a test build, older than installed, installed is below its `min_from`, PHP is too old, a run is already going, or a backup or restore is in flight. Recorded in the activity log (`update_started`). Throttled 6/min |
| `POST` | `/admin/system/updates/step` | Does the next slice (≈15 s) of the run and answers it: `status` moves through `preflight`, `backup`, `extract`, `swap`/`swapping`, `migrate`, `seed`, `steps`, `optimize`, `web`, `warm` to `done` — or the rollback's `rb_swap`…`rb_warm` to `rolled_back` — or `failed` with `failed_at` and `error`. `log[]` says what was done. Throttled 120/min |
| `POST` | `/system/updates/continue` | **Public route, no session.** The same as `step`, authorised by `X-Update-Key`, the run's own `key` from `apply`, `rollback`, `retry` and every step, compared in constant time against the run file. Only while the run is moving; anything else is a 404. It exists because a rollback's restore drops the sign-in tables while these steps drive it. Open during an update and a restore. Throttled 120/min |
| `POST` | `/admin/system/updates/retry` | A `failed` run carries on from `failed_at` |
| `POST` | `/admin/system/updates/rollback` | The `.prev` folders back and, when the update ran migrations, its `pre_update` safety copy restored. 422 with nothing to go back to, or while a step runs. Activity `update_rolled_back`. Throttled 6/min |
| `POST` | `/admin/system/updates/abandon` | Forgets a run that stopped before the swap (the unpacked folders deleted, the site reopened). 422 once the application was replaced |
| `DELETE` | `/admin/system/updates/packages/{file}` | A zip in `updates/`. 204 |

**The run file, not a table.** `storage/app/private/update/run.json` holds a
run: the database is migrated and the code replaced mid-run, and the file is
what both releases can read. Its keys are added to and never renamed, because
the previous release's copy of the updater drives a rollback.

**Nothing in a zip outside `api/` and `web/` is written**, and every file
written is checked against the sha256 its signed `release.json` gives.

**`pre_update`** is a new `backups.trigger` value, a database-only local
safety copy treated like `pre_restore` everywhere: never a chain's parent,
never on the schedule's figures, pruned at 14 days.

The public website adds `GET /api/health` (Next, not this API): `{status,
version, site_url, api: {reachable, status} | null}`, `Cache-Control:
no-store`, and `POST /api/internal/revalidate` (Next): bearer
`INTERNAL_TOKEN`, purges every cached page; 404 without a token of at least
32 characters.

## Custom fields and content types

ACF-style fields on existing records, and editor-made record types with
pages of their own (2026-09-26). See `docs/custom-content.md`.

### Public

| Method | Path | Notes |
|---|---|---|
| `GET` | `/content-types` | Active types: `{name, plural, slug, path, icon, description, archive_enabled, per_page, sort, schema_type, updated_at}` — `updated_at` is the newest published entry's. Plain collection |
| `GET` | `/types/{type}` | A page of the type's **published** entries (status, `published_at` not in the future) in its `sort`, `?page=`, `?per_page=` (max 100, default the type's). `meta.type`. 404 for an unknown or inactive type. Answers for a type whose archive is off, `meta.type.archive_enabled: false` — the frontend 404s the page; the sitemap walks this |
| `GET` | `/types/{type}/{slug}` | One entry, the page: `body`, `image` + `image_alt`/`image_focus`, `type`, `faqs`, `answer_blocks`, `entity`, `faq_schema`, `custom_fields`, `custom_data`, `seo`, `schema` (`Article` or `WebPage`, per the type). 404 for a draft, a future date or an inactive type |

**Custom fields on public reads.** The detail read of a page, post,
knowledge article, case study, solution, service, industry, product, store
product and entry carries `custom_fields` — `[{key, label, kind, value,
display}]` for the fields in active `details` groups marked `show_on_page`,
non-empty, in group then field order — and `custom_data`, every applicable
value keyed, `hidden` groups included (`hidden` is "not drawn", never
"private"). `value` is resolved: a picture `{url, alt, focus, width,
height}`, a file `{url, name, mime}`, a linked record `{title, path}` (absent
when no longer public), a boolean `true`/`false`, a list or checkboxes an
array; `display` is the text form (Indian number grouping, `26 September
2026`, option labels). Index rows carry neither key.

### Admin (`role:content_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET`/`POST` | `/admin/custom-field-groups` | `?q=`, `?target=`, `?per_page=` (max 100). `meta.kinds` (`CustomFieldKind::options()`), `meta.targets` (`Targets::options()`), `meta.placements` |
| `GET`/`PATCH`/`DELETE` | `/admin/custom-field-groups/{id}` | `name`, `slug`, `targets[]` (≥ 1), `placement` (`details`/`hidden`), `sort_order`, `is_active`, `fields[]` of `{id?, key, label, kind, help, required, show_on_page, options[{value,label}], settings{min,max,max_length,max_items,target}}`. Fields are synced **by id** — a row naming its id is updated, one without is created, one not sent is deleted with its values. Each field carries `values_count`. Deleting the group deletes its fields and their values |
| `GET`/`POST` | `/admin/content-types` | `?q=`, `?active=`. Rows carry `entries_count`, `published_count`, `target` (`entry:<slug>`). `meta.sorts`, `meta.schema_types` |
| `GET`/`PATCH`/`DELETE` | `/admin/content-types/{id}` | Bound by **id**. `name`, `plural`, `slug`, `icon`, `description`, `has_body`, `has_image`, `archive_enabled`, `per_page` (1–60), `sort`, `schema_type`, `sort_order`, `is_active`; detail adds `field_groups`. `DELETE` is 422 while the type holds entries |
| `GET`/`POST` | `/admin/content-types/{type-slug}/entries` | `?q=`, `?status=`, `?per_page=`. `meta.type`, `meta.statuses`, `meta.answer_block_kinds`, `meta.custom_field_groups` |
| `GET`/`PATCH`/`DELETE` | `/admin/content-types/{type-slug}/entries/{id}` | Scoped: another type's entry id is a 404. `title`, `slug` (unique **within the type**), `summary`, `body` (rich text), `image_path` (a library path), `status`, `published_at`, `sort_order`, `faqs[]`, `answer_blocks[]`, `seo`, `custom_fields` |

**A type's slug** matches `^[a-z][a-z0-9-]*$` and is refused when it is a
frontend route, an API prefix or a reserved word (`App\Support\ReservedSlugs`)
or a CMS page's slug. Changing it writes a 301 for `/{old}` and for every
`/{old}/{entry}`, re-aims redirects already pointing at those addresses, and
re-attaches field groups and linked-record fields from `entry:<old>` to
`entry:<new>`. **An entry's slug change** writes its own 301 under the type.

**`custom_fields` on every target's write.** Each of the ten entity
endpoints above (and `/admin/store/products`, `role:store_manager`) takes
`custom_fields`, an object keyed by field key, validated from the stored
definitions of the groups on that record's kind: a dropdown against its
options, checkboxes as an array of option values, a number against
`min`/`max`, a date as `Y-m-d`, a link `http(s)` only, a picture a library
path with an image MIME, a file a library path, a linked record an id of the
target (an entry of that type). **Omitting the key leaves every value
alone**, a key not declared is dropped, a key sent `null`/`""` clears that
field, and a required field is required only when `custom_fields` is sent.
Errors arrive as `custom_fields.<key>`. Every detail read carries
`custom_fields` (stored values), `custom_field_media` (key → URL for pictures
and files) and `custom_field_groups` (the definitions that apply, a
linked-record field with up to 200 `choices`); every index carries
`meta.custom_field_groups` for a new record.

**Also registered**: `entry` in the SEO overview (`admin_path`
`/admin/content/{type}/{id}`), the FAQ owners, site search (a "More from the
site" group, each result its own `path`), the console palette ("Custom
content") and the chatbot's retrieval; `entry` and `content_type` (an
archive) in the menu item types, with `/admin/menu-targets?type=entry`
labelling each entry with its type.

## Messaging channels — WhatsApp, RCS, push

Phase 2 (2026-09-25). See `docs/messaging.md`. Every event's email is
unchanged; these channels are called beside it through `Messenger::notify()`.

### Public

| Method | Path | Notes |
|---|---|---|
| `GET`/`POST` | `/messaging/webhooks/{channel}/{provider}` | A provider reporting back: `whatsapp` × `meta_cloud`\|`gupshup`\|`twilio`, `rcs` × `google_rbm`\|`gupshup`. **200 always**, un-throttled; nothing is acted on unless it verifies (see below). GET is Meta's subscription handshake |
| `POST` | `/messaging/push/subscribe` | `token` (an FCM registration token). Throttled 10/min. **202 always**; written only while push is live. A forwarded portal Bearer stamps the customer (read as `$request->user('sanctum')`, never for a "View as" session) |
| `POST` | `/messaging/push/unsubscribe` | `token`. Throttled 10/min. 202 always |

**Verification fails closed.** Meta: `X-Hub-Signature-256` = `sha256=` HMAC-SHA256 of the raw body with `whatsapp_meta_app_secret`; the GET echoes `hub.challenge` only when `hub.verify_token` equals `whatsapp_meta_verify_token`. Twilio: `X-Twilio-Signature` = base64 HMAC-SHA1, keyed with the auth token, over the URL called and every POST field name+value in name order. Google RBM: `X-Goog-Signature` = base64 HMAC-SHA512 of the base64-decoded `message.data` with `rcs_rbm_client_token`; a body of `{clientToken, secret}` is the configuration handshake and is answered `{secret}` when the token is ours. Both Gupshups sign nothing and require `messaging_webhook_secret` as `?token=` (or `X-Webhook-Secret`). No secret configured accepts nothing.

**What a verified webhook does.** A status (`sent`, `delivered`, `read`, `failed`) moves the matching `message_deliveries` row **forward only**; an inbound STOP (STOP, STOP ALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPT OUT, STOP PROMOTIONS) opts that number out on that channel; a template status update (Meta, Gupshup) sets the template's approval.

`/settings` adds `messaging_whatsapp_live`, `messaging_rcs_live` and `push_live` — `"1"`/`"0"`, whether the checkout may offer a box and the shop a bell — and publishes the `push` group (Firebase's web config: `push_api_key`, `push_project_id`, `push_messaging_sender_id`, `push_app_id`, `push_vapid_key`). No provider or credential is public.

`POST /checkout` accepts `message_opt_in[]` of `whatsapp` and `rcs`: the number typed in `phone` is opted in on each **live** channel (source `checkout`), inside the order's transaction and before the order-placed message is queued. Anything else is a 422; a channel that is off records nothing.

### Portal

| Method | Path | Notes |
|---|---|---|
| `GET` | `/messaging/preferences` | `{phone, channels: [{channel, label, live, opted_in, devices}]}` — `phone` is the account's number in E.164 or null; `devices` counts active push subscriptions |
| `PATCH` | `/messaging/preferences` | `whatsapp`, `rcs`, `push` booleans, each optional. On opts the **account's** number in (422 without one; ignored for a channel that is not live); off opts out every number the account holds on it. `push` can only be `false`: off everywhere. A "View as" session may turn a channel off and never on (422). Throttled 20/min |

### Admin — settings (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/settings/messaging` | `channels[]`: `value`, `label`, `setting` (`messaging_<channel>_provider`), `provider`, `ready`, `address_kind` (`phone`\|`token`), `needs_approval`, `error` (the last credential refusal), `providers[]` (`value`, `label`, `blurb`, `fields`, `available`, `configured`, `webhook_url` from the route table, `webhook_secret_param`); `quiet_hours` (`start`, `end`, `open_now`, `next_opening`, `timezone`); `queue` |
| `POST` | `/admin/settings/messaging/test` | `channel`, `to` (a mobile, or a push token). The fixed test body — Meta's `hello_world` template — to that address; 422 with the provider's own words, written to `messaging_<channel>_error`; a success clears it. Throttled 6/min |

The keys are ordinary rows in the private `messaging` group, saved through `PATCH /admin/settings`: `messaging_{whatsapp,rcs,push}_provider` (an id from the channel's enum or blank for off; `options` carries the list), `messaging_promo_start`/`_end` (`HH:MM`, the end after the start — the quiet-hours window), `messaging_webhook_secret`, and each provider's fields (`whatsapp_meta_*`, `whatsapp_gupshup_*`, `whatsapp_twilio_*`, `rcs_rbm_*`, `rcs_gupshup_*`, `push_fcm_service_account`). Every credential is `is_secret`: encrypted, blank = unchanged, never returned. A service-account key must be Google's JSON file (`client_email`, `private_key`) or it is refused.

### Admin — messaging (`role:campaign_manager,store_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET`/`POST` | `/admin/messaging/templates` | `?channel=`, `?q=`, `?per_page=` (max 100). `meta`: `channels`, `events` (value, label, promotional, placeholders), `common_placeholders`, `samples`, `categories`, `approvals` |
| `POST` | `/admin/messaging/templates/sync` | `channel`. Reads every template's approval from the provider: `{matched, unknown[]}`. 422 in the provider's words. **Declared above `templates/{id}`** |
| `GET`/`PATCH`/`DELETE` | `/admin/messaging/templates/{id}` | Bound by **id**. `channel` is fixed once saved (prohibited on PATCH) |
| `POST` | `/admin/messaging/templates/{id}/submit` | WhatsApp: submit for review; the template becomes `pending`. Throttled 10/min |
| `POST` | `/admin/messaging/templates/{id}/test` | `to`. This template, filled with `samples`, to one address. Throttled 6/min |
| `GET` | `/admin/messaging/automations` | The whole grid, every event × channel: `event`, `event_label`, `promotional`, `channel`, `message_template_id`, `is_enabled`, `live`, `reason`. `meta.channels`, `meta.templates` |
| `PUT` | `/admin/messaging/automations` | `rows[]` of `{event, channel, message_template_id, is_enabled}`, upserted. A template on another channel, or switched on with none, is a 422 on the row |
| `GET` | `/admin/messaging/contacts` | `?channel=`, `?status=active\|opted_out`, `?q=` (name, customer, or four digits of a number). A push token is shortened to 12 characters. `meta.channels[].active` counts. **No create** |
| `POST` | `/admin/messaging/contacts/{id}/opt-out` | Records an opt-out said somewhere else (`staff`) |
| `GET`/`POST` | `/admin/messaging/broadcasts` | `?status=`. `meta`: `channels`, `audiences`, `statuses`, `wishlists` (whether the wishlist tables exist), `groups`, `products`, `templates`, `quiet_hours` |
| `GET` | `/admin/messaging/broadcasts/audience` | `?channel=&audience=&newsletter_group_id=&store_product_id=` → `{count}`. **Declared above `broadcasts/{id}`** |
| `GET`/`PATCH`/`DELETE` | `/admin/messaging/broadcasts/{id}` | `name`, `channel`, `message_template_id` (same channel), `audience` (`opt_ins`, `customers`, `newsletter_group`, `wishlist`), `newsletter_group_id`, `store_product_id`. A read of a draft or scheduled one carries `audience_count`; of anything else `report` (`counts` by status, `sent`, `delivery_rate`, `read_rate` — null before anything was sent — and the latest 20 `failures`). PATCH on a draft only; DELETE on a draft or cancelled one |
| `POST` | `/admin/messaging/broadcasts/{id}/send` | `scheduled_at?`. A future time schedules it; otherwise it is claimed with a conditional UPDATE, frozen into delivery rows and queued in batches of 100 inside the quiet hours. 422 with `errors.send[]` on an unapproved template, a channel off, or nobody in the audience; 422 once already sent. Answers `starts_at` |
| `POST` | `/admin/messaging/broadcasts/{id}/cancel` | Scheduled or sending: `cancelled`, and every delivery not yet sent `skipped` |

**Every audience is narrowed to active contacts on the broadcast's channel.** `newsletter_group` matches the group's active subscribers to portal customers by email; `wishlist` reads `wishlist_items.store_product_id` joined to `wishlists.customer_id` and is **empty until those tables exist**.

## The section page builder

A CMS page whose `template` is `builder` is a stack of typed sections
(2026-09-26). See `docs/page-builder.md`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/pages/builder` | `role:content_manager`. `section_types`, `section_presets`, `hero_layouts`, `card_sources`, and the **published** `content_blocks`, `sliders`, `galleries`, `forms`, plus `product_categories` and `store_categories`, and `library: {sections[{id, name, type}], templates[{id, name, description, count}]}`. Declared above `pages/{page:id}` |
| `GET` | `/admin/saved-sections` | `role:content_manager`. The section library and page templates, by kind then name. `?kind=section\|template`, `?q=`, `?per_page=` (max 100). Rows: `id`, `kind`, `name`, `description`, `type`/`type_label` (a section's), `count`, `author`, `updated_at`. `meta.kinds` |
| `POST` | `/admin/saved-sections` | `kind`, `name` (120), `description?` (300), `blocks` (1–40, the page's shape and rules). A `section` is exactly one block and never of type `saved` (422 on `blocks`/`blocks.0.type`). **201** |
| `GET` | `/admin/saved-sections/{id}` | Adds `blocks`, `blocks_media`, `sections` (presented) and `linked_from[{id, title, kind}]` |
| `PATCH` | `/admin/saved-sections/{id}` | `name`, `description`, `blocks`; `kind` is fixed. A linked section's pages show the change on their next render |
| `DELETE` | `/admin/saved-sections/{id}` | 204, or **422** `{message, linked_from}` while a page or template places the section linked |
| `POST` | `/admin/pages/sections-from-body` | `role:content_manager`, throttled 30/min. `{body}` (required). The body cleaned as a saved one is and split into `rich_text` sections at its `<h2>`s (its `<h3>`s when it has none) — `{data: {sections}}` in the stored shape, ids included; **nothing written**. 0.109.0 |
| `POST` | `/admin/pages/preview` | `role:content_manager`, throttled 60/min. `{blocks, page_id?}` — validated exactly as a save is, presented, **nothing written**. 200 `{data: {sections}}`, or a 422 keyed `blocks.N.data.field` |
| `POST` | `/admin/pages/ai-draft` | `role:content_manager`, throttled 6/min, declared above `pages/{page:id}`. `{brief (10–1500), length? (short/standard/long, default standard), pictures? (default true), icons? (≤ 400 ids)}`. The assistant lays out a **draft** builder page from the brief. **201** `{data: {id, title, slug, admin_path: "/admin/pages/{id}?tab=builder", sections (count), dropped: [{type, reason}]}}`; a refusal is **422** `{message, errors: {brief: [sentence]}}`. 0.116.0 — see below |

**`blocks` on `POST`/`PATCH /admin/pages`** is a list of at most 40
`{id (uuid), type, hidden, background, reveal, data}`; `type: saved` with `data: {saved_id}` places a library section linked — it must name a library *section* that exists, and the public read draws that section in its place (the page's `id` and `hidden` kept); `template` accepts `builder`
beside `default` and `wide`. `type` is `App\Enums\PageSectionType` — `hero`,
`rich_text`, `media_text`, `features`, `cards`, `content_block`, `slider`,
`gallery`, `form`, `faq`, `logos`, `testimonial`, `video`, `divider`, and since
0.107.0 `stats` (`display` figures/rings/bars, items `{value, label, icon?,
percent?}` — `percent` required for rings and bars, dropped for figures),
`steps` (`layout` vertical/horizontal, 2–8 items), `tabs` (2–8 items
`{label, heading?, body (plain text), image_path?}`, each picture resolved on
the public read to `image`/`image_alt`/`image_focus`), `checklist` (`columns`
1–3, up to 24 items) and `cta` (`heading`, `tone` brand/accent, `call`,
buttons), and since 0.109.0 `comparison` (2–4 `plans` `{name, note?}`,
`highlight?` a plan's position, 1–20 `rows` `{label, cells[]}` — a cell is
`yes`, `no`, up to 60 characters or null, kept by position), `timeline` (2–12
items `{date, title, body?}`), `before_after` (`before_path`, `after_path`,
both library pictures, `before_label?`, `after_label?`, `start?` 10–90,
`caption?`; read as `before`/`after` with `_alt`/`_focus`) and `testimonials`
(2–9 items `{quote, name, role?, photo_path?}`, each photo read as
`photo`/`photo_alt`/`photo_focus`), and since 0.111.0 `team` (`department?`,
`limit?` 1–48, `group?`; read with `members` in `GET /team`'s shape, dropped
when nobody matches), `downloads` (1–20 items `{title, file_path, note?}`, each
file in the library; read as `{title, note?, url, size, extension}`, a missing
file left out), `countdown` (`heading`, `ends_at` as `Y-m-d\TH:i` in the site's
timezone, `done_text?`, buttons; read with `ends_at` as an instant with its
offset and `ends_label`), `columns` (2–3 `{heading?, body}`, each body rich
text — `blocks.*.data.columns.*.body` is cleaned on write) and `map` (`url`
beginning `https://www.google.com/maps/embed`, `address?`), and since 0.113.0
`theme_section` (`section`, an id of the shape `^[a-z][a-z0-9_-]{0,31}$` —
one of the active theme's homepage sections, the list being the frontend's
`HOME_SECTIONS`; the theme's `hero` is refused anywhere but first, a 422 on
`blocks.N.data.section`; passed through unchanged on the public read), and
since 0.114.0 `story` — "Scroll story", steps that scroll past a picture held
in place (`kicker?` ≤ 60, `heading?` ≤ 120, `lede?` ≤ 300, and 2–6 `items`
`{title (≤ 100), body (plain text, ≤ 600), image_path}`, every step's picture
required and a library picture, a 422 on `blocks.N.data.items.M.image_path`
otherwise; read with each step's picture as `image`/`image_alt`/`image_focus`,
the tabs' rule), and since 0.115.0 `flow` — "Diagram", a row of connected
steps whose joining lines draw themselves as the page scrolls (`kicker?` ≤ 80,
`heading?` ≤ 120, `lede?` ≤ 300, 2–6 `items` `{icon?, title (≤ 60), note?
(plain text, ≤ 160)}` — `icon` an id of the features' shape — and `caption?`
≤ 200; passed through unchanged on the public read). Also since 0.115.0 a
`hero` may carry `video_path`, a library video (`video/*`, in practice mp4 or
webm), on the **`cover`** layout only — on `split` or `centered` it is a 422 on
`blocks.N.data.video_path` ("A background video plays behind a cover hero
only — choose the Cover layout."), a file that is not a video is "That file is
not a video.", and `image_path` stays required, as the poster and what a
visitor who asked for less motion sees; the public read carries it as `video`
(a URL) with `video_path` removed — and
`data` is checked by that type's own rules (`SectionRules`), so a 422 names the
field: `blocks.3.data.heading`. A picture or video must be in the media
library and of the right kind; a content block, slider, gallery or form is
named by id and must exist **and be published**; a YouTube link is stored as
its id; a background is the Themes screen's section background, checked by
the same rule; ids are unique. `data.body` on `rich_text` and `media_text` is
rich text, cleaned on write like any body; every other field is plain text.
Only declared keys are stored. Absent leaves the sections alone; `[]` clears
them. A section may also carry **`style`** (0.104.0): `pad_top`/`pad_bottom`
of `none`/`s`/`l`/`xl`, `width` of `medium`/`narrow`, `align` of `center`,
`heading` of `s`/`l`, since 0.114.0 `headline` of `rise`/`wipe`/`shimmer`
(how the section's heading moves as it scrolls into view) and `scroll` of
`parallax`/`zoom`/`fade` (an effect tied to the scroll itself) — a value
outside a list is a 422 on `blocks.N.style.<key>` — `anchor` (`^[a-z][a-z0-9-]{0,47}$`, a 422 on
`blocks.N.style.anchor` when another section has it) and `show_on` (a
non-empty subset of `phone`, `tablet`, `desktop`). Values that are the
section's own (`default`, all three devices) are not stored, and `style` is
null when nothing differs; both reads carry it. `reveal` is how the section arrives on scroll — an id checked for
shape only (`^[a-z][a-z0-9-]{0,15}$`, the list is the frontend's
`SECTION_REVEALS`), 422 on `blocks.N.reveal` otherwise; `default` and a blank
are stored as null, and both the admin and the public reads carry it.

**The admin detail read** carries `blocks` as stored, `blocks_media` (a URL
for every stored `*_path`) and `sections` — the public shape, hidden ones
left out — for the saved preview. The index's `meta` carries
`section_types` and `section_presets`, and since 0.116.0 `ai_draft:
{available, reason}` — whether `POST /admin/pages/ai-draft` can be asked now,
and when not, the sentence it would refuse with (switched off, no key, the
day's cap reached).

**`POST /admin/pages/ai-draft` writes a draft and nothing else** (0.116.0,
`App\Support\Seo\Ai\PageDraft`, modelled on the chat's article brief). It
shares the AI SEO assistant's switch, key, model, daily cap and counter — one
run counted per page made, nothing for a refusal or a failure — and refuses
with the same sentences, plus "The AI service did not answer. Try again
shortly.", "…answered in a form we could not read…" and "…answered, but
nothing in it was usable…", all on `brief`. The model is told, outside a
`---BRIEF---` fence (the marker stripped from the brief), to write
`[CHECK: what to confirm]` wherever a fact, figure, price, model number, date,
certification, client or guarantee would go — kept verbatim — and never to
write testimonials, quotations, statistics or prices. It may use `hero`,
`rich_text`, `media_text`, `features`, `steps`, `checklist`, `faq`, `flow`,
`cards` and `cta`, and it names **nothing by address**: a button's link is a
number into the assistant's list of real published pages plus `/contact`, a
picture a number into up to 40 library images (raster, not SVG, with alt
text, newest first; none when `pictures` is false), an icon one of the
`icons` the console sent. A number outside its list is dropped (a button
loses itself; a `split`/`cover` hero without a picture becomes `centered`; a
`media_text` without one is left out), an icon not sent is stripped. Every
field is read by name and bounded, rich text is built from escaped
paragraphs and cleaned like a typed body, a hero that is not first is left
out, and **each section is then validated by the rules a save runs**
(`SectionRules::forPayload`, its messages and `after()`) and normalised as a
save stores it — anything that fails is left out and listed in `dropped` with
the first reason. The page is `template: builder`, `status: draft`, a free
slug from its title (never a frontend route), the model's SEO title (≤ 60) and
description (≤ 160) as the override, and a body holding an editor's note and
the brief, escaped. Nothing is published.

**The public read `GET /pages/{slug}`** carries `sections` **only for a
builder page**: hidden sections omitted; `*_path` → a URL with `*_alt` and
`*_focus`; a content block inline as `data.block` (the public block
resource); a slider, gallery or form as its current `slug`, which the
frontend fetches from its own endpoint; a `cards` section's live list
resolved as `items` (`title`, `summary`, `path`, `image`, `icon`, `kicker`,
`meta`) with `index_path`; a `faq` on `source: page` carrying the page's
FAQs. A section whose reference has been unpublished or deleted, or whose
list is empty, is dropped. `faq_schema` counts the visible custom questions
of `faq` sections beside the FAQs and question blocks — still one
`FAQPage`, absent under two entries. The body is still sent.

## Engineer visits

A customer asks for an engineer on site with up to three preferred times; the
desk confirms one (2026-09-26, `docs/visits.md`). A request is never a
booking: only the confirm endpoint sets a time.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/visits/options` | What the form offers: `enabled`, `windows[{value,label,start,end}]`, `days` (ISO weekdays), `min_date`, `max_date`, `holidays` (inside that range), `max_preferred`, published `services[{id,title,slug,location_ids}]`, `solutions`, active `locations`. `Cache-Control: max-age=300`. **Declared above `visits/{reference}`** |
| `POST` | `/visits` | `name`, `email`, `phone` (an Indian mobile — `CheckoutRequest::MOBILE_PATTERN`), `company?`, `site_address.{line1,line2,city,state,pin,country}` (line1, city, state and a six-digit pin required), `service_id?`/`solution_id?` (published), `location_id?` (active), `notes?` (plain text, 2000), `preferred[{date: Y-m-d, window}]` (1–3), `message_opt_in[]?` (`whatsapp`, `rcs`), honeypot `website`, the `_source_*` envelope. Throttled 5/min. **201** with `reference` and `access_token` — the token here and nowhere else. 403 with a sentence while `visits_enabled` is off |
| `GET` | `/visits/{reference}?token=` | The request as its customer sees it. A wrong token and a wrong reference are the same 404 |
| `POST` | `/visits/{reference}/cancel` | `token`. 422 once it is not open |
| `POST` | `/visits/{reference}/reschedule` | `token`, `preferred[]`, `note?` (500). Back to `requested`; a confirmed time is cleared and kept in the trail |
| `GET` | `/my/visits` | Portal. The signed-in customer's own, newest first, paginated (`per_page` ≤ 50) |
| `GET` | `/my/visits/{reference}` | Portal. Another customer's is a 404 |
| `POST` | `/my/visits/{reference}/cancel` | Portal |
| `POST` | `/my/visits/{reference}/reschedule` | Portal. `preferred[]`, `note?` |
| `GET` | `/admin/visits` | `role:sales_manager,support_engineer`. `?status=`, `?open=1`, `?assigned_to=`, `?unassigned=1`, `?from=`/`?to=` (`Y-m-d`, on the appointment), `?q=` (reference, name, email, phone, company), `?sort=created\|scheduled\|name\|status` with `?dir=`, `?per_page=` ≤ 100. Default order: waiting oldest first, then the diary soonest first, then closed newest first. `meta`: `statuses`, `awaiting_count`, `today_count`, `unassigned_count`, `assignees`, `sorts`, `default_minutes`, `windows` |
| `GET` | `/admin/visits/{reference}` | With `events` (the trail, oldest first) and `allowed_next` |
| `PATCH` | `/admin/visits/{reference}` | `status` (checked by `VisitStatus::canTransitionTo()`, a 422 naming both states; `confirmed` is always refused here), `assigned_to`, `staff_note`, `cancel_reason`. Cancelling emails `visit_cancelled` with the reason |
| `POST` | `/admin/visits/{reference}/confirm` | `start_at` (a wall-clock datetime, read in IST), `minutes?` (15–720, default `visit_default_minutes`), `assigned_to?`. `requested` or `confirmed` only. Emails `visit_confirmed` — or `visit_rescheduled` for a visit ever confirmed before — with a `.ics` attachment |

**Statuses** are `requested`, `confirmed`, `completed`, `cancelled`,
`no_show`. `confirmed` is reached only by confirming; `completed` and
`no_show` correct to each other; `cancelled` reopens to `requested`.
`confirmed_at`, `completed_at` and `cancelled_at` are stamped on arrival and
never cleared.

**The customer's resource** has no `staff_note`, no engineer, no lead, no
source and no token; `can_cancel` and `can_reschedule` say which buttons a
POST will accept. The admin resource adds those, `allowed_next`,
`admin_path` and `lead_id`.

**A signed-in customer is stamped** from `$request->user('sanctum')` narrowed
to a `Customer` — never an impersonated ("View as") token.

**Every request files a lead** (`channel: visit`), emails the desk
(`visits_email`, else `sales_email`) and the customer, notifies
`MessageEvent::VisitRequested` on the opted-in channels and emits the
`visit.requested` webhook. `technoware:remind-visits`, every fifteen minutes,
sends `visit_reminder` once to a confirmed visit starting within 24 hours.

**Settings** are the `visits` group at `/admin/visits/settings`
(`role:admin`): `visits_enabled`, `visit_windows` (`key|Label|09:00|12:00`
per line), `visit_days` (`mon,tue,…`), `visit_min_notice_days`,
`visit_max_days`, `visit_holidays` (`Y-m-d` per line), `visits_email`,
`visit_default_minutes`. The group is private; the first six reach the public
`/settings` map by name. A value that would parse to nothing is a 422.

## Online meetings

A customer books a video call at a time a host is free; the company's Google
calendar makes the event and the Meet link (2026-09-29). The rules are
`docs/meetings.md`; **every body and answer shape is
`docs/meetings-contract.md`**, kept with `web/src/types/meetings.ts` and the
mock — this section is the route list and what is not obvious from it.

Every time on the wire is ISO 8601 **with its offset**; a `start` without one
is a 422. Every label (`date_label`, `time_label`, `timezone`) is the API's,
in `APP_TIMEZONE`. References are `PREFIX-YYYY-NNNNN` under
`meeting_reference_prefix` (default `MT`), and every `{reference}`/`{meeting}`
route is held to that shape. `type` in a request is the meeting type's slug.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/meetings/options` | Types (active and public), step, notice, window, holidays, zone. Cacheable, tag `meetings` |
| `GET` | `/meetings/slots?type=&date=` | One day's starts, **never which host**. Or `?type=&from=&to=` (≤ 62 days): every date with a `count`. `no-store`, 60/min |
| `POST` | `/meetings` | `type`, `start` (exactly a slot's), `name`, `email`, `phone` (Indian mobile), `company?`, `agenda?`, `message_opt_in[]?`, honeypot `website`, the `_source_*` envelope. 5/min. **201** with `access_token` — here and nowhere else. 403 while `meetings_enabled` is off; 422 on `start` for a taken time ("That time was just taken — choose another.") or one never on offer; on `email` past `meeting_max_open_per_contact`; on `start` past `meeting_daily_ip_cap` |
| `GET` | `/meetings/{reference}?token=` | The customer's view. A wrong token and a wrong reference are the same 404 |
| `POST` | `/meetings/{reference}/cancel` · `/reschedule` | `token` (+ `start`). Inside `meeting_change_cutoff_hours`, or past `meeting_max_reschedules`, a 422 on **`meeting`** |
| `GET` | `/my/meetings` · `/my/meetings/{reference}` | Portal. Scoped to the customer; another's is a 404 |
| `POST` | `/my/meetings/{reference}/cancel` · `/reschedule` | Portal |
| `GET` | `/admin/meetings` | `role:sales_manager,support_engineer`. Filters `status`, `host`, `type`, `mine=1`, `from`/`to`, `q`, `needs_outcome=1`, `google=failed`, `source`, `sort`/`dir`, `per_page` ≤ 100 |
| `GET` | `/admin/meetings/customers?q=` | The customers a booking can be made for, for the diary's roles: up to 8 `{id, name, email, company, phone, status, status_label}` by name, email or company, ordered by name. Two-character floor (422), 100 at most; `%` and `_` match themselves. `no-store`, 60/min. The console search shows customers to support only — this is what lets sales link a meeting to an account |
| `GET` | `/admin/meetings/slots` | Each slot's free `hosts[]` with per-host `outside_hours`/`google_busy`; `outside_hours=1`, `google_busy=1` widen it; `exclude=<reference>` for a move |
| `POST` | `/admin/meetings` | Staff booking: skips notice and window (never the past), `outside_hours`/`override_google_busy` ticks, never over a meeting booked here; `host_id?` else least-booked free. No caps. **201** |
| `GET`/`PATCH` | `/admin/meetings/{reference}` | With `trail`. `PATCH`: `staff_note`, `status` of `completed`/`no_show` (after the start only), `note` |
| `POST` | `/admin/meetings/{reference}/move` · `/cancel` · `/resync` | `resync` is a 422 on `google` when nothing is connected or the meeting has been on the `.ics` path from the start |
| `GET`/`POST`/`PATCH`/`DELETE` | `/admin/meeting-types[/{id}]` | `role:sales_manager`. `minutes` 15–240, buffers 0–120, `is_public`, `host_ids[]` (empty = every eligible host). DELETE is a 422 on `type` while it has meetings |
| `GET` | `/admin/meeting-hosts[/{user}]` | `role:admin`. Everyone holding `meeting_host` **explicitly** |
| `PUT` | `/admin/meeting-hosts/{user}/hours` | `{hours: [{weekday, start, end}]}`, replaced; `[]` = the defaults |
| `POST`/`DELETE` | `/admin/meeting-hosts/{user}/time-off[/{id}]` | |
| `GET`/`POST` | `/admin/meetings/google` · `/authorize` · `/callback` · `/disconnect` · `/test` | `role:admin`. The calendar's own OAuth slot; `redirect_uri` checked against `/admin/meetings/google/callback` |
| `GET`/`PATCH` | `/admin/my-meetings[/{reference}]` | `role:meeting_host`, scoped to `host_id`; another host's is a 404 |

**Beside these**: `GET /admin/dashboard` carries `meetings: {today,
needs_outcome}` (null for a role without the diary); a lead resource carries
`meeting: {reference, admin_path} | null`; `DELETE`/`PATCH /admin/staff/{id}`
refuse to remove, deactivate or un-host somebody with meetings to come. The
webhook events are `meeting.scheduled`, `meeting.rescheduled` (adds
`previous`) and `meeting.cancelled` — the admin resource less `staff_note`
and `trail`. Emails: `meeting_scheduled`, `meeting_booked_internal`,
`meeting_rescheduled`, `meeting_cancelled`, `meeting_reminder`,
`meeting_link_ready`, `meeting_sync_failed`.

**Settings**: the private `meetings` group (`/admin/meetings/settings`,
`role:admin`) — `meetings_enabled` (default off), `meeting_default_hours`,
`meeting_slot_step`, `meeting_min_notice_hours`, `meeting_max_days`,
`meeting_holidays`, `meeting_reminders`, `meetings_email`,
`meeting_block_google_busy`, `meeting_change_cutoff_hours`,
`meeting_max_open_per_contact`, `meeting_max_reschedules`,
`meeting_daily_ip_cap`; the first four reach the public `/settings` map. The
private `meetings_google` group holds the OAuth client, the token and
`meetings_google_calendar_id` (blank = `primary`). `meeting_reference_prefix`
is in `references`.

## Events

Something with a date that people attend, with a page and — optionally — a
free registration with a capacity and a waiting list (0.118.0). The rules
are `docs/events.md`; **every body and answer shape is
`docs/events-contract.md`**, kept with `web/src/types/events.ts` and the
mock — this section is the route list and what is not obvious from it.

Every time on the wire is ISO 8601 **with the offset** of `APP_TIMEZONE`,
and every label (`date_label`, `time_label`, `format_label`, `status_label`,
`closes_label`, `day`/`month`/`year`) is the API's. `format` is `in_person`,
`online` or `hybrid`; `registration_mode` is `none`, `open` or `external`; a
registration's `status` is `confirmed`, `waitlisted`, `cancelled`, `attended`
or `no_show`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/events` | Published only. `?when=upcoming` (default; soonest first) or `past` (newest first), `?format=` (an unknown one is ignored), `?featured=1`, `?page=`, `?per_page=` (max 50, default 12). Each row carries `seo` |
| `GET` | `/events/{slug}` | The row plus `body`, `venue_address`, `map_url`, `speakers[]`, `agenda[]`, `registration {mode, external_url, closes_at, closes_label, max_seats, has_capacity, waitlist}`, `calendar_path`, `faqs[]`, `faq_schema` (absent under two FAQs) and `schema` (a schema.org `Event`) |
| `GET` | `/events/{slug}/availability` | `{data: {state, few_left, message}}`, `Cache-Control: no-store`. `state` is `none`, `external`, `open`, `waitlist`, `full`, `closed` or `ended` |
| `GET` | `/events/{slug}/calendar` | The event as a `.ics`: `Content-Type: text/calendar`, `Content-Disposition: attachment; filename={slug}.ics` |
| `POST` | `/events/{slug}/register` | `name` (required, 120), `email` (required, `email:rfc`), `phone?` (30, loosely a number), `company?` (160), `seats?` (integer ≥ 1, default 1, at most the event's `max_seats`), `note?` (plain text, 1000), honeypot `website`, the `_source_*` envelope. Throttled 10/min. **201** `{message, data: {status, seats}}` |
| `GET` | `/events/registrations/{token}` | `{status, status_label, seats, name, can_cancel, event {…}}`. Throttled 30/min |
| `POST` | `/events/registrations/{token}/cancel` | The same shape with `status: cancelled`. Throttled 10/min |
| `GET` | `/admin/events` | `role:content_manager`. `?status=`, `?when=upcoming\|past`, `?format=`, `?q=` (title, summary, body, venue), `?sort=starts\|title\|status` with `?dir=`, `?per_page=` (max 100, default 20). Default: what is coming, soonest first, then what has been, newest first. Every row carries `counts` |
| `POST` | `/admin/events` | **201** |
| `GET`/`PATCH`/`DELETE` | `/admin/events/{id}` | Bound by **id**. `PATCH` takes `notify_registrants`. `DELETE` answers 200 `{"message": "Event deleted."}`, or a 422 on `event` while the event has registrations |
| `POST` | `/admin/events/{id}/duplicate` | **201**: a draft copy, "(copy)", a free slug, the FAQs, no registrations and no SEO override |
| `GET` | `/admin/events/{id}/registrations` | `role:content_manager,sales_manager`. `?status=`, `?q=` (name, email, company, phone), `?per_page=` (max 100, default 50). Confirmed first, then the waiting list oldest first, then the rest newest first. `meta.event {id, title, status, date_label, time_label, has_started, counts, capacity, max_seats, waitlist_enabled}`, `meta.statuses` |
| `GET` | `/admin/events/{id}/registrations/export` | The same rows and filters as a CSV, every cell escaped. **Declared above `{registration}`** |
| `POST` | `/admin/events/{id}/registrations` | The public fields plus `force` and `notify` (default true). **201**, with `meta` beside `data` |
| `PATCH` | `/admin/events/{id}/registrations/{registration}` | `status`, `seats` (1–20), `staff_note`, `force`. `meta` beside `data` |
| `DELETE` | `/admin/events/{id}/registrations/{registration}` | For good. **204**. No email |

**`online_url` is never on a public read.** The join link is sent to people
who registered — in the confirmation, the reminder, the "details changed"
message and the calendar file attached to them — and is on the admin
resource only. The public resources do not name the column; the `schema`
graph's `VirtualLocation` carries the page's URL; the public `.ics`, the
webhook and the chatbot's retrieval do not read it.

**The venue is null for an `online` event** on every public read, whatever
the row still holds from an earlier draft.

**An event is upcoming until it ends**, or until the end of the day it
starts on when it has no `ends_at`; `is_past` is the same rule.

**`availability` publishes a state and never a count.** `few_left` is true
when a capacity is set and a fifth of it or less — but at least one seat —
remains. `message` is a sentence for `full` ("This event is full."),
`closed` ("Registration for this event has closed.") and `ended` ("This
event has already started, so registration has closed." / "This event has
taken place."), and null otherwise. `ended` means the event has **started**.
`waitlist` is a full event with its waiting list on — and also one with
seats free while somebody is already waiting, because the list is a queue.

**Registering: who is confirmed, who waits, who is refused.** Decided inside
a transaction that opens by locking the event row, and counted in **seats**
over the registrations that hold one:

- `status` is `confirmed` ("You are registered. We have emailed your
  confirmation to {email}.") or `waitlisted` ("This event is full, so you
  are on the waiting list. We have emailed {email} and will write again if a
  place opens."). A party larger than what is left waits whole when there is
  a waiting list.
- **422 on `registration`**, one sentence, when the mode is not `open`
  ("This event does not take registrations here."), registration has closed,
  the event has started, or it is full with no waiting list.
- **422 on `seats`** when more are asked for than the event's `max_seats`
  ("You can register up to 5 seats at once…"), or than are left with no
  waiting list ("Only 1 seat is left.").
- **The same address again writes nothing.** A typed address is not proof
  of whose it is, so when it already holds a live registration (`confirmed`,
  `waitlisted`, `attended`, `no_show`) no column changes and no lead, webhook
  or desk notice follows. That registration's own confirmation (or
  waiting-list message) is sent again to the address on file — at most once
  every 10 minutes per address per event (`EventActions::RESEND_MINUTES`, an
  atomic `Cache::add`); `attended`/`no_show` are sent nothing.
- **A repeat is answered exactly as a brand-new address sending the same
  body would be at that moment**: the same 201 `status` and message from the
  current count, or the same 422 on `registration` or `seats`. The response
  therefore cannot say whether an address is registered. So a double press
  on the last seat reads "This event is full." the second time, with the
  confirmation in the inbox both times; that is the price of a response
  that tells a stranger nothing.
- **A cancelled registration is no registration**: the row is revived with
  the details sent, subject to room like a newcomer, **under a new token**,
  and it is an arrival like any other (a lead, the desk's notice, the
  webhook).
- **There is no update path here**, a signed-in customer included. Changing
  a party's size is cancelling from the manage link and registering again,
  or the desk editing the row.
- **A filled `website`** is answered 201 in the same shape — `status:
  confirmed` and the seats sent; nothing is stored or sent.
- A portal `Authorization: Bearer` stamps `customer_id` on a first
  registration or a revival, read with the `sanctum` guard named and
  narrowed to a `Customer`; an impersonated token does not.

**The manage link is in the emails and nowhere else.** It is
`/events/registration/{token}` on the site, the token 64 lower-case hex
characters — in the confirmation, the waiting-list message, the reminder and
the "details changed" message, sent to the address that registered, and in
**no response**: not the register 201, not the admin resource, not the
webhook. The two registrant routes hold the token to that shape in the route,
so anything else is a 404 before a controller runs; a well-formed token that
is nobody's is the same 404, and so is one rotated away by a revival. The
manage read has no email, phone, note or staff field. `registration` and
`registrations` are refused as an event's slug.

**Cancelling** is a 422 on `registration` once the event has started or the
registration is `attended`/`no_show`; cancelling one already cancelled
answers the same shape and sends nothing. A confirmed registration cancelled
promotes the waiting list, oldest first, **stopping at the first party that
does not fit**. So does a party shrinking, a registration deleted and a
capacity raised or removed.

**Admin datetimes are wall-clock `Y-m-d\TH:i`** in `APP_TIMEZONE`, written
and read back (`starts_at`, `ends_at`, `registration_closes_at`), with
`starts_at_iso` as the instant. Seconds are accepted and dropped.

**Admin `meta`** — on the index, the read, both writes and the duplicate:
`formats[{value,label}]`, `statuses[{value,label}]`,
`registration_modes[{value,label,blurb}]`,
`registration_statuses[{value,label}]`, `max_speakers` (12), `max_agenda`
(30), `timezone` (`"IST"`). No `custom_field_groups`.

**Write rules** are the contract's. The ones that span two fields are
checked against what the event *will be* — a `PATCH` naming one half is
compared with the stored other: `ends_at` after `starts_at`;
`registration_closes_at` not after the start; `venue_name` unless the format
is `online`; `external_url` when the mode is `external`; `online_url` before
an `online` or `hybrid` event whose mode is `open` can be **published**;
`capacity` not below the seats already held ("7 seats are already taken, so
the capacity cannot be lower than 7."). `cover_image_path` and a speaker's
`photo_path` must be library **images**. `status`, `registration_mode`,
`is_featured` and `waitlist_enabled` default to `draft`, `none`, false and
false on create; `max_seats` to the `event_max_seats` setting. `speakers`,
`agenda` and `faqs` are replaced wholesale; absent leaves them alone, `[]`
clears.

**`notify_registrants: true`** sends `event_changed` to each confirmed
registrant — only when the save changed `starts_at`, `ends_at`, `format`,
the venue, `map_url` or `online_url`. A new start resets every confirmed
registration's `reminded_at`.

**The registrations desk goes through the public door's implementation.**
`POST` for an address that already holds a live registration is a **422 on
`email`** naming its status ("This address already has a registration for
this event (Confirmed). Edit that one instead."); a cancelled one is revived
under a new token. `force`
goes past the capacity, a closing date and the start (never past a mode that
is not `open`), and `notify: false` skips the registrant's confirmation —
the desk's own notice and the lead are still made. `PATCH status` follows
`EventRegistrationStatus::canTransitionTo()` (422 on `status` naming both
states otherwise): `cancelled` emails the registrant and promotes the
waiting list; `confirmed` from `waitlisted` or `cancelled` is held to the
room unless `force` and emails `event_waitlist_promoted` or the
confirmation; `waitlisted` from `cancelled` emails the waiting-list message;
`attended` and `no_show` are a 422 on `status` before the event has started,
and correct to each other and back to `confirmed`. `seats` growing on a
registration that holds seats is a 422 on `seats` past the room unless
`force`. A registration addressed through another event's id is a 404. The
admin resource carries `lead_id` with `lead_path`, `source` (`public` or
`staff`) and **no token**.

**`allowed_next` on every admin registration** is what the status select may
offer now, itself first, as `[{value, label}]`:
`EventRegistrationStatus::canTransitionTo()` plus the clock — `attended` and
`no_show` appear only once the event has started. A dropdown offers only
what a `PATCH` accepts; what it cannot promise is room, and that refusal
names the seats. It is not in the webhook payload.

**`meta.event` rides on the list and beside every registration write**
(`POST`, `PATCH`), because a sales manager cannot read `/admin/events/{id}`:
the event's `status`, `date_label`, `time_label`, `counts`, `capacity`,
`max_seats`, `waitlist_enabled`, and `has_started` — the same clock the
status rule and `allowed_next` use, so it is the one place that screen
learns whether Attended and No-show may be offered.

**The join link and the venue follow the format wherever they are sent.**
The console keeps what was typed when the format changes: an `in_person`
event that still holds an `online_url` never emails it or puts it in a
registrant's `.ics`, and an `online` event that still holds a hall reads
"Online" in every message and calendar file and null on every public read.

**The admin event's `body`, `faqs`, `seo` and `seo_defaults` are on the
detail shape only** — the read, both writes and the duplicate; an index row
carries none of them. The waiting-list status is labelled "On the waiting
list".

**Where else**: `GET /search` gains a group of type `event` (label
"Events", each result with its date as `kicker`); `GET /admin/search` gains
one for a content manager; `GET /admin/menus` offers the item type `event`
and the section `events` (dropped at render until an event is published);
`GET /admin/menu-targets?type=event`; `GET /admin/faq-owners` and
`/admin/seo` list events (`type: event`, `admin_path: /admin/events/{id}`);
`seo.schema_type` accepts `Event`, `BusinessEvent` and `EducationEvent`; the
page builder's `cards` section takes `source: events` (upcoming, soonest
first; `kicker` the date, `meta` the place or "Online", `index_path`
`/events`), listed in `meta.card_sources`; a lead from a registration has
`channel: event`. `events` is a reserved slug for a custom content type —
and **a CMS page can no longer be created at, or moved to, one of the site's
own top-level routes** (`events`, `blog`, `store`…): `POST`/`PATCH
/admin/pages` answer a 422 on `slug`, or on `title` when the slug is blank
and would be derived as one (`ReservedSlugs::pageSlugRule()`). A page already
sitting on such a slug can still be saved under it.

**Settings**: the private `events` group (`role:admin`) — `events_email`
(blank = `sales_email`; an address or a 422), `event_reminder_hours` (0–168,
default 24; 0 sends no reminder) and `event_max_seats` (1–20, default 5).
Nothing in it reaches the public `/settings` map.
`technoware:remind-events`, every fifteen minutes, sends `event_reminder`
once to each confirmed registrant of a published event starting within that
many hours; somebody confirmed inside the window is not reminded.

## The store

A **separate catalogue** from `/products`. What the shop sells is maintained
apart from what the site advertises: two lists, two lifecycles, and nothing
here reads `products`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/store/products` | Paginated. `?q=`, `?category=`, `?type=`, `?sort=`, `?page=`, `?spec[<label>][]=<value>` (OR within a label, AND across, matched on normalised keys; a label nothing carries is ignored) |
| `GET` | `/store/products/{slug}` | Detail only: `warranty`, `applications`, `services: [{id, title, slug}]`, `faqs`, `answer_blocks`, `entity`, `faq_schema`, `videos: [{kind, youtube_id?, url?, title?, poster_url?}]`; the `Product` graph adds `category` as a `Thing`, `additionalProperty` from the spec sheet, `isRelatedTo` (the six the page lists beside it), `offers.warranty` as a `WarrantyPromise` when one is set, and `subjectOf` `VideoObject`s for YouTube videos with an uploaded poster |
| `GET` | `/store/categories` | Only categories with something published in them. Each carries `filter_specs` |
| `GET` | `/store/categories/{slug}` | `filter_specs`: the spec labels offered as filters, in order |
| `GET` | `/store/categories/{slug}/facets` | `?spec[..]` as above. `data: [{label, key, values: [{value, key, count, selected}]}]` — each label counted under the *other* labels' choices; `meta: {category, filtered}`. **`data: []` in a 200** for a category offering none; 404 when inactive. Unfiltered answers cached 5 min, filtered never |
| `GET` | `/store/feed` | The Google Merchant Center feed, as rows. Paginated. `/store/feed.xml` renders it |
| `GET` | `/cart` | The basket for `X-Cart-Token`, or a new empty one |
| `POST` | `/cart/items` | `product_id`, `variation_id`, `quantity`. Throttled 60/min |
| `PATCH` | `/cart/items/{item}` | `quantity`. Zero removes the line |
| `DELETE` | `/cart/items/{item}` | |
| `DELETE` | `/cart` | Empties it |
| `POST` | `/checkout` | Places the order. Throttled 10/min, honeypot `website` |
| `GET` | `/orders/{number}?token=` | One order, for whoever holds the link |
| `POST` | `/orders/{number}/pay` | Opens a payment session |
| `POST` | `/orders/{number}/verify` | What the browser came back with. Razorpay: must name the gateway order this order's `/pay` opened, and Razorpay's own record must say captured/authorised, that order, INR — its amount is compared with the total. 422 otherwise |
| `POST` | `/payments/{gateway}/webhook` | The gateway talking to us. **Un-throttled** |
| `POST` | `/store/products/{slug}/notify` | "Email me when this is back": `email`, `variation_id?`, honeypot `website`. Throttled 10/min. **202 and one sentence always** |
| `GET` | `/store/stock-notices/{token}/cancel` | The link in the email. Idempotent; `{message}`, 200 for a token nobody has too |
| `GET` | `/store/products/{slug}/reviews` | Published reviews, 6 a page. `?sort=featured\|newest\|highest\|lowest` (unknown → featured), `?page=`. `meta`: `sort`, `average` (null with none), `count`, `distribution` `{5..1}`. Rows: `id`, `display_name`, `verified`, `variant_label`, `rating`, `title`, `body`, `published_at` |
| `GET` | `/store/products/{slug}/reviews/mine` | **Portal token.** The caller's own review in any status, or `data: null`; `meta.can_review`, `meta.verified` |
| `POST` | `/store/products/{slug}/reviews` | **Portal token.** `rating` 1–5, `title?` (120), `body` (2–2000, plain text), honeypot `website`. Throttled 10/min. **202 and one sentence**; creates or rewrites the caller's one review, always back to `pending` |

**`/store/products/{slug}/notify` answers 202 and one sentence whatever
happened, the `/auth/register` rule.** A filled honeypot, an address on
`newsletter_suppressions` and a product (or chosen variation) that is in stock
— back-ordered counts as in stock, which is what the switch means — all get
the same answer as a request that was written, and only the last of those
writes a row. One row per address per shelf: a repeat request re-arms a
notice already sent by clearing `notified_at` rather than failing. A portal
bearer token stamps `customer_id`; the route is public, so the guard is read
by name (`$request->user('sanctum')`, narrowed to a `Customer`). The notice
is sent by `SendStockNotices`, queued from `StockLedger::record()` on every
positive movement: the job re-checks the shelf when it runs, skips the
suppression list, sends `back_in_stock` (editable in the catalogue) through
`Notifier`, and stamps each row so a second run tells nobody twice. The
email's cancel link is the frontend's `/store/notify/cancel/<token>`, which
calls the GET above and shows its sentence.

**`meta_catalogue_enabled`** (`store` group, public, default `1`) decides
whether `/meta-catalogue.xml` and `/meta-catalogue.csv` answer (2026-09-26).
Both are rendered by the frontend from `GET /store/feed` — the Google feed's
rows, mapped for Meta's Commerce Manager (back-order is `available for
order`; no stock count) — so the API gains nothing but the switch; off, the
frontend answers 404. See `docs/store.md` "The Meta catalogue".

**`store_product_specs` is derived** (`SpecIndex`): each product's sheet and
its active variations' options, rebuilt after commit whenever either changes,
and by `php artisan technoware:rebuild-store-specs` — run once after the
2026-09-26 migration.

**`GET /store/feed` is the shop as Google Merchant Center reads it, and it is
data rather than markup.** One row per thing somebody can buy — a variation
where there are any, the product where there are not — each keyed by the
`g:` attribute it becomes. `/store/feed.xml` on the frontend renders the RSS,
because that is where the XML escaper lives and escaping belongs at the sink:
the boundary `JsonLd` already keeps, for the same reason. Paginated at a
hundred, walked by the route handler exactly as `sitemap.ts` walks these
records. Its own endpoint rather than a wider `/store/products` because the
feed needs the full `description`, which the storefront index withholds on
purpose.

**An item's `id` is `sp-{product}` or `sp-{product}-{variation}`, never the
SKU.** A SKU is nullable, editable and unique by nothing, and changing an id in
a feed deletes one item and creates another, throwing away its whole history.
Variations share an `item_group_id`.

**`price` and `sale_price` are the other way round from the columns.**
`price_paise` is what is charged and `compare_at_paise` the struck-through
"was"; in a feed `price` is the regular figure and `sale_price` the reduced one
charged today. Sent through unchanged the two carried the same number, which is
a claimed saving with no reduction behind it. `sale_price` is present only when
`compare_at_paise` is genuinely higher, the storefront's own rule.

**`availability` is three-valued.** `in_stock` on the storefront resource is a
boolean and answers *true* for a back-ordered product, correctly — it can be
bought. Declared to Google, that is a claim the thing is on the shelf, and
overstating stock is what Merchant Center suspends accounts for. So
`StoreProduct::availability()` answers `in_stock`, `backorder` or
`out_of_stock` from the same fields `inStock()` reads, and the Offer markup on
the page derives from the same call.

**`identifier_exists` is `no` only when GTIN and MPN are both blank, and the
SKU is never offered as either.** Read from the variation first and the product
second, the way `stock` is. There is deliberately no column for it: a stored
flag would be a second answer free to contradict the two that settle it.

**A product is left out for four reasons, and only two are reported.**
`feed_include` off and `type: service` are decisions and are merely counted in
`meta.skipped`; a missing image or an SVG-only gallery are data problems and
are named in `meta.problems` — and as `feed_problem` on the admin resource, so
the badge sits on the product somebody can fix. **Google rejects SVG**, and this
library is largely SVG placeholder art, so without the check the ordinary state
of a fresh install would be a feed full of items disapproved for a reason
nothing on our side explains.

**Shipping, handling and the return window come from three `store` settings**
— `store_shipping_paise`, `store_handling_days`, `store_return_days` — read by
`App\Support\Store\Fulfilment` for the feed, the Offer markup and the product
page alike. They replaced a sentence hard-coded in the frontend ("Free Shipping
on every order across India") that the API could not see and therefore could
not agree with; a charge on the page that differs from the one declared to
Google is the mismatch that gets an account suspended.

**The product page carries a `Product` graph with a real price, and the
marketing catalogue no longer carries an `Offer` at all.** The store had no
structured data of any kind until now — the one part of the site that sells
published no price to anything that reads a page. `/products/{slug}` used to
emit an `Offer` with a URL and a currency and no `price`, which is invalid
markup and reports as an error; no offer at all is merely incomplete, and is
the truthful description of a catalogue nobody can buy from.

**No stock count is ever published.** `in_stock` is the bit a shop needs; an
exact figure tells anybody who curls the endpoint what this business holds, and
it is stale between the page and the checkout anyway.

**`compare_at_paise` is absent unless it is genuinely higher** than the price.
Equal or lower is either a mistake or a lie, and both render as a discount that
is not there.

**Four ways to pay, and the basket says which are offered.**
`GET /cart` carries `payment_methods` - labels and blurbs only, never account
numbers. Only the gateway settles by itself; cash on delivery, a bank transfer
and UPI all end with a person confirming the money arrived.

**A method is offered only when it has what it needs.** A switch plus the detail
it cannot work without: a bank transfer with no account number is instructions
nobody can follow. `cod_max_paise` is a ceiling, checked against the total the
checkout has just worked out rather than whatever the basket said.

**Cash on delivery confirms the order without paying it.** The order is born
`confirmed` rather than `pending_payment` - it is to be packed, not ignored - and
`paid_at` stays null, so it is not revenue until the cash is banked. It is
refused outright for a licence or a download: there is nothing to hand over at a
door.

**`payment_method` is validated as an enum value and re-checked where the order
is made.** A method the shop has switched off is refused there; an order that
named *no* method gets the gateway and is not refused for want of gateway keys,
because placing the order is worth doing either way.

**The instructions travel with the order, never with the checkout.**
`payment_instructions` on `GET /orders/{number}?token=` carries the account
details, the UPI ID and the QR URL for the method that order used - and is null
for a gateway order and null once `paid_at` is set, because instructions for a
payment already made are how somebody pays twice.

**And the same instructions go out in the sales-order email**, read from the
same `PaymentOptions::forOrder()` array through `App\Support\Store\OrderMail`,
so the email and the page cannot show two account numbers. `OrderPlaced` is
itemised and its subject and closing block follow the method: *payment not yet
made* with a Pay link for the gateway, *confirmed, pay on delivery* for cash
on delivery, the bank details and a "quote the order number" line for a
transfer, the UPI ID and a link to the QR code for UPI. It used to say
"nothing has been charged" and offer a Pay button to every order — wrong for
the customer who had just chosen to pay the courier. `order_paid` stays the
receipt, listing the same lines through the same helper.

**The basket is addressed by `X-Cart-Token`**, which the Next server keeps in an
httpOnly cookie and forwards — browser JavaScript never sees it. Guest checkout
is a requirement, so a cart cannot belong to an account; most never will. Every
line is scoped to that token, and a line in somebody else's basket is a **404,
never a 403**, because a 403 confirms it exists.

**Nothing about money is stored on a cart.** Every figure is recomputed from the
product on every read, so a price change reaches a basket that is already full.
That is the honest behaviour: the alternative is honouring a figure the shop has
since corrected.

**A product with variations cannot be added without choosing one.** Falling back
to the product would sell "a switch" where the shop has only ever offered a
24-port and a 48-port, and somebody in the warehouse then has to guess.

**Too many is a warning on the line, not a refusal at the door.** Somebody adding
three when two are left wants the two. The basket says so and the **checkout**
refuses — which is the moment stock is actually committed, and the only moment
where refusing costs nothing.

**Unless the shop has agreed to back-order it.** `allow_oversell` sits on the
product *and* on each variation, defaults to **false**, and is read from the
variation when the line has one — exactly how `stock` works, because it is the
same question about the same shelf. A flag only on the parent could not say
"the 24-port is back-ordered and the 48-port is not", which is the ordinary
case.

Switched on, the whole chain agrees: the listing offers it, `in_stock` is true
however empty the shelf, `out_of_stock` does not count it, the basket stops
warning, the checkout does not refuse, and **settlement takes the stock
negative** — which is the honest record of owing that many, and is what keeps
the stock ledger from showing a paid order that moved nothing. A back-ordered
line is also not reported as short in the order's trail: "paid, but stock could
not be taken" is a warning for the desk, and going below zero on purpose is not
that.

**It is never published.** `allow_oversell` is admin only; the storefront says
`in_stock` and nothing else, the same reason no exact count is published.

**`phone` is a mobile number and is checked for shape.** Ten digits opening
6–9, with an optional `+91`, `91` or leading `0` and separators anywhere, so
`9876543210`, `+91 98765 43210` and `+91-98765-43210` are one number and a
landline is not. Indian mobiles only, deliberately: this shop prices in rupees,
extracts GST, asks for a PIN code and offers cash on delivery. Shape only and
never a lookup — an uncontrolled network call on the request path is the cost
this project has measured at 12.5s, which is why `email:dns` is absent too. The
**key stays `phone`** while the checkout screen says Mobile: it is what the
column, both order resources, the console, the mock and the customer's own
account call it.

**`customer_note` is the buyer's own note, and it is optional.** Up to 1,000
characters, stored as typed with its line breaks, returned on
`GET /orders/{number}?token=` and on the admin **detail** read (never the
list — it is prose, and a queue is scanned). It is `customer_note` rather than
`notes` because `Order::notes()` is the desk's staff-only relation and an
attribute of that name would shadow it.

**`/checkout` prices the order itself.** The request carries a name, a phone
number and an address; the basket is re-read, every line re-priced from the
product under a row lock, and the total worked out again. Nothing supplied can
change what is charged. Short stock refuses the **whole** order rather than
part-filling it.

**The address is required by the basket, not by the form.** A digital-only order
has nothing to deliver, so `shipping_address` comes back null rather than a copy
of the billing one.

**`shipping_same` decides whether there is a second address, and it defaults to
true.** Absent means the same, which is both the common case and what every
caller predating the field meant. Unticked, `shipping_address.*` is read and
stored on the order; ticked, it is ignored entirely — read from the flag rather
than by comparing the two blocks, because two addresses that match today are
still two answers.

**Both addresses are validated whenever the basket ships something.** Not
whichever one the parcel goes to: requiring only the delivery address made the
*billing* block optional the moment somebody ticked the box, which is an order
with nothing to put on the invoice. The two messages differ because the fields
do different jobs, and a person reading an error under a field wants to know why
that one is being asked for.

**A GSTIN is checked for shape and never against a government API.** The brief
rules that out, and a lookup on the request path is a cost this project has
measured once already at 12.5 seconds.

**The account remembers the last address and GSTIN, and the order keeps its
own.** `customers.billing_address`, `shipping_address` and `gstin` are written
at settlement and are what the next checkout opens filled in with — a ticket
customer and a store customer are one row, so somebody who has only ever raised
a ticket still arrives with a name and a phone number the shop holds. They are
**the last ones used, not a history**: the order's own copy is what an invoice
reads, and it must not move when somebody moves. `CustomerResource` exposes all
three, which is safe on that resource specifically — it is what a customer sees
of *themselves*, the reason `status_note` is absent from it.

**An order is read by `access_token`, never by its number alone.** The number is
printed on paperwork, quoted on the telephone and sequential. The token is
returned **once**, on the response that creates the order, and appears in no
other response. A wrong token is a 404, compared with `hash_equals`. The links
the API mails (`Order::url()`) and Cashfree's `return_url` point at the
frontend's `/order/{n}/open?token=…`, which moves the token into a cookie and
redirects to the clean `/order/{n}` — never at the order page with the token in
its address.

**A browser return is bound to its order and priced by the gateway.** `/pay`
records the Razorpay order it opened on the order (never in a response beyond
the session itself); `/verify` refuses a triple naming any other, then fetches
`GET /v1/payments/{id}` from Razorpay and hands *its* amount to settlement. A
triple from a cheaper order used to verify here and settle at this order's
total. A return the gateway puts no figure to is refused, never recorded.

**Payment is verified server-side and the webhook is what settles an order.**
`verify` is a convenience so the person sees the right page at once; the webhook
arrives whether or not the browser survived the redirect. Both go through one
idempotent settlement, so the pair reporting the same success produces one paid
order.

**The webhook answers 200 to everything**, including a bad signature: a gateway
reads anything else as "try again", and a retried bad signature is still a bad
signature. Its signature is computed over the **raw body**, so a re-encoded
payload will never match.

**`gateway_payment_id` is uniquely indexed, and that is the idempotency.** A
duplicate insert cannot happen, so a webhook delivered three times settles once,
takes stock once and writes one line in the trail.

**A payment for the wrong amount is recorded and settles nothing** — either a
misconfiguration or a replayed callback from a cheaper order.

**Paying creates a portal account, `active`.** Registration through the front
door leaves somebody `pending`; having paid is a stronger statement than
anything that queue establishes. An address that already has an account keeps
whatever status it has.

| `POST` | `/cart/coupon` | Applies a discount code. Throttled 15/min. An off, expired or not-yet-started code is answered exactly like an unknown one ("That code is not recognised.") |
| `DELETE` | `/cart/coupon` | Takes it off |
| `PATCH` | `/cart/contact` | `email`, `phone` — what the checkout has typed, saved on blur before any order exists. Each optional and written only when sent; a blank clears it. `phone` is held to the checkout's mobile rule. Throttled 20/min. Answers the basket |
| `GET` | `/cart/restore/{token}` | A basket reminder's link: `{data: {token}}`, the basket's own cart token, for the frontend to put in the cookie. **404** for an unknown token and for a basket that has already become an order. Throttled 30/min |
| `POST` | `/orders/{number}/items/{item}/reveal` | Hands over an activation code. Throttled 20/min |
| `GET` | `/my/orders` | The signed-in customer's orders |
| `GET` | `/my/orders/{number}` | One of them |

**Every basket read carries `contact`** — `{email, phone, reminders}`: what
`PATCH /cart/contact` stored, and whether basket reminders are switched on.
The checkout prefills from the first two and draws the line promising a
reminder only while the third is true. A basket call carrying a portal
`Authorization: Bearer` claims an unclaimed basket for that customer
(`carts.customer_id`), read with the guard named since the routes are public;
a "View as" token claims nothing, and claiming does not move the idle clock.

**Abandoned-basket reminders are two emails at most, and the API decides
all of it.** `technoware:remind-abandoned-carts`, every ten minutes, off
until `store_cart_reminders_enabled` (private `store_reminders` group — the
`store` group is public, and the fourth row is a coupon code). A basket is
reminded when it has lines, a contact — an address stored with
`contact_consent_at`, stamped only while reminders are on, or an account —
no `recovered_order_id`, an address not on `newsletter_suppressions`, and has
been idle (`updated_at`) past `store_cart_reminder_1_hours` (1–72) for the
first or `store_cart_reminder_2_days` (1–25, before the 30-day prune) and
twelve hours after the first for the second; never the first for a basket
idle over seven days; only while `QuietHours::allows()`. Each is the
`cart_reminder_1`/`_2` email and `Messenger::notify(CartReminder1|2, …)`;
the second carries `store_cart_reminder_coupon` only when `refusalFor()`
passes for that basket and address. The link is
`/store/basket/restore/{restore_token}`, never the cart token; the email's
unsubscribe is `/newsletter/unsubscribe/{restore_token}`, which
`GET`/`POST /newsletter/unsubscribe/{token}` now accept beside a subscriber's
token and answer by suppressing the address. The checkout stamps
`recovered_order_id` on the basket it ordered from.
**A cancelled unpaid order gives its coupon use back.** The use is written at
checkout (so two tabs cannot spend a single-use code) and, until now, was
never released — abandoned orders exhausted a limited code. Moving an order
with no `paid_at` to `cancelled` deletes its usage row; a paid order keeps it.

**The basket stores a coupon *code*, never an amount.** The discount is worked
out on every read, so adding a line, removing one or the code expiring all
change the answer — and a code that has stopped being valid is dropped and
**said**, because a total that quietly did not change reads as a broken shop.

**A refusal names the reason and the figure.** "That code needs an order of
₹50,000 or more" is something somebody can act on; "invalid coupon" sends them
to the telephone.

**The reveal returns the activation procedure beside the code.** The same
stored text the email is built from - product first, then the store-wide default
in the `store` settings group - so the screen and the message cannot say
different things about how to use one licence. The PDF comes back as a URL rather
than as bytes: it is on the public disk, and whoever is holding this page has
already proved they hold the order's token.

**The procedure is emailed when codes are issued; the code never is.**
`ActivationProcedureIssued` carries the steps and attaches the PDF, and points at
the order page for the key itself. Two products with different procedures are two
messages; two sharing one are a single message. A PDF that has gone from the
media library is skipped rather than failing a delivery for an order that is
already paid.

**Revealing an activation code is a POST and is counted.** An ordinary read of
the order says only that a code exists — the page is addressed by a link
somebody may leave open on a shared screen. A GET would also be pre-fetched,
proxy-logged with its URL and cached. Nothing is revealed for an unpaid order.

**`/my/orders` is authorised by a session; `/orders/{number}?token=` by a secret
in a link.** Both exist because both cases are real: most buyers here never sign
in, and the ones who do should not have to keep an email. An order belonging to
somebody else is a 404 either way.

### The wishlist (2026-09-25)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/wishlist` | The list for `X-Wishlist-Token` and/or the portal bearer. **Never writes**: nothing in hand is an empty summary and no row. Throttled 120/min |
| `PATCH` | `/wishlist` | `email` (a guest's "email me about these"; 422 on an account's list), `alerts` (boolean). 404 with no list. Throttled 10/min |
| `POST` | `/wishlist/items` | `product_id`, `variation_id?`. 201 with the list; mints a guest list (or the account's) on the first press; the same line twice is one line. 422 for a draft, another product's option, or a full list (200). Throttled 60/min |
| `DELETE` | `/wishlist/items/{item}` | A line in somebody else's list is a **404**. Throttled 60/min |
| `POST` | `/wishlist/items/{item}/move-to-basket` | One into the basket in `X-Cart-Token` (or a new one), off the list: `{data, cart}`. 422 "Choose an option…" for a product-level line on a product with options, which stays on the list. Throttled 30/min |
| `GET` | `/wishlist/alerts/{token}/stop` | The stop link in a wishlist email: switches the list's emails off. **200 and one sentence for every token.** Throttled 30/min |

The summary is `{token, account, items[], item_count, email, alerts, alerts_off}`;
each item `{id, product_id, variation_id, name, variation_name, slug, image_url,
image_alt, price_paise, price_at_save_paise, saving_paise, in_stock,
needs_choice, added_at}` — priced now, `saving_paise` null unless it is cheaper
than when it was saved.

**A token reaches a guest list and nothing else.** An account's list is
addressed by the portal bearer (read with `$request->user('sanctum')`, only
for a customer who may sign in) and its summary sends **`token: null`** — the
Next server reads that as "forget the cookie", so a cookie left on a shared
computer never opens the last customer's list.

**Signing in merges.** A request carrying both a guest token and a bearer
folds the guest's list into the account's (a line both hold keeps the
account's row) and deletes the guest's; so do `POST /auth/login` and
`POST /auth/verify-code` when the Next server forwards `X-Wishlist-Token`.
**Never under a "View as" token** — that is a staff member's browser, and the
guest cookie beside it is theirs. The merge is guarded: it never fails a
sign-in.

**Back in stock and price drop are emails, promotional, and once.** A stock
movement (`StockLedger::record()`) queues `SyncWishlistStock`, which arms every
line whose shelf is empty and tells each armed line's holder once when it is
buyable again (`wishlist_back_in_stock`); a fall in a product's or variation's
`price_paise` queues `SendWishlistPriceDrops`, which tells a holder once the
price is at least `store_price_drop_min_percent` (default 5) below the price
saved or last told (`wishlist_price_drop`). Both claim each line with a
conditional update, go only to an account that may sign in or a guest list
with an address, skip the suppression list and a stopped list (leaving the
line owed), and outside `QuietHours` re-dispatch themselves to its next
opening. `Messenger::notify()` is called beside each email.

### Admin — the store (`role:store_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/store/promo` | The shop front's promo band and the two tiles above it: the eight `store_promo_*` and fourteen `store_tile_{1,2}_*` settings rows in the `GET /admin/settings` row shape (`key`, `value`, `type`, `url` for a picture), band first then tile 1 then tile 2. **Declared above `store/{anything}`** |
| `PATCH` | `/admin/store/promo` | `settings: [{key, value}]`. **Refuses any key outside the twenty-two** with a 422 naming it, rather than ignoring it. Checks run by suffix: a `_enabled` is `0`/`1`; a `_cta_href` is a path, an http(s) URL, a `mailto:` or a `tel:` (a menu custom link's shape); an `_image_path` must be a media-library path, blank to clear |
| `GET`/`POST` | `/admin/store/products` | `?status=`, `?type=`, `?category=`, `?out_of_stock=1`, `?notices=1` (somebody waiting to hear it is back), `?q=`. Every row carries `notices_waiting` |
| `GET` | `/admin/store/products/export` | The catalogue as a CSV: one row per product and one per variation (`parent_sku` filled), money as plain rupee decimals, every cell escaped. **Declared above `products/{id}`** |
| `POST` | `/admin/store/products/import/analyse` | multipart `file` (CSV or `.xlsx`, 10MB) plus `mapping[<field>]=<column index>` once mapped. A dry run: writes nothing, answers `headers`, `fields`, the `mapping` (guessed, or as sent — a blank sent back beats a guess), `counts` per outcome, the first fifty `problems` and a `preview` |
| `POST` | `/admin/store/products/import` | `file` (the path `analyse` handed back), `mapping`. Commits; 201 with the `store_product_imports` row: `counts`, `problems` |
| `GET`/`PATCH`/`DELETE` | `/admin/store/products/{id}` | Bound by **id**. `gtin`, `mpn`, `condition`, `google_product_category`, `weight_grams`, `feed_include`, `notices_waiting`; `warranty` (255), `applications` (text), `service_ids[]` (the services that install or support it, replaced wholesale; read back as `service_ids` and `services: [{id, title, slug}]`), `faqs[]`, `answer_blocks[]`, `videos[]` (max 4, replaced wholesale: `{kind: youtube, youtube_id: <link or id>}` or `{kind: file, path}` — an MP4/WebM the media library holds — each with `title?` and `poster_path?`, a raster from the library; a link whose host is not YouTube's is a 422 on `videos.N.youtube_id`, and only the id is stored; the detail read adds `url`/`poster_url`); `meta.conditions` and `meta.answer_block_kinds` on the index |
| `GET`/`POST` | `/admin/store/categories` | `filter_specs[]` (max 12): spec labels offered as filters, in order |
| `GET`/`PATCH`/`DELETE` | `/admin/store/categories/{id}` | Deleting keeps the products. A `filter_specs` label none of the category's products carries — or one given twice — is a 422 on `filter_specs.N`, unless it is already saved. The detail read carries `spec_labels: [{label, key, products, chosen}]`, what the picker offers |

**The promo band is a narrow door onto the settings table.** Settings as a
whole are `role:admin` — the SMTP password and the COD ceiling sit in the same
table — and that does not change. A promotion on the shop front is a store
manager's job, so `/admin/store/promo` reaches the `store_promo` group (its own
settings group since 2026-09-20, public, read by the shop front by key) under
`role:store_manager` and no other key. The console's Store → Promo banner
screen is the only door: the group is left out of the settings strip, the
info bar's rule. An administrator may still write the same keys through
`PATCH /admin/settings`.

**The import matches by SKU and never creates a variation.** A line whose SKU
is a variation's updates that variation (price, stock, GTIN, MPN, weight,
oversell); one whose SKU is a product's updates the product's editable
columns; one matching nothing **creates a product** — a name and a price
required, `type` defaulting to physical and `status` to draft, the slug
derived from the name when blank. A line naming a `parent_sku` can only
update: a variation is a set of options a buyer picks from, and a cell cannot
say what those are. A SKU matching more than one row, or repeated in the
file, is refused. **A blank cell leaves the field alone**; only a mapped,
filled cell writes, so clearing a value stays a job for the form. Prices are
parsed from the text through `Money::fromRupeeString()` — `₹1,179.99`,
`1179.99` — and a cell it cannot read makes the line `invalid` rather than
₹0; `status`, `condition` and `type` are refused outside their enums; a
category or brand slug nobody has refuses the line, never mints one. Each
line is its own transaction, so a refused line costs nothing but itself.
Every stock change goes through `StockLedger::adjusted()` with a note naming
the import, so the ledger says which spreadsheet put forty on the shelf.

**`role:store_manager`, not `content_manager`.** Blast radius rather than skill:
this holds prices, stock and the digital-code inventory, none of which can be
taken back once somebody has paid. Narrower than `content_manager` rather than a
superset — `StoreCatalogueTest` asserts a content manager cannot reach the store
*and* that a store manager cannot edit the blog.

**Everything here has a price.** There is no "sellable" flag, because the table
*is* the shop — which removes the whole class of bug where a Buy button appears
with nothing behind it.

**Variations are replaced wholesale but keep their ids.** An order item records
the variation it was bought as, so delete-and-recreate would renumber them
underneath every historical order. A row carrying an `id` is updated; one
without is created; only rows nobody sent are deleted. `options` is an ordered
map through `App\Casts\SpecSheet`, because MySQL reorders JSON object keys and
the selectors on the product page would shuffle between two loads.

| `GET` | `/admin/store/orders` | `?status=`, `?open=1`, `?unpaid=1`, `?q=` on number, name, email or tracking |
| `GET` | `/admin/store/orders/{number}` | Bound by **order number**, which never changes |
| `POST` | `/admin/store/orders/{number}/status` | Checked against the enum |
| `PATCH` | `/admin/store/orders/{number}/shipping` | Courier, number, link, notes |
| `POST`/`GET` | `/admin/store/orders/{number}/invoice` | Upload and stream the manual invoice |
| `POST` | `/admin/store/orders/{number}/notes` | Staff-only |
| `POST` | `/admin/store/orders/{number}/fulfil` | Issue outstanding activation codes |
| `GET`/`POST` | `/admin/store/products/{id}/codes` | The code inventory. The listing never contains a code |
| `POST` | `/admin/store/codes/{id}/reveal` | Read one, recorded |
| `DELETE` | `/admin/store/codes/{id}` | Unsold codes only |
| `GET` | `/admin/store/dashboard` | The shop at a glance. `?days=` of 7, 30 or 90. `funnel` is `{product_views, paid_orders, views_to_orders}` — the views from Google Analytics over the window, **null** when GA4 is not connected or refused, and the rate (paid orders ÷ views, 0–1 to four places) null with it or over a measured zero. `recovered` is `{reminded, recovered, revenue_paise, rate}` — baskets given a reminder in the window, how many of those became an order, those orders' total when paid, and the share — or **null** when no reminder went out. `most_wished` is the five products on the most wishlists, `{id, name, wishes}` counted by list, all time, `[]` when nobody has saved anything |
| `GET` | `/admin/store/reports` | What sold between two dates. `?from=`, `?to=`, `?group=` |
| `GET` | `/admin/store/reports/export` | The same range as a CSV. `?type=orders` or `products` |
| `GET` | `/admin/store/stock` | What came in and what went out. `?from=`, `?to=`, `?product=`, `?reason=`, `?direction=in\|out` |
| `GET` | `/admin/store/stock/movements` | The ledger behind those totals, paged |
| `GET` | `/admin/store/stock/export` | The same rows as a CSV |
| `GET`/`POST` | `/admin/store/coupons` | |
| `GET`/`PATCH`/`DELETE` | `/admin/store/coupons/{id}` | Deleting a used code is refused |

| `POST` | `/admin/store/orders/{number}/payments` | Record money that arrived without a gateway |
| `POST` | `/admin/store/orders/{number}/refunds` | Record money that went back: `amount_paise`, `reference`, `note`. A `payments` row with status `refunded`; partial refunds add up, and the amount that completes what was paid moves the order to `refunded`. 422 on an unpaid order, past the ceiling, or an order already refunded in full. Calls no gateway |

**Nothing here can mark an order paid *from a dropdown*.** `PendingPayment` may
only move to `Cancelled`, and an illegal move is a 422 naming both states. The
one exception is `POST .../payments`, and the shape of it is the argument: an
amount, a reference and the name of whoever confirmed it, recorded as a payment
row. It **refuses a gateway order outright** - Razorpay says whether that was
paid - and it stamps `paid_at` without touching the status, because a
cash-on-delivery order may be `dispatched` when the cash is banked and
overwriting that would throw away where the parcel is. A short payment is
recorded and flagged in the trail rather than refused.

**Bound by order number, not id** — the rule every CMS entity follows exists
because an edit form changes the slug it is addressed by, and nothing about an
order can change its number.

**The invoice is uploaded, not generated**, to the private disk, streamed by an
authorised route. `invoice_path` never appears in a response.

**A used coupon cannot be deleted.** Its usage rows explain why an order's total
is what it is. Switching it off is the alternative, and the refusal says so.

**The dashboard and the report share one definition of "paid".**
`Order::scopePaid()`, derived from `OrderStatus::isPaid()`. Three screens quote
that word and none of them may mean a different thing by it.

**Every figure that has not been measured is null, not zero.** An average of
nothing is not an average of zero, and `sample` travels beside it - the same
amount across two orders and across two hundred are not the same claim.
**Refunds are reported separately** rather than subtracted: the gateway reports
gross and refunds apart, so a figure matching neither has to be reverse
engineered before it can be used.

**`attention` is what is waiting on a person**, and each figure is the same query
as the list it links to. `awaiting_stock` is products with a back-in-stock
notice nobody has sent, the `?notices=1` filter's own scope. `awaiting_codes` is the one worth knowing about: a paid
order short of an activation code reads as `paid` in every status column, so
before this nothing in the console said a customer was waiting. `out_of_stock`
and `codes_exhausted` are the two that are about the shop rather than the queue -
a published listing with a dead Buy button, and a digital product still selling
with nothing left to issue.

**A report echoes its range back, always.** A report that quietly covered
something else is worse than one that refuses, because the figure gets written
down. A backwards range is corrected - swapping two dates in a form is a slip -
and anything over 366 days is a 422 naming the limit. It ranges on `placed_at`
rather than `created_at`: one is when the row was written, the other is when the
order was placed.

**GST is read from each order, never recomputed.** It is extracted at checkout so
the two halves add back to what was charged; working it out again here would
agree most of the time and, on the roundings where it did not, file a return that
disagrees with the money taken.

**The report's `statuses` block counts every order, paid or not**, and says so on
the screen - an abandoned basket belongs in "what happened to the orders" and not
in a figure anybody banks. It is the one part of the response that is not
`paid()`.

**Stock in and out needed a ledger, because half of it was recorded nowhere.**
`stock` is a bare integer, and two things moved it: settlement decremented it,
and the admin form wrote whatever number somebody typed. The first is derivable
from the order lines after the fact; the second left no trace at all, so a level
going from 4 to 40 was indistinguishable from one that was always 40 and "what
arrived this month" had no answer. `stock_movements` records every change, and
`GET /admin/store/stock` reads it.

**`delta` is signed — positive in, negative out — rather than a quantity beside a
direction.** Two columns that must agree is one that can disagree, and every
figure in the report is then a plain sum. The resource still sends `direction`
and `quantity` beside it, because a minus sign in a table is a thing the eye
skips.

**Every sale already made was recovered from the orders**, so the report is not
empty on the day it ships — physical lines of orders with a `paid_at`, which is
this application's one definition of paid. Those rows carry **no
`balance_after`**: the levels they left behind stopped existing before anybody
wrote them down, and inventing them would be worse than admitting it.

**There is no opening or closing balance, deliberately.** They can be computed
exactly for a range lying entirely after the ledger was added and not at all for
one that does not. A column that is right for recent months and quietly wrong for
older ones is worse than no column, because the figure gets written down either
way. `stock_now` is reported instead — and it counts the **active variations**
when a product has any, because a variated product's own `stock` column is dead
and `inStock()` answers from the set. Reading the parent's column reported "4 in
stock" for a product whose variations held thirteen.

**A movement is recorded on the affected row count, not on having tried.**
`takeStock` already tells "not tracked" from "not enough" by that count, and a
ledger row for a decrement that did not happen is a lie about the shelf — which
is read to decide what to order. For the same reason a save that did not change
the stock writes nothing, and an untracked product writes nothing at all.

**There is no `store`.** A movement exists because stock moved, and an endpoint
that could invent one would make every figure unauditable — the reason the
activity log has no write path and `/admin/leads` has no create.

**The CSV's escaping is load-bearing here rather than defensive.** Every outgoing
change is negative, so a raw `-3` in the change column is a formula to Excel.
`Csv::escape` prefixes it, as it does for `=`, `+` and `@`.

**A product deleted since still appears in what sold.** The name comes from the
order item's own snapshot, which is why an order item snapshots at all; dropping
it would leave the product breakdown quietly failing to add up to the revenue
above it. `id` is null for one that has gone.

**The CSV writes money as a plain decimal.** A currency-formatted cell is text to
Excel and cannot be summed, which is the one thing the file is opened to do - so
the cell is `118000.00` and the column heading carries the unit. Every cell
beginning `=`, `+`, `-` or `@` is escaped, because Excel executes those.

**Money crosses the wire in paise, as integers.** The console shows and collects
rupees and converts by parsing the text; a decimal on the wire is where a price
becomes 1179.9999.

**A store category carries `seo`/`seo_defaults` like every other CMS entity
now.** It did not: no `HasSeo`, no override row, and `/store/categories/{slug}`
-- a real page in the sitemap since the store shipped -- had no way to set its
own title or description, only the raw `name`/`description` columns. The admin
resource gates `seo`/`seo_defaults` on `$detail` (index never carries them, the
rule `ProductCategoryResource` already follows); the public one exposes `seo`
when the relation is loaded, on both the index and the detail read, matching
`StoreProduct`.

## Customer portal

`Authorization: Bearer <portal token>`. Every query is scoped to the
authenticated customer — no code path here can reach another customer's data.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | Public. Returns token + customer |
| `POST` | `/auth/logout` | Revokes the current token |
| `GET` | `/auth/me` | The signed-in customer, and `meta.impersonated` — true on a token from `POST /admin/customers/{id}/impersonate` |
| `PATCH` | `/auth/profile` | Name, email, company, phone, password, **billing/delivery address and GSTIN**. Changing the password revokes every other session. **Changing the email un-confirms it** and sends the confirmation link to the new address |
| `GET` | `/tickets` | `?status=`, `?per_page=` (max 50) |
| `GET` | `/tickets/summary` | Counts by status for the dashboard |
| `POST` | `/tickets` | multipart. `subject`, `description`, `ticket_category_id`, `priority`, `attachments[]`, `is_sensitive` (the description stored encrypted; see the message rule below) |
| `GET` | `/tickets/{reference}` | Bound by reference (`TW-2026-00001` — the prefix is the `ticket_reference_prefix` setting, and a ticket keeps the one it was given), not id. Carries `events` — the trail of status and assignment changes, oldest first; never a note — and `merged_into`, the reference of the ticket this one was merged into, or null |
| `POST` | `/tickets/{reference}/messages` | multipart. `body`, `attachments[]`, `is_sensitive` (stored encrypted, announced but never quoted in the email, never sent to a webhook — see below) |
| `POST` | `/tickets/{reference}/messages/{id}/rating` | `rating` 1–5 on a staff reply. Changeable. 404 for anything that is not a visible staff reply on this ticket |
| `POST` | `/tickets/{reference}/messages/{id}/report` | `reason` (5–2000 chars). Re-sending re-words it and keeps `reported_at` |
| `POST` | `/tickets/{reference}/close` | |
| `POST` | `/tickets/{reference}/reopen` | |
| `GET` | `/ticket-attachments/{id}` | Streams the file |

**A customer keeps their own address, and `PATCH /auth/profile` is where they
edit it.** `billing_address.*`, `shipping_address.*`, `shipping_same` and
`gstin`, on the same shape the checkout uses (`App\Support\Address`) so the two
screens cannot disagree about what an address is. Nothing here is ever
required — an address is a condition of delivering something, not of holding an
account — and the checkout is where it becomes compulsory.

**A block left blank is stored as null, not as six null keys**, so a customer
who has moved can actually clear the old one. `shipping_same` is read from the
request rather than by comparing the two blocks: two addresses that match today
are still two answers, and the account stores the answer. A request that
mentions neither leaves both alone, so editing a phone number cannot silently
clear an address.

**Internal notes never appear here.** The customer controller loads
`publicMessages`, not `messages`, and the attachment download refuses
anything hanging off an internal note.

**A customer's verdict on a staff reply rides on the message.** `rating`,
`rated_at`, `report_reason`, `reported_at` on every `TicketMessage` — null
until given. Only a *visible staff reply on the customer's own ticket* can be
rated or reported; their own message, an internal note, another customer's
ticket and a message from a different ticket named under this one all
answer **404**, never 403, because a 403 confirms what this endpoint must
not. A rating may be changed (the chatbot's rule: one that cannot be taken
back is one people stop giving); a report may be re-worded and keeps the
moment it was first raised, and nothing un-reports — a report withdrawn is
still one the desk should have seen. The admin queue filters on
`?reported=1` (`Ticket::reported()`), the admin ticket resource carries
`is_reported` (from the loaded messages on a detail read, a `withCount` on
the index), and the console shows the stars and the reason under the reply.

**Attachments live on the private disk** and only ever stream through this
authorised endpoint. There is no public URL for one.

**A message marked `is_sensitive` is stored encrypted (2026-09-21).** Either
side may set it. The body is sealed with `Crypt` on save and opened on read,
so `body` on every resource is the plain text and `is_sensitive` is the flag
the lock is drawn from; the row in the table is ciphertext. The
`TicketReplied` email carries "This reply is marked sensitive. Open the
ticket to read it." in place of the excerpt, and **no `ticket.replied`
webhook is emitted** — the delivery row would hold the body in clear. A row
that will not decrypt answers "This message could not be decrypted." rather
than a 500. **The ticket's own `description` takes the same switch** on
`POST /tickets`: sealed the same way, `is_sensitive` on the ticket resource,
the `TicketCreated` email announcing it without quoting it — and, unlike a
message, the ticket's webhooks are still emitted with `description` redacted
to "Marked sensitive; open the ticket to read it.", because a ticket's
existence is what an integration is told. The subject is never sealed.

---

## Admin — tickets (`role:support_engineer`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/dashboard` | Counts, high priority, status breakdown, and a `metrics` block: 30-day volume, trend, median first response and resolution, SLA rate, open by priority and category, and `arrivals` — `{days: 90, cells[7][24], peak, total}`, tickets opened by weekday (0 = Monday) and hour in IST, every cell present. `metrics.volume_series.previous` is the same number of buckets immediately before `points`, aligned by position (2026-10-05). `leads` adds `series` (new leads a day, 30 days, spam out) and `funnel` `{days: 90, received, contacted, won}` — what happened to the leads that arrived, never a status snapshot. `?volume=month\|quarter\|half\|year` picks what `metrics.volume_series` covers — `{period, bucket, points[{date, end, created, resolved}]}` in 30 days, 13 or 26 Monday weeks, or 12 months, every bucket present, an unknown period a month; `metrics.volume` stays the 30-day daily series. `?since=<iso>` adds `new_since` — tickets, enquiries and (for a sales role) leads created after that moment; null when not asked |
| `GET` | `/admin/new-since?since=<iso>` | The sidebar's poll: `{since, tickets, leads, enquiries}` created after that moment — each **null for a role that cannot open the screen**, never zero. Staff-wide; three counts and nothing else, where `/admin/dashboard` builds thirty days of metrics. 422 without `since` |
| `GET` | `/admin/search?q=` | The console's command palette. Groups of five — tickets, customers, leads, products, posts, pages, orders, shop products — **each present only for a role that may open it**. Staff-wide, not role-gated; the controller filters. Two-character floor. `admin_path` is a console route |
| `GET` | `/admin/users` | Active staff, for assignment pickers |
| `GET` | `/admin/tickets` | `?status=`, `?priority=`, `?assigned_to=`, `?unassigned=1`, `?overdue=1`, `?reported=1` (a reply the customer reported), `?open=1` (the dashboard's `Ticket::open()`), `?customer=<id>` (one customer's — the merge picker, with `?open=1`), `?q=`, `?per_page=` (max 100). Critical first, then oldest — or `?sort=created\|due\|subject\|status\|priority` with `?dir=asc\|desc` |
| `POST` | `/admin/tickets/bulk` | `ids[]` (max 50) plus the `PATCH` fields. **200 always**, with `updated[]` and `refused[]` per reference — an illegal move on one ticket never undoes the others. Declared above `tickets/{ticket}` |
| `GET` | `/admin/tickets/{reference}` | Includes internal notes and the audit trail |
| `PATCH` | `/admin/tickets/{reference}` | `status`, `priority`, `assigned_to`, `ticket_category_id` |
| `POST` | `/admin/tickets/{reference}/reply` | multipart. `body`, `is_internal`, `is_sensitive`, `attachments[]` |
| `POST` | `/admin/tickets/{reference}/merge` | `into` (a reference). Answers the **target**. 422 on `into` with a sentence when the two are one ticket, belong to different customers, the source is already merged, the target is not open, or nothing answers to the reference |
| `GET` | `/admin/tickets/{reference}/canned-replies` | Every saved reply with its placeholders **already filled for this ticket** and the signed-in engineer. Not paginated |
| `GET` | `/admin/ticket-attachments/{id}` | Staff download — no ownership check, and internal-note attachments are allowed |
| `GET`/`POST` | `/admin/canned-replies` | The desk's saved replies, stored text with its `{{placeholders}}`. `?q=`, `?per_page=` (max 100). `meta.placeholders` names each placeholder with a line about it |
| `GET`/`PATCH`/`DELETE` | `/admin/canned-replies/{id}` | `title`, `body` (plain text), `sort_order` |

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

**`?sort=` is an allowlist per list, and `App\Support\ListSort` is the one
implementation.** Tickets, customers, orders and products each name the
columns a header may sort by; an unrecognised key falls back to the list's own
order rather than answering 422 (the catalogue's rule), `dir` is `asc` or
`desc`, and every ordering ends on the key so a page boundary cannot show a
row twice. The console's column headers are the control; the filter bar's
select stays for phones, where the headers are gone.

Status changes are validated against `TicketStatus::canTransitionTo()`; an
illegal move returns 422 naming both states. Every change is written to the
ticket's event log. Assigning an unassigned `open` ticket moves it to
`assigned` automatically, and a customer-visible reply on an `open` ticket
moves it to `in_progress` and stops the first-response SLA clock — an
internal note does neither.

**Closing a ticket sends the satisfaction survey** (2026-09-30, `docs/tickets.md`).
Once per ticket, from whichever door closes it, unless `ticket_survey_enabled`
is off or the ticket was merged into another. The customer's email carries five
links to the website's `/ticket-survey/{token}?rating=1..5`; the two public
routes behind that page, throttled 60/min and 20/min:

| Method | Path | Notes |
|---|---|---|
| `GET` | `/ticket-surveys/{token}` | `{reference, subject, answered, rating, rating_label, comment, ratings[{value,label}], comment_max}`. Reads only — **never records an answer**. A token that is not 64 hex characters, or that nobody has, is a 404 |
| `POST` | `/ticket-surveys/{token}` | `rating` 1–5 (422 otherwise), `comment` optional plain text up to 1000 characters (blank stored as null). Answers the same shape. May be sent again to change the answer; `answered_at` keeps the first time |

The token appears in no response. `GET /admin/tickets/{reference}` carries
`survey` — `{sent_at, rating, rating_label, comment, answered_at}`, or `null`
while none was sent, `rating` null while unanswered — and a portal read of the
same ticket carries no `survey` key.

**A merge is one transaction and every state may make it.** `merge` re-points
the source's messages and attachments at the target, sets
`tickets.merged_into_id` on the source, closes it with `closed_at` —
directly, past `canTransitionTo()`, because a merge is not a ticket being
worked to a close but a ticket ceasing to be where the work is — writes a
`merged_into` event on the source (`to_value` the target) and a
`merged_from` on the target (`from_value` the source), and leaves an internal
note on the target reading "Merged from TW-… — <subject>" with the source's
original request under it. Then one `TicketMerged` to the customer, queued,
through `Notifier`, editable at `/admin/settings/email-templates` as
`ticket_merged`.

**Across customers is refused, not confirmable.** It would put one customer's
messages on another's ticket — the one thing the portal's ownership check
exists to make impossible — so the 422 says so and no confirmation reaches
it.

**A merged source is closed for good.** `PATCH` refuses every status change
on it naming the target, `POST /tickets/{reference}/reopen` refuses from the
portal, and both ticket resources carry `merged_into` (the target's
reference, or null) so a read of the source still answers 200 and the
screens link to where the conversation went. The inbound piper follows
`merged_into_id` to the end of the chain before the "sender's own open
ticket" rule, so a reply quoting the old reference lands on the target
rather than opening a follow-up to a ticket that was closed to make one
thread.

**Saved replies are filled by the API, never by the console.** The
per-ticket read runs each body through `Placeholders::fillText` with
`customer_name`, `first_name` (the first word of the name), `company`,
`reference`, `subject` and `agent_name`; an unknown name is stripped rather
than left in braces. `EmailRenderer::personalise` is deliberately not used —
it pre-seeds a *subscriber's* fields and turns a blank first name into
"there", and a reply pasted into a ticket has a customer. The management
index carries `meta.placeholders` so the form's chips and the fill are one
list.

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

## Admin — leads (`role:sales_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/leads` | `?status=`, `?band=`, `?channel=`, `?assigned_to=`, `?unassigned=1`, `?open=1`, `?overdue=1`, `?source_path=`, `?q=`, `?sort=`, `?per_page=` (max 100) |
| `GET` | `/admin/leads/export` | The same rows as a CSV. **Declared above `leads/{lead}`** |
| `GET` | `/admin/leads/{id}` | Adds the trail, the score's reasons, the raw submission and the other enquiries from that address |
| `PATCH` | `/admin/leads/{id}` | `status`, `assigned_to`, `follow_up_at`, `value_paise`, `note` |
| `POST` | `/admin/leads/{id}/notes` | `body` |
| `DELETE` | `/admin/leads/{id}` | Keeps the submission it was made from |

**Every contact form in the product lands here.** The enquiry form and every
editor-built form both go through `App\Support\Crm\LeadIntake`, so the two
cannot drift into two answers about what a lead is — the rule `SubscriberIntake`
follows for the newsletter.

**A lead is its own table, not columns on `enquiries`.** An editor-built form
need not collect an email address at all and `enquiries.email` is `NOT NULL`;
its answers are keyed by names an editor chose. So a lead **snapshots** the
contact and points back at the submission, the split an order item already makes
against a product: one is the record of what somebody sent, the other is the
workable one that gains a status, an owner and a follow-up date.

**There is no `store`.** A lead exists because somebody filled in a form, and an
endpoint that could invent one would make every figure on the screen
unauditable — the reason the activity log has no write path either.

**The source page is posted by the browser, not read from the request.** Every
submission arrives through a Next.js Server Action, so `Referer` on this side is
the Next server: a `source_url` filled from it would record one plausible value
for the whole site and never report an error. The public endpoints therefore
accept an envelope of `_source_url`, `_source_title`, `_referrer`, `_utm_source`,
`_utm_medium` and `_utm_campaign`. **Every key begins with an underscore** so it
cannot collide with an editor's field name, which is validated against
`^[a-z][a-z0-9_]*$` — impossible by construction rather than forbidden by a rule.
`source_path` is **derived** from the URL here rather than accepted, so a lead
cannot claim a page its own URL contradicts.

**The buying words are the constant plus Leads → Scoring.** `lead_intent_words`
(private `leads` group) extends `LeadScore`'s list one word or phrase per line,
lower-cased and de-duplicated, matched with the same word boundaries and
inflections. `php artisan technoware:rescore-leads` restates every lead on the
current words — report only until `--write` — and is the one exception to the
score being the score at intake.

**The score is a rubric and it travels with its reasons.** Eight checks, each
declaring whether it *applies* before whether it *passed*, divided by the
applicable weight — the shape `SeoScore` uses. `score_reasons` carries every
check with its label, weight and, on a failure, what would have earned it: a
number without its working is one nobody argues with and therefore one nobody
trusts. It is the score **at intake** and is not rewritten, so a rubric change
does not silently restate history. `score_band` is `hot`/`warm`/`cold`, or
**`unscored`** for a lead that predates the feature — which is a different claim
from having scored zero.

**Nothing is filed as spam automatically.** Junk scores low and stays in the
queue. Auto-filing eventually hides a real customer whose message was three
words, and the failure is silent and permanent.

**`allowed_next` says which moves this lead may make**, itself first, so the
console's dropdown offers only what a `PATCH` will accept. A dropdown is a
promise — the rule `schema_type` settled — and offering six statuses then
refusing four with a 422 is a form arguing with whoever filled it in. An illegal
move is a 422 naming both states. **`spam` and `won` are both reversible**: a
misfiled real enquiry is a customer nobody ever answers.

**`contacted_at` is stamped by reaching a state that means somebody replied**
and is never cleared — the rule `resolved_at` had to be taught on tickets.
`New → Lost` is a lead written off unanswered and records no contact.
`closed_at` *is* cleared by a move back into the pipeline, or a revived lead
appears in a report of deals settled in a month it is still being worked in.

**Nothing merges two enquiries from one address.** The obvious deduplication
loses the second message, which is routinely the one that says what they actually
want. `related` lists everything else that address has sent, and having been in
touch before is a scoring signal — the useful half without the destructive half.

**Deleting a lead keeps the submission.** That row is the record of something a
person actually sent, and clearing a pipeline is not a reason to destroy it.

**`role:sales_manager`, not `support_engineer`.** Blast radius rather than skill:
this is every prospect's name, telephone number and expected spend. Support
answers people who have already bought.

## Admin — activity log (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/activity` | `?action=`, `?q=` (actor name, address, record label), `?per_page=` (max 100). Newest first. `meta.retention_days` and `meta.actions` |
| `GET` | `/admin/onboarding` | The dashboard's "Getting started" checklist (2026-10-05, `App\Support\Onboarding`): `{steps: [{key, label, hint, href, done}], done, total}`. Every step is answered from real state — the seeded phone, address, figures and social URLs are recognised by their exact values — and `href` is a console path |

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

## Blog comments (`role:content_manager` to moderate)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/blog-comments` | `?status=`, `?post=`, `?q=`, `?page=`. **Defaults to waiting**, not everything |
| `POST` | `/admin/blog-comments/moderate` | `ids[]` and `status`. One comment or fifty |
| `DELETE` | `/admin/blog-comments/{id}` | For good. Marking spam is the reversible choice |

**Everything arrives `pending`, including from a signed-in customer.** A real
account is not evidence about a particular comment, and the moment there is one
exception the queue stops being trustworthy — somebody has to remember which
were auto-approved and go and look at them anyway.

**Nothing is auto-filed as spam either.** A junk comment scores low and waits
like the rest. Auto-filing eventually hides a real reader whose comment was
three words, and the failure is silent and permanent — the rule `/admin/leads`
already follows. `score` is a hint for whoever is reading two hundred rows and
decides nothing; `score_reasons` travels with it, because a number without its
working is one nobody argues with and therefore one nobody trusts.

**The body is plain text and is stored plain.** `HtmlSanitiser` protects a
content manager's markup; pointing it at anonymous input is a different
proposition, and the allowlist is anyway the set the editor's toolbar produces —
none of which a reader needs to say "we hit this too". Plain text rendered
escaped removes stored XSS from the feature rather than defending against it.

**One level of replies.** A reply to a reply is re-pointed at the top-level
comment on write, because a parent id is a number in a request body: "the form
only sends top-level ids" is not a property of anything. A parent on another
post is dropped.

**Three gates decide whether a post is open**: the site-wide `comments_enabled`
(default **off** — this puts a public form on every article and a queue on
somebody's desk), the post's own `comments_enabled` (default on, so the
migration does not silently close every existing article), and
`comments_closed_after_days`. The last is the anti-spam measure that costs a
real reader nothing: an old article is where spam concentrates, because nobody
is watching and there is no conversation left to interrupt. Zero means never.

**A closed post refuses rather than only hiding its form** — a tab left open
across the day comments were closed would otherwise post into a discussion that
has ended, the reasoning a closed vacancy already follows.

**The public read carries no address, score, IP or user agent**, structurally
rather than by remembering to strip them — the lesson the ticket module's
internal notes taught. The IP is stored **hashed with `APP_KEY` as the salt**:
nothing needs the address, only whether two comments came from the same place,
and an unsalted hash of an IPv4 address is reversible by trying all four billion.

**The desk notification is throttled to one an hour, not one per comment.** A
spam run posts four hundred in minutes, and four hundred emails is the
notification people build a filter for — after which the one that matters
arrives in a folder nobody opens. Nobody is waiting on a blog comment, which is
what makes this different from the enquiry notifications.

**`approved_at` is stamped on arrival and never cleared** — the rule
`resolved_at` had to be taught on tickets. Un-approving does not un-happen the
moment somebody approved it. Moderation writes go one row at a time, because a
mass `update()` skips `moveTo()` and would leave a queue of comments approved by
nobody at no time.

**Only spam and binned comments are pruned** (`technoware:prune-comments`,
30 days, on `updated_at`). A published comment is part of the article and a
waiting one is somebody's unanswered contribution. Spam is kept for a while
deliberately: it is the only place a real comment filed by mistake can be found.

## Admin — JavaScript errors (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/client-errors` | **Public.** A browser reporting its own failure. Throttled 20/min, answers 204 always |
| `GET` | `/admin/client-errors` | `?q=`, `?area=`, `?all=1`, `?page=`. `meta.unresolved`, `meta.retention_days` |
| `POST` | `/admin/client-errors/{id}/resolve` | Marks one dealt with |

**Public and unauthenticated, because that is where the errors are.** A visitor
on the marketing site has no session and an error boundary on the sign-in screen
fires before anybody has one, so gating this would collect exactly the failures
we already hear about and none of the rest.

**Grouped by fingerprint, not listed by occurrence.** Forty people hitting one
bug is one row with a count — the call `/admin/chat/unanswered` already makes.
The fingerprint is a hash of the area, the message and Next's `digest`, and it
is a **unique index** so the recording path can upsert: the read-then-write
version passes every test on one thread and races the moment two browsers hit
the same bug together, which is the normal case for a bug worth knowing about.

**`digest` matters more than it looks.** A production build replaces a server
error's message with a hash, so it is frequently the only way to match what the
browser saw to the stack trace in the server log.

**Resolving is a tick, not a delete, and it re-opens by itself.** Every report
clears `resolved_at`, so a fix that did not hold says so instead of staying
ticked off. A row deleted is a bug that comes back looking new. Only age removes
rows — `technoware:prune-client-errors`, 30 days, ranging on `last_seen_at`
because a bug first seen a year ago and again this morning is current.

**Answers 204 to everything, including a body it discards.** The caller is an
error handler: telling it that reporting the error also failed gives it nothing
to act on and invites a loop.

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
| `POST` | `/admin/customers/{id}/impersonate` | "View as": `{token, customer, expires_at}` — a one-hour `impersonation` token. 422 with a sentence unless the account is active |

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

**"View as" mints a token of its own, never a `portal` one.** `impersonate`
answers a Sanctum token named `impersonation` with abilities `portal` and
`impersonation`, expiring in an hour; a fresh press retires the previous one
for that customer. It does not go through the login's `issueToken()`, which
deletes every `portal` token first — signing the customer out of their own
browser while somebody is trying to help them — and stamps `last_login_at`,
which the console shows as "Last signed in" and a staff visit must not forge.
Only an active account: `EnsureUserIsCustomer` refuses every portal request
for any other status, so a token for one would open a tab that 403s. The
route sits in the `customers` group and is recorded in the activity log with
the customer as subject; the logger reads request input only, so the token
never reaches it. On the token, `GET /auth/me` carries `meta.impersonated:
true` (the portal draws its banner from it) and `PATCH /auth/profile` refuses
`email` — the one field a staff session may not touch, because the portal
path changes an address without re-verifying it. Everything else is theirs
to do, an order included: reproducing the customer's problem is the point.
The frontend reaches it from a **POST-only** route handler for the reason
`docs/customers.md` gives.

## Admin — CMS (`role:content_manager`)

All five verbs per entity, all bound **by id, not slug** — the edit form
changes the slug it is addressed by, so a slug-bound route would break
mid-save.

### Entities

| Entity | Base path | Beyond the common fields |
|---|---|---|
| Blog posts | `/admin/blog-posts` | `author_id`, `published_at`, cover image, `is_featured`, `comments_enabled` (the post's own switch; the site-wide one must be on too — accepted on update since 2026-09-28, before which it could be set only on create), `category_ids[]` (replaced wholesale, `[]` clears), `faqs[]`, `answer_blocks[]`. `reading_minutes` is derived on save and not accepted |
| Knowledge articles | `/admin/knowledge-articles` | `tags[]`, `knowledge_category_id`, `published_at`, `faqs[]`, `answer_blocks[]`. `view_count`/`helpful_count` are read-only telemetry |
| Case studies | `/admin/case-studies` | `client_name`, `industry_id`, `results[{value,label}]`, cover image. **No `published_at`** — status alone decides |
| Solutions | `/admin/solutions` | `problem_statement`, `overview` (rich text), `benefits[]`, `technologies[]`, `icon`, `hero_image_path`, `sort_order`, `product_ids[]`, `industry_ids[]`, `faqs[{question,answer}]`, `answer_blocks[]` |
| Services | `/admin/services` | `icon`, `sort_order`, `service_category_id` (nullable, must exist), `image_path` (a media-library path, 422 otherwise), `highlights[]` (at most 6, each ≤ 40 characters; trimmed, blanks and case-insensitive repeats dropped, `[]` clears, absent leaves them), `faqs[{question,answer}]`, `answer_blocks[]`. No `published_at`. Reads add `category_name` and `image` |
| Service categories | `/admin/service-categories` | `name`, `slug` (derived when blank, unique), `description`, `icon`, `sort_order`, `image_background`, `is_active`; rows carry `services_count`. Titled `name`, **no `status`, no `seo`** — taxonomy; its slug is a tab fragment, not an address, so it writes no redirect. Deleting leaves its services uncategorised |
| Industries | `/admin/industries` | `icon`, `sort_order`, `solution_ids[]`, `faqs[]`, `answer_blocks[]`. Titled `name`, **not** `title`, and has **no `status`** — an industry is reference data the catalogue points at, not something you draft |
| Pages | `/admin/pages` | `template`, `published_at`, `faqs[]`, `answer_blocks[]`. No `summary`. `blocks` is deliberately not accepted — the column exists for block-assembled pages, which need a block editor; raw JSON here would let a typo corrupt a page invisibly |
| Product categories | `/admin/product-categories` | `parent_id`, `icon`, `image_path`, `sort_order`, `faqs[]`, `answer_blocks[]`. Titled `name`, and **no `status`** — taxonomy, like industries. `description` is plain text, not rich |
| Products | `/admin/products` | `sku`, `brand_id`, `product_category_id`, `specifications`, `features[]`, `images[]`, `datasheet_path`, `is_featured`, `sort_order`, `solution_ids[]`, `related_product_ids[]`, `faqs[]`, `answer_blocks[]`. Titled `name`. **No `published_at`** — status alone decides |
| Brands | `/admin/brands` | `logo_path`, `sort_order`, `is_featured`, `partner_tier`, `faqs[]`, `answer_blocks[]`. Titled `name`, and **no `status` and no `seo`** — a brand is a filter facet on the product listing, not a page; it takes FAQs and answer blocks because "is this brand's kit supported?" is a question the brand is the record to answer |
| Certifications | `/admin/certifications` | `issuer`, `certificate_number`, `image_path` (the certificate itself, drawn 3:4 portrait), `file_path` (a media-library PDF), `issued_on`, `valid_until`, `description`. Titled `name`; **no slug, no `seo`** — listed on `/certifications`, no page of its own. `is_expired` on the admin resource |
| Clients | `/admin/clients` | `logo_path`, `website_url` (http(s) only), `industry_id`, `note`, `is_featured`. Titled `name`; no slug, no `seo` |
| Team members | `/admin/team-members` | `designation`, `department`, `photo_path`, `bio`, `email`, `linkedin_url`, `certifications[{name,issuer,credential_id,issued_on,expires_on}]` — **replaced wholesale**, `[]` clears. `meta.departments` on the index and the read. Titled `name`; no slug, no `seo`, **no phone** |
| Sliders | `/admin/sliders` | `layout` (`full`, `split`, `cards`, `fan` — sent as `meta.layouts`; `cards` is the stacked-cards carousel and `fan` the fanned photo gallery, under both of which `transition` is ignored and two slides are the minimum), `transition`, `caption_animation` (how the words arrive: `none`/`fade`/`rise`/`slide`/`zoom`, refused outside the list, sent as `meta.caption_animations`), `autoplay`, `interval_ms`, `slides[]`. Titled `name`, and **no `seo`** — a slider is embedded in a page, it is not one. `meta.transitions` carries the options, defaulting to `slide` rather than `fade` as Galleries does — see below |
| Galleries | `/admin/galleries` | `subtitle`, `transition`, `autoplay`, `interval_ms`, `groups[]`, `items[]`. Titled `name`, and **no `seo`** — same reason as a slider. `meta.transitions` carries the options |
| Forms | `/admin/forms` | `submit_label`, `success_message`, `redirect_url`, `notify_email`, `embed_enabled`, `fields[]` (each with `settings` and `show_if`). Titled `name`, and **no `seo`**. Its submissions, uploads and export are under "Forms: the builder, submissions and uploads" below |
| Popups | `/admin/popups` | `image_path`, `body` (rich text — a picture, a message, or both; neither is a 422 on `body`), `link_url`, `link_new_tab`, `sections[]`, `paths[]`, `size`, `frequency`, `trigger` (`delay`, the default, or `exit` — exit intent; refused outside the list), `delay_ms`, `starts_at`, `ends_at`, `sort_order`. Titled `name`, and **no `slug` and no `seo`** — a popup has no URL of its own and is not embedded by shortcode either. `meta` carries `sections`, `sizes`, `frequencies` and `triggers`; the admin resource adds `match_paths`, what the two lists resolve to |

**A slider a page reads by name is deleted only on a confirmed request.**
`Slider::RESERVED` names `homepage-hero` and `store-hero` with what each
draws; `SliderResource` carries `is_reserved` and `reserved_for`, and `DELETE
/admin/sliders/{id}` on one of them answers 422 — with `reserved_for` — unless
the body carries `confirm: true`. The console sends it from a second step
that names the fallback. An ordinary slider deletes as before. It is a
confirmation rather than a lock at the client's request: the homepage hero
was deleted in one press on 2026-09-17, and its slides were recovered from
the binary log rather than from anything this application keeps.

Common to all: `title`, `slug`, `summary`/`excerpt`, `body`, `status`
(`draft`/`published`/`archived`) and a nested `seo` object — with the two
exceptions called out above.

**Answer blocks (2026-09-21).** Eleven entities — pages, products, store
products, product categories, store categories, brands, services, solutions,
blog posts, knowledge articles and industries — accept `answer_blocks[]`:
`{kind, question?, answer, detail?, status?}`, replaced wholesale on save,
`[]` clears, an absent key leaves them alone (the `faqs` rule). `kind` is
`App\Enums\AnswerBlockKind` — `definition`, `who_for`, `why`, `key_fact`,
`feature`, `use_case`, `comparison`, `step`, `question` — and decides which
section of the public page draws the block; `question` is required for
`question` and `comparison` and optional otherwise; `answer` is the direct
answer, plain text, at most 600 characters; `detail` is rich text through the
sanitiser; `status` is `draft` or `published` (the default). Every admin
detail read carries `answer_blocks: [{id, kind, question, answer, detail,
sort_order, status}]` and every admin index carries
`meta.answer_block_kinds: [{value, label, heading, asks_question}]` — the
console never retypes the list. Every public detail read carries the
**published** blocks, in order, as `answer_blocks: [{kind, question, answer,
detail, heading}]`; index rows carry no key. Validation errors arrive as
`answer_blocks.N.field`.

**Every public detail read also carries `entity` and, when earned,
`faq_schema`.** `entity` is `{brand?, category?, solutions[], services[],
industries[], articles[], faq_count}` — each link `{name, path}`, a path and
never a URL — built by `App\Support\EntityLinks` from the relations the
controller loaded, plus the published posts and knowledge articles whose body
links to the page (`articles`). The record's graph mirrors it as `about` (the
category and solutions) and `mentions` (the rest), `Thing` stubs with a name
and a URL. `faq_schema` is an `FAQPage` over the record's FAQs and its
`question` blocks, **absent under two entries**: never an FAQ page over one
question. The `Organization` node's `knowsAbout` (published solution titles)
and `areaServed` (active location names) reach the frontend as two
JSON-encoded strings on the public `/settings` map,
`organization_knows_about` and `organization_area_served`, absent when empty.

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

### Forms: the builder, submissions and uploads

`role:content_manager`, like the rest of the forms routes (0.117.0,
`docs/forms.md`).

| Method | Path | Notes |
|---|---|---|
| `GET`/`POST` | `/admin/forms` | `?q=`, `?per_page=` (max 100). `meta` carries the builder's vocabulary beside the pagination (below) |
| `GET`/`PATCH`/`DELETE` | `/admin/forms/{id}` | Bound by **id**. The read and both writes carry the same `meta`. Deleting keeps the submissions **and their files** |
| `GET` | `/admin/forms/{id}/submissions` | Newest first, `?per_page=` (max 100). Each row: `id`, `form_id`, `form_slug`, `data`, `files`, `ip_address`, `read_at`, `created_at` |
| `GET` | `/admin/forms/{id}/submissions/export` | Every submission as a streamed CSV, newest first. **Declared above `submissions/{submission}`** |
| `GET` | `/admin/forms/{id}/submissions/{submission}/files/{field}` | Streams one upload as an attachment under its original name. 404 when the field has no file, the key is not a field key, or the submission belongs to another form |
| `DELETE` | `/admin/forms/{id}/submissions/{submission}` | 204. Deletes the submission **and its files**; the lead made from it stays. 404 for another form's submission |

**`meta` on the index, the read and both writes** is `{kinds, ops,
file_accepts, max_upload_kb, max_file_fields}`, so the console lists nothing
itself. `kinds` is `[{value, label, blurb, takes_options, is_layout, is_file,
is_condition_source}]` in `FormField::KINDS` order; `ops` is `[{value, label,
takes_value}]`; `file_accepts` is `[{value, label, extensions[]}]` for
`image`, `pdf` and `document`; `max_upload_kb` is the largest file this server
will take for a form upload — 20480, or php.ini's ceiling when that is lower;
`max_file_fields` is 3.

**`fields[]` on a write** is at most 50 rows of `{kind, name, label,
placeholder?, help?, required?, width?, options?, settings?, show_if?}`,
replaced wholesale. What is checked beyond the shape of each key, each a 422
on the row it names:

- `fields.N.name` — required for every kind but `heading` and `step`, which
  the server names (`section_1`, `step_1`, …) when it is blank; two rows
  sharing a key are refused.
- `fields.N.label` — required for every kind but `step`, which is titled
  "Step N" when blank.
- `fields.N.options` — at least **one** option for `select`, at least **two**
  for `radio` and `checkboxes`, no value twice. Options are kept only on those
  three kinds.
- `fields.N.kind` — a fourth `file` field.
- `fields.N.settings.<key>` — `hidden`: `value`, a string ≤ 255. `number`:
  `min`, `max`, numeric, `min` ≤ `max`. `date`: `min`, `max`, each `"today"`
  or a `Y-m-d`, not backwards. `file`: `accept`, a non-empty subset of
  `image`/`pdf`/`document` (default `["image","pdf"]`), and `max_kb`, an
  integer 100–20480 (default 5120). Only the kind's own keys are stored — a
  number turned into a date does not keep `min: 5` — and `settings` is null
  for every other kind.
- `fields.N.show_if.field` — must name a field **earlier in the list** that
  has an answer to read: an unknown key, a later field, the field itself, and
  a `file`, `hidden`, `heading` or `step` are each refused with their own
  sentence. `fields.N.show_if.op` — one of the five, and `includes` only on a
  `checkboxes` source. `fields.N.show_if.value` — required for `equals`,
  `not_equals` and `includes`, ≤ 150 characters. An empty object, or one whose
  `field` and `op` are both blank, means no condition and is stored as null.

`required` is stored `false` on a `hidden`, a `heading` and a `step` whatever
is sent. `redirect_url` is a path on this site or an http(s) URL — `//host`,
`/\host`, `javascript:`, `mailto:` and `tel:` are a 422 — and null clears it.

**The admin read carries `settings` as stored**, a hidden field's `value`
included; the public read withholds it (see "Public endpoints"). A file
field's `settings.max_kb` is the figure that was asked for; the limit in force
is `min(max_kb, meta.max_upload_kb)`, which is what the public read sends.

**`files` on a submission row** is an object keyed by field —
`{field, name, size, mime, submission_id, download_path}` — and `{}` when
nothing was uploaded, never `[]`. `download_path` is **this API's route,
relative to `/api/v1`**: `/admin/forms/{form id}/submissions/{id}/files/{field}`;
it is null once the form itself has been deleted, since the route is addressed
through the form. `data[field]` for a file is its original filename. The
stored path appears in no response — this resource is also the body of the
`form.submitted` webhook, which therefore carries `form_id` and `files` too.

**The export** is one row per submission: `Submitted at`, then one column per
field that has an answer (headings and step breaks have none), headed by its
label and in the form's order, then `Source page` (the page recorded on the
lead made from that submission) and `IP`. A choice is written as the option's
**label**, a `checkboxes` answer joined by `"; "`, a rating as `4 / 5`, a tick
box as `Yes`/`No`, an upload as its filename. Written by the application's one
CSV writer, so a cell beginning `=`, `+`, `-` or `@` is prefixed with `'`. The
columns are today's fields: an answer to a field since removed stays on the
submission and is not in the file. The file is `form-{slug}-{Y-m-d}.csv`.

### Media

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/media-folders` | `{id, name, media_count}` |
| `POST` | `/admin/media-folders` | `name`, unique |
| `DELETE` | `/admin/media-folders/{id}` | **Keeps the files** — they become unfiled |
| `GET` | `/admin/media` | Paginated. `?q=` on filename, **alt text, description and tags**, `?folder=` (an id, or `unfiled`), `?kind=image\|file`, `?sort=`, `?direction=`, `?trashed=1`, `?per_page=` (default **10**, max 100) |
| `POST` | `/admin/media` | multipart `file` + optional `alt_text`, `folder_id` |
| `PATCH` | `/admin/media/{id}` | `filename`, `alt_text`, `description`, `tags[]`, `folder_id`, `focal_x` + `focal_y` (0–100, **together or not at all**; both null is the centre) |
| `POST` | `/admin/media/move` | `ids[]`, `folder_id` (null means Unfiled) |
| `POST` | `/admin/media/copy` | `ids[]`, optional `folder_id`. Duplicates the bytes |
| `POST` | `/admin/media/delete` | `ids[]`. To the bin, not off the disk |
| `POST` | `/admin/media/{id}/resize` | `width`, `height`, `thumbnails[]` of 90/120/180, `as_copy` |
| `POST` | `/admin/media/{id}/crop` | `x`, `y`, `width`, `height`, optional `out_width`/`out_height`, `as_copy` |
| `POST` | `/admin/media/{id}/transform` | `operation` of `rotate`/`flip`/`adjust`, plus `degrees`, `axis`, `brightness`, `contrast`, `greyscale`, `as_copy` |
| `POST` | `/admin/media/{id}/replace` | multipart `file`, held to the upload's `mimes:` list by content; the stored `mime` is the detected type. **Same path** |
| `POST` | `/admin/media/{id}/alt-suggest` | Alt text proposed by the AI SEO assistant (`App\Support\Seo\Ai\AltText`): the picture goes to a vision-capable model as a `data:` URL, one sentence under 125 characters comes back as `{data: {alt}}` — empty for a decorative picture. **Suggest-only**: the field is written through `PATCH`. 422 with the assistant's sentence when it is off, has no key, has hit the day's cap (the same counter), or the file is not a JPEG/PNG/WebP/GIF under 4MB. A GIF is sent as a PNG of its first frame, since the Gemini models read no GIF; the file itself is untouched. Throttled 10/min |
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
`App\Support\MediaMeta` loads the whole `path => {alt, focus}` map once per
request and memoises it, because a products index renders twenty images and
twenty queries for twenty short strings is the wrong trade. Public resources
therefore carry `cover_image_alt` (blog, case studies), `hero_image_alt`
(solutions) and `image_alts` (products — a parallel array, same order and
length as `images`).

**The focal point lives with the file too, by the same rule.** `media.focal_x`
and `media.focal_y` are where the subject is, as a percentage of the width and
of the height; null is the centre, which is where every crop landed before the
columns existed. `PATCH /admin/media/{id}` takes the pair **together or not at
all** — one without the other is a 422 naming the missing half, and both null
is "Reset to centre" — and the admin resource returns the two numbers. Every
public resource that carries a `*_alt` carries a `*_focus` beside it, already
formatted as CSS `object-position` wants it — `"30% 20%"` — or **null when
nobody has chosen one**, never a centre string, so a client can tell unset from
chosen and set no style at all for the first: `cover_image_focus`,
`hero_image_focus`, `image_focus` (categories, store categories, popups,
variations, certifications), `logo_focus`, `photo_focus`, `focus` on a slide
and a gallery item, and `image_focuses` parallel to `image_alts`. The public
`/settings` adds `<prefix>_focus` beside every `<prefix>_url` whose file has
one (`logo_focus`, `banner_default_focus`, `login_image_focus`), and the
theme options' `image_focus` rides beside `image_url`. A focal point only ever
moves the crop — nothing is resized, padded or letterboxed by it — and it
applies to a vector as much as to a photograph, since it is a rule about
cropping rather than pixels.

**A public media URL is versioned once the file has been edited** (0.124.0,
`App\Support\MediaUrl`). Every picture, video and document URL in a public
response is built in one place. For a file nobody has edited it is what it
always was, `<api>/storage/<path>`; once its bytes have been changed in place
— a resize, crop, rotate, flip or adjust, a replacement, a version restore —
`media.revision` is bumped and the URL carries `?v=<revision>`, so the address
moves exactly when the bytes do. A brand's logo is versioned by the brand's
`updated_at` instead, as before. The admin media resource is unchanged
(`?v=<updated_at>`).

**With the media CDN switched on**, the URL of a file a browser fetches
itself — anything but `jpg`, `jpeg`, `png`, `webp`, `gif` and `avif` — is
`<media_cdn_url>/storage/<path>`; a raster stays on this server, because the
website's image optimiser is what fetches it. The private `media_cdn` group
holds `media_cdn_enabled` (`0`/`1`, off by default) and `media_cdn_url`: an
https origin with nothing after the host, on a public host name and not this
server's own, a 422 on the row otherwise, stored lower-cased without a
trailing slash. Neither is on the public `/settings` map; `GET /redirects`
carries the origin as `meta.media_cdn` while the switch is on, and null
otherwise.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/admin/settings/media-cdn/test` | `role:admin`, throttled 6/min. Fetches the newest library file a browser would fetch from the CDN (else any) through the **saved** address — switch on or off — and compares it byte for byte with this server's copy. 200 `{data: {message, url}}`; **422 on `cdn`** with a sentence: no address saved, an empty library, the CDN's status, or that what came back is not the file |

**The blurred loading preview lives with the file too** (0.123.0).
`media.blur` is a twelve-pixel-wide WebP of the picture as a `data:` URL, a
couple of hundred characters, made when the row is created and re-made by
every in-place edit, replacement and version restore. Every public resource
that carries a `*_focus` carries a `*_blur` beside it — `cover_image_blur`,
`hero_image_blur`, `image_blur`, `logo_blur`, `photo_blur`, `blur` on a slide
and a gallery item, `image_blurs` parallel to `images`, `<name>_blur` on a
page-builder section's pictures and a `cards` item — the `data:` URL, or
**null when there is none**: a vector, a path with no library row, a picture
the backfill has not reached. Never an empty string. The public `/settings`
adds `<prefix>_blur` for the pictures drawn large only — the banners, the
sign-in picture, the coming-soon picture and the shop's promo band and tiles
— and never for the logo, the favicon or the app icon. The admin media
resource does not return it. `technoware:backfill-media-blur` (hourly, 250 a
run; `--all` re-makes every one) works through the pictures that predate the
column.

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

## Newsletter

### Public

| Method | Path | Notes |
|---|---|---|
| `POST` | `/newsletter/subscribe` | Throttled 10/min, honeypot `website`. **Answers 202 for everything** |
| `GET` | `/newsletter/open/{token}` | The tracking pixel. Always the same 1x1 GIF |
| `GET` | `/newsletter/click/{token}/{link}` | Records, then redirects |
| `GET`/`POST` | `/newsletter/unsubscribe/{token}` | No login, no confirmation step, idempotent |

**`subscribe` answers identically for every address** — new, already on the
list, previously unsubscribed and honeypot-tripped alike. Anything else makes
the form a membership oracle, the same rule `/auth/register` follows.

**These three URLs are built on two different origins, deliberately.** The
pixel and the click redirect are generated from the **API's** route table, since
that is where they live; the unsubscribe link is built on the frontend, since
`/newsletter/unsubscribe/[token]` is a real page there. Building all three from
`frontend_url` — which is what shipped first — gave every campaign a pixel and a
set of links that answered 404: opens read 0% for a message that had been
opened, and a reader clicking a link in a delivered campaign landed on a missing
page. `APP_URL` therefore has to be the public API origin.

**The pixel is constant.** Unknown token, real token, tracking switched off: one
1x1 GIF and one set of headers. A response that varied would let anybody test
whether a token is real, and it is going into a client that renders whatever
comes back regardless. `opened_at` is stamped once and never overwritten; the
total is counted from the events.

**A bad click token redirects to the front page rather than erroring.** The
person clicked a link in an email expecting to arrive somewhere; an error
because a tracking row was pruned is our failure presented as theirs.

**Unsubscribe is on POST as well as GET**, because `List-Unsubscribe-Post` is
what a mail client's own unsubscribe button sends — and it may send it more than
once, so both are idempotent. No login and no "are you sure": every obstacle
between deciding to leave and leaving converts an unsubscribe into a spam
complaint, which costs the sending domain far more.

### Admin (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/newsletter/dashboard` | Counts and rates across every sent campaign |
| `GET` | `/admin/newsletter/queue` | Whether anything is delivering: the backlog, the scheduler's pulse and a worker's own |
| `GET`/`POST` | `/admin/newsletter/subscribers` | `?q=`, `?status=`, `?group=`, `?suppressed=1`, `?verification=`, `?industry=`. `meta.industries` lists every industry on file. A row carries `industry`, `location`, `website` and `source_url` (the page a crawl found it on); `POST` takes the first three |
| `GET` | `/admin/newsletter/subscribers/export` | Streamed CSV, every cell escaped; the same filters. Industry, location, website and "Found on" columns |
| `POST` | `/admin/newsletter/subscribers/paste` | A pasted block of addresses. Newlines, commas, semicolons, `Name <address>` |
| `GET`/`PATCH`/`DELETE` | `/admin/newsletter/subscribers/{id}` | Email and status are **not** settable |
| `POST` | `/admin/newsletter/subscribers/{id}/unsubscribe` | On somebody's behalf |
| `POST` | `/admin/newsletter/subscribers/{id}/verify` | Ask Hunter about this address now. Throttled 30/min; 422 with the reason when it cannot |
| `GET` | `/admin/newsletter/verification` | The Hunter report: breakdown, allowance, Hunter's own figures, queue, last twenty answers |
| `GET`/`POST` | `/admin/newsletter/groups` | With `subscriber_count` and `active_count` |
| `PATCH`/`DELETE` | `/admin/newsletter/groups/{id}` | Deleting keeps the subscribers |
| `POST` | `/admin/newsletter/imports/analyse` | Dry run over a CSV **or `.xlsx`**. Writes nothing |
| `POST` | `/admin/newsletter/imports` | Commits an analysed file — or, with `import_id`, a mailbox scan that is `ready`: `group_ids[]`, `domains[]` (lower-cased; a row whose domain is not listed is `excluded`), `include_roles` (default true for a file, the review sends false), `industry_group` (a crawl: also into a group named after its industry, made if absent; default true). The request's `file` is ignored for a scan; the server knows where it put it. A crawl's industry and location are written on every row, filling blanks only |
| `GET` | `/admin/newsletter/imports/mailbox` | The mailbox a scan can read: `providers[]` (google, microsoft), `provider`, `account`, `connected_at`, `is_connected`, `client_configured` (Settings → Ticketing holds the OAuth client), `error`, `callback_path`, `php`, `delivering`, `active` (the scan in flight or awaiting review, so the screen resumes on it) |
| `POST` | `/admin/newsletter/imports/mailbox/authorize` | `provider`, `redirect_uri` checked exactly against `/admin/newsletter/subscribers/import/mailbox/callback`. 422 naming Settings → Ticketing when no client is saved |
| `POST` | `/admin/newsletter/imports/mailbox/callback` | `code`, `state` → `{account, provider}`; writes only the `newsletter_oauth_*` rows |
| `POST` | `/admin/newsletter/imports/mailbox/disconnect` | Forgets the consent |
| `POST` | `/admin/newsletter/imports/mailbox/scan` | `source` of `connected` or `imap` (with `imap.{host,port,encryption,username,password}` — used for this scan, never stored; `port` 143 or 993, `host` public, 422 on either otherwise, and a failed scan's `error` is one sentence rather than the server's words), `since`/`until` (`Y-m-d`, either optional), `include_junk`. **202** with the import row; 422 while a scan is in flight, when nothing is connected, on a backwards range, or with `errors.queue` when nothing drains the queue. Throttled 6/min |
| `GET` | `/admin/newsletter/imports/crawl` | The crawl screen's first step: `active` (the crawl in flight or awaiting review), `delivering`, `hunter_configured`, `hunter` (`searches_available`, `searches_used`, `reset_date`, or `{error}` in Hunter's words, or null), `industries` on file, `limits` (`depth`, `pages`, `linked_sites`, `hunter_domains`). **Declared above `imports/{import}`** |
| `POST` | `/admin/newsletter/imports/crawl` | `start_url` (a bare host gets `https://`; http allowed; a private or unresolvable host is a 422), `depth` 0–4, `max_pages` 1–500, `industry` (required, 80), `location?` (80), `visit_linked_sites?` with `linked_sites_max` 1–100, `hunter_domains?` 0–50 (422 without a Hunter key). **202** with the import row (`source: crawl`); 422 on `start_url` while a crawl is in flight, and on `queue` when nothing drains it. Throttled 6/min. `progress` carries the settings and then `phase` (`crawl`, `hunter`, `done`), `pages`, `linked_pages`, `queued`, `sites`, `addresses`, `hunter_used`, `refused`, `current`, `capped`, `notes`; the ready `analysis` adds `pages`, `linked_pages`, `sites`, `hunter_used`, `notes`, `industry`, `location` |
| `GET` | `/admin/newsletter/imports/{id}` | The row with `source`, `status` (`pending`, `scanning`, `ready`, `running`, `completed`, `failed`, `cancelled`, `expired`), `progress` (folders, messages, addresses, what was skipped and why, the range), `analysis` once `ready` (the dry run's `counts`, `domains[]` with `kind`/`default`, `roles`, `mapping`, `capped`, `account`), `error`, `expires_at`. What the screen polls |
| `DELETE` | `/admin/newsletter/imports/{id}` | Discards a mailbox scan not yet imported: the file and the scratch state go, the consent is forgotten, a running chain stops at its next slice |
| `GET` | `/admin/newsletter/templates` | Without `blocks` or `html` |
| `POST` | `/admin/newsletter/templates/preview` | Renders blocks without saving |
| `GET`/`POST` | `/admin/newsletter/campaigns` | |
| `GET`/`PATCH`/`DELETE` | `/admin/newsletter/campaigns/{id}` | A sent campaign refuses `PATCH` |
| `POST` | `/admin/newsletter/campaigns/{id}/duplicate` | 201: a draft named "… (copy)" with the wording and the groups, and no recipients, events, schedule or health score. The only way to send again |
| `POST` | `/admin/newsletter/campaigns/{id}/resend` | `subject`. 201 with a new campaign named "… — resend", already `sending` to the original's non-openers under the new line. 422 with a sentence when the campaign is not `sent`, has been resent already, or nobody is left; 422 with `errors.health` on the same blocking checks as `send`. See below |
| `GET` | `/admin/newsletter/campaigns/{id}/audience` | The counts, and every removal |
| `GET` | `/admin/newsletter/campaigns/{id}/health` | The deliverability heuristic |
| `POST` | `/admin/newsletter/campaigns/{id}/test` | Throttled 6/min. Creates no recipient |
| `POST` | `/admin/newsletter/campaigns/{id}/send` | Or schedules it |
| `POST` | `/admin/newsletter/campaigns/{id}/decide` | End a subject test now: `winner` of `a` or `b`, or nothing to go by the opens. 422 when there is no undecided test |
| `GET` | `/admin/newsletter/campaigns/{id}/report` | |
| `GET`/`POST`/`DELETE` | `/admin/newsletter/suppressions` | Lifting an unsubscribe is refused |
| `GET`/`POST` | `/admin/newsletter/sequences` | Automation sequences. `name`, `status` (`active`/`paused`), `newsletter_group_id` (null = every new subscriber), `from_name`, `from_email`, `reply_to`. The index carries `steps_count` and `active_enrolments`; `meta.statuses` |
| `GET`/`PATCH`/`DELETE` | `/admin/newsletter/sequences/{id}` | A detail read lists `steps[]` and `enrolments` counts. `PATCH` to `active` runs the blocking checks on every step: 422 with `errors.health` naming the step. `DELETE` is 422 while anybody is `active` |
| `POST` | `/admin/newsletter/sequences/{id}/steps` | `subject`, `delay_days` (0–365), optional `newsletter_template_id` (blocks copied server-side). A campaign row at status `automation`, positioned last. 201 with the sequence |
| `PATCH` | `/admin/newsletter/sequences/{id}/steps/reorder` | `ids[]` — every step exactly once; renumbered 1..n. **Declared above `steps/{campaign}`** |
| `PATCH`/`DELETE` | `/admin/newsletter/sequences/{id}/steps/{campaign}` | `delay_days`; or remove it and renumber the rest. A campaign that is not this sequence's step is a 404 |
| `POST` | `/admin/newsletter/sequences/{id}/enrol` | `subscriber_ids[]`, `group_id`, `emails[]` (resolved against the list). A count per outcome: `enrolled`, `already_enrolled`, `not_active`, `suppressed`, `no_steps`, `unknown` |
| `GET` | `/admin/newsletter/sequences/{id}/enrolments` | `?status=`, paginated, newest first, with the subscriber. `meta.statuses` |
| `POST` | `/admin/newsletter/sequences/{id}/enrolments/{enrolment}/cancel` | Stops one. 422 when it is not `active` |
| `GET` | `/admin/newsletter/sequences/{id}/report` | Per step `{position, subject, delay_days, sent, opened, clicked}` off the step's recipient rows, and `enrolments` by status |

**Addresses are verified through Hunter.io, a few a night, and never twice.**
Optional: nothing happens without `hunter_api_key` (encrypted, `integrations`
group). `technoware:verify-subscribers` runs nightly and takes only `active`,
unsuppressed rows that are `unverified`, or `pending` with attempts to spare.
How many is `hunter_monthly_cap` (default 100) minus what the ledger says was
spent this month, spread over the days left — and Hunter's own `available`
figure is read first, so the run stops at whichever is lower rather than on a
429. Every call is a `newsletter_verifications` row; a 200, 202 or 222 counts
against the allowance, a refusal or a transport failure does not, and a
verdict copied for a deleted-and-reimported address made no call at all.

**The verdict is a prediction and never a suppression.** `verification` on the
subscriber is `verified` (`valid`, `webmail`), `risky` (`accept_all`, or
`unknown` after three attempts — still mailed), `invalid`, `disposable`,
`pending` or `unverified`. `invalid` and `disposable` are left out of
`AudienceResolver::eligible()` and counted as `unverifiable_removed` in the
audience preview, re-checked per recipient at send time, and **not** written
to `newsletter_suppressions`: that list records bounces and decisions, and a
prediction is neither. `POST …/{id}/verify` asks again, whatever the verdict,
and spends one of the month's allowance; it refuses with a sentence when there
is no key or none left. `?verification=` filters the index and the export;
`meta.verifications` lists the options; the resource carries `verification`,
`verification_label`, `verification_result` (Hunter's own word), `_score`,
`_attempts` and `_at`.

**A bad key or a spent plan stops the run and leaves a mark.** 401 and 429
write `newsletter_verify_error` — the `mail_error` pattern — which the
Verification screen shows and the next successful call clears. The command
still exits 0: a Hunter outage is a banner, not a failed scheduler event. A
transport failure burns no attempt, so a network that was down cannot turn an
address Risky.

**A provider can report bounces itself.** `POST /newsletter/webhooks/{provider}`
— `mailgun` and `brevo` — suppresses an address the moment a permanent failure
or a complaint arrives, instead of waiting for somebody to notice and type it
in. Bounce handling being manual was the one gap in this module that degrades a
sending reputation on its own.

**It answers 200 to everything**, including a payload it cannot verify: a
provider reads anything else as "retry", and a retried bad signature is still a
bad signature.

**The shared secret is required, and the endpoint is inert without one.** This
is the inverse of the payment webhook's risk: a forged call there marks an order
paid, a forged call *here* **suppresses** addresses — a way for anyone who finds
the URL to remove the whole list from every future campaign, which nobody would
notice until a send reported an audience of nothing. So it fails closed.
Mailgun's HMAC is over `timestamp . token` using the **webhook signing key**,
which is a different secret from the API key; Brevo signs nothing and sends the
secret as `X-Webhook-Secret`. Both compared with `hash_equals`, and Mailgun's
carries a 15-minute window so a captured delivery cannot be replayed to
re-suppress addresses staff had lifted.

**Only permanent failures and complaints.** A soft bounce is a full mailbox or
an hour of downtime, and suppressing on one removes a real customer for good.
`GET /admin/newsletter/suppressions` carries `meta.webhook` — the URLs, built
from this route table, and whether a secret is set — so the console can say how
to wire it without composing an origin of its own.

**SES is absent deliberately.** It publishes through SNS, whose messages need a
certificate fetched and validated per delivery — an uncontrolled network call on
the request path, and the AWS SDK that does it properly is the ~50MB dependency
`MailTransport` already declines to ship.

**`role:campaign_manager`.** Not about skill, about blast radius: a send cannot
be recalled — there is no draft, no unpublish and no 301 — and this module holds
thousands of people's personal data beside a suppression list with legal weight.
An `admin` passes implicitly, as everywhere.

These routes sat inside the `content_manager` group for months while the comment
above them and this file both said `role:admin` — so anybody who could edit a
blog post could mail the entire list, which is what the comment argued against.
The role makes the claim and the code the same thing, and
`NewsletterTest` pins it in both directions.

**An audience arrives three ways and all three go through the same intake** — a CSV or Excel file, the standing "Existing customers" group, and a pasted block of addresses. There was a fourth, a one-off "add all customers" endpoint, and it is gone: it did the same job worse, being correct on the day it was pressed and stale from the next approval onwards. The file is read by its **bytes**, so one saved with the wrong extension still works; the legacy binary `.xls` is named and refused rather than parsed into thousands of invalid rows. Validation is `extensions:` plus a magic-byte check rather than `mimes:`, which validates the extension guessed from the MIME type and would make a real workbook's acceptance depend on the server's magic database.

**One group is derived, not curated: "Existing customers".** It is identified
by `newsletter_groups.source = 'customers'` — never by its name or slug, both of
which an editor may change without meaning to change what the group *is* — and
its membership is recomputed from the portal customer list rather than edited. A
one-off import is correct on the day it is pressed and wrong from the next
approval onwards, and nobody notices, because a stale group looks exactly like a
current one: it is the newest customers who go missing.

**It cannot resurrect an unsubscribe, and that is the whole of its safety.**
Every addition goes through `SubscriberIntake`, which checks the suppression list
*before* it looks a subscriber up — so being a customer is not a way back onto a
list somebody declined. The naive version of this class, writing the subscriber
row and the pivot directly, passes every other test in the suite and fails
exactly that one.

**Only `active` customers are in it.** `pending` is somebody waiting on a human
and `rejected` is somebody a human turned down; mailing either answers a question
the support desk has not answered yet. A customer who stops being active leaves
the **group** and keeps their subscription — a suspended account has not asked to
stop hearing from the company.

**`DELETE` and the member editor both refuse it with a 422.** Deleting would
appear to work and the group would return on the next sync under a new id, having
lost every campaign's record of having been sent to it; a hand edit would survive
until the next run and then vanish. The console hides both controls as well, so
nobody presses them.

Kept in step by `App\Models\Customer`'s `saved` hook for the ordinary path and
`technoware:sync-customer-group` nightly for whatever reached the table without
firing an event.

**A resend is a campaign, once.** `POST …/resend` copies a `sent` campaign
through the same mechanics as `duplicate` — a fresh row with the wording and
none of the history — gives it the new `subject`, no `subject_b` (a second
attempt is not an experiment), and `resend_of_id` pointing at the original.
Its audience is the original's recipients at status `sent` with no
`opened_at`, put through the **same** eligibility rule as any send
(`AudienceResolver::freezeFrom()`: active, a sendable verification verdict,
not suppressed), so somebody who unsubscribed between the two sends is not
mailed a second time; then it is queued through `CampaignSender` behind the
same blocking health checks `send` runs. `resend_of_id` is **unique**, which
is what "once per campaign" means — two presses racing cannot both insert.
A detail read and the report carry the pair: `resend` (`{id, name,
recipient_count, status}` or null) on the original, `resend_of` (`{id,
name}` or null) on the copy, and the report's `counts.non_openers` is the
figure the panel offers before eligibility takes its share.

**A sequence's steps are campaign rows, and the rest of the API refuses to
treat them as campaigns.** Each step is a `newsletter_campaigns` row at
status `automation` with `sequence_id`, `sequence_position` and
`delay_days`, so it has the block editor, the health checks, tracking, the
unsubscribe footer and a report already — a second table would have been a
second newsletter. Its content is edited through `PATCH
/admin/newsletter/campaigns/{id}`, which refuses `status`, `group_ids`,
`scheduled_at` and the subject-test fields on a step and prepares the HTML
for tracking on every save; a detail read carries `sequence` (`{id, name,
position, delay_days}`, null otherwise). The campaigns index and the
dashboard's totals leave steps out, `send` and `CampaignSender::queue()`
refuse them, `completeIfDone()` never marks one done, and `DELETE
/admin/newsletter/campaigns/{id}` sends you to the sequence instead.

**A subscriber goes through a sequence once, ever.** The enrolment table is
unique per (sequence, subscriber); joining the trigger group a second time,
or being enrolled by hand again, reports `already_enrolled` and writes
nothing. Enrolment happens where a subscriber is written — `SubscriberIntake`
(new subscriber → every group-less active sequence; groups actually attached
→ the sequences those groups trigger) and the group screen's bulk add — and
only for an active subscriber not on the suppression list. A sequence with
no steps enrols nobody. **The runner is the scheduler, not a listener**:
`technoware:run-sequences` every ten minutes writes a recipient row on the
step campaign for each enrolment past its `next_at` and dispatches the same
`SendCampaignBatch` a campaign uses, then moves the cursor to the next
step's position and `now + delay_days`, or completes it; a subscriber who is
no longer active, or has been suppressed, is cancelled with the reason. A
paused sequence's enrolments wait; a step failing a blocking health check
is held, not sent.

**A campaign may test two subject lines.** `subject_b` switches it on;
`ab_test_percent` (10–50) is the share of the frozen list that tests, half
under each line, and `ab_wait_hours` (1–72) how long the rest is `held` —
a recipient status the batch dispatcher never picks up. Opens over sent per
variant decide it (a tie goes to A) when `technoware:decide-subject-tests`
runs, every ten minutes, or earlier from `/decide`; the held rows then go
out under the winner, mailed with that subject. The resource carries `ab`
while a test exists — `winner`, `decided_at`, `decide_at`, `held`, and
`variants.a/b` as `{sent, opened, clicked}` — and the report an `ab` block
with both subjects. A campaign under test is still `sending`, because it is.

**`from_name`, `from_email` and `reply_to` are per campaign**, falling back to
the `newsletter` settings and then to `.env`. Which addresses may be used is
decided at the provider by SPF, DKIM and whichever identities are verified there
— and sending as an unauthorised one does not bounce, it authenticates, leaves
and lands in spam, which is the worst kind of failure because nothing reports it.
So the field is offered with the warning rather than fixed or unconstrained.

**The index carries `performance`; a single read does not.** Counts, never rates
— a rate needs its denominator beside it. **`delivered` means the recipient row
reached status `sent`**, the same definition `/report` uses, and deliberately not
`delivered_at`, which is set by a provider webhook this deployment does not have:
counting that reported zero delivered for every campaign, so the list said 3 and
the report said 4 about one send, on two screens one click apart.

**Suppression is keyed on the address and outlives the subscriber row.** Delete
somebody and re-import them and they stay off. Every write path goes through
`SubscriberIntake`, which checks it *before* looking the subscriber up.
`DELETE /suppressions/{id}` **refuses** when the reason is an unsubscribe or a
complaint: those are the person's decision, and only they may reverse them.

**`/queue` answers "will this actually go out", which the backlog cannot.**
Before a send there is nothing queued to be late, so `pending: 0` describes a
healthy install and one with no cron entry identically — and the screen that
needs the answer is the one *before* the send. So the scheduler renews a
heartbeat every minute and `scheduler.running` reads it: `last_run_seconds` is
null when it has never run at all, which is reported as **stopped rather than
unknown**, because on a deployment with no cron entry there is no further
evidence to wait for and the fix is the same line either way. The send screen
renders the crontab line when it is stopped. `stalled` remains the after-the-fact
half: jobs waiting longer than two minutes.

**`delivering` is either pulse, because a bare `queue:work` is also an answer.**
A worker run by hand or under supervisor delivers mail and never touches the
scheduler's heartbeat, so it writes its own from inside the process that sends
(`Queue::looping`). Reporting only the scheduler told an operator with a worker
running that nothing was delivering — worse than silence, since it sends them
to fix a cron entry they may not need. The response carries `scheduler` and
`worker` separately so the screen can say *which*.

**A campaign is claimed with a conditional UPDATE.** Two simultaneous sends
cannot both win. Recipients are frozen when it is queued — so a report describes
what was attempted — and each batch re-reads the recipient's status immediately
before sending, so an unsubscribe mid-send is honoured.

**The postal-address check reads the message, not the setting.** It resolves the
address the way the renderer does — the campaign's own footer block first, then
`newsletter_address`, then the site's `address` — and then requires it to appear
in the rendered HTML. Reading the setting alone passed for a campaign whose
stored footer had no address in it (the footer is built at save time and sending
never re-renders) and failed for one whose footer block carried an address nobody
had duplicated into Settings.

**Sending is refused on the blocking checks, re-run at that moment.** An
unsubscribe link, a sender identity, a postal address and a plain-text part; the
response is 422 with `errors.health` listing them. The stored score is not
consulted — a campaign edited since its last check would go out on a number that
describes a previous version of it.

**A campaign carries one attachment, given as a media path.** The upload has
already happened through the media library, so `attachment_path` is a
*reference* — the same brochure can go on three campaigns without three copies
of it, and it stays a file somebody can find, rename and delete. A path with no
media row behind it is refused rather than stored: it would be an attachment
that silently fails to attach, so the campaign claims one and every recipient
gets a message referring to something that is not there.

**The name and size are copied onto the campaign, not joined.** Same rule the
activity log follows for its actor: the media row can be renamed or deleted
afterwards, and what was sent must not change. The stored filename is a hash, so
without the human name the attachment lands in somebody's downloads folder as
`a8f3c1….pdf`.

**A file that has gone is skipped, not thrown on.** A campaign that fails
part-way through a list because somebody tidied the media library is
unrecoverable — the sender has already delivered to everyone before the
failure — and the message is worth sending without its brochure.

**An attachment is scored, never refused.** `attachment_size` warns above 2MB
and *applies only when there is one*, the same "applies before it passes" shape
`SeoScore` uses. It is a genuine spam signal and every megabyte is multiplied by
the size of the list, but a price list is a legitimate thing to send and
refusing it would be this module deciding a business question.

**`test` sends the real message and creates nothing.** No recipient row, no
event, nothing that reaches a report — a test that moved the figures would make
every open rate wrong by however many times somebody checked it.

**Rates are null, never zero, when nothing has been measured**, and are quoted
over *delivered* rather than sent. `sample` travels with them: 100% of two and
100% of two hundred are not the same claim.

**`meta` carries the enums** — statuses, reasons — rather than the console
listing them, the rule `schema_type_options` follows.

---

## Admin — menus (`role:content_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/menus` | Every menu. `meta.locations`, `meta.types`, `meta.max_depth` |
| `GET` | `/admin/menu-targets?type=&q=` | Records an item can point at. Searched, capped at 50 |
| `POST` | `/admin/menus` | `name`, `location`, nested `items[]` |
| `POST` | `/admin/menus/rebuild/{location}` | Replace a location's menu with the site's own navigation. **Declared above `menus/{id}`** |
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

**Four locations, and `meta.locations` is the only list of them.** `topbar`,
`primary`, `footer`, `bottom` — in page order, top to bottom, because the
console draws them as cards an editor reads down. Each carries a `label`, a
`hint` and the `depth` it renders, and **the two bars render one level**: the
top bar is a 38px strip shared with a telephone number and a search field, and
the bottom row shares its line with the copyright and the scheme toggle, so
neither has anywhere to put a dropdown. Anything nested under an item there is
stored and not rendered, which the hint says in words — the depth a location
renders is not something an editor can see until they have built something it
silently ignores. The two that nest report `MenuRequest::MAX_DEPTH` rather than
a literal.

**A bar's chrome never comes from a menu.** The top bar keeps the phone number,
the email address and the search form; the bottom row keeps the credit line and
the scheme toggle. Only the link list is a menu's, the division
`getPrimaryNav` already makes — a menu that owned the search field would be a
menu that could delete the only search on the site.

**Rebuilding the bottom bar points at the policy *pages*, not their URLs.**
Privacy and Terms are `page` items, so they follow a slug change; those two hold
placeholder copy awaiting a legal review and are the likeliest pages on the site
to be renamed, and a stored `/privacy` would be a 404 in the footer of every
page. The sitemap is the one custom link — a route handler emitting XML has no
record to point at. A missing page comes back in `warnings` rather than being
skipped silently.

**Menus nest three deep, and a fourth level is a 422 naming the item.** The cap
used to be two, and the sentence in that refusal was the real argument: both
locations rendered two levels, so a third would have been data an editor
arranged carefully and never saw. The renderers walk the whole tree now — the
mega panel indents a sub-list per level, the mobile drawer recurses, and a footer
column nests — so `meta.max_depth` is a **decision about navigation** rather than
a gap in the code, and the refusal says so.

**Validation is the only cap.** `Menu::tree()`, `MenuTree` and every renderer
recurse without one, so a deeper tree written straight to the database still
comes back and still renders in full. Raising the constant is the whole of
raising the limit.

**The whole tree comes back in one query.** `Menu::tree()` fetches every item and
joins the parents up in PHP, because `->with('roots.children.target')` is a
depth written as a query — each level another clause, and a fixed chain a fixed
ceiling somewhere else. Validation generates its wildcard rules to the depth the
payload actually uses, for the same reason.

**Rebuilding is the one destructive thing here, and it keeps the menu row.**
`POST /admin/menus/rebuild/{location}` discards whatever is arranged for that
location and writes the navigation the site renders on its own — the way back
from a menu somebody has made a mess of, and the way in for an install that has
never run `technoware:seed-menus`. The row keeps its id, name and `location`:
deleting and recreating would unassign the live navigation for however long
nobody noticed, and break every link into `/admin/menus/{id}`. A location with no
menu gets one. `App\Support\DefaultMenu` is the single definition of "the
default", shared with the command — a second copy behind a button is the drift
that gave the newsletter two definitions of "delivered".

Anything left out comes back in `warnings` rather than being swallowed: a footer
short of a link is exactly the kind of thing nobody notices, and the usual cause
is a CMS page this install has never had.

**`location` is unique when set.** Two menus claiming the header is a question
with no answer. Null is allowed and any number of menus may sit unassigned.

**A custom link's `url` is pattern-checked** — a path, `https://`, `mailto:` or
`tel:` — because it becomes an `href` on every page of the site. An item of any
other type is refused without a `target_id`: it would save happily and then
vanish at render, which reads as the menu losing entries by itself.

**A custom item with no `url` (or `#`, stored as null) is a heading**, allowed
only with `children`: a tab in the top bar's panel, a group title in the mega
menu, a footer column heading. The public tree sends it with **`href: null`** —
the one null a `NavNode` carries; an item whose record has gone is still
dropped rather than sent. A heading over nothing is a 422 on `url`.

**A `section` item points at one of the site's own index pages**, by key, from
an allowlist — `App\Support\SiteSection`. It is the only type that is neither
a record nor free text, and it exists because `/blog`, `/products` and
`/support` are frontend routes with nothing in the database behind them: a
custom link is checked for shape, so `/blogs` saves happily and 404s in the
header of every page. The key goes in `target_key`, `target_type` and
`target_id` stay **null** (`section` is not a morph alias and
`enforceMorphMap` would throw), and the path is resolved when the menu is
rendered. A key that is no longer in the allowlist resolves to null and the
item is **dropped**, exactly like an item whose record was deleted.

**A `service_category` item links to that category's tab**
(2026-09-29): a record item like any other (`target_type` `service_category`,
`target_id`), resolved to `/services#<slug>` while the category is active and
dropped — with whatever is under it — once it is switched off; its `icon` and
`summary` come from the category. A rebuild of `primary` writes Services →
each category with a service in the menu → its services, and the
uncategorised under an "Other services" heading. The `services` site section
is labelled "Services".

**A `catalogue` item is a live list** (2026-09-20): `target_key` of `solutions`,
`services`, `industries` or `product_categories` (`meta.catalogues` carries
the options, label and index path), no `target_id`, and **no children** — a
422 on `children` if any are sent. `MenuTree` expands it at render into what
is published and ticked for the menu, in the catalogue's order, under a
heading that links to the index page; an empty list drops the whole item.
The rebuilt footer's three columns are these. `App\Support\CatalogueList`.

**`meta.sections` carries the options**, label and path together, for the same
reason `meta.types` does.

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
| `POST` | `/admin/settings/integrations/hunter/test` | Proves the saved Hunter key: 200 with `plan_name`, `reset_date`, `used`, `available`; 422 with Hunter's own words. Throttled 6/min |
| `POST` | `/admin/settings/integrations/gsc/test` | Proves the saved Search Console service account with one real query: 200 with `site`, `days`, `pages`; 422 with Google's own words. Throttled 6/min |
| `POST` | `/admin/settings/integrations/ga4/test` | Proves the GA4 property with the same account: one real `runReport` for yesterday, 200 with `property`, `days` (1), `pages`; 422 with Google's own words, or before any call when no property is saved. Throttled 6/min |
| `GET` | `/admin/settings/tickets/inbound` | The support mailbox tickets are read from: `enabled`, `switched_on`, `provider`, `providers[]` (`value`, `label`, `blurb`, `fields`, `is_oauth`, `imap_host`), `address`, `account`, `connected_at`, `is_connected`, `folder`, `moves_processed`, `processed_folder`, `error`, `last_run_at`, `scheduler`, `categories[]`, `callback_path`, `php` (the extensions the IMAP library declares — `zip`, `openssl`, `mbstring`, `iconv`, `fileinfo` — each true when this server has it), `recent[]` — the last ten ledger rows with their `outcome` |
| `POST` | `/admin/settings/tickets/inbound/authorize` | `provider` of `google` or `microsoft`, `redirect_uri` checked exactly against `/admin/settings/tickets/callback` on this site's host. Returns the consent URL |
| `POST` | `/admin/settings/tickets/inbound/callback` | `code`, `state`. Exchanges the code, stores the `inbound_oauth_*` rows, settles `inbound_mail_provider` and fills a blank `inbound_mail_address` from the connected account |
| `POST` | `/admin/settings/tickets/inbound/disconnect` | Forgets the inbound token only; the outgoing mailbox is untouched |
| `POST` | `/admin/settings/tickets/inbound/test` | Connects with what is saved, selects the folder, counts what is unread: 200 with `account`, `folder`, `unseen`; 422 with the server's own words, written to `inbound_mail_error`. Reads only — nothing is flagged, moved or piped. Throttled 6/min |

**The `tickets` group is the support mailbox and is not public.** Off by
default (`inbound_mail_enabled`); `inbound_mail_provider` is `imap`, `google`
or `microsoft`, and `inbound_mail_after`, `inbound_mail_unknown_sender`,
`inbound_imap_encryption` and `inbound_mail_priority` are offered as
`options` and refused outside them. Google and Microsoft authenticate over
IMAP with the OAuth access token (XOAUTH2); plain IMAP with the five
`inbound_imap_*` rows. The `inbound_oauth_*` rows mirror the `oauth_*` rows
and must stay separate from them: two mailboxes, two consents, two tokens.
Every ticket and every ticket message carries `channel` — `portal` or
`email` on a ticket, `email` or null on a message. See `docs/tickets.md`.

**`mail_transport` is an allowlist of seven** — `smtp`, `google`, `brevo`,
`mailgun`, `ses`, `sendpulse`, `log` — and an unknown value falls back to `smtp` rather than
returning 422, the same rule `?sort=` follows. Blank means "nothing chosen", so
`.env` stays in charge: that is what a first deploy and every development
machine rely on.

**`sendpulse` is SMTP with the host known in advance.** `smtp-pulse.com:465`
over SSL, so its two fields are the SendPulse login (`sendpulse_username`)
and the account's *SMTP* password (`sendpulse_password`, secret) — a
separate credential from the sign-in one, which is the thing people paste
by mistake. Nothing is applied until both are set. No bridge: it is Symfony's
own SMTP transport, so it is always `available`.

**Six of the seven transports are installed; SES is not.** Brevo and Mailgun
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

**A stored secret goes only where it was saved for.** `mailgun_endpoint` is
`api.mailgun.net` or `api.eu.mailgun.net` (422 otherwise); changing `smtp_host`
or `inbound_imap_host` while a password is stored needs the password in the
same `PATCH` (422 on the host otherwise); both hosts must be public, and
`smtp_port`/`inbound_imap_port` one of 25, 465, 587, 2525 / 143, 993. The
social profile URLs must be http(s), and `google_analytics_id`
(`G-…`), `google_tag_manager_id` (`GTM-…`) and `meta_pixel_id` (digits) are
held to their shapes — they are interpolated into inline scripts.

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

**A company's own fonts** (0.125.0, `role:admin`, `docs/theming.md`). Two
slots, each a name and one or two WOFF2 files on the public disk under
`fonts/`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/settings/fonts` | Both slots: `[{slot, id, name, regular, bold, variable}]` — `id` is `custom-1`/`custom-2`, `regular`/`bold` a stored path or null. `meta.max_kb` (2048) |
| `POST` | `/admin/settings/fonts/{slot}` | multipart. `name` (required, ≤ 40, letters, digits, spaces and `. ' & -`), `regular` and `bold` (files, ≤ 2 MB each), `variable` (boolean). A file must have the `.woff2` extension **and** open with the WOFF2 signature, a 422 on its field otherwise; `regular` is required while the slot has none; `bold` with `variable` is a 422. A file not sent is kept; a replaced file is deleted; `variable` deletes a stored bold. Answers the slot. `slot` other than 1 or 2 is a 404. Throttled 20/min |
| `DELETE` | `/admin/settings/fonts/{slot}` | Deletes the files, blanks the slot, and puts `theme_font_display` / `theme_font_body` back to `instrument` / `inter` when either was this slot's id |

The slot's rows — `custom_font_{1,2}_name`, `_regular`, `_bold`, `_variable`
— are in the public `appearance` group, so `/settings` carries them (blank
ones dropped). **`PATCH /admin/settings` refuses any `custom_font_*` key**
with a 422 on its row. `theme_font_display` and `theme_font_body` accept
`custom-1` and `custom-2` like any other font id. The website serves a font
file from its own origin at `/font/<name>` (Next, not this API).

**The `appearance` group is nine keys and all of them are public**, because
the site cannot paint itself without them. `theme` is a preset id
(`technoware`, `ocean`, `forest`, `sunset`, `midnight`, `corporate`, `rose`,
`slate`, `emerald`, and Velora's six: `velora-blue`, `velora-violet`,
`velora-emerald`, `velora-rose`, `velora-amber`, `velora-slate`) or `custom`;
`canvas`; the 24 hand-tuned legacy themes were retired on 2026-09-14 and an id from
that list now renders the house preset; `theme_primary`, `theme_secondary`, `theme_accent`,
`theme_background`, `theme_text` and `theme_topbar` are `#rrggbb` (refused on
write with a message naming the row, stored lower-case); `theme_font_display` and
`theme_font_body` are ids from the frontend's `lib/font-choices.ts`. Only the
id's *shape* is validated here — the frontend falls back to the default face
for an id it does not know — because a second list of faces on this side of
the wire is drift with nothing to catch it. An unknown `theme` falls back to
the house preset; a non-hex colour falls back per field. The whole palette —
every ramp, both schemes, the identity hues — is derived on the frontend from
these five colours; see `CLAUDE.md` for the rules that make any input pass
WCAG AA.

**The `motion` group is eight keys and all of them are public**, for the same
reason. `motion_reveal` (`lift`, `float`, `fade`, `zoom`, `blur`, `none`),
`motion_buttons` (`lift`, `glow`, `scale`, `shine`, `ripple`, `flat`),
`motion_page` (`none`, `fade`, `rise`, `zoom`, and since 0.115.0 `crossfade`
and `slide` — React view transitions on client navigations), `motion_loader` (`none`,
`bar`, `pulse`), `motion_hero` (`grid`, `aurora`, `dots`, `none`),
`motion_cards` (below) and, since 0.114.0, `motion_progress` (`none`, the
default, or `bar` — a reading-progress bar along the top of public pages) are ids
from the frontend's `lib/motion-choices.ts`, checked here for *shape* only —
the fonts' rule, for the fonts' reason — and resolved there with a fallback
to the first of each list, which is the site as it moved before the group
existed. `motion_splash` is `0` or `1` and is refused otherwise. They apply
to the public site and the customer portal; the console reads none of them.

**The `login` group is public and holds four rows** — the sign-in screens
render before anybody is authenticated. `login_backdrop` is `image` or one
of eight animation ids, `login_intensity` and `login_speed` are ids too; all
three are checked for shape only (the motion rule: the lists live in the
frontend's `lib/login-backdrop-choices.ts`, which falls back per field), and
`login_image_path` moved here from `general` on 2026-09-17, its group
refreshed by the seeder's `updateOrCreate` on the next run, and
`login_message` (2026-09-18) is rich text cleaned through the `cms` profile,
drawn in the middle of the panel in place of the tagline. `stats_animation`
joined the `homepage` group the same day — `none`, `count`, `rise`, `flip`,
offered as `options` and refused outside them, the `stats_size` rule.

**The `announcement` group is public, and `announcement_live` is derived from
it.** Nine stored keys — `announcement_enabled` (`0`/`1`), `announcement_message`
(HTML, cleaned on write through the `inline` purifier profile: emphasis and
links, no style, no headings), `announcement_style` (`solid`/`gradient`),
`announcement_colour`/`announcement_colour_2` (`#rrggbb`, lower-cased),
`announcement_mode` (`fixed`/`ticker`), `announcement_closable` (`0`/`1`),
`announcement_starts_at`/`announcement_ends_at` (`Y-m-d\TH:i`, blank for
always; an end before the start is a 422 on the end's row, resolved against
the stored value when only one is sent). `announcement_live` is one bit the
API adds beside `store_payments_ready`: the switch, the window against the
server's clock in the app timezone, and a non-blank message, so the frontend
never parses a date. **Rich-text settings are sanitised on write** —
`activation_procedure` through `cms`, the message through `inline`.

**The `themes` group is public and holds two rows.** `site_theme` is the id of
the folder under `web/src/themes/` that builds the public site — `classic` by
default, the site as it was before themes existed — checked for shape only
(`^[a-z][a-z0-9-]{1,31}$`): the list is `themes/manifests.ts` on the frontend,
and an id it does not know renders `classic`; `SITE_THEME` in the frontend's
environment overrides it for a whole server process, the kill switch. `site_theme_options` is one JSON row
holding every theme's choices, `{ "<theme id>": { "menu_style": "big",
"hero_style": "split", "sections": { "<section id>": { "kind": "gradient",
"colour": "#5b21b6", "colour2": "#0f172a", "angle": 135 } } } }`. Checked for
**shape** by `App\Support\ThemeOptions` — a kind is `default`, `solid`,
`gradient` or `image`; colours are `#rrggbb`, lower-cased on the way in; an
angle is 0–360; an `image` needs a media-library `image_path` and carries an
`overlay` of 0–90; any kind but `default` may carry a `texture` of `grain`, `mesh`, `glow`, `grid` or `dots` (2026-10-05; `none` stores nothing, anything else is refused) — and the cleaned document is what is stored, never the
request's bytes (a `default` section is dropped, a blank angle is dropped, a
solid keeps no second colour). A section row may carry `enabled: false` —
only an explicit false switches it off, and a `default` row is kept for
that alone — and may carry `reveal`, how it arrives on scroll (the same
shape check; `none` stores nothing, and a `default` row is kept for a reveal
too) — and `section_order` is a list of section ids, shape-checked
and de-duplicated. Choice values and ids are shape-checked only;
the lists live with the frontend that renders them. Both responses that
publish it add an `image_url` beside every `image_path`, because a path
buried in JSON cannot ride the `_path` → `_url` rule below. A blank value
clears the row.

**`homepage_page_id`** (`homepage` group, 0.113.0) chooses what `/` draws:
blank for the theme's own homepage, or a published builder page's id —
offered as `options` (the theme's homepage, then every published builder
page by title) and a 422 on anything else. It is not on the public
`/settings` map; **`homepage_page_slug`** is, derived on every read and
present only while the id still names a published builder page.

**The `banners` group is public**, and is nine media paths plus a switch: the
picture behind each section's page heading. Public for the same reason
`appearance` is — the heading is painted before anybody signs in. Every path is
null by default, so an install that has uploaded nothing renders its headings
exactly as it did before the group existed, and `banner_default_path` stands in
for any section left blank. There is deliberately **no per-record override**: a
solution's own hero image is already rendered further down its page, and every
page in an area sharing one banner is what makes the area read as an area.

**Every public `_path` setting is published with a resolved `_url`, and the map
is derived rather than listed.** `logo_path` yields `logo_url`, `logo_width` and
`logo_height`; so does every banner, and so would a `_path` setting added
tomorrow. It used to be a hand-written array of four — a list of keys on one
side of the wire that nothing checks against the other, which is the drift that
produced `admin_path` in the API's own resource names.

**The `references` group is private and holds three prefixes** (2026-09-28):
`ticket_reference_prefix`, `visit_reference_prefix` and
`order_number_prefix`, the letters in front of every ticket, engineer visit
and order number (`PREFIX-YYYY-NNNNN`). Each must match
`^[A-Z][A-Z0-9]{1,5}$` in any case — two to six letters or digits, starting
with a letter — or the save is a 422 on that row; a blank is accepted and
means the default. The value is stored as typed and upper-cased when read
(`App\Support\References`), and a missing, blank or malformed row falls back
to `TW`, `TV` and `ORD`. A new prefix applies to new numbers only, counted
from 00001; every existing reference keeps its own and still resolves, and
the email-to-ticket reader recognises every prefix already on a ticket. The
setup wizard sets the first two from the company's initials. Not public:
nothing outside the console needs them.

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

**The `payments` group holds two implemented gateways.** `payment_gateway`
is `razorpay` or `cashfree` (Paytm is listed and disabled); Razorpay reads
`razorpay_key_id`, `razorpay_key_secret` and `razorpay_webhook_secret`,
Cashfree reads `cashfree_app_id`, `cashfree_secret_key` (its one secret,
which also verifies the webhook) and `cashfree_environment` (`sandbox` or
`production`, refused outside them). `GET /admin/settings` carries
`meta.payments.gateways` from `PaymentGateway::options()` — a field may
carry `options` for a select — and `meta.payments.webhooks`, keyed by
gateway, each with its own `url` and `events`. `POST /orders/{number}/pay`
answers the same envelope for both, with `payment_session_id` and `mode`
added for Cashfree; `POST /orders/{number}/verify` takes Razorpay's signed
triple or, for Cashfree, nothing it trusts — it asks Cashfree's API;
`POST /payments/cashfree/webhook` verifies `x-webhook-signature` over
`x-webhook-timestamp . body`. See `docs/store.md`.

**The `mail` and `integrations` groups are not public.** They are absent from
the `/settings` whitelist. Anything added to them stays server-side.
`integrations` holds the OpenRouter key (`openrouter_api_key`, the one key
every AI feature calls with — see "Admin — the AI SEO assistant"), the Hunter
key, and Search Console's
`gsc_service_account` (the whole JSON key file of a service account added to
the property as a user, encrypted), `gsc_site_url` (the property as Search
Console names it; derived from `FRONTEND_URL` as `sc-domain:` when blank) and
`gsc_error`. The client signs its own RS256 JWT and trades it for an access
token — no SDK, for the reason SES ships no `aws/aws-sdk-php`. Google
Analytics 4 reads the **same** service account (`App\Support\Seo\GoogleServiceAccount`
holds the exchange, one token per scope) and adds two rows of its own:
`ga4_property_id`, the numeric property id — refused on write unless it is
digits, because the `G-` measurement id is what gets pasted and addresses
nothing on the Data API — and `ga4_error`, written by a refusal in Google's
words and cleared by a success. Read only: nothing here writes to either
property.

**The `indexnow` group is public and holds two rows.** `indexnow_enabled` (`0`/`1`, **off by default** — `FRONTEND_URL` is the production domain on every machine, so a ping from a development laptop would name live URLs for pages that are not there yet; switch it on at launch) and `indexnow_key`, minted by `App\Support\IndexNow::key()` the first time a ping is sent and public because the protocol's key file is world-readable by design — the frontend serves it at `/indexnow/{key}.txt`. With the switch on, every indexable record (`HasSeo`) queues a `PingIndexNow` job from its `saved` and `deleted` hooks: a published record on every save, a draft only when its status changes, so the engine recrawls and finds the redirect or the 404. One `POST` to `api.indexnow.org` per change; a refusal is logged at `warning` and never retried.

**The `embeds` group is public and stored as pasted.** `reviews_embed` (the
Elfsight snippet), `reviews_kicker`, `reviews_heading`, `reviews_lede` and
`body_code` (markup the frontend puts before `</body>` on public pages). Not
sanitised, deliberately — a snippet that cannot carry a script is useless —
which is safe only because `role:admin` is the sole writer; the frontend
reads the app id out of the reviews snippet rather than injecting it.

**The `social` group is public** and holds the seven profile URLs —
LinkedIn, X, Facebook, Instagram, YouTube, WhatsApp and, since 2026-09-24,
`social_reddit` — plus how the footer draws them: `social_style` (`flip` or
`dock`, offered as `options`, refused outside them) and `social_flip_word`
(letters and digits, at most 7 — one tile each — stored in capitals). A blank URL hides its
icon.

**`theme_radius` and `theme_density`** (2026-10-05) are `appearance` rows,
public: `soft`/`sharp`/`round` and `comfortable`/`compact`/`airy`, offered as
`options` and a 422 outside them; seeded `soft` and `comfortable`, which are
the site as it was. **`theme_surface`** (`flat`/`elevated`/`outline`, the
same rules, seeded `flat`) joined them in 0.103.0 — with `soft` and `glow`
since 0.121.0 — and **`theme_type_scale`** (`standard`/`compact`/`large`,
the same rules, seeded `standard`) in 0.121.0: how large the site's headings
are set. **`motion_cards`**
(`lift`, `tilt`, `float`, `still`; seeded `lift`) the `motion` group, checked
for the shape of an id like the other motion keys.

**The `action_bar` and `coming_soon` groups are public** (0.122.0,
`docs/site-chrome.md`). `action_bar_enabled` (`0`/`1`, off by default),
`action_bar_call` (`0`/`1`, on — the Call button, which rings the `phone`
setting), `action_bar_whatsapp_number` (stored as digits; 8–15 of them or a
422; blank falls back to `chatbot_whatsapp_number` on the frontend),
`action_bar_enquire_label` (≤ 16 characters) and `action_bar_enquire_href`
(a path, an http(s) URL, a `mailto:` or a `tel:` — `LinkPattern`; a 422
otherwise). `coming_soon_enabled` (`0`/`1`, off), `coming_soon_heading`
(≤ 120), `coming_soon_message` (rich text, cleaned on write through the
`cms` profile) and `coming_soon_image_path` (a media path, published with
`coming_soon_image_url` and its size by the `_path` rule). The switch is
also published as `meta.coming_soon` on `GET /redirects`.

**The `pwa` group is public** (2026-10-05, `docs/pwa.md`): `pwa_enabled` and
`pwa_install_prompt` (`0`/`1`, both on by default), `pwa_name` (≤ 45),
`pwa_short_name` (≤ 12 — what a launcher prints under the icon; a 422 above
it), and `pwa_icon_path` (a media path, published with `pwa_icon_url` and its
size by the `_path` rule). The manifest, the icons and the service worker are
built from them before anybody signs in.

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

### Email templates

Every one of the 40 system emails, editable.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/settings/email-templates` | Every message with its state. `meta.messages` is the whole catalogue |
| `GET` | `/admin/settings/email-templates/{key}` | The stored copy, or the shipped starting point |
| `PUT` | `/admin/settings/email-templates/{key}` | `subject`, `body_html`, `body_text`, `is_enabled`, `sends`, `cc`, `bcc`, `from_name`, `from_email` |
| `DELETE` | `/admin/settings/email-templates/{key}` | Reset the **wording**. 204 always |
| `POST` | `/admin/settings/email-templates/{key}/preview` | Renders a draft without saving it |
| `POST` | `/admin/settings/email-templates/{key}/test` | Sends the draft to the caller. Throttled 6/min |

**`{key}` is a plain string, not a bound model.** There is no row for an
uncustomised message and binding would 404 on 40 of 40 on a fresh install.

**Two switches, and they mean different things.** `is_enabled` is "use my
wording" — false puts the built-in text back and the message still goes.
`sends` is "send this message at all" — false and nobody receives it, not the
desk and not the customer. `sends` is asked at **delivery** through
`shouldSend()` on the `Templated` trait, which the framework's sender and its
test fake both honour, so a queued receipt reads the switch when the worker
runs rather than when the order was placed. A skipped message is not a failed
one: nothing is logged and nothing lands in `failed_jobs`.

**Three messages are `locked`** — `verify_customer_email`, `reset_password`
and `sign_in_code_issued`. Each carries a credential somebody is waiting for at
a form with no other way in, so `sends: false` is refused with a 422 on
`sends`, and any `cc` or `bcc` is refused on that field: a sign-in code copied
to a second inbox is an account takeover, however trusted the inbox. The flag
rides on every entry in `meta.messages` so the console disables the controls
from the API's own answer rather than from a list of three keys. Their wording
and their sender stay editable — the lock is about delivery and copies.

**`cc` and `bcc` are posted as strings and stored as arrays.** Split on
newlines, commas and semicolons, trimmed, blanks dropped, duplicates collapsed
regardless of case, each address `email:rfc` (never `email:dns` — a DNS lookup
on the request path), at most ten. A bad address is a 422 that **names it**;
"invalid" against a list of eight is a hunt. They are applied to the
`MailMessage` before the wording's own early return, so a message with the
built-in text and an archive BCC still carries the BCC.

**`from_name` and `from_email` are the campaign's two fields** with the same
rules, and null means the global sender (`mail_from_address` /
`mail_from_name`, then `config('mail.from')`); a name alone takes the global
address with that name. Nothing verifies the address is one the provider is
authorised to send as — that is SPF and DKIM at the provider, and the failure
is the one the campaign editor already names: the message authenticates,
leaves, and lands in spam with nothing reporting it. Offered with the warning
rather than fixed or unconstrained.

**`is_customised` means wording has been written, not that a row exists.** A
row can now be a switch and two address lists over the built-in text, and
calling that "customised" sends somebody to look for words that are not there.

**Reset clears the wording and keeps the decisions.** `DELETE` nulls
`subject`, `body_html`, `body_text` and puts `is_enabled` back; a row carrying
`sends: false`, a copy list or a sender keeps them, and only a row holding
nothing but wording is deleted. Switching a message back on, dropping an
archive address or changing who it comes from are different decisions made on
the same screen, and "reset the wording" must not take them silently.

**`test` sends regardless of `sends`.** "Send me a test of this message" is a
different request from "send this message", and a switched-off template is
exactly the one somebody wants to check before switching it back on.

## Admin — FAQs (`role:content_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/faq-owners` | Grouped picker: solutions, services, products, pages — and, since 2026-09-21, product categories, store products, store categories, brands, blog posts, knowledge articles and industries |
| `GET` | `/admin/faqs` | `?q=`, `?owner_type=`, `?owner_id=` |
| `POST` | `/admin/faqs` | `question`, `answer` (rich text), `sort_order`, `owner_type`, `owner_id` |
| `GET`/`PATCH`/`DELETE` | `/admin/faqs/{id}` | |

**An FAQ must name an owner**, though the column allows null. Nothing on the
public site renders an unattached one, so it would be written, saved and never
seen. `owner_type` is the morph key (`solution`), not a class name.

**Eleven owners, and each entity's own form takes `faqs[]` too.** The seven
widened on 2026-09-21 each gained `faqs(): MorphMany` and accept
`faqs[{question,answer}]` on their store/update requests, replaced wholesale.
Their admin detail reads carry `faqs`; their public detail reads carry
`faqs: [{id, question, answer}]`. The FAQPage gate reads them beside the
`question` answer blocks — see "Answer blocks" under the CMS entities.

---

## Admin — SEO and redirects (`role:seo_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/seo` | Indexable records, each with a score. `?type=`, `?q=`, `?issues=1`, `?check=`, `?aeo=poor\|fair\|good`, `?geo=poor\|fair\|good`, `?aeo_check=<key>`, `?geo_check=<key>` (the records failing one named AEO or GEO check — the site card's biggest wins for each score), `?sort=aeo\|geo\|score` with `?dir=`, `?page=`, `?per_page=` (max 200, default 50) |
| `PATCH` | `/admin/seo/sitemap` | `type`, `id`, `sitemap_include` |
| `GET` | `/admin/redirects` | `?q=`, `?source=automatic\|manual`, `?active=` |
| `POST` | `/admin/redirects` | `from_path`, `to_path`, `status_code`, `is_active` |
| `GET`/`PATCH`/`DELETE` | `/admin/redirects/{id}` | |

**Every row carries `ai_pending`** — suggestions on that record nobody has decided on — and `?ai=pending` filters to the records holding one: the review queue a bulk run produces. `meta.ai` is the assistant's state (the same block `seo/ai/suggestions` sends), so the overview can offer "Draft for these N" only when the assistant is on and has a key; `meta.ai.usage` is what each model produced in the last ninety days and how much of it was accepted — `acceptance` is applied over decided and **null while nothing has been decided**, never zero.

**With Google Analytics connected, every row carries `analytics`** — `{views, users}` (`screenPageViews` and `totalUsers`) over the same 28 days, matched on the record's public path with any query string stripped, or null where nobody opened the page — and `?analytics=no_views` filters to the pages Google shows that nobody opens: rows with search figures and no analytics row, or, without Search Console, rows with no analytics row at all; with GA4 itself off it yields nothing rather than everything. `meta.analytics` is `{configured, days, error}`, the `meta.search` shape. One cached `runReport` an hour for the whole overview (`App\Support\Seo\GoogleAnalytics`), never a call per row.

**With Search Console connected, every row carries `search`** — `{clicks, impressions, ctr, position}` over the last 28 days, matched on the record's public path, or null where the page had no impressions — and `?search=no_clicks` filters to the pages shown twenty or more times and never opened. `meta.search` says whether the property is configured, over how many days, and the last refusal in Google's words (`gsc_error`, the `mail_error` pattern). One cached read an hour for the whole overview (`App\Support\Seo\SearchConsole`), never a call per row; the assistant's context lists the queries a page already appears for.

**Every row carries `aeo` and `geo` beside `score`** (2026-09-21): `{value,
band}` on the list, the full `{value, band, passed, checked, failed[]}` from
`GET /admin/seo/{type}/{id}`. `App\Support\AeoScore` asks whether the page
can be quoted — a definition block, three questions counting FAQs, the FAQPage
gate, key facts or a spec sheet, use cases, a comparison on products and
solutions, steps on articles and services, direct answers under 600
characters, internal links, structured data. `App\Support\GeoScore` asks
whether an engine can tell what it is quoting — the organisation complete
(name, address, phone, email, logo), the contact details consistent, a brand
and a category on products, solutions/services/industries linked where the
kind of record can link them, a supporting article, an author on posts, a
certification on file, a `why`/`who_for` block, a definition. Both are the
`SeoScore` shape, scored out of what applies, with the applicability rules in
the class. `?aeo=` and `?geo=` filter by band, `?sort=aeo|geo` orders by the
figure (ending on id), `meta.site_score.aeo` and `.geo` carry the site's two
averages with their own `top_issues` and `groups` — each key a value for
`?aeo_check=` / `?geo_check=`, their own parameters because the three rubrics
share `internal_links` as a key and `?check=` names the SEO score's failure —
and every row carries the `entity` block the public read publishes.

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

**Twelve record types now, not nine.** `job_opening`, `store_product` and
`store_category` all carry `HasSeo` and were missing from `SeoController::ENTITIES`
-- the first two had the trait and no row on this screen, the third had no
`HasSeo` at all until now. All three are indexable, in the sitemap, and each
had no score, no duplicate-title check and no Recheck button until this was
noticed. See `CLAUDE.md` for how each was found.

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

## Admin — the AI SEO assistant (`role:seo_manager`)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/admin/seo/ai/{action}` | The seven SEO actions — `generate`, `analyze`, `improve`, `faq`, `internal_links`, `schema`, `keywords` — and, since 2026-09-21, the eight AEO/GEO ones: `aeo_analyze`, `questions`, `answer_blocks`, `improve_answer`, `faq_suggest`, `geo_analyze`, `entity_links`, `product_qa`. Body `{type, id}`, plus **`block_id`** for `improve_answer` (required; 422 on `block_id` when absent or when the block is not this record's own). Throttled 10/min. `keywords` answers `{focus_keyword, intent, reason, secondary_keywords}`; every action is told the record's stored focus and secondary keywords and to keep them. The AEO/GEO shapes are below |
| `GET` | `/admin/seo/ai/suggestions?type=&id=` | This record's history, newest first, plus `meta` — `meta.actions` is all fifteen with `label` and `description` |
| `POST` | `/admin/seo/ai/suggestions/{id}/status` | `applied` or `rejected`. Reversible |
| `GET` | `/admin/seo/ai/context?type=&id=` | Exactly what the model would be told, and its token count. `&action=` picks the action's own prompt, `&block_id=` names the block for `improve_answer` |
| `POST` | `/admin/seo/ai/bulk` | `{action, type, ids[]}` (max 25). Queues one `RunSeoSuggestion` job per record; **202** with `queued`, `skipped_pending`, `skipped_cap`, `delivering`. The three refusals (off, no key, cap) are made before anything is queued; a record with a `pending` suggestion for that action is skipped; never queues past what is left of the day's cap. `improve_answer` is refused on `action` — it works on one block. Throttled 10/min |
| `POST` | `/admin/seo/ai/test-model` | `{model?}` (an OpenRouter id, max 64; blank tests the SEO assistant's own). One real call through OpenRouter, to prove this key can call that model. 200 `{data: {model, ok: true, tokens}}`; **422 in the provider's own words** on `message` and `errors.model`. Answered whether or not the assistant is switched on; refused only with no key. Spends none of the daily cap. Throttled 6/min |
| `GET` | `/admin/seo/ai/models` | What "Test a model" offers. `data` is the model list — `[{value, label, description}]`, the rows `meta.models` carries, a stored value from outside the list appended as its own marked option — and `meta` is `{seo_model, chatbot_model, key_configured}`: the model each feature would call now (after its fall-through) and whether an OpenRouter key is saved. Reads settings only: no provider is called and the key's value is never returned. Answered with the assistant off. Throttled 60/min |

**Declared above `seo/{type}/{id}`**, or `{type}` binds the literal `"ai"` and
every one of these answers 404 from model binding — the `media/move` trap, which
reads as a missing record rather than a routing mistake. `seo/ai/{action}` is
last within the block for the same reason one level in.

**Every AI feature calls OpenRouter** (0.116.0) — the SEO assistant, alt text,
the article and page drafts, the website assistant and its intake judge — at
`https://openrouter.ai/api/v1/chat/completions`, through the one provider
`App\Support\Chat\Providers\OpenRouterProvider`. The key is the
`openrouter_api_key` setting (`integrations`, secret), then
`OPENROUTER_API_KEY` in `api/.env` (`AI_API_KEY` is still read as the older
name; either must hold an OpenRouter key). Each request carries OpenRouter's
attribution headers, `HTTP-Referer: FRONTEND_URL` and `X-Title: <company
name>` (the `company_name` setting, else `APP_NAME`). The client's own Google
AI Studio and OpenAI keys are saved **at OpenRouter** (bring your own key),
never here, so a model answers only when its maker's key is configured there
or the OpenRouter account has credit.

**A model is an OpenRouter id, `maker/model`.** `App\Enums\AiModel` is the
list both pickers offer (`seo_ai_model`, `chatbot_model` — both rows are in
the `integrations` group since 0.116.0, drawn on Settings → API keys beside
the key and the model test), Google's first:
`google/gemini-2.5-flash` (**the default**), `google/gemini-2.5-flash-lite`,
`google/gemini-2.5-pro`, then `openai/gpt-4o-mini`, `openai/gpt-4.1-mini`,
`openai/gpt-4o`, `openai/gpt-4.1` — all of which read pictures, which alt
text needs. The default is a Google model because a Google AI Studio key is
free to create and, added at OpenRouter, is enough to call it; **an OpenAI
model needs an OpenAI key, or credit, in the OpenRouter account**, and each
OpenAI option's `description` says so. A blank `seo_ai_model` falls through
to `chatbot_model`, a blank `chatbot_model` to `AI_MODEL`, and that to the
default. A stored value outside the list is still kept, offered back and
sent exactly as written.

**The `MoveAiToOpenRouter` upgrade step** (0.116.0) renames a stored bare id
— `gpt-4o-mini` → `openai/gpt-4o-mini`, the same model under OpenRouter's
name, never the default — leaves a blank blank (so it now resolves to the
Google default), and deletes the old `openai_api_key` row. An OpenAI key is
not copied into `openrouter_api_key`, because OpenRouter refuses one.

**`test-model` reports three kinds of refusal, each a 422.** A non-2xx from
OpenRouter; a 200 carrying an `error` object, which is how it reports a maker
failing after the request was accepted; and a 200 with no choices or an empty
one. The message is OpenRouter's `error.message` and, when present, what the
maker itself said — `error.metadata.raw`, with `metadata.provider_name` in
front: `Provider returned error — Google AI Studio: API key not valid.`, or
`No endpoints found for openai/gpt-9.` for an id nobody serves.

**A rate limit is a 429 reported in the maker's words and never retried.** A
free Google AI Studio key is limited per minute and per day; past the limit
`test-model` answers 422 with the sentence whole — which limit, and how long
to wait — and every other AI endpoint answers its ordinary "The AI service
did not answer. Try again shortly." (the website assistant falls back to the
pages it found). The refusal is logged at `warning` with the status, code,
maker and raw message. No request is sent a second time on a refusal.

**A model that thinks before it answers is given headroom.** For
`google/gemini-2.5-flash` and `google/gemini-2.5-pro` the `max_tokens` sent
is the caller's cap plus the same again, and never less than 1,024 more: the
thinking is drawn from the same allowance as the answer, so a small cap (5 to
prove a model, 120 for an alt text) could otherwise be spent before a word
is written. An empty reply that ran out this way is the failure "The model
used its whole allowance of tokens before writing an answer."

**A reply asked for as JSON is read through its wrapping.** A Gemini model
fences its object (```` ```json ````) or introduces it with a sentence where
a GPT model does not; `App\Support\Chat\JsonReply` reads the object out of
either and never repairs a truncated one. Page and article drafts are given
90 seconds to answer, not the 30 a visitor's question gets.

**Nothing here writes an SEO field.** A run stores a suggestion; the status
endpoint records a decision. The values reach the record through its own form
and its own update endpoint, with `SeoRules` and `HtmlSanitiser` exactly as a
typed value does — which is what makes "AI suggestions must not overwrite
existing SEO fields" structural rather than remembered.

**Every refusal is a 422 with a sentence a person can act on** — switched off,
no key, cap reached, the service silent. Never the provider's own words: those
carry model names, quota messages and organisation ids. `test-model` is the one
deliberate exception, for the reason `/admin/settings/mail/test` is.

**A suggestion cannot name a page that does not exist.** Internal links are
chosen by index from a numbered list of real published records; anything outside
it is dropped. Schema is constrained to `SchemaTypes::for()` for that record.

**The AEO/GEO actions (`docs/aeo-geo-contract.md` §6) answer these shapes**,
each whitelisted key by key like the seven before them:

| Action | `result` |
|---|---|
| `aeo_analyze`, `geo_analyze` | `{summary, strengths[], gaps[], suggestions[]}` — up to 8 a list |
| `questions` | `{questions: [{question, intent}]}` — up to 8, no question twice |
| `answer_blocks`, `product_qa` | `{blocks: [{kind, question, answer, detail}]}` — up to 8; `kind` is an `AnswerBlockKind` value and **a row with a kind the enum does not know is dropped**, as is a `question`/`comparison` row with no `question`; `answer` is plain text ≤ 600; `detail` is `<p>` paragraphs built here from escaped text, or null |
| `improve_answer` | `{answer, detail}` for the one block `block_id` named |
| `faq_suggest` | `{faqs: [{question, answer}]}`, the `faq` shape |
| `entity_links` | `{links: [{n, relation, title, path, reason}]}` — `n` into the numbered list of real solutions, services, industries, published posts and articles and catalogue products the model was shown; an `n` outside it is dropped, and `relation` (`solution`/`service`/`industry`/`article`/`product`) is **the list's**, never the model's word |

**`[MISSING: what]` is kept verbatim.** The answer-writing actions are told —
outside the fence, in the API's own words — that a fact the material does not
give is written as `[MISSING: what is missing]`, never guessed; a store product
is given its facts (brand, SKU, GTIN, MPN, category, price, availability,
warranty, applications, specifications, features, the services that install it)
with a blank one named `(not entered)`. The marker survives validation
untouched so the editor sees it before pressing Apply. The context also carries
the answer blocks (drafts included) and the FAQs already on the page, inside
the fence, so a draft adds rather than repeats.

**Apply never reaches this API.** The console adds the suggested blocks and
FAQs to the record's own repeaters as unsaved drafts; Save goes through the
record's update endpoint with `CmsFieldRules::answerBlocks()` and
`HtmlSanitiser` as a typed row does.

**Off by default** (`seo_ai_enabled`, private `seo` group). Switched off, these
endpoints refuse before the provider is reached and the console renders no AI
control at all. See `docs/seo-ai.md`.

**`seo.secondary_keywords` joins the override block** — an array, max 10, each
under 120 characters. `resolvedSeo()` returns `[]` rather than null for a record
that has none, so the shape does not change with the data.

---

## Admin — staff (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/staff/roles` | The four roles with descriptions |
| `GET` | `/admin/staff` | `?q=`, `?role=`, `?active=` |
| `POST` | `/admin/staff` | `name`, `email`, **`phone`**, `roles[]`, optional `password`, `is_active` |
| `GET`/`PATCH`/`DELETE` | `/admin/staff/{id}` | |

**A staff account carries a mobile number, and the API is what requires it.**
`phone` is `required` on create and `sometimes|required` on update — a PATCH
that mentions it must carry a real one, and a PATCH that does not (the list's
activate/deactivate, a role change) is not made to backfill a row that
predates the column. Rows without one are named on the Staff screen rather
than found one edit at a time, and `GET /admin/auth/me` carries `phone` so
the profile screen can say whether a number is on file. `StaffPhoneTest`
pins all three.

**Omitting `password` on create generates one** and returns it as
`generated_password` on that response only. It is hashed in the database and
cannot be read again.

**Three lockout guards**, all returning 422: you cannot deactivate or delete
your own account, you cannot remove your own administrator role, and the last
active administrator cannot be deactivated, deleted or demoted. Without the
last one, two administrators can each demote the other.

---

## Admin — webhooks (`role:admin`)

Outgoing webhooks: another system told, by a signed POST to a URL of its
own, that a lead, a ticket, an order, a customer, a form submission or a
subscriber arrived here.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/webhooks` | Paginated, by name. `?active=0\|1`, `?per_page=` (max 100). `meta.events` is the subscribable list with `label` and `blurb` |
| `POST` | `/admin/webhooks` | `name`, `url`, `events[]`, `is_active`. **201 carries `secret`**, on this response only |
| `GET` | `/admin/webhooks/{id}` | Never carries `secret`; `has_secret` is the most it says |
| `PATCH` | `/admin/webhooks/{id}` | The same fields, each optional. `rotate_secret: true` mints a new one and answers it once |
| `DELETE` | `/admin/webhooks/{id}` | Its deliveries cascade |
| `POST` | `/admin/webhooks/{id}/ping` | One `ping` to this hook, subscribed or not. **202** with `{delivery_id}`. Throttled 30/min |
| `GET` | `/admin/webhooks/{id}/deliveries` | Newest first. `?status=pending\|delivered\|failed`, `?per_page=` (max 100). **No `payload`** on the list |
| `GET` | `/admin/webhooks/{id}/deliveries/{delivery}` | One delivery, **with `payload`** — the `data` of the envelope that was sent |
| `POST` | `/admin/webhooks/{id}/deliveries/{delivery}/redeliver` | A fresh delivery row with the same payload, dispatched now. **202** with the new row. Throttled 30/min |

**`role:admin`, not any narrower role.** A hook is handed every lead's
telephone number, every order's address and every ticket's text, signed, at
an address somebody typed. Deciding where that goes is the same class of
decision as the SMTP settings beside it.

**The events** are `App\Enums\WebhookEvent`: `lead.created`,
`ticket.created`, `ticket.replied` (a customer-visible message from either
side — never an internal note), `ticket.status_changed` (adds `from`/`to`),
`order.placed`, `order.paid` (`paid_at` going from null to set, whoever set
it), `order.status_changed` (adds `from`/`to`), `customer.registered` (the
address confirmed), `form.submitted`, `subscriber.joined`, `visit.requested`
(an engineer visit request, never its token) and `event.registered` (a new
registration for an event: the admin registration resource less `staff_note`,
plus `event: {id, title, slug, starts_at, ends_at, format, public_path}` —
never the manage token or the join link). `ping` is sent
by the ping endpoint only and cannot be subscribed to — a 422 on `events.*`.

**The envelope** is `{id, event, created_at, data}`, where `id` and
`created_at` are the delivery's own and `data` is the admin resource's shape
resolved as its detail read: `TicketResource` with `customer` (the
customer's *own* resource — no `status_note`), `category` and `assignee`;
`Admin\Store\OrderResource` with `items`, the addresses and no
`access_token`; `Admin\LeadResource` as a list row; `CustomerResource`;
`FormSubmissionResource`; `Admin\NewsletterSubscriberResource` with
`groups`. `ticket.replied` adds `message` (`TicketMessageResource`). What a
webhook consumer sees is what `GET /admin/…/{id}` answers, so the two
cannot drift.

**Every delivery carries five headers.** `User-Agent:
Technoware-Webhooks/1.0`, `X-Technoware-Event`, `X-Technoware-Delivery` (the
delivery id — dedupe on it), `X-Technoware-Timestamp` (unix seconds) and
`X-Technoware-Signature: sha256=<hex>`, an HMAC-SHA256 with the hook's
secret over `timestamp + "." + body`, **where `body` is the exact bytes
received**. The JSON is encoded once, sent as that string and signed as
that string; a receiver that verifies over its own re-encoding sees a
mismatch that reads as a wrong secret. Check the timestamp against your own
clock to refuse a replay.

**A 2xx is delivered; anything else is retried five times** — after 60s,
5min, 30min, 2h and 12h — with a 10-second request timeout. Each attempt
records `response_status` and the first 500 characters of the answer on the
delivery; the fifth failure marks it `failed` and writes the server's own
words onto the hook's `last_error`, which the next successful delivery
clears. A hook switched off between attempts is not sent to.

**The secret leaves once.** Minted server-side, encrypted at rest, on the
`POST`'s 201 and on a `PATCH` that rotated it, and on no read. It never
reaches the activity log, which records the create and the delete by its
existing rules.

**The URL is refused on write when this server must not be pointed at it**:
plain `http://`, credentials in the URL, an IP literal in a private or
reserved range in either family, `localhost`, a bare name with no dot, or a
`.local`/`.internal`/`.lan`/`.home.arpa` suffix — each a 422 on `url` with a
sentence saying which — and a host written as a bare number (`127.1`,
`0x7f.0.0.1`, `2130706433`) or as `::ffff:` IPv4. **At send time** the host is
resolved, every answer must be public, and the connection is pinned to those
addresses; a private answer is recorded as a refusal and retried. **A redirect
is not followed** — a 3xx is a failed attempt like a 5xx. See
`docs/admin-console.md`.

**A webhook never fails the request that caused it.** `Webhooks::emit()`
is guarded like `Notifier`: a failure to write the delivery row is logged at
`warning` and the ticket, order or lead still answers as it would have. The
delivery row is written in the caller's transaction and the job dispatched
after commit, so a rolled-back checkout leaves no `order.placed` behind.

**Deliveries are pruned at thirty days** by
`technoware:prune-webhook-deliveries`, nightly.

---

## Notifications

Not endpoints — side effects of existing ones. **A webhook is emitted
beside each of the ones marked below** (see "Admin — webhooks"), through
`App\Support\Webhooks\Webhooks`, which is guarded the way `Notifier` is: the
delivery is queued in the same transaction and sent after it commits, and a
failure to queue it never fails the request.

| Trigger | Goes to | Notification |
|---|---|---|
| `POST /tickets` | `support_email` setting | `TicketCreated` — and `ticket.created` |
| `POST /tickets` | The customer | `TicketAcknowledged` |
| `POST /tickets/{ref}/messages` | `support_email` setting | `TicketReplied` — and `ticket.replied` |
| `POST /admin/tickets/{ref}/reply` | The customer, **unless `is_internal`** | `TicketReplied` — and `ticket.replied`, under the same condition |
| `POST /enquiries` | `sales_email` setting | `EnquiryReceived` — and `lead.created` |
| `POST /enquiries` | The enquirer | `EnquiryAcknowledged` |
| `POST /forms/{slug}` | the form's `notify_email`, else `sales_email` | `FormSubmitted` — and `form.submitted`, then `lead.created`. Answers in the form's own order; a choice by its label, several joined by ", ", a rating as "4 / 5", an upload **by filename only** with a line saying it is downloaded from the console — never attached |
| `POST /forms/{slug}` | The sender, **when the form collected an address** | `FormAcknowledged` |
| `POST /checkout` | The buyer — the itemised sales order, closing with how they chose to pay | `OrderPlaced` — and `order.placed` |
| payment settles | The buyer — the receipt | `OrderPaid` — and `order.paid`, plus `order.status_changed` |
| payment settles | `support_email` setting | `OrderReceived` |
| status → dispatched | The buyer | `OrderDispatched` — and `order.status_changed`, as on every status move |
| `POST /auth/register` | The registrant | `VerifyCustomerEmail` |
| `POST /auth/register` (address known) | The **existing** account holder | `RegistrationAttempted` |
| `POST /auth/verify-email` | `support_email` setting | `CustomerRegistered` — and `customer.registered`; the same pair when a sign-in code confirms the address |
| `POST /admin/customers/{id}/approve` | The customer | `CustomerApproved` |
| `POST /admin/customers/{id}/reject` | The customer | `CustomerRejected` |
| `POST /visits` | `visits_email`, else `sales_email` | `VisitRequestReceived` — and `visit.requested` |
| `POST /visits` | The customer | `VisitRequested` |
| A customer cancels or asks for other times | `visits_email`, else `sales_email` | `VisitRequestReceived` (the `visit_request_changed` wording) |
| A visit is cancelled, by either side | The customer | `VisitCancelled` |
| `POST /admin/visits/{reference}/confirm` | The customer, with a `.ics` | `VisitConfirmed` (`visit_confirmed` or `visit_rescheduled`) |
| `technoware:remind-visits` | The customer | `VisitReminder` |
| `POST /events/{slug}/register`, or the desk adding one | `events_email`, else `sales_email` — for a **new** registration only | `EventRegistrationReceived` — and `event.registered`, then `lead.created` |
| a registration is confirmed — and again, at most once in 10 minutes, when its address registers a second time | The registrant, with a `.ics`, the join link and their manage link | `EventRegistrationConfirmed` (`event_registration_confirmed`) |
| a registration joins the waiting list (re-sent the same way on a repeat) | The registrant | `EventRegistrationWaitlisted` |
| a place opens for a waiting registration | The registrant, with a `.ics` | `EventRegistrationConfirmed` (`event_waitlist_promoted`) |
| a registration is cancelled, by either side | The registrant | `EventRegistrationCancelled` |
| `PATCH /admin/events/{id}` with `notify_registrants` and a new time, place or join link | Each confirmed registrant, with a `.ics` | `EventChanged` |
| `technoware:remind-events` | Each confirmed registrant, once | `EventReminder` |
| a stock movement fills a saved shelf | The wishlist holder, once, inside the quiet hours | `WishlistBackInStock` |
| a saved product's price falls far enough | The wishlist holder, once per drop, inside the quiet hours | `WishlistPriceDrop` |

**A send failure never fails the request.** `App\Support\Notifier` logs and
swallows: a committed ticket must still answer 201 when mail is down.

**Both form notifications now name the page and link to the lead.** The email
stays the announcement and the pipeline record is written first, so a dead mail
server cannot cost an enquiry. The link is absolute and built on `frontend_url` —
correct here and wrong in the console, where a path lets the browser supply the
origin.

**The two acknowledgements are new, and they close a real gap.** Until them the
desk was told and the person who wrote in was not, so somebody who mistyped
their address found out days later when a reply bounced — having spent that
time believing they had contacted the business. A ticket has acknowledged since
it shipped; enquiries and editor-built forms never grew the second half.

**`FormAcknowledged` is sent only when the form collected an address**, found by
`Form::submitterEmail()` from the first field whose *kind* is `email`. Never
from `$lead->email`: `LeadIntake` guesses the contact columns from likely key
names, so a field called `contact_email` yields a lead with no address at all —
right for a pipeline record, wrong for a recipient. A form that asks for no
address acknowledges nobody, and `Notifier::to()` already treats null as no
recipient.

**Neither acknowledgement echoes the submission back.** They are messages this
server will send to any address typed into a public form — a reflected-mail
surface, bounded by the endpoint's 10/min throttle. Fixed content is a nuisance
to abuse; content the sender supplies is a relay.

**All but three are queued**, so the request does not wait for
SMTP at all — an unreachable host was measured taking a contact-form submission
from 0.2s to 12.5s. The queue is drained by the scheduler every minute, so a
message goes out within about a minute of the thing that caused it.

**Unless nothing is draining it, in which case it is sent during the request.**
Queueing is an optimisation, and this is what stops it losing the message: a
stopped scheduler makes mail vanish in silence — nothing throws, nothing is
logged, the console looks healthy, and every receipt stops. That is not
hypothetical. It happened on this install, and the first sign was somebody
asking why the contact form had sent no email for two days while ten jobs sat
in the table.

`Notifier` asks `QueueHealth::delivering()`, which is the same answer the
settings screen and the campaign report already show — either the scheduler's
heartbeat or a bare `queue:work` writing its own pulse, within
`HEARTBEAT_SECONDS`. One definition of "delivering", not a second threshold.
The cost is that while the queue is idle a request pays the SMTP round trip;
that is the worse of two costs only while the alternative is a message nobody
receives.

**Campaigns are never sent this way and cannot be.** They go out as
`SendCampaignBatch` jobs through `Mail::to()->send()` and never touch
`Notifier`, so no idle queue can put thousands of recipients on a request path
— and the batches are deliberately spaced to keep the relay happy, which an
immediate send would defeat. `QueuedMailTest` pins it rather than trusting it.

**Three are sent during the request, deliberately**: the sign-in code, the
password reset and the address verification. Somebody is sitting at a form
waiting for that exact message, and a code that takes a minute to arrive is a
sign-in nobody can use.

**A queued failure writes `mail_error`** through `QueuedMail::failed()`, after
three attempts. Without it a queued send cannot throw during the request, so a
dead mail server would leave a console that looks healthy while every receipt
stops arriving — the failure `mail_error` exists to prevent, reintroduced by
moving the send.

**And so does an immediate one, through `Notifier::guard()`.** `sendNow` runs no
job, so `failed()` never fires on that path — the fallback would otherwise have
quietly deleted the one signal that survives a swallowed failure. It closes the
same hole for the three notifications that were always synchronous, where a
failed sign-in code used to write nothing at all.

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

---

## Store reviews (2026-09-26)

See `docs/store.md`, "Reviews". The public and portal routes are listed under
"The store".

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/store/reviews` | `role:store_manager`. `?status=` (blank = waiting, `all` = every status), `?rating=`, `?product=` (id), `?verified=0\|1`, `?q=` (words, name, customer email, product), `?sort=created\|rating\|published` with `?dir=`, `?per_page=` (max 100). `meta.statuses`, `meta.pending_count`, `meta.sorts` |
| `POST` | `/admin/store/reviews/moderate` | `ids[]` (max 200), `status` of `pending`/`published`/`rejected`/`spam`. One row at a time, so `published_at`, the moderator and the product's summary follow. `{moved, pending_count, slugs}` |
| `PATCH` | `/admin/store/reviews/{id}` | `is_featured` |
| `DELETE` | `/admin/store/reviews/{id}` | For good; rejecting is the reversible choice |

**Every write goes back to the queue.** A customer's second `POST` rewrites
their one review, returns it to `pending` and clears `is_featured`;
`published_at` is never cleared. **Verified** is a line for the product on one
of the caller's `Order::paid()` orders, re-read on every write.

**`rating` on the store product resource** (index and detail) is
`{average, count}` from the product's stored summary, or **null** until a
review is published. The detail's `schema` gains `aggregateRating` and up to
five `review` nodes under the same condition.

**`GET /my/orders/{number}`** carries `my_review` on each item —
`{status, status_label, rating}` or null — and `slug` only while the product is
published. **`/admin/store/dashboard`** carries `attention.reviews_pending`.

**The review request.** `technoware:request-reviews` (hourly) sends
`review_request` once per order `store_review_request_days` after dispatch
(or payment, when nothing ships), inside `QuietHours`, while
`store_review_requests_enabled`; both settings are in the `store` group.
