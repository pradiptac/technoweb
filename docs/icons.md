# Icon packs

Five packs measured, what each yielded and why the rest were refused.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**Borrowing an icon pack is a measurement, not a decision.** Four have been
looked at and three refused, each for a reason that only rendering them showed:
a Lottie set carrying watermarks, a pack whose subjects were fleet tracking, and
Freepik's 960 hardware icons — which inherit `currentColor` correctly and are
still wrong, being filled outlines drawn thinner and busier than this set, so
they are legible at 34px and mush at the 20px a list row uses, with no
stroke-width to raise because there is no stroke.

Three fit and were used: **TailGrids** (245), **Heroicons** (325 outline) and
**Flowbite** (412 outline), all MIT, all `viewBox 0 0 24 24` with
`fill="none"`, `stroke="currentColor"` and round caps — this project's `base`
exactly, at 1.5, 1.5 and 2 where this set is 1.7, which is what spreading `base`
settles. Heroicons is the cleanest structurally: one viewBox, one stroke width,
nothing filled, no runtime dependencies. Flowbite's paths carry no stroke width
at all — it is inherited from a theme store — so they are pure geometry.

**Sixteen icons came out of 982.** That number is the finding, not a shortfall: `iconMap` already held 109 keys covering this business's vocabulary — server,
cpu, printer, lock, laptop, monitor, scanner, camera, fingerprint, fire — and
the rest of each pack is UI chrome this file already has as direct-use icons,
or a retail set (a shoe, a boxing glove, a t-shirt, a teddy bear) nobody will
point a solution at. **A fourth pack would yield fewer still.**

**It did: Tabler is the fourth pack and it yielded ten.** MIT, 5,130 outline
icons at `viewBox="0 0 24 24"` with `fill="none"`, `stroke="currentColor"` and
round caps — which is `base` exactly, so it is the only one of the four that
needed no re-drawing. What is left to add at 119 keys is not icons, it is
**subjects**: `vpn`, `chat`, `signage`, `access-panel`, `barrier`, `cooling`,
`generator`, `rental`, `remote` and `contract` were each checked against the
map before being taken. One was renamed on the way in — it was picked as
"intercom" and draws a lock in a bracketed frame, which reads as an
access-control panel and not as a door station, so the key says what the glyph
shows.

**Icons8 and Flaticon were asked for and refused, and the reason is the
licence rather than the drawing.** Both are proprietary, both require
attribution on the free tier, and neither permits redistributing the source
files. This project **vendors rather than depends**, and the repository is
public — so vendoring either would put proprietary assets in a public repo.
There is no version of "add them" that avoids it. Flaticon's style had also
already been refused on rendering: Freepik is the same parent company and the
same filled-outline problem at 20px.

**The demand for a fifth pack is not there, and it is measurable.** 27 of the
127 keys are stored against a record; 100 are unused, and **none is missing**.
The question to ask before reading another pack is which *subject* an editor
could not find, not how many icons the pack holds.

**Reicon is the fifth pack and it yielded four**, which is that question
answered rather than ignored: `ram`, `password`, `bluetooth` and `legal`. MIT ©
REICON, 2,630 icons, and the four are the ones none of the 127 keys could
express — memory beside `cpu` and `disk`, a credential beside `lock` and
`access-card`, the fourth radio beside `wifi`, `signal` and `sim`, and a sector
`compliance` names a rule for rather than names. Everything else was already
there under a better name: `simcard` is `sim`, `headphone` is `headset`,
`cpu-charge` is `cpu`, `external-drive` is `disk`, `sitemap` is `network`.

**Its "Outline" weight is mixed, and it is the first pack here whose weight
cannot be trusted by name.** Some icons are stroked — `Activity` is
`viewBox 0 0 24 24`, `fill="none"`, `stroke="currentColor"`, 1.5, round caps,
which is `base` exactly. Others are **filled outlines** with no stroke at all.
Sampled across 40: **18 stroked, 22 filled — 45%.** The filled ones concentrate
in the *topical* categories, which is why a curated 53 subjects drawn from
Devices, IT, Security and Building survived the geometry check at **six**, and
why the four that ship come from `General` instead.

**All six of those first survivors were redundant anyway, and one collided.**
`computer` is `desktop`, `nodes` is `network`, `award` and `award-certificate`
are both `cert` — which has always drawn a rosette with ribbons — and `battery`
**is already a key**, so registering it would have silently replaced the Lucide
glyph every record pointing at `battery` renders. Passing the geometry check is
not the same as being a subject that is missing.

**`lab` was the fifth and rendering it is what refused it.** `Microscope` is
stroked and passes every check in the generator; at the 20px a list row uses it
reads as a *telescope*, an angled tube on a tripod, which is the wrong subject
rather than a rough one. Every alternative Reicon holds — `Flask`, `TestTube`,
`TestTube2`, `Atom`, `Dna` — is a filled outline. So the pack has no laboratory
glyph this set can wear, and the key is **not registered rather than registered
badly**: a subject an editor picks and gets a telescope for is worse than one
that is not offered at all.

**`stroke-miterlimit` is why the generator strips `stroke-*` as a pattern rather
than by name.** The first cut named the four attributes it expected, and
`Bluetooth3` and `Courthouse` both carry a fifth — which reached the output
kebab-cased. React logs *"Invalid DOM property"* as a `console.error` for one of
those, and `npm run audit` fails on any console error on any route, so it would
have broken every console screen showing a record that used one. There is a
guard now that throws on **any** remaining kebab-cased attribute, because the
list was the thing that was wrong.

**`base` and `P` live in `icon-base.ts`, not in `icons.tsx`.** Reicon is the
first pack vendored into a file of its own — every earlier one is written inline
— and a generated file importing `base` from `icons.tsx` while `icons.tsx`
imports its map back is a circular import in the module 109 components depend
on. It happens to resolve, because nothing in either file reads `base` before
render, which is exactly the kind of "works until somebody adds a top-level
constant" not worth carrying there. `icons.tsx` re-exports both, so every icon
in the product is still imported from one place.

**A wholesale import would have failed invisibly**, and the trap caught
something in every pack: an icon that is `fill="currentColor"` with no stroke
renders as **nothing at all** under `base`, which sets `fill: none` — on a
screen where a missing icon looks exactly like a record nobody gave one. 36 of
TailGrids' 245 are filled, including `IdCard` and `Printer`, which were both on
the shortlist until they were measured; so is Flowbite's `api-key`. Heroicons'
outline `Identification` is what `access-card` uses instead. Two TailGrids icons
also carry an 8x17 and a 16x16 viewBox rather than 24.

**Vendored, never depended on**, the pincode table's argument: `@tailgrids/icons`
declares `@babel/core`, `@svgr/core` and `fs-extra` as *runtime* dependencies —
its build tools, mis-declared — so installing it puts Babel and SVGR in this
application's `node_modules` to draw six glyphs.
