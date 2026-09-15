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
