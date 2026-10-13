# 0.173.0 — Brand from a logo

Release A6 of the 2.0 roadmap. Approved 2026-10-13.

## Intent

An editor uploads the company's logo and presses one button; the site's
palette comes from it. Today a palette is six hex values somebody types,
which means a customer either reads their brand guidelines into six boxes or
ships the house olive.

## The client's decisions

- **It fills the brand three and the top bar** — Primary, Secondary, Accent,
  `theme_topbar`. **Background and Text are never touched**: a logo says
  nothing about the page's ground, and those two are what make a site
  unreadable.
- **A one-colour logo is used, and the rest derived.** That colour becomes
  Primary and the other two are derived from its hue. A logo with no colour at
  all — a black or white wordmark, which is most wordmarks — is reported as
  having nothing to take, and nothing changes.
- **Three readings of the same logo**, as preview tiles: the most used colour
  leading, the boldest leading, the darkest leading.
- **Three places:** Site → Themes beside Custom colours; the media library's
  Edit dialog; and the setup wizard — **which gains the logo upload itself**,
  since it handles no file today.

## Binding constraints

- **The API reads the logo, in PHP.** Every one of the three places already
  has the file on the API's disk, and the browser cannot read it: the logo is
  served from the API origin, so a canvas would be tainted and a `fetch`
  refused — the CORS wall 0.172.0 hit. One implementation, no new client
  library, and it works identically in the wizard, where there is no React at
  all.
- **Two readers, because a logo is as often a vector as a picture.** GD cannot
  read SVG, and most logos in this product are SVG (every placeholder in the
  library is).
- **It cannot produce an unreadable palette, and that is structural rather
  than checked.** Every hex is handed to the frontend's generator, where a
  typed hex is hue intent and never a literal: it pushes each colour until it
  clears WCAG AA, exactly as it does for a colour an editor types, and
  `npm run themes` gates that across 30 palettes. Nothing here can ship a
  failing contrast, so nothing here needs its own contrast gate.
- **It suggests, never writes** (the AI assistant's rule). The reading lands
  in the Custom colours fields; Save applies it. The one exception is the
  wizard, where there is no second screen to save from — see §4.
- **No new dependency**, on either side.

## 1. API — reading the colours

**`App\Support\Media\LogoColours`.**

```php
/** @return list<array{hex: string, share: float}> ordered by share, descending */
public static function read(string $absolutePath): array
```

`share` is 0–1, each colour's weight over the total weighed. The list holds
at most 12 entries and is empty for a file that cannot be read.

**Raster (JPEG, PNG, WebP, GIF)** — `Placeholder`'s own branch, verbatim down
to the megapixel guard and `upright()`: `getimagesize`, the
`UploadLimits::maxMegapixels()` refusal, `imagecreatefrom*`, then
`imagecopyresampled` to at most **96px** on its long side (the blur's 12px is
too coarse to tell two brand colours apart; 96px is ~9,000 samples, which is
plenty and still instant). Then every pixel:

- **skipped** when its alpha is over half transparent (a logo is usually on
  nothing);
- bucketed by rounding each channel to the nearest 16, so near-identical
  pixels from anti-aliasing count as one colour;
- counted, and the bucket's own mean colour kept as the hex, so the answer is
  a colour that is in the picture rather than a rounded one.

**SVG** — `DOMDocument` with `LIBXML_NONET`, the flags `SvgSanitiser` loads
with. Colour values are collected from `fill`, `stroke` and `stop-color`
attributes and from the declarations of a `style` attribute, on every element,
plus `<style>` blocks' declarations read with the same expression. `none`,
`currentColor`, `url(#…)` and `inherit` are skipped. Each colour's weight is
the number of elements that carry it, except that a `<rect>`, `<circle>` or
`<ellipse>` stating its own size contributes that area instead, scaled against
the `viewBox` — so a logo whose background is one big rect does not lose to a
logo-mark made of forty small paths.

`#abc`, `#aabbcc`, `rgb()`/`rgba()` and the 148 CSS colour keywords are read;
anything else is skipped. Alpha under 0.5 is skipped, as in the raster branch.

**Shared**: `App\Support\Colour` (new) holds `fromCss(string): ?string` (to
`#rrggbb`, lower-case), `chroma(string): float` and `lightness(string): float`
in OKLCH, and `rotate(string $hex, float $degrees): string`. Three call sites
need the same arithmetic and `SiteImport\Brand` has a copy of part of it; this
is where the next one goes.

## 2. API — the three readings

**`App\Support\Media\BrandPalette`.**

```php
/** @return array{readings: list<array{key: string, label: string, primary: string, secondary: string, accent: string, topbar: string}>, colours: list<array{hex: string, share: float}>} */
public static function from(array $colours): array
```

**A colour is a brand colour only if it has chroma** — `Colour::chroma()` of
at least **0.04** in OKLCH, the site import's own reasoning: the white, the
black and the greys that are most of any logo never are. The threshold is a
constant with its measurement beside it.

Three readings, from the brand colours only:

| `key` | `label` | Leads with |
|---|---|---|
| `used` | "Most of the logo" | the largest `share` |
| `bold` | "The boldest colour" | the highest `chroma` |
| `deep` | "The darkest colour" | the lowest `lightness` |

Each reading takes its leader as **Primary**, then the remaining brand colours
**in that reading's own order** as **Secondary** and **Accent** — so "the
boldest colour" gives the second boldest as Secondary, not the second most
used. Two readings that come out identical are collapsed, so a two-colour logo
offers one or two tiles rather than three the same.

**`topbar` is the darkest brand colour**, not the leader, because the bar
carries white text and the generator's gate is what has to pass; with only one
brand colour it is **left blank**, which is better than pinning it — blank
means the generator derives the bar from the brand in both schemes, and
writing Primary into it would throw that derivation away for no gain.

**Fewer than three brand colours**: the missing roles are derived from
Primary by `Colour::rotate()` — Secondary **+150°**, Accent **−40°** — the
relationship the fifteen presets hold, so a one-colour logo reads as a palette
somebody chose. The reading carries no flag for this; the screen says it in
one sentence (§3).

**No brand colour at all** is an empty `readings`, which is the 422 in §3.

## 3. API — the endpoint

**`POST /admin/settings/palette-from-logo`**, `role:admin`, throttled 20/min,
declared in `admin-admin.php` beside the other `settings/*` actions.

- **Body:** `path` — optional, a media-library path. Absent means the
  `logo_path` setting.
- **200** `{data: {readings: [...], colours: [...], from: {path, url}}}`.
- **422 on `path`**, one sentence each: no logo is set ("Upload your logo
  first, under Settings → General."), the path is in no media row, the file is
  not a picture, the file could not be read ("That file could not be read as a
  picture."), and — the one that is not about the file — **no colour**: "This
  logo is black, white or grey, so there is no brand colour to take from it.
  Type your colours in below."

`role:admin` because the palette is a settings write and settings are an
administrator's. The media library is a content manager's screen, so its
button is drawn only for an account that may reach Themes (§4).

**Tests** — `LogoColoursTest` (unit): a two-colour PNG and a 1×1 WebP built by
GD in the test; an SVG with `fill` attributes, one with `style`, one with a
`<style>` block, one with a gradient, one with a big background rect against
many small paths, one with `currentColor` and `none` only, a grey-only
wordmark, and a transparent-heavy logo. `BrandPaletteTest` (unit): the three
readings and their order, the collapse of identical readings, the derivation
from one colour, the chroma floor, the empty answer.
`PaletteFromLogoTest` (feature): the 200's shape, each 422, the roles (a
content manager and a customer token are both refused), and that **nothing is
written** — the settings are compared before and after.

## 4. The three places

**Site → Themes** (`settings/theme-picker.tsx`). Inside the Custom colours
panel, above the six fields: a button **"Take our colours from the logo"**,
the logo's own thumbnail beside it, and on a press the readings as tiles —
each a swatch row plus a real `Button` and card drawn in that reading, which
the panel's existing preview machinery already renders. Pressing a tile calls
the picker's own `setInputs`/`setTopbar` and selects Custom colours; **Save is
what applies it**. A derived reading carries the sentence "Secondary and
Accent are derived from your one logo colour." Every refusal is the API's
sentence, under the button.

The Server Action is `paletteFromLogoAction(path?)` in
`settings/theme-actions.ts`, returning the readings or `{error}` — never a raw
`ApiError` (the `importMediaUrlAction` shape).

**`?palette=<media path>`** on the screen runs the extraction on load for that
file, which is how the media library hands over. The path, not the id: the
endpoint takes a path, and a second way to name a file would be a second
lookup rule to keep in step. It is checked against the media library like any
other, so a typed one is the ordinary 422.

**The media library's Edit dialog** (`media/edit-image-dialog.tsx`): for an
administrator only, a row **"Make the site's colours from this"** that links
to `/admin/themes?palette=<the file's path, encoded>`. A link, not a fetch: colours do not travel
between screens, the screen that owns them fetches them. Drawn only for a
raster or SVG image.

**The setup wizard** (`api/install/Wizard.php`), which handles no file today:

- The **site step's** form gains a logo field. The step keeps its JSON post;
  the file goes to a **new action, `logo`**, posted as `multipart/form-data` —
  one branch in `dispatch()`, reading `$_FILES['logo']`, holding it to png,
  jpg, jpeg, webp and svg by extension **and** by `getimagesize` (an SVG by
  `SvgSanitiser::clean()` returning non-null), and at most 2 MB. It answers
  `{path, url, colours: [...], readings: [...]}` — the same two classes, which
  are plain PHP and need no framework.
- The file is written through `MediaUploader` when Laravel is up (it is: the
  site step runs after the database step), so it lands in the library with its
  sanitising and limits, and `logo_path` is set.
- The step then shows the first reading's three swatches and a tick box,
  **"Use these colours for the site"**, ticked when there is a brand colour
  and absent when there is not. `site()` writes `theme = custom` and the four
  colours when it is ticked.
- **This also closes a known launch risk**: with no logo the header prints the
  company name as text (CLAUDE.md, Known risks).

**`WizardLogoTest`**: the upload's refusals (an extension that is not on the
list, a file whose bytes are not a picture, over the cap), that a ticked box
writes the four settings and `theme = custom`, that an unticked one writes
none, and that a grey logo offers no tick box.

## 5. Verification

- `php artisan test`, `composer analyse` → "No errors", `npx tsc --noEmit`,
  `npm run lint`.
- **`scripts/probes/logo-palette.mjs`**: uploads a two-colour SVG whose hexes
  the probe knows and a two-colour PNG it generates, sets each as the logo,
  presses the button on Themes, and checks the fields take those colours, that
  a tile press changes the preview, that a grey wordmark is refused with the
  API's sentence, and that nothing is saved until Save. It deletes every file
  and restores the logo setting it found.
- `npm run audit` light and dark on `/admin/themes` and the media library, and
  `npm run audit:mobile` on both.
- The wizard is driven by hand against a fresh install, because no audit
  reaches it.

## Not in scope

- **Fonts.** A logo cannot name its typeface, and reading a wordmark's
  letterforms is a different feature.
- **Matching against the fifteen presets** — the client chose a palette made
  from the logo.
- **Rasterising an SVG.** Its declared colours are better evidence than its
  pixels would be, and Imagick is not a dependency here.
