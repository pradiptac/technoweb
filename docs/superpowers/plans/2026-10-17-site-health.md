# Site health centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A console screen listing broken links, stale records and accessibility mistakes in what editors wrote — each opening the field that fixes it — with a site-wide score and trend for administrators.

**Architecture:** Findings are stored (`health_findings`) and kept current three ways: a recheck after every save of a record of a watched kind, a nightly sliced sweep, and a link checker that probes external (and unresolved internal) URLs on a schedule through `SafeHttp`. The admin API lists findings narrowed to the caller's roles; the Next console draws the list, the score and a settings screen through the house `SCREENS` mechanism.

**Tech Stack:** Laravel 13 / PHP 8.3 (Eloquent, queued jobs, scheduler, `Http::fake()`), Next 16 App Router with Server Actions, Tailwind v4, Playwright probes.

**Spec:** `docs/superpowers/specs/2026-10-17-site-health-design.md`

## Global Constraints

- Version **0.181.0**: `web/src/lib/version.ts` `APP_VERSION` and a `VERSION.md` entry in the same commit as the docs.
- Kinds checked: `Revisions::aliases()` minus `saved_section`, plus `certification` (stale only). `App\Support\Health\Kinds` is the only list.
- A finding stores a URL, a status, a library path and at most **120 characters** of link text — never page text.
- Outbound requests only through `App\Support\Net\SafeHttp`; a private host only when `HEALTH_ALLOW_PRIVATE=true` **and** `APP_ENV=local`. Internal links asked of the website go to `config('app.web_internal_url')` only — never `FRONTEND_URL`, which is the production domain on every machine.
- External link dead at **`fails >= 2`**; 401/403/429 are `unknown` and never count; next check 7 days after a pass, 1 day after a first failure, 7 days after that.
- Score = share of **published** checked records with no unignored error/warning finding, 0–100 rounded, **null** when nothing was checked. A notice never lowers it.
- Every finding route narrows by `Kinds::allows($user, $alias)`; a finding on a kind the caller does not own is a **404**. `meta.score` is absent for non-administrators.
- Nothing here writes to a checked record, sends mail, or fails a save.
- Tests authenticate with a real `Authorization: Bearer` header and `$this->app['auth']->forgetGuards()` between principals (see `tests/Feature/NotFoundMonitorTest.php::asStaff`). `phpunit.xml` already pins `technoweb_test`.
- PHP files are LF (`.gitattributes`); `web/` is CRLF. Write files with the Write tool, never Python `write_text`.
- Every Server Action form is `<Form action={…} state={state}>`; console dates go through `lib/dates.ts`; colours only through tokens.

## Review Focus

1. **A body with malformed or empty HTML** (`null`, `""`, `<p>`, an unclosed tag) — the checker must return no findings and never throw. Pinned in Task 3 (`test_empty_and_broken_bodies_yield_nothing`).
2. **A link to the record's own public address with a query string or trailing slash** (`/blog/post/?utm=x`) — must resolve as alive, not dead. Pinned in Task 4 (`test_query_strings_and_trailing_slashes_are_normalised`).
3. **A hidden builder section** holding a dead link — not on the page, so no finding. Pinned in Task 3 (`test_hidden_sections_are_skipped`).
4. **A record deleted while its recheck job is queued** — the job must exit quietly, not throw. Pinned in Task 6 (`test_a_recheck_of_a_deleted_record_does_nothing`).
5. **An ignored finding whose detail changes** (the dead URL is replaced by another dead URL) — the new one must appear un-ignored. Pinned in Task 5 (`test_a_changed_detail_is_a_new_finding`).

---

## File map

**API (new)**
- `api/database/migrations/2026_10_22_100000_create_health_tables.php` — four tables.
- `api/app/Models/HealthFinding.php`, `HealthLink.php`, `HealthSnapshot.php`.
- `api/app/Support/Health/Kinds.php` — which records, their role, label, admin path, published rule.
- `api/app/Support/Health/Content.php` — walks one record into its rich text, links, pictures, videos and anchors.
- `api/app/Support/Health/LinkTarget.php` — classifies an href and judges an internal path.
- `api/app/Support/Health/Checker.php` — runs every check on one record; returns findings.
- `api/app/Support/Health/Findings.php` — replaces a record's stored findings; check metadata and sentences.
- `api/app/Support/Health/LinkProber.php` — probes one `health_links` row.
- `api/app/Support/Health/Score.php` — the live score and the daily snapshot.
- `api/app/Support/Health/HealthSettings.php` — thresholds, the external switch, write checks.
- `api/app/Jobs/CheckRecordHealth.php`, `api/app/Jobs/SweepHealth.php`.
- `api/app/Console/Commands/HealthSweep.php`, `CheckLinks.php`.
- `api/app/Http/Controllers/Api/V1/Admin/HealthController.php`.
- `api/routes/api/admin-health.php`.
- Tests: `api/tests/Feature/HealthChecksTest.php`, `HealthLinksTest.php`, `HealthAccessTest.php`, `HealthSweepTest.php`.

**API (modified)**
- `api/app/Http/Controllers/Api/V1/Admin/SeoController.php` — add `entity()` and `publishedPaths()`.
- `api/app/Providers/AppServiceProvider.php` — save/delete listeners.
- `api/routes/api.php` — require the new route file.
- `api/routes/console.php` — schedule the two commands.
- `api/database/seeders/SettingsSeeder.php` — `health` group.
- `api/app/Http/Controllers/Api/V1/Admin/SettingController.php` — `HealthSettings::refusalFor` in the per-key chain.
- `api/.env.example` — `HEALTH_ALLOW_PRIVATE=false`, `WEB_INTERNAL_URL=` comment.

**Web (new)**
- `web/src/lib/admin/health.ts`, `web/src/types/health.ts`.
- `web/src/app/admin/(app)/health/page.tsx`, `actions.ts`, `row-buttons.tsx`.
- `web/src/app/admin/(app)/health/settings/page.tsx`.
- `web/scripts/probes/health.mjs`.

**Web (modified)**
- `web/src/lib/admin/index.ts`, `web/src/types/bulk.ts`, `web/src/components/admin/row-selection.tsx` (two bulk labels).
- `web/src/app/admin/(app)/nav-items.tsx` — one row.
- `web/src/app/admin/(app)/settings/settings-copy.ts` — field copy, group order, a `SCREENS` entry.
- `web/mock-api.mjs`, `web/scripts/audit.mjs`, `web/scripts/mobile-audit.mjs`.
- `web/src/lib/help-routes.ts`, `web/src/lib/version.ts`.

**Docs**: `docs/health.md`, `CLAUDE.md`, `API.md`, `VERSION.md`, `manual/31-site-health.md`.

---

### Task 1: Tables, models and settings

**Files:**
- Create: `api/database/migrations/2026_10_22_100000_create_health_tables.php`
- Create: `api/app/Models/HealthFinding.php`, `api/app/Models/HealthLink.php`, `api/app/Models/HealthSnapshot.php`
- Create: `api/app/Support/Health/HealthSettings.php`
- Modify: `api/database/seeders/SettingsSeeder.php` (after the `events` group rows)
- Modify: `api/app/Http/Controllers/Api/V1/Admin/SettingController.php:1296-1302`
- Test: `api/tests/Feature/HealthSweepTest.php` (first test only; the file grows in Task 7)

**Interfaces:**
- Produces: models `HealthFinding` (casts `detail` array, `subject_published` bool, dates), `HealthLink`, `HealthSnapshot` (`counts` array, `date` date); table `health_link_refs` (no model); `HealthSettings::staleMonths(string $alias): int`, `HealthSettings::externalOn(): bool`, `HealthSettings::refusalFor(string $key, mixed $value): ?string`, `HealthSettings::STALE_DEFAULTS` (alias ⇒ months).

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\HealthFinding;
use App\Support\Health\HealthSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthSweepTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_tables_and_settings_exist(): void
    {
        $this->seed(\Database\Seeders\SettingsSeeder::class);

        $finding = HealthFinding::create([
            'subject_type' => 'page', 'subject_id' => 1, 'subject_published' => true,
            'check' => 'stale', 'severity' => 'warning', 'field' => 'record',
            'detail' => ['months' => 20], 'fingerprint' => str_repeat('a', 40),
            'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);

        $this->assertSame(['months' => 20], $finding->fresh()->detail);
        $this->assertSame(18, HealthSettings::staleMonths('page'));
        $this->assertSame(0, HealthSettings::staleMonths('blog_post'));
        $this->assertTrue(HealthSettings::externalOn());
        $this->assertNull(HealthSettings::refusalFor('health_stale_page', '24'));
        $this->assertSame('A whole number of months, 0 to 60.', HealthSettings::refusalFor('health_stale_page', '61'));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd api; php artisan test --filter=HealthSweepTest`
Expected: FAIL — `Class "App\Models\HealthFinding" not found`.

- [ ] **Step 3: The migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** The site health centre (0.181.0, docs/health.md). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('health_findings', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            // Whether the record was published when checked: the score counts published records only.
            $table->boolean('subject_published')->default(false);
            $table->string('check', 40);
            $table->string('severity', 10);
            $table->string('field', 120);
            $table->json('detail')->nullable();
            $table->char('fingerprint', 40)->unique();
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->timestamp('ignored_at')->nullable();
            $table->foreignId('ignored_by')->nullable()->constrained('users')->nullOnDelete();
            $table->index(['subject_type', 'subject_id']);
            $table->index(['severity', 'ignored_at']);
        });

        Schema::create('health_links', function (Blueprint $table) {
            $table->id();
            $table->char('url_hash', 40)->unique();
            $table->text('url');
            $table->string('host', 255);
            $table->boolean('internal')->default(false);
            $table->unsignedSmallInteger('status')->nullable();
            $table->string('result', 10)->default('pending');
            $table->unsignedTinyInteger('fails')->default(0);
            $table->timestamp('checked_at')->nullable();
            $table->timestamp('next_check_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('health_link_refs', function (Blueprint $table) {
            $table->foreignId('health_link_id')->constrained('health_links')->cascadeOnDelete();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->unique(['health_link_id', 'subject_type', 'subject_id'], 'health_link_refs_unique');
            $table->index(['subject_type', 'subject_id']);
        });

        Schema::create('health_snapshots', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique();
            $table->unsignedTinyInteger('score')->nullable();
            $table->unsignedInteger('records_checked')->default(0);
            $table->json('counts');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('health_snapshots');
        Schema::dropIfExists('health_link_refs');
        Schema::dropIfExists('health_links');
        Schema::dropIfExists('health_findings');
    }
};
```

- [ ] **Step 4: The models**

`api/app/Models/HealthFinding.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One problem on one record (docs/health.md). Replaced by `Findings::replace()`, never edited by hand. */
class HealthFinding extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'subject_type', 'subject_id', 'subject_published', 'check', 'severity', 'field', 'detail',
        'fingerprint', 'first_seen_at', 'last_seen_at', 'ignored_at', 'ignored_by',
    ];

    protected function casts(): array
    {
        return [
            'detail' => 'array',
            'subject_published' => 'boolean',
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'ignored_at' => 'datetime',
        ];
    }
}
```

`api/app/Models/HealthLink.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One URL some record links to, and what it answered last (docs/health.md "Link checker"). */
class HealthLink extends Model
{
    public const DEAD_AFTER = 2;

    protected $fillable = ['url_hash', 'url', 'host', 'internal', 'status', 'result', 'fails', 'checked_at', 'next_check_at'];

    protected function casts(): array
    {
        return [
            'internal' => 'boolean',
            'checked_at' => 'datetime',
            'next_check_at' => 'datetime',
        ];
    }

    public static function hashOf(string $url): string
    {
        return sha1($url);
    }

    /** Dead: an external URL that failed twice in a row, or an internal one that failed once — our own site's 404 is decisive. */
    public function isDead(): bool
    {
        return $this->result === 'failed' && ($this->internal || $this->fails >= self::DEAD_AFTER);
    }
}
```

`api/app/Models/HealthSnapshot.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** The day's score and counts, for the trend (docs/health.md). */
class HealthSnapshot extends Model
{
    protected $fillable = ['date', 'score', 'records_checked', 'counts'];

    protected function casts(): array
    {
        return ['date' => 'date', 'counts' => 'array'];
    }
}
```

- [ ] **Step 5: `HealthSettings`**

```php
<?php

namespace App\Support\Health;

use App\Models\Setting;

/**
 * The private `health` group (docs/health.md): the external-link switch and
 * the stale threshold per kind, in months, 0 meaning never stale. The one
 * reader, with a per-field fallback, and the write check `SettingController`
 * calls.
 */
final class HealthSettings
{
    /** alias => months. Certifications, events and vacancies have rules of their own as well. */
    public const STALE_DEFAULTS = [
        'page' => 18, 'solution' => 18, 'service' => 18, 'product' => 18, 'store_product' => 18,
        'knowledge_article' => 12, 'landing_page' => 12, 'event' => 12,
        'blog_post' => 0, 'case_study' => 0, 'tender' => 0, 'job_opening' => 0, 'entry' => 0,
    ];

    public static function staleMonths(string $alias): int
    {
        $default = self::STALE_DEFAULTS[$alias] ?? 0;
        $value = Setting::get('health_stale_'.$alias);

        return is_numeric($value) && (int) $value >= 0 && (int) $value <= 60 ? (int) $value : $default;
    }

    public static function externalOn(): bool
    {
        // A boolean row: Setting::get answers true/false, or null when unseeded (on, the default).
        return Setting::get('health_external_links') !== false;
    }

    public static function refusalFor(string $key, mixed $value): ?string
    {
        if (! str_starts_with($key, 'health_stale_') || ! is_string($value) || trim($value) === '') {
            return null;
        }

        return ctype_digit(trim($value)) && (int) $value <= 60 ? null : 'A whole number of months, 0 to 60.';
    }
}
```

- [ ] **Step 6: Seed the group**

In `SettingsSeeder.php`, after the `events` rows, add (with a comment block in the file's style):

```php
            /*
             * The site health centre (0.181.0, docs/health.md): whether outside
             * links are checked, and how many months a published record may go
             * unedited before it is listed as stale — 0 never. Private.
             */
            ['group' => 'health', 'key' => 'health_external_links', 'value' => '1', 'type' => 'boolean'],
            ...array_map(
                fn (string $alias, int $months) => ['group' => 'health', 'key' => 'health_stale_'.$alias, 'value' => (string) $months, 'type' => 'string'],
                array_keys(HealthSettings::STALE_DEFAULTS),
                HealthSettings::STALE_DEFAULTS,
            ),
```

with `use App\Support\Health\HealthSettings;` at the top.

- [ ] **Step 7: Join the write check**

In `SettingController.php` at the per-key chain (line ~1296), append `?? HealthSettings::refusalFor($key, $row['value'] ?? null)` before the closing `;`, and import `App\Support\Health\HealthSettings`.

- [ ] **Step 8: Run the test**

Run: `cd api; php artisan test --filter=HealthSweepTest`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add api/database/migrations/2026_10_22_100000_create_health_tables.php api/app/Models/HealthFinding.php api/app/Models/HealthLink.php api/app/Models/HealthSnapshot.php api/app/Support/Health/HealthSettings.php api/database/seeders/SettingsSeeder.php api/app/Http/Controllers/Api/V1/Admin/SettingController.php api/tests/Feature/HealthSweepTest.php
git commit -m "Site health: tables, models and the health settings group"
```

---

### Task 2: `Kinds` — which records, whose, and where they are edited

**Files:**
- Create: `api/app/Support/Health/Kinds.php`
- Modify: `api/app/Http/Controllers/Api/V1/Admin/SeoController.php` (two static methods beside `locate()`)
- Test: `api/tests/Feature/HealthChecksTest.php` (created here; grows in Tasks 3–5)

**Interfaces:**
- Consumes: `Revisions::aliases()`, `Revisions::roleFor()`, `Revisions::bodyColumns()`, `Relation::getMorphedModel()`.
- Produces:
  - `Kinds::aliases(): list<string>`
  - `Kinds::classFor(string $alias): ?string`
  - `Kinds::roleFor(string $alias): ?string`
  - `Kinds::allows(User $user, string $alias): bool`
  - `Kinds::aliasesFor(User $user): list<string>`
  - `Kinds::label(string $alias): string`
  - `Kinds::title(Model $m): string`
  - `Kinds::adminPath(Model $m): string`
  - `Kinds::isPublished(Model $m): bool`
  - `Kinds::bodyColumns(string $alias): list<string>`
  - `SeoController::entity(string $type): ?array{label: string, admin_path: string}`
  - `SeoController::publishedPaths(): array<string, true>` (normalised public paths of every published HasSeo record)

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Role;
use App\Models\User;
use App\Support\Health\Kinds;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthChecksTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role): User
    {
        $user = User::firstOrCreate(['email' => $role->value.'-health@example.test'],
            ['name' => 'Staff', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user;
    }

    private function post(array $attributes = []): BlogPost
    {
        return BlogPost::create($attributes + [
            'title' => 'A post', 'slug' => 'a-post', 'excerpt' => 'x', 'body' => '<p>Words.</p>',
            'author_id' => $this->staff(RoleEnum::ContentManager)->id, 'status' => 'published', 'published_at' => now(),
        ]);
    }

    public function test_kinds_lists_the_revision_kinds_without_the_library_plus_certifications(): void
    {
        $aliases = Kinds::aliases();

        $this->assertContains('blog_post', $aliases);
        $this->assertContains('store_product', $aliases);
        $this->assertContains('certification', $aliases);
        $this->assertNotContains('saved_section', $aliases);
        $this->assertSame(\App\Models\BlogPost::class, Kinds::classFor('blog_post'));
        $this->assertSame('store_manager', Kinds::roleFor('store_product'));
        $this->assertSame('content_manager', Kinds::roleFor('certification'));
    }

    public function test_a_role_sees_only_its_own_kinds(): void
    {
        $store = $this->staff(RoleEnum::StoreManager);

        $this->assertSame(['store_product'], Kinds::aliasesFor($store));
        $this->assertFalse(Kinds::allows($store, 'page'));
    }

    public function test_title_admin_path_and_published(): void
    {
        $post = $this->post();

        $this->assertSame('A post', Kinds::title($post));
        $this->assertSame('/admin/blog/'.$post->id, Kinds::adminPath($post));
        $this->assertTrue(Kinds::isPublished($post));
        $this->assertFalse(Kinds::isPublished($this->post(['slug' => 'draft', 'status' => 'draft'])));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd api; php artisan test --filter=HealthChecksTest`
Expected: FAIL — `Class "App\Support\Health\Kinds" not found`.

- [ ] **Step 3: Add the two `SeoController` methods**

Beside `locate()`:

```php
    /**
     * The overview's label and console segment for one record type, for the
     * health centre (docs/health.md) — read from `ENTITIES` so the two
     * screens cannot disagree about where a record is edited.
     *
     * @return array{label: string, admin_path: string}|null
     */
    public static function entity(string $type): ?array
    {
        if (! isset(self::ENTITIES[$type])) {
            return null;
        }

        return ['label' => self::ENTITIES[$type][3], 'admin_path' => self::ENTITIES[$type][2]];
    }

    /**
     * Every published indexable record's public path, normalised (no
     * trailing slash), as a set. What the health centre judges an internal
     * link against before it asks the website.
     *
     * @return array<string, true>
     */
    public static function publishedPaths(): array
    {
        $paths = [];

        foreach (self::ENTITIES as [$class]) {
            foreach ($class::query()->get() as $record) {
                if (\App\Support\Health\Kinds::isPublished($record)) {
                    $paths[rtrim($record->publicPath(), '/') ?: '/'] = true;
                }
            }
        }

        return $paths;
    }
```

- [ ] **Step 4: `Kinds`**

```php
<?php

namespace App\Support\Health;

use App\Http\Controllers\Api\V1\Admin\SeoController;
use App\Models\User;
use App\Support\Revisions;
use BackedEnum;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * The records the health centre checks, and the one list of them
 * (docs/health.md). Built from `Revisions` — the same kinds and owning roles
 * share links and page history already use — less the section library, which
 * is not a page, plus certifications, which are checked for expiry only.
 */
final class Kinds
{
    /** alias => [owning role, label, console segment] for the kinds `Revisions` does not hold. */
    private const EXTRA = [
        'certification' => ['content_manager', 'Certifications', 'certifications'],
    ];

    private const NOT_CHECKED = ['saved_section'];

    /** @return list<string> */
    public static function aliases(): array
    {
        return [...array_values(array_diff(Revisions::aliases(), self::NOT_CHECKED)), ...array_keys(self::EXTRA)];
    }

    /** @return class-string<Model>|null */
    public static function classFor(string $alias): ?string
    {
        return in_array($alias, self::aliases(), true) ? Relation::getMorphedModel($alias) : null;
    }

    public static function roleFor(string $alias): ?string
    {
        return self::EXTRA[$alias][0] ?? Revisions::roleFor($alias);
    }

    /** `EnsureUserHasRole`'s rule: the owning role, or an administrator. */
    public static function allows(User $user, string $alias): bool
    {
        $role = self::roleFor($alias);

        return $role !== null && ($user->isAdmin() || $user->hasRole($role));
    }

    /** @return list<string> */
    public static function aliasesFor(User $user): array
    {
        return array_values(array_filter(self::aliases(), fn (string $a) => self::allows($user, $a)));
    }

    public static function label(string $alias): string
    {
        return self::EXTRA[$alias][1] ?? SeoController::entity($alias)['label'] ?? $alias;
    }

    public static function title(Model $model): string
    {
        return (string) ($model->getAttribute('title') ?? $model->getAttribute('name') ?? $model->getAttribute('reference') ?? '#'.$model->getKey());
    }

    public static function adminPath(Model $model): string
    {
        if (method_exists($model, 'adminPath')) {
            return $model->adminPath();
        }

        $alias = $model->getMorphClass();
        $segment = self::EXTRA[$alias][2] ?? SeoController::entity($alias)['admin_path'] ?? $alias;

        return "/admin/{$segment}/{$model->getKey()}";
    }

    /** IndexNow's rule: no status column, or a status of published. */
    public static function isPublished(Model $model): bool
    {
        $status = $model->getAttribute('status');

        if ($status === null) {
            return true;
        }

        return ($status instanceof BackedEnum ? $status->value : (string) $status) === 'published';
    }

    /** @return list<string> */
    public static function bodyColumns(string $alias): array
    {
        return Revisions::bodyColumns($alias);
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd api; php artisan test --filter=HealthChecksTest`
Expected: PASS (3 tests). If `adminPath` for a blog post is not `/admin/blog/{id}`, read `SeoController::ENTITIES['blog_post'][2]` — it is `blog`.

- [ ] **Step 6: Commit**

```bash
git add api/app/Support/Health/Kinds.php api/app/Http/Controllers/Api/V1/Admin/SeoController.php api/tests/Feature/HealthChecksTest.php
git commit -m "Site health: the list of checked kinds"
```

---

### Task 3: `Content` — what a record says, walked

**Files:**
- Create: `api/app/Support/Health/Content.php`
- Test: `api/tests/Feature/HealthChecksTest.php` (append)

**Interfaces:**
- Consumes: `Kinds::bodyColumns()`.
- Produces: `Content::of(Model $m): Content` with readonly arrays
  - `rich`: `list<array{field: string, html: string}>`
  - `links`: `list<array{field: string, href: string, text: string}>` — from rich text **and** every `href` key in visible sections
  - `pictures`: `list<array{field: string, path: string}>` — cover columns, `images`, and every `*_path` key in sections whose name is `image_path|photo_path|before_path|after_path|poster_path`
  - `bodyImages`: `list<array{field: string, alt: ?string}>` — `<img>` in rich text
  - `videos`: `list<array{field: string, titled: bool}>`
  - `anchors`: `list<string>` — section `style.anchor` values and every `id` in rich text
  - `headings`: `list<array{field: string, levels: list<int>}>`
  - `tablesWithoutHeader`: `list<string>` (fields)
  - `emptyLinks`: `list<string>` (fields)

- [ ] **Step 1: Write the failing tests** (append to `HealthChecksTest`)

```php
    public function test_content_walks_the_body_and_visible_sections(): void
    {
        $post = $this->post([
            'body' => '<h2 id="intro">Intro</h2><h4>Skipped</h4><p><a href="/solutions/x">read more</a> <a href="https://vendor.example/sheet.pdf">Datasheet</a> <a href="/y"></a></p><img src="/storage/a.png"><table><tr><td>1</td></tr></table>',
            'body_layout' => 'sections',
            'blocks' => [
                ['id' => '11111111-1111-4111-8111-111111111111', 'type' => 'cta', 'hidden' => false, 'style' => ['anchor' => 'contact'],
                    'data' => ['heading' => 'Talk', 'primary' => ['label' => 'Go', 'href' => '/contact']]],
                ['id' => '22222222-2222-4222-8222-222222222222', 'type' => 'video', 'hidden' => false,
                    'data' => ['source' => 'youtube', 'youtube' => 'abcdefghijk']],
            ],
        ]);

        $c = \App\Support\Health\Content::of($post);

        $this->assertSame(['/solutions/x', 'https://vendor.example/sheet.pdf', '/y', '/contact'], array_column($c->links, 'href'));
        $this->assertSame('blocks.0.data.primary.href', $c->links[3]['field']);
        $this->assertSame([['field' => 'body', 'alt' => null]], $c->bodyImages);
        $this->assertSame([['field' => 'blocks.1.data', 'titled' => false]], $c->videos);
        $this->assertSame(['contact', 'intro'], $c->anchors);
        $this->assertSame([['field' => 'body', 'levels' => [2, 4]]], $c->headings);
        $this->assertSame(['body'], $c->tablesWithoutHeader);
        $this->assertSame(['body'], $c->emptyLinks);
    }

    public function test_hidden_sections_are_skipped(): void
    {
        $post = $this->post(['body_layout' => 'sections', 'blocks' => [
            ['id' => '33333333-3333-4333-8333-333333333333', 'type' => 'cta', 'hidden' => true,
                'data' => ['heading' => 'x', 'primary' => ['label' => 'Go', 'href' => '/nowhere']]],
        ]]);

        $this->assertSame([], \App\Support\Health\Content::of($post)->links);
    }

    public function test_empty_and_broken_bodies_yield_nothing(): void
    {
        foreach ([null, '', '<p>', '<div><a href="/x">unclosed'] as $i => $body) {
            $c = \App\Support\Health\Content::of($this->post(['slug' => 'b'.$i, 'body' => $body]));
            $this->assertIsArray($c->links);
        }

        $this->assertSame([['field' => 'body', 'href' => '/x', 'text' => 'unclosed']], \App\Support\Health\Content::of(BlogPost::where('slug', 'b3')->sole())->links);
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; php artisan test --filter=HealthChecksTest`
Expected: FAIL — `Class "App\Support\Health\Content" not found`.

- [ ] **Step 3: Implement `Content`**

```php
<?php

namespace App\Support\Health;

use DOMDocument;
use DOMElement;
use DOMXPath;
use Illuminate\Database\Eloquent\Model;

/**
 * One record's words, links and pictures, read the way the page draws them
 * (docs/health.md). Rich text is parsed with DOMDocument over the stored —
 * already sanitised — HTML; sections are walked generically, so a section
 * type added later is covered by its key names (`href`, `*_path`, `body`,
 * `html`) without this file changing. Hidden sections are skipped: they are
 * not on the page. A custom-code section's `html` is the developer's, not an
 * editor's, and is not read.
 */
final class Content
{
    private const COVER_COLUMNS = ['cover_image_path', 'hero_image_path', 'image_path'];

    private const PICTURE_KEYS = ['image_path', 'photo_path', 'before_path', 'after_path', 'poster_path'];

    private const RICH_KEYS = ['body', 'html'];

    /** @var list<array{field: string, html: string}> */
    public array $rich = [];

    /** @var list<array{field: string, href: string, text: string}> */
    public array $links = [];

    /** @var list<array{field: string, path: string}> */
    public array $pictures = [];

    /** @var list<array{field: string, alt: ?string}> */
    public array $bodyImages = [];

    /** @var list<array{field: string, titled: bool}> */
    public array $videos = [];

    /** @var list<string> */
    public array $anchors = [];

    /** @var list<array{field: string, levels: list<int>}> */
    public array $headings = [];

    /** @var list<string> */
    public array $tablesWithoutHeader = [];

    /** @var list<string> */
    public array $emptyLinks = [];

    public static function of(Model $model): self
    {
        $c = new self;

        foreach (Kinds::bodyColumns($model->getMorphClass()) as $column) {
            $c->readRich($column, $model->getAttribute($column));
        }

        foreach (self::COVER_COLUMNS as $column) {
            if (is_string($path = $model->getAttribute($column)) && $path !== '') {
                $c->pictures[] = ['field' => $column, 'path' => $path];
            }
        }

        foreach ((array) ($model->getAttribute('images') ?? []) as $i => $path) {
            if (is_string($path) && $path !== '') {
                $c->pictures[] = ['field' => "images.{$i}", 'path' => $path];
            }
        }

        $blocks = $model->getAttribute('blocks');
        $usesSections = $model->getMorphClass() === 'page'
            ? $model->getAttribute('template') === 'builder'
            : $model->getAttribute('body_layout') === 'sections';

        if ($usesSections && is_array($blocks)) {
            foreach ($blocks as $i => $block) {
                if (! is_array($block) || ! empty($block['hidden'])) {
                    continue;
                }
                if (is_string($block['style']['anchor'] ?? null)) {
                    $c->anchors[] = $block['style']['anchor'];
                }
                $c->walk((array) ($block['data'] ?? []), "blocks.{$i}.data", (string) ($block['type'] ?? ''));
            }
        }

        sort($c->anchors);

        return $c;
    }

    /** @param  array<mixed>  $node */
    private function walk(array $node, string $at, string $type): void
    {
        if ($type === 'video' || ($node['type'] ?? null) === 'video') {
            $this->videos[] = ['field' => $at, 'titled' => filled($node['heading'] ?? null) || filled($node['caption'] ?? null)];
        }

        foreach ($node as $key => $value) {
            $path = "{$at}.{$key}";

            if (is_array($value)) {
                $this->walk($value, $path, '');
            } elseif (! is_string($value) || $value === '') {
                continue;
            } elseif ($key === 'href') {
                $this->links[] = ['field' => $path, 'href' => $value, 'text' => (string) ($node['label'] ?? $node['link_label'] ?? '')];
            } elseif (in_array($key, self::PICTURE_KEYS, true)) {
                $this->pictures[] = ['field' => $path, 'path' => $value];
            } elseif (in_array($key, self::RICH_KEYS, true) && $type !== 'custom_code') {
                $this->readRich($path, $value);
            }
        }
    }

    private function readRich(string $field, mixed $html): void
    {
        if (! is_string($html) || trim($html) === '') {
            return;
        }

        $this->rich[] = ['field' => $field, 'html' => $html];

        $doc = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="utf-8"?><div>'.$html.'</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        $xpath = new DOMXPath($doc);

        foreach ($xpath->query('//a[@href]') as $a) {
            /** @var DOMElement $a */
            $text = trim(preg_replace('/\s+/u', ' ', $a->textContent) ?? '');
            $hasImageAlt = $xpath->query('.//img[normalize-space(@alt) != ""]', $a)->length > 0;
            if ($text === '' && ! $hasImageAlt && trim($a->getAttribute('aria-label')) === '') {
                $this->emptyLinks[] = $field;
            }
            $this->links[] = ['field' => $field, 'href' => $a->getAttribute('href'), 'text' => $text];
        }

        foreach ($xpath->query('//img') as $img) {
            /** @var DOMElement $img */
            $alt = trim($img->getAttribute('alt'));
            $this->bodyImages[] = ['field' => $field, 'alt' => $alt === '' ? null : $alt];
        }

        foreach ($xpath->query('//*[@id]') as $el) {
            /** @var DOMElement $el */
            $this->anchors[] = $el->getAttribute('id');
        }

        $levels = [];
        foreach ($xpath->query('//h2|//h3|//h4|//h5|//h6') as $h) {
            $levels[] = (int) substr($h->nodeName, 1);
        }
        if ($levels !== []) {
            $this->headings[] = ['field' => $field, 'levels' => $levels];
        }

        foreach ($xpath->query('//table') as $table) {
            if ($xpath->query('.//th', $table)->length === 0) {
                $this->tablesWithoutHeader[] = $field;
            }
        }

        $this->emptyLinks = array_values(array_unique($this->emptyLinks));
        $this->tablesWithoutHeader = array_values(array_unique($this->tablesWithoutHeader));
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd api; php artisan test --filter=HealthChecksTest`
Expected: PASS. If `body_layout`/`blocks` are not fillable on `BlogPost`, they are (0.130.0); if a cast reorders keys, compare with `assertEqualsCanonicalizing` only where order is not the contract (links order **is** the contract: body first, then sections).

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Health/Content.php api/tests/Feature/HealthChecksTest.php
git commit -m "Site health: walk a record's body and sections"
```

---

### Task 4: `LinkTarget` — internal or external, alive or dead

**Files:**
- Create: `api/app/Support/Health/LinkTarget.php`
- Test: `api/tests/Feature/HealthChecksTest.php` (append)

**Interfaces:**
- Consumes: `SeoController::publishedPaths()`, `SiteSection::keys()`/`path()`, `App\Models\Redirect`, `Storage::disk('public')`.
- Produces:
  - `LinkTarget::classify(string $href): ?array{kind: 'internal'|'external'|'anchor', value: string}` — `value` is a normalised path, a URL, or an anchor id; null for `mailto:`, `tel:`, `javascript:`, `#`, blank.
  - `LinkTarget::judge(string $path): array{state: 'ok'|'dead'|'redirect'|'ask', to?: string}`
  - `LinkTarget::forget(): void` — drops the memoised path set (the cache key `health:published-paths`).

- [ ] **Step 1: Write the failing tests**

```php
    public function test_links_are_classified(): void
    {
        config(['app.frontend_url' => 'https://www.technoware.in']);

        $this->assertSame(['kind' => 'internal', 'value' => '/about'], \App\Support\Health\LinkTarget::classify('https://technoware.in/about/'));
        $this->assertSame(['kind' => 'internal', 'value' => '/about'], \App\Support\Health\LinkTarget::classify('/about?utm=x#team'));
        $this->assertSame(['kind' => 'external', 'value' => 'https://vendor.example/a'], \App\Support\Health\LinkTarget::classify('https://vendor.example/a'));
        $this->assertSame(['kind' => 'anchor', 'value' => 'team'], \App\Support\Health\LinkTarget::classify('#team'));
        foreach (['mailto:a@b.in', 'tel:+91', '#', '', 'javascript:x'] as $skip) {
            $this->assertNull(\App\Support\Health\LinkTarget::classify($skip));
        }
    }

    public function test_query_strings_and_trailing_slashes_are_normalised(): void
    {
        $post = $this->post();

        $this->assertSame(['state' => 'ok'], \App\Support\Health\LinkTarget::judge(\App\Support\Health\LinkTarget::classify($post->publicPath().'/?utm=x')['value']));
    }

    public function test_an_internal_path_is_judged_cheapest_first(): void
    {
        \App\Models\Redirect::create(['from_path' => '/old-page', 'to_path' => '/about', 'status_code' => 301, 'is_active' => true, 'created_automatically' => false]);
        \Illuminate\Support\Facades\Storage::fake('public')->put('files/a.pdf', 'x');

        $this->assertSame(['state' => 'ok'], \App\Support\Health\LinkTarget::judge('/blog'));
        $this->assertSame(['state' => 'redirect', 'to' => '/about'], \App\Support\Health\LinkTarget::judge('/old-page'));
        $this->assertSame(['state' => 'ok'], \App\Support\Health\LinkTarget::judge('/storage/files/a.pdf'));
        $this->assertSame(['state' => 'dead'], \App\Support\Health\LinkTarget::judge('/storage/files/missing.pdf'));
        $this->assertSame(['state' => 'ask'], \App\Support\Health\LinkTarget::judge('/some/frontend/route'));
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; php artisan test --filter=HealthChecksTest`
Expected: FAIL — class not found.

- [ ] **Step 3: Implement**

```php
<?php

namespace App\Support\Health;

use App\Http\Controllers\Api\V1\Admin\SeoController;
use App\Models\Redirect;
use App\Support\SiteSection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

/**
 * What an href points at, and — for a path on this site — whether anything
 * is there, cheapest answer first (docs/health.md "How an internal link is
 * judged"): a published record's own address, an index page, an active
 * redirect, a file under /storage/; anything else is `ask`, which the link
 * checker answers by asking the website.
 */
final class LinkTarget
{
    private const CACHE_KEY = 'health:published-paths';

    /** @return array{kind: 'internal'|'external'|'anchor', value: string}|null */
    public static function classify(string $href): ?array
    {
        $href = trim($href);

        if ($href === '' || $href === '#' || preg_match('/^(mailto|tel|javascript|data):/i', $href)) {
            return null;
        }

        if (str_starts_with($href, '#')) {
            return ['kind' => 'anchor', 'value' => substr($href, 1)];
        }

        if (preg_match('#^https?://#i', $href)) {
            $host = strtolower((string) parse_url($href, PHP_URL_HOST));

            if (self::bare($host) !== self::bare(strtolower((string) parse_url((string) config('app.frontend_url'), PHP_URL_HOST)))) {
                return ['kind' => 'external', 'value' => $href];
            }

            $href = (string) (parse_url($href, PHP_URL_PATH) ?: '/');
        }

        if (! str_starts_with($href, '/')) {
            return null;
        }

        $path = (string) strtok($href, '?#');

        return ['kind' => 'internal', 'value' => rtrim($path, '/') ?: '/'];
    }

    /** @return array{state: 'ok'|'dead'|'redirect'|'ask', to?: string} */
    public static function judge(string $path): array
    {
        if (isset(self::paths()[$path])) {
            return ['state' => 'ok'];
        }

        foreach (SiteSection::keys() as $key) {
            if (rtrim((string) SiteSection::path($key), '/') === $path || ($path === '/' && SiteSection::path($key) === '/')) {
                return ['state' => 'ok'];
            }
        }

        $to = Redirect::query()->where('is_active', true)->where('from_path', $path)->value('to_path');
        if ($to !== null) {
            return ['state' => 'redirect', 'to' => (string) $to];
        }

        if (str_starts_with($path, '/storage/')) {
            return ['state' => Storage::disk('public')->exists(substr($path, strlen('/storage/'))) ? 'ok' : 'dead'];
        }

        return ['state' => 'ask'];
    }

    public static function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /** @return array<string, true> */
    private static function paths(): array
    {
        // shortcut: the whole set is rebuilt after any save of a checked kind; fine to a few thousand records, a per-kind index past that.
        return Cache::remember(self::CACHE_KEY, 600, fn () => SeoController::publishedPaths());
    }

    private static function bare(string $host): string
    {
        return str_starts_with($host, 'www.') ? substr($host, 4) : $host;
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd api; php artisan test --filter=HealthChecksTest`
Expected: PASS. If `/blog` is not a `SiteSection` path, use whichever key `SiteSection::keys()` maps to `/blog` — read `api/app/Support/SiteSection.php`.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Health/LinkTarget.php api/tests/Feature/HealthChecksTest.php
git commit -m "Site health: classify and judge links"
```

---

### Task 5: `Checker` and `Findings` — every check, and storing the answer

**Files:**
- Create: `api/app/Support/Health/Checker.php`, `api/app/Support/Health/Findings.php`
- Test: `api/tests/Feature/HealthChecksTest.php` (append)

**Interfaces:**
- Consumes: `Content::of()`, `LinkTarget::classify()/judge()`, `HealthLink::hashOf()/isDead()`, `HealthSettings::staleMonths()/externalOn()`, `MediaMeta::alt()`, `Kinds::isPublished()`.
- Produces:
  - `Checker::run(Model $m): list<array{check: string, severity: string, field: string, detail: array}>` — also upserts `health_links` rows and replaces the record's `health_link_refs`.
  - `Findings::replace(Model $m, array $findings): void`
  - `Findings::forget(string $alias, int $id): void`
  - `Findings::CHECKS`: check ⇒ `[group, severity]`
  - `Findings::sentence(HealthFinding $f): string`
  - `Findings::fieldLabel(string $field): string`
  - `Findings::tabFor(string $field): ?string` (`'sections'` for `blocks.*`, else null)

- [ ] **Step 1: Write the failing tests**

```php
    private function checks(\Illuminate\Database\Eloquent\Model $m): array
    {
        return array_column(\App\Support\Health\Checker::run($m), 'check');
    }

    public function test_each_link_check(): void
    {
        $post = $this->post(['body' => '<p><a href="/nowhere/at-all">Somewhere</a> <a href="#missing">Jump</a> <a href="/old">Old</a></p>']);
        \App\Models\Redirect::create(['from_path' => '/old', 'to_path' => '/about', 'status_code' => 301, 'is_active' => true, 'created_automatically' => false]);
        \App\Models\HealthLink::create(['url_hash' => \App\Models\HealthLink::hashOf('/nowhere/at-all'), 'url' => '/nowhere/at-all', 'host' => 'internal', 'internal' => true, 'result' => 'failed', 'fails' => 1]);

        $this->assertEqualsCanonicalizing(['link_internal_dead', 'link_anchor_missing', 'link_redirected'], $this->checks($post));
    }

    public function test_an_external_link_is_dead_only_after_two_failures(): void
    {
        $post = $this->post(['body' => '<p><a href="https://vendor.example/sheet.pdf">Datasheet</a></p>']);
        $this->assertSame([], $this->checks($post));
        $link = \App\Models\HealthLink::where('url_hash', \App\Models\HealthLink::hashOf('https://vendor.example/sheet.pdf'))->sole();
        $this->assertSame('pending', $link->result);

        $link->update(['result' => 'failed', 'fails' => 1]);
        $this->assertSame([], $this->checks($post));

        $link->update(['fails' => 2, 'status' => 404]);
        $this->assertSame(['link_external_dead'], $this->checks($post));
    }

    public function test_stale_and_the_dated_checks(): void
    {
        $page = \App\Models\Page::create(['title' => 'Old page', 'slug' => 'old-page', 'body' => '<p>x</p>', 'status' => 'published']);
        \App\Models\Page::whereKey($page->id)->toBase()->update(['updated_at' => now()->subMonths(19)]);
        $this->assertSame(['stale'], $this->checks($page->fresh()));

        $cert = \App\Models\Certification::create(['name' => 'ISO', 'issuer' => 'BSI', 'status' => 'published', 'valid_until' => now()->subDay()]);
        $this->assertSame(['certification_expired'], $this->checks($cert));
    }

    public function test_each_accessibility_check(): void
    {
        $post = $this->post(['cover_image_path' => 'media/no-alt.png', 'body' => '<h2>A</h2><h4>B</h4><p><a href="/blog">click here</a><a href="/blog"></a></p><img src="/storage/x.png"><table><tr><td>1</td></tr></table>']);

        $this->assertEqualsCanonicalizing(
            ['image_no_alt', 'image_no_alt', 'heading_jump', 'link_text_vague', 'link_empty', 'table_no_header'],
            $this->checks($post),
        );
    }

    public function test_findings_are_replaced_keeping_first_seen_and_ignore(): void
    {
        $post = $this->post(['body' => '<p><a href="/blog">click here</a></p>']);
        \App\Support\Health\Findings::replace($post, \App\Support\Health\Checker::run($post));
        $row = \App\Models\HealthFinding::sole();
        $row->update(['ignored_at' => now(), 'first_seen_at' => now()->subWeek()]);

        \App\Support\Health\Findings::replace($post, \App\Support\Health\Checker::run($post));
        $again = \App\Models\HealthFinding::sole();
        $this->assertNotNull($again->ignored_at);
        $this->assertTrue($again->first_seen_at->lt(now()->subDays(6)));

        $post->update(['body' => '<p><a href="/blog">The blog</a></p>']);
        \App\Support\Health\Findings::replace($post, \App\Support\Health\Checker::run($post));
        $this->assertSame(0, \App\Models\HealthFinding::count());
    }

    public function test_a_changed_detail_is_a_new_finding(): void
    {
        $post = $this->post(['body' => '<p><a href="/blog">click here</a></p>']);
        \App\Support\Health\Findings::replace($post, \App\Support\Health\Checker::run($post));
        \App\Models\HealthFinding::query()->update(['ignored_at' => now()]);

        $post->update(['body' => '<p><a href="/blog">read more</a></p>']);
        \App\Support\Health\Findings::replace($post, \App\Support\Health\Checker::run($post));

        $this->assertNull(\App\Models\HealthFinding::sole()->ignored_at);
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; php artisan test --filter=HealthChecksTest`
Expected: FAIL — `Checker` not found.

- [ ] **Step 3: Implement `Findings`**

```php
<?php

namespace App\Support\Health;

use App\Models\HealthFinding;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Storing one record's findings, and the words for them (docs/health.md).
 * A recheck replaces the set: a finding that came back keeps when it was
 * first seen and whether it was ignored; a finding that did not is deleted —
 * there is no "fixed" flag. The fingerprint includes the detail, so an
 * ignored finding whose URL or text changed is a new, un-ignored one.
 */
final class Findings
{
    /** check => [group, severity] */
    public const CHECKS = [
        'link_internal_dead' => ['links', 'error'],
        'link_external_dead' => ['links', 'error'],
        'link_redirected' => ['links', 'notice'],
        'link_anchor_missing' => ['links', 'warning'],
        'stale' => ['stale', 'warning'],
        'event_past_featured' => ['stale', 'warning'],
        'vacancy_closed' => ['stale', 'warning'],
        'certification_expired' => ['stale', 'warning'],
        'image_no_alt' => ['accessibility', 'error'],
        'heading_jump' => ['accessibility', 'warning'],
        'link_text_vague' => ['accessibility', 'warning'],
        'link_empty' => ['accessibility', 'warning'],
        'table_no_header' => ['accessibility', 'warning'],
        'video_no_title' => ['accessibility', 'warning'],
    ];

    public const GROUPS = ['links' => 'Links', 'stale' => 'Out of date', 'accessibility' => 'Accessibility'];

    public const SEVERITIES = ['error' => 'Error', 'warning' => 'Warning', 'notice' => 'Notice'];

    /** @param  list<array{check: string, severity: string, field: string, detail: array}>  $findings */
    public static function replace(Model $model, array $findings): void
    {
        $alias = $model->getMorphClass();
        $id = (int) $model->getKey();
        $published = Kinds::isPublished($model);
        $now = now();

        DB::transaction(function () use ($findings, $alias, $id, $published, $now) {
            $keep = [];

            foreach ($findings as $f) {
                $detail = $f['detail'];
                ksort($detail);
                $fingerprint = sha1(implode('|', [$alias, $id, $f['check'], $f['field'], json_encode($detail)]));
                $keep[] = $fingerprint;

                $row = HealthFinding::firstOrNew(['fingerprint' => $fingerprint]);
                $row->fill([
                    'subject_type' => $alias, 'subject_id' => $id, 'subject_published' => $published,
                    'check' => $f['check'], 'severity' => $f['severity'], 'field' => $f['field'],
                    'detail' => $detail, 'last_seen_at' => $now,
                ]);
                $row->first_seen_at ??= $now;
                $row->save();
            }

            HealthFinding::query()->where('subject_type', $alias)->where('subject_id', $id)
                ->when($keep !== [], fn ($q) => $q->whereNotIn('fingerprint', $keep))
                ->delete();
        });
    }

    public static function forget(string $alias, int $id): void
    {
        HealthFinding::query()->where('subject_type', $alias)->where('subject_id', $id)->delete();
        DB::table('health_link_refs')->where('subject_type', $alias)->where('subject_id', $id)->delete();
    }

    /** The one sentence a row says. Every word is the API's. */
    public static function sentence(HealthFinding $f): string
    {
        $d = $f->detail ?? [];

        return match ($f->check) {
            'link_internal_dead' => "Links to {$d['url']}, which does not exist.",
            'link_external_dead' => "Links to {$d['url']}, which did not answer twice a week apart".(isset($d['status']) ? " ({$d['status']})." : '.'),
            'link_redirected' => "Links to {$d['url']}, which now redirects to {$d['to']}. Link to {$d['to']} directly.",
            'link_anchor_missing' => "Links to #{$d['anchor']}, which is not on this page.",
            'stale' => "Not edited for {$d['months']} months.",
            'event_past_featured' => 'This event has taken place and is still featured.',
            'vacancy_closed' => 'This vacancy is past its closing date and still published.',
            'certification_expired' => 'This certification has expired and is still published.',
            'image_no_alt' => isset($d['path']) ? "The picture {$d['path']} has no description for screen readers." : 'A picture in the text has no description for screen readers.',
            'heading_jump' => "A heading jumps from level {$d['from']} to level {$d['to']}.",
            'link_text_vague' => "A link says only \"{$d['text']}\". Say where it goes.",
            'link_empty' => 'A link has no words, so a screen reader cannot say where it goes.',
            'table_no_header' => 'A table has no header row.',
            'video_no_title' => 'A video has no heading or caption.',
            default => $f->check,
        };
    }

    public static function fieldLabel(string $field): string
    {
        if (preg_match('/^blocks\.(\d+)\./', $field, $m)) {
            return 'Section '.((int) $m[1] + 1);
        }

        return match (true) {
            $field === 'record' => 'The record',
            str_starts_with($field, 'images.') => 'Gallery picture',
            str_ends_with($field, 'image_path') => 'Cover picture',
            default => ucfirst(str_replace('_', ' ', $field)),
        };
    }

    /** The edit form's tab to open: `sections` for anything in the builder, else the form's first. */
    public static function tabFor(string $field): ?string
    {
        return str_starts_with($field, 'blocks.') ? 'sections' : null;
    }
}
```

- [ ] **Step 4: Implement `Checker`**

```php
<?php

namespace App\Support\Health;

use App\Models\HealthLink;
use App\Support\MediaMeta;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Every check on one record (docs/health.md "The checks"). Reads only; the
 * one write is the link cache — a URL the record links to is entered in
 * `health_links` so the checker probes it, and the record's refs are
 * replaced so a link that dies later can find who links to it.
 */
final class Checker
{
    private const VAGUE = ['click here', 'here', 'read more', 'more', 'learn more', 'this link', 'link'];

    /** @return list<array{check: string, severity: string, field: string, detail: array}> */
    public static function run(Model $model): array
    {
        $out = [];
        $add = function (string $check, string $field, array $detail = []) use (&$out) {
            $out[] = ['check' => $check, 'severity' => Findings::CHECKS[$check][1], 'field' => $field, 'detail' => $detail];
        };

        self::stale($model, $add);

        if ($model->getMorphClass() === 'certification') {
            return $out;
        }

        $content = Content::of($model);
        self::links($model, $content, $add);
        self::accessibility($content, $add);

        return $out;
    }

    private static function stale(Model $model, callable $add): void
    {
        if (! Kinds::isPublished($model)) {
            return;
        }

        $alias = $model->getMorphClass();
        $months = HealthSettings::staleMonths($alias);
        $updated = $model->getAttribute('updated_at');

        $upcomingOnly = $alias === 'event' && method_exists($model, 'isPast') && $model->isPast();
        if ($months > 0 && $updated !== null && ! $upcomingOnly && $updated->lt(now()->subMonths($months))) {
            $add('stale', 'record', ['months' => (int) $updated->diffInMonths(now())]);
        }

        match ($alias) {
            'event' => method_exists($model, 'isPast') && $model->isPast() && $model->getAttribute('is_featured')
                ? $add('event_past_featured', 'record') : null,
            'job_opening' => ($closes = $model->getAttribute('closes_at')) !== null && $closes->lt(now()->startOfDay())
                ? $add('vacancy_closed', 'record') : null,
            'certification' => ($until = $model->getAttribute('valid_until')) !== null && $until->lt(now()->startOfDay())
                ? $add('certification_expired', 'record') : null,
            default => null,
        };
    }

    private static function links(Model $model, Content $content, callable $add): void
    {
        $refs = [];

        foreach ($content->links as $link) {
            $target = LinkTarget::classify($link['href']);

            if ($target === null) {
                continue;
            }

            if ($target['kind'] === 'anchor') {
                if (! in_array($target['value'], $content->anchors, true)) {
                    $add('link_anchor_missing', $link['field'], ['anchor' => $target['value']]);
                }
                continue;
            }

            if ($target['kind'] === 'internal') {
                $judged = LinkTarget::judge($target['value']);

                if ($judged['state'] === 'dead') {
                    $add('link_internal_dead', $link['field'], ['url' => $target['value']]);
                } elseif ($judged['state'] === 'redirect') {
                    $add('link_redirected', $link['field'], ['url' => $target['value'], 'to' => $judged['to']]);
                } elseif ($judged['state'] === 'ask') {
                    $row = self::linkRow($target['value'], internal: true);
                    $refs[] = $row->id;
                    if ($row->isDead()) {
                        $add('link_internal_dead', $link['field'], ['url' => $target['value']]);
                    }
                }
                continue;
            }

            if (! HealthSettings::externalOn()) {
                continue;
            }

            $row = self::linkRow($target['value'], internal: false);
            $refs[] = $row->id;
            if ($row->isDead()) {
                $add('link_external_dead', $link['field'], ['url' => $target['value'], 'status' => $row->status ?? 'no answer']);
            }
        }

        self::replaceRefs($model, array_values(array_unique($refs)));
    }

    private static function accessibility(Content $content, callable $add): void
    {
        foreach ($content->pictures as $picture) {
            if (blank(MediaMeta::alt($picture['path']))) {
                $add('image_no_alt', $picture['field'], ['path' => $picture['path']]);
            }
        }

        foreach ($content->bodyImages as $image) {
            if ($image['alt'] === null) {
                $add('image_no_alt', $image['field']);
            }
        }

        foreach ($content->headings as $h) {
            $previous = 1;
            foreach ($h['levels'] as $level) {
                if ($level > $previous + 1) {
                    $add('heading_jump', $h['field'], ['from' => $previous, 'to' => $level]);
                    break;
                }
                $previous = $level;
            }
        }

        foreach ($content->links as $link) {
            $text = mb_strtolower(trim($link['text']));
            if ($text !== '' && (in_array($text, self::VAGUE, true) || $text === mb_strtolower(trim($link['href'])))) {
                $add('link_text_vague', $link['field'], ['text' => mb_substr($link['text'], 0, 120)]);
            }
        }

        foreach ($content->emptyLinks as $field) {
            $add('link_empty', $field);
        }

        foreach ($content->tablesWithoutHeader as $field) {
            $add('table_no_header', $field);
        }

        foreach ($content->videos as $video) {
            if (! $video['titled']) {
                $add('video_no_title', $video['field']);
            }
        }
    }

    private static function linkRow(string $url, bool $internal): HealthLink
    {
        return HealthLink::firstOrCreate(
            ['url_hash' => HealthLink::hashOf($url)],
            ['url' => $url, 'host' => $internal ? 'internal' : strtolower((string) parse_url($url, PHP_URL_HOST)),
                'internal' => $internal, 'result' => 'pending', 'next_check_at' => now()],
        );
    }

    /** @param  list<int>  $linkIds */
    private static function replaceRefs(Model $model, array $linkIds): void
    {
        $alias = $model->getMorphClass();
        $id = (int) $model->getKey();

        DB::table('health_link_refs')->where('subject_type', $alias)->where('subject_id', $id)->delete();
        DB::table('health_link_refs')->insert(array_map(
            fn (int $link) => ['health_link_id' => $link, 'subject_type' => $alias, 'subject_id' => $id],
            $linkIds,
        ));
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd api; php artisan test --filter=HealthChecksTest`
Expected: PASS. Note in `test_each_link_check` the internal `/nowhere/at-all` row is `failed` with `fails = 1` and counts as dead because internal rows die on one failure (`HealthLink::isDead`).

- [ ] **Step 6: Control run**

Temporarily change `HealthLink::DEAD_AFTER` to `1`; `test_an_external_link_is_dead_only_after_two_failures` must fail. Revert.

- [ ] **Step 7: Commit**

```bash
git add api/app/Support/Health/Checker.php api/app/Support/Health/Findings.php api/tests/Feature/HealthChecksTest.php
git commit -m "Site health: every check, and replacing a record's findings"
```

---

### Task 6: Recheck after a save, forget after a delete

**Files:**
- Create: `api/app/Jobs/CheckRecordHealth.php`
- Modify: `api/app/Providers/AppServiceProvider.php` (end of `boot()`)
- Test: `api/tests/Feature/HealthChecksTest.php` (append)

**Interfaces:**
- Consumes: `Kinds::aliases()/classFor()`, `Checker::run()`, `Findings::replace()/forget()`, `LinkTarget::forget()`.
- Produces: `CheckRecordHealth(string $alias, int $id)` (queued; `afterCommit`).

- [ ] **Step 1: Write the failing tests**

```php
    public function test_a_save_rechecks_and_a_delete_forgets(): void
    {
        $post = $this->post(['body' => '<p><a href="/blog">click here</a></p>']);
        $this->assertSame(['link_text_vague'], \App\Models\HealthFinding::pluck('check')->all());

        $post->update(['body' => '<p><a href="/blog">The blog</a></p>']);
        $this->assertSame(0, \App\Models\HealthFinding::count());

        $post->update(['body' => '<p><a href="/blog">here</a></p>']);
        $post->delete();
        $this->assertSame(0, \App\Models\HealthFinding::count());
    }

    public function test_a_recheck_of_a_deleted_record_does_nothing(): void
    {
        (new \App\Jobs\CheckRecordHealth('blog_post', 999999))->handle();
        $this->assertSame(0, \App\Models\HealthFinding::count());
    }
```

(The test queue is `sync`, so the job runs inside the save.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; php artisan test --filter=HealthChecksTest`
Expected: FAIL — no findings written after the save; `CheckRecordHealth` not found.

- [ ] **Step 3: The job**

```php
<?php

namespace App\Jobs;

use App\Support\Health\Checker;
use App\Support\Health\Findings;
use App\Support\Health\Kinds;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Re-runs one record's health checks (docs/health.md "On save"). A record gone since is a quiet no-op. */
class CheckRecordHealth implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public function __construct(public readonly string $alias, public readonly int $id) {}

    public function handle(): void
    {
        $class = Kinds::classFor($this->alias);
        $model = $class ? $class::find($this->id) : null;

        if ($model === null) {
            return;
        }

        Findings::replace($model, Checker::run($model));
    }
}
```

- [ ] **Step 4: Register the listeners**

At the end of `AppServiceProvider::boot()`:

```php
        /*
         * The site health centre (docs/health.md): every checked kind is
         * rechecked after it is saved and forgotten when it is deleted. One
         * loop rather than a trait on thirteen models. Guarded like
         * `Notifier`: a recheck that cannot be queued never fails the save.
         */
        foreach (\App\Support\Health\Kinds::aliases() as $alias) {
            $class = \App\Support\Health\Kinds::classFor($alias);

            $class::saved(function ($model) use ($alias) {
                try {
                    \App\Support\Health\LinkTarget::forget();
                    \App\Jobs\CheckRecordHealth::dispatch($alias, (int) $model->getKey())->afterCommit();
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::warning('Site health: could not queue a recheck', ['type' => $alias, 'id' => $model->getKey(), 'error' => $e->getMessage()]);
                }
            });

            $class::deleted(function ($model) use ($alias) {
                try {
                    \App\Support\Health\LinkTarget::forget();
                    \App\Support\Health\Findings::forget($alias, (int) $model->getKey());
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::warning('Site health: could not forget a record', ['type' => $alias, 'id' => $model->getKey(), 'error' => $e->getMessage()]);
                }
            });
        }
```

Place it **after** `Relation::enforceMorphMap([...])`, since `Kinds::classFor` reads the morph map.

- [ ] **Step 5: Run the health tests, then the whole suite**

Run: `cd api; php artisan test --filter=Health`
Expected: PASS.
Run: `cd api; php artisan test`
Expected: PASS. A test that counts queued jobs exactly (`Queue::fake()` then `assertPushedTimes`/`assertNothingPushed`) may now see `CheckRecordHealth`; fix such a test by asserting on its own job class (`Queue::assertNotPushed(TheirJob::class)`), never by removing the listener.

- [ ] **Step 6: Commit**

```bash
git add api/app/Jobs/CheckRecordHealth.php api/app/Providers/AppServiceProvider.php api/tests/Feature/HealthChecksTest.php
git commit -m "Site health: recheck after every save, forget after a delete"
```

---

### Task 7: The link checker

**Files:**
- Create: `api/app/Support/Health/LinkProber.php`, `api/app/Console/Commands/CheckLinks.php`
- Modify: `api/routes/console.php`, `api/.env.example`
- Test: `api/tests/Feature/HealthLinksTest.php`

**Interfaces:**
- Consumes: `SafeHttp::get()`, `HealthLink`, `health_link_refs`, `CheckRecordHealth`.
- Produces: `LinkProber::probe(HealthLink $link): void`; command `technoware:check-links {--limit=60}`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\HealthLink;
use App\Support\Health\LinkProber;
use App\Support\Net\PublicHost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HealthLinksTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        // No test resolves real DNS (the PublicHost rule): every host answers a public address.
        $this->app->instance(PublicHost::RESOLVER, fn (string $host) => ['93.184.216.34']);
    }

    private function link(string $url = 'https://vendor.example/sheet.pdf'): HealthLink
    {
        return HealthLink::create(['url_hash' => HealthLink::hashOf($url), 'url' => $url, 'host' => parse_url($url, PHP_URL_HOST), 'internal' => false, 'next_check_at' => now()]);
    }

    public function test_a_pass_resets_and_waits_a_week(): void
    {
        Http::fake(['vendor.example/*' => Http::response('', 200)]);
        $link = $this->link();
        $link->update(['fails' => 1, 'result' => 'failed']);

        LinkProber::probe($link);

        $this->assertSame(['ok', 0], [$link->result, $link->fails]);
        $this->assertTrue($link->next_check_at->between(now()->addDays(7)->subMinute(), now()->addDays(7)->addMinute()));
    }

    public function test_failures_count_and_come_back_sooner_the_first_time(): void
    {
        Http::fake(['vendor.example/*' => Http::response('', 404)]);
        $link = $this->link();

        LinkProber::probe($link);
        $this->assertSame(['failed', 1, 404], [$link->result, $link->fails, $link->status]);
        $this->assertTrue($link->next_check_at->lt(now()->addDays(2)));
        $this->assertFalse($link->isDead());

        LinkProber::probe($link);
        $this->assertTrue($link->isDead());
    }

    public function test_bot_blocking_is_unknown_not_a_failure(): void
    {
        Http::fake(['vendor.example/*' => Http::response('', 403)]);
        $link = $this->link();

        LinkProber::probe($link);

        $this->assertSame(['unknown', 0], [$link->result, $link->fails]);
    }

    public function test_head_refused_falls_back_to_get(): void
    {
        Http::fake(function ($request) {
            return $request->method() === 'HEAD' ? Http::response('', 405) : Http::response('', 200);
        });
        $link = $this->link();

        LinkProber::probe($link);

        $this->assertSame('ok', $link->result);
    }

    public function test_a_private_host_is_refused_as_a_failure(): void
    {
        $this->app->instance(PublicHost::RESOLVER, fn (string $host) => ['10.0.0.5']);
        $link = $this->link('https://intranet.example/x');

        LinkProber::probe($link);

        $this->assertSame(['failed', 1, null], [$link->result, $link->fails, $link->status]);
        Http::assertNothingSent();
    }

    public function test_crossing_into_dead_rechecks_the_records_linking_to_it(): void
    {
        Http::fake(['vendor.example/*' => Http::response('', 404)]);
        $post = \App\Models\BlogPost::create(['title' => 'P', 'slug' => 'p', 'excerpt' => 'x', 'status' => 'published', 'published_at' => now(),
            'body' => '<p><a href="https://vendor.example/sheet.pdf">Datasheet</a></p>']);
        $link = HealthLink::where('url_hash', HealthLink::hashOf('https://vendor.example/sheet.pdf'))->sole();

        LinkProber::probe($link);
        $this->assertSame(0, \App\Models\HealthFinding::count());

        LinkProber::probe($link->fresh());
        $this->assertSame(['link_external_dead'], \App\Models\HealthFinding::pluck('check')->all());
    }

    public function test_the_command_takes_one_request_per_host_per_second(): void
    {
        Http::fake(['*' => Http::response('', 200)]);
        $this->link('https://a.example/1');
        $this->link('https://a.example/2');
        $this->link('https://b.example/1');

        $started = microtime(true);
        $this->artisan('technoware:check-links')->assertSuccessful();

        $this->assertSame(3, HealthLink::where('result', 'ok')->count());
        $this->assertGreaterThanOrEqual(0.9, microtime(true) - $started);
    }
}
```

`BlogPost::create` there may need an `author_id` (see `HealthChecksTest::post()`); add one the same way if the insert fails. If `PublicHost::RESOLVER` is named differently, read `api/app/Support/Net/PublicHost.php` — CLAUDE.md says "tests bind `PublicHost::RESOLVER` so none resolves DNS"; mirror how `tests/Feature/WebhookTest.php` binds it.

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; php artisan test --filter=HealthLinksTest`
Expected: FAIL — `LinkProber` not found.

- [ ] **Step 3: `LinkProber`**

```php
<?php

namespace App\Support\Health;

use App\Jobs\CheckRecordHealth;
use App\Models\HealthLink;
use App\Models\Setting;
use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Asks one URL whether it is still there (docs/health.md "Link checker").
 * Through `SafeHttp` only — public hosts, pinned, redirects checked hop by
 * hop. An internal path is asked of the website at `WEB_INTERNAL_URL`, the
 * one configured private address it may reach; without one an internal
 * path stays `unknown` rather than being asked of the production domain.
 */
final class LinkProber
{
    public static function probe(HealthLink $link): void
    {
        $wasDead = $link->isDead();
        [$result, $status] = self::ask($link);

        $link->fill([
            'result' => $result,
            'status' => $status,
            'checked_at' => now(),
            'fails' => match ($result) { 'ok' => 0, 'failed' => $link->fails + 1, default => $link->fails },
        ]);
        $link->next_check_at = match (true) {
            $result === 'failed' && $link->fails === 1 => now()->addDay(),
            default => now()->addDays(7),
        };
        $link->save();

        if ($wasDead !== $link->isDead()) {
            DB::table('health_link_refs')->where('health_link_id', $link->id)->get()
                ->each(fn ($ref) => CheckRecordHealth::dispatch($ref->subject_type, (int) $ref->subject_id));
        }
    }

    /** @return array{0: string, 1: int|null} */
    private static function ask(HealthLink $link): array
    {
        $url = $link->url;
        $allowPrivate = config('app.env') === 'local' && (bool) env('HEALTH_ALLOW_PRIVATE', false);

        if ($link->internal) {
            $base = rtrim((string) config('app.web_internal_url'), '/');
            if ($base === '') {
                return ['unknown', null];
            }
            $url = $base.$link->url;
            $allowPrivate = true; // the operator configured this address; it is ours.
        }

        $options = [
            'timeout' => 10,
            'allow_private' => $allowPrivate,
            'allow_http' => true,
            'max_bytes' => 65536,
            'headers' => ['User-Agent' => self::agent()],
        ];

        try {
            $response = SafeHttp::request($url, $allowPrivate, true)->timeout(10)->withHeaders($options['headers'])->head($url);
            if (in_array($response->status(), [405, 501], true) || $response->redirect()) {
                $response = SafeHttp::get($url, $options);
            }
        } catch (UnsafeUrl) {
            return ['failed', null];
        } catch (Throwable $e) {
            Log::info('Site health: no answer', ['url' => $url, 'error' => $e->getMessage()]);

            return ['failed', null];
        }

        $status = $response->status();

        return match (true) {
            $status < 400 => ['ok', $status],
            in_array($status, [401, 403, 429], true) => ['unknown', $status],
            default => ['failed', $status],
        };
    }

    private static function agent(): string
    {
        $name = (string) (Setting::get('company_name') ?: config('app.name'));

        return "{$name} link checker (+".config('app.frontend_url').')';
    }
}
```

`HEAD` that answers a redirect is retried as `SafeHttp::get()`, which follows redirects hop by hop with the checks; a `HEAD` never follows one itself (`SafeHttp::request` is `withoutRedirecting`).

- [ ] **Step 4: The command**

```php
<?php

namespace App\Console\Commands;

use App\Models\HealthLink;
use App\Support\Health\HealthSettings;
use App\Support\Health\LinkProber;
use Illuminate\Console\Command;

/** Probes the links that are due (docs/health.md "Link checker"). At most one request per host per second. */
class CheckLinks extends Command
{
    protected $signature = 'technoware:check-links {--limit=60}';

    protected $description = 'Check the links pages point at that are due a check';

    private const BUDGET_SECONDS = 50;

    public function handle(): int
    {
        $started = microtime(true);
        $lastByHost = [];

        $due = HealthLink::query()
            ->where('next_check_at', '<=', now())
            ->when(! HealthSettings::externalOn(), fn ($q) => $q->where('internal', true))
            ->orderBy('next_check_at')
            ->limit((int) $this->option('limit'))
            ->get();

        foreach ($due as $link) {
            if (microtime(true) - $started > self::BUDGET_SECONDS) {
                break;
            }

            $wait = 1.0 - (microtime(true) - ($lastByHost[$link->host] ?? 0));
            if ($wait > 0) {
                usleep((int) ($wait * 1_000_000));
            }

            LinkProber::probe($link);
            $lastByHost[$link->host] = microtime(true);
        }

        return self::SUCCESS;
    }
}
```

- [ ] **Step 5: Schedule it**

In `api/routes/console.php`, beside the other health-of-the-site entries (and before the file's closing restore/update `skip()` loop):

```php
// The site health centre's link checker (0.181.0, docs/health.md).
Schedule::command('technoware:check-links')->everyFifteenMinutes()->withoutOverlapping()->runInBackground();
```

In `api/.env.example`, near the other `*_ALLOW_PRIVATE` lines:

```
# Lets the site health link checker fetch a private address — local development only (ignored unless APP_ENV=local).
HEALTH_ALLOW_PRIVATE=false
```

- [ ] **Step 6: Run the tests**

Run: `cd api; php artisan test --filter=HealthLinksTest`
Expected: PASS.

- [ ] **Step 7: Control run**

Change `in_array($status, [401, 403, 429], true)` to `false &&`; `test_bot_blocking_is_unknown_not_a_failure` must fail. Revert.

- [ ] **Step 8: Commit**

```bash
git add api/app/Support/Health/LinkProber.php api/app/Console/Commands/CheckLinks.php api/routes/console.php api/.env.example api/tests/Feature/HealthLinksTest.php
git commit -m "Site health: the link checker"
```

---

### Task 8: The nightly sweep, the score and the snapshots

**Files:**
- Create: `api/app/Support/Health/Score.php`, `api/app/Jobs/SweepHealth.php`, `api/app/Console/Commands/HealthSweep.php`
- Modify: `api/routes/console.php`
- Test: `api/tests/Feature/HealthSweepTest.php` (append)

**Interfaces:**
- Consumes: `Kinds`, `Checker`, `Findings`, `HealthSnapshot`, `HealthLink`.
- Produces:
  - `Score::now(): ?int`
  - `Score::counts(?array $aliases = null): array<string, array<string, int>>` (group ⇒ severity ⇒ count, unignored)
  - `Score::snapshot(): HealthSnapshot`
  - `SweepHealth(int $kindIndex = 0, int $afterId = 0)` (queued, self-chaining)
  - `Score::LAST_SWEEP_KEY = 'health:last_sweep_at'`

- [ ] **Step 1: Write the failing tests** (append to `HealthSweepTest`)

```php
    private function page(string $slug, string $body, string $status = 'published'): \App\Models\Page
    {
        return \App\Models\Page::create(['title' => ucfirst($slug), 'slug' => $slug, 'body' => $body, 'status' => $status]);
    }

    public function test_the_score_counts_published_records_and_ignores_notices(): void
    {
        $this->assertNull(\App\Support\Health\Score::now());

        $this->page('good', '<p>Fine.</p>');
        $this->page('bad', '<p><a href="/blog">click here</a></p>');
        $this->page('draft', '<p><a href="/blog">click here</a></p>', 'draft');
        \App\Models\Redirect::create(['from_path' => '/old', 'to_path' => '/blog', 'status_code' => 301, 'is_active' => true, 'created_automatically' => false]);
        $this->page('notice', '<p><a href="/old">The old page</a></p>');

        // Three published, one with a warning: 2 of 3 healthy.
        $this->assertSame(67, \App\Support\Health\Score::now());

        \App\Models\HealthFinding::where('check', 'link_text_vague')->update(['ignored_at' => now()]);
        $this->assertSame(100, \App\Support\Health\Score::now());
    }

    public function test_a_sweep_paused_after_one_slice_finishes_with_the_same_findings(): void
    {
        $this->page('one', '<p><a href="/blog">here</a></p>');
        $this->page('two', '<p><a href="/blog">more</a></p>');
        \App\Models\HealthFinding::query()->delete();

        \App\Jobs\SweepHealth::$budgetSeconds = 0; // every slice ends after one record
        try {
            $this->artisan('technoware:health-sweep')->assertSuccessful();
        } finally {
            \App\Jobs\SweepHealth::$budgetSeconds = 40; // a static outlives the test
        }

        $this->assertSame(2, \App\Models\HealthFinding::count());
        $this->assertSame(1, \App\Models\HealthSnapshot::count());
        $this->assertNotNull(\Illuminate\Support\Facades\Cache::get(\App\Support\Health\Score::LAST_SWEEP_KEY));
    }

    public function test_links_nothing_points_at_are_pruned_by_the_sweep(): void
    {
        \App\Models\HealthLink::create(['url_hash' => sha1('x'), 'url' => 'https://gone.example', 'host' => 'gone.example', 'next_check_at' => now()]);

        $this->artisan('technoware:health-sweep')->assertSuccessful();

        $this->assertSame(0, \App\Models\HealthLink::count());
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; php artisan test --filter=HealthSweepTest`
Expected: FAIL — `Score` not found.

- [ ] **Step 3: `Score`**

```php
<?php

namespace App\Support\Health;

use App\Models\HealthFinding;
use App\Models\HealthSnapshot;

/**
 * The site-wide figure (docs/health.md "The score"): the share of published
 * checked records with no unignored error or warning finding. Null, never
 * zero, when nothing has been checked. A notice never lowers it.
 */
final class Score
{
    public const LAST_SWEEP_KEY = 'health:last_sweep_at';

    public static function now(): ?int
    {
        $total = 0;
        foreach (Kinds::aliases() as $alias) {
            $class = Kinds::classFor($alias);
            $total += $class::query()->get()->filter(fn ($m) => Kinds::isPublished($m))->count();
        }

        if ($total === 0) {
            return null;
        }

        $bad = HealthFinding::query()
            ->where('subject_published', true)
            ->whereNull('ignored_at')
            ->whereIn('severity', ['error', 'warning'])
            ->distinct()
            ->count(\Illuminate\Support\Facades\DB::raw("concat(subject_type, ':', subject_id)"));

        return (int) round(100 * ($total - $bad) / $total);
    }

    /**
     * @param  list<string>|null  $aliases  the caller's kinds; null for all
     * @return array<string, array<string, int>>
     */
    public static function counts(?array $aliases = null): array
    {
        $counts = array_map(fn () => array_fill_keys(array_keys(Findings::SEVERITIES), 0), Findings::GROUPS);

        HealthFinding::query()
            ->whereNull('ignored_at')
            ->when($aliases !== null, fn ($q) => $q->whereIn('subject_type', $aliases))
            ->selectRaw('`check`, severity, count(*) as n')
            ->groupBy('check', 'severity')
            ->get()
            ->each(function ($row) use (&$counts) {
                $group = Findings::CHECKS[$row->check][0] ?? null;
                if ($group !== null) {
                    $counts[$group][$row->severity] += (int) $row->n;
                }
            });

        return $counts;
    }

    public static function snapshot(): HealthSnapshot
    {
        $records = 0;
        foreach (Kinds::aliases() as $alias) {
            $records += Kinds::classFor($alias)::query()->count();
        }

        return HealthSnapshot::updateOrCreate(
            ['date' => now()->toDateString()],
            ['score' => self::now(), 'records_checked' => $records, 'counts' => self::counts()],
        );
    }
}
```

`now()` loads each kind's records to apply the published rule in PHP, because the rule is "no status column, or published" and a column check per kind would be a second definition of it. `shortcut:` comment on that line: `// shortcut: loads every record of every kind; a status count per kind past ~20,000 records.`

- [ ] **Step 4: `SweepHealth`**

```php
<?php

namespace App\Jobs;

use App\Models\HealthLink;
use App\Models\HealthSnapshot;
use App\Support\Health\Checker;
use App\Support\Health\Findings;
use App\Support\Health\Kinds;
use App\Support\Health\Score;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The nightly re-check of every record (docs/health.md "Nightly sweep").
 * Sliced like the mailbox scan: a slice works for `$budgetSeconds` and
 * dispatches the next with its cursor, so no job outlives the scheduler's
 * `--max-time=50` drain. The last slice writes the day's snapshot and prunes.
 */
class SweepHealth implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 80;

    /** Mutable for the slicing test only. */
    public static int $budgetSeconds = 40;

    public function __construct(public readonly int $kindIndex = 0, public readonly int $afterId = 0) {}

    public function handle(): void
    {
        $started = microtime(true);
        $aliases = Kinds::aliases();

        for ($k = $this->kindIndex; $k < count($aliases); $k++) {
            $class = Kinds::classFor($aliases[$k]);
            $after = $k === $this->kindIndex ? $this->afterId : 0;

            foreach ($class::query()->where('id', '>', $after)->orderBy('id')->lazyById(100) as $model) {
                try {
                    Findings::replace($model, Checker::run($model));
                } catch (Throwable $e) {
                    Log::warning('Site health: a record could not be checked', ['type' => $aliases[$k], 'id' => $model->getKey(), 'error' => $e->getMessage()]);
                }

                if (microtime(true) - $started >= self::$budgetSeconds) {
                    self::dispatch($k, (int) $model->getKey());

                    return;
                }
            }
        }

        Score::snapshot();
        HealthSnapshot::query()->where('date', '<', now()->subDays(400)->toDateString())->delete();
        HealthLink::query()->whereDoesntHave('refs')->where('created_at', '<', now()->subDay())->delete();
        Cache::forever(Score::LAST_SWEEP_KEY, now()->toIso8601String());
    }
}
```

Add a `refs()` relation to `HealthLink` for the prune (with the generic return type, per the Larastan rule):

```php
    /** @return \Illuminate\Database\Eloquent\Relations\HasMany<\Illuminate\Database\Eloquent\Model, $this> */
    public function refs(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(HealthLinkRef::class);
    }
```

and a minimal `api/app/Models/HealthLinkRef.php` (`protected $table = 'health_link_refs'; public $timestamps = false; public $incrementing = false; protected $primaryKey = null; protected $guarded = [];`). Update `refs()`'s annotation to `HasMany<HealthLinkRef, $this>`.

The pruning test creates a link with `created_at` now: change its `where('created_at', '<', now()->subDay())` guard **only** if the test fails — the test's link is created by `HealthLink::create` at "now", so in the test set `$link->forceFill(['created_at' => now()->subDays(2)])->save()` before the sweep. Update the test in Step 1 accordingly:

```php
        $link = \App\Models\HealthLink::create([...]);
        $link->forceFill(['created_at' => now()->subDays(2)])->save();
```

- [ ] **Step 5: The command and its schedule**

```php
<?php

namespace App\Console\Commands;

use App\Jobs\SweepHealth;
use Illuminate\Console\Command;

/** Starts the nightly site health sweep (docs/health.md). The job slices itself. */
class HealthSweep extends Command
{
    protected $signature = 'technoware:health-sweep';

    protected $description = 'Re-check every record for the site health centre';

    public function handle(): int
    {
        SweepHealth::dispatch();

        return self::SUCCESS;
    }
}
```

In `routes/console.php`: `Schedule::command('technoware:health-sweep')->dailyAt('02:50');` with a one-line comment.

- [ ] **Step 6: Run the tests**

Run: `cd api; php artisan test --filter=HealthSweepTest`
Expected: PASS (the test queue is `sync`, so the self-dispatched slices run inline).

- [ ] **Step 7: Commit**

```bash
git add api/app/Support/Health/Score.php api/app/Jobs/SweepHealth.php api/app/Console/Commands/HealthSweep.php api/app/Models/HealthLink.php api/app/Models/HealthLinkRef.php api/routes/console.php api/tests/Feature/HealthSweepTest.php
git commit -m "Site health: the nightly sweep, the score and the daily snapshot"
```

---

### Task 9: The admin API

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/Admin/HealthController.php`, `api/routes/api/admin-health.php`
- Modify: `api/routes/api.php` (beside `admin-revisions.php`)
- Test: `api/tests/Feature/HealthAccessTest.php`

**Interfaces:**
- Consumes: `Kinds`, `Findings`, `Score`, `Checker`, `HealthSnapshot`, `HealthLink`, `PaginatedEnvelope::from()`.
- Produces the routes and shapes in the spec's API table. Row shape:
  `{id, check, group, severity, sentence, field, field_label, detail, subject: {type, type_label, id, title}, admin_path, first_seen_at, ignored_at}`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\HealthFinding;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthAccessTest extends TestCase
{
    use RefreshDatabase;

    private function asStaff(RoleEnum $role): static
    {
        $user = User::firstOrCreate(['email' => $role->value.'-ha@example.test'],
            ['name' => 'Staff', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function seedFindings(): array
    {
        $page = \App\Models\Page::create(['title' => 'Page', 'slug' => 'page', 'body' => '<p><a href="/blog">here</a></p>', 'status' => 'published']);
        $shop = \App\Models\StoreProduct::create(['name' => 'Switch', 'slug' => 'switch', 'type' => 'physical', 'price_paise' => 100000,
            'status' => 'published', 'description' => '<p><a href="/blog">here</a></p>']);

        return [$page, $shop];
    }

    public function test_each_role_sees_only_its_own_findings(): void
    {
        $this->seedFindings();

        $this->assertSame(['page'], $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/health')->assertOk()->json('data.*.subject.type'));
        $this->assertSame(['store_product'], $this->asStaff(RoleEnum::StoreManager)->getJson('/api/v1/admin/health')->assertOk()->json('data.*.subject.type'));
    }

    public function test_only_an_administrator_gets_the_score(): void
    {
        $this->seedFindings();

        $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/health')->assertOk()->assertJsonMissingPath('meta.score');
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/health')->assertOk()->assertJsonPath('meta.score.value', 0);
    }

    public function test_a_finding_on_another_roles_kind_is_a_404(): void
    {
        [, $shop] = $this->seedFindings();
        $id = HealthFinding::where('subject_type', 'store_product')->value('id');

        $this->asStaff(RoleEnum::ContentManager)->postJson("/api/v1/admin/health/{$id}/ignore")->assertNotFound();
        $this->asStaff(RoleEnum::StoreManager)->postJson("/api/v1/admin/health/{$id}/ignore")->assertOk()->assertJsonPath('data.id', $id);
        $this->asStaff(RoleEnum::ContentManager)->postJson('/api/v1/admin/health/recheck', ['type' => 'store_product', 'id' => $shop->id])->assertNotFound();
    }

    public function test_a_customer_token_is_refused(): void
    {
        $customer = \App\Models\Customer::create(['name' => 'C', 'email' => 'c@example.test', 'password' => 'password-for-tests', 'status' => 'active']);
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$customer->createToken('portal', ['portal'])->plainTextToken)
            ->getJson('/api/v1/admin/health')->assertForbidden();
    }

    public function test_bulk_ignore_answers_updated_and_refused(): void
    {
        $this->seedFindings();
        $ids = HealthFinding::orderBy('id')->pluck('id')->all();

        $this->asStaff(RoleEnum::ContentManager)->postJson('/api/v1/admin/health/bulk', ['ids' => $ids, 'action' => 'ignore'])
            ->assertOk()->assertJsonCount(1, 'updated')->assertJsonCount(1, 'refused');
    }

    public function test_the_list_filters_and_carries_its_vocabulary(): void
    {
        $this->seedFindings();

        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/health?group=links')->assertOk()->assertJsonCount(0, 'data');
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/health?group=accessibility&type=page')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.sentence', 'A link says only "here". Say where it goes.')
            ->assertJsonPath('data.0.admin_path', '/admin/pages/'.\App\Models\Page::value('id'))
            ->assertJsonPath('meta.summary.accessibility.warning', 2);
    }
}
```

Field names for `StoreProduct::create` must match its fillable list — read `api/app/Models/StoreProduct.php` and adjust the required columns (`type`, `price_paise`) if they differ.

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; php artisan test --filter=HealthAccessTest`
Expected: FAIL — 404 on `/api/v1/admin/health`.

- [ ] **Step 3: Routes**

`api/routes/api/admin-health.php`:

```php
<?php

use App\Http\Controllers\Api\V1\Admin\HealthController;
use Illuminate\Support\Facades\Route;

/*
 * The site health centre (0.181.0, docs/health.md). Behind the union of the
 * roles that own a checked kind, as page history is; the controller narrows
 * every finding to the kinds the caller owns. Required inside the admin group
 * by routes/api.php.
 */
Route::middleware('role:content_manager,store_manager,seo_manager')->group(function () {
    Route::get('health', [HealthController::class, 'index'])->name('health.index');
    Route::post('health/recheck', [HealthController::class, 'recheck'])->middleware('throttle:30,1')->name('health.recheck');
    Route::post('health/bulk', [HealthController::class, 'bulk'])->middleware('throttle:30,1')->name('health.bulk');
    Route::post('health/{finding}/ignore', [HealthController::class, 'ignore'])->whereNumber('finding')->name('health.ignore');
    Route::post('health/{finding}/restore', [HealthController::class, 'restore'])->whereNumber('finding')->name('health.restore');
});
```

In `routes/api.php`, under `require __DIR__.'/api/admin-revisions.php';`: `require __DIR__.'/api/admin-health.php';`.

- [ ] **Step 4: The controller**

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\HealthFinding;
use App\Models\HealthLink;
use App\Models\HealthSnapshot;
use App\Support\Health\Checker;
use App\Support\Health\Findings;
use App\Support\Health\Kinds;
use App\Support\Health\Score;
use App\Support\PaginatedEnvelope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

/**
 * The site health centre's list (docs/health.md). Staff-wide behind the union
 * of owning roles; every read and write is narrowed to the kinds this account
 * owns (`Kinds::allows`), and a finding outside them is a 404. The score and
 * its trend are an administrator's alone.
 */
class HealthController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $aliases = Kinds::aliasesFor($user);
        $group = $request->string('group')->value();
        $checks = isset(Findings::GROUPS[$group])
            ? array_keys(array_filter(Findings::CHECKS, fn ($c) => $c[0] === $group))
            : null;

        $rows = HealthFinding::query()
            ->whereIn('subject_type', $aliases)
            ->when($request->boolean('ignored'), fn ($q) => $q->whereNotNull('ignored_at'), fn ($q) => $q->whereNull('ignored_at'))
            ->when($checks !== null, fn ($q) => $q->whereIn('check', $checks))
            ->when(isset(Findings::SEVERITIES[$request->string('severity')->value()]), fn ($q) => $q->where('severity', $request->string('severity')->value()))
            ->when(in_array($request->string('type')->value(), $aliases, true), fn ($q) => $q->where('subject_type', $request->string('type')->value()))
            ->orderByRaw("field(severity, 'error', 'warning', 'notice')")
            ->orderBy('first_seen_at')
            ->orderBy('id')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        $subjects = $this->subjects($rows->getCollection());
        $rows->getCollection()->transform(fn (HealthFinding $f) => $this->present($f, $subjects));

        $meta = [
            'summary' => Score::counts($aliases),
            'last_sweep_at' => Cache::get(Score::LAST_SWEEP_KEY),
            'links_due' => HealthLink::query()->where('next_check_at', '<=', now())->count(),
            'groups' => $this->options(Findings::GROUPS),
            'severities' => $this->options(Findings::SEVERITIES),
            'kinds' => array_map(fn ($a) => ['value' => $a, 'label' => Kinds::label($a)], $aliases),
        ];

        if ($user->isAdmin()) {
            $meta['score'] = $this->score();
        }

        return response()->json(PaginatedEnvelope::from($rows, $meta));
    }

    public function ignore(Request $request, int $finding): JsonResponse
    {
        $row = $this->owned($request, $finding);
        $row->forceFill(['ignored_at' => $row->ignored_at ?? now(), 'ignored_by' => $row->ignored_by ?? $request->user()->id])->save();

        return response()->json(['data' => $this->present($row, $this->subjects(collect([$row])))]);
    }

    public function restore(Request $request, int $finding): JsonResponse
    {
        $row = $this->owned($request, $finding);
        $row->forceFill(['ignored_at' => null, 'ignored_by' => null])->save();

        return response()->json(['data' => $this->present($row, $this->subjects(collect([$row])))]);
    }

    public function recheck(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(Kinds::aliases())],
            'id' => ['required', 'integer'],
        ]);

        abort_unless(Kinds::allows($request->user(), $data['type']), 404);
        $model = Kinds::classFor($data['type'])::find($data['id']);
        abort_if($model === null, 404);

        Findings::replace($model, Checker::run($model));
        $rows = HealthFinding::query()->where('subject_type', $data['type'])->where('subject_id', $data['id'])->orderBy('id')->get();
        $subjects = $this->subjects($rows);

        return response()->json(['data' => $rows->map(fn ($f) => $this->present($f, $subjects))->values()]);
    }

    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer', 'distinct'],
            'action' => ['required', Rule::in(['ignore', 'restore'])],
        ]);

        $aliases = Kinds::aliasesFor($request->user());
        $updated = [];
        $refused = [];

        foreach (HealthFinding::query()->whereIn('id', $data['ids'])->get() as $row) {
            if (! in_array($row->subject_type, $aliases, true)) {
                $refused[] = ['id' => $row->id, 'title' => Findings::sentence($row), 'message' => 'That is not one of your records.'];
                continue;
            }
            $row->forceFill($data['action'] === 'ignore'
                ? ['ignored_at' => $row->ignored_at ?? now(), 'ignored_by' => $row->ignored_by ?? $request->user()->id]
                : ['ignored_at' => null, 'ignored_by' => null])->save();
            $updated[] = $row->id;
        }

        return response()->json(['updated' => $updated, 'refused' => $refused]);
    }

    private function owned(Request $request, int $id): HealthFinding
    {
        $row = HealthFinding::find($id);
        abort_if($row === null || ! Kinds::allows($request->user(), $row->subject_type), 404);

        return $row;
    }

    /**
     * Every subject on the page, loaded once per kind.
     *
     * @param  \Illuminate\Support\Collection<int, HealthFinding>  $rows
     * @return array<string, \Illuminate\Database\Eloquent\Model>
     */
    private function subjects($rows): array
    {
        $out = [];
        foreach ($rows->groupBy('subject_type') as $alias => $group) {
            $class = Kinds::classFor($alias);
            if ($class === null) {
                continue;
            }
            foreach ($class::query()->whereKey($group->pluck('subject_id')->unique()->all())->get() as $model) {
                $out[$alias.':'.$model->getKey()] = $model;
            }
        }

        return $out;
    }

    /** @param  array<string, \Illuminate\Database\Eloquent\Model>  $subjects */
    private function present(HealthFinding $f, array $subjects): array
    {
        $model = $subjects[$f->subject_type.':'.$f->subject_id] ?? null;
        $tab = Findings::tabFor($f->field);
        $path = $model ? Kinds::adminPath($model) : null;

        return [
            'id' => $f->id,
            'check' => $f->check,
            'group' => Findings::CHECKS[$f->check][0] ?? null,
            'severity' => $f->severity,
            'sentence' => Findings::sentence($f),
            'field' => $f->field,
            'field_label' => Findings::fieldLabel($f->field),
            'detail' => $f->detail ?? (object) [],
            'subject' => [
                'type' => $f->subject_type,
                'type_label' => Kinds::label($f->subject_type),
                'id' => $f->subject_id,
                'title' => $model ? Kinds::title($model) : null,
            ],
            'admin_path' => $path && $tab ? $path.'?tab='.$tab : $path,
            'first_seen_at' => $f->first_seen_at?->toIso8601String(),
            'ignored_at' => $f->ignored_at?->toIso8601String(),
        ];
    }

    /** @return array{value: ?int, series: list<array{date: string, score: ?int}>, change: ?int} */
    private function score(): array
    {
        $value = Score::now();
        $series = HealthSnapshot::query()->where('date', '>=', now()->subDays(90)->toDateString())->orderBy('date')->get()
            ->map(fn ($s) => ['date' => $s->date->toDateString(), 'score' => $s->score])->values()->all();
        $then = HealthSnapshot::query()->where('date', '<=', now()->subDays(30)->toDateString())->orderByDesc('date')->value('score');

        return ['value' => $value, 'series' => $series, 'change' => $value !== null && $then !== null ? $value - (int) $then : null];
    }

    /** @param  array<string, string>  $map */
    private function options(array $map): array
    {
        return array_map(fn ($v, $l) => ['value' => $v, 'label' => $l], array_keys($map), $map);
    }
}
```

`field(severity, …)` is MySQL; the test DB is MySQL (`technoweb_test`), as production. If a sections tab id is not `sections` on the record forms, read `web/src/components/admin/form-tabs.tsx` for the builder tab's id and use it in `Findings::tabFor`.

- [ ] **Step 5: Run the tests, then the nav-role test**

Run: `cd api; php artisan test --filter=HealthAccessTest`
Expected: PASS.

- [ ] **Step 6: Larastan and Pint**

Run: `cd api; composer analyse` → must print "No errors". Fix findings; never regenerate the baseline.
Run: `cd api; ./vendor/bin/pint app/Support/Health app/Http/Controllers/Api/V1/Admin/HealthController.php app/Jobs/CheckRecordHealth.php app/Jobs/SweepHealth.php app/Console/Commands/CheckLinks.php app/Console/Commands/HealthSweep.php app/Models/Health*.php routes/api/admin-health.php`

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/V1/Admin/HealthController.php api/routes/api/admin-health.php api/routes/api.php api/tests/Feature/HealthAccessTest.php api/app
git commit -m "Site health: the admin API, narrowed per role"
```

---

### Task 10: The console screen, its settings and the mock

**Files:**
- Create: `web/src/types/health.ts`, `web/src/lib/admin/health.ts`
- Create: `web/src/app/admin/(app)/health/page.tsx`, `actions.ts`, `row-buttons.tsx`, `web/src/app/admin/(app)/health/settings/page.tsx`
- Modify: `web/src/lib/admin/index.ts`, `web/src/types/bulk.ts`, `web/src/components/admin/row-selection.tsx`, `web/src/app/admin/(app)/nav-items.tsx`, `web/src/app/admin/(app)/settings/settings-copy.ts`, `web/mock-api.mjs`, `web/scripts/audit.mjs`, `web/scripts/mobile-audit.mjs`
- Test: `api/tests/Feature/AdminNavRolesTest.php` and `SettingsScreensTest.php` (existing; must stay green)

**Interfaces:**
- Consumes: the API shapes from Task 9.
- Produces: `getHealthList(params)`, `setHealthIgnored(id, ignored)`, `recheckHealth(type, id)`, `bulkHealth(ids, action)`; types `HealthRow`, `HealthList`.

- [ ] **Step 1: Types** — `web/src/types/health.ts`

```ts
import type { Paginated } from "@/types/api";

export type HealthSeverity = "error" | "warning" | "notice";
export type HealthGroup = "links" | "stale" | "accessibility";

/** One problem on one record, worded by the API (docs/health.md). */
export type HealthRow = {
  id: number;
  check: string;
  group: HealthGroup;
  severity: HealthSeverity;
  sentence: string;
  field: string;
  field_label: string;
  detail: Record<string, string | number>;
  subject: { type: string; type_label: string; id: number; title: string | null };
  /** A console path to the record's edit screen, on the right tab. Null when the record has gone. */
  admin_path: string | null;
  first_seen_at: string | null;
  ignored_at: string | null;
};

type Counts = Record<HealthSeverity, number>;
type Option = { value: string; label: string };

export type HealthList = Paginated<HealthRow> & {
  meta: {
    summary: Record<HealthGroup, Counts>;
    /** Administrators only; absent for every other role. */
    score?: { value: number | null; series: { date: string; score: number | null }[]; change: number | null };
    last_sweep_at: string | null;
    links_due: number;
    groups: Option[];
    severities: Option[];
    kinds: Option[];
  };
};
```

- [ ] **Step 2: The API helpers** — `web/src/lib/admin/health.ts`

```ts
import "server-only";
import { apiFetch } from "@/lib/api";
import { token, query } from "./_shared";
import type { HealthList, HealthRow } from "@/types/health";
import type { BulkState } from "@/types/bulk";

export type { HealthList, HealthRow };

export async function getHealthList(
  params: { group?: string; severity?: string; type?: string; ignored?: boolean; page?: number; per_page?: number } = {},
): Promise<HealthList> {
  const { ignored, ...rest } = params;
  return apiFetch<HealthList>(`/admin/health${query({ ...rest, ...(ignored ? { ignored: "1" } : {}) })}`, { token: await token() });
}

export async function setHealthIgnored(id: number, ignored: boolean): Promise<void> {
  await apiFetch<void>(`/admin/health/${id}/${ignored ? "ignore" : "restore"}`, { method: "POST", token: await token() });
}

export async function recheckHealth(type: string, id: number): Promise<HealthRow[]> {
  const res = await apiFetch<{ data: HealthRow[] }>("/admin/health/recheck", { method: "POST", body: { type, id }, token: await token() });
  return res.data;
}

export async function bulkHealth(ids: number[], action: "ignore" | "restore"): Promise<Pick<BulkState, "updated" | "refused">> {
  return apiFetch("/admin/health/bulk", { method: "POST", body: { ids, action }, token: await token() });
}
```

Add `export * from "./health";` to `web/src/lib/admin/index.ts`. Read `web/src/types/bulk.ts` for `BulkState`'s field names and match them; if `updated`/`refused` are named otherwise there, use those names.

- [ ] **Step 3: Two bulk labels** — `web/src/types/bulk.ts` becomes `export type BulkAction = "publish" | "draft" | "archive" | "delete" | "ignore" | "restore";` and `LABEL` in `row-selection.tsx` gains `ignore: "Ignore", restore: "Stop ignoring",`.

- [ ] **Step 4: Server Actions** — `web/src/app/admin/(app)/health/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { bulkHealth, recheckHealth, setHealthIgnored } from "@/lib/admin";
import type { BulkState } from "@/types/bulk";

export type RowState = { error?: string; ok?: string };

/** Ignore one finding, or stop ignoring it — the form says which. */
export async function ignoreFindingAction(_prev: RowState, formData: FormData): Promise<RowState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "That problem could not be found." };
  try {
    await setHealthIgnored(id, formData.get("ignored") === "1");
  } catch {
    return { error: "We could not update that problem." };
  }
  revalidatePath("/admin/health");
  return {};
}

/** Check one record again now, after fixing it in another tab. */
export async function recheckAction(_prev: RowState, formData: FormData): Promise<RowState> {
  const type = String(formData.get("type") ?? "");
  const id = Number(formData.get("id"));
  if (!type || !id) return { error: "That record could not be found." };
  try {
    const rows = await recheckHealth(type, id);
    revalidatePath("/admin/health");
    return { ok: rows.length === 0 ? "Checked again — nothing to fix." : `Checked again — ${rows.length} still to fix.` };
  } catch {
    return { error: "We could not check that record again." };
  }
}

export async function bulkHealthAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const ids = formData.getAll("ids").map(Number).filter(Boolean);
  const action = formData.get("action") === "restore" ? "restore" : "ignore";
  try {
    const result = await bulkHealth(ids, action);
    revalidatePath("/admin/health");
    return { ...result };
  } catch {
    return { error: "We could not update those problems." };
  }
}
```

Read `bulkPostsAction` in `web/src/app/admin/(app)/blog/actions.ts` for how `BulkBar` posts the ticked ids (`ids` vs `ids[]`) and the exact `BulkState` it returns, and match it.

- [ ] **Step 5: Row buttons** — `web/src/app/admin/(app)/health/row-buttons.tsx`

```tsx
"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Alert } from "@/components/ui/input";
import { ignoreFindingAction, recheckAction, type RowState } from "./actions";
import { ROW_ACTION } from "../not-found/row-action";

const initial: RowState = {};

/** Recheck and Ignore for one row. One-press forms: they carry a state only to report. */
export function RowButtons({ id, type, subjectId, ignored }: { id: number; type: string; subjectId: number; ignored: boolean }) {
  const [ignoreState, ignoreAction, ignoring] = useActionState(ignoreFindingAction, initial);
  const [recheckState, recheck, checking] = useActionState(recheckAction, initial);

  return (
    <div className="flex flex-wrap items-start gap-2 xl:flex-nowrap">
      <Form action={recheck} state={recheckState}>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="id" value={subjectId} />
        <button type="submit" disabled={checking} aria-busy={checking || undefined} className={ROW_ACTION}>
          {checking ? "Checking…" : "Recheck"}
        </button>
        {recheckState.ok && <Alert tone="ok" title={recheckState.ok} />}
        {recheckState.error && <Alert tone="err" title={recheckState.error} />}
      </Form>
      <Form action={ignoreAction} state={ignoreState}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="ignored" value={ignored ? "0" : "1"} />
        <button type="submit" disabled={ignoring} aria-busy={ignoring || undefined} className={ROW_ACTION}>
          {ignoring ? "Saving…" : ignored ? "Stop ignoring" : "Ignore"}
        </button>
        {ignoreState.error && <Alert tone="err" title={ignoreState.error} />}
      </Form>
    </div>
  );
}
```

- [ ] **Step 6: The page** — `web/src/app/admin/(app)/health/page.tsx`

```tsx
import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { EmptyListAction } from "@/components/admin/empty-list-action";
import { Pagination } from "@/components/ui/pagination";
import { StatTile } from "@/components/admin/stat-tile";
import { BulkBar, RowTick, TickAll } from "@/components/admin/row-selection";
import { IconHeart } from "@/components/icons-ui";
import { getHealthList, type HealthList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";
import { requireScreen } from "@/lib/admin-screen";
import { RowButtons } from "./row-buttons";
import { bulkHealthAction } from "./actions";
import { ROW_ACTION } from "../not-found/row-action";

export const metadata = buildMetadata({ title: "Site health", path: "/admin/health", seo: noIndex });

type SearchParams = { group?: string; severity?: string; type?: string; show?: string; page?: string; per_page?: string };

const TONE = { error: "err", warning: "warn", notice: "info" } as const;

/**
 * Site health (0.181.0, docs/health.md): what is wrong in what editors wrote,
 * each row opening the field that fixes it. Every role sees its own records;
 * the score and its trend are an administrator's.
 */
export default async function SiteHealthPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;
  const ignored = params.show === "ignored";

  let result: HealthList;
  try {
    result = await getHealthList({
      group: params.group, severity: params.severity, type: params.type, ignored,
      page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return <ErrorState title="We could not load site health">The admin API is not responding.</ErrorState>;
  }

  const { meta } = result;
  const filters = { group: params.group, severity: params.severity, type: params.type, show: params.show, per_page: params.per_page };
  const filtered = Boolean(params.group || params.severity || params.type || ignored);
  const ids = result.data.map((r) => r.id);

  return (
    <>
      <PageHeader
        title="Site health"
        lede="Broken links, pages that have not been touched in a long time, and pictures or links a screen reader cannot use — on the records you look after. Fix opens the record on the right tab; the problem leaves this list within a minute of saving."
      />

      {meta.score && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Site health"
            value={meta.score.value === null ? "—" : `${meta.score.value}%`}
            note="Published records with nothing to fix"
            tone="ok"
            icon={IconHeart}
            spark={meta.score.series.map((s) => s.score ?? 0)}
            delta={meta.score.change === null ? undefined : { value: meta.score.change, unit: "points", period: "30 days" }}
          />
          {meta.groups.map((g) => {
            const c = meta.summary[g.value as keyof typeof meta.summary];
            return (
              <StatTile key={g.value} label={g.label} value={String(c.error + c.warning)}
                note={`${c.error} errors · ${c.warning} warnings`} tone={c.error > 0 ? "err" : c.warning > 0 ? "warn" : "ok"}
                icon={IconHeart} href={`/admin/health?group=${g.value}`} />
            );
          })}
        </div>
      )}

      <FilterBar action="/admin/health">
        <FilterField label="Kind of problem" htmlFor="group">
          <Select id="group" name="group" defaultValue={params.group ?? ""}>
            <option value="">All</option>
            {meta.groups.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Severity" htmlFor="severity">
          <Select id="severity" name="severity" defaultValue={params.severity ?? ""}>
            <option value="">All</option>
            {meta.severities.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Record" htmlFor="type">
          <Select id="type" name="type" defaultValue={params.type ?? ""}>
            <option value="">All</option>
            {meta.kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Show" htmlFor="show">
          <Select id="show" name="show" defaultValue={ignored ? "ignored" : ""}>
            <option value="">To fix</option>
            <option value="ignored">Ignored</option>
          </Select>
        </FilterField>
        <Button type="submit">Filter</Button>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState title={filtered ? "Nothing matches" : "Nothing to fix"}
          action={<EmptyListAction filtered={filtered} clearHref="/admin/health" noun="problem" />}>
          {ignored ? "Problems you ignore are listed here, in case you change your mind." : "Every record you look after passed every check."}
        </EmptyState>
      ) : (
        <>
          <BulkBar scope="health" ids={ids} noun={{ one: "problem", many: "problems" }}
            actions={[ignored ? "restore" : "ignore"]} action={bulkHealthAction} />
          <div className="mt-3 overflow-x-auto">
            <table className="admin-table w-full min-w-[860px] text-left text-13">
              <thead>
                <tr className="border-b border-line text-12 text-muted">
                  <th scope="col" className="w-8 px-3 py-1.5"><TickAll scope="health" ids={ids} noun="problem" /></th>
                  <th scope="col" className="px-3 py-1.5 font-semibold">Problem</th>
                  <th scope="col" className="px-3 py-1.5 font-semibold">Record</th>
                  <th scope="col" className="px-3 py-1.5 font-semibold">Where</th>
                  <th scope="col" className="px-3 py-1.5 font-semibold whitespace-nowrap">First seen</th>
                  <th scope="col" className="px-3 py-1.5 font-semibold">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => (
                  <tr key={row.id} className="border-b border-line align-top">
                    <td data-label="Select" className="px-3 py-2.5"><RowTick scope="health" id={row.id} label={row.sentence} /></td>
                    <td data-label="Problem" className="min-w-0 px-3 py-2.5">
                      <Badge tone={TONE[row.severity]}>{meta.severities.find((s) => s.value === row.severity)?.label}</Badge>
                      <span className="mt-1 block max-w-[64ch] [overflow-wrap:anywhere]">{row.sentence}</span>
                    </td>
                    <td data-label="Record" className="min-w-0 px-3 py-2.5">
                      <span className="block font-semibold">{row.subject.title ?? "A record that has gone"}</span>
                      <span className="text-12 text-muted">{row.subject.type_label}</span>
                    </td>
                    <td data-label="Where" className="px-3 py-2.5 text-muted">{row.field_label}</td>
                    <td data-label="First seen" className="px-3 py-2.5 whitespace-nowrap text-muted">{formatDate(row.first_seen_at, "dateShort")}</td>
                    <td data-label="" className="px-3 py-2.5">
                      <div className="flex flex-wrap items-start gap-2 xl:flex-nowrap">
                        {row.admin_path && <Link href={row.admin_path} className={ROW_ACTION}>Fix</Link>}
                        <RowButtons id={row.id} type={row.subject.type} subjectId={row.subject.id} ignored={row.ignored_at !== null} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pagination meta={result.meta} basePath="/admin/health" params={filters} />

      <p className="mt-6 text-12 text-muted">
        {meta.last_sweep_at ? <>Everything was last checked {formatDate(meta.last_sweep_at, "dateTimeShort")}. </> : <>Nothing has been checked overnight yet — see <Link className="text-brand-ink underline" href="/admin/system#scheduler">System → Status</Link>. </>}
        {meta.links_due > 0 && <>{meta.links_due.toLocaleString("en-IN")} links are waiting to be checked.</>}
      </p>
    </>
  );
}
```

Before using them, read and match exactly: `StatTile`'s `delta` (`TileDelta` in `components/admin/stat-tile.tsx`) and its `Tone` names; `Badge`'s tone prop names (`components/ui/badge.tsx`); the `formatDate` format keys in `lib/dates.ts`; the System status path (`grep -rn "#scheduler" web/src`). If `IconHeart` reads wrong at tile size, take another glyph from `icons-ui.tsx` — never import `@/components/icons` here. Keep `row.subject.title`'s null case: the record may be deleted between sweep and read.

- [ ] **Step 7: The sidebar row** — in `nav-items.tsx`, in the Content group after the Detail templates row:

```tsx
      // Site health (docs/health.md): every owning role reaches it and the API narrows each finding to the kinds the account owns.
      { role: "content_manager,store_manager,seo_manager", href: "/admin/health", label: "Site health", icon: IconHeart },
```

Add `IconHeart` to the existing `@/components/icons-ui` import (line 13).

- [ ] **Step 8: The settings screen**

In `settings-copy.ts`, following every place the `events` group appears:
- field copy:

```ts
  /* The site health centre (0.181.0, docs/health.md). */
  health_external_links: {
    label: "Check links to other websites",
    hint: "Once a week, politely. A link is listed as broken only after it fails twice, a week apart. Sites that block checkers are never listed.",
  },
  health_stale_page: { label: "Pages go out of date after (months)", hint: "0 means never." },
  health_stale_solution: { label: "Solutions (months)", hint: "0 means never." },
  health_stale_service: { label: "Services (months)", hint: "0 means never." },
  health_stale_product: { label: "Catalogue products (months)", hint: "0 means never." },
  health_stale_store_product: { label: "Shop products (months)", hint: "0 means never." },
  health_stale_knowledge_article: { label: "Knowledge articles (months)", hint: "0 means never." },
  health_stale_landing_page: { label: "Landing pages (months)", hint: "0 means never." },
  health_stale_event: { label: "Upcoming events (months)", hint: "0 means never. A past event is not listed for its age." },
  health_stale_blog_post: { label: "Blog posts (months)", hint: "0 means never — a post is dated, so it is never out of date by age." },
  health_stale_case_study: { label: "Case studies (months)", hint: "0 means never." },
  health_stale_tender: { label: "Tenders (months)", hint: "0 means never — a tender closes by its own date." },
  health_stale_job_opening: { label: "Vacancies (months)", hint: "0 means never — a vacancy past its closing date is listed anyway." },
  health_stale_entry: { label: "Custom content (months)", hint: "0 means never." },
```

- the group's field order (the `FIELD_ORDER` map holding `events: [...]`):

```ts
  health: ["health_external_links", "health_stale_page", "health_stale_solution", "health_stale_service", "health_stale_product",
           "health_stale_store_product", "health_stale_knowledge_article", "health_stale_landing_page", "health_stale_event",
           "health_stale_blog_post", "health_stale_case_study", "health_stale_tender", "health_stale_job_opening", "health_stale_entry"],
```

- a `GROUP_TITLES` entry `health: "Site health"` if `events` has one;
- the `SCREENS` entry, after the media settings screen:

```ts
  {
    path: "/admin/health/settings",
    title: "Site health settings",
    area: "Content",
    lede: "Whether links to other websites are checked, and how long each kind of record may go without an edit before Site health lists it as out of date.",
    saveLabel: "Save site health settings",
    sections: [{ groups: ["health"] }],
  },
```

`web/src/app/admin/(app)/health/settings/page.tsx`:

```tsx
import { SettingsScreen, settingsMetadata } from "../../settings/settings-screen";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = settingsMetadata("/admin/health/settings");

/** See `SCREENS` in settings-copy.ts — the groups this screen draws and why live there. */
export default async function HealthSettingsPage() {
  await requireScreen();
  return <SettingsScreen path="/admin/health/settings" />;
}
```

- [ ] **Step 9: The mock** — in `web/mock-api.mjs`, after the not-found block, a block in the same style:

```js
    /* Site health (0.181.0): the list in the real envelope, ignore/restore, recheck and bulk. */
    {
      const finding = (id, severity, check, group, sentence, type, type_label, sid, title, field, field_label, path) => ({
        id, check, group, severity, sentence, field, field_label, detail: {},
        subject: { type, type_label, id: sid, title }, admin_path: path, first_seen_at: '2026-10-10T09:00:00+05:30', ignored_at: null,
      });
      const HEALTH = [
        finding(1, 'error', 'link_internal_dead', 'links', 'Links to /solutions/old-firewall, which does not exist.', 'blog_post', 'Blog posts', 1, 'Choosing a firewall', 'body', 'Body', '/admin/blog/1'),
        finding(2, 'warning', 'stale', 'stale', 'Not edited for 20 months.', 'page', 'Pages', 2, 'About us', 'record', 'The record', '/admin/pages/2'),
        finding(3, 'error', 'image_no_alt', 'accessibility', 'The picture media/hero.jpg has no description for screen readers.', 'solution', 'Solutions', 3, 'Networking', 'hero_image_path', 'Cover picture', '/admin/solutions/3'),
      ];
      const opts = (m) => Object.entries(m).map(([value, label]) => ({ value, label }));
      if (p === '/admin/health' && req.method === 'GET') {
        const ignored = url.searchParams.get('ignored') === '1';
        const group = url.searchParams.get('group');
        const rows = HEALTH.filter((r) => Boolean(r.ignored_at) === ignored && (!group || r.group === group));
        const page = paginate(rows);
        const count = (g, s) => HEALTH.filter((r) => !r.ignored_at && r.group === g && r.severity === s).length;
        const summary = Object.fromEntries(['links', 'stale', 'accessibility'].map((g) => [g, { error: count(g, 'error'), warning: count(g, 'warning'), notice: count(g, 'notice') }]));
        return json(res, 200, { ...page, meta: { ...page.meta, summary,
          score: { value: 82, series: [{ date: '2026-10-15', score: 80 }, { date: '2026-10-16', score: 82 }], change: 3 },
          last_sweep_at: '2026-10-17T02:51:00+05:30', links_due: 4,
          groups: opts({ links: 'Links', stale: 'Out of date', accessibility: 'Accessibility' }),
          severities: opts({ error: 'Error', warning: 'Warning', notice: 'Notice' }),
          kinds: opts({ page: 'Pages', blog_post: 'Blog posts', solution: 'Solutions' }) } });
      }
      const hm = p.match(/^\/admin\/health\/(\d+)\/(ignore|restore)$/);
      if (hm && req.method === 'POST') {
        const row = HEALTH.find((r) => r.id === Number(hm[1]));
        if (!row) return json(res, 404, { message: 'Not found.' });
        row.ignored_at = hm[2] === 'ignore' ? '2026-10-17T10:00:00+05:30' : null;
        return json(res, 200, { data: row });
      }
      if (p === '/admin/health/recheck' && req.method === 'POST') return json(res, 200, { data: [] });
      if (p === '/admin/health/bulk' && req.method === 'POST') {
        const body = await readJson(req);
        HEALTH.filter((r) => body.ids.includes(r.id)).forEach((r) => { r.ignored_at = body.action === 'ignore' ? '2026-10-17T10:00:00+05:30' : null; });
        return json(res, 200, { updated: body.ids, refused: [] });
      }
    }
```

Use the mock's own body-reading helper (`grep -n "async function readJson\|readBody" web/mock-api.mjs`) — rename `readJson` to it. The mock's `/admin/settings` must also carry the `health` group's rows if the settings screen reads them from there: copy how the `events` group appears in the mock's settings fixture.

- [ ] **Step 10: Join the audits** — add `"/admin/health", "/admin/health/settings"` to the admin route lists in `web/scripts/audit.mjs` (line ~83, after `"/admin/not-found"`) and `web/scripts/mobile-audit.mjs` (line ~100).

- [ ] **Step 11: Type-check, lint and the two console tests**

Run: `cd web; npx tsc --noEmit` → no errors.
Run: `cd web; npm run lint` → no errors.
Run: `cd api; php artisan test --filter="AdminNavRolesTest|SettingsScreensTest"` → PASS. `AdminNavRolesTest` maps `/admin/health` to `role:content_manager,store_manager,seo_manager` in `routes/api/admin-health.php`; if it cannot map a console path to an API path, read the test for its mapping table and add `health`.

- [ ] **Step 12: Commit**

```bash
git add web/src/types/health.ts web/src/lib/admin/health.ts web/src/lib/admin/index.ts web/src/types/bulk.ts web/src/components/admin/row-selection.tsx "web/src/app/admin/(app)/health" "web/src/app/admin/(app)/nav-items.tsx" "web/src/app/admin/(app)/settings/settings-copy.ts" web/mock-api.mjs web/scripts/audit.mjs web/scripts/mobile-audit.mjs
git commit -m "Site health: the console screen, its settings and the mock"
```

---

### Task 11: The dashboard panel

**Files:**
- Modify: `web/src/lib/dashboard-view.ts` (`WIDGETS`), `web/src/app/admin/(app)/page.tsx` (the dashboard's panel map)
- Test: `web/scripts/probes/dashboard-view.mjs` (existing; must still pass)

**Interfaces:**
- Consumes: `getHealthList({ per_page: 3 })` for administrators.
- Produces: widget key `health`, **hidden by default**.

- [ ] **Step 1: Read the widget contract.** Open `web/src/lib/dashboard-view.ts` and find how a widget declares its role and whether it is shown by default (CLAUDE.md: "`WIDGETS` is the one list of panels and its order is the default"). If there is no "hidden by default" flag, add one — `defaultHidden?: boolean` — and make `arrange()` treat a widget with it as hidden unless the saved choice shows it. Write the flag's test as a pure check in `web/scripts/dashboard-view.check.mjs` if such checks exist beside it (`ls web/scripts/*.check.mjs`), else rely on the probe in Step 4.

- [ ] **Step 2: Add the widget** — `{ key: "health", label: "Site health", role: "admin", defaultHidden: true }` at the end of `WIDGETS` (match the existing shape exactly).

- [ ] **Step 3: Draw it** — in the dashboard page, beside the other panels, a `Card interactive={false}` holding the score (`StatTile`, same props as Task 10) and the first three rows' `sentence` + record title, each a `Link` to `row.admin_path`, and a "See all" link to `/admin/health`. Fetch `getHealthList({ per_page: 3 })` inside the panel's own `try`, so an API failure there blanks only this panel.

- [ ] **Step 4: Probe** — run `cd web; node scripts/probes/dashboard-view.mjs` with the dev server and admin credentials; it must still pass with the new widget absent from the default order. Then turn the panel on in Customise and confirm it renders.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/dashboard-view.ts "web/src/app/admin/(app)/page.tsx"
git commit -m "Site health: an optional dashboard panel for administrators"
```

---

### Task 12: Probe, audits, docs and the release

**Files:**
- Create: `web/scripts/probes/health.mjs`, `docs/health.md`, `manual/31-site-health.md`
- Modify: `CLAUDE.md`, `API.md`, `VERSION.md`, `web/src/lib/version.ts`, `web/src/lib/help-routes.ts`, `web/src/content/help.json` (regenerated)

- [ ] **Step 1: The probe** — `web/scripts/probes/health.mjs`, modelled on `web/scripts/probes/preview-link.mjs` (read it for sign-in, `BASE` and the credential env vars):

```js
/**
 * Site health (0.181.0, docs/health.md): a dead internal link in a throwaway
 * post is listed, Fix opens the post, correcting the link and saving clears it.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/health.mjs
 *
 * Needs the API's queue drained (php artisan queue:work) or QUEUE_CONNECTION=sync,
 * since the recheck after a save is a queued job.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const slug = `health-probe-${Date.now()}`;
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
try {
  // 1. Sign in through the real form (same steps as preview-link.mjs).
  await page.goto(`${BASE}/admin/login`);
  await page.getByRole("button", { name: /use your password/i }).click();
  await page.getByLabel("Email").fill(process.env.ADMIN_LOGIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(process.env.ADMIN_LOGIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/);

  // 2. A post whose body links to a page that does not exist.
  await page.goto(`${BASE}/admin/blog/new`);
  await page.getByLabel("Title").fill("Health probe");
  await page.getByLabel("Address").fill(slug);
  await page.evaluate(() => {
    const input = document.querySelector('input[type=hidden][name="body"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, '<p><a href="/storage/health-probe-missing.pdf">Missing file</a></p>');
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: /^save/i }).first().click();
  await page.waitForURL(/\/admin\/blog\/\d+/);
  const postUrl = page.url();

  // 3. Listed.
  await page.goto(`${BASE}/admin/health?type=blog_post`);
  const row = page.getByRole("row", { name: /Health probe/ });
  await row.waitFor({ timeout: 60000 }).catch(() => fail("the dead link was not listed"));
  if (!(await row.textContent())?.includes("/storage/health-probe-missing.pdf")) fail("the row does not name the link");

  // 4. Fix → correct → save → gone after Recheck.
  await row.getByRole("link", { name: "Fix" }).click();
  await page.waitForURL(postUrl.replace(BASE, "") === new URL(page.url()).pathname ? /./ : /\/admin\/blog\/\d+/);
  await page.evaluate(() => {
    const input = document.querySelector('input[type=hidden][name="body"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, '<p><a href="/blog">The blog</a></p>');
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: /^save/i }).first().click();
  await page.waitForTimeout(3000);
  await page.goto(`${BASE}/admin/health?type=blog_post`);
  if (await page.getByRole("row", { name: /Health probe/ }).count()) fail("the finding is still listed after the fix");

  console.log(process.exitCode ? "health probe FAILED" : "health probe passed");
} finally {
  // 5. Delete the throwaway post through its own screen.
  await page.goto(postUrl).catch(() => {});
  await page.getByRole("button", { name: /^delete/i }).first().click().catch(() => {});
  await page.getByRole("button", { name: /^delete/i }).last().click().catch(() => {});
  await browser.close();
}
```

Before running it, check the new-post form's real labels and the body control's hidden input name (`grep -n "name=\"body\"" -r web/src/components/admin web/src/app/admin`); the Summernote editor reads its hidden input, and `EditorField` documents how a value is written into it (the `FormDraft` restore uses the same setter-plus-`input` trick shown here). Adjust selectors to what the form renders.

- [ ] **Step 2: Run the API suite, Larastan, the probe and both audits**

Run: `cd api; php artisan test` → all pass.
Run: `cd api; composer analyse` → "No errors".
Start `php artisan serve`, `php artisan queue:work` and `npm run dev`; set `WEB_INTERNAL_URL=http://localhost:3000` in `api/.env` for the internal check.
Run: `cd web; node scripts/probes/health.mjs` → "health probe passed".
Run (Git Bash): `cd web; MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin/health /admin/health/settings` → exit 0, in light and with `AUDIT_SCHEME=dark`.
Run: `cd web; MSYS_NO_PATHCONV=1 node scripts/mobile-audit.mjs /admin/health /admin/health/settings` → exit 0.
Take a 360px screenshot of `/admin/health` and look at it: cards, not a sideways-scrolling table.

- [ ] **Step 3: `docs/health.md`** — the module note, in the house shape (one rule per bold lead-in paragraph, with why): the kinds and why `saved_section` is out; the four internal-link answers and why `ask` never goes to `FRONTEND_URL`; fail-twice and 401/403/429 as unknown; internal dies on one failure; refs and why they exist; the fingerprint includes the detail; the score's definition, drafts unscored, notices free; save hooks registered in one loop and guarded; the sweep sliced at 40s; `HEALTH_ALLOW_PRIVATE`; the shortcuts (`publishedPaths` rebuilt whole; `Score::now` loading every record) with their limits.

- [ ] **Step 4: CLAUDE.md** — under "Modules", a new block after "Ask ALTIS, the console copilot":

```markdown
### Site health — `docs/health.md`

Broken links, stale records and accessibility mistakes in what editors wrote, as a worklist; a score and trend for administrators (0.181.0).

- `App\Support\Health\Kinds` is the one list: `Revisions`' kinds less `saved_section`, plus `certification` (expiry only); every route narrows by `Kinds::allows()`, a finding on a kind the caller does not own is a 404, `meta.score` is an administrator's alone.
- Findings are stored and replaced whole per record (`Findings::replace`): a returning one keeps `first_seen_at` and its ignore; the fingerprint includes the detail, so a changed dead URL is a new, un-ignored finding; there is no "fixed" flag.
- An internal link is judged cheapest first — a published record's path, a `SiteSection`, an active redirect (a notice), `/storage/` on disk — else asked of the website at `WEB_INTERNAL_URL` **only**, never `FRONTEND_URL` (the production domain on every machine); an internal 404 is dead at once.
- An external link is dead at `fails >= 2`; 401/403/429 are `unknown` and never count. Probed through `SafeHttp` only, one request per host per second, by `technoware:check-links` every 15 minutes. `health_link_refs` says who links where, so a link crossing into dead rechecks exactly those records.
- `AppServiceProvider` registers one save/delete listener per kind (no trait); a recheck that cannot be queued never fails the save. `technoware:health-sweep` (02:50) is sliced at 40s like the mailbox scan and writes the day's snapshot.
- Hidden sections and custom-code HTML are not read. The checker never writes to a record.
```

- [ ] **Step 5: API.md** — a "Site health" section after "Admin — the console copilot": the route table from the spec, the row shape, `meta`, the score definition, the per-role narrowing and the 404, and the `health` settings group (saved through `PATCH /admin/settings`, months 0–60, a 422 otherwise).

- [ ] **Step 6: The manual and help** — `manual/31-site-health.md`, written for the client's editors (what each problem means and how to fix it; Ignore; Recheck; the settings for administrators). Add `"/admin/health": ["site-health"]` (match the file's real key format) to `web/src/lib/help-routes.ts`, then `cd web; npm run help` to regenerate `help.json`, and `node scripts/build-help.mjs --check` → clean; `node scripts/help-routes.check.mjs` → clean.

- [ ] **Step 7: Version** — `web/src/lib/version.ts`: `APP_VERSION = "0.181.0"`. `VERSION.md`, newest first:

```markdown
## 0.181.0 — 2026-10-17

**Site health** — a list of what needs fixing in what you have written, each with a button that opens the right place.

- **Broken links**: links to pages on this site that do not exist, and links to other websites that stopped answering (checked once a week, and listed only after failing twice). Links that still work through a redirect are listed as a notice, with the new address to use.
- **Out of date**: pages, products and articles not edited for a long time (how long is yours to set, per kind), past events still featured, vacancies past their closing date, expired certifications.
- **Accessibility**: pictures with no description, headings that skip a level, links that say only "click here", empty links, tables with no header row, videos with no title.
- **Everyone sees their own**: content, shop and SEO managers each see the problems on the records they look after; administrators see all of it, with a health score and its trend.
```

- [ ] **Step 8: Commit**

```bash
git add web/scripts/probes/health.mjs docs/health.md manual/31-site-health.md CLAUDE.md API.md VERSION.md web/src/lib/version.ts web/src/lib/help-routes.ts web/src/content/help.json
git commit -m "0.181.0: Site health"
```
