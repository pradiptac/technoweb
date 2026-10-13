# Brand from a logo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An editor presses one button and the site's palette comes from the company's logo.

**Architecture:** Two small PHP classes read a logo's colours (GD for a raster, DOMDocument for an SVG) and turn them into three candidate palettes; one `role:admin` endpoint answers them; three screens call it, and none of them writes a setting — the fields fill and Save applies, except in the setup wizard, which has no second screen.

**Tech Stack:** Laravel 13, GD, DOMDocument, Next 16 Server Actions, the existing theme generator in TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-13-brand-from-logo-design.md`

## Global Constraints

- **`web/` is CRLF, `api/*.php` is LF.** Write PHP and long files with the Write tool, never a bash heredoc (it eats backslashes and truncates).
- **No new dependency**, on either side.
- **Nothing here writes a setting** except the wizard's own step.
- **Every hex handed to the frontend is hue intent, not a literal** — the generator pushes it until it clears WCAG AA. Do not add a contrast check here; `npm run themes` already gates 30 palettes.
- **`role:admin`** for the endpoint. A content manager and a customer token are both refused.
- **Colours are lower-case `#rrggbb`** everywhere on the wire.
- **The chroma floor is 0.04 OKLCH**, a named constant with its reasoning beside it.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Review Focus

1. **An SVG whose colours are only in a `<style>` block** — the common Illustrator export. If only attributes are read, the whole class answers "no colour" for a file that is plainly two-tone.
2. **A logo that is one big coloured rectangle behind a small mark** — weighing by element count makes the mark win, which is the opposite of what a person sees.
3. **A raster logo on a transparent ground** — if alpha is not skipped, black-at-alpha-0 is the most common "colour" in the file and leads every reading.
4. **A reading with two brand colours** asked for three roles — Accent must be derived rather than left blank or repeated, or the palette has a hole the generator fills with the house colour.
5. **The wizard's upload with no file chosen**, or a second press — it must not write a blank `logo_path` or a half-stored file.

---

### Task 1: Colour arithmetic

**Files:**
- Create: `api/app/Support/Colour.php`
- Test: `api/tests/Unit/ColourTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `Colour::fromCss(string): ?string`, `Colour::chroma(string $hex): float`, `Colour::lightness(string $hex): float`, `Colour::rotate(string $hex, float $degrees): string`. Every hex in and out is lower-case `#rrggbb`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Unit;

use App\Support\Colour;
use PHPUnit\Framework\TestCase;

class ColourTest extends TestCase
{
    public function test_it_reads_every_css_colour_form(): void
    {
        $this->assertSame('#aabbcc', Colour::fromCss('#abc'));
        $this->assertSame('#aabbcc', Colour::fromCss('#AABBCC'));
        $this->assertSame('#ff0000', Colour::fromCss('rgb(255, 0, 0)'));
        $this->assertSame('#ff0000', Colour::fromCss('rgba(255,0,0,0.9)'));
        $this->assertSame('#4169e1', Colour::fromCss('royalblue'));
        $this->assertSame('#ffffff', Colour::fromCss(' WHITE '));
    }

    public function test_it_refuses_what_is_not_a_colour(): void
    {
        foreach (['none', 'currentColor', 'inherit', 'url(#grad)', 'transparent', '', 'rgb(1,2)'] as $value) {
            $this->assertNull(Colour::fromCss($value), $value);
        }
    }

    public function test_a_colour_under_half_opaque_is_not_a_colour(): void
    {
        $this->assertNull(Colour::fromCss('rgba(255,0,0,0.3)'));
        $this->assertSame('#ff0000', Colour::fromCss('rgba(255,0,0,0.5)'));
    }

    public function test_grey_has_no_chroma_and_a_brand_colour_does(): void
    {
        foreach (['#ffffff', '#000000', '#808080', '#f7f7f7'] as $grey) {
            $this->assertLessThan(0.04, Colour::chroma($grey), $grey);
        }
        foreach (['#1d4ed8', '#e11d48', '#6f8641'] as $brand) {
            $this->assertGreaterThan(0.04, Colour::chroma($brand), $brand);
        }
    }

    public function test_lightness_orders_dark_before_light(): void
    {
        $this->assertLessThan(Colour::lightness('#ffffff'), Colour::lightness('#000000'));
        $this->assertLessThan(Colour::lightness('#dbeafe'), Colour::lightness('#1e3a8a'));
    }

    public function test_rotating_the_hue_keeps_the_colour_as_strong(): void
    {
        $turned = Colour::rotate('#1d4ed8', 150);

        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $turned);
        $this->assertNotSame('#1d4ed8', $turned);
        $this->assertEqualsWithDelta(Colour::chroma('#1d4ed8'), Colour::chroma($turned), 0.03);
        $this->assertEqualsWithDelta(Colour::lightness('#1d4ed8'), Colour::lightness($turned), 0.03);
    }

    public function test_rotating_grey_stays_grey(): void
    {
        $this->assertLessThan(0.04, Colour::chroma(Colour::rotate('#808080', 150)));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api && php artisan test tests/Unit/ColourTest.php`
Expected: FAIL — `Class "App\Support\Colour" not found`.

- [ ] **Step 3: Write the class**

sRGB → linear → OKLab → OKLCH and back, the formulas the frontend's `lib/palette.ts` already uses. The 148 CSS keywords go in one `const KEYWORDS` map.

```php
<?php

namespace App\Support;

/**
 * Colour arithmetic in OKLCH, for the three places that need the same sums
 * (`Media\LogoColours`, `Media\BrandPalette`, `SiteImport\Brand`).
 *
 * OKLCH rather than HSL because HSL's "saturation" calls `#ffff00` and
 * `#000080` equally saturated, so a chroma floor written in HSL lets the
 * white and the navy of a logo through as brand colours and keeps neither
 * ordering honest. The same reason `lib/palette.ts` generates in OKLCH.
 *
 * Every hex in and out is lower-case `#rrggbb`. A colour under half opaque
 * is not a colour: a logo's ground is usually a transparent black.
 */
final class Colour
{
    /** @var array<string, string> The CSS colour keywords, lower-case. */
    private const KEYWORDS = [
        'aliceblue' => '#f0f8ff', 'antiquewhite' => '#faebd7', /* … all 148 … */
        'royalblue' => '#4169e1', 'white' => '#ffffff', 'yellow' => '#ffff00',
    ];

    public static function fromCss(string $value): ?string
    {
        $value = strtolower(trim($value));

        if ($value === '' || in_array($value, ['none', 'currentcolor', 'inherit', 'transparent'], true)) {
            return null;
        }

        if (isset(self::KEYWORDS[$value])) {
            return self::KEYWORDS[$value];
        }

        if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/', $value, $m)) {
            $hex = $m[1];

            return '#'.(strlen($hex) === 3 ? $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2] : $hex);
        }

        if (preg_match('/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,\/]\s*([\d.%]+)\s*)?\)$/', $value, $m)) {
            if (isset($m[4]) && $m[4] !== '' && self::alpha($m[4]) < 0.5) {
                return null;
            }

            return self::hex((int) round((float) $m[1]), (int) round((float) $m[2]), (int) round((float) $m[3]));
        }

        return null;
    }

    public static function hex(int $r, int $g, int $b): string
    {
        return sprintf('#%02x%02x%02x', max(0, min(255, $r)), max(0, min(255, $g)), max(0, min(255, $b)));
    }

    public static function chroma(string $hex): float
    {
        [, $c] = self::oklch($hex);

        return $c;
    }

    public static function lightness(string $hex): float
    {
        [$l] = self::oklch($hex);

        return $l;
    }

    public static function rotate(string $hex, float $degrees): string
    {
        [$l, $c, $h] = self::oklch($hex);

        return self::fromOklch($l, $c, fmod($h + $degrees + 360, 360));
    }

    // … oklch(), fromOklch(), alpha(), the sRGB transfer and the OKLab matrices …
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd api && php artisan test tests/Unit/ColourTest.php`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Colour.php api/tests/Unit/ColourTest.php
git commit -m "0.173.0: colour arithmetic in OKLCH, shared by the three callers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Reading a logo's colours

**Files:**
- Create: `api/app/Support/Media/LogoColours.php`
- Test: `api/tests/Unit/LogoColoursTest.php`

**Interfaces:**
- Consumes: `Colour::fromCss`, `Colour::hex` (Task 1).
- Produces: `LogoColours::read(string $absolutePath): array` — `list<array{hex: string, share: float}>`, ordered by `share` descending, at most 12 entries, `[]` for a file it cannot read.

- [ ] **Step 1: Write the failing test**

Every fixture is built in the test, so the suite carries no binary files.

```php
<?php

namespace Tests\Unit;

use App\Support\Media\LogoColours;
use PHPUnit\Framework\TestCase;

class LogoColoursTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir().'/logo-colours-'.bin2hex(random_bytes(4));
        mkdir($this->dir);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir.'/*') ?: [] as $f) {
            unlink($f);
        }
        rmdir($this->dir);
        parent::tearDown();
    }

    private function svg(string $body): string
    {
        $path = $this->dir.'/logo-'.bin2hex(random_bytes(3)).'.svg';
        file_put_contents($path, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'.$body.'</svg>');

        return $path;
    }

    /** Two thirds red, one third blue, as a PNG with a transparent margin. */
    private function png(): string
    {
        $image = imagecreatetruecolor(60, 30);
        imagealphablending($image, false);
        imagesavealpha($image, true);
        imagefill($image, 0, 0, (int) imagecolorallocatealpha($image, 0, 0, 0, 127));
        imagefilledrectangle($image, 0, 0, 39, 29, (int) imagecolorallocate($image, 255, 0, 0));
        imagefilledrectangle($image, 40, 0, 59, 29, (int) imagecolorallocate($image, 0, 0, 255));
        $path = $this->dir.'/logo.png';
        imagepng($image, $path);
        imagedestroy($image);

        return $path;
    }

    public function test_a_raster_logo_is_read_by_share(): void
    {
        $colours = LogoColours::read($this->png());

        $this->assertNotEmpty($colours);
        $this->assertSame('#ff0000', $colours[0]['hex']);
        $this->assertSame('#0000ff', $colours[1]['hex']);
        $this->assertGreaterThan($colours[1]['share'], $colours[0]['share']);
        $this->assertEqualsWithDelta(1.0, array_sum(array_column($colours, 'share')), 0.001);
    }

    public function test_a_transparent_ground_is_not_the_logos_colour(): void
    {
        foreach (LogoColours::read($this->png()) as $colour) {
            $this->assertNotSame('#000000', $colour['hex']);
        }
    }

    public function test_an_svg_is_read_from_its_fill_attributes(): void
    {
        $colours = LogoColours::read($this->svg(
            '<path d="M0 0h10v10H0z" fill="#1d4ed8"/><path d="M20 0h10v10H20z" fill="#e11d48"/>'
        ));

        $this->assertSame(['#1d4ed8', '#e11d48'], array_column($colours, 'hex'));
    }

    public function test_an_svg_is_read_from_a_style_attribute_and_a_style_block(): void
    {
        $attribute = LogoColours::read($this->svg('<path d="M0 0h10v10H0z" style="fill:#1d4ed8;stroke:#e11d48"/>'));
        $this->assertSame(['#1d4ed8', '#e11d48'], array_column($attribute, 'hex'));

        $block = LogoColours::read($this->svg(
            '<style>.a{fill:#1d4ed8}.b{fill:#e11d48}</style><path class="a" d="M0 0h1v1H0z"/><path class="b" d="M2 0h1v1H2z"/>'
        ));
        $this->assertEqualsCanonicalizing(['#1d4ed8', '#e11d48'], array_column($block, 'hex'));
    }

    public function test_a_gradients_stops_are_colours(): void
    {
        $colours = LogoColours::read($this->svg(
            '<defs><linearGradient id="g"><stop stop-color="#1d4ed8"/><stop offset="1" stop-color="#e11d48"/></linearGradient></defs>'
            .'<path d="M0 0h10v10H0z" fill="url(#g)"/>'
        ));

        $this->assertEqualsCanonicalizing(['#1d4ed8', '#e11d48'], array_column($colours, 'hex'));
    }

    public function test_a_big_background_beats_many_small_marks(): void
    {
        $marks = str_repeat('<path d="M1 1h2v2H1z" fill="#e11d48"/>', 40);
        $colours = LogoColours::read($this->svg('<rect width="100" height="100" fill="#1d4ed8"/>'.$marks));

        $this->assertSame('#1d4ed8', $colours[0]['hex'], 'the rect covers the logo, so it leads');
    }

    public function test_an_svg_with_no_colour_of_its_own_reads_as_nothing(): void
    {
        $this->assertSame([], LogoColours::read($this->svg('<path d="M0 0h10v10H0z" fill="currentColor"/><path d="M1 1h2v2H1z" fill="none"/>')));
    }

    public function test_a_file_it_cannot_read_is_no_colours_and_no_error(): void
    {
        $broken = $this->dir.'/broken.svg';
        file_put_contents($broken, '<svg><path fill="#1d4ed8"');

        $this->assertSame([], LogoColours::read($broken));
        $this->assertSame([], LogoColours::read($this->dir.'/missing.png'));
    }

    public function test_near_identical_pixels_count_as_one_colour(): void
    {
        $image = imagecreatetruecolor(40, 10);
        imagefilledrectangle($image, 0, 0, 19, 9, (int) imagecolorallocate($image, 255, 0, 0));
        imagefilledrectangle($image, 20, 0, 39, 9, (int) imagecolorallocate($image, 253, 2, 1));
        $path = $this->dir.'/close.png';
        imagepng($image, $path);
        imagedestroy($image);

        $this->assertCount(1, LogoColours::read($path));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api && php artisan test tests/Unit/LogoColoursTest.php`
Expected: FAIL — `Class "App\Support\Media\LogoColours" not found`.

- [ ] **Step 3: Write the class**

The raster branch copies `Placeholder::make`'s opening verbatim — `getimagesize`, the `UploadLimits::maxMegapixels()` refusal, the `imagecreatefrom*` match, `upright()` — then resamples to at most 96px on the long side and counts. The SVG branch loads with `DOMDocument` and `LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING`, as `SvgSanitiser::clean()` does, walks every element for `fill`, `stroke`, `stop-color` and `style`, and reads `<style>` blocks with one expression over their declarations. Weight is the element count, except a `rect`, `circle` or `ellipse` stating its size, which contributes its area over the `viewBox`'s.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd api && php artisan test tests/Unit/LogoColoursTest.php`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Media/LogoColours.php api/tests/Unit/LogoColoursTest.php
git commit -m "0.173.0: a logo's colours, from its pixels or its markup

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The three readings

**Files:**
- Create: `api/app/Support/Media/BrandPalette.php`
- Test: `api/tests/Unit/BrandPaletteTest.php`

**Interfaces:**
- Consumes: `Colour::chroma`, `Colour::lightness`, `Colour::rotate` (Task 1); the shape `LogoColours::read()` returns (Task 2).
- Produces: `BrandPalette::from(array $colours): array` — `array{readings: list<array{key, label, primary, secondary, accent, topbar}>, colours: list<array{hex, share}>}`. `topbar` is `''` when it is to be left blank. `BrandPalette::MIN_CHROMA` is `0.04`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Unit;

use App\Support\Colour;
use App\Support\Media\BrandPalette;
use PHPUnit\Framework\TestCase;

class BrandPaletteTest extends TestCase
{
    /** @param list<array{string, float}> $pairs */
    private function colours(array $pairs): array
    {
        return array_map(fn ($p) => ['hex' => $p[0], 'share' => $p[1]], $pairs);
    }

    public function test_three_readings_lead_with_three_different_colours(): void
    {
        // Most used: the pale blue. Boldest: the pink. Darkest: the navy.
        $out = BrandPalette::from($this->colours([
            ['#93c5fd', 0.5], ['#e11d48', 0.3], ['#172554', 0.2],
        ]));

        $by = array_column($out['readings'], null, 'key');
        $this->assertSame(['used', 'bold', 'deep'], array_keys($by));
        $this->assertSame('#93c5fd', $by['used']['primary']);
        $this->assertSame('#e11d48', $by['bold']['primary']);
        $this->assertSame('#172554', $by['deep']['primary']);
    }

    public function test_a_reading_orders_its_other_roles_by_its_own_measure(): void
    {
        $out = BrandPalette::from($this->colours([
            ['#93c5fd', 0.5], ['#e11d48', 0.3], ['#f59e0b', 0.2],
        ]));
        $bold = array_column($out['readings'], null, 'key')['bold'];

        $this->assertSame('#e11d48', $bold['primary']);
        $this->assertGreaterThan(Colour::chroma($bold['accent']), Colour::chroma($bold['secondary']));
    }

    public function test_the_greys_of_a_logo_are_never_brand_colours(): void
    {
        $out = BrandPalette::from($this->colours([
            ['#ffffff', 0.7], ['#000000', 0.2], ['#1d4ed8', 0.1],
        ]));

        foreach ($out['readings'] as $reading) {
            $this->assertSame('#1d4ed8', $reading['primary']);
            foreach (['secondary', 'accent'] as $role) {
                $this->assertGreaterThan(BrandPalette::MIN_CHROMA, Colour::chroma($reading[$role]), $role);
            }
        }
    }

    public function test_one_colour_derives_the_other_two_and_leaves_the_bar_blank(): void
    {
        $out = BrandPalette::from($this->colours([['#1d4ed8', 1.0]]));

        $this->assertCount(1, $out['readings'], 'three identical readings are one');
        $reading = $out['readings'][0];
        $this->assertSame('#1d4ed8', $reading['primary']);
        $this->assertSame('', $reading['topbar'], 'the generator derives the bar better than we can pin it');
        foreach (['secondary', 'accent'] as $role) {
            $this->assertNotSame('#1d4ed8', $reading[$role], $role);
            $this->assertGreaterThan(BrandPalette::MIN_CHROMA, Colour::chroma($reading[$role]), $role);
        }
    }

    public function test_two_colours_derive_the_third(): void
    {
        $out = BrandPalette::from($this->colours([['#1d4ed8', 0.6], ['#e11d48', 0.4]]));

        foreach ($out['readings'] as $reading) {
            $this->assertNotSame($reading['secondary'], $reading['accent'], 'a role is never repeated');
            $this->assertGreaterThan(BrandPalette::MIN_CHROMA, Colour::chroma($reading['accent']));
        }
    }

    public function test_the_bar_is_the_darkest_brand_colour(): void
    {
        $out = BrandPalette::from($this->colours([
            ['#93c5fd', 0.5], ['#172554', 0.3], ['#e11d48', 0.2],
        ]));

        foreach ($out['readings'] as $reading) {
            $this->assertSame('#172554', $reading['topbar']);
        }
    }

    public function test_a_logo_with_no_colour_offers_no_reading(): void
    {
        $out = BrandPalette::from($this->colours([['#ffffff', 0.8], ['#303030', 0.2]]));

        $this->assertSame([], $out['readings']);
        $this->assertCount(2, $out['colours'], 'what it found is still reported');
    }

    public function test_nothing_at_all_is_no_reading_and_no_error(): void
    {
        $this->assertSame(['readings' => [], 'colours' => []], BrandPalette::from([]));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api && php artisan test tests/Unit/BrandPaletteTest.php`
Expected: FAIL — `Class "App\Support\Media\BrandPalette" not found`.

- [ ] **Step 3: Write the class**

Filter to brand colours by `MIN_CHROMA`; build the three orderings; for each take the leader plus the next two in that ordering, deriving a missing role with `Colour::rotate($primary, 150)` for Secondary and `rotate($primary, -40)` for Accent; `topbar` is the darkest brand colour, or `''` with fewer than two; collapse readings whose four values match.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd api && php artisan test tests/Unit/BrandPaletteTest.php`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Media/BrandPalette.php api/tests/Unit/BrandPaletteTest.php
git commit -m "0.173.0: three readings of a logo's colours

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The endpoint

**Files:**
- Modify: `api/app/Http/Controllers/Api/V1/Admin/SettingController.php` — add `paletteFromLogo(Request $request)`
- Modify: `api/routes/api/admin-admin.php` — the route, beside the other `settings/*` actions
- Test: `api/tests/Feature/PaletteFromLogoTest.php`

**Interfaces:**
- Consumes: `LogoColours::read` (Task 2), `BrandPalette::from` (Task 3), `Setting::get('logo_path')`, the `Media` model.
- Produces: `POST /admin/settings/palette-from-logo` → `{data: {readings, colours, from: {path, url}}}`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\Media;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PaletteFromLogoTest extends TestCase
{
    use RefreshDatabase;

    private function logo(string $body = '<path fill="#1d4ed8" d="M0 0h10v10H0z"/><path fill="#e11d48" d="M20 0h5v5H20z"/>'): Media
    {
        Storage::fake('public');
        $path = 'media/2026/10/'.str_repeat('a', 40).'.svg';
        Storage::disk('public')->put($path, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'.$body.'</svg>');

        return Media::factory()->create(['path' => $path, 'mime' => 'image/svg+xml']);
    }

    public function test_it_answers_the_readings_for_the_sites_logo(): void
    {
        $logo = $this->logo();
        Setting::query()->where('key', 'logo_path')->update(['value' => $logo->path]);

        $response = $this->actingAs(User::factory()->admin()->create(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo');

        $response->assertOk()
            ->assertJsonPath('data.from.path', $logo->path)
            ->assertJsonPath('data.readings.0.primary', '#1d4ed8');
        $this->assertNotEmpty($response->json('data.colours'));
    }

    public function test_it_reads_the_file_a_caller_names(): void
    {
        $logo = $this->logo();

        $this->actingAs(User::factory()->admin()->create(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertOk()
            ->assertJsonPath('data.from.path', $logo->path);
    }

    public function test_it_writes_nothing(): void
    {
        $logo = $this->logo();
        $before = Setting::query()->whereIn('key', ['theme', 'theme_primary', 'theme_topbar'])->pluck('value', 'key');

        $this->actingAs(User::factory()->admin()->create(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertOk();

        $this->assertEquals(
            $before->all(),
            Setting::query()->whereIn('key', ['theme', 'theme_primary', 'theme_topbar'])->pluck('value', 'key')->all()
        );
    }

    public function test_a_logo_with_no_colour_is_refused_in_one_sentence(): void
    {
        $logo = $this->logo('<path fill="#ffffff" d="M0 0h10v10H0z"/><path fill="#111111" d="M2 2h2v2H2z"/>');

        $this->actingAs(User::factory()->admin()->create(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertStatus(422)
            ->assertJsonValidationErrors('path');
    }

    public function test_the_refusals(): void
    {
        $admin = User::factory()->admin()->create();
        Storage::fake('public');

        // No logo set at all.
        Setting::query()->where('key', 'logo_path')->update(['value' => null]);
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settings/palette-from-logo')
            ->assertStatus(422)->assertJsonValidationErrors('path');

        // A path the library does not hold.
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => 'media/2026/10/nope.svg'])
            ->assertStatus(422)->assertJsonValidationErrors('path');

        // A library row that is not a picture.
        $pdf = Media::factory()->create(['path' => 'media/2026/10/doc.pdf', 'mime' => 'application/pdf']);
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $pdf->path])
            ->assertStatus(422)->assertJsonValidationErrors('path');
    }

    public function test_only_an_administrator_may_ask(): void
    {
        $logo = $this->logo();

        $this->actingAs(User::factory()->contentManager()->create(), 'sanctum')
            ->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertForbidden();

        $this->postJson('/api/v1/admin/settings/palette-from-logo', ['path' => $logo->path])
            ->assertUnauthorized();
    }
}
```

Check `User::factory()`'s role helpers against the suite's own usage before writing this; if they are named differently, follow the file beside it.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api && php artisan test tests/Feature/PaletteFromLogoTest.php`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Write the controller method and the route**

The method: resolve the path (the request's, else `Setting::get('logo_path')`), find the `Media` row, refuse what is not `image/*`, read the absolute path off the public disk, call the two classes, and refuse an empty `readings` with the no-colour sentence. Each refusal is `ValidationException::withMessages(['path' => '…'])`.

```php
Route::post('settings/palette-from-logo', [SettingController::class, 'paletteFromLogo'])
    ->middleware('throttle:20,1')->name('settings.palette-from-logo');
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd api && php artisan test tests/Feature/PaletteFromLogoTest.php`
Expected: PASS, 6 tests.

- [ ] **Step 5: Analyse and commit**

Run: `cd api && composer analyse`
Expected: "No errors".

```bash
git add api/app/Http/Controllers/Api/V1/Admin/SettingController.php api/routes/api/admin-admin.php api/tests/Feature/PaletteFromLogoTest.php
git commit -m "0.173.0: POST /admin/settings/palette-from-logo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The button on Themes

**Files:**
- Create: `web/src/app/admin/(app)/settings/logo-palette.tsx` — the button, the tiles, the sentences
- Modify: `web/src/app/admin/(app)/settings/theme-actions.ts` (create if absent) — `paletteFromLogoAction`
- Modify: `web/src/lib/admin/settings.ts` — `paletteFromLogo(path?)`
- Modify: `web/src/app/admin/(app)/settings/theme-picker.tsx` — mount it in the Custom colours panel; read `?palette=`
- Modify: `web/mock-api.mjs` — the endpoint
- Test: `web/scripts/probes/logo-palette.mjs`

**Interfaces:**
- Consumes: the endpoint from Task 4; the picker's own `setInputs`, `setTopbar`, `setChosen`.
- Produces: `<LogoPalette onPick={(r) => …} logoUrl={…} initialPath={…} />`.

- [ ] **Step 1: Add the reader and the action**

`lib/admin/settings.ts` gains `paletteFromLogo`, the `importMediaUrl` shape (0.172.0). `paletteFromLogoAction` returns `{readings, colours}` or `{error}` — the API's own sentence out of `ApiError.errors.path[0]`, never a raw error.

- [ ] **Step 2: Write the component**

A `Button variant="secondary"` reading **"Take our colours from the logo"**, the logo's thumbnail beside it, and on an answer a row of tiles. Each tile: the four swatches, a real `Button` and a small card drawn with that reading's values as inline custom properties — the picker's preview wrapper already does exactly this, so the tile reuses it rather than inventing a second preview. A tile press calls `onPick`. A derived reading carries "Secondary and Accent are derived from your one logo colour."; a refusal is the API's sentence under the button in `text-err`.

- [ ] **Step 3: Mount it and wire `?palette=`**

In the Custom colours panel, above the six fields. `onPick` sets the four values and `setChosen("custom")`. `useSearchParams()`'s `palette` runs the extraction on load for that path.

- [ ] **Step 4: Type-check and lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 5: Write the probe**

`scripts/probes/logo-palette.mjs`: uploads a two-colour SVG whose hexes it knows, sets `logo_path` through the API, opens `/admin/themes`, presses the button, asserts the first tile's swatches are those colours, presses it and asserts the six fields hold them while **the stored settings are unchanged**, then loads a grey wordmark and asserts the API's sentence is on screen. It restores `logo_path` and deletes every file it made.

- [ ] **Step 6: Run the probe**

Run: `cd web && BASE=http://localhost:3000 ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/logo-palette.mjs`
Expected: every check ok, and the files deleted.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/admin/\(app\)/settings/ web/src/lib/admin/settings.ts web/mock-api.mjs web/scripts/probes/logo-palette.mjs
git commit -m "0.173.0: take our colours from the logo, on the Themes screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The media library's hand-over

**Files:**
- Modify: `web/src/app/admin/(app)/media/edit-image-dialog.tsx`
- Modify: `web/src/app/admin/(app)/media/page.tsx` — pass whether this account may reach Themes

**Interfaces:**
- Consumes: the `?palette=` behaviour from Task 5.
- Produces: nothing other tasks read.

- [ ] **Step 1: Add the row**

For an administrator only, and only for a raster or SVG image: a link to `/admin/themes?palette=<encodeURIComponent(path)>` reading **"Make the site's colours from this"**, with one line saying the colours are offered on the Themes screen and nothing changes until it is saved. The role comes from the page's own server-side answer, never from a client guess.

- [ ] **Step 2: Type-check, lint and drive it**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: clean. Then open the library as an administrator, press the row, and confirm the Themes screen opens with the tiles already drawn for that file.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/admin/\(app\)/media/
git commit -m "0.173.0: make the site's colours from a library picture

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The wizard's logo

**Files:**
- Modify: `api/install/Wizard.php` — a `logo` action and the site step's handling
- Modify: `api/public/install/index.html` (or whichever file draws the site step) — the field, the swatches, the tick box
- Test: `api/tests/Feature/WizardLogoTest.php`

**Interfaces:**
- Consumes: `LogoColours::read`, `BrandPalette::from`, `MediaUploader`, `SvgSanitiser`.
- Produces: nothing other tasks read.

**Never run `pint` on `api/install/Wizard.php`** (CLAUDE.md).

- [ ] **Step 1: Write the failing test**

Cover: an extension off the list is refused; a `.png` whose bytes are not a picture is refused; over 2 MB is refused; a good logo answers `{path, url, readings, colours}` and sets `logo_path`; a ticked box writes `theme = custom` and the four colours; an unticked one writes none; a grey logo answers with empty `readings`; posting the step twice does not write a blank `logo_path`.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api && php artisan test tests/Feature/WizardLogoTest.php`
Expected: FAIL — the action does not exist.

- [ ] **Step 3: Write the action and the step's branch**

One `multipart/form-data` branch in `dispatch()` for `logo`, reading `$_FILES['logo']`: the extension list, `getimagesize` for a raster and `SvgSanitiser::clean()` for an SVG, the 2 MB cap, then `MediaUploader` and `logo_path`. `site()` writes `theme = custom` plus the four colours only when the box is ticked. A step posted with no file leaves `logo_path` alone.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd api && php artisan test tests/Feature/WizardLogoTest.php`
Expected: PASS.

- [ ] **Step 5: Draw it**

The field, the first reading's swatches and the tick box — ticked when there is a brand colour, absent when there is not. Then install into a scratch database by hand and walk the wizard with a real logo: no audit reaches this screen.

- [ ] **Step 6: Analyse and commit**

Run: `cd api && composer analyse`
Expected: "No errors".

```bash
git add api/install/Wizard.php api/public/install/ api/tests/Feature/WizardLogoTest.php
git commit -m "0.173.0: the setup wizard takes the logo and offers its colours

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, version and the audits

**Files:**
- Modify: `docs/theming.md` (the reading and the three readings), `CLAUDE.md` (the theming module line), `API.md` (the endpoint), `manual/15-appearance.md` and `manual/14-media.md`, `web/src/content/help.json` (by `npm run help`), `VERSION.md`, `web/src/lib/version.ts`

- [ ] **Step 1: Write the notes**

`docs/theming.md` carries why the API reads the logo (the browser cannot: a tainted canvas and a refused `fetch`), the two readers and why GD is not enough, the chroma floor with its measurement, and the one that matters — **nothing here can ship a failing contrast, because the generator never takes a hex literally**.

- [ ] **Step 2: Version and help**

`APP_VERSION = "0.173.0"`, the VERSION.md entry in the client's words, then `cd web && npm run help && node scripts/build-help.mjs --check`.

- [ ] **Step 3: The suite, the analyser and the audits**

```bash
cd api && php artisan test && composer analyse
cd ../web && npx tsc --noEmit && npm run lint
MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin/themes /admin/media
AUDIT_SCHEME=dark MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin/themes /admin/media
MSYS_NO_PATHCONV=1 node scripts/mobile-audit.mjs /admin/themes /admin/media
```

Expected: the suite green, "No errors", tsc and lint clean, every audit clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "0.173.0: brand from a logo — docs, manual and version

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
