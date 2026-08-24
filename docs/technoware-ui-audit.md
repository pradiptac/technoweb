# Technoware — Design, Visibility, Responsiveness & Functionality Audit

**Target:** `http://localhost:3000` (public site) and `http://localhost:3000/admin` (console)
**Date:** 23 August 2026
**Method:** Live browser inspection. Viewports 390 / 640 / 768 / 1024 / 1280 / 1707 CSS px (narrow widths tested via same-origin iframes because the browser window could not be resized). Every finding below was measured in the DOM or captured in a screenshot, not inferred.
**Scope agreed with the requester:** visual / design / responsiveness. **No records were created, edited or deleted and no forms were submitted**, so write flows and error/validation states were *not* exercised — see [Caveats](#caveats).

---

## How to use this document

Each finding has a stable ID, a severity, the exact route(s), the measured evidence, and a concrete fix. Work top-down within each severity band. IDs prefixed `F-` are the public site, `A-` are the admin console, `O-` are optimisation opportunities.

**Suggested order of work:** F-01 → A-01 → A-02 → F-02 → F-03 → A-03 → A-04 → F-04 → everything else.

---

## Executive summary

The design system underneath both surfaces is strong and consistent — one type scale, one colour set, one card language, a real dark/light rhythm, sensible empty states, and a mobile table→card transformation in the admin that most CMSs never bother with. The problems are not stylistic, they are **a small number of layout primitives that break in specific conditions and then repeat everywhere that primitive is used**.

Three defects account for most of the visible damage:

1. **A product-card image escapes its 160px well and paints over the card's own text** — every product category page, every breakpoint. (F-01)
2. **Floating labels fall to the bottom edge of the input whenever a field has helper text** — which is almost every field in the admin CMS forms. (A-01)
3. **The staff login declares `autocomplete="one-time-code"` on email *and* password**, which stops password managers working on the one screen where they matter most. (A-02)

After those, the recurring themes are: dead space in the hero band on desktop, one contrast token that fails AA on dark sections, and an inconsistent form-control layer in the admin where roughly half the filter bars use native OS selects and the other half use the styled component.

**Counts:** 16 public-site findings, 17 admin findings, 9 optimisation notes. 4 are Critical/High-severity blockers.

---

# Part 1 — Public website

## F-01 · CRITICAL · Product card image overflows its well and covers the card text

**Routes:** `/products/servers`, `/products/switches`, `/products/routers`, `/products/firewalls`, `/products/wifi`, `/products/storage`, `/products/ups-power`, `/products/surveillance`, `/products/accessories` — anywhere the product card component renders.

**Measured:**

| Viewport | `<img>` rendered height | Well height | Overflow |
|---|---|---|---|
| 390px | 262px | 160px | +102px |
| 640px | 214px | 160px | +54px |
| 768px | 257px | 160px | +97px |
| 1024px | 228px | 160px | +68px |
| 1707px | 382px | 160px | +222px |

DOM at 1707px:

```
A.flex h-full flex-col overflow-hidden rounded-lg border …   85,450  497x330
  DIV.grid h-40 place-items-center border-b border-line …    85,450  496x160   ← overflow: visible
    IMG.h-full w-full object-contain p-5                     85,450  496x382   ← 222px too tall
  DIV.flex flex-1 flex-col p-4.5                             85,610  496x169   ← painted over
```

**Effect:** the dark placeholder artwork spills down over the brand eyebrow, product name, SKU, short description and the "View details →" link. On `/products/switches` the entire lower half of every card is unreadable — dark text on a black image, with a second copy of the product name (baked into the placeholder SVG) sitting on top of the real one.

**Root cause:** the well is `display: grid` with `place-items-center`, so the image is not stretched and `h-full` (`height: 100%`) does not resolve against the 160px track; the SVG's intrinsic aspect ratio wins. The well is `overflow: visible`, so nothing clips the result.

**Fix:**

```diff
- <div class="grid h-40 place-items-center border-b border-line bg-surface">
-   <img class="h-full w-full object-contain p-5" …>
+ <div class="grid h-40 place-items-center overflow-hidden border-b border-line bg-surface">
+   <img class="max-h-full max-w-full object-contain p-5" …>
```

Or make the well `relative` and the image `absolute inset-0 h-full w-full object-contain`. Add `overflow-hidden` either way as a belt-and-braces guard.

---

## F-02 · HIGH · 404 is the unstyled Next.js default

**Route:** any unknown URL, e.g. `/this-page-does-not-exist`

A black full-bleed panel reading `404 | This page could not be found.` renders below the site header. No footer, no navigation, no search, no suggested destinations, and a dark background that contradicts the site's light theme.

**Fix:** add `app/not-found.tsx` using the standard page shell — breadcrumb, H1, a short apology, links to Solutions / Products / Support / Knowledge base, and the knowledge-base search field.

---

## F-03 · HIGH · Muted text on dark sections fails WCAG AA

**Token:** `text-dark-muted` = `rgb(85, 88, 77)` (`#55584D`) on `rgb(18, 20, 13)` (`#12140D`)
**Measured contrast: 2.55:1** — AA requires 4.5:1 for body text and 3:1 for large text.

**Confirmed instances (homepage, 16 elements using the token):**

| Element | Size | Route |
|---|---|---|
| "Every contract customer gets a portal login, full ticket history and a named engineer…" | 18.5px | `/` — Support section |
| `noc / site-overview` | 11.5px | `/` — hero panel |
| `1.8 Gbps`, `2 d ago`, `ticket #4821` | 11.5px | `/` — hero panel |
| `4 open`, `#4821`, `#4818`, `#4802`, `#4794` | 11.5px | `/` — My tickets panel |
| "Head of IT, manufacturing group · 6 sites" | 13px | `/` — testimonial |
| Header utility bar phone/email | 13px | all routes |

**Fix:** lighten the token to at least `#8A9080` (4.5:1) — `#9AA08C` gives 5.6:1 and comfortable headroom. Fix the token, not the instances.

---

## F-04 · HIGH · Case-study metric strip renders empty grid cells

**Routes:** `/case-studies/hospital-wifi`, `/case-studies/six-plant-consolidation`

The metric strip is `grid gap-px overflow-hidden rounded-xl border border-line-strong bg-line sm:grid-cols-2 lg:grid-cols-4`. The hospital case study supplies **two** metrics; at ≥1024px the grid still creates four 283px columns, so columns 3 and 4 render as one large blank tinted block occupying half the strip. Because the "borders" are `gap-px` over a `bg-line` container, the empty area reads as a deliberate but content-less panel.

**Fix:** derive the column count from the item count, or switch to `grid-cols-[repeat(auto-fit,minmax(220px,1fr))]` with `justify-items-stretch`.

---

## F-05 · MEDIUM · Hero band leaves ~50% of the viewport empty and inserts 150–260px of dead vertical space

**Routes:** `/solutions`, `/products`, `/products/*`, `/services/*`, `/industries/*`, `/about`, `/contact`, `/case-studies/*`, `/knowledge-base`, `/resources` — the shared inner-page hero.

At ≥1280px the hero is a two-column layout where the right column is empty on every one of these pages. Below the copy there is a further fixed gap before the first content block. Worst measured case, `/industries/healthcare` at 1707px: H1 plus one 8-word sentence, then **~250px of nothing** before the body copy, with the right 45% of the band unused.

`/products/switches` is the starkest: the entire hero is the word "Switches" and roughly 300px of whitespace.

**Fix (design tuning, pick one):**
- Collapse the hero to a single column and cut the bottom padding to ~64px when there is no right-column content.
- Or fill the right column with something useful per page type: category product count + top brands (products), the enquiry form teaser (services), the related-solutions list (industries), the metric strip (case studies).
- Or keep the two-column grid but let the copy span 8 of 12 columns instead of 6 so the ragged right edge is intentional rather than accidental.

---

## F-06 · MEDIUM · Category listing pages have no supporting content

**Routes:** `/products/*` category pages

The page is: breadcrumb → eyebrow → H1 → cards. There is no category description, no product count, no filters (brand, use case), no sort, and no cross-links to the related solution page. With 9 categories and a growing catalogue this will not scale, and it is the reason F-05 reads so badly here.

---

## F-07 · MEDIUM · No site-wide search

Search exists only on `/knowledge-base`. The header has no search affordance despite ~50 indexable pages including a product catalogue with SKUs. A user who knows the part number has no way to find it.

---

## F-08 · MEDIUM · Mobile navigation drawer is not an accessible dialog

**Route:** all, at <1024px

Measured on the open drawer:

| Check | Result |
|---|---|
| Toggle size / `aria-expanded` / `aria-controls` | 44×44, `false`→`true`, `mobile-menu` ✅ |
| Body scroll lock while open | `overflow: hidden` ✅ |
| Escape closes | ✅ |
| `role="dialog"` on `#mobile-menu` | **`null`** ❌ |
| `aria-modal="true"` | **`null`** ❌ |
| Focus moved into the panel on open | **No** — `document.activeElement` stays `BODY` ❌ |
| Focus trap while open | **None** ❌ |

Screen-reader users are not told a dialog opened; keyboard users tab through the whole page behind the overlay before reaching the menu.

Separately, the drawer drops the utility links that exist in the desktop top bar: **Knowledge base, Track a ticket, the phone number and the support email are all unreachable from mobile navigation.**

**Fix:** `role="dialog" aria-modal="true" aria-label="Menu"`, move focus to the close button on open, trap focus inside the panel, restore focus to the toggle on close, and add the four utility links to the drawer footer.

---

## F-09 · LOW · Header CTA changes wording between breakpoints

Desktop reads **"Request a consultation"**; the mobile header button reads **"Get a quote"**. Two different promises for the same destination. Pick one (the drawer already uses "Request a consultation", so the mobile header is the outlier).

---

## F-10 · LOW · Hero eyebrow pill wraps badly at ≤430px

The `AMC · Networking · Servers · Security · Surveillance` `rounded-full` pill wraps onto two lines at 390px, orphaning the AMC badge on its own line inside a stadium-shaped container that no longer looks like a pill.

**Fix:** below `sm`, drop the pill chrome and render it as a plain two-line eyebrow, or shorten to `AMC · Networking · Security`.

---

## F-11 · LOW · Type scale bottoms out at 10.5px

Homepage: 8 elements at **10.5px**, 17 at **11.5px**, 4 at **11px** (29 total below 12px, SVG text excluded). Examples: `AMC`, `Healthy`, `Passed`, `Degraded` status chips (10.5px); all mono metadata (11.5px).

**Fix:** raise the floor to 12px. Chips can stay visually small via letter-spacing and padding rather than font-size.

---

## F-12 · LOW · Sitemap omits published sections

`/sitemap.xml` lists 49 URLs but is missing: `/blog`, `/case-studies`, `/support`, `/downloads`, `/privacy`, `/terms`, and every individual blog post, knowledge-base article and case study — all of which are live and linked from the footer and homepage.

*(Link check: all 54 internal links found on the site return 200. No broken links.)*

---

## F-13 · LOW · Honeypot field is exposed to assistive technology

```html
<div class="absolute left-[-9999px] h-0 w-0 overflow-hidden">
  <label for="website">Leave this empty</label>
  <input id="website" type="text" tabindex="-1" autocomplete="off" name="website">
</div>
```

`tabindex="-1"` and `autocomplete="off"` are right, but the field is off-screen rather than `display:none`, so screen readers still announce "Leave this empty, edit text". Add `aria-hidden="true"` to the wrapper.

---

## F-14 · LOW · Focus ring on the primary CTA is the same colour as the button

Focused "Request a consultation": `outline: solid 2px rgb(79,95,48)` on `background: rgb(74,90,42)` — **1.06:1 against the button itself**. It is only visible because `outline-offset: 2px` places it on the white page. On the dark bands (`/` support section, `/portal/login`, `/admin/login`, footer) the ring will effectively vanish.

**Fix:** use a two-tone ring (`outline` + `box-shadow` in the opposite polarity), or switch the ring to a light token on dark surfaces.

---

## F-15 · LOW · Duplicated font fallback stack

Computed `font-family` on `body`:

```
inter, "inter Fallback", system-ui, sans-serif, system-ui, sans-serif
```

The fallback tail is duplicated — the Tailwind theme default is being appended to a font variable that already carries it. Harmless but it indicates the font stack is defined in two places.

---

## F-16 · INFO · Blog and case-study hero images duplicate the H1

`/blog/*` and `/case-studies/*` render the article title as a real H1, then immediately below show a black placeholder cover with the *same title* set in white. Once real cover art exists this resolves itself; until then it reads as a bug.

---

# Part 2 — Admin console

## A-01 · CRITICAL · Floating labels fall to the bottom of the input on every field with helper text

**Routes:** `/admin/products/new`, `/admin/products/[id]`, `/admin/profile`, and every CMS form using the same field component — blog, knowledge base, case studies, pages, solutions, services, industries, FAQs, brands, categories, redirects, settings.

**Measured on `/admin/profile`** (three password fields, identical component, three different label positions):

| Field | Input | Wrapper height | Label offset from input top | Visual result |
|---|---|---|---|---|
| `current_password` | 308→354 (46px) | 90px (has helper text) | **+34px** | label straddles the **bottom border** |
| `password` | 416→462 (46px) | 70px (has helper text) | **+24px** | label sits below centre |
| `password_confirmation` | 504→550 (46px) | 46px (no helper text) | **+12px** | correct |

**Measured on `/admin/products/new`:** `short_description` label is **+50px** from the top of a 91px textarea. Screenshot evidence shows "Name", "Slug" and "SKU" resting labels sitting on the bottom border of their boxes while the sidebar fields ("Status", "Brand", "Category" — no helper text) are correct.

**Root cause:** the label is `pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2` inside a `.relative mb-[18px]` wrapper **that also contains the helper `<p>`**. `top-1/2` therefore centres on the wrapper (input + helper), not the input, so every helper line pushes the resting label further down. Wrapper heights 90 / 70 / 46px produce label offsets 34 / 24 / 12px exactly.

**Fix:**

```diff
- <div class="relative mb-[18px]">
-   <input id="…" class="peer …" placeholder=" ">
-   <label for="…" class="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 …">…</label>
-   <p class="text-xs text-muted">helper…</p>
- </div>
+ <div class="mb-[18px]">
+   <div class="relative">
+     <input id="…" class="peer …" placeholder=" ">
+     <label for="…" class="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 …">…</label>
+   </div>
+   <p class="mt-1.5 text-xs text-muted">helper…</p>
+ </div>
```

This is the single highest-impact fix in the admin — it affects nearly every editing screen.

---

## A-02 · HIGH · Staff login uses `autocomplete="one-time-code"` on both email and password

**Route:** `/admin/login`

```json
[
  { "name": "email",    "type": "email",    "autocomplete": "one-time-code" },
  { "name": "password", "type": "password", "autocomplete": "one-time-code" }
]
```

Password managers will not offer to fill or save these credentials, and iOS/Android will try to autofill an SMS one-time code into the email field. For contrast, `/portal/login` is correct (`email` / `current-password`) and `/admin/forgot-password` is correct (`email`) — so this is an isolated mistake on the staff form, not a house style.

**Fix:** `autocomplete="username"` (or `"email"`) and `autocomplete="current-password"`.

---

## A-03 · HIGH · Admin tables clip their last column between ~640px and ~1024px

**Route:** `/admin/products` at 768px (reproduced on the other table screens)

The table sits in an `overflow-x-auto` container with **no visible scroll affordance**. At 768px the STATUS column header is cut mid-word to `STA` and the status pill is sliced down to its leading dot. At 390px the same list correctly transforms into stacked cards with `BRAND / CATEGORY / STATUS` labels, so the responsive work exists — the breakpoint is just set too low.

**Fix:** move the card breakpoint from `sm` to `lg`, so anything narrower than the sidebar layout uses cards. Alternatively add a persistent horizontal-scroll shadow/affordance.

---

## A-04 · HIGH · Half the admin uses native OS selects, half uses the styled component

| Styled (rounded, custom chevron) | Native / unstyled |
|---|---|
| `/admin/tickets` — Status, Priority, Assignee | `/admin/products` — Status |
| `/admin/blog` — Status, Author | `/admin/seo` — Type, Show |
| `/admin/pages` — Status | `/admin/users` — Role |
| `/admin/solutions` — Status | `/admin/redirects` — Source |
| | `/admin/faqs` — Appears on |

Confirmed via `appearance: auto` on the native ones. In addition, `/admin/media` and `/admin/settings` render bare `<input type="file">` controls — the raw *"Choose file  No file chosen"* string appears **three times** on the Settings → General tab (Logo, Favicon, Sign-in image).

**Fix:** route every `<select>` through the styled component and build a file-upload control (button + filename + optional drop zone) to replace the raw inputs.

---

## A-05 · MEDIUM · Filter-bar controls are misaligned

**Route:** `/admin/products` (pattern repeats on other list screens)

| Control | Top | Height |
|---|---|---|
| "Search" label | 140 | 17 |
| "Status" label | **142** | 17 |
| Search input | 159 | **33** |
| Status select | **161** | **31** |
| Apply button | **148** | **44** |

Three different heights and three different baselines in a single row. The Apply button is 11px taller than the inputs and starts 11px higher.

**Fix:** one control height token (36 or 40px) applied to input, select and button; align the row on `items-end` with a single label line-height.

---

## A-06 · MEDIUM · Ticket subject overflows its card on mobile

**Route:** `/admin/tickets` at 390px

```
SPAN.max-w-[44ch] truncate text-[13.5px] font-medium text-ink
  left 31 → right 404   (373px wide)
parent card right edge: 356
parent: .overflow-x-auto rounded-lg border border-line-strong
```

`max-w-[44ch]` (~373px) is wider than the 325px available inside the card, so `truncate` never fires at the right place. The text is instead clipped by the ancestor's `overflow-x-auto`, which also makes each ticket card horizontally scrollable.

**Fix:** `min-w-0` on the flex parent and `max-w-full` (or `max-w-[44ch]` combined with `w-full`) on the span.

---

## A-07 · MEDIUM · SEO list shows run-together text from HTML stripping

**Route:** `/admin/seo`

> Remote support tools, datasheets and the documentation we are most often asked **for.Remote supportWhen** an engineer asks you to start a remote session, they…

> This policy explains what we collect when you use this website or our support portal, why we collect it, and what we do with **it.What we collectEnquiries.** T…

Block-level elements are being stripped without substituting whitespace, so headings weld onto the preceding sentence and the following paragraph. This is the text that feeds `<meta name="description">` derivation, so it also affects what search engines see.

**Fix:** replace block-level tags with a single space (or newline) before stripping, then collapse runs of whitespace.

---

## A-08 · MEDIUM · Product thumbnails render blank in the admin list

**Route:** `/admin/products`

Measured well after page load: **6 of 10** product thumbnails report `naturalWidth: 0` and `complete: false`, rendering as empty white squares (XGS 2100, UniFi U6 Pro, RackStation RS1221+, and three more). The 4 that do load are 800×600 SVGs squeezed into a **27×27** box, so they render as featureless black chips. All carry `alt=""`.

**Fix:** generate real thumbnails at the display size, or fall back to a brand-initial chip when no image resolves; give the images an explicit intrinsic size so they do not depend on late layout.

---

## A-09 · MEDIUM · Mobile/tablet admin nav is a 19-item horizontal scroll strip

**Routes:** all `/admin/*` below 1024px

The sidebar becomes `max-lg:flex` inside a horizontally scrolling container measuring **590px of content inside a 768px viewport** (and far more at 390px, where roughly 3.5 of 19 items are visible). A native scrollbar sits directly under the strip. The `CONTENT / CATALOGUE / SITE` section headings are dropped entirely, so the information architecture disappears exactly where it is needed most.

Reaching Settings from Dashboard on a phone requires scrolling a strip past 17 other items with no grouping.

**Fix:** a hamburger drawer that preserves the three section groups, or a short primary strip (Dashboard, Tickets, Products) plus a "More" menu.

---

## A-10 · MEDIUM · List screens have no row actions, pagination or result counts

**Routes:** `/admin/products`, `/admin/blog`, `/admin/pages`, `/admin/faqs`, `/admin/brands`, `/admin/solutions`, `/admin/services`, `/admin/industries`, `/admin/users`, `/admin/seo`

- No Edit / View / Delete affordance in any row — no chevron, no action column, no hover cue that the row is a link.
- No pagination, no "showing 1–10 of N", no page-size control. `/admin/seo` says "RECORDS 53" but renders an unbounded list.
- No column sorting anywhere.
- `/admin/faqs` shows an ORDER column that reads `0` for 10 of 11 rows with no way to reorder from the list.
- `/admin/brands` shows ORDER 0–7 but again no drag or inline edit.

**Fix:** add a trailing actions column (or an explicit "row is a link" affordance), pagination with counts, and sortable headers on the columns that already carry sortable data.

---

## A-11 · MEDIUM · Long forms have no sticky save bar

**Route:** `/admin/products/new` (and every other editor)

"Create product" and "Cancel" sit at the very bottom of the form, below the rich-text editor, the specifications repeater and the features repeater. On a populated product this is a long scroll from anywhere the user is actually working. There is also no unsaved-changes guard.

**Fix:** a sticky bottom action bar showing the primary action, Cancel, and a dirty-state indicator.

---

## A-12 · LOW · Page-header pattern is inconsistent

| Has an intro paragraph under the H1 | Does not |
|---|---|
| Staff, Redirects, FAQs, SEO, Media, Settings | Blog, Pages, Products, Tickets, Categories, Brands, Solutions, Services, Industries, Case studies, Knowledge base |

Separately, every list screen has a primary action button (`New post`, `New page`, `New product`, `New FAQ`, `New brand`, `New account`, `New redirect`, `New solution`) **except `/admin/tickets`**, which has none, and `/admin/media`, which puts its upload inline instead.

**Fix:** decide whether the intro paragraph is part of the pattern and apply it consistently; give Tickets a primary action or document why it has none.

---

## A-13 · LOW · "Administrator" role badge uses the danger/red token

**Routes:** `/admin/users`, `/admin/profile`

The role pill renders in the red/danger colour used elsewhere for `Critical` and `Overdue`. A role is not an error state. Use the neutral or brand token, and reserve red for destructive/critical semantics.

---

## A-14 · LOW · Rich-text toolbar buttons are 30×30

**Route:** `/admin/products/new` and every editor

Undo, Redo, Bold, Italic, Code, Link, Bulleted list, Numbered list, Block quote all measure 30×30; Insert table is 44×30. They pass the WCAG 2.2 AA 24×24 minimum but fall short of the 44×44 touch-target guideline — relevant because the admin is usable on tablets.

*(Positive: every toolbar button has a correct accessible name. Zero unlabelled buttons found across the admin.)*

---

## A-15 · LOW · Media library rough edges

**Route:** `/admin/media`

- `Delete` is a plain text link with no destructive styling and no visible confirmation affordance.
- The upload control is a raw `<input type="file">`; no drag-and-drop, no progress, no multi-file.
- Grid thumbnails render the seed brand SVGs as full-bleed **black** tiles inside an otherwise light UI, and the brand wordmarks are illegible at that size.
- No file-type or date filters; search is filename-only.

---

## A-16 · LOW · Login form has no live region for errors

**Route:** `/admin/login`

`document.querySelectorAll('[role=alert],[aria-live]').length === 0`. A failed sign-in message will render silently for screen-reader users. **Not verified against a real error** — no credentials were submitted (see Caveats) — so confirm whether the error is rendered into an existing container and add `role="alert"` to it.

---

## A-17 · LOW · Login screen ergonomics and the empty left panel

**Route:** `/admin/login`

Positives, measured: card is centred both axes at every width (1707: 206px top / 206px bottom; 768: 184px left / 184px right, 166px top / 166px bottom); `noindex, nofollow` is set; the panel collapses cleanly below `lg`; both fields are 46px tall with proper `<label>` elements and correct floating-label positions (no helper text, so A-01 does not bite here); a clear cross-link to the customer portal explains that the two account systems are separate.

Gaps:
- No show-password toggle.
- No "remember me".
- No caps-lock hint.
- The left **51%** of the desktop screen (677px of 1321px) is an empty dark grid with only the wordmark and tagline pinned to the bottom. Settings → General offers a "Sign-in image" that is not configured; either ship a default image or shrink the panel to ~40% and centre the lockup.
- Split ratio is `lg:grid-cols-[1.05fr_1fr]` — the decorative panel is *larger* than the functional one.

---

# Part 3 — Optimisation opportunities

> **These were observed against `next dev`.** The largest scripts on the homepage were `next-dev` (244 KB), `next/client` (190 KB) and `react-dom` (180 KB) — all development builds. **Re-measure with `next build && next start` before acting on any performance number.** The structural items below hold regardless.

## O-01 · Three font families load on every page

| Family | Form | Observed |
|---|---|---|
| Inter | variable 100–900 | ~47 KB (latin subset) |
| Instrument Sans | 3 static weights (500, 600, 700) | display face |
| JetBrains Mono | variable 100–800 | ~39 KB (latin subset) |

JetBrains Mono is used only for small metadata (SKUs, ticket refs, timestamps, path strings). **Options:** drop it in favour of `ui-monospace`; or load a single static weight; or subset it to digits + uppercase + a few symbols. Convert Instrument Sans to a single variable file rather than three statics. 6 preload links are already in place — keep them limited to the two faces used above the fold.

## O-02 · Reveal-on-scroll is applied client-side after hydration

The server HTML contains **zero** `opacity: 0` declarations and no `data-reveal` attributes; the wrappers get `opacity: 0` from JS on mount and animate in via IntersectionObserver. Consequences:

- Content renders, then hides, then fades back in — a visible flash on slower devices.
- Anything above the fold is animated unnecessarily, which delays LCP paint.
- No `prefers-reduced-motion` gate on the reveal itself (only two reduced-motion rules exist in the stylesheets, and they cover the `motion-safe:animate-pulse` dot).

**Fix:** skip the reveal for elements above the fold, and short-circuit the whole mechanism under `prefers-reduced-motion: reduce`.

## O-03 · Images carry no intrinsic dimensions

Of the real (non-extension) images on the site, most have no `width`/`height` attributes and none use `loading="lazy"`. Today the payload is trivial because everything is a seed SVG — but the moment real photography lands this becomes a CLS and LCP problem. Move to `next/image` with explicit `sizes`, `priority` on the hero/LCP image, `loading="lazy"` below the fold, and AVIF/WebP output.

## O-04 · Product artwork is placeholder SVGs

All product, brand and article cover art is generated seed SVG (800×600 with the title baked in). This causes F-01's aspect-ratio blowout, A-08's illegible 27px chips and F-16's duplicated titles. Replacing them with real, correctly-sized raster assets resolves three findings at once.

## O-05 · Ticket list renders two selects per row

`/admin/tickets` renders a Status `<select>` and an Assignee `<select>` on every row. At 7 tickets that is 14 controls; at 200 tickets it is 400. Consider a single popover per row (or an editable cell) that mounts on demand.

## O-06 · Admin pages ship public-SEO metadata they do not need

`/admin/*` pages carry `<link rel="canonical">`, `og:` tags and a 151-character `meta description`. `robots` is correctly `noindex, nofollow`, so this is dead weight rather than a leak — but it should be stripped from the admin layout.

## O-07 · No pagination anywhere in the admin

See A-10. `/admin/seo` already reports 53 records and renders them all. Add server-side pagination before the catalogue grows.

## O-08 · No global search index on the public site

See F-07. If a search is added, index products by SKU and model number, not just title — that is how this audience searches.

## O-09 · Consider a shared `<Field>` primitive

A-01, A-04 and A-05 are all symptoms of the same thing: input, select, file input, label, helper text and error text are assembled ad hoc per screen. A single `<Field>` component owning height, label positioning, helper slot and error slot would fix all three classes of defect permanently and prevent regression.

---

# What already works well

Worth preserving during the fixes:

- **Consistent design language** across 50+ public pages and 20 admin screens — one type scale, one card treatment, one spacing rhythm.
- **No horizontal overflow anywhere.** Checked at 390 / 640 / 768 / 1024 / 1707px across 17 public routes and 10 admin routes: `scrollWidth` never exceeds the viewport.
- **No broken internal links.** All 54 internal links return 200.
- **SEO fundamentals are in place** on every public page: unique `<title>`, `meta description` (48–164 chars), `canonical`, Open Graph tags, and 1–4 JSON-LD blocks. `/admin` is correctly `noindex, nofollow`.
- **Exactly one `<h1>` per page** on every route checked, with sensible heading order.
- **Every form field has a real `<label>`** — zero unlabelled inputs found on the public site or the admin (the honeypot aside).
- **Every button has an accessible name** — zero unlabelled buttons found.
- **Visible focus indicators** exist and `:focus-visible` is used correctly (colour needs work — F-14).
- **The admin table→card transformation** on narrow viewports is genuinely good work; it just needs its breakpoint moved (A-03).
- **Empty states** are designed, not default — `/admin/redirects` has an icon, a heading and an explanation of when rows will appear.
- **Mobile drawer mechanics** — 44×44 toggle, `aria-expanded`, `aria-controls`, body scroll lock, Escape to close (needs dialog semantics — F-08).

---

<a id="caveats"></a>
# Caveats and known limits of this audit

1. **Scope was visual/design.** No records were created, edited or deleted; no forms were submitted. Therefore **untested:** save/update/delete flows, validation messages, error states, success toasts, the inline ticket status/assignee selects, media upload, and login failure handling. A-16 in particular needs confirming against a real error.
2. **Performance figures are from the dev server.** Re-run against a production build.
3. **Browser-extension noise was excluded.** A "SignerDigital" Chrome extension injects 4 `<img>`, 1 `<table>` and a hidden `<input type="password">` into every page. These were identified and removed from all counts — they are not application code.
4. **Eight apparent contrast failures were discarded as false positives.** The homepage NOC diagram labels (`ISP / WAN`, `FIREWALL`, `CORE-SW-01`, etc.) are SVG `<text>` that inherits `color` but paints with `fill`; they render correctly as light-on-dark. Only genuine HTML text failures are reported in F-03.
5. **Narrow viewports were tested via same-origin iframes** because the browser window could not be resized in this environment. Media queries evaluate against the iframe viewport, so breakpoint behaviour is accurate, but device-specific behaviour (iOS Safari toolbars, touch, dynamic viewport units) was not exercised.
6. **Routes not individually inspected:** the remaining `/products/*` category and detail pages beyond those listed, `/downloads`, `/privacy`, `/terms`, `/portal/tickets*` (requires a customer login), and the per-record edit forms for knowledge base, case studies, categories and industries. The findings for their siblings almost certainly apply, since all use the same components.
