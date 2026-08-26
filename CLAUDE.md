# Technoware

Marketing site, customer support portal and REST API for a hardware and network
solution provider. Monorepo, deployed to Plesk as two domains.

```
www.technoware.in          api.technoware.in
      │                          │
   Next.js  ──── REST /api/v1 ──── Laravel ──── MySQL 8
```

The frontend never touches MySQL. Every read and write goes through the API.

| Path | What |
|---|---|
| `api/` | Laravel 12, PHP 8.3+, Sanctum, MySQL 8 |
| `web/` | Next.js 16, TypeScript, App Router, Tailwind **v4** |
| `design/` | Static HTML mockup + design-system reference. Not built, not deployed. Open in a browser. |

---

## Where the project stands

See **`PROGRESS.md`** for the maintained checklist. Short version: all four
phases are done and verified in a browser — the public site, the customer
portal, the ticket/RBAC domain, the admin console and email notifications.

Ten entities have full CRUD (blog, knowledge base, case studies, solutions,
services, industries, pages, products, brands, product categories), alongside
FAQs, the media library, redirects, an SEO overview, staff accounts, **portal
customers and their approval queue**, and site settings. Everything the public site renders is editable from the console,
including the homepage hero and its statistics.

What remains before launch is content and configuration, not code: see
"Known risks and placeholders" below.

Work lands on `phase-3-admin-cms` and is merged to `main` once it is green.
`main` is the branch Plesk deploys, so nothing reaches it that has not
passed the audits in "Definition of done" — merge it, do not push to it.

---

## Commands

```bash
# --- API (run from api/) ---
php artisan serve                    # http://localhost:8000
php artisan migrate:fresh --seed     # WIPES the database; safe only pre-launch
php artisan technoware:customer you@example.in --name="Name"   # create a portal login
php artisan storage:link             # once; media uploads 404 without it
php artisan test                     # HtmlSanitiser unit tests
./vendor/bin/pint                    # formatter

# --- Frontend (run from web/) ---
npm run dev                          # http://localhost:3000
npm run build
npm run lint
npx tsc --noEmit
npm run mock                         # mock API on :8899
npm run audit                        # browser audit — see "Definition of done"
npm run audit:mobile                 # strict phone audit at 320/360/390/414
```

Frontend without the backend running:

```bash
npm run mock &
API_BASE_URL=http://127.0.0.1:8899 npm run dev
```

`mock-api.mjs` implements the same `/api/v1` contract as Laravel. **If you
change an API response shape, change the mock too.** CI builds against it, so
drift breaks the build instead of production — that is the point of it.

---

## Environment

Development is on **Windows**; deployment is Linux under Plesk.

- **PowerShell 5.1 does not support `&&`.** Put commands on separate lines.
- PHP/MySQL/Composer come from Laragon.
- `.gitattributes` pins `artisan`, `*.php` and `*.sh` to LF. Without it they
  fail on the server with `bad interpreter: /usr/bin/env php^M`.

---

## Things that will bite you

**`npm run build` requires a reachable API.** Index pages are prerendered. A
build that cannot reach the API deliberately *fails* (`web/src/lib/build-phase.ts`)
rather than baking "We could not load…" into static HTML for Google to crawl.
Set `API_BASE_URL` in the **build** environment, not just at runtime. At runtime
the same failure degrades gracefully and the site stays up.

**Scroll reveals are `data-aos` attributes, not a library.** Tag a section
`data-aos="fade-up"`; `components/ui/reveal.tsx` observes it. Two rules the
CSS in `globals.css` depends on and that are easy to break:
*translate vertically only* — nothing clips overflow, so a horizontal
translate fails the audit's zero-tolerance overflow check on most routes —
and *the hidden start state must never carry a transition*, or content
visibly fades **out** before it can fade in. The whole thing is scoped under
`html[data-aos-ready]`, set by JS after hydration, so no-JS and
reduced-motion users get the content unhidden and static.

**Tailwind v4 translate utilities set the CSS `translate` property, not
`transform`.** So `transition-transform` on a `translate-x-full` panel
animates nothing and it simply appears — which is exactly what happened to the
mobile drawer until the computed value was measured mid-flight instead of the
class name being trusted. Transition `translate`.

**A transitioning element cannot take focus on the first frame.** The
drawer transitions `visibility` over 300ms, and at progress zero the computed
value is still `hidden` — so `.focus()` on something inside it silently does
nothing and `document.activeElement` never changes. It looks exactly like a
broken ref. `site-header.tsx` waits on rAF until the element reports
`visibility: visible`, bounded at 30 frames.

**The mobile drawer stays mounted and is shown by class.** `{open && …}` has
nothing to transition on the way out. `visibility` is in both transitions
deliberately: CSS flips it to `visible` immediately on the way in and holds it
until the transition ends on the way out, so the panel is still painted while
it slides away — and while closed it is what keeps the off-screen
`translate-x-full` out of `documentElement.scrollWidth`, which is the
zero-tolerance overflow check. `inert` is the other half; `opacity-0` alone
leaves every link focusable.

**Dev at `localhost:3000`, not `127.0.0.1:3000`** — or set
`allowedDevOrigins` (already done in `next.config.ts`). `next dev` 403s its
own JS chunks when the Origin host is one it does not recognise, which
serves a page whose client bundle never loads: no hydration, and nothing in
the UI to say so.

**The admin nav is an accordion, and only one section is ever open.** That
is enforced by storing *which* section is open (`string | null`) rather than
which are open — a set would make "one at a time" something every toggle has
to remember. `admin-nav.tsx`. Section panels use the `hidden` attribute; the
mobile drawer cannot, because **Tailwind v4's preflight declares
`[hidden] { display: none !important }`**, so a responsive `lg:block` can
never win it back. Anything that must reappear at a breakpoint needs the
`hidden` *class*, not the attribute.

**The mobile legibility floor lives in `globals.css`, not in components.**
A `@media (width < 40rem)` block near the bottom of the file lifts every form
control to 16px — iOS Safari zooms the page when you focus anything smaller,
and does not zoom back — and lifts a fixed list of sub-12px arbitrary text
utilities to 12px. It is unlayered, which is how it beats Tailwind's
`@layer utilities` without `!important`. Two consequences: a **new** arbitrary
size below 12px is not covered automatically (that is what
`npm run audit:mobile` is for), and a control with a **fixed** width will
truncate once its text grows — that is what broke the ticket row's
`w-[112px]` selects.

**The public site has a 12px type floor; the console does not.** The
homepage ran 30 elements under 12px at 1440px — status chips at 10.5px, every
piece of mono metadata at 11.5px. The lift is an unlayered rule in
`globals.css` scoped to `.public-site`, a class set by `(marketing)/layout.tsx`
on a wrapper that exists only to carry it. The console keeps the denser scale
deliberately — it is a tool worked at a desk for hours, and the rows that
density buys are the point — and its phone floor is the `width < 40rem` block,
which still covers everything. **A class still reading `text-[10.5px]` is not
a mistake**: that is the size it renders at outside `.public-site`.

**The audit waits for the network to go quiet before it measures.** Against
`next dev` a route's CSS arrives as chunks load, so a computed style read too
early is the *previous* stylesheet's answer — the 404 page's cards measured
pure white while `data-scheme` already said dark, and the run reported fourteen
contrast failures against a page that is flawless in a build. `settle()` waits
for `networkidle` and then for two identical style samples. **A contrast
failure that will not reproduce against `npm run start` is this, not a bug.**

**`--color-err` does two jobs and `--color-err-fill` is the second one.** It is
coloured *text* on a panel — alerts, badges, dashboard figures — so in dark it
inverts to a light pink, and white text on light pink is 2.4:1. That was every
Delete button in the console. Same split, same reasoning as
`--color-brand-ink`: in light the two are the same value, in dark they cannot
be. `bg-err` is now a mistake; use `bg-err-fill` under white text.

**A log line an operator needs must clear the shipped `LOG_LEVEL`.** Both
`.env` and `.env.example` ship `LOG_LEVEL=warning`, so `logger()->info(...)` is
discarded — which is what was happening to the password-reset audit record
while its own comment claimed an operator could read it. The two endpoints that
answer identically whatever happens (password reset, and registering with a
known address) log at `warning` for that reason: the response is deliberately
uninformative, so the log is the only trace there is.

**A customer account has a lifecycle, not a switch.** `customers.status` is
`pending` / `active` / `rejected` / `suspended` (`App\Enums\CustomerStatus`),
and **only `active` may sign in**. It replaced `is_active`, which could not
tell "waiting for a human" from "switched off by a human" — two states that
want opposite words in front of whoever is at the sign-in form. Dropping that
column broke `EnsureUserIsCustomer`, which still read it: the missing attribute
evaluated as false and *every* authenticated portal request 403'd. The
middleware and the login now both call `canSignIn()`, so there is one answer to
"may this account be here".

**The registration endpoint must never reveal whether an address exists.** New,
already-registered and honeypot-tripped all return the same 202 and the same
sentence. Anything else turns the form into a membership oracle — submit
addresses, read which come back "already taken", and you have a list of this
company's customers, which for a support portal is a list worth phishing. The
real account holder is told by email instead; they are the only party entitled
to know. `tests/Unit`-style coverage for this is in
`tests/Feature/CustomerRegistrationTest.php`, which asserts the two responses
are byte-identical rather than merely both successful.

**A login refused on status returns 403 with a `reason`, and the frontend
branches on that, never on the message.** `email_unverified` gets a resend
button; `pending_approval` gets an info panel with nothing to press, because
there is nothing the person can do. A message string is written to be read by a
person and will be reworded; a screen that changes shape when somebody fixes a
typo in a sentence is a screen nobody can maintain. `ApiError` carries `reason`
for this.

**Do not put `email:dns` on a public form.** It is a DNS lookup on the request
path, and this project has already measured what an uncontrolled network call
there costs: an unreachable SMTP host took a contact-form submission from 0.2s
to 12.5s. It also buys little, because the confirmation email is a far stronger
proof that an address exists than an MX record.

**An admin action whose button is conditional on the status it changes cannot
report success into its own component.** `revalidatePath` re-renders, the
status is now `active`, the pending-only button unmounts, and the success
message goes with it — the first browser run approved an account and reported
nothing at all. Those actions `redirect(...?done=…)` and the page renders the
outcome from the URL. *Failure* still returns into the component, because a
failure changes no status and keeps the button mounted, which is where the
error belongs.

**Settings are strings, so read booleans through `settingEnabled()`.** `"0"` is
truthy in JavaScript, so `if (settings.registration_enabled)` is true for a
toggle that is switched *off*. `lib/site-settings.ts`.

**Alerts, badges and error states take their colours from tokens, never
literals.** All three paired an inverting `*-soft` background with hexes picked
for the light palette, so in dark every alert in the console and the portal was
dark maroon text on a near-black panel — 1.53:1. It survived every audit for
months because **the contrast check only measures what is on the page**, and no
audited route rendered an alert by default. Borders are now the same token at
`/25` alpha so they cannot drift from the text again. The literals still in
`noc-panel.tsx`, `sections.tsx` and `cta-band.tsx` are correct: those sit on
dark bands that stay dark in both schemes.

**An icon name in `iconMap` is a value stored in MySQL.** `solutions.icon`,
`services.icon` and `product_categories.icon` hold the key, so adding one is
free and renaming or removing one silently blanks the icon on every record
pointing at it. Forty-one of the 88 are borrowed from Lucide through
`fromLucide`, which spreads the shared `base` so they carry this set's 1.7
stroke instead of Lucide's 2 — mixed weights in one grid read as sloppy before
anyone can say why. They are registered under *this project's* names, not
Lucide's, so a rename upstream is not a data migration here. Do not re-export
the library wholesale: an editor handed 1,600 icons cannot find any of them.

**The media library's right-click menu is not the only way in.** Every tile
and folder also carries a visible ⋯ button opening the same menu — right-click
alone is unreachable on touch and by keyboard, and this console is gated on
audits that would fail it. `media/item-menu.tsx`.

**Uploads are multi-file and drag-and-drop, and both go through one
`UploadProvider`.** The toolbar's file input and the drop zone over the grid
sit in different parts of the tree, so the shared state is context rather than
two copies — otherwise dropping files reports in one place and choosing them
reports in another. Files upload **one at a time**: a server action per file
also revalidates the page, and twenty at once makes the count meaningless and
hides which one failed. The drop zone counts dragenter/dragleave depth, since
both fire again for every child crossed, and it must `preventDefault` on
dragover or the browser opens the file and navigates out of the console.

**Resize is raster-only, and the UI says so before the request.** GD cannot
scale a vector, so the API returns 422 for an SVG and the menu item is
disabled with the reason in its `title`. All 33 seeded images are SVG, so this
is the common case here, not the corner one.

**Image alt text is a property of the file, not of the page using it.**
It is written once in the media library ("Edit details") and resolved by path
through `App\Support\MediaAlt`, which memoises one `path => alt_text` map per
request. Four public resources expose it — `cover_image_alt`, `hero_image_alt`,
`image_alts` — and the frontend falls back to a derived name only where one
would actually help a reader. **A new `<img>` on a CMS-driven image should read
that field, not invent a string from the record's title**: a name is not a
description of the picture, and every duplicate of it is one more place to
change when the real photography lands.

**Deleting a media folder does not delete its files** — `folder_id` is
`nullOnDelete` and they move to Unfiled. The confirmation dialog says so,
because "Delete folder" reads like it takes the contents with it.

**Admin form buttons go in `FormActions`.** It pins the row to the bottom of
the viewport while the form is taller than the screen — on a populated product
the buttons sat below the editor and two repeaters — and warns before a
refresh discards a half-filled form. That warning cannot see an in-app
navigation: `beforeunload` does not fire for a client-side route change, so a
sidebar click still discards without asking.

**`Pagination` renders a count even when there is one page.** It used to
return null, which took the record count away with the pager — and one page is
exactly when nothing else on the screen answers "how many are there?". It also
carries the per-page control, whose options stop at 100 because every admin
index caps `per_page` at 100 — a "200 per page" option would hand back 100 rows
under a label claiming 200. A list screen must pass `per_page` into both its
getter and `Pagination`'s `params`, or the choice is forgotten on the next
page.

**Every admin screen's title goes through `PageHeader`.** It owns the `h1`,
the back link, the intro paragraph and the row they share — 46 screens used to
hand-roll that in five different class combinations, and the component existed
unused the whole time, exactly as `FilterBar` did. Chrome that shares the
title's row is passed as **children** rather than as `meta`/`actions` props:
the row is a flex container and the caller already says which side a thing
belongs on by whether it carries `ml-auto`.

The intro paragraph is not on every screen and should not be — it appears
where a screen does something non-obvious (Settings, SEO, Media, Staff,
Redirects, FAQs, Tickets, Profile) and nowhere else. `/admin/tickets/[reference]`
is the one screen still building its own header: the reference and its badges
sit *above* the subject, which `PageHeader` has no slot for, and adding one
used exactly once would be worse than the exception.

**Admin list screens must use `FilterBar`/`FilterField`, not their own
`<form>`.** All sixteen used to hand-roll the identical form element and size
their own controls, so one row held a 32px select, a 34px input and a 44px
button on three baselines at three font sizes. `FilterBar` carries the
`admin-filters` class and `globals.css` normalises every control inside it to
one height — that rule is guarded to `>= 40rem` on purpose, because the mobile
block lifts controls to 16px and both are unlayered, so an unguarded 13px here
would silently undo the iOS zoom fix.

**Reading a focus ring immediately after Tab measures a transition, not a
rule.** `transition-all` on the button primitive includes `outline-color`, so a
computed style read on the same tick returns a colour part-way to the target —
which is how the two-tone focus ring was twice recorded as "not applying to
`<button>`" when it always did. Wait out the 200ms, or ask Chrome which rules
matched (`CSS.getMatchedStylesForNode`) rather than what the value currently
is. Inputs are the deliberate exception: `focus:outline-none` in the shared
`field` class suppresses the outline so the brand-100 glow is the only ring.

**Every password input goes through `PasswordField`.** It carries the
reveal toggle and the Caps Lock warning, and a password field is the one input
that gives no feedback about what you typed — while five failures lock the
account out. The warning uses `Field`'s `note` prop, which mounts an empty
`role="status"` paragraph as soon as `note` is *defined*: a live region
rendered with its message already inside it is not an update, so nothing is
announced. `note=""` is how a field arms the region ahead of time.

**Two utilities writing the same CSS property means one of them is dead.** The
sign-in panel set `bg-linear-135 from-brand-900 to-brand-700` *and* an
arbitrary `[background-image:…]` grid, so the brand gradient never rendered
and the panel was the parent's near-black. Both layers now live in one
`background-image`, with a `background-size` value per layer — a single pair
would tile the gradient along with the grid.

**Every `<select>` and file input goes through the primitives.** `Select` and
`FileInput` in `components/ui/input.tsx`. A raw `<select>` renders with the OS
appearance and no chevron; a raw `type="file"` renders an unstyled "Choose
file" — the Settings General tab showed three in a row.

**Admin list tables have three layouts, not two.** Cards below `md`,
table with the `min-w-[NNNpx]` floor released between `md` and `xl`, and the
floor honoured at `xl`. That middle band exists because the floors are wider
than the space available — and 1024px is *worse* than 900px, since the
sidebar appears at `lg` and takes the content area from 810px to 710px. The
last column was clipped by up to 210px, contained by `overflow-x-auto` so
nothing flagged it.

**A `max-w-[..ch]` on a `truncate`d cell sets the column's floor.** A
max-width clamps an element's min-content contribution but never lets it fall
below, so the ticket subject's flat `max-w-[44ch]` held that column at 407px
however narrow the screen. `min-w-0` alone does not help and `max-w-full` is
worse — it resolves against an auto-width parent, which is no cap at all. The
cap has to *scale* with the room. Tickets also hides Category and Due between
`md` and `xl`: its two inline selects need ~205px each to show "Pending
customer", and five columns plus those do not fit 691px.

**Admin list tables become cards on a phone**, via `.admin-table` plus a
`data-label` on every `<td>`. The wrapper's `overflow-x-auto` means a 760px
table never overflows the page, so it passes every check while being unusable
— you read it through a 360px window, scrolling sideways once per row. If you
add a column to one of the fifteen list screens, add its `data-label` too, or
that cell renders unlabelled on mobile.

**Light, dark and system, keyed on `data-scheme` set before first paint.** A
blocking inline script in the root layout reads `tw_scheme` from localStorage
and falls back to `prefers-color-scheme`; anything later — an effect, a
deferred module — paints the wrong scheme first, and a white flash on every
cold load is worse than not offering dark. Both palettes are emitted in one
inline `<style>`, dark second, because `:root` and `:root[data-scheme="dark"]`
have equal specificity and the winner is source order.

**A token that inverts cannot be paired with a literal colour.** Three things
broke on that: `body { background: #fff }` was a literal, so in dark every
token flipped except the canvas behind them — 31 failures on the homepage from
one declaration, now `var(--color-page)`. `bg-ink text-white` and the `onDark`
button's `bg-card` both assumed which side was light. And the status tokens
(`err`, `ok`, `warn`, `info`) are chosen to read on white, so they get their
own `:root[data-scheme="dark"]` block.

**`--color-brand-ink` exists because `brand-600` was doing two jobs.** It was
both a fill under white text and coloured text on the page. In light both want
the same value; in dark they want opposite ones, and no single token can be
both — the version of dark mode that ships without this split is the one where
every link is invisible. `brand-600` stayed the fill; 91 `text-brand-600/700`
became `text-brand-ink`, which in dark takes the theme's 300 step.

**`npm run themes` checks 20 palettes, not 10** — every theme in both schemes.
Passing it is necessary, not sufficient: `AUDIT_SCHEME=dark npm run audit` runs
the browser audit against the dark palette, and that is what caught the canvas
and the status tokens.

**Ten themes, and `lib/themes.ts` is the only other place a hex may live.**
A theme overrides the same `@theme` custom properties `globals.css` declares,
emitted inline on `:root` by the root layout, so every existing `bg-brand-600`
picks it up without a component changing. The setting is `appearance.theme`,
public because the frontend cannot paint the page without it, and an unknown
value falls back to the default rather than half-applying.

**A theme is not shippable until `npm run themes` passes.** The audit fails the
build on any WCAG AA failure, so eighteen text-on-background pairings are
checked for all ten before a browser ever sees them — that gate caught Fiber
Teal's `faint` at 4.41:1 while the colour was being chosen. Passing it is
necessary, not sufficient: the real audit is then run under each theme, because
only a browser composites alpha overlays.

**`preload: false` on every theme face is what keeps ten themes costing what
one costs.** next/font preloads each declared family by default and all nine
variables sit on `<html>`, so the browser fetched all nine whatever the active
theme — measured at 11 font files on one homepage. Unpreloaded, a face is
fetched only when something is set in it: three families on the wire, and the
display one swaps with the theme.

**Tailwind is v4 — CSS-first.** Tokens live in `web/src/app/globals.css` under
`@theme`. There is no `tailwind.config.ts` and there should not be. The v3-style
config in `design/design-system.html` is superseded.

**The type roles live in `@layer components`, not `@layer utilities`.**
`display-1/2/3` and `lede` in `globals.css`. `.lede` sets a `color`, and while
it sat in the utilities layer — defined after Tailwind's own — it won on
source order against every `text-*` colour utility beside it. So
`className="lede text-dark-muted"` silently rendered in the light
`--color-muted`: the homepage support band was 2.55:1 on a near-black panel.
In the components layer any utility beats them, which is what those class
lists already read like. Nothing combines them with a size or weight utility
today; if you add one, it will now win.

**Instrument Sans ships two weights, and a third must be added back
deliberately.** 600 and 700 only. CSS font matching resolves `font-medium` to
the 600 face without complaint, so a 500 will *look* like it worked while
shipping nothing — if a real 500 is wanted, vendor the file. The weight was
dropped because exactly one element on the whole site used it.

**One image on the site has no fixed-height well: the case-study cover.**
Every other cover and thumbnail sits in an `h-40`/`h-44`/`h-56` box, so a slow
image cannot move anything. That one is full-width, and it carries
`aspect-[1200/630]` for the same reason — the ratio the cover generator
produces and the one og:image wants.

**Two colours fail WCAG AA while looking perfectly fine:**
- `--color-brand-500` (#6f8641) is 4.07:1 on white. Use `--color-brand-600`
  (7.53:1) for coloured **text**; brand-500 is for fills only.
- `--color-warn` was #a9711a (3.83:1 on `--color-warn-soft`), now #8a5c10.
  Do not revert it.

**A morph map is enforced** (`AppServiceProvider`). Polymorphic rows store
`"product"`, not `App\Models\Product`. So: register any new polymorphic model
there; **never** compare `$model->author_type === Foo::class` (use `instanceof`);
set the relation with `->associate()`, never by assigning `*_type` by hand.

**`Model::preventLazyLoading` is on outside production.** Eager-load everything
an API Resource serialises or it throws.

**A heredoc interpolates variables and nothing else.** `{self::BRAND_900}`
was written into every generated placeholder image verbatim, so the gradient
had invalid stop colours and all 33 rendered as black rectangles — art that
reads as broken rather than as a placeholder. `PlaceholderImage` assigns the
constants to locals first. Regenerating is a re-run of the seeders, except the
brand logos: `DemoContentSeeder` only fills a blank `logo_path`, deliberately,
so a real logo survives a re-seed.

**Never ISR-cache a user's search query.** `publicApi.products()` and
`publicApi.knowledgeArticles()` take a `cache` flag — pass `false` when `q` is
present. Caching search fills the cache with single-use entries and serves a
stale empty result for the whole revalidate window.

**Portal auth guard is on `web/src/app/portal/(app)/layout.tsx`.**
`portal/login/` sits *outside* that route group deliberately — guarding it too
would redirect to itself forever.

**Slugs are the URL contract.** `CatalogueSeeder` sets every slug explicitly,
because `Str::slug` produced `enterprise-wi-fi` and `it-infrastructure-amc`
while the frontend linked to `enterprise-wifi` and `amc`. Eight of nine were
wrong and the sitemap was publishing URLs that 404'd. Changing a slug now means
adding a redirect — the `redirects` table and `web/src/proxy.ts` handle it.

**`/products/[slug]` resolves to a category *or* a product.** The brief requires
both `/products/switches` and `/products/cisco-cbs350-24t-4g` under one segment.
See `products/[slug]/resolve.ts` — category endpoint first, product second.

**Knowledge-base search matches tags and a punctuation-stripped title**, so
"wifi" finds "Wi-Fi". See `KnowledgeArticle::scopeSearch`. Users do not type
hyphens.

**Notifications are sent inside the request, so SMTP is on the critical path.**
`config/mail.php` sets a five-second timeout for exactly that reason: measured
against an unreachable host, a contact-form submission took **12.5 seconds**
against 0.2s for a read — long enough for a visitor to press Send twice, and
long enough that a handful of concurrent submissions occupy every PHP worker
there is. Five seconds is a floor under the failure, not a fix; the fix is a
queue worker, which is a deployment change.

**A form's validation comes from its stored definition, not its payload.**
`FormValidator` builds the rules from `form_fields`. Unknown keys are dropped
rather than rejected, selects are validated against their own options, and
`website` is reserved for the honeypot — a field of that name is refused on
write, because it would silently disable the trap.

**Shortcodes are expanded into components, never into HTML.** A CMS body can
carry `[slider slug="hero"]` or `[form slug="contact"]`. `lib/shortcodes.ts` splits the *already sanitised*
HTML into segments and `ProseWithShortcodes` renders a real `<Slider>` between
them, so the slug reaches the DOM as a React prop. **Never expand a shortcode
by string substitution** — the sanitiser has already run by then, so an editor
typing `"><script>` would own every page embedding it. The attribute is
additionally restricted to slug characters, so a malformed shortcode renders as
the literal text that was typed.

**A slider has no URL, so it must not use `Sluggable`.** That trait writes a
301 on every slug change, which for a slider would point `/sliders/old` at
`/sliders/new` — two URLs that have never existed — and the proxy would
answer a real request with a redirect into a 404. `Slider` generates its own
unique slug in ten lines instead.

**CMS pages have two templates and the value is allowlisted.** `default` caps
the body at 72ch; `wide` drops the cap, for a page built around an embedded
slider or gallery. The API refuses anything else with a 422, because a template
the frontend does not know would fall back silently — a page laid out the wrong
way with nothing saying why. A slider embedded by shortcode carries no measure
of its own, so the template is what decides its width.

**Rich text is sanitised on write, in `prepareForValidation()`.** `Prose`
renders CMS bodies through `dangerouslySetInnerHTML`, so `HtmlSanitiser` is
the only thing between a content-manager account and script on every visitor's
page. A new rich-text field must be declared in the request's
`richTextFields()` or it bypasses the sanitiser entirely — and the allowlist
in `config/purifier.php` is deliberately the exact tag set `prose.tsx` styles,
so widening one without the other ships markup the site renders unstyled.
Covered by `tests/Unit/HtmlSanitiserTest.php`; add a case when you touch it.

**Rich text becomes plain text through `HtmlSanitiser::toText()`, never
`strip_tags`.** `strip_tags` deletes a tag without leaving anything in its
place, so the end of one block runs into the start of the next — the
downloads page published *"…asked for.Remote supportWhen an engineer…"* as its
meta description, and that is what a search engine showed. `toText` spaces
**block** tags only: doing it for every tag breaks the other way, since
`<strong>ten</strong>ths` is one word. It feeds all nine `defaultSeo()`
descriptions and the plain-text half of the notification emails.

**JSON-LD escapes `<`, and must keep doing so.** `JsonLd` in `lib/seo.tsx`
writes `JSON.stringify(data)` into a `<script>` tag, and `JSON.stringify` does
not escape `<`. A CMS field containing `</script>` therefore closes the block
and everything after it becomes live markup — stored XSS on every visitor's
page, from any plain-text field that reaches structured data.

`HtmlSanitiser` does **not** cover this. It runs only over the fields a request
declares in `richTextFields()`; a product name or page title is a plain string,
correctly escaped by React everywhere *except* inside that script tag. Do not
"fix" it by sanitising names — escaping at the sink is the correct boundary,
and a product legitimately called `A <> B` should still work.

`npm run audit` fails on any JSON-LD block containing a literal `<`. Parsing is
not enough on its own: a breakout splits one block into two that both parse
cleanly, which is how it went unnoticed.

**MySQL JSON does not preserve object key order.** It normalises keys by
length, then lexicographically, so a spec sheet stored as a map came back as
`PoE, Ports, Uplinks, Warranty, Rack units, Switching capacity` — every
product page was rendering its specs in an order nobody chose, and reordering
them in the admin could not stick. `App\Casts\SpecSheet` stores the sheet as
an ordered **list of pairs** (JSON arrays *are* order-preserving) and hands
PHP back an ordered associative array, so the API still returns a plain
`{"Ports": "24 × 1G"}` object and the frontend never had to change. Anything
else order-sensitive that lands in a JSON column needs the same treatment —
do not reach for `'array'`.

**Marketing chrome lives in `(marketing)/layout.tsx`, not the root layout.**
It used to be in the root, which wrapped the admin console and the customer
portal in the public mega menu and footer. Each area now supplies its own
`<main id="main">` too, because the root no longer does and the skip link
targets it.

**The homepage reads the CMS, not `content/site.ts`.** Solutions, categories,
industries, case studies and posts are fetched like every other index page —
they were static, so renaming a solution changed every page except the one
people land on first. What remains in `content/site.ts` is genuinely static
page furniture: partner logos, the process diagram, AMC inclusions, the
web-services grid.

**Homepage hero copy and the statistics are settings, not code.** Group
`homepage` in the settings table, editable at `/admin/settings`. Stat rows are
`value|label`, one per line. This is what makes the invented figures on the
must-not-ship list correctable without a deploy. The logo, favicon, address,
phone number and map embed are settings too, and the frontend falls back to
the static constants in `content/site.ts` when one is unset.

**Analytics load on the public site only.** `Analytics` is mounted in
`(marketing)/layout.tsx`, not the root, so nothing is loaded inside the admin
console or the portal. Tracking staff pollutes the client's numbers, and a
tracker on a signed-in support page sends ticket URLs — which contain a
customer reference — to a third party. Each tag renders only when its ID is
set.

**Consent gates the trackers for real.** With `cookie_consent_enabled` on —
the default — `Analytics` renders nothing at all until someone accepts: no
script tags, no no-script pixels. A banner that shows while the tags load
anyway is worse than none, because it claims a consent that was never
obtained. The choice lives in `localStorage` and is read through
`useSyncExternalStore` in `lib/consent.ts`, whose server snapshot is null, so
the pre-hydration render never assumes yes. The banner is mounted only when at
least one analytics ID is configured: with none, no cookie is ever set and
asking would be theatre. **The default copy is a placeholder, not legal
advice.**

**Share images come from `app/opengraph-image.tsx`.** `buildMetadata` used to
fall back to `/og-default.png`, a file that was never added — so every index
page advertised a share image that 404'd and previews came out blank.
Generating it means there is nothing to forget to commit. A page or record
with its own image still wins.

**Two settings groups are private and must stay that way.** `mail` holds the
SMTP credentials and `integrations` holds the API key. They are excluded from
the public `/settings` whitelist, marked `is_secret`, encrypted at rest, and
never returned to the browser — the admin response says only whether a value
is set. A blank submit means "unchanged", because the form can never show the
current value; clearing one is a separate endpoint. When adding a setting, ask
which of those two lists it belongs on before adding it to the seeder.

**`lib/settings.ts` is `server-only`; the pure helpers live in
`lib/site-settings.ts`.** The header is a client component and needs
`telHref`. Importing it from the fetching module pulls `server-only` into the
client bundle and every page 500s. Types and pure functions go in the second
file; anything that fetches stays in the first.

**A map embed URL is validated against Google's host on write.** It becomes an
`iframe src` on the contact page, and an unchecked one is somebody else's page
rendered inside ours.

**Notifications must never fail a request.** Everything goes through
`App\Support\Notifier`, which logs and swallows. A ticket that is already
committed must still return 201 when the mail server is down — telling a
customer their ticket failed while it sits in the database means they send it
again. The internal-note guard is at the **call site** in the admin reply
path, not inside the notification: an engineering note reaching a customer
inbox is the worst failure this system has, and the check belongs where
anyone reading that method will see it.

**Browser tests must not mutate the seeded admin account.** The audit signs
in with `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` and only reads, which is
fine. Anything that *changes* a credential — a password-reset walkthrough, for
instance — needs its own throwaway staff account, created through
`POST /admin/staff` and deleted afterwards. Driving the real admin through a
reset changes the password on the developer's machine, and they find out the
next time they try to sign in.

**`phpunit.xml` pins `DB_DATABASE` to `technoweb_test`.** Feature tests use
`RefreshDatabase`, which drops and re-migrates whatever connection it is
given. Without that line the suite destroys the development database — it did,
once.

**The two principals must not share anything keyed on a value they both
hold.** Both password brokers pointed at `password_reset_tokens`, whose primary
key is the email address — so a token issued to a *customer* reset the *staff*
account at the same address. Verified working before the fix, and it is
privilege escalation into the admin console. Customers now have
`customer_password_reset_tokens`. This is the same shape as the id collision
between `Customer` and `User` that `EnsureUserIsCustomer` exists for.

**`staff` middleware guards the whole admin group.** `role:` already refuses a
customer token, but logout, `me` and change-your-own-password are reachable by
every role by design and each carried its own inline `instanceof User` check.
The third was added without one and a customer token could call it. One
middleware on the group cannot be forgotten; the inline checks are gone.

**CMS admin routes bind by id, not slug** (`{blog_post:id}`).
`Sluggable::getRouteKeyName()` returns `slug`, and an edit form that changes
the slug it is addressed by breaks mid-save.

**Every CMS entity form is tabbed, and no panel is ever unmounted.**
Nine forms (blog, knowledge base, case studies, pages, solutions, services,
industries, product categories, products) split into Content / Media /
Related / SEO via `components/admin/tabs.tsx`. Inactive panels are hidden with
the `hidden` attribute because they sit inside **one** form — unmounting takes
their inputs out of the DOM, and a missing checkbox reads as false. That is
the bug that used to drop posts from `sitemap.xml` when the SEO panel was
collapsed, and it is now one mistake away from doing it to four panels at once.

The other half is `components/admin/form-tabs.tsx`: a 422 landing on a hidden
panel would otherwise be invisible — "could not save", every visible field
fine. `buildFormTabs` maps Laravel's error keys (including nested `seo.title`
and `faqs.0.question`) to the owning tab, badges it, and jumps there. **A new
field must be added to its tab's `fields` list**, or its errors are silently
charged to the first tab.

**In a Server Action, `updateTag()` — not `revalidateTag()`.** `updateTag`
gives read-your-own-writes, so an editor sees the change immediately instead
of waiting out the revalidate window. (In Next 16 `revalidateTag` also takes a
second argument now, so the old one-arg call is a type error, not a silent
no-op — but reach for `updateTag` here regardless.)

---

**An icon that stands for a thing is coloured; an icon that does a job is
not.** Anything registered in `iconMap` is an *identity* icon — a solution, a
category, an industry — and renders through `IdentityIcon`, which gives it a
fluorescent hue derived from its own map key. **Adding one later needs nothing:
register it in `iconMap` and it is coloured.** Everything used directly —
`IconArrowRight`, `IconChevronDown`, `IconCheck`, `IconMenu`, `IconClose`, the
social marks — keeps `currentColor`, because an arrow inside a white-on-brand
button turning lime is a defect rather than decoration. The split is enforced
by which path renders it, not by a list anyone has to maintain.

The hues are twelve fixed tokens rather than a colour computed per name,
because a generated colour cannot be contrast-checked in advance and these
are. True neon does not survive a light surface — `#39ff14` on white is 1.4:1 —
so the *hue* is fluorescent and the lightness is whatever clears WCAG 1.4.11's
3:1: darker on light, genuinely neon on dark. `npm run neon` re-derives every
value; re-run it if the palette or the surfaces change. The worst case for a
dark icon is the **darkest** light row it can sit on (`surface-2`), not white
— getting that backwards produced a 2.98:1 icon that looked fine.

## Conventions

- Never hard-code a hex. If a colour is not in `globals.css`, it does not ship.
- `font-mono` is for data only — ticket IDs, IPs, SKUs, throughput. Never prose.
- Ticket status and priority are **PHP enums**, not lookup tables. Transition
  rules live in `TicketStatus::canTransitionTo()`.
- Ticket attachments live on the **private** disk and stream through an
  authorised controller. Never expose a public URL.
- Internal ticket notes (`is_internal`) must never reach a customer-facing
  response. The customer controller uses `publicMessages`, not `messages`.
- Commit `api/` and `web/` together — nearly every change spans both.
- Reuse the primitives in `web/src/components/ui/` (Button, Card, Badge, Input,
  Field, Alert, EmptyState, ErrorState, PageHero, Breadcrumbs, FaqList, Prose,
  SpecTable, CtaBand) rather than writing new one-off markup.

---

## Definition of done

Not a checklist to read — a command to run:

```bash
npm run dev                 # or npm run start against a build
npm run audit               # in another terminal
```

One-time setup: `npx playwright install chromium`.

`web/scripts/audit.mjs` drives a real browser over every route and fails on:

- WCAG AA contrast failures (alpha-composited backgrounds handled
  correctly, and measured against each element's **own** text — it used to
  skip anything over 140 characters, which exempted six elements on the
  homepage alone, one of them a 2.55:1 failure)
- heading-level jumps, or anything other than exactly one `<h1>`
- horizontal overflow at 1280px or 360px
- tap targets under 24px that also fail WCAG 2.2's spacing exception
- a missing canonical URL, malformed JSON-LD, or an unescaped `<` inside it

It exits non-zero, so CI can gate on it. Pass routes to check specific pages:
`node scripts/audit.mjs /admin /admin/tickets`.

**It covers the console by default when `ADMIN_LOGIN_EMAIL` /
`ADMIN_LOGIN_PASSWORD` are set, and finds record screens itself** — 80 routes
rather than 23. Detail and edit screens cannot be hard-coded, because ids come
from the seeder and change with every `migrate:fresh`, so `DISCOVER` opens each
index and takes the first row. That closed the last big hole: every CMS *edit*
form was unaudited, as was the ticket detail. An index that yields nothing says
so on the console rather than silently shrinking the run.

Three bugs lived in the gap: `Alert`/`Badge`/`ErrorState` at 1.53:1 in dark for
months, a dashboard 500, and every `destructive` button at 2.4:1 in dark across
twelve edit screens. It always *could*
sign in, but the default list was public-only, so the 24 screens behind the
login were checked only when somebody remembered to name them. Two bugs lived
in that gap: `Alert`/`Badge`/`ErrorState` shipping 1.53:1 text in dark mode for
months, and a dashboard 500 that the very next run caught. Set the credentials
before calling a run clean.

`npm run audit:mobile` is the phone half, and it is stricter: 320/360/390/414
px, and it **names the element** responsible rather than reporting that the
page overflows by 42px. It covers the public site, the signed-in portal and
the whole admin console — 53 routes — given credentials:

```bash
ADMIN_LOGIN_EMAIL=…  ADMIN_LOGIN_PASSWORD=…      # /admin/*
PORTAL_LOGIN_EMAIL=… PORTAL_LOGIN_PASSWORD=…     # /portal/* (portal is skipped without these)
PORTAL_TICKET=TW-2026-00007                      # optional, adds the conversation view
```

Two of its checks are worth knowing because both caught real bugs that look
fine in a screenshot: **an element inside an `overflow-x-auto`/`hidden`
ancestor is treated as contained**, not as overflow — otherwise every
decorative background blob is a false positive — and **SVG text is measured
after viewBox scaling**, because `getComputedStyle` reports user units. A
diagram marked `fontSize="8.5"` was rendering at 5.4px.

**Every bug of consequence in this project was found by running it, not by
reading it** — two independently-written string constants disagreeing is
invisible to static analysis. Verify in the browser before calling something
finished.

---

## Scope limits (from the client brief — do not exceed)

No cart, checkout, payments, quotations, invoices, renewals, subscriptions,
domain or hosting control panels, or CRM. Products are a **catalogue** with
"Request Information" CTAs only.

---

## Known risks and placeholders

- **Placeholder content that must not ship.** All invented to make the
  layouts judgeable, and all of it now editable rather than buried in code:
  - The hero statistics (16 yrs, 340+ sites, <4h SLA, 99.9% uptime) and the
    support band figures — `/admin/settings`, Homepage group.
  - The phone number +91 98765 43210 — Contact group.
  - The invented Mumbai address and its map embed, seeded by
    `DemoContentSeeder`. Not a real Technoware office.
  - Three social profile URLs seeded by `DemoContentSeeder`. **The most
    dangerous of the lot**: live outbound links to accounts that are probably
    somebody else's. Blank hides the icon.
  - All three case studies, the ten seeded products, the 33 generated
    placeholder images, and the privacy/terms/downloads copy.
  - The whole demo support desk from `DemoSupportSeeder` — a customer named
    Neil Basu, five tickets and two enquiries.
- **The logo is a text placeholder.** `#4A5A2A` is sampled from a screenshot,
  not the real file. See `web/src/components/layout/logo.tsx`.
- **CKEditor ships as `licenseKey: 'GPL'`** — valid while this repository is
  public and GPL-compatible. If Technoware wants the site proprietary, a
  commercial key is required. One line either way, but it is a business call.
- **`/privacy` and `/terms` are placeholder copy.** They read as real policy
  and are not. Needs a qualified legal review before launch.
- **The repository is public.** No secrets are committed and history is clean,
  but one accidental `git add -f .env` would be scraped within minutes.

See @README.md for setup detail, Plesk deployment and the full change history,
and @API.md for the endpoint reference — every route, what it returns, and the
behaviour that is not obvious from the signature.
