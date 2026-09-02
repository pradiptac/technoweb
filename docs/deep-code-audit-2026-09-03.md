# Deep code audit — 3 September 2026

## Scope and method

The whole repository, on `phase-3-admin-cms` at `85ccfb9`, with a clean working
tree. Every finding below was **run**, not read: the test suite, both browser
audits against real Laravel and MySQL, the documented mock workflow, a
production build, and four purpose-written probes for states the existing
audits structurally cannot reach.

Where a claim could be tested by reverting it, it was. Where a prediction of
mine turned out wrong, that is recorded too — one of them is in "Corrections"
at the foot.

**Gates, all green:** 728 tests pass (1 skipped — the SES build, whose package
is deliberately absent), 5,658 assertions. `pint`, `tsc --noEmit` and `eslint`
all clean. `npm run build` passes. No route is shadowed by an earlier
parameterised one. No secret is committed and `.gitignore` covers both `.env`
files.

---

## High

### 1. Ticket attachments cannot be downloaded — by staff *or* customers

`TicketAttachmentResource` returns an **absolute API URL**, and both the console
and the portal render it as a plain `<a href>`. A browser navigation carries no
`Authorization: Bearer` header — the Sanctum token lives in an httpOnly cookie
on the *Next* origin — so the request arrives unauthenticated.

Measured, as a browser click sends it:

```
GET /api/v1/admin/ticket-attachments/1   -> 401 {"message":"Unauthenticated."}
GET /api/v1/ticket-attachments/1         -> 401 {"message":"Unauthenticated."}
```

**And the person does not even see a clean 401.** Driven end to end against the
sibling case in finding 2 — signed in as a real administrator, fetching the URL
from the page with exactly the credentials a click carries — the answer is:

```
HTTP 500  {"message":"Route [login] not defined."}
```

A browser navigation sends `Accept: text/html`, so Laravel's auth middleware
tries to redirect to a `login` route that does not exist in an API-only
application. `API.md` opens with this exact warning — "Without it Laravel
answers unauthenticated requests with an HTML redirect and you get a 500
instead of a 401" — and these links are the one place in the product that
*cannot* send that header, because they are navigations rather than
`apiFetch` calls. So the user gets a 500 error page and the server logs an
exception.

Evidence: `api/app/Http/Resources/TicketAttachmentResource.php:20-22`,
`web/src/app/admin/(app)/tickets/[reference]/page.tsx:59`,
`web/src/app/portal/(app)/tickets/[reference]/page.tsx:59`. Neither route has a
signed-URL or `?token=` fallback (`routes/api.php:485,526`), and there is no
proxying route handler for them under `web/src/app/api/`.

This is a Phase 1 feature with a private disk, an authorised streaming
controller and a documented security rationale — and it has never worked from
the interface.

Why it survived, completely: **no ticket attachment exists in this database**,
so the audit walks the ticket screens and no link is ever rendered — and
**ticket attachments have no test coverage at all**. `TicketAttachment::` appears
nowhere in `tests/`, and neither `TicketLifecycleTest` nor
`TicketNotificationTest` uploads or downloads one. Every "attachment" test in
the suite is about *email* attachments. Nothing has ever exercised this path in
either direction.

The fix pattern is already in the codebase six times over — `app/api/.../
invoice/route.ts`, the CV route, and four CSV exports all proxy through a Next
route handler that attaches the token server-side.

*Caveat stated plainly:* I proved the endpoints 401 without a header and that no
proxy exists. With no attachment in the database I could not click a real link
end to end.

### 2. The media library's Download control is the same bug

`MediaResource.download_url` is likewise an absolute API URL, used at three call
sites — `window.location.href = item.download_url` and two `<a href>`s.

```
GET /api/v1/admin/media/1/download       -> 401
```

Evidence: `api/app/Http/Resources/Admin/MediaResource.php:15`,
`web/src/app/admin/(app)/media/media-card.tsx:146`,
`web/src/app/admin/(app)/media/media-preview.tsx:126,184`.

Unlike the attachments, media files *do* exist here — so this is the one that
could be driven all the way through, and was. Signed in as a real
administrator, fetching the link out of the rendered page with exactly the
credentials a click carries:

```
media download  -> HTTP 500
content-type    -> application/json
body            -> {"message":"Route [login] not defined."}
```

Reproducible right now by pressing Download on any file in the library.

---

## Medium

### 3. `bg-ink text-white` is 1.11:1 in the dark scheme — five call sites

`--color-ink` is the **text** token and it inverts: `themes.ts:323` gives it
`#f2f3ef` in dark. So `bg-ink text-white` is white on near-white. This is the
exact trap `CLAUDE.md` records ("a token that inverts cannot be paired with a
literal colour") and `blog-hero.tsx:27-28` warns about in its own docblock.

Measured at **1.11:1** in dark by two independent means — the project's own
`npm run audit`, and a probe for the states it cannot reach:

| call site | how it surfaces |
|---|---|
| `app/(marketing)/support/page.tsx:117` | the phone CTA — **caught by `npm run audit`** |
| `app/layout.tsx:126` | the skip link, on focus — every page on the site |
| `components/layout/cookie-consent.tsx:70` | the Accept button |
| `components/forms/reset-password-form.tsx:41` | after a password reset |
| `app/admin/(app)/users/staff-form.tsx:47` | Cancel, on the staff form |

Only the first is on an audited route in a default state, which is why one of
five was known. The banner is currently unreachable because no analytics ID is
configured — **it will appear the day the client sets a GA4 ID**, which is
precisely the "reachable only from stored state" gap that let `Alert` ship at
1.53:1 for months.

Related, same cause: `bg-ink/45` scrims become a **white** 45% wash in dark —
`modal.tsx:108`, `site-header.tsx:344`, `media/item-menu.tsx:206`,
`media/crop-dialog.tsx:245-248`.

### 4. Links an editor writes are 3.77:1 inside the Summernote editor, in dark

`globals.css` re-points the editable area (`:678`) and the toolbar's dropdown
links (`:824`) at the theme's tokens, but **there is no rule for a content link
inside `.note-editable`**, so an `<a>` in a CMS body falls back to the browser
default against a near-black panel.

Caught by the dark audit on `/admin/pages/6` — worst 3.77:1, on the text
"Tell us what you are running", which is a plain `<a href="/contact">` in that
page's stored body with no author-applied colour.

It has stayed hidden because it needs a CMS body that happens to contain a link
*and* for that record to be the one `DISCOVER` picks.

### 5. `GET /cart` is an unthrottled public write, and the prune it claims does not exist

`Cart::forToken(null)` calls `create()`, so **every tokenless request persists a
row**. `routes/api.php:133` is the only cart route with no `throttle` middleware
— the other five have 60/min, 30/min or 15/min.

The frontend is careful (`lib/cart.ts:68` returns early with no cookie, so
crawlers create nothing), but the API is public and anyone may call it directly
at any rate.

Two things compound it:

- **Nothing prunes `carts`.** No command, nothing in `schedule:list`. This is
  already tracked in `PROGRESS.md:694` — the new part is the unthrottled write
  in front of it.
- **`lib/cart.ts:44-45` states "The API prunes abandoned carts on its own
  schedule."** It does not. A comment asserting a mitigation that was never
  built is the shape this codebase treats as a defect in its own right.

55 rows already, on an install that has never had a real visitor.

### 6. Three models bindable in admin DELETE routes are missing from the morph map

Control-run — `Product` resolves, these throw:

```
BlogCategory  => THROWS ClassMorphViolationException
Gallery       => THROWS ClassMorphViolationException
Coupon        => THROWS ClassMorphViolationException
Product       => product          <- the control
```

All three are bound in admin `DELETE` routes (`routes/api.php:737, 924, 989`),
and the activity log records **every DELETE** by rule. `ActivityLogger` catches
the throw and degrades to a null subject (`:249-259`), so the line is kept — but
it no longer says *what* was deleted, which is most of what the row is for.

`CLAUDE.md` states the rule directly: "Anything bindable in an admin route
belongs in this list." `BlogCategory` and `Gallery` are recent; `Coupon` has
been missing since the store shipped.

### 7. The whole store, and every blog category, is absent from `sitemap.xml`

Measured: 78 URLs, **zero** matching `/store` and **zero** matching
`/blog/category`.

Four public, indexable, un-`noindex`ed route families are unlisted:
`/store`, `/store/products/[slug]`, `/store/categories/[slug]` and
`/blog/category/[slug]`. `app/sitemap.ts` contains no reference to the store at
all.

For a shop, that is the catalogue Google cannot enumerate.

### 8. One remote image goes through the optimiser, and production has no host for it

`next.config.ts` allows exactly one remote pattern —
`http://localhost:8000/storage/**` — with the comment "Add the production API
host before launch."

Fifteen of the sixteen `<Image>` call sites carrying an API-served src pass
`unoptimized`, which bypasses `remotePatterns` entirely. One does not:
`components/chat/chat-product-card.tsx:64`. In production that request becomes
`/_next/image?url=https://api.technoware.in/...` and is refused.

Two fixes, and both are wanted: add the production host, and make that call site
consistent with the other fifteen.

---

## Low

### 9. The mock API has drifted, and `/blog` is dead against it

`/blog/taxonomy` and `/blog/featured` do not exist in `mock-api.mjs`; both 404.
Because the page fetches them inside one `Promise.all`, the whole route fails.
Driven through the documented workflow:

```
/blog                      HTTP 200 | "We could not load the blog" | 0 posts
/blog/category/networking  HTTP 404
```

`CLAUDE.md` is explicit: "If you change an API response shape, change the mock
too." Anyone picking up frontend work without Laravel finds the blog broken.

### 10. `upgrade-insecure-requests` is inert, and there is no HSTS

Chrome says so itself, on every page load:

> The Content Security Policy directive 'upgrade-insecure-requests' is ignored
> when delivered in a report-only policy.

It sits in the Report-Only policy (`next.config.ts:145`) where it has no effect.
Separately, no `Strict-Transport-Security` header is sent at all — the other
four security headers are present at `:232-235`.

### 11. Store products are invisible to site-wide search

`SearchController` covers nine groups — solutions, services, industries, product
categories, knowledge base, blog, case studies, pages, catalogue products — and
**not `store_products`**, which is a separate table by design. Someone searching
the header for something the shop sells finds nothing.

### 12. A factually wrong comment in `Cart.php`

`api/app/Models/Cart.php:35` — "`Str::random` is not that [a cryptographic
source] — it is fine for a filename and wrong for anything that addresses
somebody's data."

It is. `vendor/laravel/framework/src/Illuminate/Support/Str.php:1118` uses
`random_bytes`. **The code is correct** (`bin2hex(random_bytes(32))` is the right
call); only the stated reason is false.

### 13. `API.md` has drifted, including on password reset

Its own preamble says "a reference that has silently drifted is worse than
none." Absent from it entirely:

- the five `/admin/blog-categories` routes
- `GET /blog/taxonomy`, `GET /blog/featured`
- **five password-reset endpoints** — `auth/forgot-password`,
  `auth/reset-password`, `admin/auth/forgot-password`, `admin/auth/reset-password`,
  `admin/auth/password`. The feature is built and shipped (`PROGRESS.md`), and
  it is the area where a shared-token bug once produced privilege escalation, so
  it is the worst one to have undocumented.
- `campaigns/{id}/cancel`, `campaigns/{id}/duplicate`, `groups/{id}/members`,
  `imports/{id}/rows`

Also stale, in `API.md` and `CLAUDE.md`:

- "Eleven of the fourteen are queued" — it is now **17 of 20**, with the same
  three deliberately synchronous.
- `npm run audit:mobile` is described as "53 routes"; it now walks **77**.
- `npm run audit` is described as "80 routes"; it now walks **115**.

None of these is a bug. They are the numbers somebody quotes when deciding
whether a run covered enough, which is when being wrong costs something.

### 14. The contrast audit cannot see a gradient — it measures the wrong ground

This is the most consequential tooling finding, because it runs in both
directions.

`audit.mjs:184` walks ancestors reading **`backgroundColor` only**, falling back
to `document.body` at `:193`. `backgroundImage` is never consulted. An element
whose ground is a `linear-gradient` has `background-color: rgba(0,0,0,0)`, so
the walk passes straight through it and measures against the page.

The light run reported two failures, both "Watch on YouTube" at **1.09:1**. They
are false. Sampling the pixels actually painted behind that label:

| | audit says | really paints |
|---|---|---|
| light | 1.09:1 | **14.76:1** |
| dark | (passed) | **15.23:1** |

The parent's computed background is
`linear-gradient(135deg in oklab, rgb(19,18,17), rgb(52,36,16))` — a dark
gradient the audit is blind to, so in light it compared near-white text against
the white page.

**Eleven components paint text over a gradient**: `cta-band`, `page-hero`,
`auth-layout`, `hero`, `sections`, `slider`, `case-studies/page`, and four blog
components. Every one is measured against the wrong ground today. They pass
only because the page behind them usually happens to be dark too.

The dangerous direction is the other one: a light gradient over a dark page
would hide a **real** failure, and nothing would report it — the same family as
the "text over an unknown photograph" problem the gallery already documents.

### 15. Gaps in the definition of done itself

- **`/blog/category/[slug]` and `/admin/blog-categories` are audited by
  nothing** — neither the route list nor `DISCOVER` nor the mobile audit.
- **`/checkout` was skipped in both full runs** ("the basket would not fill"),
  so the most important form on the site is currently audited by nothing.
  Chased down: **not a product bug** — see Corrections. It reproduces every time
  under audit load and never in isolation.
- **Neither audit listens for JavaScript errors.** `audit.mjs` listens for
  `securitypolicyviolation` but never `pageerror` or `console.error`, so a
  hydration mismatch or duplicate React key is invisible to the gate — the class
  of bug that produced the `Breadcrumbs` double-`Home`, and the reason
  `suppressHydrationWarning` is documented as load-bearing.

  A sweep added for this audit found **21 of 22 public routes clean**. The one
  exception is `/this-page-does-not-exist`, which logs a React warning:
  "Encountered a script tag while rendering React component" — the root layout's
  JSON-LD block, inert when the 404 renders client-side. Cosmetic, but it is
  console noise on a route people land on.

---

## Missing features

Nothing in the brief is outstanding. What is absent is absent by decision,
except where marked:

| | |
|---|---|
| **Blog comments** | deferred by you; to be planned separately, with a honeypot rather than reCAPTCHA |
| **RSS / Atom feed** | genuinely missing — a blog with no feed, and nothing in the repo for one |
| **Store in search and sitemap** | findings 7 and 11 |
| **Cart prune** | `PROGRESS.md:694`, plus finding 5 |
| Cashfree / Paytm gateways | declared, unbuilt, and correctly signposted with a reason in the UI |
| SMS sign-in | same — needs a gateway, a DLT template and a phone column |
| Amazon SES | one `composer require` away; the option is disabled with the command shown |
| Error tracking | `TODO(phase 6)` in both `error.tsx` files |
| Refunds via the gateway | `PROGRESS.md:691`; done in Razorpay's dashboard, outside the brief |
| Bounce webhooks | `PROGRESS.md:702`; the one gap that degrades sending reputation on its own |

---

## Still blocking launch — content, not code

Unchanged from `CLAUDE.md`'s list, verified live in the database tonight:

- **The invented Mumbai address is still live** — `address` reads "Unit 4,
  Lakeview Industrial Estate, Andheri East", with `map_embed_url` and `map_link`
  pointing at the same invented place. This is also the newsletter's **legal
  postal address**, so it is a compliance item, not a cosmetic one.
- **Three live social URLs**: `linkedin.com/company/technoware`,
  `x.com/technoware`, `wa.me/919876543210` — outbound links to accounts that are
  probably somebody else's.
- **Two blog covers point at files that do not exist** — posts #1 and #2
  (*Firewall rules that quietly stop working*, *Sizing a UPS for a small server
  room*). Every other cover, hero and brand logo in the database resolves.
- **The only store product is "Audit probe switch"** — a test artefact, and the
  entire shop catalogue.
- `/privacy` and `/terms` remain placeholder copy reading as real policy.

Resolved since the list was written: the phone number is now a real one
(+91 9831100758), not the +91 98765 43210 placeholder.

---

## Corrections to my own reasoning

Recorded because a wrong prediction that is quietly dropped is worse than one
that is written down.

1. **I predicted the mock drift would fail `npm run build`.** It does not. The
   build passed. `/blog` reads `searchParams`, so it is a dynamic route and
   `isPrerendering` is false — the rethrow never fires. The drift is a runtime
   defect for developers, not a build gate.

2. **I first concluded `/checkout` was skipped because PREPARE cannot choose a
   variation.** Wrong. `add-to-basket.tsx:34-50` pre-selects the first in-stock
   variation and submits it as a hidden input; driven in isolation the add
   succeeds, the cookie is set and the basket fills — twice, with and without a
   hydration wait. The skip is a **timing flake** under the load the audit
   itself puts on single-threaded `php artisan serve`: PREPARE waits a fixed
   1500 ms for a Server Action round trip. The harness is honest about it — it
   skips loudly rather than reporting `ok` on a page it never saw — but the
   effect is that the most important form on the site goes unaudited whenever
   the machine is busy.

3. **`TONE_BAR.urgent = "bg-err"` is not the documented `bg-err-fill` bug.**
   Those are chart bars behind no text, answering to WCAG 1.4.11's 3:1 against
   their track. The docblock says so; I checked before reporting it.

4. **The light run's two "failures" are mine and they are not real.** The
   YouTube facade is my own code from this session, so the temptation was to
   accept the audit and "fix" it. Sampling the painted pixels instead showed
   14.76:1 — and turned a false alarm into finding 14, which is worth more than
   the fix would have been.

5. **A `<td>`/`data-label` count mismatch on two admin tables was my grep, not
   the code.** Both screens label every cell; the extra hit was the word
   `data-label` inside a comment. All fifteen list screens are correctly
   labelled.

---

## What is verifiably healthy

Worth stating, because a list of only defects misrepresents the codebase.

- **728 tests, 5,658 assertions, one deliberate skip.** `pint`, `tsc`, `eslint`
  and the production build all clean.
- **Dark audit: 115 routes, 2 real failures** — findings 3 and 4 above.
- **Light audit: 115 routes, 2 reported failures, both false** — the YouTube
  facade, which really paints at 14.76:1 (finding 14). So the light palette is
  effectively clean.
- **Mobile audit: all 77 routes clean** at 320, 360, 390 and 414px — public
  site, portal and the whole console. Not one overflow, undersized target or
  sub-12px string.
- **No route shadowing.** Every literal segment is declared above the
  parameterised route that would swallow it.
- **The settings surface is airtight.** Every one of the 65 keys PHP reads is
  seeded; nothing the frontend reads sits outside the public whitelist; no
  private group leaks.
- **The admin sidebar and the screens agree in both directions** — every screen
  has an entry, every entry has a screen, and `AdminNavRolesTest` holds the
  roles against the real middleware.
- **158 of 163 admin endpoints have a caller.** The five that appeared not to
  are all reached another way — a query string, an `<a download>`, or a Next
  route handler.
- **The scheduler is complete**: four prunes, the queue worker, the heartbeat,
  the campaign sender and the customer-group sync.
- **Notification queueing is exactly as documented** — 17 queued, and the same
  three (sign-in code, password reset, address verification) deliberately
  synchronous, each saying why in its own file.
- **The blog sidebar's contrast arithmetic checks out.** Every one of the six
  social colours it claims a ratio for measures what the comment says, and the
  three it records rejecting do fail.

---

## Suggested order

1. Ticket attachments and the media Download button (1, 2) — both are features
   that do not work, and the fix pattern already exists six times in the repo.
2. The five `bg-ink text-white` sites and the editor's link colour (3, 4).
3. The store and blog categories into the sitemap; store products into search
   (7, 11).
4. Throttle `GET /cart`, write the prune, correct the comment (5).
5. **Teach the audit to composite a gradient** (14). It is a handful of lines,
   it removes two standing false failures, and until it is done the gate is
   blind on eleven components — including every hero band and CTA on the site.
6. The morph map, the production image host, the mock, `API.md` (6, 8, 9, 13).
7. HSTS and promoting `upgrade-insecure-requests` out of Report-Only (10).
8. Then the launch content — the Mumbai address first, because it is the one
   with a legal edge to it.

---

## Instrumentation left behind

Five probes under `web/scripts/`, because a finding you cannot re-measure is one
somebody has to take on trust. None touches application code, and all are
**untracked** — `.gitignore:33` already ignores `probe-*.mjs`, so this repo
evidently treats them as scratch instrumentation. They are on disk, not in the
commit.

| | |
|---|---|
| `probe-invisible-states.mjs` | contrast on the banner, the skip link and other states a route walk never reaches — finding 3 |
| `probe-console-errors.mjs` | sweeps public routes for `pageerror` / `console.error` — finding 15 |
| `probe-authorised-downloads.mjs` | signs in and follows a download link as a click would — findings 1 and 2 |
| `probe-youtube-facade.mjs` | samples painted pixels behind text on a gradient — finding 14 |
| `probe-checkout-prepare.mjs` | reproduces the `/checkout` PREPARE step, one stage at a time |

The first two are close to being worth folding into `npm run audit` outright,
which would mean promoting them out of the ignore rule.
