# Theme generation

Five colours to every token, dark neutrals, fonts, the contrast gate.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**`npm run themes` checks 30 palettes — 15 presets, the one legacy ramp and
14 hostile inputs, each in both schemes.** It was 96: the 24 hand-tuned
legacy themes behind "Show 25 more presets" were retired on 2026-09-14 at the
client's request. `olive` stays in `lib/themes.ts` because it is not a choice
— it is the hand-tuned ramp the Technoware preset wears, the "default install
looks the same" promise — and `legacyThemeById()` stays for it. A stored id
from the retired list renders the house preset, which is what `themeFor()`
always did for an id it did not know; nothing else in the chain changed. Passing it is necessary, not
sufficient: `AUDIT_SCHEME=dark npm run audit` runs the browser audit against
the dark palette, and that is what caught the canvas and the status tokens.

**A theme is generated from five colours, and a typed hex is hue intent, not
a literal.** `lib/palette.ts` takes primary, secondary, accent, background
and text and derives every token the site consumes — the `brand-50…900`
ramp (~460 uses), `brand-ink` (207), the two companion ramps, the neutrals in
both schemes and the twelve identity hues. Each step sits at a fixed OKLCH
lightness and the steps that carry text are **pushed until they pass 4.5:1**:
`600`/`700` darker until white passes, `brand-ink` away from the card until
it passes on the card *and* on the `50` wash. That is why `#ffff00` typed as a
primary produces `#626200` buttons rather than yellow ones under white text,
and why the picker shows an "adjusted to" swatch beside a colour it moved.
Reading the hex literally would break the gate on the first bright input,
and a gate that only holds for the presets somebody looked at is a gate that
fails the first customer with a real brand colour — which is what the 14
hostile inputs in `theme-contrast.mjs` exist to prove it does not.

**Dark neutrals are derived from the theme's own hue, and for months they
were olive whatever the theme.** `darkScheme()` used to fix every neutral —
page, card, surfaces, lines, and the `brand-50/100` washes — to olive-tinted
greys for all 25 themes, so a blue theme's dark mode had green-grey under
blue buttons. `darkNeutrals(hue)` takes the primary's hue at chroma ≈ .008
(Material's tinted neutral), and `darkRamp()` gives the dark `300`/`400` tints
*more* chroma than their light counterparts — a tint that looks chalky on
white looks lit on near-black, which is the whole of "fluorescent on dark".
**`200` is deliberately not inverted**: it is the page-hero kicker over the
dark banner, measured at 4.74:1, and a dark `200` there is 1.7:1 — found by
the dark audit on the first run, not by reasoning. The twelve `--color-neon-N`
hues are re-tuned per palette against *its* `surface-2` and emitted with the
theme; the `globals.css` values are the no-JS fallback. `neon-contrast.mjs`
had them tuned against olive only.

**Secondary and Accent drive a defined starting set, and the blurb says so.**
Secondary: `Card` kickers and the homepage eyebrows, the outlined button's
hover, `Prose` link hover, the sign-in panel's gradient partner. Accent: the
`accent` badge tone (Featured), the storefront's New ribbon, `CtaBand`'s
band, the promo band's kicker. Everything else follows Primary. The two
companion ramps exist on every theme — a legacy theme derives them by hue
rotation (+30°, +150°) in `expand()` — so nothing can render unstyled.

**Fonts are the nineteen vendored faces, chosen by id.** `lib/font-choices.ts` is
the list, `fontFor()` falls back to the role's default for an unknown or
unsuitable id, and the API validates the id's *shape* only — a second list of
faces in PHP to refuse against is the `admin_path` drift with nothing to catch
it, and the fallback makes it unnecessary. Instrument Sans is display-only:
it ships as 600 and 700 alone, and CSS font matching would set a body in it
semibold without complaint. Nothing is fetched from Google at runtime.

**A fluorescent theme keeps its neon in the fill, never in the text.** The
five bright themes (`acid`, `electric`, `hotwire`, `flare`, `ultra`) put the
fluorescent hue at brand 300-500 — buttons, chips, and the whole dark scheme —
while brand-600/700 and `brandInk` are deep versions of the same hue, because
`#39ff14` on white is 1.4:1 and no gate will ever pass it. Their ramps were
*searched* against `scripts/theme-contrast.mjs` rather than chosen by eye; neon
picked by hand does not survive it. Watch `brand-ink on brand-50` in **dark**:
`darkScheme()` gives every theme the same fixed dark wash for brand-50 while
`brandInk` becomes the theme's own brand-300, so that pairing is the one a
bright theme fails first — it is what `ultra` failed on at 4.36:1.

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
