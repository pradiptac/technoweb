# Technoware — features by module

One platform for a hardware and network solutions business: the marketing
website, the online shop, the customer support portal, the sales pipeline and
the console that runs all of it. One codebase, one login, one set of data.

Everything below is built and in the product. Where a figure is quoted, it was
measured.

---

## 1. Marketing website

A fast, fully responsive public site that ranks — rendered statically where it
can be and served live where it must be.

- **Homepage** with an editable hero, statistics band, solutions grid, product
  categories, industries, case studies, latest posts and a brand marquee — all
  read live from the CMS, nothing hard-coded.
- **Section pages** for Solutions, Services, Industries, Products, Resources,
  Support and Company, each with a section banner an editor can set once.
- **Site-wide search** ranking an exact part number first, grouped by type.
- **Contact and enquiry forms** on every service page, with honeypot spam
  protection and a rate limit — no CAPTCHA a real customer has to solve.
- **Light, dark and system colour schemes**, remembered per visitor, with no
  flash of the wrong scheme on load.
- **Your brand colours, or a preset.** Nine prebuilt palettes, twenty-five
  more behind a disclosure, or five colours of your own — primary, secondary,
  accent, background, text — typed as hex or picked from a colour wheel, with
  a choice of headline and body font. Every shade is derived so text stays
  readable, and a palette that would not is refused before it ships.
- **A dark mode that follows the palette**: neutrals tinted by the brand's
  own hue and brighter accents on dark, generated for every theme — not one
  fixed grey shared by all of them.
- **Cookie consent** that actually gates the trackers: no analytics script
  loads until somebody accepts.
- **Google Analytics 4 and Meta Pixel**, configured from Settings.
- **Scroll-reveal animations** that respect `prefers-reduced-motion`.
- **Accessibility as a build gate.** Every route is audited in a real browser
  for contrast, heading order, keyboard reach and tap-target size — the build
  fails if any of it regresses.
- **Mobile-first**, verified at 320, 360, 390 and 414px on every page,
  including the console.

## 2. Catalogue

The product and solution catalogue built for how B2B buyers actually research.

- **Solutions, services, industries and product categories**, cross-linked:
  a solution lists the hardware it uses, the industries it serves and its own
  FAQs; a category page recommends related solutions.
- **Products** with SKU, brand, ordered specification sheets, feature lists,
  image galleries, datasheets and "Request information" calls to action.
- **26 brands with real manufacturer logos**, shown only where a published
  product exists — a filter never leads to an empty page.
- **Category and product on one URL scheme** (`/products/switches`,
  `/products/cisco-cbs350-24t-4g`), the way buyers link and bookmark.
- **Choose what is in the navigation** separately from what is published, so
  a growing catalogue does not become an unusable mega menu.
- **Every catalogue edit reaches the homepage** — rename a solution and it
  changes everywhere, including navigation and structured data.

## 3. Content management

A full CMS for the people who write, without a developer in the loop.

- **Blog** with categories, featured posts, author attribution, reading time,
  an RSS feed, monthly archives and search.
- **Knowledge base** with categories and tags; search matches "wifi" to
  "Wi-Fi" because customers do not type hyphens.
- **Case studies** with client, industry and a results table.
- **Standalone pages** (privacy, terms, downloads and anything else) in two
  templates, with shortcodes to drop a slider, gallery or form into any body.
- **FAQs** managed in one place and attached to any solution, service, product
  or page — rendered on the page and as `FAQPage` structured data.
- **Rich-text editor** with the full toolbar — headings, colour, tables,
  video, code — and a server-side sanitiser that makes stored XSS impossible
  rather than unlikely.
- **Blog comments** with a moderation queue, spam scoring and threaded
  replies. Nothing is published, and nothing is filed as spam, without a
  person deciding.
- **Every form remembers what you typed** if the server refuses a submission.
  A validation error never blanks the screen.

## 4. Media library

A real digital asset manager, not an upload folder.

- **Drag-and-drop, multi-file upload** everywhere an image can be chosen,
  including inside the editor.
- **Folders, search across filenames, alt text, descriptions and tags**, bulk
  move, copy and delete.
- **Image editing in the browser**: resize, crop, rotate, flip, brightness,
  contrast, greyscale — with thumbnails generated as their own assets.
- **Version history** for every in-place edit, and a **bin** with restore, so
  a deleted image never leaves a hole in a live page.
- **Alt text lives with the file** and follows it onto every page that uses
  it.
- **SVG uploads are sanitised on write**, so a logo can never carry a script.
- **Upload limits shown beside the server's own**, so a ceiling is never a
  mystery.

## 5. Site design controls

The parts of the design a client changes after launch, without a designer.

- **Menu builder** for four locations — top bar, primary navigation, footer
  columns and the bottom row — nested three levels, keyboard-operable, with
  links that follow a record when its URL changes.
- **Sliders** with image, video and YouTube slides, four transitions, autoplay
  and captions; the homepage hero is one of them.
- **Galleries** with tabs, a lightbox and per-gallery transitions.
- **Popups** targeted by section or path, sized and timed, shown once per
  visit or once per day, scheduled with a start and end.
- **Section banners** — one photograph behind each area's page heading, with
  contrast guaranteed whatever is uploaded.
- **Logo, favicon, address, phone, map embed, social profiles** — all
  settings.
- **Seed the navigation from the live site** with one command, then edit it.

## 6. Online store

A complete shop for hardware, licences and services — GST-correct from the
first rupee.

- **Separate shop catalogue** from the marketing one: what is sold is
  maintained apart from what is advertised, with no accidental Buy button.
- **Physical, digital and service products**, with variations (a 24-port and a
  48-port are two prices and two stock levels), compare-at pricing and
  featured placement.
- **Prices in paise, GST extracted, never added** — the price shown is the
  price paid, and the invoice always adds back up to the money taken.
- **Guest checkout** with an httpOnly basket cookie; a paying guest gets a
  portal account automatically.
- **PIN-code-first address entry** that fills city and state from India Post's
  directory — vendored, so no customer's PIN code goes to a third party.
- **Four ways to pay**: Razorpay, cash on delivery with a ceiling, bank
  transfer and UPI with a QR code. Account details are shown only to the
  person who placed the order, and only until it is paid.
- **Webhook-settled payments** that are idempotent under retries, verified over
  the raw body, and never fail an order because stock ran short after payment.
- **Coupons** — percentage or fixed, minimum spend, per-customer limits keyed
  on the address so signing out is not a loophole.
- **Digital licence delivery**: codes encrypted at rest, assigned atomically,
  revealed by a counted action on the order page, never emailed — with an
  activation procedure and PDF that are.
- **Stock ledger** recording every movement in and out, with a report and a
  CSV export that Excel can actually sum.
- **Back-orders** switchable per product or per variation.
- **Order management**: status lifecycle, dispatch notice on status change,
  tracking, uploaded invoices, internal notes, manual payment recording.
- **Sales dashboard and reports** by day, week or month, with medians rather
  than means and refunds beside revenue rather than netted off it.
- **Google Merchant Center ready**: `Product` structured data with price,
  availability, condition, shipping and return policy on every product page;
  a scheduled-fetch product feed at `/store/feed.xml` with GTIN, MPN, variant
  grouping and Google categories; and a console that names any product the
  feed cannot list and why.

## 7. Customer portal and support tickets

The support desk customers log into, and the queue the team works from.

- **Self-registration** with email verification and an optional approval
  queue — or accounts issued by staff.
- **Sign in with a one-time code** or a password; the code is bound to the
  portal so it can never open the console.
- **Tickets** with categories, priorities, attachments, an SLA clock, a full
  conversation thread, close and reopen.
- **Knowledge-base deflection** before a ticket is raised.
- **Order history** for anyone who has bought, with the same account.
- **Profile** with billing and delivery addresses and GSTIN, pre-filled at
  the next checkout.
- **Staff queue** filtered by status, priority, assignee and overdue, with
  internal notes that structurally cannot reach a customer.
- **Support dashboard**: 30-day volume, median first response and resolution,
  SLA rate, open by priority and category.
- **Customer administration**: approve, reject, suspend, resend verification —
  every decision revokes sessions where it should.

## 8. Leads and sales pipeline

Every enquiry from every form lands in one place.

- **One pipeline** for the contact form, every editor-built form and the
  website assistant — with the original submission kept intact.
- **Lead scoring** out of what applies, with the reasons stored beside the
  number.
- **Source attribution** posted by the page itself: URL, title, referrer and
  UTM parameters, captured even through an embedded form on another site.
- **Status lifecycle** offering only the moves the pipeline allows, with
  contacted and closed dates that reports can trust.
- **Assignment, follow-up dates, deal value and notes.**
- **Related enquiries** from the same address shown, never merged.
- **CSV export**, formula-safe.

## 9. Form builder

Build a form in the console, put it on any page — or on somebody else's site.

- **Any field type**, required flags, select options validated as a whitelist,
  a success message and a notification address per form.
- **Drop it into any page** with a shortcode.
- **Embed on an external website** three ways: an iframe, a copy-paste snippet,
  or raw HTML the partner styles themselves. Submissions still land in the
  lead pipeline, attributed to the host page.
- **Honeypot, throttle and validation** generated from the form's own
  definition, so a stale tab cannot post fields that no longer exist.
- **Submissions outlive their form.**

## 10. Newsletter and campaigns

Email marketing that keeps the sending domain healthy.

- **Block-based campaign editor** with templates, live preview and a test send.
- **Subscribers from three routes** — CSV or Excel import with a dry run, a
  pasted block of addresses, and an always-current "Existing customers" group.
- **Groups**, audiences with every exclusion explained, and a suppression list
  that outlives any subscriber row: an unsubscribe can never be undone by an
  import.
- **Deliverability score** with the legal checks — unsubscribe link, sender
  identity, postal address, text part — enforced at send time.
- **Batched sending** through the queue, paced for the relay.
- **Open and click tracking**, one-click unsubscribe that mail clients
  honour, and **bounce webhooks** from Mailgun and Brevo.
- **Reports** per campaign, with rates quoted over delivered and the sample
  beside them.
- **One attachment per campaign**, referenced from the media library.

## 11. Website assistant

A chatbot that answers from your own pages and never invents.

- **Grounded answers only**: nothing retrieved means the model is never
  called, and the visitor is told honestly.
- **Lead capture in the conversation** — name, email, phone, company — every
  step skippable, then filed as a lead with the transcript attached.
- **Product cards** with live price and stock, adding straight to the basket.
- **Sales and support intent** routed to the right desk.
- **WhatsApp hand-off** carrying the question already typed.
- **Unanswered questions grouped** — forty people asking one thing is one
  page to write.
- **A daily spend cap** with a dashboard that says how close today has run.
- **Prompt-injection hardened**: retrieved copy is fenced so a page can never
  become an instruction.
- **Conversations resume** across a closed panel and a sign-in.

## 12. Careers

- **Vacancies** with department, type, location (blank means remote),
  qualifications and experience levels as editable lookups, salary optional,
  and a closing date that closes the role in three places at once.
- **Google Jobs** structured data on every vacancy.
- **Applications** with CV upload to private storage, streamed only to staff,
  with status tracking and automatic retention-based deletion.

## 13. SEO

Built in, measured, and never allowed to guess.

- **Per-record metadata overrides** on every page type, with derived defaults
  shown beside them and live character counters that count what will publish.
- **SEO overview** scoring every indexable record out of what applies, with
  duplicate-title detection across the whole site and a one-row recheck.
- **Structured data generated server-side** for products, services, articles,
  FAQs, breadcrumbs, places, job postings and the organisation — with nothing
  invented and `<` escaped at the sink.
- **Automatic 301s** whenever a slug changes, plus a manual redirect table.
- **Sitemap and robots** generated from the data, honouring per-record
  inclusion.
- **Share images** for every page, generated when no photograph exists.
- **AI SEO assistant** (OpenAI, off by default): generates titles,
  descriptions, FAQs, internal links and schema suggestions — and can never
  write to a record; an editor applies each one through the same save as a
  typed value.
- **Programmatic landing pages** for brand × category and place × service
  combinations, with five server-side rules that make a thin page impossible
  to publish: evidence from the catalogue, a written introduction, a
  near-duplicate check, distinct metadata and a site-wide cap.
- **Places as a tree** (country → state → city → area), with services
  assigned per place feeding `areaServed` and `LocalBusiness` markup.

## 14. Email and notifications

- **Six outgoing transports** chosen in Settings — SMTP, Gmail/Workspace over
  OAuth, Brevo, Mailgun, Amazon SES and a log transport — with a test button
  that returns the server's own words.
- **Every system email editable** in the console: 25 messages, each with its
  placeholders listed, subject and body.
- **Acknowledgements to the customer** for tickets, enquiries, form
  submissions and applications.
- **Queued delivery** so a slow mail server never slows a form — and an
  automatic fallback that sends during the request if nothing is draining the
  queue, so mail never silently stops.
- **A visible banner** the moment delivery fails.

## 15. Console, access and security

- **Seven roles** — administrator, support engineer, content manager, SEO
  manager, campaign manager, store manager, sales manager — enforced by
  middleware on every route and reflected in a sidebar that only offers what
  each person can open.
- **Sign in with a one-time code** or a password, each switchable; five wrong
  codes burn the code.
- **Activity log** by rule, not by list: every deletion, every creation, and
  everything under staff, customers, settings and sign-in — append-only,
  credential-free, pruned only by age.
- **Client-side error reporting** grouped by fingerprint, re-opening itself
  if a fix does not hold.
- **Staff management** with lockout guards: the last administrator cannot be
  removed.
- **Settings** grouped into six sections, with secrets encrypted at rest and
  never returned to the browser.
- **Security headers**: enforced CSP directives, a report-only policy the
  build fails on, HSTS, `nosniff`, sandboxed SVG delivery.
- **Two principals that cannot cross**: a customer token cannot reach the
  console and a staff token cannot read a customer's tickets — by middleware,
  not by convention.
- **Every upload is private by default** unless it is meant to be public;
  ticket attachments, CVs and invoices stream only through authorised routes.

## 16. Platform

- **Laravel 12 API + Next.js 16 frontend**, TypeScript throughout, Tailwind v4.
- **Deploys to Plesk** as two domains with one cron entry.
- **Over 950 automated tests** on the API, and browser audits over every
  route — desktop, mobile and dark scheme — that fail the build on a contrast
  regression, a heading jump, a horizontal overflow, a console error or a CSP
  violation.
- **A mock API** so the frontend builds and CI runs without the backend.
- **Versioned**, with a changelog line for every number the console shows.
- **No secrets in the repository**, no third-party runtime dependency that
  can change under a customer's data, and no library where a vendored file
  would do.
