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

**The top bar's colour is one more setting, blank by default, and both schemes
come from it.** `theme_topbar` (public, `appearance`) is a hex like the other
five and rides on any kind of theme the way the fonts do — a choice about the
site, not about a palette. Blank means the theme's dark band, which is what the
strip was always painted in, so an install that never opens the box is
unchanged. It needed tokens of its own (`--color-topbar`, `-2`, `-line`,
`-ink`, `-muted`) rather than a value for `--color-dark`, because the dark band
paints thirty other things — the footer, the NOC panel, every CTA band — and a
"top bar colour" that recoloured the footer would be a surprise. Only the strip,
its search field and the panel under it read them.

`topBarBand()` in `lib/palette.ts` derives all five from the one hex, and
**everything in it is measured rather than stepped**. In light the bar is the
colour as typed; in dark it keeps the hue at the dark band's lightness with the
chroma capped, the `darkNeutrals()` rule, so a bright brand-blue bar is a deep
navy one in dark without a second value being asked for. `bar2` and `line` are
pushed toward the ink's side until they clear a ratio against the bar, because
a fixed lightness step is invisible on pure black. Ink and muted are pushed to
4.5:1 on **`bar2`**, the closer ground — a mid grey's black ink cleared AA on
the bar and failed on the raised tab column beside it. And **when no text
colour can pass, the bar moves**: `#e11d48` is the case, where black reaches
4.47:1 and white less, so the bar is pushed away from the ink from both sides
and the side that moves it least wins (`#d1003d` under white). The picker shows
the adjusted swatch the way it does for the five theme colours. All of this was
found by the gate on the first run — three of eight hostile inputs failed — and
none of it by reading the function.

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

## A company's own fonts (0.125.0)

Nineteen faces are vendored. A company with a brand typeface uploads it
instead: Site → Settings → Colour palette → *Your own fonts*.

**Two fixed slots, not a list.** `custom-1` and `custom-2`. A slot's id and
its CSS variable (`--font-custom-1`) never change, which is what lets the
rest of the theme machinery stay as it was: `fontFor()` — pure, called from
the palette generator with no settings in hand — answers for a custom id
without knowing what has been uploaded, and the root layout declares the
variable either way: as the uploaded face, or as the default body face while
the slot is empty. A theme still pointing at an emptied slot therefore falls
back to Inter rather than to an invalid `var()`. Two is a headline face and
a body face, which is all the site has roles for.

**What is stored.** `App\Support\CustomFonts`: eight rows in the public
`appearance` group (a name, a regular file, a bold file and a "variable"
flag per slot) and the files on the public disk under `fonts/` with a random
forty-character name. WOFF2 only, checked by extension *and* by the four
bytes every WOFF2 opens with — a TTF renamed `.woff2` would be served for a
year and never drawn. Not a media-library file: a font has no thumbnail,
nothing can be done to it there, and nothing but this class should be able
to delete a file the site is set in. A replaced file is deleted and its name
is never reused, so the answer can be cached for good. Emptying a slot takes
the site off it (`theme_font_display`/`_body` back to the defaults).

**Nothing typed reaches the stylesheet.** `customFontsCss()` declares the
family as `tw-custom-1`, never the name somebody typed, and builds the
file's address only from a stored path of exactly the shape the API writes
(`fontHref`). The typed name appears in the two font lists and nowhere else.

**Weights.** A variable font is one file declared `font-weight: 100 900`. A
static font is a regular declared at 400 and an optional bold at 700: the
site sets headings at 600 and 700, and CSS font matching sends both to the
700 face. With no bold file the browser thickens the regular one, which is
what a single static file can offer. Declaring a lone static file as a range
would stop that — the browser would believe it already had a 700.

**Served from the website's origin.** `/font/[name]` is a route handler that
fetches the file from the API's storage and hands it on as `font/woff2`,
immutable for a year. A picture can be shown cross-origin; a font is refused
without CORS headers, which Apache can be told to send and
`php artisan serve` cannot. Same-origin also puts the font behind whatever
CDN the website is behind, and keeps `font-src 'self'` true. The name must
be forty letters and digits and `.woff2`, or it is a 404 before any request
is made.

**In the page.** A `<style id="custom-fonts">` after the tokens, with a
`<link rel="preload">` for each face the site is actually set in (bold for
headings, regular for body). Its own element, because the appearance
preview replaces the tokens' text and these do not change with a palette.
Absent entirely on a site with no font of its own.

**The trap this hit.** The settings form's generic renderer draws every row
in a group that the group's own control does not claim, and `ThemePicker`
claims only `theme*`. The eight new rows were therefore drawn as bare text
inputs holding storage paths, posted with the tab — and since
`PATCH /admin/settings` refuses a `custom_font_*` key, **every save of the
appearance tab failed** with "Some values were rejected". The probe found it
by choosing the uploaded font and reading the API. The renderer skips those
rows now; the API's refusal stays, as the half that does not depend on the
frontend remembering.

**The panel** (`custom-fonts-panel.tsx`) sits inside the settings `<form>`,
so its controls are unnamed and its buttons `type="button"`, building a
`FormData` for their own Server Action — a nested form is dropped by the
browser, and a named file input would ride along with every settings save.
It is a `<details>`, closed until a font exists: two upload forms would be
the largest thing on the tab for the fewest people.

**Not every heading follows.** Several themes set their headings in a face
of their own (Editorial, Enterprise, Terminal…), and keep it whatever is
chosen here — as they always did for the built-in list. The probe reads the
heading under `/theme-preview/classic` for that reason.

`CustomFontTest`; `scripts/probes/custom-fonts.mjs` uploads one of the
repository's own WOFF2 files, chooses it, and checks the declaration, the
computed family, that the browser loaded the face, the file's origin, type
and cache, the preload, and that removing it puts everything back.
