# Sliders and galleries

Transitions, layouts, captions, the crossfade rules, the lightbox.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**A gallery's transition is a per-gallery setting, and the list is the API's.**
`App\Enums\GalleryTransition` owns fade / slide / zoom / none with a label and
the sentence the console shows, and it travels on `meta.transitions` — the rule
`schema_type_options` and `meta.locations` follow. The console's *new* screen
fetches the index for that meta alone, exactly as `/admin/menus/new` does.
Unlike `?sort=`, an unrecognised value is **refused** rather than falling back:
a sort parameter arrives mangled from an old bookmark, this arrives from a form
the console drew from the same list, so a value outside it means the two sides
have drifted.

**The transition keyframes write `transform`, and must not be mixed with
Tailwind's utilities.** `translate-*` and `scale-*` set the CSS `translate` and
`scale` *properties* — the trap that made the mobile drawer appear instead of
sliding and the nav underline appear instead of growing — so a keyframe using
`transform` and a utility using `scale` on the same element means whichever
runs last silently wins. The whole block in `globals.css` sits inside
`prefers-reduced-motion: no-preference`, so under `reduce` the classes exist
and do nothing, which is what `none` does anyway. **The `<img>` is keyed on the
index, not the item id**: a CSS animation runs when an element is created, and
re-pointing an existing `<img>` at a new `src` is not a new element — so it
would play once on open and never again.

**A slider has the same four transitions and a different default, because it
was never blank the way a gallery was.** `App\Enums\SliderTransition` is a
separate enum from `GalleryTransition` rather than a shared one — same shape
(fade / slide / zoom / none, refused outside the list, carried on
`meta.transitions`), and `slide` is the default rather than `fade`. A gallery's
lightbox had no transition before that column existed, so defaulting every row
to `fade` was an upgrade nobody had to ask for. A slider's existing behaviour
already *was* a slide — a real scrollable strip, swipeable and reachable by
keyboard with no JavaScript, the whole design of `components/ui/slider.tsx` —
so defaulting anywhere else would have silently changed what every slider on
every existing install does, including the homepage hero, the moment the
migration ran.

**Stacked cards is a `layout`, not a `transition`, and it is its own
component.** `SliderLayout::Cards` joins `full` and `split`: the current slide
fills the well with its caption and the others wait as a row of thumbnail
cards over the bottom-right, pressing one brings it forward. It arrived as a
DOM-reordering snippet — `appendChild` the first item on click and let CSS
transitions on `left`, `width` and `height` carry it — and that mechanism was
refused: those are layout properties, a reflow per frame, and React owns the
DOM order. `components/ui/cards-slider.tsx` does the same effect in two
transform-only halves — cards keyed by slide and placed by `translate` from
their slot, so a card changing slot *transitions* there; and a FLIP for the
promoted picture, measured from the pressed card's box and animated with the
Web Animations API on `transform`, cancelled by the next press. There is no
`@keyframes` for it and so nothing to guard: under reduced motion neither half
runs. `SliderFor` picks the component from `layout` at every call site, which
is how `cards` works in a shortcode and on the homepage while `split` stays
the store page's own decision (it needs the page background and is not a
well). Three things it taught, each measured at 320px rather than reasoned:

- **A container query answers for the nearest *ancestor* container, never for
  the element declaring `@container`.** A `@max-md:min-h-…` on the well itself
  silently never matched; the well is wrapped, and the wrapper is the
  container.
- **`min-height` on an `aspect-ratio` box with an `auto` width is transferred
  through the ratio into a minimum *width*.** A 253px-tall 16:9 well became
  450px wide inside a 288px column, with the card row off the right of the
  screen — and nothing overflowed the page, because the column clips. `w-full`
  on the well is what stops the transfer.
- **A probe that checks boxes can pass with the content clipped.** "The
  caption box ends above the cards" was green while the heading sat 81px above
  the top of the well; `_cards-slider-probe.mjs` now asserts the heading's own
  rect is inside it. The next slide is pre-mounted `invisible`, the rule
  `Slider` follows for its neighbours, because a hero-sized image decoding
  during the FLIP is a 180ms frame in the middle of a 600ms animation.

**A slide's words arrive by a setting of their own, and the caption is
re-keyed to replay it.** `sliders.caption_animation` (`SlideCaptionAnimation`:
none / fade / rise / slide / zoom, default `none` so nothing existing moved)
is separate from `transition`, which is how the *picture* changes; the
heading, caption and button carry `caption-anim-<style>` with `--i` 0/1/2 for
the stagger. A CSS animation runs once, when its element is created, and in
the native scroll track every slide is mounted from the start — so
`SlideCaption` is keyed on whether its slide is current, remounting as it
comes into view. Every keyframe starts at `opacity: 0` and lives inside the
`prefers-reduced-motion: no-preference` block for the reason the motion notes
give; measured under `reducedMotion: "reduce"`, the words are simply there.

**A crossfade is one slide animating in over another that does not move, and
three flickers were measured before that was the rule.** `scripts/_slider-flicker-probe.mjs`
films a transition through the DevTools screencast and reads the box's mean
luminance per frame. It found: a light-grey flash on every `fade` — the
incoming slide's placeholder drawn *above* the outgoing photograph until the
new `<img>` decoded (five frames at 1440px); a dip ~9 luminance units below
either photograph mid-fade, from both slides at half opacity over the dark
backdrop; and the caption layer — an opaque scrim over most of the picture —
swapped instantly, because it was one overlay keyed on the index. So: every
stacked slide is keyed on its slide (`s-N`), never on its role, or React
recreates the very `<img>` that has to stay put; the next and previous slides
are mounted `invisible` so they are decoded before their turn; the outgoing
slide keeps opacity 1 and no animation under the incoming one (there is no
`slide-fade-out` any more); each slide's photo and caption sit in one wrapper
that is what animates; and `outgoing` is set in `goTo` in the same batch as
the index, not in an effect after the paint. **A transition that looks smooth
in the DOM can still flash on screen** — sample the pixels.

**`Slider` picks between two entirely different rendering mechanisms, not four
variations on one.** `slide` renders every slide as a sibling inside the
native scroll-snap track, unchanged. `fade`, `zoom` and `none` stack the
current slide, the one on its way out and its two neighbours in one box, each
keyed on its slide, and animate the current one in with its own
`slide-fade-in`/`slide-zoom-in` keyframes (see the crossfade note above for
why the outgoing one does nothing and the neighbours are already there). `goTo`
chooses the mechanism itself, from whether the native track is mounted: with
no scrollable element to scroll, it falls through to setting the index
directly. The per-`kind` media rendering (image, video, click-to-play YouTube)
and its loading placeholder live in one `SlideMedia` sub-component shared by
both paths, so the branch on `slide.kind` exists in exactly one place rather
than two copies free to drift the way `admin_path` did.

**A slide's image field says how big to make the picture, because
`object-cover` cannot tell an editor that on its own.** The box a slide fills
changes shape with the screen — 16:9 on a phone, a full-height column matching
the copy beside it on the homepage hero, 4:3 anywhere else the shortcode is
used — so there is no single ratio to ask for, and a narrow or low-resolution
upload is the file that comes back pixelated on a wide monitor or with its
subject cropped out on a phone. The hint on the image and poster fields in
`slide-repeater.tsx` says "at least 1920×1080px, landscape" for that reason —
wide enough to survive being cropped to any of the shapes the component asks
of it.

**`fade` and `zoom` need something opaque behind the photo they are fading
in, or the fade reads as a flash of the page.** Both animate through
`opacity: 0`, and `Gallery`'s lightbox — where the keyframes are borrowed
from — gets away with a bare `opacity` animation because its `<dialog>` sits
on a near-black backdrop. `Slider`'s single-slide swap had nothing behind it
but the section's own `bg-surface`, light in light mode, so every fade opened
on a flash of the page's ground colour before the photograph took over —
reported as "not smooth, white flashing" the first time a real photo (rather
than a placeholder) was cycled through it. The non-native wrapper now carries
`bg-dark` itself, so what shows through mid-fade is dark, matching what a
fade over a photograph is supposed to look like.

**A gallery's tabs are a table, and an item names one by slug.** `gallery_groups`
belongs to one gallery — a string column beside each picture would make renaming
"Networking" an edit to every row that carries it, and would leave the order of
the strip alphabetical where it is actually a decision. The payload keys on the
**slug** rather than the id because tabs are replaced wholesale, so every id is
renumbered on every save, and because the console creates a tab and the pictures
filed under it in one submit: at the moment an item has to reference its tab
there is no id to reference. Groups are therefore synced **before** items, and
the slug map is rebuilt from what was just written.
`GalleryTest::test_grouping_survives_a_save` is what fails if this is ever
re-keyed on ids.

**Renaming a tab has to carry its pictures with it.** The console rewrites
`group` on every item pointing at the old slug, because the API refuses an item
naming a tab that is not in the payload — and refusing somebody's rename with an
error about `items.3.group`, a field they never touched, is not a usable form.
Deleting a tab does the opposite and sets them to null: the pictures fall back
to "All", which is the same call `media.folder_id` makes with `nullOnDelete`.

**The phone gutter on a caption is about the arrows, and only the middle row
has to clear them (2026-09-23).** Every anchor carried `px-14` — 56px each
side — so that a caption could not run under the previous/next buttons, which
are 40px inset 8px from each edge and sit at **half height**: six of the nine
anchors can never touch them. On a 390px screen that left a 198px text column,
which wraps a heading after two words, clamps the summary mid-sentence and
breaks a three-word button across three lines. It is `px-12` for the middle
row — 48px, exactly where the arrows end — and `px-4` for the rest, and the
caption block is `w-full` below `sm` instead of shrink-to-fit, because a box
that sizes to its text is a column inside a wide scene and simply narrower
lines on a phone. Measured 198px → 262px at 390. `slide-caption.tsx`, so every
slider that draws a caption gets it.

**A caption over a photograph cannot be made safe, so the gallery puts it
underneath.** The background is a picture nobody has seen yet: white text on a
gradient is legible over a dark image and invisible over a pale one, and
`npm run audit` measured the worst of these at **1.13:1**. A flat wash dark
enough to guarantee 4.5:1 over a white photograph greys the bottom third of
every picture in the grid, which is the worse trade. Below the well it is ink on
card — the pairing every other card here uses, checked in both schemes.

**The gallery renders no heading of its own.** It is embedded by shortcode at an
arbitrary depth in somebody else's body, so an injected `<h2>` is a
heading-level jump on every page that embeds it. `subtitle` is a paragraph, and
`name` is a console-side label that never reaches the page.

**Its lightbox does not go through `Modal`, and that is a decision.** `Modal` is
a 34rem card with a title bar, a padded body and a footer; override its width,
background, padding and header and nothing is left but three lines of
`<dialog>` mechanics. Those three are reproduced in `gallery.tsx` for the
reasons `modal.tsx` documents at length — `showModal()` must be called
imperatively, the `close` event must be listened for or Escape leaves React
believing it is open and it can never be reopened, and a backdrop click is told
from a panel click by comparing the event target with `currentTarget`.

**The lightbox's autoplay is an override, not a copy.** `useState(false)` plus
an effect that seeds it from the gallery's setting is a cascading render — which
`react-hooks/set-state-in-effect` refuses outright — and it paints one frame of
"paused" before the real answer lands. It is
`override ?? (motionOk && autoplay)`, where null means nobody has decided yet.
Pressing Next sets the override to false: once somebody is driving, an automatic
advance takes the picture away from them.

**A slider has no URL, so it must not use `Sluggable`.** That trait writes a
301 on every slug change, which for a slider would point `/sliders/old` at
`/sliders/new` — two URLs that have never existed — and the proxy would
answer a real request with a redirect into a 404. `Slider` generates its own
unique slug in ten lines instead.

**Deleting a slider a page reads by name is two steps, and the second is a
request the API can tell apart.** The homepage and the shop front each ask
for a carousel by slug (`homepage-hero` in `lib/home-data.ts`, `store-hero`
in `store/page.tsx`), and on 2026-09-17 the homepage hero was deleted from
the console in one press — a ghost button at the foot of the edit form,
straight to the action — taking its five slides with it. `Slider` has no
soft delete and nothing else stored the slides; they came back out of
MySQL's binary log (`mysqlbinlog --read-from-remote-server … -v`), where
the console's last wholesale re-sync had written every row in full. The
client asked for these to stay deletable behind a two-step confirmation
rather than be locked, so `Slider::RESERVED` names the two slugs and what
each draws, the resource carries `is_reserved`/`reserved_for`, and `DELETE
/admin/sliders/{id}` answers 422 for a reserved slider unless the request
carries `confirm`. `delete-slider.tsx` is the console's half: every slider
now confirms in a `Modal` the way a menu does, and a reserved one adds an
acknowledgement naming the fallback inside it, posted as `confirm=1`, with
the button disabled until it is ticked. The action no longer swallows a
refusal into "Slider deleted"; it comes back to the record as `?kept=1`.
`SliderTest` pins both halves: unconfirmed refused, confirmed deleted, and
an ordinary slider needing neither.

**`loading="lazy"` inside a scroller defers the slide nobody has reached yet,
which is every slide but the first.** All of a carousel's slides are in the DOM
at once inside `overflow-x-auto`, so slides two onwards are not "below the
fold" in any sense a person would recognise — they are simply not scrolled to,
and the browser waits. Pressing Next therefore *started* the download and the
reader watched an empty box for as long as the network took. `Slider` now
eager-loads whatever is within one slide of the current index, **wrapping**:
`goTo` wraps in both directions, so the slide before the first is the last one,
and a plain `Math.abs(i - index)` calls that the furthest away rather than
adjacent. Neighbouring *videos* stay at `preload="metadata"` deliberately — an
image is tens of kilobytes and buys an instant slide, a video is megabytes
fetched for something nobody asked to watch.

**The slide placeholder sits under the media, not over it.** Over the top it
would have to be removed at exactly the right moment, and it would cover a
video's own poster — which paints immediately and is a better placeholder than
any skeleton. Under it, the media covers it as it paints. It still clears on
load, because `motion-safe:animate-pulse` running forever behind every loaded
slide is wasted work, and **`img.complete` is checked in a ref callback as well
as `onLoad`**: a cached file can finish before React attaches the handler, so a
placeholder cleared only by the event would sit over a picture that is fully
there — on every visit after the first. `onError` clears it too, or a broken
image pulses for ever.

**The lightbox is a flow, and the gallery's transition setting now says how
the flow is drawn (2026-09-17).** The client sent a reference: the current
picture square-on in the middle, its neighbours behind it on either side
turned away, blurred and dimmed, and a strip of thumbnails under it.
`Lightbox` keeps every one of the `<dialog>` mechanics its docblock
argues for and changes the composition: every picture within two of the
current one is on a `perspective` stage, placed by its offset — `translate`,
`rotate`, `filter` and `opacity` from that one number — and transitioned,
so pressing Next slides the whole row a slot along and the picture arriving
in the middle turns to face the front (the mechanism `CardsSlider` argues
for over reordering the DOM, and the one `FanSlider` shares). `slide` and
`zoom` transition the whole placement, `zoom` scaling the neighbours down
too; `fade` transitions only opacity and blur, so the pictures take their
slots at once and cross-fade there; `none` and anything unrecognised
transition nothing. The old per-picture keyframes are gone from the
lightbox (the sliders still use them); the direction state went with
them, because "3 after 2" and "3 after 4" both put the picture in the
middle and the neighbours say where it came from. The strip is the shop's
category rail — an inner `w-max` row with auto margins, centred while it
fits, scrolling from its first tile once it does not — and the current
thumbnail is scrolled into its centre with `block: "nearest"`. Measured at
1280 and 360: five pictures on the stage, the current at `-50%`, `y 0deg`,
no filter, the first neighbours at `±20%`/`±120%`, `y ∓18deg`, `blur(2px)
brightness(0.72)`, no overflow, no console errors.

**Fanned photos is the fourth slider layout, and it was a picture the
client sent (2026-09-17).** `SliderLayout::Fan`, `components/ui/fan-slider.tsx`:
a frame counter along the top in the mono face, the pictures fanned in
perspective with the current one square-on in front and the others turned
away behind it on either side, the heading and its caption *under* the
picture on the panel's own ground, and a pill at the foot holding two
arrows and a row of dots with the current one drawn long. The cards are
placed by offset like the lightbox's and fade with distance — 55%, 30%,
15% — because the client asked for everything but the highlighted picture
to be faded. **Every card is one element type**: the first cut drew the
current card as a `<div>` and the others as `<button>`s, and a card
changing type on becoming current remounted, so the one move that
mattered did not animate; they are all buttons now, the current one
`aria-current` and out of the tab order, the arrows and the dots being the
controls that move. Sized from the container (`--card-w` is 42% of the
well between 120 and 360px, so the fan of five spans ~90% of it —
measured at 30% the current picture was 160px in a 533px hero column) with
a `min-height` under the aspect ratio so the counter, the card, the words
and the pill always fit; the counter keeps clear of the pause button with
`pr-12`. Videos and YouTube slides show their poster: it is a gallery of
stills. Two slides minimum, or it renders `Slider`; the transition and the
caption anchor are ignored, the `Cards` reasoning.

## Cylinder and Ripple (2026-09-24)

After Vengeance UI's cylinder carousel and ripple displacement slider (MIT),
re-drawn rather than vendored.

**Cylinder** (`components/ui/cylinder-slider.tsx`): the slides stand as cards
around a ring in perspective. Each card is placed with the `transform`
*function list* — `rotateY(i·360/n) translateZ(r)`, turned then pushed out
along its own facing — because the individual `rotate`/`translate`
properties compose as translate ∘ rotate and would push every card out
along one axis. The ring turns with the `rotate` property (the transitioned
one) and is pushed back with `translate`. It turns **one card per step**
(autoplay, arrows, dots, a press on a card) on an unbounded step counter, so
last → first is one step forward; the reference spins continuously, which
leaves no front card for the heading and caption. `r` is card width over
`2·tan(π/n)` with 6% air. Needs five slides, or it renders `Slider`.

**Ripple** (`components/ui/ripple-slider.tsx`): a full-bleed banner whose
changes are drawn by a raw WebGL fragment shader — one quad, two textures, a
progress uniform tweened by rAF (the reference is three.js + gsap). Textures
load from the **same-origin `/_next/image` URL**: an API-origin image taints
the canvas without CORS on `/storage`. The canvas paints only during a
change; the real `<img>` is always underneath (alt, LCP, no-JS). No WebGL, a
lost context, reduced motion or an SVG slide → the crossfade. Two slides
minimum.

## Hero features (0.191.0)

Eight additions to the carousel, for every slider and not only `homepage-hero`.
The defaults are the old behaviour, so a slider nobody touches renders what it
did. The new columns are on `slides` (`kicker`, `link2_url`, `link2_label`,
`mobile_media_path`, `text_tone`, `overlay`, `fit`, `duration_ms`) and on
`sliders` (`media_effect`, `navigation`, `height`, `height_mobile`,
`height_desktop`). Every enum is an `App\Enums\Slide*` or `Slider*` class with
`label()`, `blurb()` and `options()`, sent on `meta` (`media_effects`,
`navigations`, `heights`, `height_steps`, `text_tones`, `overlays`, `fits`) so
the console lists none of them. A value outside its list is refused.

**Which layout draws what.** The screen-height cap, per-slide timing, kicker,
second button and text colour work wherever a slider draws a caption or runs
on its own, because they live in `slide-caption.tsx`, `useAutoplay` and the
shared `.slider-frame`. The slow zoom, the phone picture, the progress line
and thumbnails are `full` (`Slider`) only: Split, Cards, Fan, Cylinder and
Ripple move in their own way, and the console says so.

- **Kicker and a second button.** A small uppercase line above the heading
  (`kicker`, 60) and a second link (`link2_url` + `link2_label`, the first
  button's `LinkPattern` rule). The second needs both halves or neither: a 422
  on whichever is missing. The stagger counts the lines actually drawn, so a
  missing kicker leaves no gap in it. The second button is outlined,
  `onDarkOutline` on the dark shade and `secondary` on the light one, and wraps
  below `sm`. Its colours are spelled out rather than left to the variant:
  inside a section painted in a custom colour the variant's tokens were
  re-derived and the button lost its edge.
- **Text colour and shade.** `text_tone` is `light` (white words on
  `--color-scrim`, what every caption did) or `dark` (near-black words on the
  new `--color-scrim-light`, ink `--color-scrim-light-ink`). Both are
  non-inverting tokens set beside `--color-scrim` in `globals.css` and
  re-derived in `lib/themes.ts`, so a section background does not turn them.
  `overlay` is `soft`, `standard` or `strong`. **Strength moves where the
  opaque stop ends and never its alpha**: `strong` holds the opaque colour a
  third of the way in (`via-35%`), `soft` finishes fading sooner (`to-70%`), and
  the middle-row panel keeps its opaque ground and only changes its padding. The
  audit cannot see through a translucent stop (the caption rule in CLAUDE.md),
  so a shade that faded by alpha would leave it nothing to grade. The class
  names are literal tables in `slide-caption.tsx`, and an unknown value falls
  back to the old look.
- **A separate picture for phones.** `mobile_media_path` is a library *image*
  (`media.mime like image/%`, not in the bin); the resource adds `mobile_url`,
  `mobile_alt`, `mobile_focus` and `mobile_blur` exactly as `url` is built.
  `slide-media.tsx` draws one `<picture>` from `getImageProps`: a
  `<source media="(max-width: 767px)">` for the phone file and the `<img>` for
  the wide one, so a visitor downloads one file. A `<source>` carries no style,
  so each focal point is a custom property on the `<picture>` and the `<img>`
  picks between them with a media query; the blur preview does the same. Video
  and YouTube slides ignore it. The crop-before-upload spec is `slide-mobile`
  in `lib/image-specs.ts`, portrait 1080x1350.
- **The slow zoom.** `media_effect` is `none`, `zoom_in`, `zoom_out` or `drift`.
  The keyframes animate the CSS **`scale`** and **`translate`** properties
  (never `transform`, the v4 trap) in `globals.css`, over the slide's own delay
  (`--media-effect-ms`), holding the last frame, inside the no-preference query.
  `data-media-effect` is on the inner span of `ZoomBox` only while the slide is
  active, so taking it off resets the animation and putting it back restarts it
  **without remounting the `<img>`**; the outer span clips, so the document
  never widens. Images only. **On the native scroll track the index changes
  halfway through a swipe**, which would reset the zoom of the slide still on
  screen: `leaving` holds the slide being scrolled away from until the scroll
  has been quiet for 200ms, and a slide counts as active while it is the index
  or the leaving one.
- **Per-slide timing.** `duration_ms` is 2000-60000 or null (the slider's
  `interval_ms`). `slideDelay(slide, slider)` in `lib/hooks/use-carousel.ts` is
  the one calculation, floored at 2000 and 6000 when neither is set; the
  autoplay clock, the zoom and the progress line all read it. **`useAutoplay`
  is a `setTimeout` re-armed per slide, not a `setInterval`**, and takes the
  current index as `at`: a caller whose `tick` is stable (a functional state
  update) would otherwise never be re-armed after the first tick. Every
  carousel, the gallery included, moved onto it; with no `duration_ms` the
  timing is what it was.
- **Navigation.** `navigation` is `dots` (default), `progress`, `thumbnails` or
  `none` (the arrows and the pause button remain). The progress line is a 3px
  bar along the foot whose fill animates `scale` over the slide's delay; it is
  mounted **only while the autoplay clock is running**, so hover, focus, a
  hidden tab or the Pause button removes it and the resume restarts it from
  empty, the same restart the timer makes, and it is absent under reduced
  motion. **Thumbnails sit below the picture**, in flow: drawn inside the frame
  they covered the caption, because the frame is capped and clipped. So
  `Slider` returns an outer section holding the capped frame and the strip,
  with the hover and focus pause on the outer box. The strip scrolls inside its
  own `w-0 min-w-full` box so it never widens the page, each thumbnail is a 24px
  or larger target named "Slide N: heading" with `aria-current`, and its active
  ring has `p-1` around it or the scroll box clips it.
- **Never taller than the screen.** `.slider-frame` (on the box every layout
  draws, and the shop hero's picture) carries
  `max-height: calc(100svh - var(--h-site-header) - var(--h-info-bar))`, always
  on, so Atelier's and Launch's portrait heroes stop pushing the page below the
  fold with no setting changed. `svh`, so a phone's collapsing address bar does
  not make it jump; `--h-info-bar` exists only under Vantage and defaults to
  nothing. The theme's `aspect-*` still sets the shape and the picture crops
  around its focal point. `--slider-cap` is the ceiling, and the stacked layouts
  size their cards from it with `min()` because their `min-height` would
  otherwise beat the cap. `[data-slider-stage]` carries it too, or an
  aspect-ratio slide overflows its clipped frame instead of being shortened.
  Vantage's hero keeps the full window and takes the info bar into every cap.
  `scripts/probes/slider-height.mjs` fails a theme whose frame is taller than
  the screen at five sizes.
- **Height.** `height` is `theme` (default: the theme's shape, capped),
  `screen` (exactly the visible screen below the header, aspect off, a 22rem
  floor so a landscape phone stays usable) or `fixed`, which needs
  `height_mobile` and `height_desktop`, each `short`, `medium` or `tall`
  (16/22/28rem on phones, 24/34/44rem from `lg`, each under the screen cap). The
  steps are required only for `fixed` (`required_if`) and the controller stores
  null for them under any other height. `lib/slider-frame.ts` emits
  `data-height`, `data-h-mobile` and `data-h-desktop` (nothing for `theme`) and
  one `globals.css` block reads them.
- **Fit.** `fit` is per slide: `cover` (fill and crop, the default) or
  `contain` (the whole picture, centred over a blurred, enlarged copy of itself
  so there are no bare bars; the slide's `blur` preview stands in as that
  background where there is one). The slow zoom runs on the sharp picture only.

Console: Site > Sliders gains Picture motion, Navigation and Height (with the
two steps when Fixed) on the slider, and per slide the kicker, second button,
phone picture, Text colour, Shade, Picture fit and Show for (seconds). All go
through the repeater's draft and restore like the existing fields.
`scripts/probes/hero-features.mjs` drives the lot on `homepage-hero` and puts
it back; `slider-height.mjs` is the cap.
