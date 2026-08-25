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
