# Kinetic type and micro-interactions (0.171.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hero headings that rotate words, type, decode or draw a highlight, plus small micro-interactions on the site, the portal and the console.

**Architecture:**
- One client island, `KineticText`, sits behind the two hero choke points: `HeroTitle`, which serves all twelve themes' homepage heroes and resolves the effect itself from the settings, and the builder's `HeroSection`.
- The server always renders the finished heading. The animation only hides and reveals a decorative copy, and that start state exists only under `prefers-reduced-motion: no-preference` and `scripting: enabled`, with a failsafe.
- Micro-interactions are CSS keyed on `[data-motion-micro="lively"]` (site and portal) and `[data-console]` (console), plus three small JS hooks: the toast's `tw:saved` event, FormActions' "Saved" swap, and the sidebar badge bump.

**Tech Stack:** Laravel 13 (settings, SectionRules), Next.js 16 / React 19.3, Tailwind v4 CSS in `globals.css`, Playwright probes.

**Spec:** `docs/superpowers/specs/2026-10-13-kinetic-type-design.md`

## Global Constraints

- **Server HTML:** it is the finished heading, real text in the `h1`. Animated spans are `aria-hidden`, and the full text sits in a `sr-only` span.
- **No layout shift:** letter and word boxes are at their final size from the first frame.
- **Motion properties:** `transform`/`translate`/`scale`/`opacity` only, plus the two named exceptions: `text-decoration-thickness`/`text-underline-offset` on prose links, and SVG `stroke-dashoffset`. Transition `translate`/`scale`, never `transform`. No horizontal movement that can widen the document.
- **Reduced motion:** every animation sits inside `@media (prefers-reduced-motion: no-preference)`. A hidden start state lives only there.
- **Automated browsers:** `KineticText` renders final when `navigator.webdriver` is true, unless `localStorage.tw_kinetic_force === "1"`.
- **Rotating words:** a Pause button (WCAG 2.2.2).
- **Code rules:**
  - No new npm or composer dependency.
  - `web/` files are CRLF: edit with the Edit tool or Python `write_bytes` that keeps CRLF. `api/*.php` is LF.
  - Colours are tokens only.
  - Probes carry no credentials (`ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` env) and use throwaway records, deleted after.
- **Micro default:** `motion_micro` defaults to `lively`. This is the client's deliberate exception to "first choice = old behaviour".
- **Commits:** on `phase-3-admin-cms`. Never push. Every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A heading with one word:** rotate's "last word" is the whole heading and highlight marks it. Nothing throws. (Task 3 check.)
2. **A JS failure or hydration error:** text hidden by the start state must reappear within 3s (the failsafe). (Task 4 probe checks by blocking the island's chunk.)
3. **A long rotate alternative at 320px:** the slot wraps, no sideways scroll. (Task 9 probe.)
4. **Two builder heroes on one page, both rotating:** separate ids, both pause independently. (Task 4: the id comes from the section id.)
5. **`motion_micro=none`:** no micro rule applies, and the Switch still slides as before. (Task 9 probe.)

---

### Task 1: API — the four settings

**Files:**
- Modify: `api/database/seeders/SettingsSeeder.php` (motion group near line 789, homepage group near line 42)
- Modify: `api/app/Http/Controllers/Api/V1/Admin/SettingController.php`:
  - `validateMotion` `$ids` at line 719
  - `optionsFor` near line 327
  - the per-key checks near line 881
  - a new constant `HERO_KINETIC` beside `STAT_ANIMATIONS` (line 243)
- Modify: `web/mock-api.mjs` (lines 3374 and 5051)
- Test: `api/tests/Feature/KineticSettingsTest.php` (new); `api/tests/Feature/MotionSettingsTest.php` (its key lists)

**Interfaces:**
- Produces: public settings `motion_headline` (default `none`), `motion_micro` (default `lively`), `hero_kinetic` (default `default`) and `hero_kinetic_words` (default blank).
- Produces: admin `options` for `hero_kinetic` as `[{value,label,description}]` for `default, none, rotate, type, decode, highlight`.

- [ ] **Step 1: Write the failing test** `api/tests/Feature/KineticSettingsTest.php`

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** 0.171.0: the hero heading effect and the small interactions (docs/motion.md). */
class KineticSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function admin(): User
    {
        $user = User::create(['name' => 'Admin', 'email' => 'kinetic-admin@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]));

        return $user;
    }

    private function save(array $pairs)
    {
        return $this->actingAs($this->admin(), 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_the_four_keys_are_public_with_their_defaults(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame('none', $public['motion_headline']);
        $this->assertSame('lively', $public['motion_micro']);
        $this->assertSame('default', $public['hero_kinetic']);
        $this->assertArrayNotHasKey('hero_kinetic_words', $public, 'blank is dropped from the public map');
    }

    public function test_the_motion_ids_are_shape_checked(): void
    {
        $this->save(['motion_headline' => 'decode', 'motion_micro' => 'none'])->assertOk();
        $this->assertSame('decode', Setting::get('motion_headline'));
        $this->save(['motion_headline' => 'Type It!'])->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');
        $this->save(['motion_micro' => 'Lots'])->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');
    }

    public function test_the_hero_effect_is_one_of_the_list(): void
    {
        $this->save(['hero_kinetic' => 'rotate'])->assertOk();
        $this->assertSame('rotate', Setting::get('hero_kinetic'));
        $this->save(['hero_kinetic' => 'spin'])->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');

        $groups = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/settings')->json('data.homepage');
        $row = collect($groups)->firstWhere('key', 'hero_kinetic');
        $this->assertSame(['default', 'none', 'rotate', 'type', 'decode', 'highlight'], array_column($row['options'], 'value'));
    }

    public function test_the_words_are_six_short_lines_at_most(): void
    {
        $this->save(['hero_kinetic_words' => "networks\n\nstorage\nsecurity"])->assertOk();
        $this->assertSame("networks\nstorage\nsecurity", Setting::get('hero_kinetic_words'), 'blank lines are dropped');

        $this->save(['hero_kinetic_words' => implode("\n", array_fill(0, 7, 'word'))])
            ->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');
        $this->save(['hero_kinetic_words' => str_repeat('x', 41)])
            ->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `api/`): `php artisan test --filter=KineticSettingsTest`
Expected: FAIL, with an undefined array key `motion_headline`.

- [ ] **Step 3: Implement**

In `SettingsSeeder.php`:
- After the `motion_progress` row, add:

  ```php
  ['group' => 'motion', 'key' => 'motion_headline', 'value' => 'none', 'type' => 'string'],
  // Lively by default — the client's deliberate exception to "the site as it moved before" (0.171.0).
  ['group' => 'motion', 'key' => 'motion_micro', 'value' => 'lively', 'type' => 'string'],
  ```

- After `hero_lede`, add:

  ```php
  ['group' => 'homepage', 'key' => 'hero_kinetic', 'value' => 'default', 'type' => 'string'],
  ['group' => 'homepage', 'key' => 'hero_kinetic_words', 'value' => null, 'type' => 'text'],
  ```

  Match the neighbouring rows' keys. If other rows carry `is_public` or similar, copy them. The homepage and motion groups are public as whole groups in `PublicSettings::GROUPS`; confirm with `grep -n "homepage\|motion" app/Support/PublicSettings.php`.

In `SettingController.php`:
- Add `'motion_headline', 'motion_micro'` to `$ids` in `validateMotion`.
- Beside `STAT_ANIMATIONS`, add:

  ```php
  /** A homepage hero's heading effect (0.171.0); `default` follows Motion → Hero heading. */
  public const HERO_KINETIC = [
      ['value' => 'default', 'label' => 'As the Motion settings say', 'description' => 'Whatever Motion → Hero heading is set to.'],
      ['value' => 'none', 'label' => 'None', 'description' => 'The heading is simply there.'],
      ['value' => 'rotate', 'label' => 'Rotating words', 'description' => 'The last word cycles through the words below, once, then rests on the original.'],
      ['value' => 'type', 'label' => 'Typewriter', 'description' => 'The heading types itself in once.'],
      ['value' => 'decode', 'label' => 'Decode', 'description' => 'Each letter flickers through random characters and settles.'],
      ['value' => 'highlight', 'label' => 'Highlight', 'description' => 'A marker stroke draws itself under a word — the one below, or the last word.'],
  ];
  ```

- In `optionsFor`'s match, add `'hero_kinetic' => self::HERO_KINETIC,`.
- In the per-key check loop (beside `stats_animation`), add:

  ```php
  if ($key === 'hero_kinetic' && filled($value) && ! in_array($value, array_column(self::HERO_KINETIC, 'value'), true)) {
      throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose an effect from the list.']);
  }
  if ($key === 'hero_kinetic_words' && filled($value)) {
      $lines = array_values(array_filter(array_map('trim', preg_split('/\R/', (string) $value)), fn ($l) => $l !== ''));
      if (count($lines) > 6 || collect($lines)->contains(fn ($l) => mb_strlen($l) > 40)) {
          throw ValidationException::withMessages(["settings.{$i}.value" => 'Up to six words or short phrases, one per line.']);
      }
      $rows[$i]['value'] = implode("\n", $lines);
  }
  ```

  Check that the loop variable holding the rows to write is named `$rows`, as the `media_cdn_url` branch at line ~873 uses. If it is not, use whatever that branch writes to.

In `MotionSettingsTest.php`:
- Add `'motion_headline' => 'none', 'motion_micro' => 'lively'` to `$defaults`.
- Add both keys to the `assertEqualsCanonicalizing` list.
- Change "six keys" in the method name and docblock to "every key".

In `web/mock-api.mjs`:
- On line 3374, add `motion_headline: 'none', motion_micro: 'lively', hero_kinetic: 'default',`.
- Beside line 5051, add:

  ```js
  s('motion_headline', 'none', { group: 'motion' }),
  s('motion_micro', 'lively', { group: 'motion' }),
  ```

- Add `hero_kinetic` and `hero_kinetic_words` rows wherever the homepage group's `s('hero_lede', …)` sits.

- [ ] **Step 4: Run the tests**

Run: `php artisan test --filter="KineticSettingsTest|MotionSettingsTest"`
Expected: PASS, with 10 tests.

- [ ] **Step 5: Commit**

```bash
git add api/database/seeders/SettingsSeeder.php api/app/Http/Controllers/Api/V1/Admin/SettingController.php api/tests/Feature/KineticSettingsTest.php api/tests/Feature/MotionSettingsTest.php web/mock-api.mjs
git commit -m "0.171.0: hero heading effect and small-interactions settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: API — the builder hero's effect

**Files:**
- Modify: `api/app/Support/PageSections/SectionRules.php`:
  - the `PageSectionType::Hero` rules at line 282
  - the `checkData` `case PageSectionType::Hero` at line 1037
- Modify: `web/src/types/api.ts` (`HeroSectionData`)
- Test: `api/tests/Feature/KineticSettingsTest.php` (add two tests)

**Interfaces:**
- Produces: hero section `data.kinetic` (an id string, or absent; `default` is never stored) and `data.kinetic_words` (string, or absent), on both the admin and public reads.
- Produces: TypeScript `HeroSectionData.kinetic?: string | null; kinetic_words?: string | null`.

- [ ] **Step 1: Write the failing tests** (append to `KineticSettingsTest`)

```php
    private function heroPage(array $data)
    {
        return $this->actingAs($this->admin(), 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => 'Kinetic test page', 'slug' => 'kinetic-test-page', 'status' => 'draft', 'template' => 'builder',
            'blocks' => [[
                'id' => '0f8c9a3e-7d1b-4c2a-9e5f-1a2b3c4d5e6f', 'type' => 'hero', 'hidden' => false,
                'data' => array_merge(['heading' => 'We keep networks running', 'layout' => 'centered'], $data),
            ]],
        ]);
    }

    public function test_a_builder_hero_keeps_its_effect_and_words(): void
    {
        $res = $this->heroPage(['kinetic' => 'rotate', 'kinetic_words' => "servers\nstorage"])->assertCreated();
        $this->assertSame('rotate', $res->json('data.blocks.0.data.kinetic'));
        $this->assertSame("servers\nstorage", $res->json('data.blocks.0.data.kinetic_words'));
    }

    public function test_a_builder_hero_refuses_a_bad_effect_or_too_many_words_and_does_not_store_default(): void
    {
        $this->heroPage(['kinetic' => 'Spin It'])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.kinetic');
        $this->heroPage(['kinetic' => 'rotate', 'kinetic_words' => implode("\n", array_fill(0, 7, 'w'))])
            ->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.kinetic_words');
        $res = $this->heroPage(['kinetic' => 'default'])->assertCreated();
        $this->assertArrayNotHasKey('kinetic', $res->json('data.blocks.0.data'));
    }
```

Check `PageAdminTest` or `LayoutSectionTest` for how a builder page is created in tests: the required fields, the id format, and whether `data.blocks` is the response key. Mirror them exactly.

- [ ] **Step 2: Run them to verify they fail**

Run: `php artisan test --filter=KineticSettingsTest`
Expected: the two new tests FAIL; `kinetic` is dropped by `normalise()`.

- [ ] **Step 3: Implement**

In the Hero rules array, after `video_path`, add:

```php
                // The heading's effect (0.171.0): an id checked for shape — the
                // list is motion-choices.ts's KINETIC — and the words it needs.
                'kinetic' => ['nullable', 'string', 'regex:/^[a-z][a-z0-9-]{1,31}$/'],
                'kinetic_words' => ['nullable', 'string', 'max:300'],
```

In `checkData`'s Hero case, after the video check, add:

```php
                $words = $data['kinetic_words'] ?? null;
                if (is_string($words) && $words !== '') {
                    $lines = array_values(array_filter(array_map('trim', preg_split('/\R/', $words)), fn ($l) => $l !== ''));
                    if (count($lines) > 6 || collect($lines)->contains(fn ($l) => mb_strlen($l) > 40)) {
                        $validator->errors()->add("{$at}.kinetic_words", 'Up to six words or short phrases, one per line.');
                    }
                }
```

`default` must not be stored. Find where `normalise()` drops defaults for other keys (`grep -n "default" app/Support/PageSections/SectionRules.php | head -40`, for example the reveal handling). Add, for the hero type, `if (($data['kinetic'] ?? null) === 'default' || ($data['kinetic'] ?? '') === '') unset($data['kinetic']);`. Also unset an empty `kinetic_words`.

In `web/src/types/api.ts`, find `HeroSectionData` and add `kinetic?: string | null;` and `kinetic_words?: string | null;`.

- [ ] **Step 4: Run the tests**

Run: `php artisan test --filter="KineticSettingsTest|LayoutSectionTest|PageBuilderTest"`
Expected: PASS. Use `--filter=Section` if `PageBuilderTest` does not exist.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/PageSections/SectionRules.php api/tests/Feature/KineticSettingsTest.php web/src/types/api.ts
git commit -m "0.171.0: a builder hero carries its heading effect

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend lists and the resolver

**Files:**
- Modify: `web/src/lib/motion-choices.ts` (add `KINETIC`, `KINETIC_SITE`, `MICRO`; extend `Motion`, `motionFor`, `motionAttrs`)
- Create: `web/src/lib/kinetic.ts` (directive-less, pure)
- Create: `web/scripts/kinetic.check.mjs`

**Interfaces:**
- Produces: `export type KineticEffect = "none" | "rotate" | "type" | "decode" | "highlight";`
- Produces: `export function kineticFor(siteDefault: string | undefined, override: string | null | undefined, words: string | null | undefined): { effect: KineticEffect; words: string[] }`
- Produces: `export function kineticWords(raw: string | null | undefined): string[]`
- Produces: `export function splitLast(text: string): { head: string; last: string }`
- Produces: `export function findMark(text: string, word: string | undefined): { before: string; mark: string; after: string }`
- Produces: `Motion` gains `headline: string; micro: string`, and `motionAttrs` gains `"data-motion-micro": m.micro`.

- [ ] **Step 1: Write the failing check** `web/scripts/kinetic.check.mjs`

```js
// The heading effect resolver (docs/motion.md "Kinetic headings").
// Run from web/: node --experimental-strip-types scripts/kinetic.check.mjs
const { kineticFor, kineticWords, splitLast, findMark } = await import("../src/lib/kinetic.ts");
let failed = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { failed++; console.error(`FAIL ${name}: got ${a}, want ${b}`); } else console.log(`ok   ${name}`);
};
eq("default follows the site", kineticFor("type", "default", ""), { effect: "type", words: [] });
eq("blank follows the site", kineticFor("decode", undefined, null), { effect: "decode", words: [] });
eq("an override wins", kineticFor("type", "highlight", "fast"), { effect: "highlight", words: ["fast"] });
eq("an unknown id is none", kineticFor("spin", "default", ""), { effect: "none", words: [] });
eq("rotate without words is none", kineticFor("none", "rotate", " \n "), { effect: "none", words: [] });
eq("rotate with words", kineticFor("none", "rotate", "servers\n\n storage "), { effect: "rotate", words: ["servers", "storage"] });
eq("site rotate is refused (needs words)", kineticFor("rotate", "default", ""), { effect: "none", words: [] });
eq("words: at most six, trimmed", kineticWords("a\nb\nc\nd\ne\nf\ng"), ["a", "b", "c", "d", "e", "f"]);
eq("splitLast", splitLast("Keep the  network up "), { head: "Keep the  network", last: "up" });
eq("splitLast one word", splitLast("Uptime"), { head: "", last: "Uptime" });
eq("findMark word", findMark("We keep networks running", "NETWORKS"), { before: "We keep ", mark: "networks", after: " running" });
eq("findMark falls back to the last word", findMark("We keep networks running", "absent"), { before: "We keep networks ", mark: "running", after: "" });
eq("findMark one word", findMark("Uptime", undefined), { before: "", mark: "Uptime", after: "" });
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `web/`): `node --experimental-strip-types scripts/kinetic.check.mjs`
Expected: FAIL, with `Cannot find module '../src/lib/kinetic.ts'`.

- [ ] **Step 3: Implement** `web/src/lib/kinetic.ts`

```ts
/**
 * A hero heading's effect (0.171.0, docs/motion.md "Kinetic headings").
 * Pure and directive-less: the server components that resolve it and the
 * island that plays it both import it. The list is `KINETIC` in
 * motion-choices.ts; the API checks only an id's shape, so anything this
 * file does not know is `none`.
 */
export type KineticEffect = "none" | "rotate" | "type" | "decode" | "highlight";

const EFFECTS: KineticEffect[] = ["none", "rotate", "type", "decode", "highlight"];
const SITE_EFFECTS: KineticEffect[] = ["none", "type", "decode", "highlight"];

/** One alternative per line, trimmed, blanks dropped, at most six. */
export function kineticWords(raw: string | null | undefined): string[] {
  return (raw ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6);
}

/**
 * `default` or blank follows the site's choice; an unknown id is `none`;
 * rotating words without words is `none` — and the site-wide choice can
 * never be `rotate`, which needs a list only a hero can carry.
 */
export function kineticFor(
  siteDefault: string | undefined,
  override: string | null | undefined,
  words: string | null | undefined,
): { effect: KineticEffect; words: string[] } {
  const list = kineticWords(words);
  const site = SITE_EFFECTS.includes(siteDefault as KineticEffect) ? (siteDefault as KineticEffect) : "none";
  const own = !override || override === "default" ? site : EFFECTS.includes(override as KineticEffect) ? (override as KineticEffect) : "none";
  if (own === "rotate" && list.length === 0) return { effect: "none", words: [] };
  return { effect: own, words: own === "rotate" || own === "highlight" ? list : [] };
}

/** The heading less its last word, and the last word. */
export function splitLast(text: string): { head: string; last: string } {
  const t = text.trimEnd();
  const cut = t.lastIndexOf(" ");
  return cut < 0 ? { head: "", last: t } : { head: t.slice(0, cut).trimEnd(), last: t.slice(cut + 1) };
}

/** The word to mark: the first case-insensitive match of `word`, else the last word. */
export function findMark(text: string, word: string | undefined): { before: string; mark: string; after: string } {
  const t = text.trimEnd();
  if (word) {
    const at = t.toLowerCase().indexOf(word.toLowerCase());
    if (at >= 0) return { before: t.slice(0, at), mark: t.slice(at, at + word.length), after: t.slice(at + word.length) };
  }
  const { head, last } = splitLast(t);
  return { before: head ? `${head} ` : "", mark: last, after: "" };
}
```

`kineticFor("type", "highlight", "fast")` expects `words: ["fast"]`, so highlight keeps its words and the check passes.

Then, in `motion-choices.ts`:
- After `PROGRESS`, add:

  ```ts
  /** A hero heading's effect (0.171.0) — `kinetic.ts` resolves it. */
  export const KINETIC: MotionChoice[] = [
    { id: "none", label: "None", note: "The heading is simply there. The current behaviour." },
    { id: "rotate", label: "Rotating words", note: "The last word cycles through a list, once, then rests on the original. Set per hero." },
    { id: "type", label: "Typewriter", note: "The heading types itself in once, with a caret that fades when it finishes." },
    { id: "decode", label: "Decode", note: "Each letter flickers through random characters and settles, left to right." },
    { id: "highlight", label: "Highlight", note: "A marker stroke draws itself under the last word — or a word a hero names." },
  ];
  /** What the site-wide default may be: rotating words needs a hero's own list. */
  export const KINETIC_SITE = KINETIC.filter((c) => c.id !== "rotate");

  /**
   * Small interactions (`motion_micro`, 0.171.0). **Lively is first and the
   * default**, the client's deliberate exception to "the first entry is the
   * site as it moved before": each effect is a few pixels or a few hundred
   * milliseconds.
   */
  export const MICRO: MotionChoice[] = [
    { id: "lively", label: "Lively", note: "Links, arrows, switches, tick boxes, copy buttons and card icons answer the pointer with a small movement." },
    { id: "none", label: "None", note: "Colour changes only. Nothing moves." },
  ];
  ```

- In `Motion`, add `headline: string; micro: string;`.
- In `motionFor`, add `headline: pick(KINETIC_SITE, settings.motion_headline), micro: pick(MICRO, settings.motion_micro),`.
- In `motionAttrs`, add `"data-motion-micro": m.micro,`.

- [ ] **Step 4: Run the check and type-check**

Run: `node --experimental-strip-types scripts/kinetic.check.mjs; npx tsc --noEmit`
Expected: every line `ok`; tsc reports no errors. Fix every `Motion` object literal tsc names, for example a preset or a test fixture, by adding `headline: "none", micro: "lively"`.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/kinetic.ts web/src/lib/motion-choices.ts web/scripts/kinetic.check.mjs
git commit -m "0.171.0: heading effect list and resolver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `KineticText`, its CSS, and the two heroes

**Files:**
- Create: `web/src/components/ui/kinetic-text.tsx`
- Modify: `web/src/lib/hero-heading.tsx` (`HeroTitle` becomes async and resolves the effect)
- Modify: `web/src/components/home/hero.tsx` (lines 110-115: pass `text` and `lastWordClassName`)
- Modify: `web/src/components/page-sections/hero-section.tsx` (two `<Heading>` sites, lines 78 and 90, plus the split layout's)
- Modify: `web/src/app/globals.css` (new block "Kinetic headings", placed after the headline block near line 4745)
- Create: `web/scripts/probes/kinetic-type.mjs`

**Interfaces:**
- Consumes: `kineticFor`, `splitLast`, `findMark` and `KineticEffect` from Task 3. `getSiteSettings()` from `lib/settings.ts`. `useMotionOk()` from `lib/hooks/use-carousel.ts`.
- Produces: `<KineticText text effect words id lastWordClassName />`. Attributes `data-kinetic`, `data-kinetic-armed`, `data-kinetic-run`, `data-kinetic-done`; `data-k-char` (with `data-on`, `data-s`, `data-g`, `data-caret`); `data-k-alt` (with `data-cur`); `.k-mark`. The probe relies on these names.
- Produces: `HeroTitle` props `{ className?: string; children: ReactNode; text?: string; lastWordClassName?: string }`.

- [ ] **Step 1: Write the probe** `web/scripts/probes/kinetic-type.mjs`

It must:
1. Sign in with `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD`, get the admin token through the console's own sign-in form, and read the API base from `API_BASE_URL` (default `http://127.0.0.1:8000`). Copy the sign-in and API helpers from `scripts/probes/support-network.mjs`.
2. Create a **published** builder page `kinetic-probe-<timestamp>` through `POST /api/v1/admin/pages`. It holds two hero sections:
   - The first is `centered`, with heading "We keep networks running", `kinetic: "rotate"` and `kinetic_words: "servers\nstorage and security"`.
   - The second is `centered`, with heading "Support that answers fast", `kinetic: "highlight"` and `kinetic_words: "answers"`.

   Then, for the `type` and `decode` checks, PATCH the first hero's `kinetic` between runs.
3. Use a context with `addInitScript(() => localStorage.setItem("tw_kinetic_force", "1"))`.

Then check, printing `ok`/`FAIL` lines in the house style (`ok   …` / `FAIL …`):
- **Server HTML:** `fetch(page)` text contains "We keep networks running" in an `h1`. Fetch it as plain HTTP without a browser and regex `/<h1[^>]*>[\s\S]*?We keep networks[\s\S]*?<\/h1>/`.
- **Rotate:**
  - Within 8s some `[data-k-alt][data-cur]` reads "servers".
  - The `h1` bounding box width/height sampled ten times over 3s varies by ≤1px.
  - Clicking `button[aria-label^="Pause"]` stops `data-cur` changing for 3s.
  - After resuming, it ends on the original word with `data-kinetic-done` set, within 15s.
  - The heading's accessible name (`page.getByRole("heading", { level: 1 })`) is exactly "We keep networks running".
- **Highlight:** on scroll into view, `.k-mark path` computed `stroke-dashoffset` is between 0.05 and 0.95 at some sample within 1.2s, and `0px`/`0` after 2s.
- **Type:** after the PATCH and reload, within 1.2s some `[data-k-char]:not([data-on])` exist, and by 3s none do, with `data-kinetic-done` set. The box is stable as above.
- **Decode:** after the PATCH, within 1s some `[data-k-char][data-s]` exist; by 3s none do and `data-kinetic-done` is set.
- **Reduced motion:** a new context with `reducedMotion: "reduce"` has no `[data-kinetic-run]` ever, the text is fully visible (every `[data-k-char]` computed opacity is 1), and there is no Pause button.
- **Failsafe:** a new context that aborts requests whose URL contains `kinetic-text` (`page.route("**/*kinetic-text*", r => r.abort())`). Without that chunk the island never arms; every char's opacity reaches 1 by 4s. If the chunk name doesn't contain `kinetic-text` in dev, use `page.addInitScript` to make `IntersectionObserver` throw. Record which method you used in a comment.
- **Overflow:** at a 320px viewport, `document.documentElement.scrollWidth <= 320`.
- **Console:** no `console.error` or `pageerror`.

Finally, delete the page via `DELETE /api/v1/admin/pages/{id}`, and report `deleted 1 of 1`.

- [ ] **Step 2: Run the probe to verify it fails**

Run (from `web/`, dev server up, credentials in env): `node scripts/probes/kinetic-type.mjs`
Expected: FAIL on the rotate, highlight, type and decode checks, because no `[data-k-alt]` exists.

- [ ] **Step 3: Implement `kinetic-text.tsx`**

```tsx
"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useMotionOk } from "@/lib/hooks/use-carousel";
import { findMark, splitLast, type KineticEffect } from "@/lib/kinetic";

/**
 * A hero heading that moves (0.171.0, docs/motion.md "Kinetic headings").
 *
 * The server renders the finished words: a `sr-only` copy that is the
 * heading's text for a screen reader (and its accessible name, through the
 * heading's `aria-labelledby`, when there is a Pause button inside it), and
 * an `aria-hidden` copy split into words and letters that the effect plays
 * on. Every box is its final size from the first frame — a letter is hidden
 * by opacity, a scrambled glyph is drawn over a transparent final one, the
 * rotating slot is as wide as its widest word — so nothing shifts.
 *
 * The hidden start state is CSS inside `prefers-reduced-motion:
 * no-preference` *and* `scripting: enabled` (globals.css, "Kinetic
 * headings"), so no-JS and reduced-motion visitors see the heading at once.
 * If the island never arms — a failed chunk, a hydration error — a 3s
 * failsafe animation reveals it anyway. An automated browser gets the final
 * state unless `tw_kinetic_force` is "1" (the tours' rule), so the audits
 * grade finished text.
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*";
const TYPE_STEP = 38;
const TYPE_CAP = 1600;
const DECODE_EACH = 600;
const DECODE_STAGGER = 30;
const ROTATE_DWELL = 2400;

function automated(): boolean {
  try {
    return navigator.webdriver === true && localStorage.getItem("tw_kinetic_force") !== "1";
  } catch {
    return navigator.webdriver === true;
  }
}

export function KineticText({ text, effect, words, id, lastWordClassName }: {
  text: string;
  effect: KineticEffect;
  words: string[];
  /** The `sr-only` span's id, which the heading names itself by when rotating. */
  id: string;
  lastWordClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionOk = useMotionOk();
  const alts = effect === "rotate" ? [splitLast(text).last, ...words] : [];
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  // Arm, wait for the heading to be half in view, play once.
  useEffect(() => {
    const el = ref.current;
    if (!el || effect === "none") return;
    el.dataset.kineticArmed = "";
    if (!motionOk) return; // `useMotionOk` reads false until mounted; it re-runs when it settles.
    if (automated()) { el.dataset.kineticDone = ""; return; }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    const finish = () => { if (!cancelled) { el.dataset.kineticDone = ""; delete el.dataset.kineticRun; } };

    const start = () => {
      el.dataset.kineticRun = "";
      const chars = Array.from(el.querySelectorAll<HTMLElement>("[data-k-char]"));
      if (effect === "type") {
        const step = Math.min(TYPE_STEP, TYPE_CAP / Math.max(chars.length, 1));
        chars.forEach((c, i) => timers.push(setTimeout(() => {
          chars[i - 1]?.removeAttribute("data-caret");
          c.dataset.on = "";
          c.dataset.caret = "";
          if (i === chars.length - 1) timers.push(setTimeout(() => { c.removeAttribute("data-caret"); finish(); }, 1200));
        }, i * step)));
      } else if (effect === "decode") {
        const t0 = performance.now();
        const tick = (now: number) => {
          if (cancelled) return;
          let left = 0;
          chars.forEach((c, i) => {
            const at = now - t0 - i * DECODE_STAGGER;
            if (at < 0) { left++; return; }
            if (c.textContent === " ") { c.dataset.on = ""; return; }
            if (at < DECODE_EACH) {
              left++;
              c.dataset.on = "";
              c.dataset.s = "";
              c.dataset.g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            } else if (c.dataset.s !== undefined) {
              c.removeAttribute("data-s");
              c.removeAttribute("data-g");
            }
          });
          if (left > 0 && !document.hidden) raf = requestAnimationFrame(tick);
          else if (left > 0) raf = requestAnimationFrame(tick);
          else finish();
        };
        raf = requestAnimationFrame(tick);
      } else if (effect === "highlight") {
        timers.push(setTimeout(finish, 1100));
      } else if (effect === "rotate") {
        setRunning(true);
      }
    };

    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { io.disconnect(); start(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [effect, motionOk]);

  // Rotating words: one full cycle, paused by the button, hover, focus or a hidden tab.
  useEffect(() => {
    if (!running || done || !playing) return;
    const el = ref.current;
    let paused = false;
    const hold = () => { paused = true; };
    const go = () => { paused = false; };
    el?.addEventListener("pointerenter", hold);
    el?.addEventListener("pointerleave", go);
    const t = setInterval(() => {
      if (paused || document.hidden) return;
      setCur((c) => {
        const next = (c + 1) % alts.length;
        if (next === 0) { setDone(true); setRunning(false); el && (el.dataset.kineticDone = "", delete el.dataset.kineticRun); }
        return next;
      });
    }, ROTATE_DWELL);
    return () => { clearInterval(t); el?.removeEventListener("pointerenter", hold); el?.removeEventListener("pointerleave", go); };
  }, [running, done, playing, alts.length]);

  const wordsOf = (s: string, lastClass?: string) => {
    const parts = s.split(/(\s+)/);
    const lastIdx = parts.length - 1 - [...parts].reverse().findIndex((p) => p.trim() !== "");
    return parts.map((p, i) => p.trim() === "" ? <Fragment key={i}>{p}</Fragment> : (
      <span key={i} className={cn("whitespace-nowrap", i === lastIdx && lastClass)}>
        {Array.from(p).map((ch, j) => <span key={j} data-k-char>{ch}</span>)}
      </span>
    ));
  };

  let body: React.ReactNode;
  if (effect === "type" || effect === "decode") {
    body = wordsOf(text, lastWordClassName);
  } else if (effect === "highlight") {
    const m = findMark(text, words[0]);
    const isLast = m.after.trim() === "";
    body = (
      <>
        {m.before}
        <span className={cn("k-markword", isLast && lastWordClassName)}>
          {m.mark}
          <svg className="k-mark" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden focusable="false">
            <path d="M3 8 C 50 3, 120 3, 197 7" pathLength={1} />
          </svg>
        </span>
        {m.after}
      </>
    );
  } else if (effect === "rotate") {
    const { head } = splitLast(text);
    body = (
      <>
        {head && `${head} `}
        <span className={cn("k-slot", lastWordClassName)}>
          {alts.map((a, i) => <span key={i} data-k-alt data-cur={i === cur ? "" : undefined}>{a}</span>)}
        </span>
      </>
    );
  } else {
    body = text;
  }

  return (
    <span ref={ref} className="kinetic" data-kinetic={effect}>
      <span id={id} className="sr-only">{text}</span>
      <span aria-hidden="true">{body}</span>
      {effect === "rotate" && (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause the moving words" : "Play the moving words"}
          aria-pressed={!playing}
          className={cn(
            "k-pause ml-2 inline-grid size-7 place-items-center rounded-full border border-line-strong bg-card align-middle text-ink",
            !running && "invisible",
          )}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5z" /></svg>
          )}
        </button>
      )}
    </span>
  );
}
```

Two cleanups before running the probe:
- Replace the comma-expression in the rotate interval with plain statements (`if (el) { el.dataset.kineticDone = ""; delete el.dataset.kineticRun; }`).
- Drop the duplicated `document.hidden` branch in decode. The intent is to keep ticking while hidden, but `requestAnimationFrame` does not fire in a hidden tab, so the scramble resumes when the tab returns.

Lint must pass:
- no `setState` in an effect body except inside callbacks (`setRunning` sits inside the IO callback, which is allowed);
- no ref reads during render.

- [ ] **Step 4: `HeroTitle`**

Replace the export in `lib/hero-heading.tsx`:

```tsx
import { getSiteSettings } from "@/lib/settings";
import { kineticFor } from "@/lib/kinetic";
import { KineticText } from "@/components/ui/kinetic-text";

/**
 * A homepage hero's heading, at this request's level, playing the homepage
 * hero's effect (0.171.0): `hero_kinetic` (or Motion → Hero heading under
 * `default`) with `hero_kinetic_words`. `text` is the heading as a string for
 * a hero whose children split it up (the classic hero colours its last
 * word, which `lastWordClassName` keeps); a string child is used as-is.
 */
export async function HeroTitle({ className, children, text, lastWordClassName }: {
  className?: string;
  children: ReactNode;
  text?: string;
  lastWordClassName?: string;
}) {
  const Tag = store().level;
  const words = text ?? (typeof children === "string" ? children : null);
  if (words) {
    const s = await getSiteSettings();
    const k = kineticFor(s.motion_headline, s.hero_kinetic, s.hero_kinetic_words);
    if (k.effect !== "none") {
      const id = "k-hero-title";
      return (
        <Tag className={className} aria-labelledby={k.effect === "rotate" ? id : undefined}>
          <KineticText text={words} effect={k.effect} words={k.words} id={id} lastWordClassName={lastWordClassName} />
        </Tag>
      );
    }
  }
  return <Tag className={className}>{children}</Tag>;
}
```

Notes:
- `"server-only"` stays at the top. Importing a client component into a server module is fine.
- An async `HeroTitle` used inside sync server components is fine in RSC.
- If tsc complains that an async component is used as JSX in a client file, check that every importer is a server component. They are: the themes' `Home` templates and `components/home/hero.tsx`. `grep -l '"use client"'` across them must find nothing.
- `components/home/hero.tsx`: add `text={heading} lastWordClassName="text-brand-ink"` to its `HeroTitle`.

- [ ] **Step 5: `HeroSection`**

Make `HeroSection` `async`. At the top, add:

```tsx
  const s = await getSiteSettings();
  const k = kineticFor(s.motion_headline, data.kinetic, data.kinetic_words);
  const titleId = `k-${sectionId}`;
  const title = k.effect === "none" ? data.heading
    : <KineticText text={data.heading} effect={k.effect} words={k.words} id={titleId} />;
  const labelled = k.effect === "rotate" ? titleId : undefined;
```

Then replace `{data.heading}` in all three layouts with `{title}`, and add `aria-labelledby={labelled}` to each `<Heading>`.

`HeroSection` needs a stable id. Find its caller in `page-sections.tsx` (`grep -n "HeroSection" components/page-sections/page-sections.tsx`) and pass `sectionId={section.id}`. Add `sectionId: string` to the props. Builder section ids are UUIDs, so each hero is distinct (Review Focus 4).

- [ ] **Step 6: CSS** — append to `globals.css` after the headline block

```css
/*
 * Kinetic headings (0.171.0, docs/motion.md) — `KineticText`.
 * Final state is the default: every rule that hides anything is inside
 * no-preference *and* scripting, and an unarmed island (no JS ran) is
 * revealed by a 3s failsafe. Letters keep their boxes; the decode glyph is
 * drawn over a transparent final one; the rotating slot holds every word in
 * one grid cell so it is as wide as the widest.
 */
.kinetic [data-k-char] { position: relative; }
.k-slot { display: inline-grid; max-width: 100%; justify-items: start; vertical-align: baseline; }
.k-slot > [data-k-alt] { grid-area: 1 / 1; }
.k-slot > [data-k-alt]:not([data-cur]) { visibility: hidden; }
.k-markword { position: relative; display: inline-block; white-space: nowrap; }
.k-mark { position: absolute; left: -2%; width: 104%; bottom: -.14em; height: .34em; overflow: visible; pointer-events: none; }
.k-mark path { fill: none; stroke: var(--color-brand-600); stroke-opacity: .55; stroke-width: 3; stroke-linecap: round; vector-effect: non-scaling-stroke; stroke-dasharray: 1; stroke-dashoffset: 0; }

@media (prefers-reduced-motion: no-preference) and (scripting: enabled) {
  .kinetic:is([data-kinetic="type"], [data-kinetic="decode"]):not([data-kinetic-done]) [data-k-char]:not([data-on]) { opacity: 0; }
  .kinetic:is([data-kinetic="type"], [data-kinetic="decode"]):not([data-kinetic-done]):not([data-kinetic-armed]) [data-k-char]:not([data-on]) { animation: k-failsafe 1ms 3s forwards; }
  .kinetic[data-kinetic="highlight"]:not([data-kinetic-done]) .k-mark path { stroke-dashoffset: 1; }
  .kinetic[data-kinetic="highlight"]:not([data-kinetic-done]):not([data-kinetic-armed]) .k-mark path { animation: k-failsafe-draw 1ms 3s forwards; }
  .kinetic[data-kinetic="highlight"][data-kinetic-run] .k-mark path { animation: k-draw 700ms 250ms var(--ease-brand) forwards; }
  .kinetic [data-k-char][data-s] { -webkit-text-fill-color: transparent; }
  .kinetic [data-k-char][data-s]::after { content: attr(data-g); position: absolute; left: 0; top: 0; -webkit-text-fill-color: currentColor; }
  .kinetic [data-k-char][data-caret]::after { content: ""; position: absolute; right: -.06em; top: .12em; bottom: .12em; width: .06em; background: currentColor; animation: k-blink 1s steps(1) infinite; }
  .kinetic[data-kinetic-run] [data-k-alt][data-cur] { animation: k-rot-in 420ms var(--ease-brand); }
  @keyframes k-failsafe { to { opacity: 1; } }
  @keyframes k-failsafe-draw { to { stroke-dashoffset: 0; } }
  @keyframes k-draw { to { stroke-dashoffset: 0; } }
  @keyframes k-blink { 50% { opacity: 0; } }
  @keyframes k-rot-in { from { opacity: 0; translate: 0 .4em; } }
}
```

- [ ] **Step 7: Run the probe, the check, tsc and lint**

Run: `node scripts/probes/kinetic-type.mjs; npx tsc --noEmit; npm run lint`
Expected: every probe line `ok`; tsc and lint clean.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/ui/kinetic-text.tsx web/src/lib/hero-heading.tsx web/src/components/home/hero.tsx web/src/components/page-sections/hero-section.tsx web/src/components/page-sections/page-sections.tsx web/src/app/globals.css web/scripts/probes/kinetic-type.mjs
git commit -m "0.171.0: kinetic hero headings — rotate, type, decode, highlight

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Console controls for the effect

**Files:**
- Modify: `web/src/app/admin/(app)/settings/motion-picker.tsx` (two new `Choices`: state, the effect map, the `current`/`setters` maps)
- Modify: `web/src/app/admin/(app)/settings/settings-copy.ts`:
  - the motion screen's list at line 1151
  - the homepage list at line 1173
  - copy entries near lines 600 and 851
- Modify: `web/src/app/admin/(app)/pages/builder/section-editors.tsx` (hero case, line 340)

**Interfaces:**
- Consumes: `KINETIC`, `KINETIC_SITE` and `MICRO` from Task 3.

- [ ] **Step 1: The motion picker**
  - Add `const [headline, setHeadline] = useState(stored.motion_headline || KINETIC_SITE[0].id);` and `const [micro, setMicro] = useState(stored.motion_micro || MICRO[0].id);`.
  - Add `setting__motion_headline: headline, setting__motion_micro: micro` to `chosen`.
  - Add `motion_headline`/`motion_micro` to `current` and `setters`.
  - Import `KINETIC_SITE, MICRO`.
  - After the Cards `Choices`, add:

```tsx
      <Choices
        name="setting__motion_headline" legend="Hero heading" value={headline} onChange={setHeadline} choices={KINETIC_SITE}
        intro="How a hero's heading arrives when the page opens. A hero can choose its own — including rotating words — in Homepage settings or the page builder. Still for visitors who ask for less motion."
        preview={(c) => (
          <span className="flex h-14 items-center justify-center text-15 font-semibold text-ink" aria-hidden data-demo={`kinetic-${c.id}`}>
            Keep it <span className="ml-1 text-brand-ink">running</span>
          </span>
        )}
      />

      <Choices
        name="setting__motion_micro" legend="Small interactions" value={micro} onChange={setMicro} choices={MICRO}
        intro="Links, arrows, switches, tick boxes, copy buttons and card icons answering the pointer with a small movement, on the site and the customer portal. Hover a tile."
        preview={(c) => (
          <span className="flex h-14 items-center justify-center" data-motion-micro={c.id}>
            <span className="btn btn-soft inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-13">Learn more <IconArrowRight className="size-4" /></span>
          </span>
        )}
      />
```

`IconArrowRight` comes from `@/components/icons-ui`. Use whatever button class names `Button` emits so the Task 6 rule matches; `<Button type="button" size="sm" variant="secondary" tabIndex={-1}>` is simplest, as the Buttons tile does.

`data-demo="kinetic-…"` tiles need demo keyframes. Add, beside the `demo-*` keyframes at globals.css line ~1547 and inside the same guard:

```css
.motion-tile:hover [data-demo="kinetic-type"] { animation: demo-k-type 1.2s steps(14) both; clip-path: inset(0 0 0 0); }
.motion-tile:hover [data-demo="kinetic-decode"] { animation: demo-k-decode .8s steps(6) both; }
.motion-tile:hover [data-demo="kinetic-highlight"] span { text-decoration: underline 3px color-mix(in oklab, var(--color-brand-600) 55%, transparent); text-underline-offset: 6px; }
@keyframes demo-k-type { from { clip-path: inset(0 100% 0 0); } }
@keyframes demo-k-decode { 0%, 60% { filter: blur(2px); opacity: .5; } }
```

Check that the existing demo rules' selector shape (`.motion-tile:hover [data-demo=…]`) matches, and copy it.

- [ ] **Step 2: settings-copy**
  - Add `"motion_headline", "motion_micro"` to the motion list after `"motion_cards"`.
  - Add `motion_headline: { label: "Hero heading" }, motion_micro: { label: "Small interactions" },` to the copy map.
  - Add `"hero_kinetic", "hero_kinetic_words"` to the homepage list after `"hero_lede"`.
  - Add copy:

```ts
  hero_kinetic: { label: "Hero heading effect", hint: "How the headline above arrives. As the Motion settings say follows Site → Settings → Motion → Hero heading." },
  hero_kinetic_words: { label: "Effect words", hint: "Rotating words: the words the last word of the headline turns into, one per line, up to six. Highlight: the word to underline (blank marks the last word)." },
```

Confirm that the motion picker draws only the keys it knows and that the generic renderer skips motion keys. The picker is drawn "on the motion_reveal row". If the generic renderer would also draw `motion_headline` and `motion_micro` as plain inputs, add them to whatever skip list holds `motion_buttons` (`grep -n "motion_buttons" app/admin/\(app\)/settings/*.tsx`).

- [ ] **Step 3: The builder hero editor.** After the `Lede` `Text`, add:

```tsx
          <Choice path={["kinetic"]} label="Heading effect" fallback="default" options={[
            { value: "default", label: "As the Motion settings say" },
            ...KINETIC.map((c) => ({ value: c.id, label: c.label })),
          ]} />
          {(content.kinetic === "rotate" || content.kinetic === "highlight") && (
            <Text path={["kinetic_words"]} label={content.kinetic === "rotate" ? "Words the last word turns into" : "Word to underline"} multiline={content.kinetic === "rotate"}
              hint={content.kinetic === "rotate" ? "One per line, up to six. The heading rests on its own last word after one round." : "Blank underlines the last word."} />
          )}
```

Import `KINETIC` from `@/lib/motion-choices`. Check `Choice`'s signature in this file. If `fallback` is stored when unchanged, make sure `default` is not posted: the API drops it in Task 2 anyway.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit; npm run lint`. Then open `/admin/settings?tab=motion`, `/admin/settings?tab=homepage` and a builder page's hero card. Each shows the controls, saving persists, and the homepage hero plays the effect.
Expected: clean, and visibly working.

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/admin/(app)/settings/motion-picker.tsx" "web/src/app/admin/(app)/settings/settings-copy.ts" "web/src/app/admin/(app)/pages/builder/section-editors.tsx" web/src/app/globals.css
git commit -m "0.171.0: console controls for the heading effect and small interactions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Micro-interactions — site and portal

**Files:**
- Modify: `web/src/components/icons-ui.tsx` (`IconArrowRight` gains `data-icon="arrow-right"`)
- Modify: `web/src/components/ui/prose.tsx` (root gains `data-prose`)
- Modify: `web/src/components/ui/copy-link.tsx`, `web/src/components/admin/copy-text.tsx` (the done state wrapped in `<span data-copied>`)
- Modify: `web/src/components/ui/switch.tsx` (the track gains `data-switch-track`; it already has `data-switch`, so reuse that)
- Modify: `web/src/app/globals.css` (block "Small interactions")
- Create: `web/scripts/probes/micro-interactions.mjs` (the site half; Task 7 adds the console half)

**Interfaces:**
- Consumes: `data-motion-micro` from Task 3's `motionAttrs`.
- Produces: the attributes `data-icon="arrow-right"`, `data-prose` and `data-copied`; the console half (Task 7) reuses the same CSS selectors under `[data-console]`.

- [ ] **Step 1: Write the probe (site half)**

`micro-interactions.mjs`, no sign-in needed for this half:
- **`/` at 1280, fine pointer:** find the first `.btn` containing `svg[data-icon="arrow-right"]`. Hover it and sample `getComputedStyle(svg).translate` at 60ms. It must be a non-`none`, non-final value or a final `3px`: record both readings and pass if the final is `3px 0px`, or `3px`.
- **A `/blog/<first post>` page:** take the first post link from `/blog`. Find `[data-prose] a`. Before hover `textDecorationThickness` is `1px`; after hover and 250ms it is `2px`.
- **Reduced motion:** on the same button, `translate` stays `none` on hover.
- **Copy:** on the post page, click `button[aria-label="Copy link"]`, granting clipboard permissions on the context. Within 300ms a `[data-copied]` element exists.

Print `ok`/`FAIL` lines.

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/probes/micro-interactions.mjs`
Expected: FAIL on the arrow, underline and copy checks.

- [ ] **Step 3: Implement**
  - In `icons-ui.tsx`, `IconArrowRight` becomes `<svg {...base} strokeWidth={2} data-icon="arrow-right" {...p}>`.
  - In `prose.tsx`, add `data-prose=""` to the root `div`.
  - In `copy-link.tsx`, change the done glyph to `<span data-copied className="inline-grid"><IconCheck className="size-4" aria-hidden /></span>`.
  - In `copy-text.tsx`, change the label to `{state === "done" ? <span data-copied>Copied</span> : …}`.
  - Append to `globals.css`:

```css
/*
 * Small interactions (0.171.0, docs/motion.md) — `motion_micro`, stamped as
 * `data-motion-micro` on the marketing and portal wrappers; the console's
 * half is keyed on [data-console] and dropped under Subtle. Movement only
 * inside the reduced-motion guard. The arrow's 3px nudge is horizontal but
 * stays inside its own button's padding, so the document never widens.
 */
[data-motion-micro="lively"] [data-prose] a { transition: text-decoration-thickness var(--duration-fast) var(--ease-brand), text-underline-offset var(--duration-fast) var(--ease-brand); text-decoration-thickness: 1px; text-underline-offset: .22em; }
[data-motion-micro="lively"] [data-prose] a:is(:hover, :focus-visible) { text-decoration-thickness: 2px; text-underline-offset: .14em; }

@media (prefers-reduced-motion: no-preference) {
  :is([data-motion-micro="lively"], [data-console]) :is(.btn, a) svg[data-icon="arrow-right"] { transition: translate var(--duration-fast) var(--ease-brand); }
  :is([data-motion-micro="lively"], [data-console]) :is(.btn, a):is(:hover, :focus-visible) svg[data-icon="arrow-right"] { translate: 3px 0; }

  :is([data-motion-micro="lively"], [data-console]) [data-switch]::after { transition-timing-function: cubic-bezier(.34, 1.56, .64, 1); }

  :is([data-motion-micro="lively"], [data-console]) input:is([type="checkbox"]:not([role="switch"]), [type="radio"]):checked { animation: micro-pop 160ms var(--ease-brand); }

  :is([data-motion-micro="lively"], [data-console]) [data-copied] { transition: scale var(--duration-base) var(--ease-brand), opacity var(--duration-base) var(--ease-brand); }
  @starting-style {
    :is([data-motion-micro="lively"], [data-console]) [data-copied] { scale: .8; opacity: 0; }
  }

  @media (hover: hover) and (pointer: fine) {
    [data-motion-micro="lively"] [data-tile]:hover [data-tile-icon] { scale: 1.08; }
    [data-motion-micro="lively"] [data-tile] [data-tile-icon] { transition: scale var(--duration-base) var(--ease-brand); }
  }

  :is([data-motion-micro="lively"], [data-console]) [aria-invalid="true"] { animation: field-refused 600ms var(--ease-brand) 1; }

  [data-console-motion="subtle"] [data-console] svg[data-icon="arrow-right"] { translate: none !important; }
  html[data-console-motion="subtle"] [data-console] [data-switch]::after { transition-timing-function: var(--ease-brand); }
  html[data-console-motion="subtle"] [data-console] input:checked { animation: none; }

  @keyframes micro-pop { from { scale: .85; } }
  @keyframes field-refused { from { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-err) 35%, transparent); } to { box-shadow: 0 0 0 8px transparent; } }
}
```

Two cautions:
- `[aria-invalid="true"]` already carries `ring-3` (a box-shadow) through Tailwind on `.field`. The keyframe's box-shadow overrides it during the animation and then hands back. If the probe shows the ring vanishing permanently, instead put the animation on `outline` (`outline: 0 solid` → `outline-offset`).
- Replace the `!important` Subtle line with a selector of higher specificity, `html[data-console-motion="subtle"] [data-console] …`, in the same form as the next two lines.

- [ ] **Step 4: Verify**

Run: `node scripts/probes/micro-interactions.mjs; npx tsc --noEmit; npm run lint`
Expected: every line `ok`.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/icons-ui.tsx web/src/components/ui/prose.tsx web/src/components/ui/copy-link.tsx web/src/components/admin/copy-text.tsx web/src/app/globals.css web/scripts/probes/micro-interactions.mjs
git commit -m "0.171.0: small interactions on the site and the portal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Micro-interactions — console

**Files:**
- Modify: `web/src/components/ui/toast.tsx` (the `toast` callback dispatches `tw:saved` for `ok`)
- Modify: `web/src/components/admin/form-actions.tsx` (the "Saved" swap)
- Modify: `web/src/app/admin/(app)/admin-nav.tsx` (the badge gets `data-bumped` when its count rises)
- Modify: `web/src/app/globals.css` (console block: saved swap, badge pop)
- Modify: `web/scripts/probes/micro-interactions.mjs` (console half)

**Interfaces:**
- Produces: the `window` event `tw:saved` (`CustomEvent<{ title: string }>`), fired whenever an `ok` toast is raised.

- [ ] **Step 1: Add the console half to the probe.** Sign in with the env credentials, as `form-guard.mjs` does.
  - Create a blog post draft titled `micro-probe-<ts>` through `/admin/blog/new`, pressing Save. Within 15s, the submit button of `[data-form-actions]` contains `[data-saved]`, and 2.5s later it does not.
  - Delete the post through its Delete button, the house delete flow `form-draft.mjs` uses. Otherwise call `DELETE /api/v1/admin/blog-posts/{id}` with the token.
  - Set `localStorage.tw_console_motion = "subtle"`, reload an edit form, check that `[data-switch]::after` `transition-timing-function` is not the overshoot curve, then remove the key.

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/probes/micro-interactions.mjs`
Expected: the console checks FAIL.

- [ ] **Step 3: Implement**

`toast.tsx`, inside `toast` after `setToasts`:

```ts
    // The console's Save button turns into "Saved" when its form's save
    // raised this (form-actions.tsx) — an event rather than a context, so the
    // bar needs nothing threaded to it.
    if (tone === "ok" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tw:saved", { detail: { title: input.title } }));
    }
```

Check the `ToastInput` field name for the heading (`title` or `message`).

`form-actions.tsx`:
- Add `const lastSubmit = useRef(0);` and set `lastSubmit.current = Date.now()` inside the `saved` submit handler. Rename it `submitted` and keep the dirty reset.
- Add an effect:

```tsx
  useEffect(() => {
    const onSaved = () => {
      if (Date.now() - lastSubmit.current > 15000) return;
      const button = ref.current?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!button || button.querySelector("[data-saved]")) return;
      const label = document.createElement("span");
      label.dataset.saved = "";
      label.setAttribute("aria-hidden", "true");
      label.textContent = "Saved ✓";
      button.dataset.savedSwap = "";
      button.append(label);
      setTimeout(() => { label.remove(); delete button.dataset.savedSwap; }, 1600);
    };
    window.addEventListener("tw:saved", onSaved);
    return () => window.removeEventListener("tw:saved", onSaved);
  }, []);
```

DOM-only, so React never re-renders the button. The width is held by CSS that overlays the label: the button becomes a grid, the label overlays its children in the same cell, and the original children turn `visibility: hidden` while `[data-saved-swap]` is set.

`globals.css`, a console block:

```css
/* The console's "Saved ✓" (form-actions.tsx) and the new-items badge pop (admin-nav.tsx), 0.171.0. */
[data-console] button[data-saved-swap] { display: inline-grid; }
[data-console] button[data-saved-swap] > * { grid-area: 1 / 1; }
[data-console] button[data-saved-swap] > :not([data-saved]) { visibility: hidden; }
[data-console] [data-saved] { justify-self: center; }
@media (prefers-reduced-motion: no-preference) {
  [data-console] [data-saved] { animation: saved-in 200ms var(--ease-brand); }
  [data-console] [data-bumped] { animation: badge-bump 300ms var(--ease-brand); }
  html[data-console-motion="subtle"] [data-console] :is([data-saved], [data-bumped]) { animation: none; }
  @keyframes saved-in { from { opacity: 0; scale: .9; } }
  @keyframes badge-bump { 50% { scale: 1.25; } }
}
```

If `Button` renders its label as a bare text node, `> *` does not reach it. In that case wrap the swap differently: keep `button[data-saved-swap]` as `position: relative`, put the label `position: absolute; inset: 0; display: grid; place-items: center; background: inherit`, and skip the visibility rule.

`admin-nav.tsx`, the badge: extract it into a tiny client component in the same file:

```tsx
function NewBadge({ count, active }: { count: number; active: boolean }) {
  const prev = useRef(count);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (count > prev.current && ref.current) {
      const el = ref.current;
      el.dataset.bumped = "";
      const t = setTimeout(() => { delete el.dataset.bumped; }, 400);
      prev.current = count;
      return () => clearTimeout(t);
    }
    prev.current = count;
  }, [count]);
  return (
    <span ref={ref} className={cn("rail-badge ml-auto rounded-full px-1.5 py-px text-10-5 font-semibold tabular-nums", active ? "bg-card text-brand-ink" : "bg-brand-600 text-brand-on")} aria-label={`${count} new`}>
      {count}
    </span>
  );
}
```

Use it in place of the inline badge span at line ~157. The file is already `"use client"`; import `useEffect` and `useRef` if they are missing.

- [ ] **Step 4: Verify**

Run: `node scripts/probes/micro-interactions.mjs; node scripts/probes/form-guard.mjs; npx tsc --noEmit; npm run lint`
Expected: all `ok`. form-guard is unchanged, because the Save keyboard path still works.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui/toast.tsx web/src/components/admin/form-actions.tsx "web/src/app/admin/(app)/admin-nav.tsx" web/src/app/globals.css web/scripts/probes/micro-interactions.mjs
git commit -m "0.171.0: console micro-interactions — Saved on the button, badge pop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The two 0.170.0 findings

**Files:**
- Modify: whatever overflows `/admin` at 768px (found in Step 1)
- Modify: `web/scripts/probes/ai-badge.mjs` (accept `finished`)

- [ ] **Step 1: Find the 768px overflow (systematic-debugging, Phase 1).** Write the throwaway `web/scripts/probes/_overflow-768.mjs` (gitignored by the underscore). It signs in with the env credentials, opens `/admin` at 768×900, waits for network idle, then lists every element whose `getBoundingClientRect().right > 768` that is not inside an `overflow-x: auto|hidden|clip` ancestor. For each it prints the tag, classes, its parents' classes and its `right`. It also measures text nodes with a `Range`, the "Today" lesson in CLAUDE.md. Run it.

  Expected: one named element, for example the header's account row with the AI badge (drawn from `sm`), or a dashboard panel.

- [ ] **Step 2: Fix the cause it names.** If it is the AI badge, it is drawn from `sm` (640) in a header that has no room at 768. Change `.ai-badge`'s visibility breakpoint to `lg` in `admin/(app)/layout.tsx`, and update `ai-badge.mjs`'s "not drawn" width check from 390 to 768, keeping 1280 for "drawn". If it is another element, apply the CLAUDE.md fix for its class of overflow (`min-w-0`, `w-0 min-w-full`, a wrapping rule) and note it in the commit message.

- [ ] **Step 3: The ai-badge probe.** In `web/scripts/probes/ai-badge.mjs`, find the "the sweep runs after load" check. Accept `state === "running" || state === "finished"`. It is asserting that an animation ran, and on a slow server it can finish before the sample. Keep it failing when no animation exists at all.

- [ ] **Step 4: Verify**

Run: `node scripts/probes/dashboard-view.mjs; node scripts/probes/ai-badge.mjs` (one at a time, never beside an audit).
Expected: no FAIL lines.

- [ ] **Step 5: Commit**

```bash
git add -A web/src "web/scripts/probes/ai-badge.mjs"
git commit -m "fix: <the element> overflowed the dashboard by 95px at 768px; ai-badge probe accepts a finished sweep

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Run `git status` first and stage only the intended files. `docs/xampp-test-install.md` is untracked and is the user's.

---

### Task 9: Docs, version, help and audits

**Files:**
- Modify: `docs/motion.md` (two sections), `docs/console-portal.md`, `CLAUDE.md` (module lines), `API.md` (settings and builder hero fields)
- Modify: the manual chapter that documents Settings → Motion (`grep -ln "Motion" manual/*.md`), then `npm run help`
- Modify: `VERSION.md`, `web/src/lib/version.ts` → 0.171.0

- [ ] **Step 1: Docs**

`docs/motion.md`, a "Kinetic headings" section:
- the effects;
- the `HeroTitle` and `HeroSection` choke points;
- the start state behind `scripting: enabled` with the 3s failsafe;
- the `tw_kinetic_force` audit rule;
- rotate's Pause button and its `aria-labelledby`;
- the words rule (6 × 40).

`docs/motion.md`, a "Small interactions" section:
- the default of Lively and why;
- each effect, with the two non-transform exceptions named.

`docs/console-portal.md`: Saved ✓ through `tw:saved`, and the badge bump.

CLAUDE.md:
- Motion module, one line: "Hero headings move (0.171.0, `docs/motion.md` "Kinetic headings"): `KineticText` behind `HeroTitle` (all themes, resolves `hero_kinetic` → `motion_headline` itself) and the builder hero; the server HTML is the finished heading, the hidden start state is CSS inside no-preference *and* `scripting: enabled` with a 3s failsafe for an island that never armed; automated browsers see the final state unless `tw_kinetic_force`; rotating words carry a Pause button and name the heading by `aria-labelledby`. Small interactions are `motion_micro` (Lively by default — the client's exception to the first-entry rule) on `[data-motion-micro]`, and the console's half on `[data-console]`, dropped under Subtle."
- The console and portal shell module, one line on Saved ✓ and the badge bump.

API.md:
- In the motion group paragraph, add `motion_headline` (shape-checked; `none`, `type`, `decode`, `highlight` drawn) and `motion_micro` (`lively` default, `none`).
- In the homepage group, add `hero_kinetic` (options, refused outside them) and `hero_kinetic_words` (≤ 6 lines of ≤ 40 characters, blank lines dropped).
- In the builder section, add the hero's `kinetic` (shape-checked, `default` not stored) and `kinetic_words` (≤ 300, the same line rule) under the hero row.

- [ ] **Step 2: The manual.** Add one paragraph per new setting to the Motion and Homepage parts of the settings chapter, and to the page-builder hero part. Then run `npm run help` (from `web/`) and `node scripts/build-help.mjs --check`.

- [ ] **Step 3: Version.** Set `web/src/lib/version.ts` to `0.171.0`. Add a VERSION.md entry in the existing format: a dated heading, then what changed for the client in plain words, then the migration note "run `php artisan db:seed --class=SettingsSeeder` on a checkout; the updater does it".

- [ ] **Step 4: The full gates, run serially**

```bash
cd api && php artisan test && composer analyse
cd ../web && npx tsc --noEmit && npm run lint && node --experimental-strip-types scripts/kinetic.check.mjs
node scripts/probes/kinetic-type.mjs
node scripts/probes/micro-interactions.mjs
MSYS_NO_PATHCONV=1 node scripts/audit.mjs / /about /sample-builder-page /admin /admin/settings /admin/blog/new /portal
MSYS_NO_PATHCONV=1 AUDIT_SCHEME=dark node scripts/audit.mjs / /about /admin /admin/settings /admin/blog/new /portal
MSYS_NO_PATHCONV=1 node scripts/audit.mjs /support-network /admin/support-centres /admin/users /admin/media /admin/products/new
MSYS_NO_PATHCONV=1 AUDIT_SCHEME=dark node scripts/audit.mjs /support-network /admin/support-centres /admin/users /admin/media /admin/products/new
MSYS_NO_PATHCONV=1 node scripts/mobile-audit.mjs / /admin /admin/settings /portal
```

Expected: tests and analyse green; every probe line `ok`; every audit exits 0. The dark audit of the 0.170.0 routes is the run owed from the last release. Look at the homepage hero by eye with `hero_kinetic` set to each effect in Classic, Terminal and Launch (`/theme-preview/<id>`) at 360, 768, 1280 and 1920, with screenshots in the scratchpad.

- [ ] **Step 5: Commit**

```bash
git add docs/motion.md docs/console-portal.md CLAUDE.md API.md manual web/src/content/help.json VERSION.md web/src/lib/version.ts
git commit -m "0.171.0: kinetic type and micro-interactions — docs, manual, version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
