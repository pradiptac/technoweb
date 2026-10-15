# Google Fonts, Noto and Google icons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any Google font (Noto included) can be chosen for headings and body text and is served from our own origin; Google's Material Symbols Rounded icons can be chosen in every icon picker and inserted in body text.

**Architecture:** The API holds a committed catalogue of Google font families, downloads a chosen family's WOFF2 files once through `SafeHttp` onto the public disk, and publishes the installed fonts through `/settings`; the website emits `@font-face` rules for them and serves the files through its same-origin `/font/` route. The icons are a committed JSON of SVG path data read only on the server: a route serves each icon as a tiny SVG that pages draw with `<use>`, so no client bundle grows.

**Tech Stack:** Laravel 13 (PHP 8.3), Next.js 16 App Router, React 19, Tailwind v4, MySQL 8, Playwright for probes.

**Spec:** `docs/superpowers/specs/2026-10-14-google-fonts-and-icons-design.md`

## Global Constraints

- Release **0.179.0**; `VERSION.md` and `web/src/lib/version.ts` bump together.
- A visitor's browser **never contacts any Google host** — fonts and icons come from our origin. No CSP change.
- Every request to Google goes through `App\Support\Net\SafeHttp`; font file URLs must be on `fonts.gstatic.com`; files must start with `wOF2` and be under 2 MB.
- Weights fetched: 400, 600, 700 (those the family has; none of them → the nearest to 400 alone). No italics.
- A Google font id is `g-<slug>`; a Google icon key is `ms:<name>`, `name` matching `^[a-z0-9_]{1,37}$` (icon columns are `varchar(40)`).
- Icons: Material Symbols **Rounded**, weight 300, unfilled, only.
- The icon path data is **never imported by a client component**.
- Font family names in CSS are ours (`tw-g-<slug>`), never Google's typed name; URLs are built only from stored paths of the exact shape the API writes.
- `api/` PHP files are LF; `web/` files keep the line endings they already have (check `git ls-files --eol`). Edit PHP with backslashes through the Edit tool, not a Bash heredoc.
- Never run `pint` on `api/install/Wizard.php`. One `php artisan test` at a time. Throwaway admin for probes, deleted afterwards; no credentials in files.

## Review Focus

1. **A family whose CSS has no 400/600/700** (a display face shipping only 300 or 900) — the install takes the nearest weight to 400 and the font still renders; test in Task 2.
2. **Google answering 200 with an HTML error page or a 429** — install refuses with one sentence and leaves no files or row behind; test in Task 2.
3. **A Google font removed while a theme preview or the other role still names it** — removing is refused while `theme_font_display` or `theme_font_body` holds it; test in Task 2.
4. **An `ms:` key whose name is not in the set** (deleted upstream, typed by an integration) — the page draws nothing and logs no error; checked in Task 6's probe step.
5. **A `[icon name="…"]` with markup in it** (`[icon name="x\" onload=…"]`) — stays literal text; test in Task 9's check script.

---

### Task 1: The Google font catalogue

**Files:**
- Create: `web/scripts/build-google-fonts.mjs`
- Create: `api/resources/google-fonts.json` (generated, committed)
- Create: `api/app/Support/Fonts/GoogleFontCatalogue.php`
- Test: `api/tests/Unit/GoogleFontCatalogueTest.php`

**Interfaces:**
- Produces: `GoogleFontCatalogue::find(string $slug): ?array` → `{family, slug, category, weights: list<int>, subsets: list<string>}`; `GoogleFontCatalogue::search(string $q, ?string $category, int $page, int $per = 40): array{data: list<array>, total: int}`; `GoogleFontCatalogue::slug(string $family): string`.

- [ ] **Step 1: Write the generator**

```js
// web/scripts/build-google-fonts.mjs
/**
 * Writes api/resources/google-fonts.json from Google's public family list
 * (no key). Re-run by hand to refresh; the release carries what is committed.
 *   cd web && node scripts/build-google-fonts.mjs
 */
import { writeFileSync } from "node:fs";

const res = await fetch("https://fonts.google.com/metadata/fonts");
const text = (await res.text()).replace(/^\)\]\}'\s*/, "");
const { familyMetadataList } = JSON.parse(text);

const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rows = familyMetadataList
  .map((f) => ({
    family: f.family,
    slug: slug(f.family),
    category: String(f.category).toLowerCase().replace(/\s+/g, "-"),
    weights: Object.keys(f.fonts ?? {}).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b),
    subsets: (f.subsets ?? []).filter((s) => s !== "menu"),
    popularity: f.popularity ?? 99999,
  }))
  .filter((f) => f.weights.length && f.slug.length <= 62)
  .sort((a, b) => a.popularity - b.popularity)
  .map(({ popularity, ...f }) => f);

writeFileSync(new URL("../../api/resources/google-fonts.json", import.meta.url), JSON.stringify(rows));
console.log(`Wrote ${rows.length} families.`);
```

- [ ] **Step 2: Run it** — `cd web && node scripts/build-google-fonts.mjs`. Expected: `Wrote 1xxx families.` and the file exists. Spot-check `noto-sans-devanagari` and `roboto` are in it (`grep -o '"slug":"noto-sans-devanagari"' ../api/resources/google-fonts.json`).

- [ ] **Step 3: Write the failing test**

```php
<?php
namespace Tests\Unit;

use App\Support\Fonts\GoogleFontCatalogue;
use PHPUnit\Framework\TestCase;

class GoogleFontCatalogueTest extends TestCase
{
    public function test_a_family_is_found_by_its_slug(): void
    {
        $f = GoogleFontCatalogue::find('noto-sans-devanagari');
        $this->assertSame('Noto Sans Devanagari', $f['family']);
        $this->assertContains('devanagari', $f['subsets']);
        $this->assertContains(400, $f['weights']);
    }

    public function test_an_unknown_slug_is_null(): void
    {
        $this->assertNull(GoogleFontCatalogue::find('not-a-font-anywhere'));
    }

    public function test_search_puts_a_prefix_match_first_and_pages(): void
    {
        $r = GoogleFontCatalogue::search('noto sans', null, 1, 10);
        $this->assertCount(10, $r['data']);
        $this->assertStringStartsWith('Noto Sans', $r['data'][0]['family']);
        $this->assertGreaterThan(10, $r['total']);
    }

    public function test_the_slug_rule(): void
    {
        $this->assertSame('noto-sans-devanagari', GoogleFontCatalogue::slug('Noto Sans Devanagari'));
        $this->assertSame('m-plus-1p', GoogleFontCatalogue::slug('M PLUS 1p'));
    }
}
```

- [ ] **Step 4: Run** `php artisan test tests/Unit/GoogleFontCatalogueTest.php` — Expected: FAIL, class not found.

- [ ] **Step 5: Implement**

```php
<?php
namespace App\Support\Fonts;

/**
 * Google's font families, as committed in resources/google-fonts.json
 * (web/scripts/build-google-fonts.mjs). Read here so an editor's search never
 * calls Google, and so the file never reaches a browser bundle.
 */
final class GoogleFontCatalogue
{
    /** @var list<array{family:string,slug:string,category:string,weights:list<int>,subsets:list<string>}>|null */
    private static ?array $rows = null;

    /** @return list<array{family:string,slug:string,category:string,weights:list<int>,subsets:list<string>}> */
    public static function all(): array
    {
        return self::$rows ??= json_decode((string) file_get_contents(resource_path('google-fonts.json')), true) ?: [];
    }

    public static function slug(string $family): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($family)), '-');
    }

    /** @return array{family:string,slug:string,category:string,weights:list<int>,subsets:list<string>}|null */
    public static function find(string $slug): ?array
    {
        foreach (self::all() as $row) {
            if ($row['slug'] === $slug) {
                return $row;
            }
        }

        return null;
    }

    /** @return array{data: list<array>, total: int} */
    public static function search(string $q, ?string $category, int $page, int $per = 40): array
    {
        $q = strtolower(trim($q));
        $rows = array_values(array_filter(self::all(), fn (array $r) => ($category === null || $r['category'] === $category)
            && ($q === '' || str_contains(strtolower($r['family']), $q))));

        if ($q !== '') {
            // Prefix matches first, popularity order kept within each group.
            usort($rows, fn (array $a, array $b) => (int) ! str_starts_with(strtolower($a['family']), $q)
                <=> (int) ! str_starts_with(strtolower($b['family']), $q));
        }

        return ['data' => array_slice($rows, ($page - 1) * $per, $per), 'total' => count($rows)];
    }
}
```

`usort` is stable in PHP 8, so popularity order holds within each group.

- [ ] **Step 6: Run** the test — Expected: 4 passed.
- [ ] **Step 7: Commit** — `git add web/scripts/build-google-fonts.mjs api/resources/google-fonts.json api/app/Support/Fonts/GoogleFontCatalogue.php api/tests/Unit/GoogleFontCatalogueTest.php && git commit -m "Google font catalogue, committed and searched by the API"` (with the attribution line).

---

### Task 2: Installing, listing, removing and previewing a Google font (API)

**Files:**
- Create: `api/database/migrations/2026_10_14_120000_create_google_fonts.php`
- Create: `api/app/Models/GoogleFont.php`
- Create: `api/app/Support/Fonts/GoogleFonts.php`
- Create: `api/app/Http/Controllers/Api/V1/Admin/GoogleFontController.php`
- Create: `api/app/Console/Commands/PruneFontPreviews.php`
- Modify: `api/routes/api/admin-admin.php` (beside the `settings/fonts` routes, line ~162)
- Modify: `api/routes/console.php` (schedule the prune daily)
- Modify: `api/app/Http/Controllers/Api/V1/Admin/SettingController.php:768` (font id check)
- Modify: `api/app/Support/PublicSettings.php` (derived `google_fonts`, beside `google_login_live`)
- Test: `api/tests/Feature/GoogleFontsTest.php`

**Interfaces:**
- Consumes: `GoogleFontCatalogue::find/search` (Task 1).
- Produces: routes `GET /admin/settings/google-fonts`, `GET …/catalogue?q=&category=&page=`, `POST …` `{slug}`, `DELETE …/{slug}`, `GET …/preview/{slug}` (font/woff2 bytes). Public `/settings` key **`google_fonts`**: a JSON string `[{"id":"g-<slug>","slug":"…","family":"…","category":"…","faces":[{"weight":400,"range":"U+0000-00FF,…","path":"fonts/google/<slug>/0.woff2"}]}]` for **every installed font** (not only those in use, so the console's live preview can draw a font chosen before Save), absent when none.

- [ ] **Step 1: Migration and model**

```php
// migration
Schema::create('google_fonts', function (Blueprint $table) {
    $table->id();
    $table->string('slug', 62)->unique();
    $table->string('family', 120);
    $table->string('category', 30);
    $table->json('faces');
    $table->unsignedInteger('bytes')->default(0);
    $table->timestamps();
});
```

```php
// app/Models/GoogleFont.php
class GoogleFont extends Model
{
    protected $fillable = ['slug', 'family', 'category', 'faces', 'bytes'];

    protected function casts(): array
    {
        return ['faces' => 'array', 'bytes' => 'integer'];
    }

    public function id(): string
    {
        return 'g-'.$this->slug;
    }
}
```

- [ ] **Step 2: Write the failing feature test** — Google's CSS and files faked; DNS seam bound the way `BackupTest` does.

```php
<?php
namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\GoogleFont;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Net\PublicHost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class GoogleFontsTest extends TestCase
{
    use RefreshDatabase;

    private const WOFF2 = "wOF2\x00\x01\x00\x00fake-font-bytes";

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['142.250.183.10']);
    }

    private function admin(): User
    {
        $u = User::create(['name' => 'Ada', 'email' => 'ada-fonts@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $u->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => 'Administrator']));
        return $u;
    }

    private function css(array $weights): string
    {
        $out = '';
        foreach ($weights as $i => $w) {
            $out .= "/* latin */\n@font-face {\n  font-family: 'Noto Sans Devanagari';\n  font-style: normal;\n  font-weight: {$w};\n  font-display: swap;\n  src: url(https://fonts.gstatic.com/s/notosansdevanagari/v1/f{$i}.woff2) format('woff2');\n  unicode-range: U+0000-00FF, U+0131;\n}\n";
        }
        return $out;
    }

    private function fakeGoogle(array $weights, ?string $file = null): void
    {
        Http::fake([
            'fonts.googleapis.com/*' => Http::response($this->css($weights), 200, ['Content-Type' => 'text/css']),
            'fonts.gstatic.com/*' => Http::response($file ?? self::WOFF2, 200, ['Content-Type' => 'font/woff2']),
        ]);
    }

    public function test_installing_a_family_stores_its_faces_and_publishes_them(): void
    {
        $this->fakeGoogle([400, 600, 700]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'noto-sans-devanagari'])
            ->assertCreated()
            ->assertJsonPath('data.id', 'g-noto-sans-devanagari')
            ->assertJsonPath('data.faces', 3);

        $font = GoogleFont::firstOrFail();
        $this->assertSame([400, 600, 700], array_column($font->faces, 'weight'));
        Storage::disk('public')->assertExists($font->faces[0]['path']);
        $this->assertMatchesRegularExpression('#^fonts/google/noto-sans-devanagari/\d+\.woff2$#', $font->faces[0]['path']);

        $published = json_decode($this->getJson('/api/v1/settings')->json('data.google_fonts'), true);
        $this->assertSame('g-noto-sans-devanagari', $published[0]['id']);
        $this->assertSame('U+0000-00FF, U+0131', $published[0]['faces'][0]['range']);
    }

    public function test_a_slug_not_in_the_catalogue_is_refused(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'nope-not-a-font'])
            ->assertUnprocessable()->assertJsonValidationErrors('slug');
    }

    public function test_a_file_url_off_gstatic_is_refused_and_nothing_is_left(): void
    {
        Http::fake(['fonts.googleapis.com/*' => Http::response(str_replace('fonts.gstatic.com', 'evil.example', $this->css([400])), 200)]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'noto-sans-devanagari'])
            ->assertUnprocessable()->assertJsonValidationErrors('slug');

        $this->assertSame(0, GoogleFont::count());
        $this->assertSame([], Storage::disk('public')->allFiles('fonts/google'));
    }

    public function test_a_file_that_is_not_woff2_is_refused_and_nothing_is_left(): void
    {
        $this->fakeGoogle([400, 700], '<html>quota</html>');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'noto-sans-devanagari'])
            ->assertUnprocessable();

        $this->assertSame([], Storage::disk('public')->allFiles('fonts/google'));
    }

    public function test_a_refusal_from_google_is_one_sentence(): void
    {
        Http::fake(['fonts.googleapis.com/*' => Http::response('Too many', 429)]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'noto-sans-devanagari'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.slug.0', 'Google refused the request (429). Try again shortly.');
    }

    public function test_a_family_without_400_600_or_700_takes_the_nearest_weight(): void
    {
        // The request asks only for weights the catalogue lists, so the CSS
        // answering one 300 face is what a 300-only family gets back.
        $this->fakeGoogle([300]);
        $slug = collect(\App\Support\Fonts\GoogleFontCatalogue::all())
            ->first(fn ($f) => array_intersect([400, 600, 700], $f['weights']) === [])['slug'];

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/google-fonts', ['slug' => $slug])
            ->assertCreated();

        Http::assertSent(fn ($r) => str_contains($r->url(), 'fonts.googleapis.com') && preg_match('/wght@\d+&/', urldecode($r->url())));
    }

    public function test_installing_twice_downloads_nothing_new(): void
    {
        $this->fakeGoogle([400]);
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'noto-sans-devanagari'])->assertCreated();
        Http::fake();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'noto-sans-devanagari'])->assertOk();
        Http::assertNothingSent();
    }

    public function test_a_font_in_use_cannot_be_removed(): void
    {
        $this->fakeGoogle([400]);
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'noto-sans-devanagari']);
        Setting::updateOrCreate(['key' => 'theme_font_body'], ['group' => 'appearance', 'value' => 'g-noto-sans-devanagari', 'type' => 'string']);
        Setting::flushCache();

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/v1/admin/settings/google-fonts/noto-sans-devanagari')
            ->assertUnprocessable()->assertJsonPath('errors.slug.0', 'The body font uses this. Choose another first.');

        Setting::where('key', 'theme_font_body')->update(['value' => 'inter']);
        Setting::flushCache();
        $this->actingAs($admin, 'sanctum')->deleteJson('/api/v1/admin/settings/google-fonts/noto-sans-devanagari')->assertNoContent();
        $this->assertSame([], Storage::disk('public')->allFiles('fonts/google'));
    }

    public function test_the_settings_save_refuses_a_google_id_not_installed(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'theme_font_display', 'value' => 'g-roboto']]])
            ->assertUnprocessable()->assertJsonPath('errors', ['settings.0.value' => ['Install that font first.']]);
    }

    public function test_the_catalogue_search_marks_what_is_installed(): void
    {
        $this->fakeGoogle([400]);
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'noto-sans-devanagari']);

        $row = collect($this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/settings/google-fonts/catalogue?q=noto+sans+deva')->json('data'))
            ->firstWhere('slug', 'noto-sans-devanagari');
        $this->assertTrue($row['installed']);
    }

    public function test_only_an_administrator_may_install(): void
    {
        $editor = User::create(['name' => 'Ed', 'email' => 'ed-fonts@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $editor->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'Content manager']));
        $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/settings/google-fonts', ['slug' => 'roboto'])->assertForbidden();
    }
}
```

- [ ] **Step 3: Run** `php artisan test tests/Feature/GoogleFontsTest.php` — Expected: FAIL (route 404s / class missing).

- [ ] **Step 4: Implement `GoogleFonts`**

```php
<?php
namespace App\Support\Fonts;

use App\Models\GoogleFont;
use App\Models\Setting;
use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * A Google font copied to this server (0.179.0, docs/theming.md "Google
 * fonts"). Google is asked once, at install; visitors are sent our copy.
 *
 * Google answers WOFF2 `@font-face` blocks only to a browser it recognises,
 * so the CSS request carries a current Chrome user agent. SafeHttp::get()
 * would put its own agent first (array union keeps the left key), so the
 * request is built from SafeHttp::request() instead.
 */
final class GoogleFonts
{
    public const WEIGHTS = [400, 600, 700];
    public const MAX_BYTES = 2 * 1024 * 1024;
    private const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
    private const PREVIEWS = 'font-previews';

    /** @return array{0: GoogleFont, 1: bool} the font, and whether it was downloaded now */
    public static function install(string $slug): array
    {
        if ($existing = GoogleFont::where('slug', $slug)->first()) {
            return [$existing, false];
        }

        $entry = GoogleFontCatalogue::find($slug) ?? self::refuse('Choose a font from the list.');
        $faces = self::fetchFaces($entry['family'], self::weightsFor($entry['weights']));
        $dir = "fonts/google/{$slug}";
        $stored = [];
        $bytes = 0;

        try {
            foreach ($faces as $i => $face) {
                $body = self::download($face['url']);
                Storage::disk('public')->put("{$dir}/{$i}.woff2", $body);
                $stored[] = ['weight' => $face['weight'], 'range' => $face['range'], 'path' => "{$dir}/{$i}.woff2"];
                $bytes += strlen($body);
            }
        } catch (\Throwable $e) {
            Storage::disk('public')->deleteDirectory($dir);
            throw $e;
        }

        return [GoogleFont::create([
            'slug' => $slug, 'family' => $entry['family'], 'category' => $entry['category'],
            'faces' => $stored, 'bytes' => $bytes,
        ]), true];
    }

    public static function remove(GoogleFont $font): void
    {
        foreach (['theme_font_display' => 'heading', 'theme_font_body' => 'body'] as $key => $role) {
            if (Setting::get($key) === $font->id()) {
                self::refuse("The {$role} font uses this. Choose another first.");
            }
        }

        Storage::disk('public')->deleteDirectory("fonts/google/{$font->slug}");
        $font->delete();
    }

    /** The regular Latin face for the console's sample line, cached on the private disk. */
    public static function preview(string $slug): string
    {
        $entry = GoogleFontCatalogue::find($slug) ?? abort(404);
        $path = self::PREVIEWS."/{$slug}.woff2";

        if (! Storage::disk('local')->exists($path)) {
            $faces = self::fetchFaces($entry['family'], [self::weightsFor($entry['weights'])[0]]);
            // The Latin block is Google's last for most families; any block does for a sample.
            $face = collect($faces)->first(fn ($f) => str_contains($f['range'], 'U+0000')) ?? $faces[0];
            Storage::disk('local')->put($path, self::download($face['url']));
        }

        return Storage::disk('local')->path($path);
    }

    /** @param list<int> $available @return list<int> */
    public static function weightsFor(array $available): array
    {
        $wanted = array_values(array_intersect(self::WEIGHTS, $available));

        if ($wanted !== []) {
            return $wanted;
        }

        usort($available, fn (int $a, int $b) => abs($a - 400) <=> abs($b - 400));

        return [$available[0]];
    }

    /** @param list<int> $weights @return list<array{weight:int, range:string, url:string}> */
    private static function fetchFaces(string $family, array $weights): array
    {
        $url = 'https://fonts.googleapis.com/css2?family='.rawurlencode($family).':wght@'.implode(';', $weights).'&display=swap';

        try {
            $response = SafeHttp::request($url)->timeout(20)->withHeaders(['User-Agent' => self::AGENT])->get($url);
        } catch (UnsafeUrl|\Illuminate\Http\Client\ConnectionException) {
            self::refuse('That font could not be downloaded from Google. Try again shortly.');
        }

        if (! $response->successful()) {
            self::refuse("Google refused the request ({$response->status()}). Try again shortly.");
        }

        preg_match_all('/@font-face\s*\{(.*?)\}/s', $response->body(), $blocks);
        $faces = [];

        foreach ($blocks[1] as $block) {
            preg_match('/font-weight:\s*(\d+)/', $block, $w);
            preg_match('/url\((https:\/\/[^)]+\.woff2)\)/', $block, $u);
            preg_match('/unicode-range:\s*([^;]+);/', $block, $r);

            if (! $w || ! $u) {
                continue;
            }

            if (parse_url($u[1], PHP_URL_HOST) !== 'fonts.gstatic.com') {
                self::refuse('Google pointed at a file somewhere other than its font server, so nothing was installed.');
            }

            $faces[] = ['weight' => (int) $w[1], 'range' => trim($r[1] ?? 'U+0000-FFFF'), 'url' => $u[1]];
        }

        return $faces !== [] ? $faces : self::refuse('Google sent no font files for that family.');
    }

    private static function download(string $url): string
    {
        try {
            $response = SafeHttp::request($url)->timeout(20)->withHeaders(['User-Agent' => self::AGENT])->get($url);
        } catch (UnsafeUrl|\Illuminate\Http\Client\ConnectionException) {
            self::refuse('That font could not be downloaded from Google. Try again shortly.');
        }

        $body = $response->body();

        if (! $response->successful() || ! str_starts_with($body, 'wOF2') || strlen($body) > self::MAX_BYTES) {
            self::refuse('Google sent a file that is not a web font, so nothing was installed.');
        }

        return $body;
    }

    private static function refuse(string $message): never
    {
        throw ValidationException::withMessages(['slug' => $message]);
    }
}
```

- [ ] **Step 5: Controller and routes**

```php
<?php
namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\GoogleFont;
use App\Models\Setting;
use App\Support\Fonts\GoogleFontCatalogue;
use App\Support\Fonts\GoogleFonts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Google fonts copied to this server (0.179.0). `role:admin`, beside the custom-font slots. */
class GoogleFontController extends Controller
{
    public function index(): JsonResponse
    {
        $inUse = [Setting::get('theme_font_display'), Setting::get('theme_font_body')];

        return response()->json(['data' => GoogleFont::orderBy('family')->get()->map(fn (GoogleFont $f) => [
            'id' => $f->id(), 'slug' => $f->slug, 'family' => $f->family, 'category' => $f->category,
            'faces' => count($f->faces), 'bytes' => $f->bytes, 'in_use' => in_array($f->id(), $inUse, true),
        ])]);
    }

    public function catalogue(Request $request): JsonResponse
    {
        $installed = GoogleFont::pluck('slug')->all();
        $result = GoogleFontCatalogue::search(
            mb_substr((string) $request->query('q', ''), 0, 60),
            $request->filled('category') ? (string) $request->query('category') : null,
            max(1, (int) $request->query('page', 1)),
        );

        return response()->json([
            'data' => array_map(fn (array $r) => [...$r, 'installed' => in_array($r['slug'], $installed, true)], $result['data']),
            'meta' => ['total' => $result['total'], 'categories' => ['sans-serif', 'serif', 'display', 'handwriting', 'monospace']],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate(['slug' => ['required', 'string', 'max:62', 'regex:/^[a-z0-9-]+$/']]);
        [$font, $new] = GoogleFonts::install((string) $request->input('slug'));

        return response()->json(['data' => [
            'id' => $font->id(), 'slug' => $font->slug, 'family' => $font->family, 'faces' => count($font->faces), 'bytes' => $font->bytes,
        ]], $new ? 201 : 200);
    }

    public function destroy(string $slug): JsonResponse
    {
        GoogleFonts::remove(GoogleFont::where('slug', $slug)->firstOrFail());

        return response()->json(null, 204);
    }

    public function preview(string $slug): BinaryFileResponse
    {
        return response()->file(GoogleFonts::preview($slug), [
            'Content-Type' => 'font/woff2', 'Cache-Control' => 'private, max-age=86400', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
```

Routes, in `admin-admin.php` under the custom-font routes (literal paths above `{slug}`):

```php
Route::get('settings/google-fonts', [GoogleFontController::class, 'index'])->name('settings.google-fonts.index');
Route::get('settings/google-fonts/catalogue', [GoogleFontController::class, 'catalogue'])->name('settings.google-fonts.catalogue');
Route::get('settings/google-fonts/preview/{slug}', [GoogleFontController::class, 'preview'])
    ->where('slug', '[a-z0-9-]{1,62}')->middleware('throttle:120,1')->name('settings.google-fonts.preview');
Route::post('settings/google-fonts', [GoogleFontController::class, 'store'])->middleware('throttle:10,1')->name('settings.google-fonts.store');
Route::delete('settings/google-fonts/{slug}', [GoogleFontController::class, 'destroy'])
    ->where('slug', '[a-z0-9-]{1,62}')->name('settings.google-fonts.destroy');
```

- [ ] **Step 6: The settings save and the public map**

In `SettingController::validateAppearance`, replace the font-id check:

```php
if (in_array($key, $fonts, true) && filled($value)) {
    $value = (string) $value;

    if (str_starts_with($value, 'g-')) {
        if (! \App\Models\GoogleFont::where('slug', substr($value, 2))->exists()) {
            throw ValidationException::withMessages(["settings.{$i}.value" => 'Install that font first.']);
        }
    } elseif (! preg_match('/^[a-z][a-z0-9-]{1,31}$/', $value)) {
        throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose a font from the list.']);
    }
}
```

In `PublicSettings`, beside `google_login_live`:

```php
// Google fonts copied to this server (0.179.0): every installed one, so the
// console's live preview can draw a font chosen before Save. Paths only —
// the website builds its own URLs from them and checks their shape.
$google = GoogleFont::orderBy('slug')->get(['slug', 'family', 'category', 'faces']);
if ($google->isNotEmpty()) {
    $values['google_fonts'] = json_encode($google->map(fn (GoogleFont $f) => [
        'id' => $f->id(), 'slug' => $f->slug, 'family' => $f->family, 'category' => $f->category, 'faces' => $f->faces,
    ])->all());
}
```

(Import `App\Models\GoogleFont`.) The `faces` rows already carry `weight`, `range`, `path`.

- [ ] **Step 7: The prune** — `technoware:prune-font-previews` deletes `font-previews/*.woff2` on the local disk older than 7 days (by `lastModified`); scheduled `->dailyAt('03:55')` in `routes/console.php` beside the other prunes. Add one test to `GoogleFontsTest`:

```php
public function test_old_previews_are_pruned(): void
{
    Storage::disk('local')->put('font-previews/old.woff2', 'x');
    touch(Storage::disk('local')->path('font-previews/old.woff2'), now()->subDays(8)->getTimestamp());
    Storage::disk('local')->put('font-previews/new.woff2', 'x');

    $this->artisan('technoware:prune-font-previews')->assertSuccessful();

    Storage::disk('local')->assertMissing('font-previews/old.woff2');
    Storage::disk('local')->assertExists('font-previews/new.woff2');
}
```

- [ ] **Step 8: Run** `php artisan migrate` (dev) and `php artisan test tests/Feature/GoogleFontsTest.php` — Expected: 12 passed. Then `./vendor/bin/pint --dirty` and `composer analyse` → "No errors".
- [ ] **Step 9: Commit** — migration, model, support class, controller, command, routes, the two modified files, the test.

---

### Task 3: The website draws an installed Google font

**Files:**
- Create: `web/src/lib/google-fonts.ts`
- Create: `web/src/app/font/g/[slug]/[file]/route.ts`
- Create: `web/scripts/google-fonts.check.mjs`
- Modify: `web/src/lib/font-choices.ts:65-77` (`fontFor`)
- Modify: `web/src/app/layout.tsx:12,162-168` (emit the rules)
- Modify: `web/mock-api.mjs` (`/settings` may carry `google_fonts`; no fixture needed — absent is valid)

**Interfaces:**
- Consumes: public `google_fonts` (Task 2).
- Produces: `googleFontsFor(settings): GoogleFontRow[]`, `googleFontsCss(rows): string`, `googleFontVariable(id): string | null` (`"--font-g-<slug>"` for a `g-` id), `GOOGLE_FONT_PATH` regex; `fontFor("g-…", role)` returns `{variable: "--font-g-<slug>", label: family}`.

- [ ] **Step 1: Write `lib/google-fonts.ts`** (no directive; imported by the root layout and the theme picker)

```ts
import type { SiteSettings } from "@/lib/site-settings";

/**
 * Google fonts copied to this server (0.179.0, docs/theming.md).
 * The API publishes every installed font as `google_fonts`; this turns it
 * into `@font-face` rules under a family name of ours, each face with the
 * `unicode-range` Google gave it — so a Hindi page downloads the Devanagari
 * file and an English page does not. URLs are built only from a stored path
 * of exactly the shape the API writes, served by `/font/g/<slug>/<n>.woff2`.
 */
export type GoogleFontRow = {
  id: string;
  slug: string;
  family: string;
  category: string;
  faces: { weight: number; range: string; href: string }[];
};

const PATH = /^fonts\/google\/([a-z0-9-]{1,62})\/(\d{1,3})\.woff2$/;
const RANGE = /^[U+0-9A-Fa-f,\s?-]{1,4000}$/;

export function googleFontVariable(id: string | null | undefined): string | null {
  return id && /^g-[a-z0-9-]{1,62}$/.test(id) ? `--font-${id}` : null;
}

export function googleFontsFor(settings: SiteSettings): GoogleFontRow[] {
  let parsed: unknown;
  try { parsed = JSON.parse(settings.google_fonts ?? "[]"); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((row): GoogleFontRow[] => {
    if (!row || typeof row.slug !== "string" || !/^[a-z0-9-]{1,62}$/.test(row.slug)) return [];
    const faces = (Array.isArray(row.faces) ? row.faces : []).flatMap((f: { weight?: unknown; range?: unknown; path?: unknown }) => {
      const m = PATH.exec(String(f?.path ?? ""));
      const weight = Number(f?.weight);
      const range = String(f?.range ?? "");
      return m && m[1] === row.slug && Number.isInteger(weight) && RANGE.test(range)
        ? [{ weight, range, href: `/font/g/${m[1]}/${m[2]}.woff2` }]
        : [];
    });
    return faces.length ? [{ id: `g-${row.slug}`, slug: row.slug, family: String(row.family ?? row.slug), category: String(row.category ?? "sans-serif"), faces }] : [];
  });
}

const GENERIC: Record<string, string> = {
  serif: "ui-serif,Georgia,serif",
  monospace: "ui-monospace,monospace",
  handwriting: "cursive",
};

export function googleFontsCss(rows: GoogleFontRow[]): string {
  const faces = rows.flatMap((r) => r.faces.map((f) =>
    `@font-face{font-family:"tw-g-${r.slug}";src:url(${f.href}) format("woff2");font-weight:${f.weight};font-style:normal;font-display:swap;unicode-range:${f.range}}`));
  const vars = rows.map((r) => `--font-g-${r.slug}:"tw-g-${r.slug}",${GENERIC[r.category] ?? "ui-sans-serif,system-ui,sans-serif"}`);
  return `${faces.join("")}${vars.length ? `:root{${vars.join(";")}}` : ""}`;
}
```

- [ ] **Step 2: Write the check script** (runs the pure module under Node's type stripping, like `theme-contrast.mjs`)

```js
// web/scripts/google-fonts.check.mjs — node --experimental-strip-types scripts/google-fonts.check.mjs
import { googleFontsFor, googleFontsCss, googleFontVariable } from "../src/lib/google-fonts.ts";
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const good = { google_fonts: JSON.stringify([{ id: "g-noto-sans", slug: "noto-sans", family: "Noto Sans", category: "sans-serif",
  faces: [{ weight: 400, range: "U+0000-00FF, U+0131", path: "fonts/google/noto-sans/0.woff2" }] }]) };
const rows = googleFontsFor(good);
ok(rows.length === 1 && rows[0].faces[0].href === "/font/g/noto-sans/0.woff2", "a stored path becomes a same-origin URL");
ok(googleFontsCss(rows).includes('font-family:"tw-g-noto-sans"') && googleFontsCss(rows).includes("unicode-range:U+0000-00FF, U+0131"), "rules use our family name and Google's range");
const bad = { google_fonts: JSON.stringify([{ slug: "x", family: "</style><script>", faces: [
  { weight: 400, range: "U+0000;}body{display:none", path: "fonts/google/x/0.woff2" },
  { weight: 400, range: "U+0000", path: "https://evil.example/f.woff2" }] }]) };
ok(googleFontsFor(bad).length === 0, "a bad range or a foreign path is dropped");
ok(!googleFontsCss(googleFontsFor(bad)).includes("script"), "a typed family name never reaches the CSS");
ok(googleFontVariable("g-noto-sans") === "--font-g-noto-sans" && googleFontVariable("inter") === null, "only g- ids resolve");
ok(googleFontsFor({ google_fonts: "{not json" }).length === 0, "broken JSON yields nothing");
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Run** `node --experimental-strip-types scripts/google-fonts.check.mjs` — Expected: FAIL first (module missing) if run before Step 1; after Step 1, all `ok`.

- [ ] **Step 4: The file route**

```ts
// web/src/app/font/g/[slug]/[file]/route.ts
import { NextResponse } from "next/server";

/** A Google font file copied to this server (0.179.0), served same-origin like `/font/[name]`. */
export async function GET(_r: Request, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await params;
  const base = process.env.API_BASE_URL;
  if (!/^[a-z0-9-]{1,62}$/.test(slug) || !/^\d{1,3}\.woff2$/.test(file) || !base) return new NextResponse("Not found", { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/storage/fonts/google/${slug}/${file}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    return new NextResponse("The font could not be fetched", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new NextResponse("Not found", { status: 404 });

  // A slug's files are rewritten only by removing and installing again, which
  // the console does not offer for an installed font — a year is safe.
  return new NextResponse(upstream.body, {
    headers: { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
```

- [ ] **Step 5: `fontFor` and the layout**

In `font-choices.ts` `fontFor`, after the custom-font branch:

```ts
const google = googleFontVariable(id);
if (google) return { variable: google, label: id!.slice(2).replace(/-/g, " ") };
```

(import `googleFontVariable` from `./google-fonts.ts` — the file already imports `./custom-fonts.ts` with an extension for the theme gate.)

In `layout.tsx`, compute `const googleFonts = googleFontsFor(settings);` and render, beside the custom-fonts `<style>`:

```tsx
{googleFonts.length > 0 && (
  <style id="google-fonts" dangerouslySetInnerHTML={{ __html: googleFontsCss(googleFonts) }} />
)}
```

- [ ] **Step 6: Verify** `npx tsc --noEmit`, `npm run lint`, the check script, and `npm run themes` (the gate imports `font-choices.ts` and must still run). Expected: all clean.
- [ ] **Step 7: Commit.**

---

### Task 4: Browsing and choosing a Google font in the console

**Files:**
- Create: `web/src/app/api/admin/google-fonts/route.ts` (GET list or catalogue, POST install, DELETE remove)
- Create: `web/src/app/api/admin/google-fonts/preview/[slug]/route.ts`
- Create: `web/src/app/admin/(app)/settings/google-fonts-dialog.tsx`
- Modify: `web/src/app/admin/(app)/settings/theme-picker.tsx:253-282`
- Modify: `web/src/app/admin/(app)/settings/settings-copy.ts` (nothing new unless a hint changes)

**Interfaces:**
- Consumes: Task 2 routes; `googleFontsFor` (Task 3) for the options present at load.
- Produces: `<GoogleFontsDialog open onClose onPick={(font: {id, family}) => void} />`.

- [ ] **Step 1: Route handlers** — the copilot route's shape (`getToken` from `@/lib/admin-auth`, `apiFetch(path, {token})`, `isSameOrigin` on POST and DELETE, `Cache-Control: private, no-store`). `GET ?mode=installed` forwards `/admin/settings/google-fonts`; `GET ?q=&category=&page=` forwards `/catalogue`; `POST {slug}` forwards and passes a 422 body through; `DELETE ?slug=` forwards. The preview handler fetches `${API_BASE_URL}/api/v1/admin/settings/google-fonts/preview/<slug>` with the bearer token and streams the body back as `font/woff2`, `private, max-age=86400`; slug held to `^[a-z0-9-]{1,62}$` before any request.

- [ ] **Step 2: The dialog** — `Modal size="lg"`, title "Google Fonts", a search input (debounced 250 ms) and a category `Select` (All, Sans serif, Serif, Display, Handwriting, Monospace), a results grid of cards (`grid gap-3 sm:grid-cols-2`), "Show more" for the next page. Each card: the family name, the category, a sample line "The quick brown fox — आपका स्वागत है" set in the face once loaded, and an **Install and use** button (or **Use** when `installed`). The sample loads only when the card is in view (`IntersectionObserver`) through the FontFace API:

```ts
const face = new FontFace(`tw-prev-${slug}`, `url(/api/admin/google-fonts/preview/${slug})`);
document.fonts.add(await face.load());
```

Pressing install POSTs, shows `pending` on that button, and on success calls `onPick({ id: `g-${slug}`, family })`; a 422 shows the API's sentence in an `Alert tone="err" dismissible={false}` inside the dialog (a toast behind a `<dialog>` is unseen — the page draft's rule).

- [ ] **Step 3: Wire the picker** — in `theme-picker.tsx`:
  - On mount fetch `GET /api/admin/google-fonts?mode=installed` into state `google`; until it returns, the current values if they start with `g-` are offered as provisional options (label from the id) so the controlled select never shows a value it has no option for.
  - Both selects list `google` after the vendored faces: `<option value={f.id} style={{ fontFamily: `var(--font-${f.id})` }}>{f.family} (Google)</option>`.
  - Under the selects, a button **Browse Google Fonts…** opens the dialog for the field last focused (default: Headline). `onPick` adds the font to `google` and calls `set("fontDisplay" | "fontBody", font.id)`.
  - A small list "Google fonts on this site": family, size (`(bytes/1024).toFixed(0)` KB), **Remove** (`DELETE`; disabled with `title` "Chosen above — choose another first" when it is the current value of either select; a 422 shown inline).
  - Buttons are `type="button"` and controls unnamed — the panel sits inside the settings `<form>` (the custom-fonts panel's rule).

- [ ] **Step 4: Verify** `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 5: Commit.**

---

### Task 5: The Material Symbols set and its route

**Files:**
- Create: `web/scripts/build-material-symbols.mjs`
- Create: `web/src/content/material-symbols.json` (generated, committed)
- Create: `web/src/app/icons/material/[file]/route.ts`
- Modify: `web/package.json` (devDependency `@material-symbols/svg-300`, exact version)
- Modify: `api/app/Support/ReservedSlugs.php:36` (add `'icons'`)

**Interfaces:**
- Produces: `/icons/material/<name>.svg` → `image/svg+xml` holding `<path id="i" d="…"/>` inside `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">`; 404 for an unknown name. `material-symbols.json` is `{ "<name>": "<path d>" }`.

- [ ] **Step 1: Install the dev dependency** — `cd web && npm install --save-dev --save-exact @material-symbols/svg-300`.

- [ ] **Step 2: The generator** — with a `--check` mode that fails when the committed file differs from what the installed package produces.

```js
// web/scripts/build-material-symbols.mjs
/**
 * Material Symbols Rounded, weight 300, unfilled (Apache-2.0, Google) as
 * {name: pathData}, for server code only. Names over 37 characters are left
 * out: a key is `ms:<name>` in a varchar(40) column.
 *   node scripts/build-material-symbols.mjs [--check]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dir = join(dirname(require.resolve("@material-symbols/svg-300/package.json")), "rounded");
const out = {};
for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith(".svg") || file.endsWith("-fill.svg")) continue;
  const name = file.slice(0, -4);
  if (!/^[a-z0-9_]{1,37}$/.test(name)) continue;
  const d = /<path[^>]*\sd="([^"]+)"/.exec(readFileSync(join(dir, file), "utf8"))?.[1];
  if (d) out[name] = d;
}
const json = JSON.stringify(out);
const target = new URL("../src/content/material-symbols.json", import.meta.url);
if (process.argv.includes("--check")) {
  const same = readFileSync(target, "utf8") === json;
  console.log(same ? "material-symbols.json is current." : "material-symbols.json is stale — run the script.");
  process.exit(same ? 0 : 1);
}
writeFileSync(target, json);
console.log(`Wrote ${Object.keys(out).length} icons.`);
```

- [ ] **Step 3: Run** it — Expected `Wrote 3xxx icons.`; `--check` then prints "current". Confirm `router`, `home`, `shield` exist.

- [ ] **Step 4: The route** (server-only by construction — a route handler)

```ts
// web/src/app/icons/material/[file]/route.ts
import { NextResponse } from "next/server";
import icons from "@/content/material-symbols.json";

/**
 * One Material Symbols Rounded icon (Apache-2.0, Google), as a file a page
 * draws with `<use href="/icons/material/router.svg#i">` (0.179.0,
 * docs/icons.md). Served from here so the path data never enters a client
 * bundle, and from our origin so a visitor never contacts Google. The path
 * carries no fill: it takes `currentColor` from the `<svg>` that uses it.
 */
const MAP = icons as Record<string, string>;

export function GET(_r: Request, { params }: { params: Promise<{ file: string }> }) {
  return params.then(({ file }) => {
    const name = /^([a-z0-9_]{1,37})\.svg$/.exec(file)?.[1];
    const d = name ? MAP[name] : undefined;
    if (!d) return new NextResponse("Not found", { status: 404 });

    return new NextResponse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path id="i" d="${d}"/></svg>`, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  });
}
```

`d` comes from our committed file (path commands only), never from a request.

- [ ] **Step 5: Reserve the address** — add `'icons'` to the frontend-route list in `ReservedSlugs.php`. Run `php artisan test tests/Unit/ReservedSlugsTest.php` — Expected: PASS (it reads `web/src/app`; without the entry it fails naming `icons`).

- [ ] **Step 6: Verify** with the dev server: `curl -s http://localhost:3000/icons/material/router.svg | head -c 80` → starts `<svg`; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/icons/material/not_a_real_icon.svg` → `404`; `…/..%2Fsecret.svg` → `404`.
- [ ] **Step 7: Commit** (package.json, package-lock.json, the script, the JSON, the route, ReservedSlugs).

---

### Task 6: Drawing an `ms:` icon wherever an icon is drawn

**Files:**
- Modify: `web/src/components/icons.tsx:826-836` (`IdentityIcon`) and add `MaterialIcon`, `isIdentityIcon`, `iconFor`
- Modify (each `in iconMap` guard): `src/lib/navigation.ts:27`, `src/components/ui/icon-tile.tsx:15`, `src/components/ui/stat.tsx:47`, `src/components/blocks/stack-block.tsx:127`, `src/components/blocks/stats-block.tsx:114`, `src/themes/datacenter/templates/home.tsx:107`, `src/themes/editorial/templates/home.tsx:109`, and the five admin list pages (`industries`, `product-categories`, `service-categories`, `services`, `solutions` `page.tsx`)

**Interfaces:**
- Produces: `MaterialIcon({ name, className, style }): JSX` (name without `ms:`); `isMaterialKey(key): boolean`; `isIdentityIcon(key): boolean` (in `iconMap` or a valid `ms:` key); `iconFor(key, Fallback): ComponentType<{className?: string}>`.

- [ ] **Step 1: Add to `icons.tsx`** (stays a server-safe module: no hooks, no data)

```tsx
const MATERIAL = /^ms:([a-z0-9_]{1,37})$/;

export function isMaterialKey(key: string | null | undefined): boolean {
  return Boolean(key && MATERIAL.test(key));
}

export function isIdentityIcon(key: string | null | undefined): boolean {
  return Boolean(key && (key in iconMap || MATERIAL.test(key)));
}

/** A Google icon, drawn from our own `/icons/material/` file (0.179.0). Unknown names draw an empty box. */
export function MaterialIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden className={className} style={style}>
      <use href={`/icons/material/${name}.svg#i`} />
    </svg>
  );
}

/** The component for a stored key, for screens that render an icon component. */
export function iconFor(key: string | null | undefined, Fallback: React.ComponentType<{ className?: string }>) {
  const m = key ? MATERIAL.exec(key) : null;
  if (m) {
    const Named = ({ className }: { className?: string }) => <MaterialIcon name={m[1]} className={className} />;
    return Named;
  }
  return key && key in iconMap ? iconMap[key as IconName] : Fallback;
}
```

`IdentityIcon` becomes:

```tsx
export function IdentityIcon({ name, fallback = "network", className }: { name: string | null | undefined; fallback?: IconName; className?: string }) {
  const m = name ? MATERIAL.exec(name) : null;
  if (m) return <MaterialIcon name={m[1]} className={className} style={{ color: hueFor(name!) }} />;

  const key = (name && name in iconMap ? name : fallback) as IconName;
  const Icon = iconMap[key];
  return <Icon className={className} style={{ color: hueFor(key) }} />;
}
```

`<MaterialIcon>` has no fixed size — every call site already sizes icons by class (`size-4`, `[&_svg]:size-…`). The base icons set a 24×24 `width`/`height`; add `width="24" height="24"` so an unsized parent gets the same box.

- [ ] **Step 2: Replace each guard** — `x in iconMap` → `isIdentityIcon(x)`; in the five admin list pages `const Icon = name && name in iconMap ? iconMap[name as IconName] : IconX;` → `const Icon = iconFor(name, IconX);`. In `icon-tile.tsx` keep `fallback` for the non-icon case: `const key = !name ? undefined : isIdentityIcon(name) ? name : fallback;` and render `IdentityIcon` with that key (it handles both).

- [ ] **Step 3: Verify** `npx tsc --noEmit`, `npm run lint`; then a manual check: set a solution's icon to `ms:router` directly in the dev database (`php artisan tinker --execute="App\Models\Solution::first()->update(['icon'=>'ms:router']);"`), open `/solutions` and the solution's page — the icon draws in its hue; `ms:not_a_real_icon` draws nothing and the browser console logs no error beyond the 404 network line the audit ignores. Put the original icon back.
- [ ] **Step 4: Commit.**

---

### Task 7: The API accepts `ms:` keys

**Files:**
- Create: `api/app/Support/IconKey.php`
- Modify: `api/app/Support/PageSections/SectionRules.php:193`, `api/app/Support/Blocks/BlockRules.php:31`, `api/app/Http/Requests/{StoreSolutionRequest,UpdateSolutionRequest,StoreServiceRequest,UpdateServiceRequest,StoreIndustryRequest,UpdateIndustryRequest,StoreProductCategoryRequest,UpdateProductCategoryRequest,ServiceCategoryRequest,ContentTypeRequest,MenuRequest}.php`
- Test: `api/tests/Feature/IconKeyTest.php`

**Interfaces:**
- Produces: `IconKey::PATTERN = '/^(?:ms:[a-z0-9_]{1,37}|[a-z0-9-]{1,40})$/'`, `IconKey::RULE = 'regex:'.IconKey::PATTERN`.

- [ ] **Step 1: Failing test**

```php
<?php
namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IconKeyTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): User
    {
        $u = User::create(['name' => 'Ed', 'email' => 'icons@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $u->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'Content manager']));
        return $u;
    }

    private function solution(string $icon)
    {
        return $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/solutions', [
            'title' => 'Wi-Fi '.uniqid(), 'status' => 'draft', 'icon' => $icon,
        ]);
    }

    public function test_a_google_icon_and_a_site_icon_are_accepted(): void
    {
        $this->solution('ms:router')->assertCreated()->assertJsonPath('data.icon', 'ms:router');
        $this->solution('shield')->assertCreated();
    }

    public function test_a_malformed_key_is_refused(): void
    {
        $this->solution('ms:Router!')->assertUnprocessable()->assertJsonValidationErrors('icon');
        $this->solution('ms:'.str_repeat('a', 38))->assertUnprocessable()->assertJsonValidationErrors('icon');
    }

    public function test_a_builder_feature_takes_a_google_icon(): void
    {
        $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/pages/preview', ['blocks' => [[
            'id' => '0b9a2d4e-1c3f-4a5b-8c6d-7e8f9a0b1c2d', 'type' => 'features', 'hidden' => false,
            'data' => ['heading' => 'Why', 'items' => [['icon' => 'ms:router', 'title' => 'Fast', 'body' => 'It is.']]],
        ]]])->assertOk();
    }
}
```

(If `/admin/solutions` needs more required fields, copy the minimum from `tests/Feature/SolutionAdminTest.php`'s payload.)

- [ ] **Step 2: Run** — Expected: the `ms:router` cases FAIL (`max:40` passes but `SectionRules::ICON_PATTERN` refuses the colon).

- [ ] **Step 3: Implement** — `IconKey` as above; `SectionRules::ICON_PATTERN = IconKey::PATTERN`; `BlockRules::ICON = IconKey::RULE`; each request's `'icon'` rule becomes `[…existing presence rules…, 'nullable', 'string', 'max:40', IconKey::RULE]` (`ContentTypeRequest` keeps `max:60` and swaps its regex for `IconKey::RULE`; `MenuRequest` the same). `PageDraft` already filters with `SectionRules::ICON_PATTERN`, which now admits `ms:` — fine, it is checked against the icons the console sent.

- [ ] **Step 4: Run** the test, then `php artisan test --filter='Solution|Service|Industry|Category|Menu|Section|Block|ContentType'` — Expected: green.
- [ ] **Step 5:** pint, `composer analyse`. **Commit.**

---

### Task 8: Google icons in the icon picker

**Files:**
- Create: `web/src/app/api/admin/icons/material/route.ts`
- Create: `web/src/components/admin/material-icon-grid.tsx`
- Modify: `web/src/components/admin/icon-field.tsx`

**Interfaces:**
- Consumes: `material-symbols.json` (Task 5) — **in the route handler only**; `MaterialIcon` (Task 6).
- Produces: `GET /api/admin/icons/material?q=&page=` → `{data: string[] /* names */, meta: {total, page, per: 120}}` (staff only, `no-store`); `<MaterialIconGrid onPick={(name) => void} />` (search box + grid + "Show more").

- [ ] **Step 1: The route** — `getToken()`; 401 without one. Names = `Object.keys(map)`; filter: every whitespace-separated word of `q` (lower-cased, spaces → `_`-insensitive) must be a substring of the name; sort exact match, then prefix matches, then the rest alphabetically; slice 120 per page. Names only — thumbnails draw through `MaterialIcon`, i.e. `/icons/material/<name>.svg`, which the browser caches for a year.

- [ ] **Step 2: The grid** — search input (debounced 200 ms), results as 72px tiles (`grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2`), each a `button` with `<MaterialIcon name className="size-6" />` and the name under it (`text-11-5 break-all`), `aria-label={name.replace(/_/g, " ")}`; "Show more" appends the next page. Tiles keep the 24px tap-target rule.

- [ ] **Step 3: The field** — in `icon-field.tsx`:
  - Accept an `ms:` default: `defaultValue && (NAMES.includes(defaultValue) || /^ms:[a-z0-9_]{1,37}$/.test(defaultValue)) ? defaultValue : ""`.
  - The current-value chip: an `ms:` value renders `<MaterialIcon name={selected.slice(3)} />` and its label `selected.slice(3).replace(/_/g, " ") + " (Google)"`.
  - Inside the modal, two tabs above the search (`role="tablist"`, two buttons with `aria-selected`): **Site icons** (the existing grid, unchanged) and **Google icons** (`<MaterialIconGrid onPick={(n) => { select(`ms:${n}`); close(); }} />`), the second mounted only once chosen so nothing is fetched until then.
  - The file keeps importing `iconMap` (it is the lazy chunk by design) and never imports the JSON.

- [ ] **Step 4: Verify** `npx tsc --noEmit`, `npm run lint`. Check the client bundle does not contain the path data: `npm run build` is **not** run against the live dev server's `.next` — instead `grep -rl "0 -960 960 960" .next/static 2>/dev/null | head` after a dev page load should list nothing but the tiny `<svg viewBox>` strings, never a file over 100 KB.
- [ ] **Step 5: Commit.**

---

### Task 9: Google icons in body text

**Files:**
- Modify: `web/src/lib/shortcodes.ts` (add `expandInlineIcons`)
- Modify: the component that renders an HTML segment in `ProseWithShortcodes` (find with `grep -rn "type === \"html\"" src/components`) — pass `segment.html` through `expandInlineIcons` before `dangerouslySetInnerHTML`
- Modify: `web/src/components/admin/rich-text-editor.tsx` (an `icon` toolbar button and a dialog)
- Modify: `web/src/app/globals.css` (one rule for `.prose-icon`)
- Create: `web/scripts/shortcodes.check.mjs`

**Interfaces:**
- Consumes: `MaterialIconGrid` (Task 8).
- Produces: `expandInlineIcons(html: string): string`.

**Ruling recorded here, and in `docs/editor.md`:** CLAUDE.md says a shortcode is never expanded by string substitution, because the sanitiser has already run. An inline icon must sit inside a paragraph, where the segment splitter cannot reach without parsing HTML. The substitution is allowed **only** because the one substituted token is held by the regex to `[a-z0-9_]{1,37}` — no quote, angle bracket, ampersand or space can be produced — so it cannot leave the attribute it is written into. Site icons are not offered in text (they are React components with no file to `<use>`), which narrows the spec's "site icons may be inserted the same way".

- [ ] **Step 1: The check script (failing first)**

```js
// web/scripts/shortcodes.check.mjs — node --experimental-strip-types scripts/shortcodes.check.mjs
import { expandInlineIcons } from "../src/lib/shortcodes.ts";
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const out = expandInlineIcons('<p>Call us [icon name="ms:call"] today</p>');
ok(out.includes('<use href="/icons/material/call.svg#i"/>') && out.startsWith("<p>Call us <svg"), "an icon becomes an inline svg in place");
ok(expandInlineIcons('<p>[icon name="ms:call\\" onload=\\"x"]</p>') === '<p>[icon name="ms:call\\" onload=\\"x"]</p>', "markup in the name stays literal");
ok(expandInlineIcons('<p>[icon name="router"]</p>') === '<p>[icon name="router"]</p>', "a site icon name is left as typed");
ok(expandInlineIcons('<p>[icon name=&quot;ms:call&quot;]</p>').includes("<svg"), "the editor's entity-encoded quotes still match");
ok(expandInlineIcons("<p>No icons</p>") === "<p>No icons</p>", "a body without one is untouched");
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run** — Expected: FAIL (`expandInlineIcons` not exported).

- [ ] **Step 3: Implement** in `shortcodes.ts`:

```ts
/**
 * `[icon name="ms:router"]` inside a paragraph, as an inline svg (0.179.0).
 * The one shortcode expanded by substitution — see docs/editor.md: the only
 * value written into the markup is held to [a-z0-9_], which cannot leave an
 * attribute. Quotes may arrive entity-encoded from the editor.
 */
const INLINE_ICON = /\[icon\s+name=(?:"|'|&quot;)ms:([a-z0-9_]{1,37})(?:"|'|&quot;)\s*\]/g;

export function expandInlineIcons(html: string): string {
  return html.includes("[icon")
    ? html.replace(INLINE_ICON, (_m, name: string) =>
      `<svg class="prose-icon" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><use href="/icons/material/${name}.svg#i"/></svg>`)
    : html;
}
```

`globals.css`: `.prose-icon { display: inline-block; width: 1.15em; height: 1.15em; vertical-align: -0.2em; }` (unlayered, beside the prose rules).

- [ ] **Step 4: Run** the check — Expected: all `ok`. Apply `expandInlineIcons` where an html segment is rendered, then `npx tsc --noEmit`.

- [ ] **Step 5: The editor button** — in `rich-text-editor.tsx`, add `"icon"` to the insert group after `"library"`, a `buttons.icon` factory on the `library` pattern (`contents: '<i class="note-icon-star"></i><span class="note-library-label">Icon</span>'`, `tooltip: "Insert a Google icon"`, `container: context.options.container`, `click` saves the range and sets `pickingIcon`), and render

```tsx
<Modal open={pickingIcon} onClose={() => setPickingIcon(false)} title="Insert a Google icon" size="lg">
  {pickingIcon && <MaterialIconGrid onPick={(name) => {
    const el = host.current;
    if (el) { restoreRange.current(); $(el).summernote("insertText", `[icon name="ms:${name}"]`); }
    setPickingIcon(false);
  }} />}
</Modal>
```

- [ ] **Step 6: Verify** — `npm run lint`, `npx tsc --noEmit`; in the browser, a draft page body gets an icon from the button, saves, and the public page shows an inline icon in the text's colour. Then **Commit**.

---

### Task 10: The site import offers a matching Google font

**Files:**
- Modify: `api/app/Support/SiteImport/Brand.php:484` and `api/app/Support/SiteImport/Steps/BrandStep.php:83`
- Test: add one case to `api/tests/Unit/SiteImportBrandTest.php` and one to the brand step's feature test (find it with `grep -rln "BrandStep\|brand.accept" api/tests`)

- [ ] **Step 1: Failing tests** — a family not vendored but in the catalogue (`Poppins`) is offered as `{family: "Poppins", id: "g-poppins", custom: null}`; with the brand accepted and fonts used, the commit installs it (Google faked as in Task 2) and writes `theme_font_display = g-poppins`. A family in neither is offered as before.
- [ ] **Step 2: Implement** — in `Brand`, after the `FONTS` lookup misses: `$g = GoogleFontCatalogue::find(GoogleFontCatalogue::slug($family)); if ($g) return ['family' => $g['family'], 'id' => 'g-'.$g['slug'], 'custom' => null];` (before the custom-WOFF2 branch, so a Google family is never copied into a slot). In `BrandStep`, when the chosen id starts with `g-`, call `GoogleFonts::install(substr($id, 2))` before the settings write; a `ValidationException` from it drops that role's font and records the sentence in the step's notes rather than failing the import.
- [ ] **Step 3: Run** the two tests and `php artisan test --filter=SiteImport` — Expected: green. **Commit.**

---

### Task 11: Docs, manual, version, probe and audits

**Files:**
- Modify: `docs/theming.md` ("Google fonts"), `docs/icons.md` (Material Symbols as the sixth pack, vendored whole, Apache-2.0 credit), `docs/editor.md` (the inline-icon ruling), `CLAUDE.md` (one line each under Theme generation, Icon packs, The rich-text editor), `API.md` (the five font routes, `google_fonts` on `/settings`, `ms:` icon keys), `manual/15-appearance.md` (choosing a Google font), the manual chapter that covers the page editor (an icon in text), `VERSION.md`, `web/src/lib/version.ts` (`0.179.0`), `PROGRESS.md`, `FEATURES.md`, `web/src/content/help.json` (`npm run help`)
- Create: `web/scripts/probes/google-fonts-icons.mjs`

- [ ] **Step 1: Docs and version** as listed; `npm run help` then `node scripts/build-help.mjs --check` and `node scripts/help-routes.check.mjs`.
- [ ] **Step 2: The probe** (throwaway admin from env, no credentials in the file; restores everything it changes):
  1. Settings → Colour palette: open **Browse Google Fonts…**, search "Noto Sans Devanagari", press **Install and use**, Save.
  2. Open `/` with request logging on; assert the computed `font-family` of the `h1` starts with `"tw-g-noto-sans-devanagari"`, that a `/font/g/noto-sans-devanagari/` request was made, and that **no request went to any `*.google*` or `gstatic` host**.
  3. Open the first solution's edit form, choose **Google icons** → `router`, save; on the public solutions index the tile holds an `svg use[href="/icons/material/router.svg#i"]`.
  4. A new draft page: insert an icon through the editor button, save, open its preview; assert an inline `svg.prose-icon`.
  5. Restore: the headline font and the solution's icon put back, the draft page deleted, the Google font removed.
- [ ] **Step 3: Full checks** — `php artisan test` (one process), `pint`, `composer analyse`, `npx tsc --noEmit`, `npm run lint`, both check scripts, `node scripts/build-material-symbols.mjs --check`, the probe, then `npm run audit` light and dark and `npm run audit:mobile` over `/`, `/solutions`, a page with an inline icon, `/admin/site/settings?tab=appearance` (and the Google Fonts dialog and icon picker measured open by hand in both schemes — no audit opens a dialog).
- [ ] **Step 4: Commit** `0.179.0: Google Fonts, Noto and Google icons — copied to this server, never fetched by a visitor`.
