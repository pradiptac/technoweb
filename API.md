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
| `POST` | `/auth/forgot-password` | Customer. Public, throttled. Answers the same whatever the address |
| `POST` | `/auth/reset-password` | Customer. Public. Spends a token and revokes every session |
| `POST` | `/auth/login` | Customer. Public, throttled |
| `POST` | `/auth/logout` | Customer. Revokes the current token |
| `GET` | `/auth/me` | Customer |
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
`campaign_manager`. **An `admin`
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
| `GET` | `/galleries/{slug}` | One picture set, its tabs and its items. 404 when unpublished **or empty** |
| `GET` | `/menus/{location}` | The navigation for `topbar`, `primary`, `footer` or `bottom`. **404 when nothing is assigned** |
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
| `GET` | `/pages` | Published CMS pages, **without bodies**. For the sitemap |
| `GET` | `/pages/{slug}` | CMS pages — `/privacy`, `/terms`, `/downloads` |
| `GET` | `/ticket-categories` | Powers the submit-a-ticket form |
| `GET` | `/settings` | Site settings. **Whitelisted by group**, see below |
| `GET` | `/search?q=` | Site-wide search, grouped by type. Min 2 characters, 5 per group |
| `GET` | `/redirects/lookup?path=/blog/old-slug` | 200 with `{data:{to,status}}`, or 404 |
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
better one than an apology.

**Four settings are public and the rest are not.** `chatbot_enabled`,
`chatbot_welcome`, `chatbot_quick_actions` and `chatbot_fallback` are named in
`ChatSettings::PUBLIC_KEYS`, because the widget is drawn before anybody speaks.
The model, the context window and the spend ceiling are not — the same
considered exception `newsletter_signup_enabled` is.

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

## The store

A **separate catalogue** from `/products`. What the shop sells is maintained
apart from what the site advertises: two lists, two lifecycles, and nothing
here reads `products`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/store/products` | Paginated. `?q=`, `?category=`, `?type=`, `?sort=`, `?page=` |
| `GET` | `/store/products/{slug}` | |
| `GET` | `/store/categories` | Only categories with something published in them |
| `GET` | `/store/categories/{slug}` | |
| `GET` | `/cart` | The basket for `X-Cart-Token`, or a new empty one |
| `POST` | `/cart/items` | `product_id`, `variation_id`, `quantity`. Throttled 60/min |
| `PATCH` | `/cart/items/{item}` | `quantity`. Zero removes the line |
| `DELETE` | `/cart/items/{item}` | |
| `DELETE` | `/cart` | Empties it |
| `POST` | `/checkout` | Places the order. Throttled 10/min, honeypot `website` |
| `GET` | `/orders/{number}?token=` | One order, for whoever holds the link |
| `POST` | `/orders/{number}/pay` | Opens a payment session |
| `POST` | `/orders/{number}/verify` | What the browser came back with |
| `POST` | `/payments/{gateway}/webhook` | The gateway talking to us. **Un-throttled** |

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

**`/checkout` prices the order itself.** The request carries a name, a phone
number and an address; the basket is re-read, every line re-priced from the
product under a row lock, and the total worked out again. Nothing supplied can
change what is charged. Short stock refuses the **whole** order rather than
part-filling it.

**The address is required by the basket, not by the form.** A digital-only order
has nothing to deliver, so `shipping_address` comes back null rather than a copy
of the billing one.

**A GSTIN is checked for shape and never against a government API.** The brief
rules that out, and a lookup on the request path is a cost this project has
measured once already at 12.5 seconds.

**An order is read by `access_token`, never by its number alone.** The number is
printed on paperwork, quoted on the telephone and sequential. The token is
returned **once**, on the response that creates the order, and appears in no
other response. A wrong token is a 404, compared with `hash_equals`.

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

| `POST` | `/cart/coupon` | Applies a discount code. Throttled 15/min |
| `DELETE` | `/cart/coupon` | Takes it off |
| `POST` | `/orders/{number}/items/{item}/reveal` | Hands over an activation code. Throttled 20/min |
| `GET` | `/my/orders` | The signed-in customer's orders |
| `GET` | `/my/orders/{number}` | One of them |

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

### Admin — the store (`role:store_manager`)

| Method | Path | Notes |
|---|---|---|
| `GET`/`POST` | `/admin/store/products` | `?status=`, `?type=`, `?category=`, `?out_of_stock=1`, `?q=` |
| `GET`/`PATCH`/`DELETE` | `/admin/store/products/{id}` | Bound by **id** |
| `GET`/`POST` | `/admin/store/categories` | |
| `GET`/`PATCH`/`DELETE` | `/admin/store/categories/{id}` | Deleting keeps the products |

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
| `GET` | `/admin/store/dashboard` | The shop at a glance. `?days=` of 7, 30 or 90 |
| `GET` | `/admin/store/reports` | What sold between two dates. `?from=`, `?to=`, `?group=` |
| `GET` | `/admin/store/reports/export` | The same range as a CSV. `?type=orders` or `products` |
| `GET` | `/admin/store/stock` | What came in and what went out. `?from=`, `?to=`, `?product=`, `?reason=`, `?direction=in\|out` |
| `GET` | `/admin/store/stock/movements` | The ledger behind those totals, paged |
| `GET` | `/admin/store/stock/export` | The same rows as a CSV |
| `GET`/`POST` | `/admin/store/coupons` | |
| `GET`/`PATCH`/`DELETE` | `/admin/store/coupons/{id}` | Deleting a used code is refused |

| `POST` | `/admin/store/orders/{number}/payments` | Record money that arrived without a gateway |

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
as the list it links to. `awaiting_codes` is the one worth knowing about: a paid
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
| Galleries | `/admin/galleries` | `subtitle`, `transition`, `autoplay`, `interval_ms`, `groups[]`, `items[]`. Titled `name`, and **no `seo`** — same reason as a slider. `meta.transitions` carries the options |
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
| `GET`/`POST` | `/admin/newsletter/subscribers` | `?q=`, `?status=`, `?group=`, `?suppressed=1` |
| `GET` | `/admin/newsletter/subscribers/export` | Streamed CSV, every cell escaped |
| `POST` | `/admin/newsletter/subscribers/paste` | A pasted block of addresses. Newlines, commas, semicolons, `Name <address>` |
| `GET`/`PATCH`/`DELETE` | `/admin/newsletter/subscribers/{id}` | Email and status are **not** settable |
| `POST` | `/admin/newsletter/subscribers/{id}/unsubscribe` | On somebody's behalf |
| `GET`/`POST` | `/admin/newsletter/groups` | With `subscriber_count` and `active_count` |
| `PATCH`/`DELETE` | `/admin/newsletter/groups/{id}` | Deleting keeps the subscribers |
| `POST` | `/admin/newsletter/imports/analyse` | Dry run over a CSV **or `.xlsx`**. Writes nothing |
| `POST` | `/admin/newsletter/imports` | Commits an analysed file |
| `GET` | `/admin/newsletter/templates` | Without `blocks` or `html` |
| `POST` | `/admin/newsletter/templates/preview` | Renders blocks without saving |
| `GET`/`POST` | `/admin/newsletter/campaigns` | |
| `GET`/`PATCH`/`DELETE` | `/admin/newsletter/campaigns/{id}` | A sent campaign refuses `PATCH` |
| `GET` | `/admin/newsletter/campaigns/{id}/audience` | The counts, and every removal |
| `GET` | `/admin/newsletter/campaigns/{id}/health` | The deliverability heuristic |
| `POST` | `/admin/newsletter/campaigns/{id}/test` | Throttled 6/min. Creates no recipient |
| `POST` | `/admin/newsletter/campaigns/{id}/send` | Or schedules it |
| `GET` | `/admin/newsletter/campaigns/{id}/report` | |
| `GET`/`POST`/`DELETE` | `/admin/newsletter/suppressions` | Lifting an unsubscribe is refused |

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
| `POST /forms/{slug}` | the form's `notify_email`, else `sales_email` | `FormSubmitted` |
| `POST /auth/register` | The registrant | `VerifyCustomerEmail` |
| `POST /auth/register` (address known) | The **existing** account holder | `RegistrationAttempted` |
| `POST /auth/verify-email` | `support_email` setting | `CustomerRegistered` |
| `POST /admin/customers/{id}/approve` | The customer | `CustomerApproved` |
| `POST /admin/customers/{id}/reject` | The customer | `CustomerRejected` |

**A send failure never fails the request.** `App\Support\Notifier` logs and
swallows: a committed ticket must still answer 201 when mail is down.

**Both form notifications now name the page and link to the lead.** The email
stays the announcement and the pipeline record is written first, so a dead mail
server cannot cost an enquiry. The link is absolute and built on `frontend_url` —
correct here and wrong in the console, where a path lets the browser supply the
origin.

**Seventeen of the twenty are queued**, so the request does not wait for SMTP at
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
