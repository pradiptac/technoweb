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

## 0.24.0 — 2026-09-11

Four icons from a fifth pack, and the measurement that says why only four.

**Added**

- **`ram`, `password`, `bluetooth` and `legal`** joined `iconMap`, vendored from
  [Reicon](https://reicon.dev) (MIT © REICON) by `web/scripts/build-reicon.mjs`.
  Each is a subject the other 127 keys could not express: memory beside `cpu`
  and `disk`, a credential beside `lock` and `access-card`, the fourth radio
  beside `wifi`, `signal` and `sim`, and a sector `compliance` names a rule for
  rather than names. An editor sees four more choices; nothing else changes.

**Measured**

- **Reicon's "Outline" weight is 45% stroked.** Sampled across 40 icons: 18
  stroked, 22 filled outlines with no stroke at all. `base` sets `fill: none`,
  so a filled one renders as **nothing** — and the filled ones concentrate in
  the topical categories, which is why a curated 53 drawn from Devices, IT,
  Security and Building survived the geometry check at six, and why the four
  that ship come from `General`.
- **Those six were redundant regardless**, which is the more useful half:
  `computer` is `desktop`, `nodes` is `network`, `award` and `award-certificate`
  are both `cert`, and `battery` **is already a key** — registering it would
  have silently replaced the glyph every record pointing at `battery` renders.
  Passing a geometry check is not the same as being a subject that is missing.
- **`lab` was refused by rendering it.** `Microscope` passes every check the
  generator makes and reads as a *telescope* at the 20px a list row uses; every
  alternative Reicon holds — `Flask`, `TestTube`, `Atom`, `Dna` — is a filled
  outline. The key is not registered rather than registered badly.

**Fixed**

- **The generator would have shipped a React console error.** It stripped four
  named `stroke-*` attributes and `Bluetooth3` and `Courthouse` carry a fifth,
  `stroke-miterlimit`, which reached the output kebab-cased. React logs
  *"Invalid DOM property"* for that, and `npm run audit` fails on any console
  error on any route. It now strips `stroke-*` as a pattern and **throws on any
  remaining kebab-cased attribute**, because the list was the thing that was
  wrong.

**Changed**

- **`base` and `P` moved to `web/src/components/icon-base.ts`**, re-exported
  from `icons.tsx` so nothing else changes. Reicon is the first pack vendored
  into a file of its own, and a generated file importing `base` from `icons.tsx`
  while `icons.tsx` imports its map back is a circular import in the module 109
  components depend on.

---

## 0.23.0 — 2026-09-11

All twenty-three system emails are editable, not four.

**Added**

- **Every message the system sends** now appears at
  `/admin/settings/email-templates` and can be rewritten: ticket receipts and
  replies, the four order emails, activation instructions, account approval and
  rejection, registration notices, the address confirmation, the password reset,
  the sign-in code, website enquiries, editor-built form submissions, job
  applications and their acknowledgement, blog comments awaiting moderation, and
  both website-assistant alerts.
- **Twenty-three entries for twenty-two classes.** `TicketReplied` is two
  messages — its customer and desk versions differ in greeting, action label
  *and* recipient, so one template would have to lie about one of them.
- **A message with a variable number of lines is expressed as one placeholder**
  the application builds — an order's items, a form's answers, whichever contact
  details a visitor actually gave. A subject-and-body template cannot hold a
  loop, so the loop's output becomes `{{items}}`, `{{answers}}`, `{{details}}`,
  and those alone are inserted unescaped.
- **Two tests that guard the seam nothing else can see.** A name a notification
  supplies that its catalogue entry does not offer — or copy using a name
  nothing supplies — costs a word in an email and never throws. It never falls
  back either: the sentence simply comes out short.

**Worth knowing**

- The built-in wording still ships with every message and is still what goes out
  until somebody changes it. Nothing here has to be written.
- `LeadMailLines` gained an HTML sibling rather than a second resolution of
  "where did this enquiry come from" — the class exists because that question
  had already been answered separately once.

---

## 0.22.0 — 2026-09-11

A screen for the wording of every email the system sends.

**Added**

- **`/admin/settings/email-templates`**, beside Outgoing mail and behind the
  same administrator role — the transport is where mail *works*, this is where
  it *reads*, and the two are worked in one sitting. Each message lists what it
  is for and whether anybody has rewritten it.
- **An editor per message**: the subject, the body in the rich-text editor, an
  optional plain-text version, a **palette of the placeholders that message
  offers** as click-to-copy chips, and a live preview rendered by the same
  method a real send uses — so it is the email, not an approximation.
- **A test send**, to yourself or an address you name, using **sample values**
  so no customer's details leave the building.
- **Reset to the built-in message**, and a softer switch beside it that puts
  the built-in back *without* discarding what you wrote.

**Worth knowing**

- **Nothing has to be written.** Every message ships with its own wording, and
  that is still what goes out until somebody changes it. A template that is
  missing, switched off, blank, or that fails to render falls back to it — a
  receipt is never lost because a placeholder was mistyped.
- **A placeholder the message does not offer is a warning, not a refusal.**
  Refusing would throw away a screenful of typing over one typo; the names are
  listed instead, where the typo was made rather than in somebody's inbox.
- **The plain-text half keeps its paragraphs and its links.** `strip_tags`
  discards every URL, which is the one thing a reader opens the text part for.

**Fixed**

- The editor screen answered **500** on first load: Summernote and jQuery touch
  `document` when their modules evaluate, so the rich-text editor has to be
  imported with `ssr: false` — which `editor-field.tsx` already records, and
  which the error message ("self is not defined", from inside a bundler chunk)
  says nothing about.

---

## 0.21.0 — 2026-09-11

Every email the system sends is branded, and none of them was before.

**Added**

- **A published mail theme.** All 22 transactional notifications — ticket
  receipts, order confirmations, sign-in codes, registration approvals, desk
  alerts — went out in Laravel's stock purple-button theme, with a logo hosted
  on laravel.com in the header and "© 2026 Laravel" in the footer. They now
  carry the site's own mark, the brand palette and the company's postal
  address, with **no changes to any notification class**: every one of them
  renders through `mail::message`, so branding the theme brands all of them.
- **`App\Support\Mail\Shell`**, which delegates to `Newsletter\Branding`
  rather than reading the settings a second time. A receipt and a campaign now
  resolve the same company name, logo and address — they had no relationship at
  all before, which is why the two looked like different businesses.

**Fixed**

- **A replaced logo could be served stale in an email for ever.**
  `Branding::logoUrl()` versions the URL on the media row's `updated_at`, the
  rule `BrandResource` already followed: a logo is a stored path edited in
  place, and unlike a browser a mail client has no reload to press. The
  newsletter gets this at the same time.

**Worth knowing**

- **The transactional footer carries no unsubscribe line, and must not.**
  `EmailRenderer::footer()` hard-codes one because a campaign is obliged to —
  and nobody can opt out of being told their order has shipped. That is the
  whole reason this is a published theme rather than a reuse of that block, and
  a test asserts it in both directions.
- **The theme CSS holds literal hexes**, which is the one place in this project
  that is correct: it is inlined into an email, and no mail client resolves a
  custom property. They are the same values `EmailRenderer` writes.

---

## 0.20.0 — 2026-09-11

The website assistant, the blog rebuilt, menus that nest, and the shop's own
front. **Eighty-six commits went by without a bump**; this entry covers all of
them rather than inventing a number for each after the fact — the call the
0.15.0 entry already made, on a larger scale and for the same reason.

**Added — the website assistant**

- **A chatbot on the public site**, switched off by default because it spends
  money on every message. It answers only from what the site actually says:
  nothing retrieved means the model is never called, which is how the module
  avoids inventing rather than being asked not to.
- **It asks who it is talking to first** — name, email, telephone, company, one
  question at a time — and files the result as an ordinary `Lead` beside every
  other enquiry. A state machine rather than a prompt, so the questions are a
  setting and the answers are validated in PHP.
- **Products and brands in the conversation**, with the price and stock read
  live from the shop rather than from a cache.
- **`/admin/chat`** — the month at a glance, every transcript, and the screen
  that matters most: the questions the site could not answer, grouped by the
  question rather than listed by the message.
- **A WhatsApp hand-off** on an answer the site cannot ground, carrying the
  question so nobody has to type it twice.
- **A daily reply cap**, because a rate limit bounds one visitor and only a
  total bounds a bad afternoon.

**Added — content**

- **Blog categories, a rebuilt index, a rebuilt post page** and a screen to
  manage them; the blog reached the footer, where somebody can find it.
- **Blog comments**, shipped switched off. Everything arrives pending — nothing
  is auto-approved and nothing is auto-filed as spam, because auto-filing
  eventually hides a real reader and the failure is silent.
- **Menus nest three levels**, both bars gained a location, and every location
  gained a Rebuild button that writes the navigation the site already renders.
- **Section banners** behind every first- and second-level page heading, forced
  dark so the contrast is arithmetic rather than a hope about somebody's upload.
- **Popups** — a picture over a page with a link on it, targeted by section.

**Added — the shop**

- **A stock ledger**, because half of "what came in and what went out" was
  recorded nowhere: a level going from 4 to 40 was indistinguishable from one
  that was always 40.
- **Overselling as a switch on the shelf**, on the product *and* on each
  variation, so "the 24-port is back-ordered and the 48-port is not" is sayable.
- **The PIN code is asked for first** and fills the three fields under it —
  an Indian PIN code is administered top-down, and the table is vendored rather
  than fetched from a package that maps Jamia Nagar to Budaun.
- **The store front, the product page and the contact page rebuilt.**

**Added — elsewhere**

- **An optional AI SEO assistant** that suggests and never writes. Applying a
  suggestion sets a form field; the record changes when somebody presses Save.
- **Bounce webhooks** for Mailgun and Brevo, failing closed — a forged call
  here *suppresses* addresses, which nobody would notice until a send reported
  an audience of nothing.
- **Client-side JavaScript errors reach somebody**, grouped by fingerprint.
- **Twenty-eight icons** from Tabler, Heroicons, Flowbite and TailGrids, and
  the two packs that had to be refused on licence rather than on drawing.
- **Ten more themes**, and real manufacturer logos for twenty-six brands.

**Fixed**

- **Every form gave up what was typed the moment it was refused.** React 19
  resets a form after a function action completes, including a rejected one —
  so the form whose entire job was to name the wrong field came back blank.
  This file previously asserted the opposite.
- **The chatbot never knew who it was talking to**, and the test proved it did:
  `actingAs()` stages the authentication by hand, so it tested the controller
  rather than the wiring. `$request->user()` on a public route is always null.
- **Assigning a menu stripped every icon and summary from the mega panel** —
  two of the three things it draws, on every page of the site.
- **Two admin downloads answered 500**, because a navigation carries no bearer
  token and Laravel redirects to a `login` route an API has never defined.
- **The contrast gate was blind to gradients**, grading text against the page
  behind a translucent stop — a caption reported at 1.04:1 that paints fine,
  and as easily a real failure hidden the other way.
- **The assistant accepted a question as somebody's name**, an incomplete
  address as an email and a repeated digit as a telephone number.
- **A popup's close button was a false contrast *pass*** — `bg-dark/70`
  composites to `#606060`, white on that is 4.05:1, and a Tailwind v4 opacity
  modifier resolves through `color-mix` so the audit's parser read the `oklab`
  lightness channel as an RGB byte.
- **A published popup made `/checkout` unauditable**: an open modal `<dialog>`
  obscures the page by design, so the add-to-basket click timed out and the
  most important form on the site was silently skipped.
- **Vacancies and store records ignored their own `sitemap_include` flag**,
  under a comment explaining why they had none.
- **Saving a menu invalidated the site settings** and left the menu cached for
  the full ten minutes, so an editor saved, looked at the site, and saw the old
  navigation.
- The theme picker showed the wrong selection after a save; the logo marquee
  snapped 20px once a loop; a slider fade opened on a flash of the page.

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
