# Version history

The number the console displays, beside its wordmark, and what changed to earn
it.

**`web/src/lib/version.ts` is the source of truth.** Bump `APP_VERSION` there
and add the entry here in the same commit — a version number with no changelog
line tells someone the build changed without telling them what changed, which
is the one question the number exists to answer.

What the parts mean, for an application rather than a library:

| | |
|---|---|
| **major** | a release the client has signed off, or a change that breaks stored data |
| **minor** | something an editor or a visitor would notice |
| **patch** | a fix or an internal change nobody has to be told about |

Entries are newest first. Dates are the day the work landed on
`phase-3-admin-cms`.

---

## 0.19.0 — 2026-09-02

A lead pipeline. Every contact form in the product lands in one place somebody
can work, each lead says which page it came from, and the emails still go out.

**Added**

- **`/admin/leads`** — the queue, behind a new `role:sales_manager`. Filter by
  status, score band, owner, source page, "still open" and "past its follow-up
  date"; sort by score or follow-up; export the rows on screen as a CSV.
- **A lead per submission**, from the enquiry form *and* from every form built
  in the console, through one `LeadIntake`. `leads` is its own table rather
  than columns on `enquiries`: an editor-built form need not collect an email
  address at all, and `enquiries.email` is `NOT NULL`. A lead snapshots the
  contact and points back at the submission — the split an order item already
  makes against a product.
- **Which page the form was on.** `source_url`, `source_path`, `source_title`,
  the referrer and three UTM parameters, captured **in the browser** and posted
  with the submission — they cannot be read from the request, because every
  form here submits through a Server Action and `Referer` on the API side is
  the Next server. A "where leads come from" panel ranks the pages.
- **A transparent score.** Eight checks — business email domain, buying intent,
  phone, company, a substantial message, a specific source page, not a link
  dump, and having been in touch before — scored out of what *applies*, the
  shape `SeoScore` uses. Every reason is stored beside the number and shown on
  the lead, because a figure without its working is one nobody trusts. Nothing
  is filed as spam automatically.
- **A pipeline and a trail.** New / Contacted / Qualified / Won / Lost / Spam,
  with an owner, a follow-up date and an estimated value. Status changes and
  notes share one chronology. `spam` and `won` are both reversible.
- **Everything else that address has sent**, listed on the lead. Nothing is
  merged: the second message is routinely the one that says what they actually
  want.

**Changed**

- **Both form notifications name the source page and link to the lead.** The
  email is unchanged in every other respect and still goes to `sales_email`,
  or to the form's own `notify_email`.
- **Existing enquiries and form submissions were backfilled** as leads, scored
  `unscored` rather than zero — they were never measured, which is a different
  claim from having measured nothing.

**Fixed**

- **Every product and service enquiry was labelled "Enquiry form".**
  `enquiries.source` carries `product:<slug>`, not `product`, so matching the
  whole value never fired. It survived because the contact page passes a bare
  `contact` — the one call site that got exercised was the one case that
  worked. Found by submitting through the real form.

## 0.18.0 — 2026-09-02

Galleries: a picture set with tabs and a lightbox, embeddable by shortcode.

**Added**

- **Galleries.** A new CMS entity at `/admin/galleries` — a named set of
  pictures, each with a title, a subtitle and its own alt text, optionally
  filed into tabs. `[gallery slug="our-work"]` drops one into any page, post,
  article or case-study body, the way `[slider]` and `[form]` already do.
- **A lightbox with both slideshow modes.** Clicking a picture opens it in a
  real `<dialog>`: arrows, arrow keys, a counter, Escape to close, and a
  play/pause control. Autoplay is a per-gallery setting and never starts under
  `prefers-reduced-motion`; pressing Next or an arrow key stops it, because
  once somebody is driving an automatic advance takes the picture away from
  them.
- **Tabs are a table, not a string column.** `gallery_groups` belongs to one
  gallery, so renaming "Networking" is one edit rather than one per picture,
  and the order of the strip is a decision somebody takes. Deleting a tab keeps
  the pictures and returns them to "All".
- **A `/gallery` page**, linked from the footer's Company column, whose body is
  one shortcode.

- **A transition per gallery** — fade (the default), slide, zoom or none —
  owned by `App\Enums\GalleryTransition` and sent to the console rather than
  listed in TypeScript. Slide knows which way it is going; every one of them is
  off under `prefers-reduced-motion`.

**Changed**

- **One image preview everywhere.** `CoverField` now shows the whole file,
  contained at 200px and centred — what Settings already did — with the picture
  and the controls for choosing one **side by side**. The cropped full-width
  strip and the `fit` prop are gone.

**Fixed**

- **Image previews were missing from every picker built on a repeater.**
  `CoverField` renders from a URL and the slide and gallery rows kept only the
  path, so a slider with three slides showed three "no image chosen" strips.
  The slider had shipped that way.
- **Every CMS page rendered "Home" twice in its breadcrumb.** `Breadcrumbs`
  already prepends it and `[slug]/page.tsx` passed it again, which also
  collided `key={c.path}` on `"/"` — a React duplicate-key error on
  `/privacy`, `/terms`, `/downloads` and every page an editor adds — and put
  Home into the `BreadcrumbList` structured data twice, which is what Google
  reads.

---

## 0.17.0 — 2026-08-31

Paying without a gateway, and a choice about how people sign in.

**Added**

- **Cash on delivery, bank transfer and UPI**, alongside the card gateway. Each
  is a switch plus the detail it cannot work without — a bank transfer with no
  account number is instructions nobody can follow, so it is not offered until
  there is one.
- **Recording a payment from the order's own screen**: an amount, a reference
  and the name of whoever confirmed it. It is the only way an order becomes paid
  without a signed callback, and it refuses a gateway order outright.
- **A cash-on-delivery ceiling**, because COD is unsecured credit and a refused
  parcel costs the shop both ways.
- **Payment instructions on the order page** — account details, UPI ID and QR
  code — for the method that order actually used, and never on the checkout.
- **`default_login_method`**, so an install can open its sign-in forms on a
  password or on a code. The other route stays one link away, and a default
  whose route has been switched off falls back rather than opening on a step
  that cannot work.
- **The campaign editor's form and preview now split 50/50.**

**Changed — the interface**

- **An animated underline under every top-level navigation item**, in the theme
  colour, growing from the left on hover and on keyboard focus. It transitions
  `scale` rather than `transform`, which is the Tailwind v4 trap that would
  otherwise have made it appear instead of animate.
- **Icon tiles lost their tinted fill sitewide** — ten of them — and their
  glyphs grew to about 60% of the box. The border moved to an inverting token at
  the same time: `brand-200` was fine behind a fill and is a bright hairline on a
  near-black card without one.
- **Every uploaded image in Settings is capped at 200px, centred, height auto.**
  They were cropped to a full-width strip, which showed the middle third of a
  600x81 wordmark and would have made a UPI QR code unscannable.

**Changed — the footer**

- **The newsletter signup is a band across the top of the footer**, not a widget
  in the brand column. In the column it had about 270px: the input clipped
  `you@company.com` before anybody typed, the form had to stack, and the brand
  column became a tall stack of separated widgets while a third of the footer's
  width sat empty beneath the short link columns. Across the top it has room for
  a row, and the brand column is an identity block again — logo, tagline,
  address, phone, social row, no rules between them. The footer is 581px tall at
  1440px, down from about 900.

**Changed**

- **Revenue reads `paid_at` rather than the order status.** Until cash on
  delivery the two were the same fact; a COD order is dispatched before any
  money exists, so counting it as revenue on the day it shipped would put a
  figure on the dashboard that no bank statement will ever match.
- **`OrderStatus::Confirmed`**, for a COD order that is to be packed but is not
  paid — previously indistinguishable in the queue from an abandoned basket.

**Fixed**

- **An order paid by bank transfer showed the account details *and* a "Pay"
  button** — two ways to settle one invoice, and an invitation to do both.

---

## 0.16.0 — 2026-08-31

The store's two missing screens, and the activation half of a digital sale.

**Added**

- **A store dashboard** at `/admin/store` — revenue over 7, 30 or 90 days
  against a scaled axis, an attention band of what is waiting on a person, and
  two lists that predict a problem rather than report one: stock running out,
  and digital products running out of codes. Every figure is the same query as
  the list it links to.
- **An out-of-stock alert**, covering both kinds: a published listing with a
  dead Buy button, and a digital product still selling with no codes left —
  which is silent, since nothing on the page says so and it takes the money
  anyway.
- **Sales reports** at `/admin/store/reports` — any range up to a year, grouped
  by day, week or month, with GST read from each order rather than recomputed,
  what sold by product, every order by status, and both halves exportable as
  CSV.
- **Activation procedures.** Rich text plus an optional PDF, written per product
  with a store-wide default in Settings, sent by email the moment a code is
  issued and shown beside the code on the order page. The code itself is still
  never emailed — that rule does not bend because the instructions have arrived.

**Fixed**

- **A paid activation code could not be obtained.** The reveal endpoint shipped,
  the receipt told people to "open your order to reveal it", and there was no
  control on that page to press. The same shape as the newsletter's Groups
  screen being reachable from nowhere.
- **The site header's links painted over each other from 1160px.** The nav can
  shrink and its links cannot wrap, so "Resources" ran 93px into the
  consultation button. No element was ever over the page edge and no box
  overlapped, which is why every overflow check passed. It began when Store was
  added to the navigation.
- **"Out of stock" meant two different things**, so the dashboard's count and
  the products list it links to would have disagreed for any product with
  variations.
- **`diffInDays` returns a float in Carbon 3**, so a report's day count came out
  as 31.999999 — and the same expression guarded the maximum range, which made
  the limit off by a day.
- **A third copy of the order status colour map** was living on the customer's
  order page; there is one now, beside the badge it colours.

---

## 0.15.0 — 2026-08-31

The store, and the campaign work that landed just before it. Eight commits
went by without a bump; this entry covers all of them rather than inventing a
number for each after the fact.

**Added — the store**

- **A shop with its own catalogue.** `store_products` is a separate list from
  the site's product catalogue: what is sold online is maintained apart from
  what is advertised. Physical, digital and service types; variations; its own
  categories, reusing the existing brands.
- **A basket and a single-page checkout.** Guest checkout throughout — a portal
  account is created automatically once payment lands, and it is `active`,
  because having taken somebody's money says more than the approval queue does.
- **Razorpay**, with server-side signature verification, a signed webhook and
  idempotency on the gateway's payment id. Cashfree and Paytm are listed and
  report themselves unbuilt.
- **The order queue in the console** — the status moves the lifecycle permits,
  courier and tracking by hand, the manual GST invoice uploaded to the private
  disk, internal notes, and the trail of who changed what.
- **Activation codes**, encrypted at rest, issued the moment payment lands or by
  hand — decided by a setting. Revealing one is a recorded act, and neither the
  order page nor the admin listing ever prints one.
- **Discount codes**: a percentage or an amount off, with a minimum, a ceiling,
  a window and both kinds of usage limit.
- **Order history in the portal**, with a route into the ticket module for
  anything wrong with an order.
- **Transactional email** for every step: the order before payment, the receipt
  after it, the dispatch notice, and the desk alert that leads with whatever is
  outstanding.
- **`store_manager`**, a role that cannot edit the blog — and a content manager
  who cannot reach the store.

**Added — the console**

- **The sidebar is filtered by the signed-in role**, and each role lands
  somewhere it can actually use. A test compares that navigation against the
  real middleware, because they are two hand-written lists on opposite sides of
  the wire.
- **`campaign_manager`**, and the newsletter routes moved out of
  `content_manager` — where they had sat for months while the comment above
  them said otherwise.
- **A campaign can be deleted**, from its own screen and from any list row that
  carries no figures.
- **The send screen says whether anything will actually deliver it**, naming the
  scheduler or a running worker, and offering the crontab line when neither is.

**Fixed**

- **Every tracking URL in every newsletter was a 404.** The open pixel and the
  rewritten links were built on the frontend's origin while both endpoints live
  on the API — so opens read 0% and a reader clicking anything in a delivered
  campaign landed on a missing page.
- **Creating a campaign from a template threw.** `?:` reads its left operand
  where `??` does not, and a shipped template's footer carries no address.
- **The campaign editor overflowed a phone by 139px** — a media URL in the
  block list is one unbreakable run, and a grid item's automatic minimum size is
  its min-content.
- **A Delete button measured 3.38:1 in dark**, using the fill token where the
  text token was wanted.

---

## 0.14.1 — 2026-08-26

**Fixed**

- **A vacancy with no location emitted no `jobLocation` and no
  `jobLocationType`**, which is a `JobPosting` Google will not index at all.
  A blank location now means remote, said in the admin hint and rendered as
  "Remote" on the page.
- The posted date and the company name were only in the structured data, not
  on the page. Both are now in the facts panel.
- Added `identifier` and `directApply` to the structured data.

---

## 0.14.0 — 2026-08-26

**Added**

- **A careers section.** `/careers` and `/careers/{slug}` on the public site,
  with an application form that takes a CV, and `JobPosting` structured data so
  vacancies reach Google Jobs.
- **Full management in the console**: vacancies with the usual tabbed form,
  editable qualification and experience-level lists, and an applicant pipeline
  with status, staff notes and a CV download.
- **Retention**: applications and their CVs are deleted after 180 days,
  configurable, with a 30-day floor.

---

## 0.13.0 — 2026-08-26

**Added**

- **Five fluorescent themes** in Settings → Appearance: Acid Lime, Electric
  Cyan, Hotwire Magenta, Safety Flare and Ultraviolet. Fifteen themes now, and
  `npm run themes` checks all thirty palettes.

---

## 0.12.0 — 2026-08-26

**Added**

- **An activity log** at `/admin/activity`, administrator-only and read-only.
  Records every deletion, every creation, anything touching accounts or
  settings, and staff sign-in, sign-out and failed sign-in. What counts is
  decided by rules rather than a list of routes, so an endpoint added later is
  covered rather than silently missed.
- **Retention**: 90 days by default, configurable in the private `security`
  settings group, pruned nightly, with a 30-day floor so a typo cannot destroy
  the trail.

**Fixed**

- Eleven models bindable in admin routes were missing from the morph map.
  `enforceMorphMap` throws for an unregistered model, which threw away the
  first deletion the log ever recorded.

---

## 0.11.4 — 2026-08-26

**Added**

- **The colour-scheme control on the sign-in screens.** It was mounted in the
  console header and the site footer only, so the login, registration and
  password-recovery screens painted from the OS but offered no way to change
  it — and a reset-password screen has no door to get through first. It picks
  its area from the path, since `/admin/login` and `/portal/login` share one
  layout and the two preferences are kept apart on purpose.

---

## 0.11.3 — 2026-08-26

**Changed**

- **Dashboard chart bars take the colour of the thing they measure** — the same
  tone the badge uses for that word, so Critical is red in the chart and in the
  list. Category bars, which have no semantics, take a hue derived from their
  own name.

**Fixed**

- `status_breakdown` was keyed by display label rather than status value, so
  the dashboard had a sentence where it needed a status and every status bar
  fell back to grey.

---

## 0.11.2 — 2026-08-26

**Changed**

- **The dashboard tiles are tinted by what they mean** — soft semantic
  backgrounds with their matching text token, the one pairing already proved to
  read in both schemes. Two of them take their colour from their own value, so
  a red panel never reads "0 overdue".

---

## 0.11.1 — 2026-08-26

**Changed**

- **Section spacing on the public site is 18-25% tighter**, and now lives in
  two classes rather than 28 hand-written `py-*` pairs across 21 files. The
  404 and search pages had a third rhythm of their own, which turns out to be
  exactly the new standard, so it folded in.

---

## 0.11.0 — 2026-08-26

**Added**

- **"Show in the main menu"** on solutions, services, industries and product
  categories. The mega menu mapped every record, so it grew without limit;
  publishing a page and pointing the navigation at it are now separate
  decisions. Defaults to on, and a section with nothing ticked drops out of the
  header rather than opening an empty panel.

---

## 0.10.1 — 2026-08-26

**Fixed**

- **Every destructive button was 2.4:1 in dark**, on twelve edit screens.
  `--color-err` was serving as both coloured text and a fill under white text;
  in dark those want opposite values. Split out `--color-err-fill`.
- The audit no longer reports false contrast failures against `next dev`. It
  waits for the network to settle before measuring — a route's CSS arrives as
  chunks load, and reading too early returns the previous stylesheet's answer.

**Changed**

- `npm run audit` covers 80 routes, up from 47. It now discovers record screens
  by opening each index and taking the first row, so every CMS edit form and
  the ticket detail are audited for the first time.

---

## 0.10.0 — 2026-08-26

Customers can register themselves. The support desk gets an approval queue.

**Added**

- **Self-registration** at `/portal/register`, with email confirmation and a
  staff approval step. An account is `pending` until somebody activates it, and
  only an `active` account can sign in.
- **`/admin/customers`** — every portal account, pending ones first and oldest
  first within them, with approve / reject / suspend / reactivate and a
  staff-only note on each decision.
- Five notifications: the confirmation link, the desk's "somebody is waiting",
  the customer's approval and rejection emails, and a warning to the real
  account holder when somebody registers with their address.
- `registration_enabled`, in a new **public** `portal` settings group alongside
  `portal_enabled` — which until now was written by the settings form and read
  by nothing at all.

**Changed**

- `customers.is_active` became `customers.status`
  (`pending`/`active`/`rejected`/`suspended`). Existing accounts migrate to
  `active` with their address treated as confirmed: they were created by staff
  at a terminal, so both were already true.
- `ApiError` carries a `reason`, so the portal can tell "confirm your address"
  from "waiting for approval" without parsing a sentence.
- `settingEnabled()` for reading boolean settings — `"0"` is truthy in
  JavaScript, and a toggle that reads as on when it is off is not a mistake
  worth making twice.

**Fixed**

- **`npm run audit` now covers the admin console by default** when credentials
  are set — 47 routes rather than 23. It could always sign in; the default list
  simply never named the screens behind the login, which is where both of the
  bugs below were hiding.
- **Alerts, badges and error states were unreadable in dark mode.** All three
  paired an inverting `*-soft` background with hexes picked for the light
  palette: 1.53:1, across the whole console and portal. It had survived every
  audit because the contrast check only measures what is on the page, and no
  audited route rendered an alert by default.
- `EnsureUserIsCustomer` read a column that no longer existed, which would have
  403'd every authenticated portal request. Caught by driving it, not reading
  it.

---

## 0.9.1 — 2026-08-26

**Added**

- **Forty-one more icons**, borrowed from Lucide and wearing this project's
  stroke geometry, taking the picker from 47 to 88. `fromLucide` in
  `components/icons.tsx` spreads the shared `base`, so a borrowed icon carries
  the set's 1.7 stroke rather than Lucide's 2 and nothing gives it away.
  Registered under this project's own names, because every key in `iconMap` is
  a value already stored in MySQL.

**Changed**

- The icon picker's tiles are 34px on an `auto-fill` grid rather than six
  aspect-square columns, so the set stays a few rows tall as it grows.

---

## 0.9.0 — 2026-08-26

Feature-complete against the brief. Everything outstanding before 1.0 is
content and configuration rather than code — see "Known risks and
placeholders" in `CLAUDE.md`.

**Added**

- **Forms an editor builds**, placed anywhere by `[form slug="…"]` shortcode,
  with a field builder, stored submissions and email notification. The contact
  page now renders the seeded `contact` form.
- **Sliders**, placed by `[slider slug="…"]`, carrying images, uploaded video
  and YouTube links. The homepage hero uses one, falling back to the NOC panel
  when it has no slides.
- **Ten themes**, chosen in Settings, each a set of token overrides with its
  own colour and type direction. `npm run themes` fails the build on any
  WCAG AA failure across all of them.
- **Light, dark and system colour schemes**, applied before first paint, with
  the choice remembered per browser.
- **Site-wide search** across products, articles, case studies and pages,
  ranking an exact part number first.
- **Alt text as a property of the file**, written once in the media library and
  resolved by path everywhere an image is published.
- **Catalogue filters** — search, brand and sort — on `/products` and every
  category listing, plus a cross-link from a category to the practice areas its
  hardware is deployed in.
- **Two page templates**, `default` and `wide`, allowlisted on write.
- A one-line footer in the console carrying the copyright and the developer
  credit, and this version number beside the wordmark.

**Fixed**

- Notifications block the request, so an unreachable SMTP host held a public
  form POST open for **12.5 seconds**. `config/mail.php` now bounds the
  connection at five seconds. The real fix is a queue worker — a deployment
  change, written up rather than assumed.
- Every generated placeholder image rendered as a black rectangle: a heredoc
  interpolates variables and not class constants, so `{self::BRAND_900}` was
  written into all 33 files verbatim.
- `product_solution` was empty, so "Related hardware" on all nine solution
  pages rendered as nothing at all.
- The catalogue ignored the brand name when searching, so "aruba" returned no
  results in a catalogue containing an Aruba switch.
- The mock API never served `/settings`, so a build against it rendered with no
  company name, no phone number and no theme — silently, because
  `getSiteSettings()` swallows the failure by design.
- The hero headline reached 57.6px at 900px wide while still stacked above the
  carousel, making the hero 1388px tall on a tablet.
- The case-study cover was the one image on the site with no reserved box.
- Instrument Sans shipped a 500 weight used by exactly one element.
- Submissions displayed in payload order rather than the order the form asks
  its questions.

**Changed**

- `middleware.ts` is now `proxy.ts`, following the Next 16 rename. The redirect
  behaviour is unchanged.
- The public site has a 12px type floor; the console keeps its denser scale.
- `bg-white` and the coloured-text role became tokens (`bg-card`,
  `text-brand-ink`) so a scheme can re-value them. A literal cannot be themed.

---

## 0.8.0 — 2026-08-24

The UI audit, worked end to end: 42 findings across the public site and the
console, of which two were disproved rather than fixed.

- Every admin screen's title goes through one `PageHeader`; 46 screens had
  hand-rolled it in five different class combinations.
- Rows-per-page on every admin list, and record counts that survive a single
  page of results.
- The media library gained folders, cropping, drag-and-drop and multi-file
  upload.
- Sign-in gained a reveal toggle, a Caps Lock warning and a "keep me signed in"
  that changes the cookie's lifetime rather than decorating the form.
- The dashboard gained the metrics that had been specified and never built.

---

## 0.7.0 — 2026-08-23

Phase 4, and the last of the console.

- Ticket email notifications, with a send failure that can never fail the
  request and an internal note that can never reach a customer.
- SEO overview, redirects manager, staff accounts, FAQs and the media library.
- Cookie consent that genuinely gates the analytics tags.
- Stored XSS fixed in the JSON-LD output: `JSON.stringify` does not escape `<`.

---

## 0.6.0 — 2026-08-22

Phase 3 — the admin console. Staff authentication as a separate principal from
the customer portal, the ticket queue, and CRUD for ten content entities with
rich text sanitised on write.

---

## 0.5.0 — 2026-08-20

Phase 2 — the inner marketing pages: solutions, services, industries, the
product catalogue, resources, blog, case studies, knowledge base and about.

---

## 0.4.0 — 2026-08-18

Phase 1 — the foundation. Design tokens, the homepage, the customer portal, the
support-ticket domain, role-based access control and the SEO layer.
