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

## Brand from a logo (0.173.0)

An editor presses one button and the palette comes from the company's logo.
Three readings of the same file, offered as tiles; the one they press fills
the Custom colours fields and **Save is what applies it**.

**The API reads the logo, not the browser.** All three places that offer this
already have the file on the API's disk, and a browser cannot read it: the
logo is served from the API's origin, so a canvas drawn from it is tainted
and a `fetch` of it is refused — the wall 0.172.0's players hit. Reading it
in PHP is one implementation that also works in the setup wizard, where there
is no React at all.

**Two readers, because a logo is as often a vector as a picture.** GD cannot
read SVG, and most logos in this product are SVG.

| File | How |
|---|---|
| PNG, JPG, WebP, GIF | `Placeholder`'s own GD branch — the same header read, the same megapixel refusal, the same `imagecreatefrom*` — resampled to 96px on the long side, pixels bucketed to the nearest 16 and counted, each bucket reported as its own mean so the answer is a colour that is *in* the picture |
| SVG | `DOMDocument` with `LIBXML_NONET`, as `SvgSanitiser` loads: `fill`, `stroke`, `stop-color`, `flood-color` and `lighting-color`, from attributes, from a `style` attribute and from a `<style>` block |

Three things each reader gets right because they were got wrong first in
thought:

- **A transparent pixel is not a colour.** GD's alpha runs 0 opaque to 127
  clear, the opposite way round from CSS; over half clear is skipped. Without
  it, black-at-alpha-0 is the most common value in every logo with a margin
  and leads every reading.
- **A `<style>` block is where a logo usually states its colours** — the
  common Illustrator export puts them in classes and nowhere else. Read the
  attributes alone and a plainly two-tone file answers "no colour".
- **Weight is area where a shape states one.** A `rect`, `circle` or
  `ellipse` contributes its share of the `viewBox` rather than one element's
  worth, so a logo whose ground is one big rect does not lose to a mark made
  of forty small paths.

**A colour is a brand colour only if it has chroma** — `BrandPalette::MIN_CHROMA`,
0.04 in OKLCH. Measured: `#f7f7f7` is 0.003 and `#808080` is 0, while the
palest brand colour the fifteen presets hold is over 0.05. So the white, the
black and the greys that are most of any logo are never offered, and a black
wordmark answers "there is nothing to take from this" rather than painting the
site grey. **OKLCH rather than HSL**, because HSL calls `#ffff00` and
`#000080` equally saturated, so a floor written in HSL lets a logo's
near-white through.

**What a reading fills:** Primary, Secondary, Accent and the top bar — never
the Background or the Text. A logo says nothing about the page's ground, and
those two are what make a site unreadable.

- `used` "Most of the logo", `bold` "The boldest colour", `deep` "The darkest
  colour". Each takes its leader as Primary and **the rest in its own order**,
  so the boldest reading's Secondary is the second boldest, not the second
  most used.
- **The bar is the darkest brand colour**, which is the one that can carry
  white text — and with only one brand colour it is **left blank**. Blank
  means the generator derives the bar from the brand in both schemes, and
  pinning Primary into it would throw that derivation away for nothing.
- **One or two colours derive the rest** from Primary's hue, +150° for
  Secondary and −40° for Accent, the relationship the presets hold. The
  reading carries `derived` and the screen says so in a sentence.
- Two readings that come out identical are collapsed: offering the same tile
  twice asks an editor to choose between two identical things.

**Nothing here can ship a failing contrast, and that is structural rather
than checked.** Every hex goes to the frontend's generator, where a typed hex
is hue intent and never a literal — it pushes each colour until it clears
WCAG AA exactly as it does for one an editor types, and `npm run themes`
gates that across thirty palettes. So these classes choose colours and make
no promise about contrast, and no contrast check lives here.

**It suggests and never writes**, with one exception. `POST
/admin/settings/palette-from-logo` is `role:admin`, throttled 20/min, and a
test asserts the settings are byte-identical after it. The exception is the
**setup wizard**, which has no second screen to save from: there a tick
applies the reading through `App\Support\System\LogoBrand::apply()` — out of
the framework-free `Wizard.php` and somewhere a test can reach it, the
`Branding::apply()` pattern.

**The wizard's screen sits between Install and Start the website**, not
beside the company's name where it belongs on screen. The site step runs
before the environment is written and before the tables exist, so there is no
media library to put a file in and no settings row to point at it; by the
screen after Install, Laravel is up, and the warm step that follows renders
the pages with whatever palette was chosen. That one step posts
`multipart/form-data`, so the handler reads `$_POST` for it — a boundary
cannot be written by hand, and `php://input` is not JSON there. The upload
goes through `MediaUploader`, so the library's limits and the SVG sanitiser
apply as they would in the console.

**And it boots Laravel before it reads the logo's bytes**, which is where
driving a real install earned its keep. `Wizard.php` is framework-free until
`laravel()` — that is the line requiring `vendor/autoload.php` — so an `App\`
class named above it is a fatal rather than a refusal. The SVG content check
sat above it, and an SVG is what most logos are: uploading one answered
`Class "App\Support\SvgSanitiser" not found` with a 500, while a PNG worked
(`getimagesize` is PHP's own). The boot is first now, and everything above it
is a check PHP can make alone — the file arriving, the host's upload error,
the extension, the size — so a file this server was never going to take is
still refused without paying to boot the framework.

No audit reaches the wizard: on a checkout it answers 404 by design, since
there is no `config/` beside `api/`. So the pin is a source read —
`LogoBrandTest::test_the_wizard_boots_laravel_before_it_reads_the_logo` asserts
the boot precedes every class in that method the autoloader is needed for, and
fails by name when the order is put back. The whole screen was driven once
against a throwaway install (a copy of `api/` under `/d/tmp` with its own
`config/` and `storage/`, a scratch database, the wizard taken from unlock to
brand): the chosen reading wrote `theme: custom`, the three brand colours and
the bar, and left Background and Text as the preset had them.

**The media library hands a picture over as a link**,
`/admin/themes?palette=<path>`, and only for an administrator: colours do not
travel between screens, the screen that owns them reads them. A path rather
than an id, because the endpoint takes a path and a second way to name a file
is a second lookup rule to keep in step.

`ColourTest`, `LogoColoursTest`, `BrandPaletteTest`, `PaletteFromLogoTest`,
`LogoBrandTest`.

## Google fonts (0.179.0)

Any Google font can be chosen for headlines or body text, and **a visitor's
browser never contacts Google**: the API copies the font to this server once
and the website serves it from its own origin. No consent question, no CSP
change, nothing breaks while Google is unreachable.

- **The list is committed.** `web/scripts/build-google-fonts.mjs` writes
  `api/resources/google-fonts.json` from Google's public family metadata (no
  key); re-run it by hand to refresh. The API searches it
  (`GoogleFontCatalogue`) so an editor's typing never calls Google and the
  file never reaches a bundle. **Noto is left out** (the client, 2026-10-14):
  its CJK families are hundreds of files each.
- **Install** (`GoogleFonts::install`, `POST /admin/settings/google-fonts`):
  the CSS2 API asked for 400/600/700 (those the family has; none of them, the
  nearest to 400 alone) with a Chrome user agent — Google sends WOFF2 only to
  one, and `SafeHttp::get()` would put its own agent first, so the request is
  built from `SafeHttp::request()`. Every file URL must be on
  `fonts.gstatic.com`, start `wOF2` and be under 2 MB. **A family over 60
  pieces is refused before anything downloads** (`MAX_FACES`): each piece is a
  download inside one request, and a timed-out request leaves files with no
  row. A failure deletes what was written; two installs at once resolve to the
  one row (`UniqueConstraintViolationException`).
- **The id is `g-<slug>`.** The settings save refuses one that is not
  installed — unlike a vendored id the website has no face to fall back to.
  Removing a font in use is refused, naming the role.
- **Publishing.** `/settings` carries `google_fonts`: every installed font
  (not only those in use, so the console's live preview can draw one chosen
  before Save), paths only. `lib/google-fonts.ts` turns it into `@font-face`
  rules under our family name (`tw-g-<slug>`), each with Google's
  `unicode-range`, and a `--font-g-<slug>` variable; a path is used only when
  it has the exact shape the API writes and belongs to its slug, and a range
  only when it is made of range characters. Files are served by
  `/font/g/<slug>/<n>.woff2`. `scripts/google-fonts.check.mjs` pins it.
- **Previews** in the console's font browser go through
  `/api/admin/google-fonts/preview/<slug>`, which the API answers from a
  cached Latin face on the private disk (`font-previews/`, pruned after 7 days
  by `technoware:prune-font-previews`), so the console never contacts Google
  either.
- **The site import** offers a Google font by name when the old site's family
  is in the list and not vendored, and copies it on commit.
