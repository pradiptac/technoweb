# Semantic search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public site search and the website assistant find published content by meaning as well as by words, through OpenRouter embeddings, with the word search as the fallback whenever meaning is off or unavailable.

**Architecture:** Published records are split into passages of about 200–300 words and embedded through OpenRouter's `/api/v1/embeddings` with the existing key; vectors are stored in MySQL (`search_passages`) and packed into one file on the private disk that a search reads. At search time the phrase is embedded once (cached 30 days, daily cap, 1.5 s timeout), cosine similarity is computed in PHP, and the results are blended under the word hits in `/search` and added as fenced passages to `Chat\Retriever`.

**Tech Stack:** Laravel 13 / PHP 8.3 (Eloquent, queued jobs, scheduler, `Http::fake()`), MySQL 8, Next 16 App Router, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-17-semantic-search-design.md`

## Global Constraints

- Version **0.182.0** (`web/src/lib/version.ts` and `VERSION.md`, same commit as the docs).
- Off by default: `semantic_search_enabled = 0`. Off, nothing is indexed, nothing is sent, and both searches behave exactly as today.
- Every failure — no key, the cap, a timeout over **1.5 s**, a refusal, nothing embedded — falls back to the word search silently for the visitor, and a refusal writes `semantic_search_error` (cleared by a success).
- Only **published** text and visitors' search phrases are sent to OpenRouter, and only while the feature is on. Never prices, stock, dates, references, drafts, tickets, customers, orders or leads.
- No passage text, score or vector appears in any public response; `/search` result rows keep their shape `{title, excerpt, path, kicker?}`.
- An exact word hit keeps its position: word results first in today's order, meaning-only records after, by score, within `PER_GROUP = 5`.
- A phrase under **3** characters, or one that looks like a part number, skips meaning.
- Query vectors are cached **30 days**, keyed by `sha1(normalised phrase . '|' . model)`; a cache miss counts one against `semantic_search_daily_cap` (default **2000**).
- Default model `openai/text-embedding-3-small`, requested with `dimensions: 512` for `openai/*` models. Vectors are stored **unit-normalised**, so cosine is a dot product.
- Passages: split at headings, ~200–300 words, a section over **400** words cut at sentence ends, each ≤ **2,000** characters, prefixed with the record's title (and heading).
- Same machine rules as before: Windows, Git Bash for scripts, `api/` PHP files LF, `web/` files keep their stored line endings, `phpunit.xml` pins `technoweb_test`, never two `artisan test` runs at once, `composer analyse` must say "No errors", every relation carries its generic return type.

## Review Focus

1. **A record unpublished or deleted** must stop appearing in meaning results at once, without waiting for the nightly run. Pinned in Task 4 (`test_unpublishing_removes_the_passages`).
2. **A cached query vector from the previous model** must never be compared with passages of a new model. Pinned in Task 5 (`test_the_query_cache_is_per_model`).
3. **The feature on with nothing embedded yet** (just switched on) must give the word results, with no error. Pinned in Task 5 (`test_an_empty_index_matches_nothing`).
4. **A phrase that normalises to nothing** (`"???"`, `"  -- "`) must not call OpenRouter. Pinned in Task 5 (`test_a_phrase_of_punctuation_is_not_embedded`).
5. **An FAQ of a draft owner** must never be indexed (the word retriever has this bug today). Pinned in Task 3 (`test_a_draft_owners_faqs_are_not_indexed`).

---

## File map

**API (new)**
- `api/database/migrations/2026_10_23_100000_create_search_tables.php`
- `api/app/Models/SearchPassage.php`, `api/app/Models/SearchQueryVector.php`
- `api/app/Support/Search/SemanticSettings.php` — the settings group's one reader and write checks.
- `api/app/Support/Search/Vectors.php` — pack, unpack, normalise, dot.
- `api/app/Support/Search/Embeddings.php` — the OpenRouter embeddings call.
- `api/app/Support/Search/Indexable.php` — the one list of indexed kinds and the published query for each.
- `api/app/Support/Search/Document.php` — one record's indexable text as sections.
- `api/app/Support/Search/Passages.php` — sections into passages.
- `api/app/Support/Search/Indexer.php` — diff a record's passages, embed what is waiting, forget a record.
- `api/app/Support/Search/SearchFile.php` — the packed file and its rebuild.
- `api/app/Support/Search/Semantic.php` — `match()`, the one entry point at search time.
- `api/app/Jobs/IndexRecordPassages.php`, `api/app/Jobs/IndexSearch.php`
- `api/app/Console/Commands/IndexSearchCommand.php` (`technoware:index-search`)
- `api/app/Support/Upgrade/Steps/FirstSearchIndex.php`
- `api/app/Http/Controllers/Api/V1/Admin/SemanticSearchController.php`
- Tests: `api/tests/Feature/SemanticIndexTest.php`, `SemanticMatchTest.php`, `SemanticSearchBlendTest.php`, `SemanticSearchAdminTest.php`; `api/tests/Unit/SearchPassagesTest.php`, `VectorsTest.php`; trait `api/tests/Concerns/FakesEmbeddings.php`.

**API (modified)**
- `api/app/Support/Chat/Providers/OpenRouterProvider.php` — `attribution()` public.
- `api/app/Providers/AppServiceProvider.php` — save/delete listeners.
- `api/app/Http/Controllers/Api/V1/SearchController.php` — the blend.
- `api/app/Support/Chat/Retriever.php` — meaning passages.
- `api/app/Http/Controllers/Api/V1/Admin/SettingController.php` — write checks and the after-save hook.
- `api/database/seeders/SettingsSeeder.php`, `api/routes/console.php`, `api/routes/api/admin-admin.php`, `api/app/Support/Upgrade/UpgradeSteps.php`.

**Web**
- `web/src/app/admin/(app)/settings/settings-copy.ts` (field copy, order, the group on the API keys screen, `HIDDEN`).
- `web/src/app/admin/(app)/settings/semantic-search-panel.tsx` (new) and its mount in `settings-form.tsx`.
- `web/src/lib/admin/semantic-search.ts` (new), `web/src/lib/admin/index.ts`, `web/src/types/semantic-search.ts` (new).
- `web/mock-api.mjs`, `web/scripts/probes/semantic-search.mjs` (new).

**Docs**: `docs/semantic-search.md`, `CLAUDE.md`, `API.md`, `manual/32-semantic-search.md`, `manual/00-README.md`, `web/src/lib/help-routes.ts`, `web/src/content/help.json`, `VERSION.md`, `web/src/lib/version.ts`.

## Decisions taken while planning (rulings against the spec's letter)

- **FAQs are indexed inside their owner's passages, not as a kind of their own.** `Faq` has no status and attaches by morph to an owner; indexed alone, a draft owner's FAQs would be searchable (the word retriever's existing bug). The spec's intent — FAQs findable — holds, under the owner's published state.
- **The model setting is checked by shape only, plus "Test this model".** OpenRouter's `/api/v1/models` list does not carry embedding models (they are a separate endpoint), so the existence check the chat models get cannot apply; the spec already allows shape-only when the list cannot answer.
- **The floor ships at 0.35.** The spec says "measured on the seeded content during the build"; measuring needs a real key, which the build may not have. The setting is there to tune it; `docs/semantic-search.md` says how.

---

### Task 1: Tables, models and the settings group

**Files:**
- Create: `api/database/migrations/2026_10_23_100000_create_search_tables.php`, `api/app/Models/SearchPassage.php`, `api/app/Models/SearchQueryVector.php`, `api/app/Support/Search/SemanticSettings.php`
- Modify: `api/database/seeders/SettingsSeeder.php`, `api/app/Http/Controllers/Api/V1/Admin/SettingController.php` (the per-key refusal chain ~line 1296), `web/src/app/admin/(app)/settings/settings-copy.ts`
- Test: `api/tests/Feature/SemanticSearchAdminTest.php` (first tests)

**Interfaces:**
- Produces: `SemanticSettings::enabled(): bool`, `model(): string`, `dailyCap(): int`, `floor(): float`, `refusalFor(string $key, mixed $value): ?string`, `recordError(string $message): void`, `clearError(): void`, constants `GROUP = 'semantic_search'`, `DEFAULT_MODEL = 'openai/text-embedding-3-small'`, `DIMENSIONS = 512`.
- Produces: models `SearchPassage` (fillable `subject_type, subject_id, position, heading, text, hash, model, vector, embedded_at`; `embedded_at` datetime) and `SearchQueryVector` (primary key `hash`, string, not incrementing; fillable `hash, model, vector, last_used_at`).

- [ ] **Step 1: Write the failing test** — `api/tests/Feature/SemanticSearchAdminTest.php`

```php
<?php

namespace Tests\Feature;

use App\Models\SearchPassage;
use App\Support\Search\SemanticSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SemanticSearchAdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_settings_are_seeded_off_with_their_defaults(): void
    {
        $this->seed(SettingsSeeder::class);

        $this->assertFalse(SemanticSettings::enabled());
        $this->assertSame('openai/text-embedding-3-small', SemanticSettings::model());
        $this->assertSame(2000, SemanticSettings::dailyCap());
        $this->assertSame(0.35, SemanticSettings::floor());
    }

    public function test_the_write_checks(): void
    {
        $this->assertNull(SemanticSettings::refusalFor('semantic_search_model', 'qwen/qwen3-embedding-0.6b'));
        $this->assertNotNull(SemanticSettings::refusalFor('semantic_search_model', 'not a model'));
        $this->assertNull(SemanticSettings::refusalFor('semantic_search_daily_cap', '500'));
        $this->assertNotNull(SemanticSettings::refusalFor('semantic_search_daily_cap', '100001'));
        $this->assertNull(SemanticSettings::refusalFor('semantic_search_floor', '0.42'));
        $this->assertNotNull(SemanticSettings::refusalFor('semantic_search_floor', '1.5'));
    }

    public function test_a_passage_round_trips_its_binary_vector(): void
    {
        $bytes = pack('g*', 0.5, -0.25);
        $p = SearchPassage::create([
            'subject_type' => 'page', 'subject_id' => 1, 'position' => 0, 'heading' => null,
            'text' => 'Words', 'hash' => sha1('Words'), 'model' => 'm', 'vector' => $bytes, 'embedded_at' => now(),
        ]);

        $this->assertSame($bytes, $p->fresh()->vector);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd api; php artisan test --filter=SemanticSearchAdminTest`
Expected: FAIL — `Class "App\Support\Search\SemanticSettings" not found`.

- [ ] **Step 3: The migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Semantic search (0.182.0, docs/semantic-search.md): passages and cached query vectors. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('search_passages', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->unsignedSmallInteger('position');
            $table->string('heading', 160)->nullable();
            $table->text('text');
            $table->char('hash', 40);
            $table->string('model', 100)->nullable();
            $table->binary('vector')->nullable();
            $table->timestamp('embedded_at')->nullable();
            $table->timestamps();
            $table->unique(['subject_type', 'subject_id', 'position'], 'search_passages_subject_position');
            $table->index(['model', 'embedded_at']);
        });

        Schema::create('search_query_vectors', function (Blueprint $table) {
            $table->char('hash', 40)->primary();
            $table->string('model', 100);
            $table->binary('vector');
            $table->timestamp('last_used_at')->index();
        });

        // A 512-float vector is 2 KB; MySQL's BLOB holds 64 KB, so `binary()` (BLOB) is enough
        // for any model up to 16,000 dimensions. Nothing to widen.
    }

    public function down(): void
    {
        Schema::dropIfExists('search_query_vectors');
        Schema::dropIfExists('search_passages');
    }
};
```

- [ ] **Step 4: The models**

`api/app/Models/SearchPassage.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One passage of one published record, and its embedding (docs/semantic-search.md). Written by `Indexer` only. */
class SearchPassage extends Model
{
    protected $fillable = ['subject_type', 'subject_id', 'position', 'heading', 'text', 'hash', 'model', 'vector', 'embedded_at'];

    protected function casts(): array
    {
        return ['embedded_at' => 'datetime'];
    }
}
```

`api/app/Models/SearchQueryVector.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A visitor's normalised search phrase, embedded once and kept 30 days (docs/semantic-search.md). */
class SearchQueryVector extends Model
{
    public $timestamps = false;

    public $incrementing = false;

    protected $primaryKey = 'hash';

    protected $keyType = 'string';

    protected $fillable = ['hash', 'model', 'vector', 'last_used_at'];

    protected function casts(): array
    {
        return ['last_used_at' => 'datetime'];
    }
}
```

- [ ] **Step 5: `SemanticSettings`**

```php
<?php

namespace App\Support\Search;

use App\Models\Setting;
use App\Support\Chat\OpenRouterModels;

/**
 * The private `semantic_search` group (docs/semantic-search.md): the one
 * reader, falling back per field, and the write checks SettingController
 * calls. The model is checked by shape only — OpenRouter's model list does not
 * carry embedding models — and "Test this model" is the real proof.
 */
final class SemanticSettings
{
    public const GROUP = 'semantic_search';

    public const DEFAULT_MODEL = 'openai/text-embedding-3-small';

    public const DIMENSIONS = 512;

    public const DEFAULT_CAP = 2000;

    public const DEFAULT_FLOOR = 0.35;

    public static function enabled(): bool
    {
        return Setting::get('semantic_search_enabled') === true;
    }

    public static function model(): string
    {
        $model = trim((string) Setting::get('semantic_search_model', ''));

        return $model !== '' && preg_match(OpenRouterModels::SHAPE, $model) ? $model : self::DEFAULT_MODEL;
    }

    public static function dailyCap(): int
    {
        $value = Setting::get('semantic_search_daily_cap');

        return is_numeric($value) && (int) $value >= 0 && (int) $value <= 100000 ? (int) $value : self::DEFAULT_CAP;
    }

    public static function floor(): float
    {
        $value = Setting::get('semantic_search_floor');

        return is_numeric($value) && (float) $value >= 0 && (float) $value <= 1 ? (float) $value : self::DEFAULT_FLOOR;
    }

    public static function refusalFor(string $key, mixed $value): ?string
    {
        if (! str_starts_with($key, 'semantic_search_') || ! is_scalar($value) || trim((string) $value) === '') {
            return null;
        }

        $value = trim((string) $value);

        return match ($key) {
            'semantic_search_model' => strlen($value) <= OpenRouterModels::MAX_LENGTH && preg_match(OpenRouterModels::SHAPE, $value)
                ? null : 'That is not a model id. Copy it from openrouter.ai/models — for example openai/text-embedding-3-small.',
            'semantic_search_daily_cap' => ctype_digit($value) && (int) $value <= 100000 ? null : 'A whole number of searches, 0 to 100,000.',
            'semantic_search_floor' => is_numeric($value) && (float) $value >= 0 && (float) $value <= 1 ? null : 'A number from 0 to 1.',
            default => null,
        };
    }

    public static function recordError(string $message): void
    {
        Setting::query()->where('key', 'semantic_search_error')->update(['value' => mb_substr($message, 0, 500)]);
        Setting::flushCache();
    }

    public static function clearError(): void
    {
        if (filled(Setting::get('semantic_search_error'))) {
            Setting::query()->where('key', 'semantic_search_error')->update(['value' => null]);
            Setting::flushCache();
        }
    }
}
```

Read `api/app/Models/Setting.php` first: confirm `Setting::get()` returns `true`/`false` for a `boolean` row (the newsletter note in CLAUDE.md says it does) and that `flushCache()` is the method name. Confirm `OpenRouterModels::SHAPE` and `MAX_LENGTH` are public.

- [ ] **Step 6: Seed the group** — in `SettingsSeeder.php`, after the `health` rows, with a comment block in the file's style:

```php
            /*
             * Semantic search (0.182.0, docs/semantic-search.md): off by
             * default; the embedding model (an OpenRouter id), how many new
             * search phrases a day may be embedded, the similarity floor
             * (not drawn on the form), and the last refusal in OpenRouter's
             * words. Private.
             */
            ['group' => 'semantic_search', 'key' => 'semantic_search_enabled', 'value' => '0', 'type' => 'boolean'],
            ['group' => 'semantic_search', 'key' => 'semantic_search_model', 'value' => SemanticSettings::DEFAULT_MODEL, 'type' => 'string'],
            ['group' => 'semantic_search', 'key' => 'semantic_search_daily_cap', 'value' => (string) SemanticSettings::DEFAULT_CAP, 'type' => 'string'],
            ['group' => 'semantic_search', 'key' => 'semantic_search_floor', 'value' => (string) SemanticSettings::DEFAULT_FLOOR, 'type' => 'string'],
            ['group' => 'semantic_search', 'key' => 'semantic_search_error', 'value' => null, 'type' => 'string'],
```

- [ ] **Step 7: Join the write chain** — in `SettingController.php`, append `?? SemanticSettings::refusalFor($key, $row['value'] ?? null)` to the per-key chain (beside `HealthSettings::refusalFor`), import `App\Support\Search\SemanticSettings`.

- [ ] **Step 8: Draw the group** — in `settings-copy.ts`, following every place the `health` group appears:
  - field copy:

```ts
  /* Semantic search (0.182.0, docs/semantic-search.md). */
  semantic_search_enabled: {
    label: "Search by meaning",
    hint: "The site search and the website assistant also find pages by what they mean, not only by their words. Uses the OpenRouter key above. Off: nothing is sent and search works as before.",
  },
  semantic_search_model: {
    label: "Model for search by meaning",
    hint: "An OpenRouter embedding model, for example openai/text-embedding-3-small. Changing it re-indexes every page overnight.",
  },
  semantic_search_daily_cap: {
    label: "New search phrases a day",
    hint: "Each new phrase a visitor types costs one small request; the same phrase again costs nothing for 30 days. Past this number, search uses words only until tomorrow.",
  },
```

  - the group's order: `semantic_search: ["semantic_search_enabled", "semantic_search_model", "semantic_search_daily_cap", "semantic_search_floor", "semantic_search_error"],`
  - `HIDDEN` gains `"semantic_search_floor", "semantic_search_error"` (one comment line: the floor is tuned, not chosen; the error is written by the system and shown by the panel);
  - a `GROUP_TITLES` entry `semantic_search: { title: "Search by meaning", blurb: "…" }` matching the shape of the other entries;
  - on the `/admin/settings` screen's "Infrastructure" section, `groups: ["mail", "integrations", "semantic_search"]`.

- [ ] **Step 9: Run the tests**

Run: `cd api; php artisan test --filter="SemanticSearchAdminTest|SettingsScreensTest"`
Expected: PASS. `SettingsScreensTest` fails if a seeded group is drawn on no screen — Step 8 is what satisfies it.

- [ ] **Step 10: Commit**

```bash
git add api/database/migrations/2026_10_23_100000_create_search_tables.php api/app/Models/SearchPassage.php api/app/Models/SearchQueryVector.php api/app/Support/Search/SemanticSettings.php api/database/seeders/SettingsSeeder.php api/app/Http/Controllers/Api/V1/Admin/SettingController.php "web/src/app/admin/(app)/settings/settings-copy.ts" api/tests/Feature/SemanticSearchAdminTest.php
git commit -m "Semantic search: tables, models and the settings group"
```

---

### Task 2: Vectors and the embeddings call

**Files:**
- Create: `api/app/Support/Search/Vectors.php`, `api/app/Support/Search/Embeddings.php`, `api/tests/Concerns/FakesEmbeddings.php`, `api/tests/Unit/VectorsTest.php`
- Modify: `api/app/Support/Chat/Providers/OpenRouterProvider.php` (`attribution()` private → public)
- Test: `api/tests/Feature/SemanticIndexTest.php` (first tests)

**Interfaces:**
- Produces: `Vectors::normalise(list<float>): list<float>`, `Vectors::pack(list<float>): string` (little-endian float32, `pack('g*')`), `Vectors::unpack(string): list<float>`, `Vectors::dot(list<float>, list<float>): float`.
- Produces: `Embeddings::embed(list<string> $inputs, ?float $timeout = null): ?list<list<float>>` — unit-normalised vectors in input order, or null on any failure (error recorded); `Embeddings::ENDPOINT`.
- Produces: test trait `FakesEmbeddings` with `fakeEmbeddings(?callable $vectorFor = null, int $status = 200): void` and `vectorFor(string $text): list<float>` (deterministic: an 8-dimensional unit vector from the text's words — see code).

- [ ] **Step 1: The unit test** — `api/tests/Unit/VectorsTest.php`

```php
<?php

namespace Tests\Unit;

use App\Support\Search\Vectors;
use PHPUnit\Framework\TestCase;

class VectorsTest extends TestCase
{
    public function test_pack_round_trips_and_normalise_makes_a_unit_vector(): void
    {
        $v = Vectors::normalise([3.0, 4.0]);

        $this->assertEqualsWithDelta([0.6, 0.8], $v, 1e-6);
        $this->assertEqualsWithDelta($v, Vectors::unpack(Vectors::pack($v)), 1e-6);
        $this->assertEqualsWithDelta(1.0, Vectors::dot($v, $v), 1e-6);
    }

    public function test_a_zero_vector_stays_zero_and_dimensions_must_match(): void
    {
        $this->assertSame([0.0, 0.0], Vectors::normalise([0.0, 0.0]));
        $this->assertSame(0.0, Vectors::dot([1.0, 0.0], [1.0]));
    }
}
```

- [ ] **Step 2: Run it to see it fail** — `cd api; php artisan test --filter=VectorsTest` → FAIL, class not found.

- [ ] **Step 3: `Vectors`**

```php
<?php

namespace App\Support\Search;

/**
 * Embedding vectors as stored and compared (docs/semantic-search.md). Stored
 * unit-normalised as little-endian float32, so cosine similarity is a dot
 * product. Two vectors of different lengths (different models) score 0 rather
 * than throwing.
 */
final class Vectors
{
    /** @param  list<float>  $v  @return list<float> */
    public static function normalise(array $v): array
    {
        $length = sqrt(array_sum(array_map(fn (float $x) => $x * $x, $v)));

        return $length > 0 ? array_map(fn (float $x) => $x / $length, $v) : array_map(fn () => 0.0, $v);
    }

    /** @param  list<float>  $v */
    public static function pack(array $v): string
    {
        return pack('g*', ...$v);
    }

    /** @return list<float> */
    public static function unpack(string $bytes): array
    {
        return $bytes === '' ? [] : array_values(unpack('g*', $bytes));
    }

    /** @param  list<float>  $a  @param  list<float>  $b */
    public static function dot(array $a, array $b): float
    {
        if (count($a) !== count($b)) {
            return 0.0;
        }

        $sum = 0.0;
        foreach ($a as $i => $x) {
            $sum += $x * $b[$i];
        }

        return $sum;
    }
}
```

- [ ] **Step 4: Run** — `php artisan test --filter=VectorsTest` → PASS.

- [ ] **Step 5: The fake** — `api/tests/Concerns/FakesEmbeddings.php`

```php
<?php

namespace Tests\Concerns;

use App\Models\Setting;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * OpenRouter's embeddings endpoint, faked with deterministic vectors: each
 * text becomes an 8-dimensional vector from a few topic words, so "network
 * keeps dropping" and an article about Wi-Fi disconnections score high
 * without sharing a word. Every test that uses it also calls
 * `Http::preventStrayRequests()`.
 */
trait FakesEmbeddings
{
    /** topic => the words that point at it */
    private array $topics = [
        ['wifi', 'wi-fi', 'wireless', 'network', 'dropping', 'disconnect', 'disconnects', 'signal'],
        ['firewall', 'security', 'threat', 'attack', 'utm'],
        ['storage', 'nas', 'backup', 'disk', 'raid'],
        ['camera', 'cctv', 'surveillance', 'video'],
        ['switch', 'switches', 'ports', 'poe'],
        ['server', 'rack', 'datacenter'],
        ['laptop', 'notebook', 'thinkpad'],
        ['printer', 'printing', 'toner'],
    ];

    protected function enableSemanticSearch(): void
    {
        foreach ([
            'semantic_search_enabled' => ['1', 'boolean'],
            'semantic_search_model' => ['openai/text-embedding-3-small', 'string'],
            'openrouter_api_key' => ['sk-or-v1-test', 'string'],
        ] as $key => [$value, $type]) {
            Setting::updateOrCreate(['key' => $key], ['group' => $key === 'openrouter_api_key' ? 'integrations' : 'semantic_search', 'value' => $value, 'type' => $type]);
        }
        Setting::flushCache();
    }

    /** @return list<float> */
    protected function vectorFor(string $text): array
    {
        $words = preg_split('/[^a-z0-9-]+/', mb_strtolower($text)) ?: [];
        $v = array_fill(0, count($this->topics), 0.0);
        foreach ($this->topics as $i => $topic) {
            $v[$i] = (float) count(array_intersect($words, $topic));
        }
        // A text about nothing in particular points a little at everything, so it never scores 1.
        if (array_sum($v) === 0.0) {
            $v = array_fill(0, count($this->topics), 0.1);
        }

        return $v;
    }

    protected function fakeEmbeddings(?callable $vectorFor = null, int $status = 200): void
    {
        $vectorFor ??= fn (string $text) => $this->vectorFor($text);

        Http::preventStrayRequests();
        Http::fake(['openrouter.ai/api/v1/embeddings' => function (Request $request) use ($vectorFor, $status) {
            if ($status !== 200) {
                return Http::response(['error' => ['code' => $status, 'message' => 'Refused for the test']], $status);
            }
            $inputs = (array) $request->data()['input'];

            return Http::response(['data' => array_map(
                fn ($text, $i) => ['object' => 'embedding', 'index' => $i, 'embedding' => $vectorFor((string) $text)],
                $inputs, array_keys($inputs),
            ), 'usage' => ['total_tokens' => 10]]);
        }]);
    }
}
```

- [ ] **Step 6: The failing feature tests** — `api/tests/Feature/SemanticIndexTest.php`

```php
<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Support\Search\Embeddings;
use App\Support\Search\SemanticSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\FakesEmbeddings;
use Tests\TestCase;

class SemanticIndexTest extends TestCase
{
    use FakesEmbeddings, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->enableSemanticSearch();
    }

    public function test_embed_sends_the_batch_and_returns_unit_vectors_in_order(): void
    {
        $this->fakeEmbeddings();

        $vectors = Embeddings::embed(['wifi keeps dropping', 'a firewall']);

        $this->assertCount(2, $vectors);
        $this->assertEqualsWithDelta(1.0, array_sum(array_map(fn ($x) => $x * $x, $vectors[0])), 1e-6);
        $this->assertGreaterThan(0.9, $vectors[0][0]);
        $this->assertGreaterThan(0.9, $vectors[1][1]);
        Http::assertSent(fn (Request $r) => $r->url() === Embeddings::ENDPOINT
            && $r->hasHeader('Authorization', 'Bearer sk-or-v1-test')
            && $r['model'] === 'openai/text-embedding-3-small'
            && $r['dimensions'] === SemanticSettings::DIMENSIONS
            && $r['input'] === ['wifi keeps dropping', 'a firewall']);
    }

    public function test_a_refusal_returns_null_and_records_the_error_and_a_success_clears_it(): void
    {
        $this->fakeEmbeddings(status: 401);
        $this->assertNull(Embeddings::embed(['x']));
        $this->assertStringContainsString('Refused for the test', (string) Setting::get('semantic_search_error'));

        $this->fakeEmbeddings();
        $this->assertNotNull(Embeddings::embed(['x']));
        $this->assertNull(Setting::get('semantic_search_error'));
    }

    public function test_no_key_returns_null_without_a_request(): void
    {
        Setting::query()->where('key', 'openrouter_api_key')->update(['value' => null]);
        Setting::flushCache();
        config(['services.openrouter.key' => null]);
        Http::preventStrayRequests();
        Http::fake();

        $this->assertNull(Embeddings::embed(['x']));
        Http::assertNothingSent();
    }

    public function test_a_non_openai_model_is_not_sent_dimensions(): void
    {
        Setting::query()->where('key', 'semantic_search_model')->update(['value' => 'qwen/qwen3-embedding-0.6b']);
        Setting::flushCache();
        $this->fakeEmbeddings();

        Embeddings::embed(['x']);

        Http::assertSent(fn (Request $r) => ! array_key_exists('dimensions', $r->data()));
    }
}
```

Read how other tests store the OpenRouter key (`tests/Feature/OpenRouterProviderTest.php`), and whether a `Setting` row with a null value reads as null; adjust `test_no_key_returns_null_without_a_request` to the real `ChatSettings::apiKey()` fallback.

- [ ] **Step 7: Run to see them fail** — `php artisan test --filter=SemanticIndexTest` → FAIL, `Embeddings` not found.

- [ ] **Step 8: Make `OpenRouterProvider::attribution()` public** — change `private static function attribution(): array` to `public static function attribution(): array` and add to its docblock: "Public for the embeddings call (docs/semantic-search.md), which must send the same attribution."

- [ ] **Step 9: `Embeddings`**

```php
<?php

namespace App\Support\Search;

use App\Support\Chat\ChatSettings;
use App\Support\Chat\Providers\OpenRouterProvider;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * OpenRouter's embeddings endpoint (docs/semantic-search.md), with the key and
 * the attribution every AI call uses and the same routing pins, so a request
 * never falls back to a paid provider the account did not choose. Never
 * throws: any failure is null, and a refusal is written to
 * `semantic_search_error` in OpenRouter's words.
 */
final class Embeddings
{
    public const ENDPOINT = 'https://openrouter.ai/api/v1/embeddings';

    public const BATCH = 100;

    /**
     * @param  list<string>  $inputs
     * @return list<list<float>>|null unit vectors, in input order
     */
    public static function embed(array $inputs, ?float $timeout = null): ?array
    {
        $key = ChatSettings::apiKey();

        if ($inputs === [] || $key === null) {
            return $inputs === [] ? [] : null;
        }

        $model = SemanticSettings::model();

        try {
            $response = Http::withToken($key)
                ->withHeaders(OpenRouterProvider::attribution())
                ->timeout($timeout ?? 30)
                ->post(self::ENDPOINT, array_filter([
                    'model' => $model,
                    'input' => array_values($inputs),
                    'dimensions' => str_starts_with($model, 'openai/') ? SemanticSettings::DIMENSIONS : null,
                    'provider' => OpenRouterProvider::routing($model),
                ], fn ($v) => $v !== null));
        } catch (Throwable $e) {
            Log::warning('Semantic search: the embeddings call failed', ['error' => $e->getMessage()]);

            return null;
        }

        $error = $response->json('error.message');
        $rows = $response->json('data');

        if (! $response->successful() || is_string($error) || ! is_array($rows) || count($rows) !== count($inputs)) {
            SemanticSettings::recordError(is_string($error) ? $error : 'OpenRouter answered '.$response->status().' with no embeddings.');

            return null;
        }

        usort($rows, fn ($a, $b) => ($a['index'] ?? 0) <=> ($b['index'] ?? 0));
        SemanticSettings::clearError();

        return array_map(fn (array $row) => Vectors::normalise(array_map('floatval', (array) ($row['embedding'] ?? []))), $rows);
    }
}
```

A timeout during a visitor's search is not a refusal: it returns null without writing the error (the `catch` branch), so a slow minute does not leave a red banner on the console.

- [ ] **Step 10: Run** — `php artisan test --filter="VectorsTest|SemanticIndexTest|OpenRouterProviderTest"` → PASS.

- [ ] **Step 11: Commit**

```bash
git add api/app/Support/Search/Vectors.php api/app/Support/Search/Embeddings.php api/app/Support/Chat/Providers/OpenRouterProvider.php api/tests/Concerns/FakesEmbeddings.php api/tests/Unit/VectorsTest.php api/tests/Feature/SemanticIndexTest.php
git commit -m "Semantic search: vectors and the OpenRouter embeddings call"
```

---

### Task 3: What is indexed — `Indexable`, `Document`, `Passages`

**Files:**
- Create: `api/app/Support/Search/Indexable.php`, `api/app/Support/Search/Document.php`, `api/app/Support/Search/Passages.php`, `api/tests/Unit/SearchPassagesTest.php`
- Test: `api/tests/Feature/SemanticIndexTest.php` (append)

**Interfaces:**
- Produces: `Indexable::aliases(): list<string>`; `Indexable::query(string $alias): ?Builder` (the published query); `Indexable::isIndexed(Model $m): bool` (in that query); `Indexable::label(string $alias): string`; `Indexable::title(Model $m): string`.
- Produces: `Document::sections(Model $m): list<array{heading: ?string, text: string}>`.
- Produces: `Passages::split(string $title, list<array{heading: ?string, text: string}> $sections): list<array{heading: ?string, text: string}>`; constants `TARGET_WORDS = 250`, `MAX_WORDS = 400`, `MAX_CHARS = 2000`.

- [ ] **Step 1: The unit test** — `api/tests/Unit/SearchPassagesTest.php`

```php
<?php

namespace Tests\Unit;

use App\Support\Search\Passages;
use PHPUnit\Framework\TestCase;

class SearchPassagesTest extends TestCase
{
    private function words(int $n, string $word = 'word'): string
    {
        return implode(' ', array_fill(0, $n, $word)).'.';
    }

    public function test_a_short_record_is_one_passage_prefixed_with_its_title(): void
    {
        $out = Passages::split('Wi-Fi survey', [['heading' => null, 'text' => 'We walk the site.']]);

        $this->assertSame([['heading' => null, 'text' => 'Wi-Fi survey. We walk the site.']], $out);
    }

    public function test_sections_become_passages_with_their_heading_and_small_ones_merge(): void
    {
        $out = Passages::split('Guide', [
            ['heading' => 'Intro', 'text' => 'A few words.'],
            ['heading' => 'Steps', 'text' => $this->words(300)],
            ['heading' => 'Notes', 'text' => 'Short.'],
        ]);

        $this->assertCount(2, $out);
        $this->assertStringStartsWith('Guide — Steps.', $out[1]['text']);
        $this->assertSame('Steps', $out[1]['heading']);
        $this->assertStringContainsString('Notes', $out[1]['text']); // a small section joins the one before it
    }

    public function test_a_long_section_is_cut_at_sentence_ends_and_capped(): void
    {
        $sentence = $this->words(40);
        $out = Passages::split('T', [['heading' => 'Long', 'text' => str_repeat($sentence.' ', 25)]]); // 1,000 words

        $this->assertGreaterThan(2, count($out));
        foreach ($out as $p) {
            $this->assertLessThanOrEqual(Passages::MAX_CHARS, mb_strlen($p['text']));
            $this->assertStringEndsWith('.', $p['text']);
        }
    }

    public function test_empty_sections_give_nothing(): void
    {
        $this->assertSame([], Passages::split('T', [['heading' => 'Empty', 'text' => '   ']]));
    }
}
```

- [ ] **Step 2: Run to see it fail** — `php artisan test --filter=SearchPassagesTest` → FAIL.

- [ ] **Step 3: `Passages`**

```php
<?php

namespace App\Support\Search;

/**
 * A record's sections into passages of about 250 words (docs/semantic-search.md).
 * Small neighbouring sections join (a two-line intro is not worth a vector of its
 * own); a section over 400 words is cut at sentence ends; every passage starts
 * with the record's title, and its heading when it has one, so "Step 3 …" still
 * knows what it is a step of. Plain text in, plain text out.
 */
final class Passages
{
    public const TARGET_WORDS = 250;

    public const MAX_WORDS = 400;

    public const MAX_CHARS = 2000;

    /**
     * @param  list<array{heading: ?string, text: string}>  $sections
     * @return list<array{heading: ?string, text: string}>
     */
    public static function split(string $title, array $sections): array
    {
        $chunks = [];

        foreach ($sections as $section) {
            $text = trim(preg_replace('/\s+/u', ' ', $section['text']) ?? '');
            if ($text === '') {
                continue;
            }
            foreach (self::cut($text) as $piece) {
                $chunks[] = ['heading' => $section['heading'], 'text' => $piece];
            }
        }

        // Join a chunk smaller than half the target onto the one before it.
        $merged = [];
        foreach ($chunks as $chunk) {
            $last = array_key_last($merged);
            if ($last !== null && (self::count($chunk['text']) < self::TARGET_WORDS / 2 || self::count($merged[$last]['text']) < self::TARGET_WORDS / 2)
                && self::count($merged[$last]['text']) + self::count($chunk['text']) <= self::MAX_WORDS) {
                $merged[$last]['text'] .= ' '.($chunk['heading'] !== null && $chunk['heading'] !== $merged[$last]['heading'] ? $chunk['heading'].'. ' : '').$chunk['text'];
                continue;
            }
            $merged[] = $chunk;
        }

        return array_map(function (array $p) use ($title) {
            $prefix = trim($title).($p['heading'] !== null && $p['heading'] !== '' ? ' — '.$p['heading'] : '').'.';

            return ['heading' => $p['heading'], 'text' => mb_substr($prefix.' '.$p['text'], 0, self::MAX_CHARS)];
        }, $merged);
    }

    /** @return list<string> pieces of at most MAX_WORDS, cut after a sentence */
    private static function cut(string $text): array
    {
        if (self::count($text) <= self::MAX_WORDS) {
            return [$text];
        }

        $sentences = preg_split('/(?<=[.!?])\s+/u', $text) ?: [$text];
        $pieces = [];
        $current = '';
        foreach ($sentences as $sentence) {
            if ($current !== '' && self::count($current) + self::count($sentence) > self::TARGET_WORDS) {
                $pieces[] = $current;
                $current = '';
            }
            $current = trim($current.' '.$sentence);
        }
        if ($current !== '') {
            $pieces[] = $current;
        }

        return $pieces;
    }

    private static function count(string $text): int
    {
        return str_word_count(preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $text) ?? '');
    }
}
```

The ≤ 2,000-character cap with a trailing `.`: when `mb_substr` cuts a passage, the test's `assertStringEndsWith('.')` would fail. If it does, cut the final passage back to its last `.` inside the cap (`mb_substr($s, 0, mb_strrpos(mb_substr($s, 0, self::MAX_CHARS), '.') + 1)`) — keep the test, fix the code.

- [ ] **Step 4: Run** — `php artisan test --filter=SearchPassagesTest` → PASS.

- [ ] **Step 5: The feature tests** (append to `SemanticIndexTest`)

```php
    private function staffId(): int
    {
        return \App\Models\User::firstOrCreate(['email' => 'sem-author@example.test'], ['name' => 'A', 'password' => 'password-for-tests', 'is_active' => true])->id;
    }

    public function test_every_indexable_kind_has_a_published_query_and_a_title(): void
    {
        foreach (\App\Support\Search\Indexable::aliases() as $alias) {
            $this->assertNotNull(\App\Support\Search\Indexable::query($alias), $alias);
            $this->assertNotSame('', \App\Support\Search\Indexable::label($alias), $alias);
        }
        $this->assertNotContains('faq', \App\Support\Search\Indexable::aliases());
    }

    public function test_a_document_reads_the_body_sections_faqs_and_answer_blocks_never_a_price(): void
    {
        $article = \App\Models\KnowledgeArticle::create([
            'title' => 'Wi-Fi drops', 'slug' => 'wifi-drops', 'excerpt' => 'Why the wireless drops.',
            'body' => '<p>Start here.</p><h2>Check the channel</h2><p>Busy channels cause drops.</p>', 'status' => 'published',
        ]);
        $article->faqs()->create(['question' => 'Does a mesh help?', 'answer' => '<p>Often.</p>', 'sort_order' => 1]);

        $sections = \App\Support\Search\Document::sections($article->fresh());
        $text = implode(' ', array_column($sections, 'text'));

        $this->assertContains('Check the channel', array_column($sections, 'heading'));
        $this->assertStringContainsString('Busy channels cause drops.', $text);
        $this->assertStringContainsString('Does a mesh help? Often.', $text);
        $this->assertStringNotContainsString('<p>', $text);

        $product = \App\Models\StoreProduct::create(['name' => 'Switch', 'slug' => 'switch', 'type' => 'physical', 'price_paise' => 987654, 'status' => 'published', 'description' => '<p>24 ports.</p>']);
        $this->assertStringNotContainsString('9876', implode(' ', array_column(\App\Support\Search\Document::sections($product), 'text')));
    }

    public function test_a_draft_owners_faqs_are_not_indexed(): void
    {
        $draft = \App\Models\Service::create(['title' => 'Draft service', 'slug' => 'draft-service', 'summary' => 'x', 'body' => '<p>x</p>', 'status' => 'draft']);
        $draft->faqs()->create(['question' => 'Secret question?', 'answer' => '<p>Secret.</p>', 'sort_order' => 1]);

        $this->assertFalse(\App\Support\Search\Indexable::isIndexed($draft));
    }
```

Check `StoreProduct::create`'s required columns against its `$fillable` (they matched in the Site health work: `name, slug, type, price_paise, status, description`).

- [ ] **Step 6: Run to see them fail** — `php artisan test --filter=SemanticIndexTest` → FAIL.

- [ ] **Step 7: `Indexable`**

```php
<?php

namespace App\Support\Search;

use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Download;
use App\Models\Entry;
use App\Models\Event;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\Tender;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * The one list of kinds semantic search indexes (docs/semantic-search.md), and
 * the published query for each — the same scope each kind's public read uses,
 * never a second definition. FAQs are not a kind: they are read into their
 * owner's document, so a draft owner's questions are never searchable.
 * Industries and product categories have no status and are always public.
 */
final class Indexable
{
    /** alias => [class, label, title column, summary column|null, body columns, published scope?] */
    private const KINDS = [
        'solution' => [Solution::class, 'Solutions', 'title', 'summary', ['problem_statement', 'overview'], true],
        'service' => [Service::class, 'Services', 'title', 'summary', ['body'], true],
        'industry' => [Industry::class, 'Industries', 'name', 'summary', ['body'], false],
        'product_category' => [ProductCategory::class, 'Product categories', 'name', 'description', [], false],
        'product' => [Product::class, 'Products', 'name', 'short_description', ['description'], true],
        'store_product' => [StoreProduct::class, 'In the shop', 'name', 'short_description', ['description'], true],
        'knowledge_article' => [KnowledgeArticle::class, 'Knowledge base', 'title', 'excerpt', ['body'], true],
        'blog_post' => [BlogPost::class, 'Blog', 'title', 'excerpt', ['body'], true],
        'case_study' => [CaseStudy::class, 'Case studies', 'title', 'summary', ['body'], true],
        'page' => [Page::class, 'Pages', 'title', null, ['body'], true],
        'event' => [Event::class, 'Events', 'title', 'summary', ['body'], true],
        'tender' => [Tender::class, 'Tenders', 'title', 'summary', ['description'], true],
        'download' => [Download::class, 'Downloads', 'title', 'summary', [], true],
        'entry' => [Entry::class, 'More from the site', 'title', 'summary', ['body'], true],
    ];

    /** @return list<string> */
    public static function aliases(): array
    {
        return array_keys(self::KINDS);
    }

    /** @return class-string<Model>|null */
    public static function classFor(string $alias): ?string
    {
        return self::KINDS[$alias][0] ?? null;
    }

    public static function query(string $alias): ?Builder
    {
        if (! isset(self::KINDS[$alias])) {
            return null;
        }

        [$class, , , , , $scoped] = self::KINDS[$alias];

        return $scoped ? $class::query()->published() : $class::query();
    }

    public static function isIndexed(Model $model): bool
    {
        $query = self::query($model->getMorphClass());

        return $query !== null && $query->whereKey($model->getKey())->exists();
    }

    public static function label(string $alias): string
    {
        return self::KINDS[$alias][1] ?? $alias;
    }

    public static function title(Model $model): string
    {
        return (string) $model->getAttribute(self::KINDS[$model->getMorphClass()][2] ?? 'title');
    }

    public static function summaryColumn(string $alias): ?string
    {
        return self::KINDS[$alias][3] ?? null;
    }

    /** @return list<string> */
    public static function bodyColumns(string $alias): array
    {
        return self::KINDS[$alias][4] ?? [];
    }
}
```

**Verify every column name** in `KINDS` against the model's `$fillable` before trusting it (`grep -n fillable -A6 api/app/Models/<Model>.php`); the first test fails loudly for a kind whose query is null, but a wrong column only reads as empty. Fix any that differ, and say so in the report.

- [ ] **Step 8: `Document`**

```php
<?php

namespace App\Support\Search;

use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Model;

/**
 * One record's indexable text, as sections (docs/semantic-search.md): the
 * summary, the written body split at its h2/h3, the visible builder sections,
 * published answer blocks, the FAQs, and for a product its brand, category and
 * spec sheet. Never a price, stock, a date or a reference — they change too
 * often to be meaning, and are the shop's live data.
 */
final class Document
{
    private const SKIP_KEYS = ['type', 'id', 'href', 'url', 'style', 'reveal', 'background', 'icon', 'layout', 'source', 'ratio', 'align', 'size', 'variant', 'mode', 'height'];

    /** @return list<array{heading: ?string, text: string}> */
    public static function sections(Model $model): array
    {
        $alias = $model->getMorphClass();
        $out = [];

        if (($summary = Indexable::summaryColumn($alias)) !== null && filled($model->getAttribute($summary))) {
            $out[] = ['heading' => null, 'text' => HtmlSanitiser::toText((string) $model->getAttribute($summary))];
        }

        if (in_array($alias, ['product', 'store_product'], true)) {
            $facts = array_filter([
                method_exists($model, 'brand') ? $model->brand?->name : null,
                method_exists($model, 'category') ? $model->category?->name : null,
            ]);
            foreach ((array) ($model->getAttribute('specifications') ?? []) as $label => $value) {
                $facts[] = is_string($label) ? "{$label}: {$value}" : (string) $value;
            }
            if ($facts !== []) {
                $out[] = ['heading' => null, 'text' => implode('. ', $facts)];
            }
        }

        foreach (Indexable::bodyColumns($alias) as $column) {
            array_push($out, ...self::richSections((string) ($model->getAttribute($column) ?? '')));
        }

        foreach (self::blockTexts($model) as $text) {
            $out[] = ['heading' => null, 'text' => $text];
        }

        if (method_exists($model, 'answerBlocks')) {
            foreach ($model->answerBlocks()->where('status', 'published')->orderBy('sort_order')->get() as $block) {
                $out[] = ['heading' => null, 'text' => trim(($block->question ? $block->question.' ' : '').$block->answer.' '.HtmlSanitiser::toText($block->detail))];
            }
        }

        if (method_exists($model, 'faqs')) {
            $faqs = $model->faqs()->get()->map(fn ($f) => trim($f->question.' '.HtmlSanitiser::toText($f->answer)))->filter()->all();
            if ($faqs !== []) {
                $out[] = ['heading' => 'Questions', 'text' => implode(' ', $faqs)];
            }
        }

        return array_values(array_filter($out, fn ($s) => trim($s['text']) !== ''));
    }

    /** @return list<array{heading: ?string, text: string}> the body split before each h2/h3 */
    private static function richSections(string $html): array
    {
        if (trim($html) === '') {
            return [];
        }

        $parts = preg_split('/(<h[23][^>]*>.*?<\/h[23]>)/is', $html, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [$html];
        $sections = [];
        $heading = null;
        foreach ($parts as $part) {
            if (preg_match('/^<h[23]/i', $part)) {
                $heading = mb_substr(HtmlSanitiser::toText($part), 0, 160);
                continue;
            }
            $sections[] = ['heading' => $heading, 'text' => HtmlSanitiser::toText($part)];
        }

        return $sections;
    }

    /** @return list<string> the words of each visible builder section */
    private static function blockTexts(Model $model): array
    {
        $blocks = $model->getAttribute('blocks');
        $uses = $model->getMorphClass() === 'page'
            ? $model->getAttribute('template') === 'builder'
            : $model->getAttribute('body_layout') === 'sections';

        if (! $uses || ! is_array($blocks)) {
            return [];
        }

        $texts = [];
        foreach ($blocks as $block) {
            if (! is_array($block) || ! empty($block['hidden']) || ($block['type'] ?? '') === 'custom_code') {
                continue;
            }
            $words = [];
            array_walk_recursive($block['data'], function ($value, $key) use (&$words) {
                if (is_string($value) && ! in_array($key, self::SKIP_KEYS, true) && ! str_ends_with((string) $key, '_path') && ! str_ends_with((string) $key, '_id')) {
                    $words[] = HtmlSanitiser::toText($value);
                }
            });
            $text = trim(implode(' ', array_filter($words)));
            if ($text !== '') {
                $texts[] = $text;
            }
        }

        return $texts;
    }
}
```

Check the real names before relying on them: the product relations (`brand`, `category`), `AnswerBlock`'s columns (`question`, `answer`, `detail`, `status`, `sort_order`) and the morph relation `answerBlocks()` (see `App\Models\Concerns\HasAnswerBlocks`). `array_walk_recursive` needs `$block['data']` to be an array: guard with `is_array`.

- [ ] **Step 9: Run** — `php artisan test --filter="SemanticIndexTest|SearchPassagesTest"` → PASS.

- [ ] **Step 10: Commit**

```bash
git add api/app/Support/Search/Indexable.php api/app/Support/Search/Document.php api/app/Support/Search/Passages.php api/tests/Unit/SearchPassagesTest.php api/tests/Feature/SemanticIndexTest.php
git commit -m "Semantic search: what is indexed, as documents and passages"
```

---

### Task 4: Indexing — `Indexer`, the save listener, the nightly run, the upgrade step

**Files:**
- Create: `api/app/Support/Search/Indexer.php`, `api/app/Jobs/IndexRecordPassages.php`, `api/app/Jobs/IndexSearch.php`, `api/app/Console/Commands/IndexSearchCommand.php`, `api/app/Support/Upgrade/Steps/FirstSearchIndex.php`
- Modify: `api/app/Providers/AppServiceProvider.php` (a second listener loop after the Site health one), `api/routes/console.php`, `api/app/Support/Upgrade/UpgradeSteps.php`, `api/app/Http/Controllers/Api/V1/Admin/SettingController.php` (after-save hook)
- Test: `api/tests/Feature/SemanticIndexTest.php` (append)

**Interfaces:**
- Consumes: `Indexable`, `Document::sections`, `Passages::split`, `Embeddings::embed`, `Vectors::pack`, `SemanticSettings`.
- Produces: `Indexer::index(Model $m): void` (diff passages; then `embedWaiting(subject)`), `Indexer::forget(string $alias, int $id): void`, `Indexer::embedWaiting(?string $alias = null, ?int $id = null, int $limit = Embeddings::BATCH): int` (count embedded), `Indexer::markAllWaiting(): void`; `SearchFile::markStale(): void` (defined in Task 5 — this task calls a stub: create `SearchFile` with only `markStale()` now, Task 5 fills it).
- Produces: `IndexRecordPassages(string $alias, int $id)`, `IndexSearch(int $kindIndex = 0, int $afterId = 0)` with `public static int $budgetSeconds = 40`.

- [ ] **Step 1: The failing tests** (append)

```php
    private function article(array $attributes = []): \App\Models\KnowledgeArticle
    {
        return \App\Models\KnowledgeArticle::create($attributes + [
            'title' => 'Wi-Fi drops', 'slug' => 'wifi-drops', 'excerpt' => 'Why wireless drops.',
            'body' => '<p>Busy channels make the wireless network drop.</p>', 'status' => 'published',
        ]);
    }

    public function test_a_save_indexes_and_embeds_the_record(): void
    {
        $this->fakeEmbeddings();

        $article = $this->article();

        $rows = \App\Models\SearchPassage::query()->where('subject_type', 'knowledge_article')->where('subject_id', $article->id)->get();
        $this->assertCount(1, $rows);
        $this->assertNotNull($rows[0]->embedded_at);
        $this->assertSame('openai/text-embedding-3-small', $rows[0]->model);
        $this->assertCount(8, \App\Support\Search\Vectors::unpack($rows[0]->vector));
    }

    public function test_an_unchanged_passage_is_not_embedded_again(): void
    {
        $this->fakeEmbeddings();
        $article = $this->article(['body' => '<p>One.</p><h2>Two</h2><p>'.str_repeat('Two words here. ', 200).'</p>']);
        Http::fake(); // forget the calls so far
        $this->fakeEmbeddings();

        $article->update(['excerpt' => 'Why wireless drops.']); // nothing changed in the text
        Http::assertNothingSent();

        $article->update(['body' => '<p>One changed.</p><h2>Two</h2><p>'.str_repeat('Two words here. ', 200).'</p>']);
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $r) => count($r['input']) === 1); // only the changed passage
    }

    public function test_unpublishing_removes_the_passages(): void
    {
        $this->fakeEmbeddings();
        $article = $this->article();

        $article->update(['status' => 'draft']);

        $this->assertSame(0, \App\Models\SearchPassage::query()->where('subject_id', $article->id)->count());
    }

    public function test_deleting_removes_the_passages(): void
    {
        $this->fakeEmbeddings();
        $article = $this->article();

        $article->delete();

        $this->assertSame(0, \App\Models\SearchPassage::count());
    }

    public function test_switched_off_nothing_is_indexed_or_sent(): void
    {
        Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        Setting::flushCache();
        Http::preventStrayRequests();
        Http::fake();

        $this->article();

        $this->assertSame(0, \App\Models\SearchPassage::count());
        Http::assertNothingSent();
    }

    public function test_a_refused_embedding_leaves_the_passage_waiting(): void
    {
        $this->fakeEmbeddings(status: 500);

        $this->article();

        $this->assertNull(\App\Models\SearchPassage::sole()->embedded_at);
    }

    public function test_a_model_change_marks_every_passage_waiting(): void
    {
        $this->fakeEmbeddings();
        $this->article();

        \App\Support\Search\Indexer::markAllWaiting();

        $this->assertSame(0, \App\Models\SearchPassage::whereNotNull('embedded_at')->count());
    }

    public function test_the_nightly_run_indexes_records_saved_without_events_and_resumes_after_a_slice(): void
    {
        $this->fakeEmbeddings();
        \App\Models\KnowledgeArticle::withoutEvents(fn () => $this->article(['slug' => 'a']) && $this->article(['slug' => 'b', 'title' => 'Firewall rules', 'body' => '<p>A firewall blocks attacks.</p>']));
        $this->assertSame(0, \App\Models\SearchPassage::count());

        \App\Jobs\IndexSearch::$budgetSeconds = 0;
        try {
            $this->artisan('technoware:index-search')->assertSuccessful();
        } finally {
            \App\Jobs\IndexSearch::$budgetSeconds = 40;
        }

        $this->assertSame(2, \App\Models\SearchPassage::whereNotNull('embedded_at')->count());
    }

    public function test_an_update_queues_the_first_index_only_when_switched_on(): void
    {
        \Illuminate\Support\Facades\Queue::fake();
        (new \App\Support\Upgrade\Steps\FirstSearchIndex)->run();
        \Illuminate\Support\Facades\Queue::assertPushed(\App\Jobs\IndexSearch::class);

        Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        Setting::flushCache();
        \Illuminate\Support\Facades\Queue::fake();
        (new \App\Support\Upgrade\Steps\FirstSearchIndex)->run();
        \Illuminate\Support\Facades\Queue::assertNothingPushed();
    }
```

- [ ] **Step 2: Run to see them fail** — `php artisan test --filter=SemanticIndexTest` → FAIL.

- [ ] **Step 3: `SearchFile` stub** — `api/app/Support/Search/SearchFile.php`

```php
<?php

namespace App\Support\Search;

use Illuminate\Support\Facades\Cache;

/** The packed file a search reads (docs/semantic-search.md). Filled out in the next task. */
final class SearchFile
{
    public const STALE_KEY = 'search:file-stale';

    public static function markStale(): void
    {
        Cache::forever(self::STALE_KEY, true);
    }
}
```

- [ ] **Step 4: `Indexer`**

```php
<?php

namespace App\Support\Search;

use App\Models\SearchPassage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Keeps one record's passages current (docs/semantic-search.md). A passage
 * whose text hash is unchanged keeps its vector; a new or changed one waits
 * (`embedded_at` null) and is embedded in the same pass when the call works;
 * passages past the new count go. A record no longer published loses them all.
 */
final class Indexer
{
    public static function index(Model $model): void
    {
        if (! SemanticSettings::enabled()) {
            return;
        }

        $alias = $model->getMorphClass();
        $id = (int) $model->getKey();

        if (! Indexable::isIndexed($model)) {
            self::forget($alias, $id);

            return;
        }

        $passages = Passages::split(Indexable::title($model), Document::sections($model));
        $model->unsetRelations();

        DB::transaction(function () use ($alias, $id, $passages) {
            $existing = SearchPassage::query()->where('subject_type', $alias)->where('subject_id', $id)->get()->keyBy('position');

            foreach ($passages as $position => $passage) {
                $hash = sha1($passage['text']);
                $row = $existing->get($position);

                if ($row !== null && $row->hash === $hash) {
                    continue;
                }

                SearchPassage::updateOrCreate(
                    ['subject_type' => $alias, 'subject_id' => $id, 'position' => $position],
                    ['heading' => $passage['heading'], 'text' => $passage['text'], 'hash' => $hash, 'model' => null, 'vector' => null, 'embedded_at' => null],
                );
            }

            SearchPassage::query()->where('subject_type', $alias)->where('subject_id', $id)->where('position', '>=', count($passages))->delete();
        });

        self::embedWaiting($alias, $id);
    }

    public static function forget(string $alias, int $id): void
    {
        if (SearchPassage::query()->where('subject_type', $alias)->where('subject_id', $id)->delete() > 0) {
            SearchFile::markStale();
        }
    }

    /** Embeds waiting passages (of one record, or any), in batches. @return int how many were embedded */
    public static function embedWaiting(?string $alias = null, ?int $id = null, int $limit = Embeddings::BATCH): int
    {
        if (! SemanticSettings::enabled()) {
            return 0;
        }

        $rows = SearchPassage::query()
            ->whereNull('embedded_at')
            ->when($alias !== null, fn ($q) => $q->where('subject_type', $alias)->where('subject_id', $id))
            ->orderBy('id')
            ->limit($limit)
            ->get();

        if ($rows->isEmpty()) {
            return 0;
        }

        $vectors = Embeddings::embed($rows->pluck('text')->all());

        if ($vectors === null) {
            return 0;
        }

        $model = SemanticSettings::model();
        foreach ($rows->values() as $i => $row) {
            $row->forceFill(['model' => $model, 'vector' => Vectors::pack($vectors[$i]), 'embedded_at' => now()])->save();
        }
        SearchFile::markStale();

        return $rows->count();
    }

    public static function markAllWaiting(): void
    {
        SearchPassage::query()->update(['embedded_at' => null]);
        SearchFile::markStale();
    }
}
```

- [ ] **Step 5: The jobs**

`api/app/Jobs/IndexRecordPassages.php`:

```php
<?php

namespace App\Jobs;

use App\Support\Search\Indexable;
use App\Support\Search\Indexer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Re-indexes one record after it is saved (docs/semantic-search.md). A record gone since is forgotten. */
class IndexRecordPassages implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public function __construct(public readonly string $alias, public readonly int $id) {}

    public function handle(): void
    {
        $class = Indexable::classFor($this->alias);
        $model = $class ? $class::find($this->id) : null;

        $model === null ? Indexer::forget($this->alias, $this->id) : Indexer::index($model);
    }
}
```

`api/app/Jobs/IndexSearch.php`:

```php
<?php

namespace App\Jobs;

use App\Models\SearchQueryVector;
use App\Support\Search\Indexable;
use App\Support\Search\Indexer;
use App\Support\Search\SearchFile;
use App\Support\Search\SemanticSettings;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The nightly index of every record (docs/semantic-search.md), sliced like
 * the Site health sweep: a slice works for `$budgetSeconds` and dispatches the
 * next with its cursor. It catches what a save missed (`saveQuietly`, imports),
 * then embeds anything still waiting, prunes the query cache and marks the
 * search file stale so it is rebuilt.
 */
class IndexSearch implements ShouldQueue
{
    use Queueable;

    public const LAST_RUN_KEY = 'search:last_index_at';

    public int $tries = 1;

    public int $timeout = 80;

    /** Mutable for the slicing test only. */
    public static int $budgetSeconds = 40;

    public function __construct(public readonly int $kindIndex = 0, public readonly int $afterId = 0) {}

    public function handle(): void
    {
        if (! SemanticSettings::enabled()) {
            return;
        }

        $started = microtime(true);
        $aliases = Indexable::aliases();

        for ($k = $this->kindIndex; $k < count($aliases); $k++) {
            $class = Indexable::classFor($aliases[$k]);
            $after = $k === $this->kindIndex ? $this->afterId : 0;

            foreach ($class::query()->where('id', '>', $after)->orderBy('id')->lazyById(100) as $model) {
                try {
                    Indexer::index($model);
                } catch (Throwable $e) {
                    Log::warning('Semantic search: a record could not be indexed', ['type' => $aliases[$k], 'id' => $model->getKey(), 'error' => $e->getMessage()]);
                }

                if (microtime(true) - $started >= self::$budgetSeconds) {
                    self::dispatch($k, (int) $model->getKey());

                    return;
                }
            }
        }

        while (Indexer::embedWaiting() > 0 && microtime(true) - $started < max(self::$budgetSeconds, 1)) {
            // keep embedding until nothing waits or the slice is spent
        }

        SearchQueryVector::query()->where('last_used_at', '<', now()->subDays(30))->delete();
        SearchFile::markStale();
        Cache::forever(self::LAST_RUN_KEY, now()->toIso8601String());
    }
}
```

- [ ] **Step 6: The command, the schedule, the upgrade step**

`api/app/Console/Commands/IndexSearchCommand.php`:

```php
<?php

namespace App\Console\Commands;

use App\Jobs\IndexSearch;
use Illuminate\Console\Command;

/** Starts the nightly semantic search index (docs/semantic-search.md). The job slices itself. */
class IndexSearchCommand extends Command
{
    protected $signature = 'technoware:index-search';

    protected $description = 'Index every published record for search by meaning';

    public function handle(): int
    {
        IndexSearch::dispatch();

        return self::SUCCESS;
    }
}
```

`routes/console.php`, beside the Site health lines: `// Search by meaning (0.182.0, docs/semantic-search.md): catch what saves missed, embed what waits.` then `Schedule::command('technoware:index-search')->dailyAt('03:10');`

`api/app/Support/Upgrade/Steps/FirstSearchIndex.php` — copy `FirstHealthSweep.php`'s shape: id `2026-10-23-first-search-index`, version `0.182.0`, description `Index every page for search by meaning`, and `run()` dispatches `IndexSearch` **only when `SemanticSettings::enabled()`**. Append it to `UpgradeSteps::STEPS`.

- [ ] **Step 7: The listeners** — in `AppServiceProvider::boot()`, after the Site health loop, in the same shape:

```php
        /*
         * Search by meaning (docs/semantic-search.md): a saved record of an
         * indexed kind is re-indexed after commit, and a deleted one
         * forgotten. Guarded like Site health: indexing never fails a save,
         * and switched off nothing is queued.
         */
        foreach (\App\Support\Search\Indexable::aliases() as $alias) {
            $class = \App\Support\Search\Indexable::classFor($alias);

            $class::saved(function ($model) use ($alias) {
                try {
                    if (\App\Support\Search\SemanticSettings::enabled()) {
                        \App\Jobs\IndexRecordPassages::dispatch($alias, (int) $model->getKey())->afterCommit();
                    }
                } catch (\Throwable $e) {
                    Log::warning('Semantic search: could not queue an index', ['type' => $alias, 'id' => $model->getKey(), 'error' => $e->getMessage()]);
                }
            });

            $class::deleted(function ($model) use ($alias) {
                try {
                    \App\Support\Search\Indexer::forget($alias, (int) $model->getKey());
                } catch (\Throwable $e) {
                    Log::warning('Semantic search: could not forget a record', ['type' => $alias, 'id' => $model->getKey(), 'error' => $e->getMessage()]);
                }
            });
        }
```

An FAQ or an answer block saved alone does not move its owner's `saved` event; the nightly run picks those up. Say so in `docs/semantic-search.md` (Task 9).

- [ ] **Step 8: The after-save hook in `SettingController`** — after the settings are written (find where the update loop ends and the response is built), when the request changed `semantic_search_model` call `\App\Support\Search\Indexer::markAllWaiting()` and `\App\Jobs\IndexSearch::dispatch()`; when it switched `semantic_search_enabled` on, `\App\Jobs\IndexSearch::dispatch()`. Compare against the stored values read before the write (the method already loads `$existing` for the model checks). Add a test:

```php
    public function test_switching_on_or_changing_the_model_queues_the_index(): void
    {
        // In SemanticSearchAdminTest, as an administrator through PATCH /api/v1/admin/settings —
        // copy the admin sign-in helper from tests/Feature/SettingsTest.php (or the nearest test that PATCHes settings).
        \Illuminate\Support\Facades\Queue::fake();
        $this->asAdmin()->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'semantic_search_enabled', 'value' => '1']]])->assertOk();
        \Illuminate\Support\Facades\Queue::assertPushed(\App\Jobs\IndexSearch::class);
    }
```

- [ ] **Step 9: Run** — `php artisan test --filter="Semantic"` → PASS. Then the **full API suite once** (`php artisan test`, ~50 minutes, in the background, wait for it): the new listeners run on every save of fourteen kinds. A test that counts queued jobs exactly with `Queue::fake()` may now see `IndexRecordPassages` only if it switched semantic search on (it is off by default), so expect none; fix any that break by asserting on their own job class, never by removing the listener.

- [ ] **Step 10: `composer analyse`** (No errors) and pint.

- [ ] **Step 11: Commit**

```bash
git add api/app/Support/Search/Indexer.php api/app/Support/Search/SearchFile.php api/app/Jobs/IndexRecordPassages.php api/app/Jobs/IndexSearch.php api/app/Console/Commands/IndexSearchCommand.php api/app/Support/Upgrade/Steps/FirstSearchIndex.php api/app/Support/Upgrade/UpgradeSteps.php api/app/Providers/AppServiceProvider.php api/routes/console.php api/app/Http/Controllers/Api/V1/Admin/SettingController.php api/tests/Feature/SemanticIndexTest.php api/tests/Feature/SemanticSearchAdminTest.php
git commit -m "Semantic search: indexing on save, nightly, on update and on a model change"
```

---

### Task 5: Search time — `SearchFile` and `Semantic::match`

**Files:**
- Modify: `api/app/Support/Search/SearchFile.php` (fill it)
- Create: `api/app/Support/Search/Semantic.php`
- Test: `api/tests/Feature/SemanticMatchTest.php`

**Interfaces:**
- Produces: `SearchFile::load(): list<array{0: int, 1: string, 2: int, 3: list<float>}>` (passage id, alias, subject id, vector — current model, embedded only; memoised per process; rebuilt when stale or missing); `SearchFile::rebuild(): void`; `SearchFile::path(): string`.
- Produces: `Semantic::match(string $phrase, list<string> $aliases, int $limit = 50): list<array{subject_type: string, subject_id: int, score: float, passage_id: int}>` — best passage per record, over the floor, best first; `Semantic::normalise(string): string`; `Semantic::looksLikePartNumber(string): bool`; `Semantic::TIMEOUT = 1.5`; `Semantic::TODAY_KEY_PREFIX = 'search:phrases:'`.
- Produces: `Semantic::passages(string $phrase, list<string> $aliases, int $limit): list<array{subject_type, subject_id, score, passage_id, heading, text}>` for the assistant (the passage rows, not one per record).

- [ ] **Step 1: The failing tests** — `api/tests/Feature/SemanticMatchTest.php`

```php
<?php

namespace Tests\Feature;

use App\Models\KnowledgeArticle;
use App\Models\SearchQueryVector;
use App\Models\Setting;
use App\Support\Search\Semantic;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\FakesEmbeddings;
use Tests\TestCase;

class SemanticMatchTest extends TestCase
{
    use FakesEmbeddings, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->enableSemanticSearch();
        $this->fakeEmbeddings();
    }

    private function articles(): array
    {
        return [
            KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'x', 'body' => '<p>Wireless signal and disconnects.</p>', 'status' => 'published']),
            KnowledgeArticle::create(['title' => 'Rules', 'slug' => 'rules', 'excerpt' => 'x', 'body' => '<p>A firewall stops an attack.</p>', 'status' => 'published']),
        ];
    }

    public function test_meaning_finds_the_record_without_a_shared_word(): void
    {
        [$wifi] = $this->articles();

        $hits = Semantic::match('network keeps dropping', ['knowledge_article']);

        $this->assertSame($wifi->id, $hits[0]['subject_id']);
        $this->assertCount(1, $hits); // the firewall article is under the floor
    }

    public function test_the_same_phrase_is_embedded_once(): void
    {
        $this->articles();
        Http::fake();
        $this->fakeEmbeddings();

        Semantic::match('Network keeps dropping?', ['knowledge_article']);
        Semantic::match('network   keeps dropping', ['knowledge_article']);

        Http::assertSentCount(1);
        $this->assertSame(1, SearchQueryVector::count());
    }

    public function test_the_query_cache_is_per_model(): void
    {
        $this->articles();
        Semantic::match('network keeps dropping', ['knowledge_article']);

        Setting::query()->where('key', 'semantic_search_model')->update(['value' => 'qwen/qwen3-embedding-0.6b']);
        Setting::flushCache();
        Semantic::match('network keeps dropping', ['knowledge_article']);

        $this->assertSame(2, SearchQueryVector::count());
    }

    public function test_an_empty_index_matches_nothing(): void
    {
        $this->assertSame([], Semantic::match('network keeps dropping', ['knowledge_article']));
    }

    public function test_a_part_number_or_a_short_phrase_skips_meaning(): void
    {
        $this->articles();
        Http::fake();
        $this->fakeEmbeddings();

        $this->assertSame([], Semantic::match('CBS350-24T', ['knowledge_article']));
        $this->assertSame([], Semantic::match('ab', ['knowledge_article']));
        Http::assertNothingSent();
    }

    public function test_a_phrase_of_punctuation_is_not_embedded(): void
    {
        Http::fake();
        $this->fakeEmbeddings();

        $this->assertSame([], Semantic::match('???  --', ['knowledge_article']));
        Http::assertNothingSent();
    }

    public function test_the_daily_cap_falls_back_to_words(): void
    {
        $this->articles();
        Setting::query()->where('key', 'semantic_search_daily_cap')->update(['value' => '1']);
        Setting::flushCache();

        $this->assertNotSame([], Semantic::match('network keeps dropping', ['knowledge_article']));
        $this->assertSame([], Semantic::match('wireless signal problem', ['knowledge_article'])); // a second new phrase today
        $this->assertNotSame([], Semantic::match('network keeps dropping', ['knowledge_article'])); // cached: free
    }

    public function test_switched_off_or_failing_matches_nothing(): void
    {
        $this->articles();
        $this->fakeEmbeddings(status: 503);
        $this->assertSame([], Semantic::match('network keeps dropping', ['knowledge_article']));

        Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->fakeEmbeddings();
        $this->assertSame([], Semantic::match('network keeps dropping', ['knowledge_article']));
    }

    public function test_only_the_asked_kinds_are_returned(): void
    {
        $this->articles();

        $this->assertSame([], Semantic::match('network keeps dropping', ['blog_post']));
    }
}
```

The fake's vectors are 8-dimensional; the floor (0.35) is what keeps the firewall article out — if its score with the fake is above 0.35, adjust the fake's topic words in the test fixture (not the floor) so the test means what it says.

- [ ] **Step 2: Run to see them fail** — `php artisan test --filter=SemanticMatchTest` → FAIL.

- [ ] **Step 3: Fill `SearchFile`**

```php
<?php

namespace App\Support\Search;

use App\Models\SearchPassage;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

/**
 * Every embedded passage of the current model packed into one file on the
 * private disk, so a search reads one file and never scans the table
 * (docs/semantic-search.md). Each record: passage id (uint32), subject id
 * (uint32), alias length (uint8) + alias, vector length (uint16) + float32s.
 * Rebuilt when marked stale (an index changed something) at most once a
 * minute, and when missing.
 *
 * shortcut: cosine over every passage in PHP is fine to about 20,000 passages (tens of milliseconds); past that it needs a vector index.
 */
final class SearchFile
{
    public const STALE_KEY = 'search:file-stale';

    private const REBUILD_LOCK = 'search:file-rebuilding';

    /** @var array<string, list<array{0: int, 1: string, 2: int, 3: list<float>}>> */
    private static array $memo = [];

    public static function markStale(): void
    {
        Cache::forever(self::STALE_KEY, true);
        self::$memo = [];
    }

    public static function path(): string
    {
        return 'search/passages-'.substr(sha1(SemanticSettings::model()), 0, 12).'.bin';
    }

    /** @return list<array{0: int, 1: string, 2: int, 3: list<float>}> */
    public static function load(): array
    {
        $path = self::path();
        $disk = Storage::disk('local');

        if ((Cache::get(self::STALE_KEY) || ! $disk->exists($path)) && Cache::add(self::REBUILD_LOCK, 1, 60)) {
            self::rebuild();
        }

        if (isset(self::$memo[$path])) {
            return self::$memo[$path];
        }

        $bytes = $disk->exists($path) ? (string) $disk->get($path) : '';

        return self::$memo[$path] = self::decode($bytes);
    }

    public static function rebuild(): void
    {
        $model = SemanticSettings::model();
        $out = '';

        SearchPassage::query()->where('model', $model)->whereNotNull('embedded_at')->orderBy('id')
            ->select(['id', 'subject_type', 'subject_id', 'vector'])
            ->lazyById(500)
            ->each(function (SearchPassage $p) use (&$out) {
                $vector = (string) $p->vector;
                $out .= pack('VVC', $p->id, $p->subject_id, strlen($p->subject_type)).$p->subject_type.pack('v', strlen($vector) / 4).$vector;
            });

        Storage::disk('local')->put(self::path(), $out);
        Cache::forget(self::STALE_KEY);
        self::$memo = [];
    }

    /** @return list<array{0: int, 1: string, 2: int, 3: list<float>}> */
    private static function decode(string $bytes): array
    {
        $rows = [];
        $offset = 0;
        $length = strlen($bytes);

        while ($offset + 9 <= $length) {
            ['id' => $id, 'subject' => $subject, 'alias' => $aliasLength] = unpack('Vid/Vsubject/Calias', $bytes, $offset);
            $offset += 9;
            $alias = substr($bytes, $offset, $aliasLength);
            $offset += $aliasLength;
            $count = unpack('v', $bytes, $offset)[1];
            $offset += 2;
            $rows[] = [$id, $alias, $subject, Vectors::unpack(substr($bytes, $offset, $count * 4))];
            $offset += $count * 4;
        }

        return $rows;
    }
}
```

Check `Storage::disk('local')` is the private disk on this install (`config/filesystems.php`; Laravel 11+ roots `local` at `storage/app/private`). Add a round-trip test in `SemanticMatchTest`: two passages written, `SearchFile::rebuild()`, `SearchFile::load()` returns both with their vectors to 1e-6.

- [ ] **Step 4: `Semantic`**

```php
<?php

namespace App\Support\Search;

use App\Models\SearchQueryVector;
use Illuminate\Support\Facades\Cache;

/**
 * Search by meaning at search time (docs/semantic-search.md): the one entry
 * point. It answers [] — words only — whenever it should not or cannot help:
 * switched off, no key, nothing embedded, a short phrase or a part number, the
 * day's cap, a slow or refused call. The phrase is embedded once and cached
 * per model; each record keeps its best passage; anything under the floor is
 * noise.
 */
final class Semantic
{
    public const TIMEOUT = 1.5;

    public const MIN_LENGTH = 3;

    public const TODAY_KEY_PREFIX = 'search:phrases:';

    /** @param  list<string>  $aliases  @return list<array{subject_type: string, subject_id: int, score: float, passage_id: int}> */
    public static function match(string $phrase, array $aliases, int $limit = 50): array
    {
        $best = [];
        foreach (self::scored($phrase, $aliases) as $hit) {
            $key = $hit['subject_type'].':'.$hit['subject_id'];
            if (! isset($best[$key]) || $hit['score'] > $best[$key]['score']) {
                $best[$key] = $hit;
            }
        }

        usort($best, fn ($a, $b) => $b['score'] <=> $a['score']);

        return array_slice(array_values($best), 0, $limit);
    }

    /** The best passages themselves, for the assistant. @param  list<string>  $aliases */
    public static function passages(string $phrase, array $aliases, int $limit): array
    {
        $hits = self::scored($phrase, $aliases);
        usort($hits, fn ($a, $b) => $b['score'] <=> $a['score']);
        $hits = array_slice($hits, 0, $limit);

        $rows = \App\Models\SearchPassage::query()->whereKey(array_column($hits, 'passage_id'))->get(['id', 'heading', 'text'])->keyBy('id');

        return array_values(array_filter(array_map(fn ($h) => isset($rows[$h['passage_id']])
            ? $h + ['heading' => $rows[$h['passage_id']]->heading, 'text' => $rows[$h['passage_id']]->text]
            : null, $hits)));
    }

    public static function normalise(string $phrase): string
    {
        return trim(preg_replace('/\s+/u', ' ', preg_replace('/[^\p{L}\p{N}\s-]+/u', ' ', mb_strtolower($phrase)) ?? '') ?? '');
    }

    public static function looksLikePartNumber(string $phrase): bool
    {
        $phrase = trim($phrase);

        return ! str_contains($phrase, ' ') && preg_match('/\d/', $phrase) === 1 && preg_match('/[a-z]/i', $phrase) === 1;
    }

    /** @param  list<string>  $aliases  @return list<array{subject_type: string, subject_id: int, score: float, passage_id: int}> */
    private static function scored(string $phrase, array $aliases): array
    {
        $normal = self::normalise($phrase);

        if (! SemanticSettings::enabled() || mb_strlen(str_replace(['-', ' '], '', $normal)) < self::MIN_LENGTH || self::looksLikePartNumber($phrase) || $aliases === []) {
            return [];
        }

        $passages = SearchFile::load();
        if ($passages === []) {
            return [];
        }

        $query = self::queryVector($normal);
        if ($query === null) {
            return [];
        }

        $floor = SemanticSettings::floor();
        $wanted = array_flip($aliases);
        $hits = [];
        foreach ($passages as [$id, $alias, $subject, $vector]) {
            if (! isset($wanted[$alias])) {
                continue;
            }
            $score = Vectors::dot($query, $vector);
            if ($score >= $floor) {
                $hits[] = ['subject_type' => $alias, 'subject_id' => $subject, 'score' => $score, 'passage_id' => $id];
            }
        }

        return $hits;
    }

    /** @return list<float>|null */
    private static function queryVector(string $normal): ?array
    {
        $model = SemanticSettings::model();
        $hash = sha1($normal.'|'.$model);

        $cached = SearchQueryVector::query()->find($hash);
        if ($cached !== null) {
            $cached->forceFill(['last_used_at' => now()])->save();

            return Vectors::unpack((string) $cached->vector);
        }

        $todayKey = self::TODAY_KEY_PREFIX.now()->toDateString();
        Cache::add($todayKey, 0, now()->endOfDay());
        if ((int) Cache::get($todayKey) >= SemanticSettings::dailyCap()) {
            return null;
        }

        $vectors = Embeddings::embed([$normal], self::TIMEOUT);
        if ($vectors === null || ! isset($vectors[0])) {
            return null;
        }

        Cache::increment($todayKey);
        SearchQueryVector::query()->updateOrCreate(['hash' => $hash], ['model' => $model, 'vector' => Vectors::pack($vectors[0]), 'last_used_at' => now()]);

        return $vectors[0];
    }
}
```

- [ ] **Step 5: Run** — `php artisan test --filter="SemanticMatchTest|SemanticIndexTest"` → PASS; `composer analyse`; pint.

- [ ] **Step 6: Commit**

```bash
git add api/app/Support/Search/SearchFile.php api/app/Support/Search/Semantic.php api/tests/Feature/SemanticMatchTest.php
git commit -m "Semantic search: the search file and matching by meaning"
```

---

### Task 6: The site search blends meaning under words

**Files:**
- Modify: `api/app/Http/Controllers/Api/V1/SearchController.php`
- Test: `api/tests/Feature/SemanticSearchBlendTest.php`

**Interfaces:**
- Consumes: `Semantic::match(string, list<string>, int): list<{subject_type, subject_id, score, passage_id}>`, `Indexable::aliases()`.
- Produces: `/search` rows unchanged in shape; meaning-only records appended per group after word hits, up to `PER_GROUP`; `total` counts meaning-only records.

- [ ] **Step 1: The failing tests** — `api/tests/Feature/SemanticSearchBlendTest.php`

```php
<?php

namespace Tests\Feature;

use App\Models\KnowledgeArticle;
use App\Models\StoreProduct;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\FakesEmbeddings;
use Tests\TestCase;

class SemanticSearchBlendTest extends TestCase
{
    use FakesEmbeddings, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->enableSemanticSearch();
        $this->fakeEmbeddings();
    }

    private function group(array $json, string $type): ?array
    {
        return collect($json['data']['groups'])->firstWhere('type', $type);
    }

    public function test_a_meaning_only_article_is_found_and_counted(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'Plan your channels.', 'body' => '<p>Wireless signal and disconnects.</p>', 'status' => 'published']);

        $json = $this->getJson('/api/v1/search?q='.urlencode('network keeps dropping'))->assertOk()->json();

        $group = $this->group($json, 'article');
        $this->assertNotNull($group);
        $this->assertSame('Channel planning', $group['results'][0]['title']);
        $this->assertSame(1, $group['total']);
        $this->assertSame(['excerpt', 'path', 'title'], collect(array_keys($group['results'][0]))->sort()->values()->all());
    }

    public function test_an_exact_sku_still_comes_first(): void
    {
        StoreProduct::create(['name' => 'Wireless access point', 'slug' => 'ap', 'sku' => 'AP-200', 'type' => 'physical', 'price_paise' => 100, 'status' => 'published', 'description' => '<p>Wireless signal for offices.</p>']);
        StoreProduct::create(['name' => 'Wi-Fi mesh kit', 'slug' => 'mesh', 'sku' => 'MESH-1', 'type' => 'physical', 'price_paise' => 100, 'status' => 'published', 'description' => '<p>Wireless network signal everywhere.</p>']);

        $json = $this->getJson('/api/v1/search?q=AP-200')->assertOk()->json();

        $this->assertStringContainsString('Wireless access point', $this->group($json, 'store_product')['results'][0]['title']);
    }

    public function test_a_record_found_by_both_appears_once_at_its_word_position(): void
    {
        KnowledgeArticle::create(['title' => 'Wireless signal guide', 'slug' => 'wsg', 'excerpt' => 'x', 'body' => '<p>Wireless signal disconnects.</p>', 'status' => 'published']);

        $json = $this->getJson('/api/v1/search?q='.urlencode('wireless signal'))->assertOk()->json();

        $this->assertCount(1, $this->group($json, 'article')['results']);
    }

    public function test_switched_off_the_response_is_exactly_the_word_search(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'x', 'body' => '<p>Wireless signal and disconnects.</p>', 'status' => 'published']);
        \App\Models\Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        \App\Models\Setting::flushCache();

        $json = $this->getJson('/api/v1/search?q='.urlencode('network keeps dropping'))->assertOk()->json();

        $this->assertNull($this->group($json, 'article'));
    }

    public function test_no_passage_text_reaches_the_response(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'Short excerpt.', 'body' => '<p>Wireless signal and disconnects. A unique-passage-sentence.</p>', 'status' => 'published']);

        $body = $this->getJson('/api/v1/search?q='.urlencode('network keeps dropping'))->assertOk()->getContent();

        $this->assertStringNotContainsString('unique-passage-sentence', $body);
    }
}
```

- [ ] **Step 2: Run to see them fail** — `php artisan test --filter=SemanticSearchBlendTest` → FAIL (no article group).

- [ ] **Step 3: The blend** — in `SearchController`:
  1. In `__invoke`, after the short-term check, compute once: `$this->meaning = collect(Semantic::match($term, Indexable::aliases(), 60))->groupBy('subject_type')->map(fn ($g) => $g->pluck('subject_id')->all())->all();` (a `private array $meaning = [];` property).
  2. Give `build()` a new first parameter `string $alias` (the morph alias: `solution`, `service`, `industry`, `product_category`, `knowledge_article`, `blog_post`, `case_study`, `page`, `product`, `store_product`, `event`, `tender`, `download`, `entry`) and pass it from `group()` (add the alias argument to `group()` and to every call site — the `type` strings stay as they are: `article`, `post`, `category` are the wire's names) and from each per-kind helper's call to `build()`.
  3. `build()` becomes (the `$shape` closure and the return shape unchanged):

```php
    private function build(string $alias, string $type, string $label, string $prefix, $query, callable $shape, array $with = []): ?array
    {
        $rows = (clone $query)->limit(self::PER_GROUP)->get();
        $wordTotal = $rows->count() < self::PER_GROUP ? $rows->count() : (clone $query)->count();

        // Records meaning found that the word query does not also match (on any page).
        $meaningOnly = [];
        $ids = $this->meaning[$alias] ?? [];
        if ($ids !== [] && ($base = Indexable::query($alias)) !== null) {
            $alsoWords = (clone $query)->whereKey($ids)->pluck($base->getModel()->getKeyName())->all();
            $meaningOnly = array_values(array_diff($ids, $alsoWords)); // still in score order

            if ($rows->count() < self::PER_GROUP && $meaningOnly !== []) {
                $take = array_slice($meaningOnly, 0, self::PER_GROUP - $rows->count());
                $extra = $base->with($with)->whereKey($take)->get()
                    ->sortBy(fn ($m) => array_search($m->getKey(), $take, true))->values();
                $rows = $rows->concat($extra);
            }
        }

        if ($rows->isEmpty()) {
            return null;
        }

        return [
            'type' => $type, 'label' => $label, 'total' => $wordTotal + count($meaningOnly),
            'results' => Collection::make($rows)->map($shape)->values()->all(),
        ];
    }
```

  `$with` is the relations the per-kind helper eager-loads (`['brand']` for products, `['category']` for tenders and downloads, `['contentType']` for entries); pass it from each helper so the extra rows render like the word rows. A meaning id that is not in the published query (unpublished since the file was built) is simply not returned by `$base->whereKey()`.
  4. The meaning-only records go through the same `$shape` closure, so a row has the same keys.

- [ ] **Step 4: Run** — `php artisan test --filter="SemanticSearchBlendTest|SearchTest"` (and any existing site search test: `grep -l "api/v1/search" api/tests/Feature/*.php`) → PASS. Switched off, every existing search test must pass unchanged.

- [ ] **Step 5: `composer analyse`, pint, commit**

```bash
git add api/app/Http/Controllers/Api/V1/SearchController.php api/tests/Feature/SemanticSearchBlendTest.php
git commit -m "Semantic search: the site search blends meaning under words"
```

---

### Task 7: The assistant reads the matching passages

**Files:**
- Modify: `api/app/Support/Chat/Retriever.php`
- Test: `api/tests/Feature/SemanticSearchBlendTest.php` (append)

**Interfaces:**
- Consumes: `Semantic::passages(string, list<string>, int): list<{subject_type, subject_id, score, passage_id, heading, text}>`, `Indexable::classFor`, `Indexable::label`, `Indexable::title`.
- Produces: `Retriever::for()` sources gain up to 4 passage sources `{type: <alias>, label: Indexable::label(alias), title: record title, excerpt: passage text (≤ 600 characters), url: publicPath(), meta: []}`, after the word sources, never duplicating a URL the word sources already carry.

- [ ] **Step 1: The failing test** (append to `SemanticSearchBlendTest`)

```php
    public function test_the_assistant_retrieves_a_meaning_only_passage(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'Plan your channels.',
            'body' => '<p>Intro.</p><h2>Why it drops</h2><p>Wireless signal disconnects when channels overlap.</p>', 'status' => 'published']);

        $sources = \App\Support\Chat\Retriever::for('my network keeps dropping');

        $passage = collect($sources)->firstWhere('url', '/knowledge-base/channels');
        $this->assertNotNull($passage);
        $this->assertStringContainsString('channels overlap', $passage['excerpt']);
    }

    public function test_switched_off_the_assistant_retrieves_as_before(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'x', 'body' => '<p>Wireless signal disconnects.</p>', 'status' => 'published']);
        \App\Models\Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        \App\Models\Setting::flushCache();

        $this->assertSame([], \App\Support\Chat\Retriever::for('my network keeps dropping'));
    }
```

Check the knowledge-base public path prefix (`KnowledgeArticle::publicPath()`); adjust `/knowledge-base/channels` to what it returns.

- [ ] **Step 2: Run to see it fail** — FAIL (the word retriever finds nothing, so `[]`).

- [ ] **Step 3: Retriever** — in `for()`:
  - Remove the early `return []` when `$terms === []` **only after** computing meaning: change the flow to compute `$meaning = self::meaning($question)` first, and if `$terms === []` return `$meaning`.
  - Inside the existing `Cache::remember` closure (so meaning is cached with the editorial sources for five minutes), add `self::meaning($question)` as the last group.
  - After `array_merge(...$groups)`, drop meaning sources whose `url` is already present, then `array_slice(..., 0, self::MAX_RECORDS + 4)` — meaning adds at most 4 beyond the word cap.

```php
    /** Up to four passages that answer the question by meaning (docs/semantic-search.md). Empty when meaning is off. */
    private static function meaning(string $question): array
    {
        $out = [];
        foreach (Semantic::passages($question, Indexable::aliases(), 8) as $hit) {
            $class = Indexable::classFor($hit['subject_type']);
            $record = $class ? $class::find($hit['subject_id']) : null;

            if ($record === null || ! method_exists($record, 'publicPath') || ! Indexable::isIndexed($record)) {
                continue;
            }

            $url = $record->publicPath();
            if (isset($out[$url])) {
                continue;
            }

            $out[$url] = [
                'type' => $hit['subject_type'],
                'label' => Indexable::label($hit['subject_type']),
                'title' => Indexable::title($record),
                'excerpt' => Str::limit($hit['text'], 600),
                'url' => $url,
                'meta' => [],
            ];

            if (count($out) === 4) {
                break;
            }
        }

        return array_values($out);
    }
```

  Import `App\Support\Search\Indexable` and `App\Support\Search\Semantic`. `Assistant::context()` fences every source's title and excerpt already, so a passage is inside `---WEBSITE COPY---` with no change there; `grounded` follows from a non-empty source list, as now.

- [ ] **Step 4: Run** — `php artisan test --filter="SemanticSearchBlendTest|ChatTest|ChatJourneyTest|Retriever"` → PASS.

- [ ] **Step 5: `composer analyse`, pint, commit**

```bash
git add api/app/Support/Chat/Retriever.php api/tests/Feature/SemanticSearchBlendTest.php
git commit -m "Semantic search: the assistant reads the passages that answer by meaning"
```

---

### Task 8: The console — status, test, re-index; the panel; the mock

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/Admin/SemanticSearchController.php`, `web/src/types/semantic-search.ts`, `web/src/lib/admin/semantic-search.ts`, `web/src/app/admin/(app)/settings/semantic-search-panel.tsx`
- Modify: `api/routes/api/admin-admin.php`, `web/src/lib/admin/index.ts`, `web/src/app/admin/(app)/settings/settings-form.tsx` (mount), `web/mock-api.mjs`
- Test: `api/tests/Feature/SemanticSearchAdminTest.php` (append)

**Interfaces:**
- Produces: `GET /api/v1/admin/search/semantic` → `{data: {enabled, model, passages: {total, embedded, waiting}, today: {phrases, cap}, error, last_index_at}}`; `POST /api/v1/admin/search/semantic/test` → `{data: {model, dimensions}}` or 422 `{message, errors: {model: [..]}}`; `POST /api/v1/admin/search/semantic/reindex` → 202 `{message}`. All `role:admin`.

- [ ] **Step 1: The failing tests** (append; add `use \Tests\Concerns\FakesEmbeddings;` to the class's trait list beside `RefreshDatabase`, and copy the admin Bearer helper `asStaff()` from `tests/Feature/HealthAccessTest.php`)

```php
    public function test_the_status_counts_passages_and_todays_phrases(): void
    {
        $this->seed(SettingsSeeder::class);
        SearchPassage::create(['subject_type' => 'page', 'subject_id' => 1, 'position' => 0, 'text' => 'a', 'hash' => sha1('a'), 'model' => 'm', 'vector' => 'x', 'embedded_at' => now()]);
        SearchPassage::create(['subject_type' => 'page', 'subject_id' => 1, 'position' => 1, 'text' => 'b', 'hash' => sha1('b')]);

        $this->asStaff(\App\Enums\Role::Admin)->getJson('/api/v1/admin/search/semantic')->assertOk()
            ->assertJsonPath('data.passages.total', 2)->assertJsonPath('data.passages.waiting', 1)
            ->assertJsonPath('data.today.cap', 2000)->assertJsonPath('data.enabled', false);
    }

    public function test_the_model_test_answers_dimensions_or_openrouters_words(): void
    {
        $this->seed(SettingsSeeder::class);
        $this->enableSemanticSearch();
        $this->fakeEmbeddings();
        $this->asStaff(\App\Enums\Role::Admin)->postJson('/api/v1/admin/search/semantic/test')->assertOk()->assertJsonPath('data.dimensions', 8);

        $this->fakeEmbeddings(status: 401);
        $this->asStaff(\App\Enums\Role::Admin)->postJson('/api/v1/admin/search/semantic/test')->assertStatus(422)->assertJsonPath('errors.model.0', 'Refused for the test');
    }

    public function test_reindex_queues_the_run_and_only_an_administrator_may(): void
    {
        $this->seed(SettingsSeeder::class);
        \Illuminate\Support\Facades\Queue::fake();
        $this->asStaff(\App\Enums\Role::ContentManager)->postJson('/api/v1/admin/search/semantic/reindex')->assertForbidden();
        $this->asStaff(\App\Enums\Role::Admin)->postJson('/api/v1/admin/search/semantic/reindex')->assertStatus(202);
        \Illuminate\Support\Facades\Queue::assertPushed(\App\Jobs\IndexSearch::class);
    }
```

The test endpoint must report OpenRouter's words even though `Embeddings::embed()` returns null: read `semantic_search_error` right after the failed call (Task 2 writes it there), and use it as the 422 message; for a timeout (no error written) answer "OpenRouter did not answer in time.".

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: The controller and routes**

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\IndexSearch;
use App\Models\SearchPassage;
use App\Models\Setting;
use App\Support\Search\Embeddings;
use App\Support\Search\Semantic;
use App\Support\Search\SemanticSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

/** Search by meaning's console (docs/semantic-search.md): the status panel, Test this model and Re-index now. Administrators only. */
class SemanticSearchController extends Controller
{
    public function show(): JsonResponse
    {
        $model = SemanticSettings::model();

        return response()->json(['data' => [
            'enabled' => SemanticSettings::enabled(),
            'model' => $model,
            'passages' => [
                'total' => SearchPassage::count(),
                'embedded' => SearchPassage::query()->where('model', $model)->whereNotNull('embedded_at')->count(),
                'waiting' => SearchPassage::query()->whereNull('embedded_at')->count(),
            ],
            'today' => ['phrases' => (int) Cache::get(Semantic::TODAY_KEY_PREFIX.now()->toDateString(), 0), 'cap' => SemanticSettings::dailyCap()],
            'error' => Setting::get('semantic_search_error') ?: null,
            'last_index_at' => Cache::get(IndexSearch::LAST_RUN_KEY),
        ]]);
    }

    public function test(): JsonResponse
    {
        $vectors = Embeddings::embed(['A test from the console.'], 15);

        if ($vectors === null || ! isset($vectors[0])) {
            $message = (string) (Setting::get('semantic_search_error') ?: 'OpenRouter did not answer in time.');

            return response()->json(['message' => $message, 'errors' => ['model' => [$message]]], 422);
        }

        return response()->json(['data' => ['model' => SemanticSettings::model(), 'dimensions' => count($vectors[0])]]);
    }

    public function reindex(): JsonResponse
    {
        IndexSearch::dispatch();

        return response()->json(['message' => 'Indexing has started. It runs in the background.'], 202);
    }
}
```

In `routes/api/admin-admin.php` (inside its `role:admin` group):

```php
    Route::get('search/semantic', [SemanticSearchController::class, 'show'])->name('search.semantic.show');
    Route::post('search/semantic/test', [SemanticSearchController::class, 'test'])->middleware('throttle:6,1')->name('search.semantic.test');
    Route::post('search/semantic/reindex', [SemanticSearchController::class, 'reindex'])->middleware('throttle:2,1')->name('search.semantic.reindex');
```

Check `/admin/search` (the console palette) is not shadowed: it is `GET admin/search`; these are `admin/search/semantic*` — confirm with `php artisan route:list --path=admin/search`.

- [ ] **Step 4: Run** — `php artisan test --filter="SemanticSearchAdminTest|AdminNavRolesTest"` → PASS.

- [ ] **Step 5: The web panel**
  - `web/src/types/semantic-search.ts`: the `SemanticStatus` type matching `show()`'s `data`.
  - `web/src/lib/admin/semantic-search.ts` (`server-only`, the `lib/admin/*` pattern): `getSemanticStatus()`, `testSemanticModel(): Promise<{ok: true, dimensions: number} | {ok: false, message: string}>` (catch the 422 and return its message), `reindexSemantic()`. Export from `lib/admin/index.ts`.
  - Server Actions beside the panel (the `integrations-actions.ts` pattern — read it): `semanticStatusAction`, `semanticTestAction`, `semanticReindexAction`.
  - `web/src/app/admin/(app)/settings/semantic-search-panel.tsx`: a client component, modelled on `openrouter-test.tsx` (read it for the look, `useTransition`, the button and result line): shows "N passages indexed, M waiting", "Today: X of CAP new phrases", the last index time through `lib/dates.ts`, the error in an `Alert tone="err"` with `dismissible={false}` when present; buttons **Test this model** and **Re-index now**, each with its result line. It fetches the status on mount through the status action.
  - Mount it in `settings-form.tsx` after the `semantic_search_daily_cap` row, the way `OpenRouterTest` is appended after `seo_ai_model` (read lines ~343–354 and follow the same `return row.key === … ? [choice, <Panel …/>] : choice` shape).
  - Keep every file's stored line endings (`git show HEAD:<file> | od -c | head`).

- [ ] **Step 6: The mock** — in `web/mock-api.mjs`, the `semantic_search` group's rows in the settings fixture (follow how `health` rows appear there), and `GET /admin/search/semantic` returning a fixture status; `POST …/test` → `{data: {model, dimensions: 512}}`; `POST …/reindex` → 202. Keep the file's CRLF endings exactly (it is stored CRLF; check `git diff --stat` shows only your lines; if `text=auto` re-normalises it, write the blob with `git hash-object -w --no-filters` + `git update-index --cacheinfo`, as Task 10 of Site health did).

- [ ] **Step 7: Checks** — `cd web; npx tsc --noEmit; npm run lint`; `cd api; php artisan test --filter=SettingsScreensTest`.

- [ ] **Step 8: Commit**

```bash
git add api/app/Http/Controllers/Api/V1/Admin/SemanticSearchController.php api/routes/api/admin-admin.php api/tests/Feature/SemanticSearchAdminTest.php web/src/types/semantic-search.ts web/src/lib/admin/semantic-search.ts web/src/lib/admin/index.ts "web/src/app/admin/(app)/settings/semantic-search-panel.tsx" "web/src/app/admin/(app)/settings/settings-form.tsx" web/mock-api.mjs
git commit -m "Semantic search: the console's status, test and re-index"
```

(Add the Server Actions file you created to the `git add`.)

---

### Task 9: Probe, audits, docs and the release

**Files:**
- Create: `web/scripts/probes/semantic-search.mjs`, `docs/semantic-search.md`, `manual/32-semantic-search.md`
- Modify: `CLAUDE.md`, `API.md`, `manual/00-README.md`, `web/src/lib/help-routes.ts`, `web/src/content/help.json` (regenerated), `VERSION.md`, `web/src/lib/version.ts`

- [ ] **Step 1: The probe** — `web/scripts/probes/semantic-search.mjs`, modelled on `web/scripts/probes/health.mjs` (sign-in through `signInAsStaff`, no credential in the file):
  1. If `GET /api/v1/admin/search/semantic` (through the signed-in console, or a direct API call with the session token the probe already holds) shows `enabled: false` **and** no OpenRouter key is configured, print "semantic search probe skipped: no OpenRouter key" and exit 0.
  2. Otherwise open `/search?q=network%20keeps%20dropping` and assert at least one result; open `/search?q=<an exact SKU from the seeded shop>` and assert that product is the first result in its group.
  The probe never changes settings.

- [ ] **Step 2: Verify** — dev DB: `cd api; php artisan migrate` and `php artisan db:seed --class=SettingsSeeder` (additive, authorised). Run:
  - `cd api; php artisan test` — the full suite once (background; wait for it).
  - `composer analyse` — "No errors".
  - `cd web; npx tsc --noEmit; npm run lint`.
  - `cd web; MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin/settings /search` and the same with `AUDIT_SCHEME=dark`; `MSYS_NO_PATHCONV=1 node scripts/mobile-audit.mjs /admin/settings` — each exits 0 (a throwaway administrator, created and deleted, as in Site health 12a; never the seeded admin).
  - `node scripts/probes/semantic-search.mjs` — passes or reports skipped.

- [ ] **Step 3: `docs/semantic-search.md`** — the module note, in the style of `docs/health.md`: off by default and inert; what is indexed and why FAQs ride on their owner; passages; hash-diffed re-embedding; the save listener and what it misses (an FAQ or answer block saved alone, `saveQuietly` writes — the nightly run catches them); the model change; the search file and its 20,000-passage limit; `match()`'s refusals (part numbers, short phrases, cap, timeout); the blend rules and `total`; the assistant's passages; the query cache per model; the floor (0.35, how to tune it with a real key: search a handful of known questions, read the scores in a tinker session through `Semantic::match`, set the floor just under the weakest good match); the cost model; the privacy line.

- [ ] **Step 4: CLAUDE.md** — a module block after "Site health":

```markdown
### Search by meaning — `docs/semantic-search.md`

The site search and the website assistant also find published content by meaning, through OpenRouter embeddings with the existing key (0.182.0). Off by default; off is exactly the old search.

- `App\Support\Search\Indexable` is the one list (fourteen kinds, each with its own published scope); FAQs and answer blocks are read into their **owner's** document, never indexed alone, so a draft owner's questions are never searchable.
- A record is split into ~250-word passages at its headings (`Passages`), each prefixed with its title; a passage whose text hash is unchanged keeps its vector, so an edit re-embeds only what changed. Unpublishing or deleting removes the passages at once; a model change marks them all waiting (vectors of two models cannot be compared); `technoware:index-search` (03:10, sliced) catches what a save missed.
- A search reads one packed file (`SearchFile`, private disk, rebuilt when stale at most once a minute) and computes cosine in PHP — `shortcut:` fine to ~20,000 passages. `Semantic::match()` is the one entry point and answers `[]` (words only) when off, with no key or nothing embedded, for a phrase under 3 characters or a part number, past the daily cap, or when OpenRouter takes over 1.5 s.
- `/search` keeps every word hit in its place; meaning-only records follow within the group's five, and `total` counts them. No passage text, score or vector reaches a visitor. The assistant adds up to four passages, inside the existing fence.
- Query vectors are cached 30 days per phrase **and model**; a cache miss counts against `semantic_search_daily_cap`.
```

  and add `  - Search by meaning — \`docs/semantic-search.md\`` to the module list in "Things that will bite you".

- [ ] **Step 5: API.md** — a section after "Site health": the three admin routes and shapes; that `/search` and the chat retrieval gain meaning results with no shape change; the settings group and its checks; the after-save behaviour (switching on and changing the model queue the index).

- [ ] **Step 6: The manual** — `manual/32-semantic-search.md` for the client's administrators, in the style of `manual/31-site-health.md`: what it does, what it costs (one small request per new phrase, the same phrase free for 30 days, the daily cap), switching it on, testing the model, re-indexing, what is sent to OpenRouter and what never is. Add its row to `manual/00-README.md`, a help route for the API keys tab if `help-routes.ts` maps settings tabs, then `cd web; npm run help`, `node scripts/build-help.mjs --check`, `node scripts/help-routes.check.mjs`.

- [ ] **Step 7: Version** — `web/src/lib/version.ts` → `"0.182.0"`; `VERSION.md`, newest first:

```markdown
## 0.182.0 — 2026-10-17

**Search by meaning** — the site search and the website assistant find pages by what they mean, not only by their words.

- Somebody searching "network keeps dropping" finds the Wi-Fi troubleshooting article and the managed-switches page, although neither uses those words. A part number or an exact title still comes first.
- The assistant answers more questions from the website, so fewer land on the unanswered list.
- Off until switched on, under Settings → API keys, with the OpenRouter key already there. Each new search phrase costs one small request; the same phrase is free for 30 days, and a daily cap keeps the cost bounded. If the service is slow or switched off, search works exactly as before.
```

- [ ] **Step 8: Commit**

```bash
git add web/scripts/probes/semantic-search.mjs docs/semantic-search.md manual/32-semantic-search.md manual/00-README.md CLAUDE.md API.md VERSION.md web/src/lib/version.ts web/src/lib/help-routes.ts web/src/content/help.json
git commit -m "0.182.0: Search by meaning"
```
