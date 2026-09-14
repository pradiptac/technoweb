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
