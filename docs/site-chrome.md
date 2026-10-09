# The public site's chrome

Header, footer, banners, the logo cap, phone-width reversals.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**The site header's desktop nav appears at 1280px, not 1160.** The nav carries
`min-w-0` so the row can shrink and its links are `whitespace-nowrap`, so once
the content stops fitting the links paint *outside* the nav's box rather than the
row wrapping. At 1160 "Resources" ran 93px into the consultation button and at
1280 there are 15 to spare; the ghost "Contact" link waits until 1400. Nothing is
ever over the page edge and no box overlaps, which is why every overflow check
passed - it is text outside its own box, the signature the dashboard's "Today"
label already taught. It started when Store was added to the navigation, one item
more than the row had room for.

**The footer's newsletter signup is a band, not a column widget.** In the brand
column it had ~270px, which left the input around 150px beside its button and
clipped `you@company.com` before anybody typed — and forcing the form to stack
turned that column into a tall run of hairline-separated widgets while a third of
the footer's width sat empty under the short link columns. Two symptoms, one
cause. Across the top the form gets a row, the brand column goes back to being
logo, tagline, address, phone and socials with space rather than rules between
them, and the footer lost a third of its height at 1440px. The description lives
in the band now, so the `<label>` on the field is `sr-only` rather than deleted:
an input labelled only by a heading two elements away is announced as "edit text,
blank".

**The signup's motion is CSS, and three-quarters of what was asked for turned
out to be nothing.** The ask arrived as jQuery + GSAP: tween a button icon's
fill on `mouseenter`/`mouseleave`, forward Enter in the field to `.click()`,
show an animated red heart after submission. Neither library ships on the
public site, and the translation is smaller than the original. The arrow in the
button transitions **`translate`** — not `transform`, the v4 trap this file
records three times — on `group-hover` *and* `group-focus-visible`, which the
mouse handlers would have covered one of. **Enter needed no code at all**: this
is a real `<form>` with a submit button, and the `keypress` hack exists only
for markup that is not one. The two pink hexes were refused — the heart is
`fill-err-fill`, because `--color-err` inverts to a pale pink on the dark
footer and `err-fill` is the red that survives it. And `.heart-pop` is **one
finite keyframe** (pop, two beats, still) inside the reduced-motion guard:
infinite is for loaders, and a heart that never stops pulsing beside a sentence
saying it worked reads as a fault. `scripts/_newsletter-motion-probe.mjs`
samples the computed `translate` *per frame* for 300ms rather than once at a
fixed offset — a single read at 80ms landed on `0px` while the settled value
was `2px`, because the transition starts on the style recalc after the pointer
lands, not on the pointer event.

**Every first- and second-level page opens on a section banner, and the
contrast is a ceiling rather than a hope.** `PageHero` takes a `section` —
solutions, products, services, industries, store, support, resources, company —
and `bannerFor` resolves that section's picture, then `banner_default_path`,
then nothing. Nine `banners` settings, all null by default, so an install with
none uploaded renders the heading exactly as it did before the feature existed.
The prop is on the hero rather than a URL threaded through twenty pages: a page
says which area it belongs to once, and `PageHero` is `async` and reads the
settings itself, which is free because `getSiteSettings` is a tagged fetch Next
dedupes within a render.

This is the one place in the product that puts text over a photograph, and
`BlogHero` and `Gallery` both refuse to — *"a background nobody has seen yet
cannot be made safe"*, measured at **1.14:1** on the blog hero's first cut. What
makes it safe here is that the picture is **forced** dark rather than hoped to
be: `brightness(.35)` scales every channel, so the lightest pixel any upload can
produce is 35% of white, `#595959`, and the pairings against it are arithmetic —
`dark-ink` **6.51:1**, `brand-200` **4.74:1**, `brand-300` 3.60:1, `dark-muted`
**2.62:1**. So on a banner the kicker is `brand-200` and not the `brand-300` the
flat dark tone uses, the lede is `dark-ink` and not `dark-muted`, and the
breadcrumb trail drops `dark-muted` and tells the current page apart by weight.
Both of those would have looked fine over the dark photographs anybody actually
uploads and failed on the pale one somebody eventually will — the support
banner is a brightly lit desk and is the case to check against.

The section keeps an opaque `bg-dark` underneath so the ratio the audit measures
and the ratio a reader gets agree; the gradient over the image is decoration and
every stop of it is translucent, which can only darken the real composite and
never lighten it. **`/store` itself has no banner** — it has the hero slider —
and neither do the transactional screens (cart, checkout, order, search, 404),
where a decorative band is noise.

**A height cap on the logo bounds nothing horizontally, and the header has no
room to spare.** `logo_path` is a setting, so the file decides its own aspect
ratio: the first real upload came out 252px wide inside a 342px console bar and
pushed Sign out off the screen at 360px, and 61px past the edge of the public
header at 320px. Both flanking groups are `shrink-0` — the consultation CTA and
the menu button are a fixed 150px that must not shrink — so the mark is capped
at **120px below `sm`** and released above it. Nothing in the repository
changed to cause that: it arrived with the upload, which is why no commit is
findable for it and why a client swapping the logo can reintroduce it if the
cap is ever removed.

**The logo's box is reserved from the file's own dimensions, which the API
sends.** `logo_width` and `logo_height` ride alongside `logo_url` on the public
`/settings` (same for `favicon_` and `login_image_`), read from the `media` row
by path. Before that, `Logo` declared a hard-coded 180x40 to next/image while
the client's mark is 600x81 — so the browser held 126px open, painted 207px
once the bytes arrived, and **the entire navigation beside it jumped right on
every cold load**. Reported as "logo coming late and the menu moves"; the final
position was correct, which is exactly what makes this read as a rendering
fault rather than as a wrong number. A guess cannot be right here — the file is
whatever was uploaded — so the only fix is to know. The 180x40 fallback remains
for a path with no media row behind it, and reintroduces the shift for that one
case, which is the best available when nothing is knowable.

**Two phone-width decisions were reversed on measurement, and the docblocks
say so.** The blog's category strip wraps below `sm` rather than scrolling:
the cut-off word the scroll relied on as a hint read as the end of the list.
The footer's link columns sit two abreast below `lg`: stacked, three columns
of seven links was a screen and a half of single-file text. Both were argued
the other way in this file's earlier notes; the arguments were sound and the
screens were still wrong.

**The announcement bar's window is decided by Laravel, never by the
browser's clock.** Asked for on 2026-09-15 (the client's reference was a
"PRICES SLASHED" band). Nine settings in the `announcement` group — a
switch, a message, solid or gradient with one or two colours, fixed or
ticker, a close switch, and two `datetime-local` strings — and one derived
bit, `announcement_live`, that `PublicSettings::build()` computes through
`App\Support\Announcement::isLive()` from the switch, the window in the app
timezone and a non-blank message. The frontend never parses a date: the
site is cached and served to visitors whose clocks are whatever they are.
Drift is the settings' 600s window; a console save is immediate. An
unparseable stored date counts as blank, because the switch is the gate.

**Its stops paint the same in both schemes, and one ink is pushed until it
clears 4.5:1 on every stop.** A designed band, like the CTA card: the
client's colours are not re-derived for dark. `announcementBand()` in
`lib/palette.ts` starts the ink near-white and near-black, walks each until
the *minimum* contrast across the stops clears AA (monotonic once the ink is
past every stop, so one walk), moves a stop the extreme ink still fails on,
and keeps whichever side moved the stops least — light ink on a tie, the
`topBarBand` rule. `npm run themes` grades a dozen hostile pairs: yellow
beside black is pushed to an olive so one ink reads on both; a mid-grey pair
gets near-black at 4.52:1; a red beside a blue moves the red one step. The
audit grades a gradient on its worst stop, which is what the derivation
guarantees; the inline `style` from a setting hex is the theme's own
exception, and nothing in the bar uses a `text-*` token — the message is
not `Prose`, whose ink tokens invert with the scheme.

**The ticker is the brand marquee's CSS, and only the first copy is real.**
The same `.brand-marquee*` classes: a `w-max` track of two copies with the
gap as `mr-12` on the item so `-50%` lands on the second copy's start, the
message repeated until a copy is ≥240 characters, duration from length
(20–90s), and the same three pauses — hover, focus inside, the toggle,
which gained `label` and `className` props. Every repeat is `aria-hidden`
and `inert`, so a screen reader hears the message once and a link in it is
one tab stop; focusing it pauses the track. The fade mask sits on a wrapper
inside the host, not on the host: on the host it faded the pause button and
the × sitting in its right edge. Under reduced motion the global rule
freezes the track and `globals.css` turns it into a centred, unmasked line
with the repeats hidden. Playwright's `hover()` never resolves on a marquee
(it waits for the target to be stable), so the probe moves the pointer.

**The third style shows one line at a time, and it is the one client island
here (2026-09-23).** `vertical` beside `fixed` and `ticker`: each line rises
from the bottom, holds `1.4s + chars/15` — floored at 3s so two words do not
blink past, capped at 9s so a long one does not read as a bar that has stopped
— and pauses under the pointer, while something inside has focus, and while
the tab is hidden. A line is what the editor pressed Enter to make:
`announcementLines()` splits on `<br>` and on `</p><p>`, which are the only
separators the `inline` purifier profile can leave, and a message with neither
is one line, which is how the other two modes read the same field.

It is a client component where the ticker is pure CSS, and the reason is
structural rather than preference: each line's in, hold and out are
percentages of one shared keyframe, and those percentages depend on how many
lines there are — something CSS has no way to take as a parameter. The
alternatives were generating a keyframe block per install into an inline
`<style>` or this.

Two rules come with it. The stack is `aria-hidden` and the whole message is
rendered once in an `sr-only` element beside it, because a rotator read aloud
is either a live region interrupting somebody every few seconds or a message
of which only one line is ever in the accessibility tree. And it needs no
reduced-motion branch: the movement is a CSS transition, which the global rule
already disables, and the hidden state sits on the lines that are *not*
current — so the line swaps instantly and nothing is left stuck at `opacity:
0`, which is the trap that rule creates.

**The band is 24px on a phone and 27px from `sm` (the client, 2026-09-23).**
It was 36px with 13.5px type and two 28px discs, measuring 49px on a phone
once the message wrapped. Halved and three-quartered as asked: 12px type below
`sm`, the vertical padding gone, and the line centred in the band rather than
sitting on its top edge. **The discs are 24px and cannot go below it** — that
is the tap-target floor `npm run audit:mobile` enforces, and it is what stops
the bar getting slimmer than this, not the type.

**Every style is one line, and a `<br>` is why that had to be said.** The three
drew 66px, 33px and 24px from the same message on a phone: `white-space: nowrap`
does not suppress an explicit line break, so a message an editor wrote as three
lines wrapped in the fixed style and not in the ticker. `announcementFor()`
already splits the message into lines for the vertical style, so the two
one-line styles render `lines.join(" &middot; ")` — one definition read the
other way — and each style clamps to one line with `truncate`. The console says
so under Fixed, because a message too long for one line is what the other two
styles are for.

**Closing it is a fingerprint in `sessionStorage`, hidden before paint.**
`announcementFor()` fingerprints the message, mode and stops (djb2), so a
changed announcement reappears after an earlier one was closed. The root
layout's blocking script — the scheme and splash script — stamps
`data-announcement-closed` on `<html>` when storage holds the live id, and
`globals.css` hides the bar under it, so a visitor who closed it never sees
it paint and leave on every page after (a layout shift). React removes it
from the tree after hydration through `useSyncExternalStore` with an "open"
server snapshot, the `lib/consent.ts` pattern; blocked storage reads as
open, since a strip is not a modal. `scripts/probes/announcement.mjs`
samples all of it and closes any dialog the moment it opens, because the
site popup opens after its own delay over the bar and intercepted both the
hover and the ×.

**The message goes through the `inline` purifier profile, and settings are
sanitised on write now.** `config/purifier.php` gained `inline` — `p`, `br`,
emphasis, `span`, `a[href|title|rel|target]`, no `style` at all — because
everything `cms` admits beyond that breaks one of the two facts above: a
heading is not one line and an inline `color` paints text the derivation
never saw. `SettingController::sanitiseRichText()` cleans every key in
`RICH_TEXT` before validation, which also closed a real gap:
`activation_procedure` had been stored raw and rendered on the order page.
`AnnouncementSettingsTest` pins the profile, the gap, the allowlists, the
window and the derived bit under `Carbon::setTestNow()`.

**Every dropdown fades in (2026-09-27), which reverses the second round
below.** The client saw the instant swap as the flicker this time and asked
for a fade on every menu, the utility bar's included: a panel now arrives
over `--duration-menu` (340ms, and out over `--duration-menu-exit`, 240ms — slowed from `base`/`exit`, 200/140ms, at the client's request on 2026-10-09; tokens of their own, so no other state change moved), opacity only (the 4px rise went too — a panel that
moves while it fades reads as a jump), a first open and a swap alike. The
panel being left still goes at once by the `:has()` rule, so a swap is one
panel fading in over nothing, never two over each other. The
`data-panel-swap` stamp, `markPanelSwap` and the rule reading them are
gone. `scripts/probes/menu-switch.mjs` asserts it from the running
transitions: 200ms on a first open, on the panel entered and on the utility
bar's panel; none on the panel left, at opacity 0.

**Moving between two dropdowns is a swap, with no transition either way
(2026-09-17, in two rounds).** The client saw the menu "flicker" between
Solutions and Products. The first round made the panel being *left* vanish
at once — `nav:hover [data-panel-host]:not(:hover) > .panel-drop {
transition-duration: 0s }` — and the client reported it again the same
afternoon. Measured per frame after that: the panel being *entered* was
still fading in from nothing, and a CSS transition holds its start value
until its first frame, so the hovered panel read `visibility: hidden` for
50–90ms against the dev server before a 150ms fade. Blank, then fade, is a
flicker; on a fast machine a shorter one.

Two rules now, both unlayered at the end of `globals.css`, both keyed on
`.panel-drop`. The panel being left goes at once only once *another* host
is hovered — `nav:has([data-panel-host]:hover) …` — so crossing the gap
between two items no longer closes the first with nothing to replace it.
And the panel being entered arrives at once while the `<nav>` carries
`data-panel-swap` — `nav[data-panel-swap] [data-panel-host]:hover >
.panel-drop`. A fresh open and leaving the nav altogether keep their 150ms
and 140ms fades.

**The stamp has to be on the nav before the pointer arrives**, and the
first cut of it was not. Written from the old host's `pointerleave`, it
landed after the new panel's three transitions already existed at
`currentTime 0` — Blink updates `:hover` and recalculates style *before*
it dispatches the boundary events. Pre-stamping the nav from the probe
painted the same jump at t+0 with nothing in flight, which is the proof.
So `releasePanel`, already on every trigger's `pointerenter`, stamps the
nav while its own panel is open, and `markPanelSwap` on the host's
`pointerleave` only schedules the removal 300ms out — a timer in a
`WeakMap` keyed on the nav, extended rather than stacked by a second
leave. All six chromes host panels through the same two functions in
`panel-host.ts`, so the wiring is one `onPointerLeave` beside each
`onFocus`.

**Every paragraph on the public site runs to its container (2026-09-16).**
The client's decision — "why are you not using full container width for
text?", seen on the Gallery page's body and subtitle and on several others
— so `.measure` is uncapped under `.public-site`, `Prose` has no cap, the
CMS page body has no cap (its two templates render at one width now; the
value stays stored), the knowledge-base article column is the full
container, and the hero ledes under every theme lost their `max-w-[52ch]`.
The console keeps 92ch. The deliberately narrow ones stay: a centred CTA
band, a footer column, a menu summary, a caption on a photograph — layout
widths, not measures. Measured at 1920: 1728px of 1920 on `/gallery` and
`/privacy`; `/about`'s copy is bounded by its two-column grid, which is
right.

**The homepage figures are configurable, and the support band reads its
setting now (2026-09-17).** `stats_colour` and `stats_size` in Settings →
Homepage, shared by every statistic row; `lib/stat-look.ts` turns them
into a `StatLook`, and `components/ui/stat.tsx` draws one figure from it
— the container takes `stat-figures` and the inline custom properties,
`globals.css` resolves `--stat-ink` per ground (the page in light, the
page in dark, a dark band whatever the scheme) with the palette's brand as
the fallback, which is what "the default colour follows the theme" means.
A chosen hex is pushed until it clears 4.5:1 on each ground (`inkOn()` in
`palette.ts`), the palette's rule that a typed hex is hue intent. A stat
line takes an optional third column naming an `iconMap` key
(`340+|Sites under AMC|building`), drawn as an identity icon. And
`SupportBand` reads `support_stats` — a setting that existed and that the
band never read, so editing it changed nothing; the static list is its
fallback now, as `heroStats` is for the hero. Measured: 26px figures in
the brand ink on both grounds at the default.

**The shop's category discs got a glow and their icons stopped
overlapping (2026-09-17).** The client's 3D icons fill their frame to the
corners, and at 66px inside an 80px disc the corners reached 47px from the
centre against a 40px radius — the Wi-Fi arcs crossed the ring. 88px discs
with 58px icons: a diagonal of 82px inside a radius of 44. The hover glow
is the launcher's in the brand colour, on the link's hover so the label
lights the disc too; the block's air came down from 40px under to 24 and
12px under the heading.

**Third-party code is a settings group, `embeds`, and it is raw on purpose
(2026-09-17).** Two things the client asked for: the Google reviews widget
from Elfsight on the homepage, and a box for "the code a vendor says to
paste before `</body>`". Both are `embeds` settings — public, like
`analytics`, because the public site renders them; written by `role:admin`
alone; and **never sanitised**, because a snippet that cannot carry a
script is not a snippet. `reviews_embed` is not injected as pasted:
`reviewsEmbed()` in `lib/site-settings.ts` reads the `elfsight-app-<uuid>`
class and the script address (Elfsight's CDN only) out of it and
`components/home/reviews.tsx` draws the div and a `lazyOnload` `<Script>`
itself, as the `reviews` homepage section (Themes screen: order and
switch), with the "Powered by Elfsight" line hidden by `.reviews-embed`
rules — Elfsight's free plan expects the badge, which is the client's call.
`body_code` is `components/layout/custom-code.tsx`, mounted at the end of
the marketing layout only: the snippet is parsed into nodes and every
`<script>` rebuilt with `createElement`, since one that arrives through
`innerHTML` never runs. The report-only CSP names Elfsight's hosts; a
pasted vendor script from anywhere else is reported and still runs, and
has to be named in `next.config.ts` when the policy is promoted. Measured:
the div and `platform.js` on the page, a probe script in `body_code` run.

**The statistics are edited as inputs per figure, and the figures can
count, rise or flip (2026-09-17).** The client asked for both. `stats-field.tsx`
draws each row of `hero_stats` and `support_stats` as a Figure input, a
Label input and the icon picker, with `ReorderButtons`, and composes them
back into the stored `value|label|icon` lines through one hidden input under
the setting's own name — so the API, the seeder, the public resource and
every renderer are untouched, and the setting can still be written by a
script. A `|` typed into a field is dropped, being the column separator.
`stats_animation` (None, Count up, Rise, Flip; an `options` setting, so the
form's generic select draws it) reaches `StatLook.animation`, which
`statFigures()` stamps on the row's container as `data-stat-animation`;
`StatValue` reads it from the ancestor on mount, so none of the nine
templates that draw `<StatFigure>` changed. Count keeps the sign, the unit
and the decimal places (`340+`, `99.9%`, `< 4 hrs`) and groups thousands
only where the source did; rise and flip are keyframes in `globals.css`
inside the reduced-motion guard with the stagger from `--stat-index`, which
the figure counts from its position in the row. Every one plays once, on
first entering the viewport, and the server renders the final figure — a
crawler and a reader with scripts off see `340+`.

**The classic hero fits the first screen from `lg` (2026-09-17).** Measured
before: with the announcement bar, the top bar and the header at 143px, the
hero's bottom edge ran 75px past a 1280×720 viewport and 11px past
1366×768, on 176px of vertical padding. On a viewport under 820px tall the
padding halves (`lg:[@media(max-height:820px)]:pt-10` / `pb-12`), which is
the difference: 13px inside at 1280×720, 77px at 1366×768, and nothing
changes on the five taller sizes measured. The stacked hero below `lg` is
taller than any phone and is not asked to fit.

**Every figure that stands for something counts up (2026-09-18).** The
client asked for counting animations wherever a number is mentioned, site
wide. `components/ui/count-up.tsx` is the one component: the number inside
a value counts from zero over 1.2s the first time the element enters the
viewport, keeping the prefix, the unit, the decimal places and the grouping
(`340+`, `99.9%`, `< 4 hrs`, `1,200`), and `StatValue` shares its
arithmetic. It draws by writing `textContent` over the server-rendered
final figure rather than through state — the server's number is what a
crawler, a reader with scripts off and the audit see, and a synchronous
`setState` in an effect is the cascade React's lint refuses. Under reduced
motion nothing runs. It is on a case study's results (index, detail, the
homepage and Editorial's front), a category's product count (the catalogue
and Editorial), the catalogue's "N products", the search page's total, a
blog category's post count (strip and sidebar), the comment count, a
post's reading time, and Datacenter's readouts (the header's, and the
hero's through `StatValue` so it follows the setting). It is deliberately
**not** on a price, a date, a telephone number, an order or ticket
reference or a "3 of 5" slide counter — figures that are read, dialled or
matched, where a number in motion is one nobody can yet trust. Measured:
the catalogue's counts and the blog's arrive counting, the case-study
figures below the fold hold at zero until scrolled to and reach 12 / 40% /
200. `stats_animation` now seeds as `count` for the same reason.

**Never a card without a ground (2026-09-18).** The client's site-wide
rule: no card without a background colour or a gradient, "otherwise it is
looking bad". A sweep of twenty-two public routes on classic and the front
page of every theme found one transparent card (the fan slider's frame,
`bg-surface` that resolved to nothing) and the real cause everywhere else:
`bg-card` on the page in the light scheme, where `--color-card` and
`--color-page` are both white, so every card on the page was a white box on
white with a border and a shadow standing in for a surface. In dark the two
tokens differ (L .15 on L .095) and the same cards read fine, which is why
nobody working in dark saw it. One unlayered rule in `globals.css` gives
every `bg-card` box on the public site a gradient from the card colour to
`surface-2` — white fading to the faint tint on the page, still lighter than
a `bg-surface` section on one, a lift from .15 to .19 in dark — as
`background-image` only, so the utility's colour stays the first stop and
the fallback. Form controls, buttons and anything already carrying a
gradient utility are excluded, and the console is outside `.public-site`.
Two boxes were made `bg-card` by hand (the fan frame and the AMC list on
WhyUs, which sat `bg-surface` on `bg-surface`). The gradient's lower stop is
a text ground now, and the audit found `brand-ink` at 4.05:1 on it the same
hour: `ramp()` pushes the ink against a surface-2 stand-in as well as the
card and the 50 wash, and `npm run themes` passes on all 31 palettes.
`npm run audit` carries the rule: a card-shaped box — `data-card`, or any
bordered, rounded box of size holding content — fails when its ground is
transparent or the same colour as the nearest opaque ancestor beneath it
with no background-image. Measured after: zero on every real route, light
and dark clean.

**The "Why Technoware" block is settings, and three of its rows had been
waiting.** (2026-09-21) The argument, the four steps, the pull-quote and the
AMC card were constants in `content/site.ts` until the client asked how the
block could be edited. `testimonial_quote`, `_author` and `_role` had been
seeded in the `homepage` group and labelled on the Homepage tab — with a
hint promising "leave blank to hide" — and nothing had ever read them: a
setting nothing reads, the mirror image of an endpoint with no control. They
are read now, beside eleven new rows (`why_kicker/heading/lede/steps`,
`amc_heading/inclusions/link_label/link_href`). The steps are `title|body`
lines and the list one item per line, the `hero_stats` convention, edited as
rows through `LinesField` — `StatsField` without the icon picker, columns
given by the caller — so the wire format is one a script can still write.
Seeded with the old copy so a fresh install renders what it did. **The
testimonial and the AMC card hide by a switch, never by a blank field** —
`testimonial_enabled` and `amc_enabled`, the promo band's shape. The first
cut honoured the old hint, "leave blank to hide", and the review found it
could not: `Setting::setPlainValue()` stores a cleared field as null and
`PublicSettings::build()` drops null rows from the public map, so the site
receives the same nothing for "cleared" as for "never set" and a blank
reverted to the placeholder quote — the fourth instance of the `??`/`||`
family in this codebase, one layer further back. A blank now falls back to
the constants like every other homepage row. `WhyUs` takes `settings` from
the seven theme templates that draw it; the whole block's on/off is the
Themes screen's section switch.

**The share row's marks take their own colours under the pointer, and only
there (2026-09-21).** `ShareLinks` sets `--share-hue` per link from the
`--color-social-*` tokens in `globals.css` — WhatsApp, LinkedIn, Facebook,
Telegram as published, X as the scheme's ink, email and copy-link the brand
ink — and the hover colour reads it, so one class list serves six colours.
At rest every glyph stays `text-muted`, because the published values are not
graded (WhatsApp's green is 1.9:1 on white) and rest is where the audit reads.
The logo is a little larger on a phone: 31px tall under `sm` (28 above),
width cap 120 → 128, still inside the 130px the flanking group leaves at
320px; the text fallback goes 23 → 25px. `npm run audit:mobile` clean at all
four widths after.

## Social flip tiles and Reddit (2026-09-24)

The footer's social row is flip tiles by default — `social_style` (`flip` or
`dock`) and `social_flip_word`, both public in the `social` group, the style
refused outside its list and the word letters/digits only, stored in
capitals, at most seven. The word sets the tile count (2026-09-25:
"CONTACT" over six profiles lost its T): a letter past the last profile is a
tile that is not a link — `aria-hidden`, out of the tab order — whose back
repeats the letter; a profile past the end of the word shows its network's
initial.

CSS only (`.social-flip` in `globals.css`): the card turns with the CSS
`rotate: y 180deg` property, transitioned as `rotate`, staggered by `--i`,
on `:hover` of the row and on `:focus-within`. Where nothing can hover the
icons show from the start; under reduced motion the faces swap by opacity.
The back face is the dock's hover state (the brand-coloured glyph on the
dark footer), so its measured contrast holds. The reduced-motion rule has to
name the hover selector too, or the hover rule outranks it.

Reddit (`social_reddit`) is the seventh profile: `IconReddit` is drawn here
from filled shapes; `#FF4500` is 5.39:1 on the footer's `#12140d`, but white
on it is 3.44:1, so the blog sidebar's filled button is `#D93A00` (4.61:1).

## The phone action bar, the coming-soon page and the 404 (0.122.0)

### The action bar

Call, WhatsApp and one button of the site's own, pinned to the foot of the
screen below `sm`. `lib/action-bar.ts` turns the public `action_bar` settings
into a list of buttons and `components/layout/action-bar.tsx` draws it, on
the server, from the marketing layout — so the page stays cached and nothing
is decided in the browser.

**A button is drawn only when it has what it needs.** Call needs the Contact
tab's phone number; WhatsApp needs a number of its own or the assistant's;
the third needs a link. A bar switched on with none of them draws nothing.
The last button is the filled one: three equal buttons read as a menu, one
filled button reads as the thing to press.

**It is a direct child of `.public-site`, and one rule depends on that.**
The bar is `position: fixed`, so alone it would cover the last 52px of every
page and sit under everything else pinned to the foot of a phone. The rule
at the end of `globals.css` is `.public-site:has(> [data-action-bar])`,
below `sm` only:

- the page's foot is padded by `--action-bar-h` (the bar, its hairline and
  the safe-area inset), so the footer's policy links end above it;
- the assistant's launcher and panel, the compare tray and the install card
  rise by the same height — by `bottom`, never `translate`, which the
  launcher's hop and every `.rise-in` already animate.

Anything new that is pinned to the foot of a phone screen joins that rule.
The cookie banner is `z-50` and simply covers the bar until it is answered.

Measured: 53px tall with 52px buttons in all twelve themes (the theme
preview draws the bar too, so a preview on a phone is what a visitor's phone
shows), the launcher's foot 16px above it, no sideways scroll at 320–414.

### The coming-soon page

One switch (`coming_soon_enabled`) puts `/coming-soon` in front of the whole
public site.

**It is a rewrite in `proxy.ts`, and it could not be anything else.** The
obvious place — the marketing layout rendering a holding page instead of its
children — needs either the setting per request or a cookie to let staff
through, and either one makes every ISR-cached page dynamic (the "static to
dynamic at runtime" 500 on every `[slug]` route). The proxy already runs
before the cache and already holds one thing it fetched from the API: the
redirect table. The switch rides on that read as `meta.coming_soon`, costs a
request one boolean, and takes up to sixty seconds to reach visitors — the
delay a renamed slug has, and the console says so beside the switch.

**What stays open** (`NEVER_CURTAINED`): the console and the portal, every
route handler, any path ending in an extension (the manifest, the service
worker, a feed), and the pages a link in an email already sent addresses —
an order, a visit, a meeting, an event registration, a survey, an
unsubscribe. Only GET and HEAD are rewritten.

**A curtain, not a lock.** A browser holding the staff session cookie sees
the real site, and only the cookie's *presence* is checked — verifying it is
an API call per request. A prefetch also skips the proxy by its matcher. It
keeps visitors and crawlers away from an unfinished site and protects
nothing confidential; the settings tab says that in words.

**The redirect loop it had.** The page's answer to a direct visit with the
switch off is to send the visitor home. For the minute after the switch is
turned off the proxy still rewrites to it while the page — whose settings
were purged at once — already sees "off": home, rewritten back, home again.
The probe hit `ERR_TOO_MANY_REDIRECTS` on exactly that. The rewrite now
stamps `x-coming-soon: 1` on the request and the page draws the holding page
for that stale minute instead of redirecting.

The page itself sits outside `(marketing)`: no header, footer, assistant or
analytics. `noindex`, and `robots.ts` disallows everything while the switch
is on, since every address answers with the same page. A signed-in member of
staff can open `/coming-soon` with the switch off, with a line saying nobody
else can see it. The console's layout carries a standing strip while it is
on — staff see the real site, so the console is the one place that can say
what everybody else sees.

### The 404

The not-found body searched the knowledge base only; most missing addresses
are a product or a page. It is a plain GET form to `/search` now, and
`NotFoundSuggestions` — a client island, because a not-found boundary is
given no params and only the browser knows the address — asks `/api/search`
for the address's last segment (`/products/cisco-cbs350-24t` is a search for
"cisco cbs350 24t") and lists up to five matches. Nothing is drawn until
something comes back.

`scripts/probes/action-bar.mjs` measures all three through the real settings
form and always switches both features off again.
