# Motion

Reveals, page transitions, the loader, the splash, the aurora, the beam, the marquee.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**The mega menu's rise had never animated, and the panel used to vanish on
close.** `transition-[opacity,transform]` beside `translate-y-1` — the v4
`translate` trap, a fourth time — and `visibility` outside the list, so the
panel was `hidden` the instant the pointer left. Found by the skill audit,
confirmed by sampling the computed `translate` per frame; the underline's
lesson, not learned.

**Every `<dialog>` enters and leaves through one class, `dialog-motion`.**
`@starting-style` gives the open transition a state to start from and
`transition-behavior: allow-discrete` on `display` and `overlay` is what lets
the close animate; browsers without either open and shut instantly, as before.
Two things measured on the way. **A transition's clock starts on the first
frame after `close()`, and on a page that has just lost a full-screen,
backdrop-blurred top-layer element that frame costs 60–130ms** — so the
gallery lightbox, which unmounts on `close`, waited on a 140ms timer and
removed the element as its fade began. It waits on `getAnimations()`'s
`finished` promises now, with a 600ms fallback for a browser that starts none.
And **`Modal` and the popup keep their element mounted across a close**, which
is why only the lightbox needed that.

**An auto-advancing carousel has a visible Pause button, and the marquee has
a toggle.** Hover and focus-within pause both — a courtesy, not a control: a
keyboard user has nothing to hover, and the marquee's visual track is
`aria-hidden` with nothing focusable in it, so `focus-within` could never
fire there. `PlayPause` in `slider.tsx` (rendered only when `autoplay` is set;
`override ?? slider.autoplay` is the gallery lightbox's shape) and
`MarqueeToggle`, a client island that flips `data-paused` on the strip so the
pause is one CSS rule with three ways in. `_motion-fixes-probe.mjs` samples
every one of these mid-flight.

> Superseded in 0.47.0: this describes the CSS `.border-beam` that Velora's
> `components/velora/border-beam.tsx` replaced. Kept for the measurements.

**Every card carries a border beam, and only a featured one runs it by
itself.** Velora's `<BorderBeam />` (velora.colorlib.com — the template the
user has named as the source for components and theme from here on; Colorlib
is CC BY 3.0, so ideas are taken and nothing is vendored), reimplemented as
`.border-beam` in `globals.css` and `components/ui/border-beam.tsx`: an
overlay masked to the border ring, with a gradient `::after` carried round it
on `offset-path: rect(…)`. `Card`, the catalogue tile and the store card all
render it. The mode is a rule: **`always` only where the data says
`is_featured`**, `hover` (and `focus-within`) everywhere else — nine cards
each circling on their own is the "excessive motion" the skill audit names,
and it contradicts the finite-decoration rule the cart wiggle was just held
to. The public `ProductResource` gained `is_featured` for it; the column was
always there. Keyframe and both triggers sit inside the reduced-motion guard
and the beam is `display: none` outside it, or `reduce` would leave a static
gold blob parked on one corner. `_border-beam-probe.mjs` samples the
`::after`'s `offset-distance` per frame in each mode.

> Superseded in 0.47.0: this describes the CSS `.border-beam` that Velora's
> `components/velora/border-beam.tsx` replaced. Kept for the measurements.

**The first cut ran perfectly and could not be seen.** A 2px ring, a 120px
beam, the `500` steps of both ramps: on a light card the olive `500` is a
dark mark on a grey border, and a beam is something *lit*. It is 3px, 200px
and the `400` steps now — the ones `darkRamp()` gives extra chroma in dark,
so one pair reads in both schemes — chosen from three variants rendered side
by side, not from the numbers. Velora's props (`size`, `duration`, `delay`,
`reverse`, `colorFrom`, `colorTo`, plus `width`) are on `BorderBeam` as CSS
variables; their component carries them on `motion/react`, and a 35KB
library to tween one property is the trade the icon split was made to avoid.
Featured cards stagger by `id % 4`, or a row of them circles in lockstep.

**Velora's components live under `components/velora/`, and each file says
what changed from the registry item and why.** Velora (velora.colorlib.com,
MIT — its themes page says so, which supersedes the CC BY caution first
recorded) is the client's chosen source for components from here on; six of
its registry items are installed as published, on `motion`, with shadcn's
tokens mapped to this theme's: `border-beam` (every public card, on hover and
keyboard focus only, ring as *padding* so the overlay can clip without
clipping the ring — `overflow: hidden` clips to the padding box, which is why
the first cut with the ring as a border painted nothing at all), `vanish-input`
(the header search, kept as a real GET; its cycling placeholder alone over the
shop's combobox, whose picture suggestions are why it stays a combobox),
`dock` (the footer socials, the `<a>` handed in as children so `icons.tsx`
stays server-side), `theme-toggler` (its circle wipe lifted into the footer's
three-way group, since "system" has to stay sayable), `shimmer-button` (the
header's consultation CTA, without `.btn` so no motion family reaches it),
`retro-grid` (behind the certifications band; its lines are the brand `500`,
because the registry's `--border` is a light line for a dark page and was
invisible on a white one) and `confetti` (the basket's Checkout press and once
on the order confirmation, keyed `?placed=1`). Its six themes are presets in
`lib/presets.ts`: three oklch stops each, converted to hex as primary,
secondary and accent, and the generator derives both schemes and pushes them
through the contrast gate like every other preset. **Their beam runs on a
JS-driven `motion` loop per card, so it runs only while hovered** — measured
as dropped frames during the theme wipe with twenty-four idle loops on the
shop's front.

**A reveal style's start state must be `:not([data-aos-animate])`.** The
selector `html[data-aos-ready] [data-motion-reveal="float"] [data-aos]` is
(0,3,1) — the same specificity as the reveal's own animate rule — and it
comes later in the file, so it kept winning after the element was told to
reveal: `float` faded in and never rose, and the transform sat at 40px for
ever. Nothing static sees that; `_motion-probe.mjs` samples a scrolled-in
section 1.4s later and asserts opacity, transform *and* filter all arrived.

**Page transitions are not a `template.tsx`, because a template is keyed on
the layout's *immediate* child segment** (`layout-router.js`,
`createRouterCacheKey(activeSegment)`): `/products` → `/products/[slug]` is
the same segment and every move inside the shop or the blog would play
nothing. `components/ui/page-enter.tsx` restarts its own CSS animation on
`usePathname()` in a layout effect — before paint, or one frame of the new
page shows at full opacity and then dips — and deliberately not
`key={pathname}`, which would remount the router's cached subtree. The
keyframes end at `transform: none`, as `auth-rise` does, so `both` leaves no
containing block behind; every `position: fixed` element in both areas is
outside `{children}` anyway.

**The route-change loader starts from the router's own word, never from a
click.** `instrumentation-client.ts` exports `onRouterTransitionStart`, which
Next calls for a `<Link>`, a `router.push` and back/forward and for nothing
else — so a `tel:` link, a CSV download, an external link or an intercepted
anchor can never start a bar that nothing finishes. It finishes on
`usePathname()` *and* `useSearchParams()` (pagination is search-only; the
mount is inside `<Suspense>` for the reason `not-found-content.tsx` gives),
shows only after 120ms (a prefetched navigation commits in the same tick),
and its first keyframe is 30% rather than 0% so reduced motion, which freezes
it, still shows something. A ref that a timer sets must be nulled *in the
timer*, not only in the cancel path: the first cut read "the show timer is
still pending" for a bar that had long since shown, and the finish path took
the quiet-cancel branch every time.

**The first-visit splash is never in the server's HTML as anything but
`display: none`.** Whether it shows is decided by the root layout's blocking
script — before paint, so the page cannot appear and then be covered — and
only when the setting is on (embedded as a literal `1|0`), only off `/admin`
and `/portal` (nothing there would take the attribute off again), only when
`sessionStorage` has no `tw_splash`, and never under reduced motion, where
the global rule would freeze the overlay over the page for ever. The
component is the cleaner: it checks `getAnimations()` before listening for
`animationend`, because hydration can land after a 900ms animation has
finished and an event that already fired is one nobody hears. Both audits
set `tw_splash` in an init script — an audit is not a first visit.

**The aurora backdrop's opacity is derived per theme, and the audit cannot
see it.** The contrast probe walks *ancestors* for a background and a blob is
a sibling, so `auroraAlpha()` in `lib/themes.ts` composites every tint over
every ground under every text token each host renders and lowers the alpha
from `AURORA_ALPHA[scheme]` until all of it clears 4.5:1 — the hand-tuned
legacy themes put `brand-ink` at exactly 4.5:1 on white, so one number could
not hold for all 34 palettes, and a palette that cannot carry a wash gets 0.
It is emitted as `--aurora-alpha` with the theme and `npm run themes` reads it
back and checks the same pairs, so the two cannot drift. The three blobs are
anchored to regions that never meet, which is what makes one tint the bound
rather than two compounding. Keyed per **scheme**, not per host: the first
cut keyed it on the host tone and the dark scheme failed `muted` on every
palette, because a pale wash over white is a mid-tone slab over near-black.

**A doubled marquee track needs its gap on the item, not on the parent.**
The homepage's brand strip scrolls two copies of the logo list back to back
and slides `translateX(-50%)` before looping, on the reasoning that identical
copies make the loop point invisible — true only if `-50%` of the track's
width is *exactly* the distance from one copy's first logo to the next copy's
first logo. It was not: flex `gap` inserts space **between** children, so N
items produce N−1 gaps, and doubling eight brands to sixteen items gives
fifteen gaps — an odd number. Half of an odd count of gaps is not a whole
number, so `-50%` landed 20px short of the true repeat distance (measured
directly in the DOM: `firstOfCopy2.x - firstOfCopy1.x`, not inferred), and the
track snapped forward by that 20px once a loop, in a single frame. Giving
every item its own trailing `margin-right` instead of a shared parent `gap`
makes each copy self-contained — the last item of a copy carries its own
spacing rather than borrowing a shared one at the seam — so two copies sum to
exactly double and `-50%` lands exactly on it. Confirmed by screenshotting the
identical few pixels either side of the loop boundary rather than trusting the
arithmetic alone: freezing the animation one frame before and one frame after
the boundary produced pixel-identical frames.

**A raw coordinate jumping at a loop boundary is not itself the defect.** The
transform genuinely jumps by one copy's width every iteration — that is how a
CSS animation restarts at `100%` back to `0%` — and sampling *that* jump's
size looks alarming out of context. What matters is whether the jump size
equals the *true* repeat distance; if it does, the pixels on screen either
side of it are identical and nothing is seen to move. Measuring "did the
position change unexpectedly" answers the wrong question — measure whether
what's rendered is the same.

**The homepage's sections do not reveal; the hero is its one moment.** The
nine sections under the hero each carried `data-aos="fade-up"`, and a fade on
every section as it scrolls in was the first thing the UX audit of 2026-09-15
named as reading "generated" — on the page people land on first. They are
simply there now; the slider's entrance and the stats are the page's one
orchestrated moment. Inner pages keep the editor's `motion_reveal` choice: a
solution page's sections are reached one at a time, where a reveal answers
the scroll rather than decorating it.

**The cart badge bursts every eight seconds until it has done its job.** The
second exception to "three times and stop", after the launcher and for its
reason: three wiggles in the first twelve seconds were over before anybody
had looked at the header. Four things move in the first 1.4s of the cycle —
the disc hops and lands with a squash (`translate` + `scale`), the mark
tilts as if catching something (`rotate`), a ring grows out of the disc
(`box-shadow`, so it widens nothing), and a dot drops in an arc into the
cart (`translate` + `opacity`, and hidden outside the motion guard so
`reduce` does not leave a static speck) — and the other 6.6s are still.
`cart-badge.tsx` stamps `data-quiet` once the shop is opened, and records
that in `sessionStorage` so the header's and the drawer's badges stop
together and a navigation does not start it again. The first cut also
stopped on hovering the Store link and on a basket holding anything; the
client asked "where is the cart animation?" within a minute of testing,
having pointed at the link while working the page. Opening the shop is the
one signal that means the badge was noticed.
`scripts/probes/cart-burst.mjs` samples every computed value mid-burst and
at rest, checks the stop and the reload, and runs once more under `reduce`.
