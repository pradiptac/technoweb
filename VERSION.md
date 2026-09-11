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

## 0.32.0 — 2026-09-12

Appearance rebuilt: six presets, your own colours, a choice of fonts, and a
dark mode derived from the palette instead of painted olive for everyone.

**What was measured first**

- Dark mode was **olive whatever the theme**: `darkScheme()` fixed every
  neutral and the `brand-50/100` washes to olive-tinted greys for all 25
  themes, so a blue theme's dark mode had green-grey tints under blue
  buttons. The twelve icon hues were tuned against olive surfaces only. No
  custom colour, no font choice; the picker copy said "ten", `CLAUDE.md`
  said fifteen, there were twenty-five.

**Added**

- **`lib/palette.ts`** — a palette generator in OKLCH. Five colours in
  (primary, secondary, accent, background, text), every token out: the brand
  ramp, two companion ramps, the neutrals in both schemes, the twelve
  identity hues. Each step sits at a fixed lightness and **the steps that
  carry text are pushed until they pass 4.5:1**, so a typed `#ffff00` gives
  `#626200` buttons rather than yellow under white. The typed hex is hue
  intent, and the picker shows an "adjusted to" swatch beside a colour it
  moved.
- **Six presets** — Technoware (the house olive, its hand-tuned ramp kept so
  the default install is pixel-identical), Ocean, Forest, Sunset, Slate,
  Rose — each a saved set of inputs through the same generator. The 25
  existing themes stay under "More presets".
- **Custom colours** — five fields, each a native colour picker beside a hex
  box; choosing a preset copies its colours in as a starting point.
- **Headline and body font** from the nine vendored faces, applied to every
  theme. Instrument Sans is display-only (it ships as 600/700 alone).
- **A live preview in both schemes** that renders real components inside a
  wrapper carrying the generated variables — the same mechanism the root
  layout uses for the site.
- **Secondary and Accent ramps** on every theme, with a defined starting set
  of consumers: eyebrows, outlined-button hover, prose link hover and the
  sign-in gradient (Secondary); the Featured badge, the New ribbon, the CTA
  and promo bands (Accent).
- The browser tab's colour and the share-image card now take the theme
  instead of a hard-coded olive.

**Changed**

- **Dark neutrals derive from the theme's own hue** at near-zero chroma;
  the dark `300`/`400` tints get more chroma than their light counterparts
  (lit rather than chalky on near-black). Applied to all 25 legacy themes in
  one change. `200` is deliberately left light — it is the page-hero kicker
  over the dark banner, and inverting it measured 1.7:1 on the first dark
  audit.
- Identity hues are re-tuned per palette against its own `surface-2`.
- `npm run themes` now checks **90 palettes**: 6 presets, 25 legacy and 14
  hostile inputs (pure red, pure yellow, neon green, near-white, near-black,
  flat grey, six hues, a dark base typed into the light scheme, a pale text)
  in both schemes, plus the companion ramps and every neon hue. The four
  contrast scripts share one implementation of the maths.

**Verified**: 90/90 on the gate; `AppearanceSettingsTest` (7); the full
suite; `pint`, `tsc`, `eslint`; light, dark and mobile audits on the site,
the store, a product page, the console and the settings screen; and
`scripts/_appearance-probe.mjs` through the real console — Ocean's blue
buttons and blue-grey dark page on the live site, a yellow-on-black custom
palette whose buttons still pass under white text, a font change reaching
the `h1`, and a legacy theme's dark mode no longer olive.

---

## 0.31.0 — 2026-09-12

The order-placed email is a sales order, and it reads the way the customer
chose to pay.

**Fixed — one email, written for card payments, sent to everybody**

- `OrderPlaced` said *"nothing has been charged"* and offered a **Pay for this
  order** button to every order. Right for a card somebody abandoned; wrong
  for the customer who had just chosen cash on delivery — whose order was
  already `Confirmed` — and useless to a bank-transfer or UPI customer, who
  got no account number, UPI ID or QR code by email at all. Those existed
  only on the order page. And nobody got an itemised confirmation until the
  receipt, which for cash on delivery is after delivery.

**Now**

- **Every line item**, with quantity and price, on the first email for every
  order — the same list the receipt carries, from one helper
  (`App\Support\Store\OrderMail`), so the two cannot list an order two ways.
- **The subject and closing block follow the method**: *payment not yet made*
  and a Pay link for the gateway; *confirmed, pay on delivery* and "pay the
  courier" for cash on delivery; *awaiting your transfer* with the bank
  details and a "quote the order number" line; *awaiting your UPI payment*
  with the UPI ID and a link to the QR code.
- **The email says what the order page says**, because both read
  `PaymentOptions::forOrder()`. A test renders both from one order and
  asserts the sentences match.
- The `order_placed` template gains `{{items}}`, `{{payment}}`,
  `{{payment_method}}` and `{{payment_status}}`; the editor's preview shows a
  bank-transfer sample.

**Verified**: 8 new tests in `OrderPlacedTest` — each method's must and
must-not sentences on the rendered email, the checkout wiring through
`Notification::fake()`, the page/email agreement, and the receipt still
listing its lines after the extraction; the full suite; `pint`; the audit on
the template editor; and two real orders — cash on delivery and bank transfer
— placed through the API and read back off the log transport after the
queue worker delivered them.

---

## 0.30.0 — 2026-09-12

Every system email can be switched off, copied to other addresses, and sent
from its own name and address — per message, from the template screen.

**Added**

- **"Send this message"** — a switch on each of the 25 templates. Off, and
  nobody receives it: not the desk, not the customer; the wording is kept. It
  is a second switch beside "Use this wording", which was already there and
  means something else (built-in text or the editor's), and the form says so
  in two sentences on two parts of the page.
- **CC and BCC** per template — comma-separated, up to ten each, every
  address checked on save and a bad one named under the box it was typed
  into. Stored as arrays, applied whether the wording is customised or not.
- **From name and From address** per template, the campaign's two fields with
  the campaign's rules and the campaign's warning: nothing here can verify an
  address is one the provider is authorised to send as, and a wrong one lands
  in spam with nothing reporting it.
- **Three messages are locked.** The address verification, the password reset
  and the sign-in code each carry a credential somebody is waiting for with no
  other way in, so they cannot be switched off and cannot be copied — a
  sign-in code in a second inbox is an account takeover. The controls render
  disabled with the reason; their wording and sender stay editable.
- The list shows **Not sent** for a switched-off message and **+N copied** for
  one with addresses, so neither is a surprise found by opening every row.

**Changed**

- **Reset clears the wording and keeps the decisions.** The switch, the copy
  lists and the sender survive a reset; only a row holding nothing but wording
  is deleted. "Customised" now means wording has been written, not that a row
  exists.
- The switch is read at **delivery**, through `shouldSend()` on the
  `Templated` trait — so a receipt already queued when a message is switched
  off is skipped when the worker runs, and a skipped message is not a failed
  one.

**Fixed**

- **"Use this wording" could never be switched off from the console.** An
  unticked checkbox posts nothing and the action read that as "on", for as
  long as the box has existed. And the first fix for it was wrong too:
  `FormData.get` returns the *first* value of a repeated field, not the last as
  PHP does, so a hidden `"0"` before the box won every time and both switches
  saved off however they were set — a probe reading the box back agreed,
  because it showed what had been saved. Caught by posting a contact form and
  reading the mail log instead.

**Verified**: 984 API tests (15 new: the switch through `Notifier`, the
queued skip through a real `queue:work`, the lock, the address list's split
and checks, the sender's fallback, reset's keep); `pint`, `tsc`, `eslint`
clean; desktop, dark and mobile audits clean on the list, an ordinary
template and a locked one; and `scripts/_template-delivery-probe.mjs`
driving the whole thing through the console against the log transport —
22 checks, including a contact form posted with the desk message off and
only the acknowledgement arriving, then back on with a CC and a sender and
both headers on the logged message.

---

## 0.29.0 — 2026-09-12

The store, made ready for Google Merchant Center — and a feature list for the
whole product.

**Found by checking, before anything was built**

- **The store emitted no structured data at all.** No store controller called
  `withSchema()`, `Store\ProductResource` had no `schema` key, and
  `StructuredData` had no method that took a `StoreProduct`. The one part of
  the site that takes money published no price, no availability and no offer
  to anything that reads a page — while the marketing catalogue, which cannot
  be bought from, emitted a `Product` whose `Offer` carried a URL and a
  currency and no `price`. That is invalid markup and an error in Search
  Console on every `/products/{slug}`.
- **No GTIN, MPN or condition column**, no product feed of any kind, and no
  returns or shipping policy page — while the storefront advertised *"Free
  Shipping across India"* from a string in `content/site.ts` that the API could
  not read.

**Added — the feed**

- **`/store/feed.xml`**, RSS 2.0 with the `g:` namespace, for a scheduled fetch.
  Rows come from `GET /api/v1/store/feed` as data and the XML is built at the
  sink, the `JsonLd` boundary applied to a second format. One item per buyable
  thing — each variation, sharing an `item_group_id` — with a stable id built
  from the row ids and never from the SKU.
- **Availability is three-valued.** `inStock()` says *true* for a back-ordered
  product, correctly; declared to Google that is a claim the thing is on the
  shelf. `StoreProduct::availability()` answers `in_stock`, `backorder` or
  `out_of_stock` from the same fields, and the page's markup reads the same
  call.
- **`price` and `sale_price` are the other way round from the columns**, and
  the first cut sent both through unchanged — a "sale" at the regular price,
  which is a misrepresented saving. Caught by reading the output, pinned by a
  test.
- **A product with only SVG images is left out and named.** Google rejects SVG
  and this library is largely SVG placeholder art; fed anyway, an item is
  disapproved for a reason nothing on our side would show. `meta.problems` on
  the endpoint, a **"Not in feed"** badge on the product in the console.
- **`identifier_exists` is derived, never stored** — `no` only when GTIN and
  MPN are both blank, and the SKU is never offered as either.

**Added — the data and the console**

- `gtin`, `mpn`, `condition`, `google_product_category`, `weight_grams` and
  `feed_include` on store products; `gtin`/`mpn` on each variation;
  `google_product_category` on store categories, inherited by their products.
- A **Shopping** tab on the product form, GTIN/MPN inputs on every variation
  row, and a Google category field on the category form. A GTIN is refused
  unless it is 8, 12, 13 or 14 digits.
- **`feed_include` is separate from `status`** — the only way to clear a
  Merchant Center disapproval without taking a product off sale.
- **Three `store` settings** — `store_shipping_paise`, `store_handling_days`,
  `store_return_days` — read through `App\Support\Store\Fulfilment` by the
  product page, the feed and the Offer markup alike, so the three cannot
  disagree. The hard-coded shipping claim is gone; the trust strip and the
  product page derive their delivery line from the setting.

**Added — the page**

- **A `Product` graph with a real price on every store product page**:
  `priceCurrency`, `valueAddedTaxIncluded: true` (the machine-readable form of
  "Includes 18% GST"), availability, `itemCondition`, `shippingDetails` and
  `hasMerchantReturnPolicy` — `MerchantReturnNotPermitted` for a
  non-returnable product. `AggregateOffer` for a product with variations.
- **Refurbished or used is said before the price**, a term of the sale.
- **`/returns` and `/shipping`**, seeded as placeholders awaiting legal review
  like `privacy` and `terms`, linked from the footer and the seeded bottom-bar
  menu. Neither restates a number that lives in Settings.

**Removed**

- The marketing catalogue's price-less `Offer`. No offer at all is a warning
  and the truthful description of a catalogue nobody can buy from.

**Fixed on the way**

- **`track_stock` was null on an unsaved `StoreProduct`.** `$attributes`
  declared `allow_oversell` alone; `inStock()` opens with
  `if (! $this->track_stock)`, so a product created and asked about in one
  breath called itself in stock whatever its shelf held — and the first test
  for the back-order rule went green on that null. Every boolean with a column
  default is declared now.

**Also**

- **`FEATURES.md`** — every module's features, for marketing the product.

**Verified**: 970 API tests (15 new in `StoreFeedTest`, 5 in
`StructuredDataTest`); `pint`, `tsc` and `eslint` clean; desktop and mobile
audits clean over the store, both policy pages, the product form, the category
form and Settings; the feed parsed as XML with every required field on all 20
items; and `scripts/_merchant-probe.mjs` driving the Shopping tab through the
real console — a bad GTIN refused and badged on its tab, a good set landing in
the feed and the page graph, a product withheld from the feed while still on
sale, and the row restored.

**What remains is the client's, not code**: claim the domain in Merchant
Center, enter business and shipping details there, submit the feed URL, enter
a GTIN or MPN per product, replace the SVG placeholders with photographs, and
have the two policy pages reviewed. `CANONICAL_HOST` is unset in `web/.env` —
confirm Plesk serves the www redirect. Approval is Google's decision.

---

## 0.28.0 — 2026-09-11

Mail that arrives whether or not the queue is running — and an enquiry now
tells the person who sent it.

**Fixed — a contact form sent no email for two days and nothing said so**

- **When nothing is draining the queue, the send happens during the request.**
  Found by diagnosis rather than reported as a bug: `scheduler pulse: 227424` —
  the scheduler had not run for 2.6 days, and ten notifications were sitting in
  `jobs`, six of them `FormSubmitted`. Mail is queued by design and a queued
  send reports success to everybody: nothing throws, nothing is logged, no
  `mail_error` is written, and the console looks perfectly healthy. Queueing is
  an optimisation, and an optimisation that loses the message is worse than the
  cost it avoids.
- **`Notifier` asks `QueueHealth::delivering()`** — the same answer the settings
  screen and the campaign report already show, true for either the scheduler's
  heartbeat or a bare `queue:work` writing its own pulse. One definition of
  "delivering", not a second threshold invented for this.
- **`mail_error` is now written on the immediate path too.** `sendNow` runs no
  job, so `QueuedMail::failed()` never fires — the fallback would otherwise have
  quietly deleted the one signal that survives a swallowed failure. It closes
  the same hole for the three always-synchronous notifications, where a failed
  sign-in code used to write nothing at all.

**Added — the two acknowledgements that never existed**

- **`EnquiryAcknowledged` and `FormAcknowledged`**, to the person who submitted.
  Until now the desk was told and they got an on-screen sentence and no email,
  so somebody who mistyped their address found out days later when a reply
  bounced, having spent that time believing they had been in touch. Both are
  editable at `/admin/settings/email-templates`; the catalogue is 25 messages.
- **The recipient is found by field *kind*, never by name.**
  `Form::submitterEmail()` — promoted from a private method on `FormSubmitted`,
  so there is one resolver with two callers. Not `$lead->email`: `LeadIntake`
  guesses contact columns from likely key names, so a field called
  `contact_email` yields a lead with no address. A form that asks for none
  acknowledges nobody.
- **Neither echoes the submission back.** They are messages the server will send
  to any address typed into a public form — fixed content is a nuisance to
  abuse, content the sender supplies is a relay.

**Unchanged, and pinned so it stays that way**

- **Campaigns always queue.** They go out as `SendCampaignBatch` jobs through
  `Mail::to()->send()` and never touch `Notifier`, so no idle queue can put
  thousands of recipients on a request path — and their batches are spaced
  deliberately to keep the relay happy, which an immediate send would defeat.

**Verified**

- **Both directions, end to end on the real stack.** Scheduler stopped: 0 jobs
  queued and **2 messages delivered** in a 201 — the desk's *"Website form:
  Contact"* and the sender's *"We have your message"*. Scheduler running: 2 jobs
  queued and nothing sent inline.
- **Ten tests in `QueuedMailTest`**, including a campaign queueing while nothing
  drains, a stale heartbeat counting as idle, a worker pulse counting as
  draining, and a failed immediate send writing `mail_error`.
- **Two existing tests had to change, correctly.** They assert the queued path
  with no heartbeat — which is now precisely the "nothing is draining" case — so
  they establish the precondition rather than assume it.
- 949 tests passing, `pint` clean.

---

## 0.27.0 — 2026-09-11

An editor-built form can be put on another website, and its submissions arrive
in Leads like every other enquiry.

**Added**

- **`/embed/forms/{slug}`** — the form and nothing else, for framing on a
  client's or a partner's site. The console's form editor gains an **Allow this
  form to be embedded elsewhere** toggle and a snippet to copy, both on the
  new-form screen as well as the edit one.
- **`forms.embed_enabled`**, default **false**. A form built for one page of
  this site is not offered anywhere else until somebody says so.

- **Or the form as plain HTML**, behind a disclosure in the same panel, for a
  site that wants to style it with their own stylesheet. Generated from the
  stored field definition, so it matches the form rather than approximating it:
  real `<label for>` pairs, the right input type per field kind, the `website`
  honeypot, and the `_source_url`/`_referrer` envelope filled from their page.
  No classes and no styling of ours — anything we put there is something they
  would have to override first.
- **`POST /api/embed/forms/{slug}`** on the frontend, which is what that markup
  posts to. It answers `Access-Control-Allow-Origin: *` with **no**
  `Allow-Credentials` — the safe combination, since a browser then sends no
  cookies and there is no session to ride.

**Unchanged, which is the point**

- **Nothing in the submission path moved.** The page frames the real form, so a
  submission goes through the same Server Action, the same `FormValidator`
  built from the stored definition, the same `website` honeypot, the same
  10/min throttle and the same `LeadIntake`. Embedding also adds nothing to the
  endpoint's attack surface: `POST /forms/{slug}` was already public, and CORS
  only ever restrained browsers on other origins.

**Fixed — an embedded lead would have recorded the wrong site**

- **`PageContextFields` posts `document.referrer` when framed.** It posted
  `window.location.href`, which inside the frame is our own embed URL — so
  every embedded submission would have been filed against this site: plausible,
  constant and measuring nothing, the exact failure that component exists to
  prevent. Verified against a real second origin: leads recorded
  `http://127.0.0.1:4555/`, the host, not `/embed/forms/contact`.

**Changed**

- **The site-wide header block now excludes `/embed`**, which has its own.
  Browsers *intersect* multiple CSP headers rather than overriding, so a second
  block carrying `frame-ancestors *` would have left `'self'` in force and
  blocked every embed with nothing saying why. `X-Frame-Options` is omitted
  there for the same reason — it has no "allow any origin" value.
- **`audit.mjs` no longer requires a canonical on a `noindex` page.** Stated as
  the rule rather than as an exemption for one route: the check exists so two
  URLs cannot split one page's ranking, which is not a question a page that
  asks not to be indexed is asking.

**Verified**

- Nine checks end to end in a browser, through the screens: refused before
  opt-in, ticking and **unticking** both persist, a page on a foreign origin
  frames it with no CSP refusal, a submission inside the frame succeeds, and
  the lead names the host.
- Four feature tests in `LeadTest`, 30 passing. One of them caught that a
  fieldless form is a 404 on the public endpoint — documented behaviour the
  first cut of the test had forgotten.
- **The HTML snippet posted from a real second origin**, using the same module
  the console imports rather than a hand-written approximation: preflight 204
  with `allow-origin *` and credentials absent, nine controls generated, every
  one carrying a `<label for>`, the honeypot present, no CORS errors, and the
  visitor shown *"Thank you — we have your enquiry…"* on **their** page with the
  lead stamped `http://127.0.0.1:4556/`. That one had to be measured rather than
  reasoned about: a cross-origin `fetch` is *sent* whether or not CORS allows
  it, so a missing header looks exactly like a form that always errors while
  filing a lead every time.
- **`config/cors.php` was not touched.** Widening it was the alternative and was
  refused: it allows exactly `FRONTEND_URL` with `supports_credentials: true`,
  so `'*'` is illegal there, and the routes through were registering every
  embedding domain or loosening CORS for every authenticated route in the
  product to serve one public form.
- `/embed/forms/contact` added to both audit lists; the mobile one matters most,
  since an embed lands in whatever column width the host has.

---

## 0.26.0 — 2026-09-11

Two more sidebar sections — Blog and Careers — and the rule that makes a
two-role section affordable.

**Added**

- **Blog** — Blog, Blog categories and Comments, which were three of the nine
  rows in Content and a third of it spent on one subject. Content keeps
  Knowledge base, Case studies, Pages, FAQs and Media.
- **Careers** — Vacancies beside the Applications it receives. They were the
  two furthest-apart rows in the sidebar: the vacancy was eighth of nine inside
  Content, the applications were top level three sections above it, and the
  screens have always linked to each other in both directions.

**Changed**

- **A group with exactly one visible child now renders as that child.** The
  sibling of the existing "drop a group whose every child is hidden", and what
  keeps Careers from costing anything: Vacancies is `content_manager` and
  Applications is `support_engineer`, so without this each of them would be
  shown a section called Careers holding a single link — the complaint already
  recorded about "Your account" inside "Site".

**Measured**

- **Administrator: 9 sections, 46 rows** with Careers at two.
- **Content manager: 4 sections, 21 rows**, with Vacancies a plain row in the
  section's position and no one-row group.
- **Support engineer: 5 top-level rows** with Applications among the queues —
  **exactly the sidebar they had before any of this**.
- **All 46 rows survive with every href, role, label and `exact` flag
  unchanged**, diffed against the parsed nav from before the change. No role
  moved: re-gating either half of Careers would be an API change and a decision
  about who may read a CV, not a decision about a menu.

---

## 0.25.0 — 2026-09-11

The console's two longest menus, measured and cut down: the sidebar's "Site"
section becomes three, and the settings screen's twenty tabs become six
sections.

**Changed**

- **"Site" is now Site, SEO and System.** It carried fourteen rows across three
  roles and was both the longest section in the sidebar and the only one
  holding more than one person's work — which are the same fact, because Menus
  above SEO above Staff is three lists concatenated and no order improves it.
  Now five, four and five, each gated on a single role: Site is
  `content_manager` page furniture, SEO is `seo_manager`, System is `admin`.
- **One row changed its label and nothing else changed at all.** `/admin/seo`
  reads **"Overview"** rather than "SEO", because "SEO › SEO" looks like a
  mistake and Store and Assistant already name their first row that way. Every
  other row keeps its label, and **all 46 keep their href, their role and their
  `exact` flag** — checked by diffing the parsed nav before and after, so
  nothing can have been dropped or re-gated.

**Measured**

- **The two halves of the old section failed differently**, which is why
  `scripts/_nav-probe.mjs` signs in as two accounts and prints what each is
  shown rather than the change being reasoned about. An **administrator holds
  every role and saw all fourteen rows** — so the sidebar's worst section was
  the one only administrators could see in full. A single-role holder was never
  shown a long list, because the filter had always cut it to their own rows;
  for them the *heading* was the defect, a redirect filed under "Site".
- **After: seven sections for an administrator**, and a `content_manager` is
  shown Content, Catalogue and Site with SEO and System **absent rather than
  empty** — the existing "drop a group whose every child is hidden" rule.

**Fixed — three settings tabs were showing a database key as their name**

- **`portal`, `security` and `blog`** rendered as lowercase raw keys at the end
  of the settings strip. All three had been added to the settings table since
  `ORDER` was last touched, and `GROUP_TITLES[group] ?? { title: group }` is a
  sensible fallback and a silent one. `portal` was the worst: a perfectly good
  title sat unread in `GROUP_TITLES` under the key **`support`**, because the
  group had been renamed and the title never followed. They are now **Customer
  portal**, **Data retention** and **Blog**, each with a blurb.
- **`newsletter` had a title and was missing from `ORDER`**, so it sorted to
  the end with them.

**Changed — the settings screen's twenty tabs become six sections**

- **Site, Content, Shop, Messaging, Access, Privacy.** `TabDef` takes an
  optional `section`; the fifteen other forms pass none and render exactly the
  strip they always have. `SECTIONS` is the single list and **`ORDER` is
  derived from it**, so a group cannot be sorted into one place and filed under
  another — and a group no section claims lands in "Other" rather than becoming
  another lowercase tab.
- **Every panel still stays mounted.** Tabs outside the open section are hidden
  with the `hidden` attribute rather than dropped, so all twenty panels keep
  `aria-labelledby` pointing at an element that exists.

**Measured**

- **Twenty wrapping tabs never failed an audit**, because a `flex flex-wrap`
  row does not overflow — it wraps, and the cost is vertical: two rows at
  1440px, three at 1024px, **six rows and 230px at 390px**, putting the first
  field 528px down a phone screen.
- **What the split bought is scanning, not space**, and the figures say so: one
  row of tabs at every width, but two strips instead of one, so at 1440px the
  first field went 275px → 276px. Narrow widths gained (528px → 449px).
- **Nothing left the form**, counted in a browser on both versions: 20 panels,
  233 controls and 142 `setting__` names before and after.

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
