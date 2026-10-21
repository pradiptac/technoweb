# Section A/B Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An editor tests a second version of one section on a published builder page, visitors see one version or the other with no flicker and no cookie, the console says in plain words which converts better and how sure that is, the bell says when it is clear, and "Use version B" writes B into the page through the page-save path (0.189.0).

**Architecture:** A `section_tests` row holds version B's `data`; the public page read carries it beside A as `test: {id, data}`, `PageSections` renders both inside one wrapper with a static `display: none` rule keyed on `html[data-ab-<id>]`, and the root layout's pre-paint script stamps that attribute from a per-tab `sessionStorage` choice for every id in the public setting `ab_tests_running`. C3's beacon reports which version a page view showed (`x`) and a press inside the section (`ab_click`); the Collector writes one `section_test_tallies` row per test, day and visitor hash and stamps `converted_at` on a click or a C3 conversion. `App\Support\Tests\Verdict` turns the two rates into a state and a sentence; an hourly command tells the bell once.

**Tech Stack:** Laravel 13 / PHP 8.3 / MySQL 8 (API), Next.js 16 App Router / TypeScript / Tailwind v4 (site and console), C3's analytics (`App\Support\Analytics\*`), the page builder (`App\Support\PageSections\*`, `components/page-sections/`), the chart kit.

**Spec:** `docs/superpowers/specs/2026-10-21-section-ab-tests-design.md`

## Global Constraints

- Scope: one section on a **builder** page (`template: builder`, the homepage page included); version B is that section's own `data`; a **50/50** split. Not detail templates, not record body sections.
- The tab's choice lives in `sessionStorage` key `tw_ab` (a JSON map of test id → `a`|`b`). No cookie, nothing that outlives the tab, no consent question. A blocked `sessionStorage` sees A.
- `ab_tests_running` on the public `/settings` map: the running tests' ids, comma-joined, **absent when there are none**. Purged with `updateTag("settings")` when a test starts or ends.
- Limits: **one** running test per section, **three** per page, **twenty** site-wide — each a 422 on `section_id` with a sentence.
- Nothing is called until each version has **300 visitors and 10 goals**; `clear` at **95%** or more; `level` when the rates are within a tenth of each other after **2,000 visitors each**; the bell fires once on `clear`, `level` or **60 days** run.
- Excluded section types: `theme_section`, `subnav`, `custom_code`, `saved` (a linked library section), `countdown` — and every record block (`PageSectionType::isRecordBlock()`).
- `role:content_manager` throughout. Starting a test needs `native_analytics_enabled` ("Switch native analytics on first.").
- `display: none` is the only hiding. The section's anchor id stays on the one style wrapper, never twice.
- B never reaches `faq_schema` or any structured data — they are built from A.
- Nothing changes the page by itself: only "Use version B" writes B, through the page-save rules, recording a page-history version and running `StaleGuard::touch`.
- Every label and sentence on the wire is the API's; a figure over no data is **null, never zero**.
- The 90-day hit prune never touches `section_test_tallies`; they go with their test.
- Repo rules: `web/` files are **CRLF**, `api/` **LF** (use the Edit/Write tools, never a Python `write_text`); never `npm run build` while a dev server runs; never two `php artisan test` at once; `composer analyse` must print "No errors"; run `./vendor/bin/pint` on changed PHP; every relation method carries its `@return` generic; every API Resource carries `@mixin`; a new polymorphic subject is registered in the morph map; a new console page starts with `await requireScreen();`; a Server Action form is `<Form>`; commit `api/` and `web/` together.

## Review Focus

1. **A test started while the page's ISR copy is still the old HTML.** The cached page has no wrapper but the fresh settings stamp `data-ab-<id>`, or the reverse after the test ends. Nothing must be counted and A must show. Pinned in Task 7 (`exposures()` returns `{}` for an attribute with no wrapper and for a wrapper with no attribute) and Task 3 (`test_an_ended_or_unknown_test_or_another_path_writes_nothing`).
2. **A stale editor form saved over a test.** A form opened before the test started must save when the tested section is untouched and be refused when it changed it. A form opened before "Use version B" must not silently put A back. Pinned in Task 5 (`test_a_form_opened_before_the_test_started_saves_when_the_section_is_untouched` and `test_a_stale_form_after_use_version_b_is_refused_by_the_stale_guard`).
3. **A visitor whose `sessionStorage` is blocked or full.** They must see A, get no `data-ab-*` attribute and be counted for neither version. A storage that already holds a malformed `tw_ab` must get a fresh draw. Pinned in Task 7 (`ab-choice.check.mjs`: blocked storage, a throwing `setItem` and a malformed stored value).
4. **A goal reached by a visitor whose page-view beacon was lost.** A click must still write a converted row with the version the beacon sends. A conversion with no exposure row must credit nothing and create nothing. Pinned in Task 3 (`test_a_click_with_no_exposure_writes_a_converted_row_and_a_conversion_with_none_writes_nothing`).
5. **A page unpublished mid-test.** The test must keep running and count nothing, the list must say "Page not published", and nothing must throw. Pinned in Task 3 (`test_an_unpublished_page_counts_nothing`) and Task 4 (`test_the_list_marks_an_unpublished_page`).

## Decisions taken where the spec is open

- **A 422 on version B is keyed `blocks.0.data.<field>`.** The request validates B as a one-section `blocks` list through the page builder's own rules, sanitiser and `after()` checks. The dialog reads its errors with the prefix `blocks.0`.
- **Applying B validates the whole page**, as any page save does. A broken picture in another section therefore also refuses the apply, and the error names that section's field (`blocks.N.data.<field>`).
- **`/end` takes an optional `keep`** (`a`, `b`, or absent for no winner) and never touches the page. The console has three buttons: "End test" sends no `keep`, "Keep version A" sends `keep: a`, and "Use version B" calls `/apply`. `/apply` works on a running test only.
- **Only a randomised visitor is counted.** The beacon reports a test only when the page has its wrapper **and** `<html>` carries its attribute. A visitor with blocked storage sees A and is counted for neither version, so the split stays unbiased.
- **"Within a tenth of each other" is relative**: the lower rate is at least 90% of the higher.
- **A tie** (equal rates past the floor) is `leading` with `leader: null` and `confidence: null`, and reads "Too close to call yet: both versions convert at 4.0%."
- **The leading sentence** is "Too close to call yet: version B is ahead, 5.0% against 4.0%, 85% sure."
- **The collecting sentence** counts the exact shortfall summed over both versions: visitors first ("About 180 more visitors to go."), then goals.
- **Confidence is capped at 99** (`floor(Φ(z)·100)`, never 100).
- **A conversion is credited** to tally rows with the same `day` **and** `visitor` as the conversion's hit. An `order_paid` that inherits an earlier day's visitor therefore credits nothing ("a goal reached on another day is not credited").
- **The bell is bell-only** (`section_test_result`, group `alert`, `delivers()` false). It goes to the test's creator while that account is active, else to every active account holding `content_manager` explicitly.
- **The test screen's chart plots each version's running (cumulative) conversion rate by day.** The API sends `null` before a version has a visitor; the console draws that as 0 on the chart only.
- **`GET /admin/pages/{id}`'s `section_tests`** lists draft and running tests only, keyed by section id, with running winning.
- **The index is not paginated.** It returns every test, running first, then drafts, then ended, newest first within each.
- **A locked card in the builder hides its editor and its remove button.** It shows "This section is being tested. End the test first." and "Open the test". Move, hide, background and style stay available. A hidden tested section is presented to nobody, so nothing is counted.
- **Version B renders with A's `eager` and `first` flags.** Both versions' pictures load. A tested hero is an `h1` twice in the HTML, and the audit fix counts rendered headings only.
- **B's DOM ids are distinct.** It renders with id `b<uuid>`, so a tabs or story section's ids do not collide.
- **The probe publishes the sample builder page and puts it back.** It restores the original blocks and status afterwards, and deletes its test and its throwaway admin.

---

## File map

API (`api/`):
- `database/migrations/2026_10_28_100000_create_section_tests_tables.php` — `section_tests`, `section_test_tallies`.
- `app/Enums/SectionTestStatus.php` — draft, running, ended and their moves.
- `app/Models/SectionTest.php`, `app/Models/SectionTestTally.php`; modify `app/Models/Page.php` (`sectionTests()`).
- `app/Support/Tests/Verdict.php` — the z-test, the states, the sentences (pure).
- `app/Support/Tests/Tallies.php` — the only writer and reader of `section_test_tallies`.
- `app/Support/Tests/SectionTests.php` — rules, limits, start/end/apply, the page-save lock, the public and admin maps.
- `app/Http/Requests/SectionTestRequest.php`, `app/Http/Controllers/Api/V1/Admin/SectionTestController.php`, `app/Http/Resources/Admin/SectionTestResource.php`, `routes/api/admin-section-tests.php`.
- `app/Console/Commands/CheckSectionTests.php`.
- Modify: `app/Support/Analytics/Collector.php` (`beaconVisitor()`), `app/Support/Analytics/Conversions.php` (credit), `app/Http/Controllers/Api/V1/CollectController.php` (`x`, `ab_click`), `app/Support/PageSections/SectionPresenter.php` (`$tests`), `app/Http/Resources/PageResource.php`, `app/Http/Resources/Admin/PageResource.php`, `app/Http/Controllers/Api/V1/Admin/PageController.php` (lock), `app/Support/PublicSettings.php`, `app/Enums/StaffNotificationKind.php`, `app/Support/Notifications/ScreenAccess.php`, `app/Providers/AppServiceProvider.php` (morph map), `routes/api.php`, `routes/console.php`.

Web (`web/`):
- `src/lib/ab-choice.ts` + `scripts/ab-choice.check.mjs` — the pre-paint statement, the ids, the style.
- `src/components/page-sections/ab-pair.tsx` — the wrapper.
- Modify: `src/app/layout.tsx`, `src/components/page-sections/page-sections.tsx`, `src/types/page-sections.ts`, `src/lib/analytics-beacon.ts`, `scripts/analytics-beacon.check.mjs`, `src/components/layout/analytics-beacon.tsx`, `scripts/audit.mjs`.
- `src/types/section-tests.ts`, `src/lib/admin/section-tests.ts` (+ `index.ts`), `src/types/api.ts` (`AdminPage.section_tests`).
- `src/app/admin/(app)/section-tests/{page.tsx,[id]/page.tsx,actions.ts,test-buttons.tsx,test-previews.tsx}`.
- `src/app/admin/(app)/pages/builder/{section-test-dialog.tsx,section-test-action.ts}`; modify `section-builder.tsx`, `page-form.tsx`.
- Modify: `src/app/admin/(app)/nav-items.tsx`, `src/components/ui/toast-from-params.tsx`, `src/lib/help-routes.ts`, `src/lib/tours.ts`, `scripts/audit.mjs`, `scripts/mobile-audit.mjs`, `mock-api.mjs`, `src/lib/version.ts`.
- `scripts/probes/section-ab.mjs`.

Docs: `docs/section-tests.md`, `CLAUDE.md`, `API.md`, `manual/39-section-tests.md`, `manual/00-README.md`, `VERSION.md`.

---

### Task 1: The tables, the status and the models

**Files:**
- Create: `api/database/migrations/2026_10_28_100000_create_section_tests_tables.php`, `api/app/Enums/SectionTestStatus.php`, `api/app/Models/SectionTest.php`, `api/app/Models/SectionTestTally.php`
- Modify: `api/app/Models/Page.php`, `api/app/Providers/AppServiceProvider.php` (morph map, near line 241 `'page' => Page::class`), `api/app/Enums/StaffNotificationKind.php`
- Test: `api/tests/Feature/SectionTestModelTest.php`

**Interfaces:**
- Produces:
  - `SectionTestStatus::{Draft, Running, Ended}` with `label(): string`, `canTransitionTo(self $next): bool` (draft→running, running→ended only), `deletable(): bool` (draft or ended), `options(): list<array{value: string, label: string}>`.
  - `SectionTest` (fillable `page_id, section_id, name, status, variant_b, goal, started_at, ended_at, winner, applied_at, notified_at, results, created_by`; casts `status` enum, `variant_b`/`results` array, the four times datetime); `page(): BelongsTo<Page, $this>`, `creator(): BelongsTo<User, $this>`, `tallies(): HasMany<SectionTestTally, $this>`; `scopeRunning(Builder): Builder`.
  - `SectionTestTally` (no timestamps; casts `day` date, `converted_at` datetime).
  - `Page::sectionTests(): HasMany<SectionTest, $this>`.
  - Morph alias `section_test`.
  - `StaffNotificationKind::SectionTestResult = 'section_test_result'`, label "A/B test result", group `alert`, `delivers()` false.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Enums\SectionTestStatus;
use App\Enums\StaffNotificationKind;
use App\Models\Page;
use App\Models\SectionTest;
use App\Models\SectionTestTally;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class SectionTestModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_status_moves_only_forward_and_a_running_test_cannot_be_deleted(): void
    {
        $this->assertTrue(SectionTestStatus::Draft->canTransitionTo(SectionTestStatus::Running));
        $this->assertTrue(SectionTestStatus::Running->canTransitionTo(SectionTestStatus::Ended));
        $this->assertFalse(SectionTestStatus::Draft->canTransitionTo(SectionTestStatus::Ended), 'a draft is deleted, never ended');
        $this->assertFalse(SectionTestStatus::Ended->canTransitionTo(SectionTestStatus::Running));
        $this->assertTrue(SectionTestStatus::Draft->deletable());
        $this->assertTrue(SectionTestStatus::Ended->deletable());
        $this->assertFalse(SectionTestStatus::Running->deletable());
    }

    public function test_deleting_the_page_deletes_its_tests_and_their_tallies(): void
    {
        $page = Page::create(['title' => 'P', 'slug' => 'p', 'template' => 'builder', 'status' => 'published', 'blocks' => []]);
        $test = SectionTest::create(['page_id' => $page->id, 'section_id' => (string) Str::uuid(), 'name' => 'T', 'status' => 'running', 'goal' => 'click', 'variant_b' => ['heading' => 'B']]);
        SectionTestTally::create(['section_test_id' => $test->id, 'day' => '2026-10-21', 'visitor' => random_bytes(16), 'variant' => 'a']);

        $page->delete();

        $this->assertSame(0, SectionTest::count());
        $this->assertSame(0, SectionTestTally::count());
    }

    public function test_the_bell_kind_is_bell_only(): void
    {
        $this->assertSame('alert', StaffNotificationKind::SectionTestResult->group());
        $this->assertFalse(StaffNotificationKind::SectionTestResult->delivers());
        $this->assertSame('section_test', (new SectionTest)->getMorphClass());
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api; php artisan test --filter=SectionTestModelTest`
Expected: FAIL — `Class "App\Enums\SectionTestStatus" not found`.

- [ ] **Step 3: Write the migration, the enum and the models**

Migration:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Section A/B tests (C4, docs/section-tests.md). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('section_tests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('page_id')->constrained()->cascadeOnDelete();
            $table->uuid('section_id');
            $table->string('name', 120);
            $table->string('status', 10)->default('draft');
            $table->json('variant_b');
            $table->string('goal', 24);
            $table->dateTime('started_at')->nullable();
            $table->dateTime('ended_at')->nullable();
            $table->char('winner', 1)->nullable();
            $table->dateTime('applied_at')->nullable();
            $table->dateTime('notified_at')->nullable();
            $table->json('results')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['status', 'page_id']);
        });

        Schema::create('section_test_tallies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('section_test_id')->constrained()->cascadeOnDelete();
            $table->date('day');
            $table->binary('visitor', 16);
            $table->char('variant', 1);
            $table->dateTime('converted_at')->nullable();
            $table->unique(['section_test_id', 'day', 'visitor'], 'section_test_tallies_unique');
            $table->index(['day', 'visitor']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('section_test_tallies');
        Schema::dropIfExists('section_tests');
    }
};
```

`app/Enums/SectionTestStatus.php`:

```php
<?php

namespace App\Enums;

/** A section test's life (C4): draft → running → ended. A draft is deleted, never ended. */
enum SectionTestStatus: string
{
    case Draft = 'draft';
    case Running = 'running';
    case Ended = 'ended';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Running => 'Running',
            self::Ended => 'Ended',
        };
    }

    public function canTransitionTo(self $next): bool
    {
        return ($this === self::Draft && $next === self::Running) || ($this === self::Running && $next === self::Ended);
    }

    public function deletable(): bool
    {
        return $this !== self::Running;
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $s) => ['value' => $s->value, 'label' => $s->label()], self::cases());
    }
}
```

`app/Models/SectionTest.php`:

```php
<?php

namespace App\Models;

use App\Enums\SectionTestStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One section's A/B test (C4, docs/section-tests.md). `variant_b` is version B's `data`, normalised as a section's is. */
class SectionTest extends Model
{
    protected $fillable = ['page_id', 'section_id', 'name', 'status', 'variant_b', 'goal', 'started_at', 'ended_at', 'winner', 'applied_at', 'notified_at', 'results', 'created_by'];

    protected function casts(): array
    {
        return [
            'status' => SectionTestStatus::class, 'variant_b' => 'array', 'results' => 'array',
            'started_at' => 'datetime', 'ended_at' => 'datetime', 'applied_at' => 'datetime', 'notified_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Page, $this> */
    public function page(): BelongsTo
    {
        return $this->belongsTo(Page::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return HasMany<SectionTestTally, $this> */
    public function tallies(): HasMany
    {
        return $this->hasMany(SectionTestTally::class);
    }

    public function scopeRunning(Builder $query): Builder
    {
        return $query->where('status', SectionTestStatus::Running);
    }
}
```

`app/Models/SectionTestTally.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One visitor-day that saw a tested section (C4). Kept until the test is deleted. */
class SectionTestTally extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['day' => 'date', 'converted_at' => 'datetime'];
    }
}
```

In `Page.php` add (with `use Illuminate\Database\Eloquent\Relations\HasMany;`):

```php
    /** @return HasMany<SectionTest, $this> */
    public function sectionTests(): HasMany
    {
        return $this->hasMany(SectionTest::class);
    }
```

In `AppServiceProvider`'s `Relation::enforceMorphMap([...])` add `'section_test' => \App\Models\SectionTest::class,` (with its `use`). A bell row's subject is stored by alias, and `enforceMorphMap` throws for a model it does not know.

In `StaffNotificationKind` add the case `SectionTestResult = 'section_test_result'`. Add `self::SectionTestResult => 'A/B test result',` to `label()`. Change `group()`'s alert arm to `self::Alert, self::SectionTestResult => 'alert',`. Change `delivers()` to:

```php
        return ! in_array($this, [self::Alert, self::JobFinished, self::SectionTestResult], true);
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd api; php artisan test --filter=SectionTestModelTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd api; ./vendor/bin/pint app/Enums/SectionTestStatus.php app/Models/SectionTest.php app/Models/SectionTestTally.php app/Models/Page.php app/Enums/StaffNotificationKind.php app/Providers/AppServiceProvider.php database/migrations/2026_10_28_100000_create_section_tests_tables.php tests/Feature/SectionTestModelTest.php
cd ..; git add api/database/migrations/2026_10_28_100000_create_section_tests_tables.php api/app/Enums/SectionTestStatus.php api/app/Models/SectionTest.php api/app/Models/SectionTestTally.php api/app/Models/Page.php api/app/Providers/AppServiceProvider.php api/app/Enums/StaffNotificationKind.php api/tests/Feature/SectionTestModelTest.php
git commit -m "Section tests: the tables, the status and the models

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The verdict

**Files:**
- Create: `api/app/Support/Tests/Verdict.php`
- Test: `api/tests/Unit/SectionTestVerdictTest.php`

**Interfaces:**
- Produces:
  - `Verdict::MIN_VISITORS = 300`, `MIN_GOALS = 10`, `CLEAR = 95`, `LEVEL_VISITORS = 2000`, `LEVEL_RATIO = 0.9`.
  - `Verdict::of(array $figures): array{state: string, leader: ?string, confidence: ?int, sentence: string}`. `$figures` is `['a' => ['visitors' => int, 'goals' => int, 'rate' => ?float], 'b' => [...]]`, the shape `Tallies::figures()` returns. `state` is one of `collecting`, `leading`, `clear` or `level`.
  - `Verdict::rate(int $goals, int $visitors): ?float` — a fraction, or null over no visitors.
  - `Verdict::percent(?float $rate): string` — `4.1%`.

- [ ] **Step 1: Write the failing test (worked figures)**

```php
<?php

namespace Tests\Unit;

use App\Support\Tests\Verdict;
use PHPUnit\Framework\TestCase;

class SectionTestVerdictTest extends TestCase
{
    private static function f(int $av, int $ag, int $bv, int $bg): array
    {
        return ['a' => ['visitors' => $av, 'goals' => $ag, 'rate' => Verdict::rate($ag, $av)], 'b' => ['visitors' => $bv, 'goals' => $bg, 'rate' => Verdict::rate($bg, $bv)]];
    }

    public function test_below_the_floor_says_what_is_still_needed(): void
    {
        $v = Verdict::of(self::f(120, 3, 300, 9));
        $this->assertSame('collecting', $v['state']);
        $this->assertNull($v['confidence']);
        $this->assertSame('About 180 more visitors to go.', $v['sentence']);

        $this->assertSame('About 7 more goals to go.', Verdict::of(self::f(300, 9, 300, 4))['sentence']);
        $this->assertSame('About 1 more goal to go.', Verdict::of(self::f(300, 9, 300, 10))['sentence']);
    }

    public function test_clear_at_95_or_more(): void
    {
        // 3.0% against 5.0% over 1,000 each: z = 2.28, Φ = 0.9888.
        $v = Verdict::of(self::f(1000, 30, 1000, 50));
        $this->assertSame('clear', $v['state']);
        $this->assertSame('b', $v['leader']);
        $this->assertSame(98, $v['confidence']);
        $this->assertSame('Version B is ahead: 5.0% against 3.0%, 98% sure, after 2,000 visitors.', $v['sentence']);
    }

    public function test_leading_under_95(): void
    {
        // 4.0% against 5.0% over 1,000 each: z = 1.08, Φ = 0.8596.
        $v = Verdict::of(self::f(1000, 40, 1000, 50));
        $this->assertSame('leading', $v['state']);
        $this->assertSame(85, $v['confidence']);
        $this->assertSame('Too close to call yet: version B is ahead, 5.0% against 4.0%, 85% sure.', $v['sentence']);
    }

    public function test_a_tie_has_no_leader(): void
    {
        $v = Verdict::of(self::f(500, 20, 500, 20));
        $this->assertSame('leading', $v['state']);
        $this->assertNull($v['leader']);
        $this->assertNull($v['confidence']);
        $this->assertSame('Too close to call yet: both versions convert at 4.0%.', $v['sentence']);
    }

    public function test_level_after_2000_each_within_a_tenth(): void
    {
        $v = Verdict::of(self::f(2100, 84, 2000, 82));
        $this->assertSame('level', $v['state']);
        $this->assertSame('No clear difference after 4,100 visitors — either version will do.', $v['sentence']);

        // The same rates under 2,000 each are only "leading".
        $this->assertSame('leading', Verdict::of(self::f(1000, 40, 1000, 41))['state']);
    }

    public function test_a_rate_over_no_visitors_is_null(): void
    {
        $this->assertNull(Verdict::rate(0, 0));
        $this->assertSame('4.1%', Verdict::percent(0.041));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api; php artisan test --filter=SectionTestVerdictTest`
Expected: FAIL — `Class "App\Support\Tests\Verdict" not found`.

- [ ] **Step 3: Write `Verdict`**

```php
<?php

namespace App\Support\Tests;

/**
 * Which version of a tested section converts better, and how sure that is
 * (C4, docs/section-tests.md). A two-proportion z-test; confidence is the
 * one-sided probability that the leader really converts better, rounded down
 * and never 100. Every sentence is the console's and the bell's.
 */
final class Verdict
{
    public const MIN_VISITORS = 300;

    public const MIN_GOALS = 10;

    public const CLEAR = 95;

    public const LEVEL_VISITORS = 2000;

    /** "Within a tenth of each other": the lower rate is at least this share of the higher. */
    public const LEVEL_RATIO = 0.9;

    public static function rate(int $goals, int $visitors): ?float
    {
        return $visitors > 0 ? $goals / $visitors : null;
    }

    public static function percent(?float $rate): string
    {
        return $rate === null ? '—' : number_format($rate * 100, 1).'%';
    }

    /**
     * @param  array{a: array{visitors: int, goals: int, rate?: ?float}, b: array{visitors: int, goals: int, rate?: ?float}}  $figures
     * @return array{state: string, leader: ?string, confidence: ?int, sentence: string}
     */
    public static function of(array $figures): array
    {
        [$a, $b] = [$figures['a'], $figures['b']];
        $needVisitors = max(0, self::MIN_VISITORS - $a['visitors']) + max(0, self::MIN_VISITORS - $b['visitors']);
        $needGoals = max(0, self::MIN_GOALS - $a['goals']) + max(0, self::MIN_GOALS - $b['goals']);
        if ($needVisitors > 0 || $needGoals > 0) {
            $sentence = $needVisitors > 0
                ? 'About '.number_format($needVisitors).' more '.($needVisitors === 1 ? 'visitor' : 'visitors').' to go.'
                : 'About '.number_format($needGoals).' more '.($needGoals === 1 ? 'goal' : 'goals').' to go.';

            return ['state' => 'collecting', 'leader' => null, 'confidence' => null, 'sentence' => $sentence];
        }

        $pa = $a['goals'] / $a['visitors'];
        $pb = $b['goals'] / $b['visitors'];
        $total = $a['visitors'] + $b['visitors'];

        if ($pa === $pb) {
            return ['state' => 'leading', 'leader' => null, 'confidence' => null, 'sentence' => 'Too close to call yet: both versions convert at '.self::percent($pa).'.'];
        }

        $leader = $pb > $pa ? 'b' : 'a';
        [$hi, $lo] = $leader === 'b' ? [$pb, $pa] : [$pa, $pb];
        $pool = ($a['goals'] + $b['goals']) / $total;
        $se = sqrt($pool * (1 - $pool) * (1 / $a['visitors'] + 1 / $b['visitors']));
        $confidence = $se > 0 ? min(99, (int) floor(self::phi(($hi - $lo) / $se) * 100)) : 99;
        $name = 'Version '.strtoupper($leader);

        if ($confidence >= self::CLEAR) {
            return ['state' => 'clear', 'leader' => $leader, 'confidence' => $confidence,
                'sentence' => "{$name} is ahead: ".self::percent($hi).' against '.self::percent($lo).", {$confidence}% sure, after ".number_format($total).' visitors.'];
        }
        if (min($a['visitors'], $b['visitors']) >= self::LEVEL_VISITORS && $lo >= $hi * self::LEVEL_RATIO) {
            return ['state' => 'level', 'leader' => $leader, 'confidence' => $confidence,
                'sentence' => 'No clear difference after '.number_format($total).' visitors — either version will do.'];
        }

        return ['state' => 'leading', 'leader' => $leader, 'confidence' => $confidence,
            'sentence' => 'Too close to call yet: version '.strtoupper($leader).' is ahead, '.self::percent($hi).' against '.self::percent($lo).", {$confidence}% sure."];
    }

    /** The standard normal CDF (Abramowitz & Stegun 26.2.17, error under 7.5e-8). */
    private static function phi(float $z): float
    {
        $t = 1 / (1 + 0.2316419 * abs($z));
        $d = 0.3989422804014327 * exp(-$z * $z / 2);
        $p = $d * $t * (0.319381530 + $t * (-0.356563782 + $t * (1.781477937 + $t * (-1.821255978 + $t * 1.330274429))));

        return $z >= 0 ? 1 - $p : $p;
    }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd api; php artisan test --filter=SectionTestVerdictTest`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd api; ./vendor/bin/pint app/Support/Tests/Verdict.php tests/Unit/SectionTestVerdictTest.php
cd ..; git add api/app/Support/Tests/Verdict.php api/tests/Unit/SectionTestVerdictTest.php
git commit -m "Section tests: the verdict

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Measurement — exposure, clicks and conversions

**Files:**
- Create: `api/app/Support/Tests/Tallies.php`, `api/app/Support/Tests/SectionTests.php` (only `pathOf()` and `counts()` here; Task 4 grows it)
- Modify: `api/app/Support/Analytics/Collector.php`, `api/app/Support/Analytics/Conversions.php`, `api/app/Http/Controllers/Api/V1/CollectController.php`
- Test: `api/tests/Feature/SectionTestTallyTest.php`

**Interfaces:**
- Consumes: Task 1's models; C3's `Collector::record()` (returns `?AnalyticsHit`), `Visitor::hash/salt/agent`.
- Produces:
  - `Collector::beaconVisitor(Request $request, ?string $rawPath): ?array{day: string, visitor: string, path: string}` — the same refusals and per-address limit as a beacon hit, with no hit written.
  - `SectionTests::pathOf(Page $page): string` — `/` while it is the homepage page, else `/{slug}`.
  - `SectionTests::counts(SectionTest $test): bool` — running, and its page published and `builder`.
  - `Tallies::exposures(mixed $x): array<int, string>` — the beacon's `x` cleaned: numeric ids, `a`|`b`, at most 20.
  - `Tallies::expose(AnalyticsHit $hit, array $x): void`, `Tallies::click(array $who, int $testId, string $variant): void`, `Tallies::convert(AnalyticsHit $hit): void` — never throw.
  - `Tallies::figures(SectionTest $test): array{a: array{visitors: int, goals: int, rate: ?float}, b: array{...}}`, `Tallies::figuresFor(iterable $tests): array<int, array>`, `Tallies::series(SectionTest $test): list<array{date: string, label: string, a_rate: ?float, b_rate: ?float}>` (rates in percent, one decimal, cumulative).

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\AnalyticsHit;
use App\Models\Page;
use App\Models\SectionTest;
use App\Models\SectionTestTally;
use App\Models\Setting;
use App\Support\Analytics\Conversions;
use App\Support\Tests\Tallies;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class SectionTestTallyTest extends TestCase
{
    use RefreshDatabase;

    private const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    private Page $page;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->page = Page::create(['title' => 'Offer', 'slug' => 'offer', 'template' => 'builder', 'status' => 'published', 'blocks' => []]);
    }

    private function test(string $goal = 'click', string $status = 'running', ?Page $page = null): SectionTest
    {
        return SectionTest::create(['page_id' => ($page ?? $this->page)->id, 'section_id' => (string) Str::uuid(), 'name' => 'T', 'status' => $status, 'goal' => $goal, 'variant_b' => [], 'started_at' => now()]);
    }

    private function collect(array $body, string $ip = '203.0.113.7')
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->withHeader('User-Agent', self::CHROME)->postJson('/api/v1/collect', $body);
    }

    public function test_a_page_view_writes_one_row_and_keeps_the_newest_variant_until_converted(): void
    {
        $t = $this->test();
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'w' => 1440, 'x' => [(string) $t->id => 'a']])->assertNoContent();
        $this->assertSame('a', SectionTestTally::sole()->variant);

        $this->collect(['k' => 'pageview', 'p' => '/offer', 'w' => 1440, 'x' => [(string) $t->id => 'b']]);
        $this->assertSame(1, SectionTestTally::count(), 'one row per visitor-day');
        $this->assertSame('b', SectionTestTally::sole()->variant, 'a second tab is credited to the version seen last');

        $this->collect(['k' => 'ab_click', 'p' => '/offer', 't' => $t->id, 'v' => 'b']);
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'w' => 1440, 'x' => [(string) $t->id => 'a']]);
        $row = SectionTestTally::sole();
        $this->assertNotNull($row->converted_at);
        $this->assertSame('b', $row->variant, 'a converted row is frozen');
    }

    public function test_an_ended_or_unknown_test_or_another_path_writes_nothing(): void
    {
        $ended = $this->test(status: 'ended');
        $live = $this->test();
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'x' => [(string) $ended->id => 'a', '999999' => 'b']]);
        $this->collect(['k' => 'pageview', 'p' => '/somewhere-else', 'x' => [(string) $live->id => 'a']]);
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'x' => [(string) $live->id => 'c', 'x1' => 'a']]);
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'x' => 'nonsense'])->assertNoContent();
        $this->assertSame(0, SectionTestTally::count());
    }

    public function test_the_homepage_page_is_counted_at_slash(): void
    {
        Setting::query()->where('key', 'homepage_page_id')->update(['value' => (string) $this->page->id]);
        Setting::flushCache();
        $t = $this->test();
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'x' => [(string) $t->id => 'a']]);
        $this->assertSame(0, SectionTestTally::count(), 'the homepage page lives at /');
        $this->collect(['k' => 'pageview', 'p' => '/', 'x' => [(string) $t->id => 'a']]);
        $this->assertSame(1, SectionTestTally::count());
    }

    public function test_an_unpublished_page_counts_nothing(): void
    {
        $t = $this->test();
        $this->page->update(['status' => 'draft']);
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'x' => [(string) $t->id => 'a']]);
        $this->collect(['k' => 'ab_click', 'p' => '/offer', 't' => $t->id, 'v' => 'a']);
        $this->assertSame(0, SectionTestTally::count());
        $this->assertSame('running', $t->fresh()->status->value);
    }

    public function test_a_click_with_no_exposure_writes_a_converted_row_and_a_conversion_with_none_writes_nothing(): void
    {
        $click = $this->test('click');
        $this->collect(['k' => 'ab_click', 'p' => '/offer', 't' => $click->id, 'v' => 'b']);
        $row = SectionTestTally::sole();
        $this->assertSame('b', $row->variant);
        $this->assertNotNull($row->converted_at);
        $this->assertSame(0, AnalyticsHit::count(), 'a click is not a hit');

        $enquiry = $this->test('enquiry');
        // A visitor who converts with no page view on record: the hit is written, no tally row is.
        Conversions::record('enquiry', ['source_path' => '/offer']);
        $this->assertSame(1, AnalyticsHit::query()->where('kind', 'enquiry')->count());
        $this->assertSame(0, SectionTestTally::query()->where('section_test_id', $enquiry->id)->count());
    }

    public function test_a_click_goal_ignores_a_conversion_and_a_conversion_goal_ignores_a_click(): void
    {
        $t = $this->test('enquiry');
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'x' => [(string) $t->id => 'a']]);
        $this->collect(['k' => 'ab_click', 'p' => '/offer', 't' => $t->id, 'v' => 'a']);
        $this->assertNull(SectionTestTally::sole()->converted_at);
    }

    public function test_a_conversion_on_the_same_day_credits_and_another_day_does_not(): void
    {
        $t = $this->test('enquiry');
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'x' => [(string) $t->id => 'b']]);
        $hit = AnalyticsHit::sole();

        // Tomorrow's hash is another visitor: no credit.
        $tomorrow = AnalyticsHit::create(['day' => now()->addDay()->toDateString(), 'at' => now()->addDay(), 'kind' => 'enquiry', 'visitor' => random_bytes(16), 'entry' => false]);
        Tallies::convert($tomorrow);
        $this->assertNull(SectionTestTally::sole()->converted_at);

        $same = AnalyticsHit::create(['day' => $hit->day->toDateString(), 'at' => now(), 'kind' => 'enquiry', 'visitor' => $hit->visitor, 'entry' => false]);
        Tallies::convert($same);
        $this->assertNotNull(SectionTestTally::sole()->converted_at);
    }

    public function test_switched_off_or_a_bot_counts_nothing(): void
    {
        $t = $this->test();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])->withHeader('User-Agent', 'Googlebot/2.1')
            ->postJson('/api/v1/collect', ['k' => 'ab_click', 'p' => '/offer', 't' => $t->id, 'v' => 'a']);
        Setting::query()->where('key', 'native_analytics_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->collect(['k' => 'pageview', 'p' => '/offer', 'x' => [(string) $t->id => 'a']]);
        $this->assertSame(0, SectionTestTally::count());
    }

    public function test_the_figures_and_the_series(): void
    {
        $t = $this->test();
        foreach ([['a', true], ['a', false], ['b', true], ['b', true]] as [$v, $done]) {
            SectionTestTally::create(['section_test_id' => $t->id, 'day' => now()->toDateString(), 'visitor' => random_bytes(16), 'variant' => $v, 'converted_at' => $done ? now() : null]);
        }
        $f = Tallies::figures($t);
        $this->assertSame(['visitors' => 2, 'goals' => 1, 'rate' => 0.5], $f['a']);
        $this->assertSame(['visitors' => 2, 'goals' => 2, 'rate' => 1.0], $f['b']);
        $this->assertSame(['visitors' => 0, 'goals' => 0, 'rate' => null], Tallies::figures($this->test())['a']);
        $s = Tallies::series($t);
        $this->assertSame(50.0, $s[0]['a_rate']);
        $this->assertSame(100.0, $s[0]['b_rate']);
    }
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd api; php artisan test --filter=SectionTestTallyTest`
Expected: FAIL — `Class "App\Support\Tests\Tallies" not found`.

- [ ] **Step 3: `Collector::beaconVisitor()`**

Add to `Collector` after `record()`:

```php
    /**
     * The visitor of a beacon that writes no hit (C4's `ab_click`): the same
     * refusals and the same per-address limit as a beacon hit in record().
     * shortcut: duplicates record()'s beacon refusals; fold both into one helper if a third caller appears.
     *
     * @return array{day: string, visitor: string, path: string}|null
     */
    public static function beaconVisitor(Request $request, ?string $rawPath): ?array
    {
        try {
            if (! self::enabled()) {
                return null;
            }
            $ua = Visitor::agent($request);
            $ip = (string) $request->ip();
            $path = self::path($rawPath);
            if ($path === null || Bots::is($ua) || self::excludedIp($ip) || self::isStaff($request)) {
                return null;
            }
            $limit = 'analytics:collect:'.$ip;
            if (RateLimiter::tooManyAttempts($limit, self::PER_MINUTE)) {
                return null;
            }
            RateLimiter::hit($limit, 60);
            $day = now()->setTimezone((string) config('app.timezone'))->toDateString();
            if (Visitor::salt($day) === '') {
                return null;
            }

            return ['day' => $day, 'visitor' => Visitor::hash($ip, (string) $ua, $day), 'path' => $path];
        } catch (Throwable $e) {
            Log::warning('Analytics: a beacon visitor was not worked out', ['error' => $e->getMessage()]);

            return null;
        }
    }
```

- [ ] **Step 4: `SectionTests::pathOf()` / `counts()` and `Tallies`**

`app/Support/Tests/SectionTests.php` (Task 4 adds the rest):

```php
<?php

namespace App\Support\Tests;

use App\Enums\PublishStatus;
use App\Enums\SectionTestStatus;
use App\Models\Page;
use App\Models\SectionTest;
use App\Models\Setting;

/** Section A/B tests (C4, docs/section-tests.md): the rules, the moves and the lock. */
final class SectionTests
{
    /** Where the page is read: `/` while it is the homepage page (its own slug 301s there), else `/{slug}`. */
    public static function pathOf(Page $page): string
    {
        return (string) Setting::get('homepage_page_id') === (string) $page->id ? '/' : '/'.$page->slug;
    }

    /** A running test on a published builder page: the only kind that counts anything. */
    public static function counts(SectionTest $test): bool
    {
        $page = $test->page;

        return $test->status === SectionTestStatus::Running && $page !== null
            && $page->status === PublishStatus::Published && $page->template === 'builder';
    }
}
```

`app/Support/Tests/Tallies.php`:

```php
<?php

namespace App\Support\Tests;

use App\Models\AnalyticsHit;
use App\Models\SectionTest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The one writer and reader of section_test_tallies (C4). One row is one
 * visitor-day that saw a tested section; `converted_at` is the goal. Never
 * throws: a count is never worth a failed beacon or a failed order.
 */
final class Tallies
{
    private const TABLE = 'section_test_tallies';

    /** @return array<int, string> test id => a|b, at most twenty, everything else dropped */
    public static function exposures(mixed $x): array
    {
        if (! is_array($x)) {
            return [];
        }
        $out = [];
        foreach ($x as $id => $v) {
            if (is_string($v) && in_array($v, ['a', 'b'], true) && preg_match('/^\d{1,10}$/', (string) $id) === 1) {
                $out[(int) $id] = $v;
            }
            if (count($out) >= SectionTests::MAX_RUNNING) {
                break;
            }
        }

        return $out;
    }

    /** @param  array<int, string>  $x */
    public static function expose(AnalyticsHit $hit, array $x): void
    {
        try {
            if ($x === [] || $hit->visitor === null) {
                return;
            }
            $day = Carbon::parse($hit->day)->toDateString();
            foreach (self::countingOn(array_keys($x), (string) $hit->path) as $test) {
                $keys = ['section_test_id' => $test->id, 'day' => $day, 'visitor' => $hit->visitor];
                DB::table(self::TABLE)->insertOrIgnore([...$keys, 'variant' => $x[$test->id]]);
                // The version seen last before the goal; a converted row is frozen.
                DB::table(self::TABLE)->where($keys)->whereNull('converted_at')->update(['variant' => $x[$test->id]]);
            }
        } catch (Throwable $e) {
            Log::warning('Section tests: an exposure was not recorded', ['error' => $e->getMessage()]);
        }
    }

    /** @param  array{day: string, visitor: string, path: string}  $who */
    public static function click(array $who, int $testId, string $variant): void
    {
        try {
            $test = self::countingOn([$testId], $who['path'])->first();
            if ($test === null || $test->goal !== 'click' || ! in_array($variant, ['a', 'b'], true)) {
                return;
            }
            $keys = ['section_test_id' => $test->id, 'day' => $who['day'], 'visitor' => $who['visitor']];
            // The page view was lost: the beacon's own version stands in.
            DB::table(self::TABLE)->insertOrIgnore([...$keys, 'variant' => $variant, 'converted_at' => now()]);
            DB::table(self::TABLE)->where($keys)->whereNull('converted_at')->update(['converted_at' => now()]);
        } catch (Throwable $e) {
            Log::warning('Section tests: a click was not recorded', ['error' => $e->getMessage()]);
        }
    }

    /** A conversion credits that visitor's rows of the same day, for running tests with that goal. Never writes a row. */
    public static function convert(AnalyticsHit $hit): void
    {
        try {
            if ($hit->visitor === null) {
                return;
            }
            $ids = SectionTest::query()->running()->where('goal', $hit->kind)->pluck('id');
            if ($ids->isEmpty()) {
                return;
            }
            DB::table(self::TABLE)->whereIn('section_test_id', $ids)
                ->where('day', Carbon::parse($hit->day)->toDateString())->where('visitor', $hit->visitor)
                ->whereNull('converted_at')->update(['converted_at' => now()]);
        } catch (Throwable $e) {
            Log::warning('Section tests: a conversion was not credited', ['error' => $e->getMessage()]);
        }
    }

    /** @return array{a: array{visitors: int, goals: int, rate: ?float}, b: array{visitors: int, goals: int, rate: ?float}} */
    public static function figures(SectionTest $test): array
    {
        return self::figuresFor([$test])[$test->id];
    }

    /**
     * @param  iterable<SectionTest>  $tests
     * @return array<int, array{a: array{visitors: int, goals: int, rate: ?float}, b: array{visitors: int, goals: int, rate: ?float}}>
     */
    public static function figuresFor(iterable $tests): array
    {
        $out = [];
        $ids = [];
        foreach ($tests as $t) {
            $ids[] = $t->id;
            $out[$t->id] = ['a' => ['visitors' => 0, 'goals' => 0, 'rate' => null], 'b' => ['visitors' => 0, 'goals' => 0, 'rate' => null]];
        }
        if ($ids === []) {
            return $out;
        }
        $rows = DB::table(self::TABLE)->whereIn('section_test_id', $ids)
            ->selectRaw('section_test_id, variant, COUNT(*) AS visitors, COUNT(converted_at) AS goals')
            ->groupBy('section_test_id', 'variant')->get();
        foreach ($rows as $r) {
            $v = (string) $r->variant;
            $out[(int) $r->section_test_id][$v] = ['visitors' => (int) $r->visitors, 'goals' => (int) $r->goals, 'rate' => Verdict::rate((int) $r->goals, (int) $r->visitors)];
        }

        return $out;
    }

    /** @return list<array{date: string, label: string, a_rate: ?float, b_rate: ?float}> each version's running rate, in percent */
    public static function series(SectionTest $test): array
    {
        $rows = DB::table(self::TABLE)->where('section_test_id', $test->id)
            ->selectRaw('day, variant, COUNT(*) AS visitors, COUNT(converted_at) AS goals')
            ->groupBy('day', 'variant')->orderBy('day')->get()->groupBy('day');
        $sum = ['a' => [0, 0], 'b' => [0, 0]];
        $out = [];
        foreach ($rows as $day => $parts) {
            foreach ($parts as $r) {
                $sum[(string) $r->variant][0] += (int) $r->visitors;
                $sum[(string) $r->variant][1] += (int) $r->goals;
            }
            $rate = fn (string $v) => $sum[$v][0] > 0 ? round($sum[$v][1] / $sum[$v][0] * 100, 1) : null;
            $date = Carbon::parse((string) $day)->toDateString();
            $out[] = ['date' => $date, 'label' => Carbon::parse($date)->format('j M'), 'a_rate' => $rate('a'), 'b_rate' => $rate('b')];
        }

        return $out;
    }

    /**
     * @param  list<int>  $ids
     * @return \Illuminate\Support\Collection<int, SectionTest>
     */
    private static function countingOn(array $ids, string $path)
    {
        return SectionTest::query()->running()->whereIn('id', $ids)->with('page')->get()
            ->filter(fn (SectionTest $t) => SectionTests::counts($t) && $t->page !== null && SectionTests::pathOf($t->page) === $path)
            ->keyBy('id');
    }
}
```

Add `public const MAX_RUNNING = 20;` to `SectionTests` now; `Tallies::exposures` reads it. Task 4 adds the other limits beside it.

- [ ] **Step 5: The collect door and the conversion credit**

In `CollectController::__invoke`, replace the `if` body so that:

```php
        if (is_array($body) && ($body['k'] ?? null) === 'ab_click') {
            $t = $body['t'] ?? null;
            $test = is_int($t) ? $t : (is_string($t) && ctype_digit($t) ? (int) $t : null);
            $v = in_array($body['v'] ?? null, ['a', 'b'], true) ? $body['v'] : null;
            $who = $test !== null && $v !== null ? Collector::beaconVisitor($request, is_string($body['p'] ?? null) ? $body['p'] : null) : null;
            if ($who !== null) {
                Tallies::click($who, $test, $v);
            }
        } elseif (is_array($body) && in_array($body['k'] ?? null, self::BEACON_KINDS, true)) {
            // … the existing $kind / $target / Collector::record(...) lines, with the call assigned:
            $hit = Collector::record($request, $kind, [/* unchanged */]);
            // C4: which version of each tested section this page view showed.
            if ($hit !== null && $kind === 'pageview') {
                Tallies::expose($hit, Tallies::exposures($body['x'] ?? null));
            }
        }
```

Add `use App\Support\Tests\Tallies;`. Update the class docblock to say `x` and `ab_click` are C4's.

In `Conversions::record`, assign the `Collector::record(...)` call to `$hit` and add after it:

```php
            if ($hit !== null) {
                Tallies::convert($hit); // C4: credits a tested section shown to this visitor today
            }
```

with `use App\Support\Tests\Tallies;`.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cd api; php artisan test --filter="SectionTestTallyTest|AnalyticsCollectTest|AnalyticsConversionsTest"`
Expected: PASS — every new test, and C3's two suites unchanged.

- [ ] **Step 7: Commit**

```bash
cd api; ./vendor/bin/pint app/Support/Tests app/Support/Analytics/Collector.php app/Support/Analytics/Conversions.php app/Http/Controllers/Api/V1/CollectController.php tests/Feature/SectionTestTallyTest.php
cd ..; git add api/app/Support/Tests api/app/Support/Analytics/Collector.php api/app/Support/Analytics/Conversions.php api/app/Http/Controllers/Api/V1/CollectController.php api/tests/Feature/SectionTestTallyTest.php
git commit -m "Section tests: exposure, clicks and conversions on the collect path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The staff API, the public read and the setting

**Files:**
- Create: `api/app/Http/Requests/SectionTestRequest.php`, `api/app/Http/Controllers/Api/V1/Admin/SectionTestController.php`, `api/app/Http/Resources/Admin/SectionTestResource.php`, `api/routes/api/admin-section-tests.php`
- Modify: `api/app/Support/Tests/SectionTests.php`, `api/app/Support/PageSections/SectionPresenter.php` (`present()` gains `$tests`), `api/app/Http/Resources/PageResource.php`, `api/app/Http/Resources/Admin/PageResource.php` (`section_tests`; `mediaUrls` made public), `api/app/Http/Controllers/Api/V1/Admin/PageController.php` (`builder()` gains `section_test_goals`), `api/app/Support/PublicSettings.php`, `api/routes/api.php` (require after `admin-analytics.php`)
- Test: `api/tests/Feature/SectionTestApiTest.php`

**Interfaces:**
- Consumes: Tasks 1–3; `SectionRules::forPayload/messages/after/normalise`, `SanitisesRichText`, `Kinds::CONVERSIONS`/`Kinds::label`, `Collector::enabled()`.
- Produces:
  - `SectionTests::MAX_PER_PAGE = 3`, `MAX_RUNNING = 20`, `MAX_DAYS = 60`, `EXCLUDED_TYPES = ['theme_section', 'subnav', 'custom_code', 'saved', 'countdown']`.
  - `SectionTests::goals(): list<string>`, `goalOptions(): list<array{value: string, label: string}>`, `goalLabel(string): string`, `allows(?PageSectionType): bool`.
  - `SectionTests::block(Page $page, string $sectionId): ?array{index: int, block: array<string, mixed>}`.
  - `SectionTests::refusalForSection(?Page $page, ?string $sectionId): ?string`.
  - `SectionTests::start(SectionTest $test): void`, `end(SectionTest $test, ?string $keep): void`. Both throw `ValidationException`.
  - `SectionTests::runningIds(): string` (comma-joined), `runningFor(Page $page): array<string, array{id: int, data: array}>`, `forPage(Page $page): array<string, array{id: int, status: string}>`, `notes(SectionTest $test): list<string>`, `verdictOf(SectionTest $test): ?array`, `figuresOf(SectionTest $test): ?array`.
  - `SectionPresenter::present(?array $blocks, ?Page $page = null, array $except = [], array $tests = [])` — a section whose id is in `$tests` gains `'test' => ['id' => int, 'data' => object]`.
  - Routes `admin.section-tests.{index,store,show,update,destroy,start,end}` (`apply` in Task 5).
  - `GET /admin/pages/builder` gains `section_test_goals: [{value, label}]` and `section_test_excluded: string[]`; `GET /admin/pages/{id}` gains `section_tests`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Page;
use App\Models\Role;
use App\Models\SectionTest;
use App\Models\SectionTestTally;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class SectionTestApiTest extends TestCase
{
    use RefreshDatabase;

    private Page $page;

    private string $heroId;

    private string $faqId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->heroId = (string) Str::uuid();
        $this->faqId = (string) Str::uuid();
        $this->page = Page::create(['title' => 'Offer', 'slug' => 'offer', 'template' => 'builder', 'status' => 'published', 'blocks' => [
            ['id' => $this->heroId, 'type' => 'hero', 'hidden' => false, 'background' => null, 'data' => ['heading' => 'Version A', 'layout' => 'centered']],
            ['id' => $this->faqId, 'type' => 'faq', 'hidden' => false, 'background' => null, 'data' => ['source' => 'custom', 'items' => [['question' => 'QA?', 'answer' => 'A']]]],
            ['id' => (string) Str::uuid(), 'type' => 'countdown', 'hidden' => false, 'background' => null, 'data' => ['heading' => 'Soon', 'ends_at' => '2030-01-01T10:00']],
        ]]);
    }

    private function editor(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::firstOrCreate(['email' => "ab-{$role->value}@example.test"], ['name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user;
    }

    private function make(array $over = [])
    {
        return $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/section-tests', array_replace([
            'page_id' => $this->page->id, 'section_id' => $this->heroId, 'name' => 'Offer — hero', 'goal' => 'click',
            'variant_b' => ['heading' => 'Version B', 'layout' => 'centered'],
        ], $over));
    }

    public function test_a_draft_is_made_with_b_normalised_and_only_a_content_manager_may(): void
    {
        $id = $this->make(['variant_b' => ['heading' => 'Version B', 'layout' => 'centered', 'junk' => 'x']])
            ->assertCreated()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.verdict', null)->json('data.id');
        $this->assertSame(['heading' => 'Version B', 'layout' => 'centered'], SectionTest::find($id)->variant_b);

        $this->actingAs($this->editor(RoleEnum::SupportEngineer), 'sanctum')->getJson('/api/v1/admin/section-tests')->assertForbidden();
    }

    public function test_b_is_held_to_the_section_rules_and_its_rich_text_is_sanitised(): void
    {
        $this->make(['variant_b' => ['heading' => 'B', 'layout' => 'diagonal']])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.layout');
        $this->make(['variant_b' => ['heading' => 'B', 'layout' => 'split', 'image_path' => 'media/gone.jpg']])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.image_path');

        $text = (string) Str::uuid();
        $blocks = $this->page->blocks;
        $blocks[] = ['id' => $text, 'type' => 'rich_text', 'hidden' => false, 'background' => null, 'data' => ['body' => '<p>A</p>']];
        $this->page->update(['blocks' => $blocks]);
        $id = $this->make(['section_id' => $text, 'variant_b' => ['body' => '<p>B</p><script>alert(1)</script>']])->assertCreated()->json('data.id');
        $this->assertStringNotContainsString('<script', SectionTest::find($id)->variant_b['body']);
    }

    public function test_an_excluded_type_a_missing_section_and_a_default_page_are_refused(): void
    {
        $countdown = $this->page->blocks[2]['id'];
        $this->make(['section_id' => $countdown, 'variant_b' => ['heading' => 'B', 'ends_at' => '2030-01-01T10:00']])->assertStatus(422)->assertJsonValidationErrors('section_id');
        $this->make(['section_id' => (string) Str::uuid()])->assertStatus(422)->assertJsonValidationErrors('section_id');
        $this->page->update(['template' => 'default']);
        $this->make()->assertStatus(422)->assertJsonValidationErrors('section_id');
    }

    public function test_start_needs_analytics_and_a_published_page_and_keeps_the_limits(): void
    {
        $id = $this->make()->json('data.id');
        Setting::query()->where('key', 'native_analytics_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->postJson("/api/v1/admin/section-tests/{$id}/start")->assertStatus(422)->assertJsonPath('errors.section_id.0', 'Switch native analytics on first.');
        Setting::query()->where('key', 'native_analytics_enabled')->update(['value' => '1']);
        Setting::flushCache();

        $this->postJson("/api/v1/admin/section-tests/{$id}/start")->assertOk()->assertJsonPath('data.status', 'running');
        $second = $this->make()->json('data.id');
        $this->postJson("/api/v1/admin/section-tests/{$second}/start")->assertStatus(422)->assertJsonValidationErrors('section_id');

        // Three per page: fill the page with two more, then a fourth is refused.
        foreach (range(1, 3) as $n) {
            $sid = (string) Str::uuid();
            $blocks = $this->page->fresh()->blocks;
            $blocks[] = ['id' => $sid, 'type' => 'divider', 'hidden' => false, 'background' => null, 'data' => ['size' => 'small']];
            $this->page->update(['blocks' => $blocks]);
            $tid = $this->make(['section_id' => $sid, 'variant_b' => ['size' => 'large']])->json('data.id');
            $res = $this->postJson("/api/v1/admin/section-tests/{$tid}/start");
            $n < 3 ? $res->assertOk() : $res->assertStatus(422)->assertJsonPath('errors.section_id.0', 'This page already has 3 tests running.');
        }
    }

    public function test_twenty_site_wide(): void
    {
        foreach (range(1, 20) as $n) {
            SectionTest::create(['page_id' => $this->page->id, 'section_id' => (string) Str::uuid(), 'name' => "T{$n}", 'status' => 'running', 'goal' => 'click', 'variant_b' => []]);
        }
        $other = Page::create(['title' => 'Two', 'slug' => 'two', 'template' => 'builder', 'status' => 'published', 'blocks' => $this->page->blocks]);
        $id = $this->make(['page_id' => $other->id])->json('data.id');
        $this->postJson("/api/v1/admin/section-tests/{$id}/start")->assertStatus(422)->assertJsonPath('errors.section_id.0', '20 tests are already running across the site.');
    }

    public function test_patch_is_for_drafts_and_a_running_test_cannot_be_deleted(): void
    {
        $id = $this->make()->json('data.id');
        $this->patchJson("/api/v1/admin/section-tests/{$id}", ['name' => 'Renamed'])->assertOk()->assertJsonPath('data.name', 'Renamed');
        $this->postJson("/api/v1/admin/section-tests/{$id}/start");
        $this->patchJson("/api/v1/admin/section-tests/{$id}", ['name' => 'Again'])->assertStatus(422)->assertJsonValidationErrors('status');
        $this->deleteJson("/api/v1/admin/section-tests/{$id}")->assertStatus(422)->assertJsonPath('errors.status.0', 'End the test first.');
        $this->postJson("/api/v1/admin/section-tests/{$id}/end", ['keep' => 'a'])->assertOk()->assertJsonPath('data.winner', 'a')->assertJsonPath('data.status', 'ended');
        $this->assertNotNull(SectionTest::find($id)->results);
        $this->deleteJson("/api/v1/admin/section-tests/{$id}")->assertNoContent();
    }

    public function test_the_public_read_carries_b_for_a_running_test_only_and_faq_schema_stays_a(): void
    {
        $this->getJson('/api/v1/pages/offer')->assertOk()->assertJsonMissingPath('data.sections.0.test');
        $draft = $this->make(['section_id' => $this->faqId, 'variant_b' => ['source' => 'custom', 'items' => [['question' => 'QB?', 'answer' => 'B']]]])->json('data.id');
        $this->getJson('/api/v1/pages/offer')->assertJsonMissingPath('data.sections.1.test');

        $this->postJson("/api/v1/admin/section-tests/{$draft}/start")->assertOk();
        $page = $this->getJson('/api/v1/pages/offer')->assertOk()
            ->assertJsonPath('data.sections.1.test.id', $draft)
            ->assertJsonPath('data.sections.1.test.data.items.0.question', 'QB?');
        $this->assertStringNotContainsString('QB?', json_encode($page->json('data.faq_schema')));

        $this->postJson("/api/v1/admin/section-tests/{$draft}/end");
        $this->getJson('/api/v1/pages/offer')->assertJsonMissingPath('data.sections.1.test');
    }

    public function test_settings_carry_the_running_ids_and_the_admin_page_marks_its_sections(): void
    {
        $this->getJson('/api/v1/settings')->assertJsonMissingPath('data.ab_tests_running');
        $id = $this->make()->json('data.id');
        $this->getJson("/api/v1/admin/pages/{$this->page->id}")->assertJsonPath("data.section_tests.{$this->heroId}.status", 'draft');
        $this->postJson("/api/v1/admin/section-tests/{$id}/start");
        $this->getJson('/api/v1/settings')->assertJsonPath('data.ab_tests_running', (string) $id);
        $this->getJson("/api/v1/admin/pages/{$this->page->id}")->assertJsonPath("data.section_tests.{$this->heroId}.status", 'running');
    }

    public function test_the_list_reports_figures_verdict_and_goals(): void
    {
        $id = $this->make(['goal' => 'enquiry'])->json('data.id');
        $this->postJson("/api/v1/admin/section-tests/{$id}/start");
        foreach (range(1, 4) as $i) {
            SectionTestTally::create(['section_test_id' => $id, 'day' => now()->toDateString(), 'visitor' => random_bytes(16), 'variant' => $i % 2 ? 'a' : 'b', 'converted_at' => $i === 1 ? now() : null]);
        }
        $this->getJson('/api/v1/admin/section-tests')->assertOk()
            ->assertJsonPath('data.0.figures.a.visitors', 2)
            ->assertJsonPath('data.0.figures.a.goals', 1)
            ->assertJsonPath('data.0.figures.b.rate', 0)
            ->assertJsonPath('data.0.verdict.state', 'collecting')
            ->assertJsonPath('data.0.goal_label', 'Enquiries')
            ->assertJsonPath('data.0.page.path', '/offer')
            ->assertJsonPath('data.0.section.heading', 'Version A')
            ->assertJsonPath('meta.goals.0.value', 'click')
            ->assertJsonPath('meta.limits.site', 20);
        $this->getJson("/api/v1/admin/section-tests/{$id}")->assertOk()->assertJsonPath('data.variant_b.heading', 'Version B')->assertJsonCount(1, 'data.series');
        $this->getJson('/api/v1/admin/pages/builder')->assertOk()->assertJsonPath('data.section_test_goals.1.label', 'Enquiries');
    }

    public function test_the_list_marks_an_unpublished_page(): void
    {
        $id = $this->make()->json('data.id');
        $this->postJson("/api/v1/admin/section-tests/{$id}/start");
        $this->page->update(['status' => 'draft']);
        $this->getJson('/api/v1/admin/section-tests')->assertOk()->assertJsonPath('data.0.notes.0', 'Page not published');
    }
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd api; php artisan test --filter=SectionTestApiTest`
Expected: FAIL — 404 on `/api/v1/admin/section-tests`.

- [ ] **Step 3: Grow `SectionTests`**

Add to the class from Task 3 (imports: `App\Enums\PageSectionType`, `App\Support\Analytics\Collector`, `App\Support\Analytics\Kinds`, `App\Support\PageSections\SectionRules`, `Illuminate\Support\Facades\DB`, `Illuminate\Validation\ValidationException`):

```php
    public const MAX_PER_PAGE = 3;

    // MAX_RUNNING = 20 is already here from Task 3.

    public const MAX_DAYS = 60;

    public const EXCLUDED_TYPES = ['theme_section', 'subnav', 'custom_code', 'saved', 'countdown'];

    private const CLICK_LABEL = 'A press on a button or link in the section';

    /** @return list<string> */
    public static function goals(): array
    {
        return ['click', ...Kinds::CONVERSIONS];
    }

    /** @return list<array{value: string, label: string}> */
    public static function goalOptions(): array
    {
        return array_map(fn (string $g) => ['value' => $g, 'label' => self::goalLabel($g)], self::goals());
    }

    public static function goalLabel(string $goal): string
    {
        return $goal === 'click' ? self::CLICK_LABEL : Kinds::label($goal);
    }

    public static function allows(?PageSectionType $type): bool
    {
        return $type !== null && ! $type->isRecordBlock() && ! in_array($type->value, self::EXCLUDED_TYPES, true);
    }

    /** @return array{index: int, block: array<string, mixed>}|null */
    public static function block(Page $page, string $sectionId): ?array
    {
        foreach (array_values($page->blocks ?? []) as $i => $block) {
            if (is_array($block) && ($block['id'] ?? null) === $sectionId) {
                return ['index' => $i, 'block' => $block];
            }
        }

        return null;
    }

    public static function refusalForSection(?Page $page, ?string $sectionId): ?string
    {
        if ($page === null || $page->template !== 'builder') {
            return 'Only a section on a builder page can be tested.';
        }
        $found = is_string($sectionId) ? self::block($page, $sectionId) : null;
        if ($found === null) {
            return 'That section is no longer on the page.';
        }

        return self::allows(PageSectionType::tryFrom((string) ($found['block']['type'] ?? ''))) ? null : 'This kind of section cannot be tested.';
    }

    public static function start(SectionTest $test): void
    {
        DB::transaction(function () use ($test) {
            // Every running row locked, so two starts cannot both squeeze under a limit.
            $running = SectionTest::query()->running()->lockForUpdate()->get(['id', 'page_id', 'section_id']);
            $test = SectionTest::query()->whereKey($test->id)->lockForUpdate()->firstOrFail();
            $refuse = fn (string $m) => throw ValidationException::withMessages(['section_id' => $m]);

            if (! $test->status->canTransitionTo(SectionTestStatus::Running)) {
                throw ValidationException::withMessages(['status' => 'Only a draft can be started.']);
            }
            if (! Collector::enabled()) {
                $refuse('Switch native analytics on first.');
            }
            $page = $test->page;
            if ($page === null || $page->status !== PublishStatus::Published) {
                $refuse('Publish the page first.');
            }
            if (($problem = self::refusalForSection($page, $test->section_id)) !== null) {
                $refuse($problem);
            }
            if ($running->contains(fn ($r) => $r->page_id === $test->page_id && $r->section_id === $test->section_id)) {
                $refuse('This section already has a test running.');
            }
            if ($running->where('page_id', $test->page_id)->count() >= self::MAX_PER_PAGE) {
                $refuse('This page already has '.self::MAX_PER_PAGE.' tests running.');
            }
            if ($running->count() >= self::MAX_RUNNING) {
                $refuse(self::MAX_RUNNING.' tests are already running across the site.');
            }

            $test->update(['status' => SectionTestStatus::Running, 'started_at' => now()]);
        });
    }

    public static function end(SectionTest $test, ?string $keep): void
    {
        DB::transaction(function () use ($test, $keep) {
            $test = SectionTest::query()->whereKey($test->id)->lockForUpdate()->firstOrFail();
            if ($test->status !== SectionTestStatus::Running) {
                throw ValidationException::withMessages(['status' => 'This test is not running.']);
            }
            $figures = Tallies::figures($test);
            $test->update([
                'status' => SectionTestStatus::Ended, 'ended_at' => now(),
                'winner' => in_array($keep, ['a', 'b'], true) ? $keep : null,
                'results' => ['figures' => $figures, 'verdict' => Verdict::of($figures)],
            ]);
        });
    }

    /** What `/settings` publishes as `ab_tests_running`. */
    public static function runningIds(): string
    {
        return SectionTest::query()->running()->orderBy('id')->pluck('id')->implode(',');
    }

    /** @return array<string, array{id: int, data: array<string, mixed>}> section id => version B, for the public read */
    public static function runningFor(Page $page): array
    {
        return SectionTest::query()->running()->where('page_id', $page->id)->get(['id', 'section_id', 'variant_b'])
            ->mapWithKeys(fn (SectionTest $t) => [$t->section_id => ['id' => $t->id, 'data' => (array) $t->variant_b]])->all();
    }

    /** @return array<string, array{id: int, status: string}> section id => its draft or running test, running first */
    public static function forPage(Page $page): array
    {
        $out = [];
        foreach (SectionTest::query()->where('page_id', $page->id)->where('status', '!=', 'ended')->orderByRaw("status = 'running'")->orderBy('id')->get(['id', 'section_id', 'status']) as $t) {
            $out[$t->section_id] = ['id' => $t->id, 'status' => $t->status->value];
        }

        return $out;
    }

    /** @return list<string> */
    public static function notes(SectionTest $test): array
    {
        $notes = [];
        $page = $test->page;
        if ($page !== null && $page->status !== PublishStatus::Published) {
            $notes[] = 'Page not published';
        }
        if ($page !== null && self::block($page, $test->section_id) === null) {
            $notes[] = 'The section is no longer on the page';
        }
        if ($test->status === SectionTestStatus::Running && ! Collector::enabled()) {
            $notes[] = 'Native analytics is switched off, so nothing new is counted';
        }

        return $notes;
    }
```

(`orderByRaw("status = 'running'")` sorts running last within the loop, so a running test overwrites a draft for the same section.)

- [ ] **Step 4: The request, the resource, the controller and the routes**

`app/Http/Requests/SectionTestRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Enums\SectionTestStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Models\Page;
use App\Models\SectionTest;
use App\Support\PageSections\SectionRules;
use App\Support\Tests\SectionTests;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A section test (C4). Version B is validated as a one-section `blocks` list
 * by the page builder's own rules, sanitiser and checks, so a 422 on B is
 * keyed `blocks.0.data.<field>`.
 */
class SectionTestRequest extends FormRequest
{
    use SanitisesRichText { prepareForValidation as cleanRichText; }

    protected function richTextFields(): array
    {
        return SectionRules::RICH_TEXT;
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    private function test(): ?SectionTest
    {
        $t = $this->route('sectionTest');

        return $t instanceof SectionTest ? $t : null;
    }

    public function page(): ?Page
    {
        return $this->test()?->page ?? Page::find((int) $this->input('page_id'));
    }

    public function sectionId(): ?string
    {
        return $this->test()?->section_id ?? (is_string($this->input('section_id')) ? $this->input('section_id') : null);
    }

    protected function prepareForValidation(): void
    {
        $page = $this->page();
        $found = $page !== null && $this->sectionId() !== null ? SectionTests::block($page, $this->sectionId()) : null;
        if ($found !== null && is_array($this->input('variant_b'))) {
            $this->merge(['blocks' => [['id' => $found['block']['id'], 'type' => $found['block']['type'], 'data' => $this->input('variant_b')]]]);
        }
        $this->cleanRichText();
    }

    public function rules(): array
    {
        $create = $this->test() === null;

        return [
            ...($create ? ['page_id' => ['required', 'integer', 'exists:pages,id'], 'section_id' => ['required', 'string', 'uuid']] : []),
            'name' => [$create ? 'required' : 'sometimes', 'string', 'max:120'],
            'goal' => [$create ? 'required' : 'sometimes', 'string', Rule::in(SectionTests::goals())],
            'variant_b' => [$create ? 'present' : 'sometimes', 'array'],
            ...SectionRules::forPayload($this->input('blocks')),
        ];
    }

    public function messages(): array
    {
        return SectionRules::messages('blocks', $this->input('blocks'));
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $test = $this->test();
            if ($test !== null && $test->status !== SectionTestStatus::Draft) {
                $v->errors()->add('status', 'Only a draft can be changed.');

                return;
            }
            if (($problem = SectionTests::refusalForSection($this->page(), $this->sectionId())) !== null) {
                $v->errors()->add('section_id', $problem);

                return;
            }
            SectionRules::after($v, $this->input('blocks'));
        });
    }

    /** Version B as stored: normalised as a section's `data`, or null when the request did not send one. */
    public function variantB(): ?array
    {
        $blocks = $this->validated('blocks');

        return is_array($blocks) ? json_decode((string) json_encode(SectionRules::normalise($blocks)[0]['data'] ?? []), true) : null;
    }
}
```

`app/Http/Resources/Admin/SectionTestResource.php`:

```php
<?php

namespace App\Http\Resources\Admin;

use App\Enums\PageSectionType;
use App\Enums\PublishStatus;
use App\Enums\SectionTestStatus;
use App\Models\SectionTest;
use App\Support\Tests\SectionTests;
use App\Support\Tests\Tallies;
use App\Support\Tests\Verdict;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SectionTest */
class SectionTestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.section-tests.show', '*.section-tests.store', '*.section-tests.update', '*.section-tests.start', '*.section-tests.end', '*.section-tests.apply');
        $page = $this->page;
        $found = $page !== null ? SectionTests::block($page, $this->section_id) : null;
        $type = PageSectionType::tryFrom((string) ($found['block']['type'] ?? ''));
        $data = (array) ($found['block']['data'] ?? []);
        $figures = match ($this->status) {
            SectionTestStatus::Draft => null,
            SectionTestStatus::Ended => $this->results['figures'] ?? null,
            // One grouped query per running test, at most twenty. Never a static cache: a static survives from one test's application to the next.
            SectionTestStatus::Running => Tallies::figures($this->resource),
        };
        $verdict = match ($this->status) {
            SectionTestStatus::Draft => null,
            SectionTestStatus::Ended => $this->results['verdict'] ?? null,
            SectionTestStatus::Running => Verdict::of($figures),
        };
        $until = $this->ended_at ?? now();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'page' => $page === null ? null : ['id' => $page->id, 'title' => $page->title, 'path' => SectionTests::pathOf($page), 'published' => $page->status === PublishStatus::Published],
            'section' => $found === null ? null : [
                'id' => $this->section_id, 'index' => $found['index'], 'type' => $type?->value, 'type_label' => $type?->label(),
                'heading' => collect(['heading', 'title', 'kicker', 'label'])->map(fn ($k) => $data[$k] ?? null)->first(fn ($v) => is_string($v) && trim($v) !== '') ?? $type?->label(),
            ],
            'goal' => $this->goal,
            'goal_label' => SectionTests::goalLabel($this->goal),
            'started_at' => $this->started_at?->toIso8601String(),
            'ended_at' => $this->ended_at?->toIso8601String(),
            'days' => $this->started_at === null ? null : (int) floor($this->started_at->diffInDays($until)),
            'winner' => $this->winner,
            'applied_at' => $this->applied_at?->toIso8601String(),
            'figures' => $figures,
            'verdict' => $verdict,
            'notes' => SectionTests::notes($this->resource),
            'created_by' => $this->creator?->name,
            'variant_b' => $this->when($detail, fn () => $this->variant_b),
            'variant_b_media' => $this->when($detail, fn () => (object) PageResource::mediaUrls([['data' => $this->variant_b]])),
            'section_data' => $this->when($detail, fn () => $found === null ? null : (object) $data),
            'series' => $this->when($detail, fn () => $this->status === SectionTestStatus::Draft ? [] : Tallies::series($this->resource)),
            'credit_note' => $this->when($detail, 'A goal counts for the version a visitor saw on the same day. One reached on another day is not credited.'),
        ];
    }
}
```

`Admin\PageResource::mediaUrls(array $blocks)` is `private static` today (line 55). Make it `public static`; its argument is a blocks list, so B is passed as a one-block list.

`app/Http/Controllers/Api/V1/Admin/SectionTestController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\SectionTestStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\SectionTestRequest;
use App\Http\Resources\Admin\SectionTestResource;
use App\Models\SectionTest;
use App\Support\Analytics\Collector;
use App\Support\Tests\SectionTests;
use App\Support\Tests\Tallies;
use App\Support\Tests\Verdict;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Section A/B tests (C4, docs/section-tests.md). `role:content_manager`. */
class SectionTestController extends Controller
{
    private const WITH = ['page', 'creator'];

    public function index(Request $request): JsonResponse
    {
        $request->validate(['status' => ['nullable', Rule::enum(SectionTestStatus::class)], 'page_id' => ['nullable', 'integer']]);
        $tests = SectionTest::query()->with(self::WITH)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('page_id'), fn ($q, $p) => $q->where('page_id', (int) $p))
            ->orderByRaw("FIELD(status, 'running', 'draft', 'ended')")->orderByDesc('id')->get();

        return response()->json(['data' => SectionTestResource::collection($tests)->resolve($request), 'meta' => self::meta()]);
    }

    public function store(SectionTestRequest $request): JsonResponse
    {
        $test = SectionTest::create([
            'page_id' => (int) $request->validated('page_id'), 'section_id' => $request->validated('section_id'),
            'name' => $request->validated('name'), 'goal' => $request->validated('goal'),
            'variant_b' => $request->variantB() ?? [], 'status' => SectionTestStatus::Draft, 'created_by' => $request->user()?->id,
        ]);

        return (new SectionTestResource($test->load(self::WITH)))->additional(['meta' => self::meta()])->response()->setStatusCode(201);
    }

    public function show(SectionTest $sectionTest): JsonResource
    {
        return (new SectionTestResource($sectionTest->load(self::WITH)))->additional(['meta' => self::meta()]);
    }

    public function update(SectionTestRequest $request, SectionTest $sectionTest): JsonResource
    {
        $sectionTest->update(array_filter([
            'name' => $request->validated('name'), 'goal' => $request->validated('goal'), 'variant_b' => $request->variantB(),
        ], fn ($v) => $v !== null));

        return $this->show($sectionTest->fresh());
    }

    public function destroy(SectionTest $sectionTest): Response
    {
        if (! $sectionTest->status->deletable()) {
            throw ValidationException::withMessages(['status' => 'End the test first.']);
        }
        $sectionTest->delete();

        return response()->noContent();
    }

    public function start(SectionTest $sectionTest): JsonResource
    {
        SectionTests::start($sectionTest);

        return $this->show($sectionTest->fresh());
    }

    public function end(Request $request, SectionTest $sectionTest): JsonResource
    {
        $keep = $request->validate(['keep' => ['nullable', Rule::in(['a', 'b'])]])['keep'] ?? null;
        SectionTests::end($sectionTest, $keep);

        return $this->show($sectionTest->fresh());
    }

    /** @return array<string, mixed> */
    private static function meta(): array
    {
        return [
            'goals' => SectionTests::goalOptions(),
            'statuses' => SectionTestStatus::options(),
            'limits' => ['section' => 1, 'page' => SectionTests::MAX_PER_PAGE, 'site' => SectionTests::MAX_RUNNING,
                'visitors' => Verdict::MIN_VISITORS, 'goals' => Verdict::MIN_GOALS, 'confidence' => Verdict::CLEAR, 'days' => SectionTests::MAX_DAYS],
            'excluded_types' => SectionTests::EXCLUDED_TYPES,
            'analytics_enabled' => Collector::enabled(),
        ];
    }
}
```

`routes/api/admin-section-tests.php`:

```php
<?php

use App\Http\Controllers\Api\V1\Admin\SectionTestController;
use Illuminate\Support\Facades\Route;

/* Section A/B tests (C4, docs/section-tests.md). Required inside the admin group by routes/api.php. */
Route::middleware('role:content_manager')->group(function () {
    Route::get('section-tests', [SectionTestController::class, 'index'])->name('section-tests.index');
    Route::post('section-tests', [SectionTestController::class, 'store'])->name('section-tests.store');
    Route::get('section-tests/{sectionTest}', [SectionTestController::class, 'show'])->whereNumber('sectionTest')->name('section-tests.show');
    Route::patch('section-tests/{sectionTest}', [SectionTestController::class, 'update'])->whereNumber('sectionTest')->name('section-tests.update');
    Route::delete('section-tests/{sectionTest}', [SectionTestController::class, 'destroy'])->whereNumber('sectionTest')->name('section-tests.destroy');
    Route::post('section-tests/{sectionTest}/start', [SectionTestController::class, 'start'])->whereNumber('sectionTest')->middleware('throttle:30,1')->name('section-tests.start');
    Route::post('section-tests/{sectionTest}/end', [SectionTestController::class, 'end'])->whereNumber('sectionTest')->middleware('throttle:30,1')->name('section-tests.end');
});
```

In `routes/api.php` add `require __DIR__.'/api/admin-section-tests.php';` after `admin-analytics.php`.

- [ ] **Step 5: The public read, the admin page and the setting**

`SectionPresenter::present()` gains a fourth parameter (docblock `@param array<string, array{id: int, data: array<string, mixed>}> $tests version B of each running test, by section id — the public read only`). Inside the loop, after `$out[] = [...]` is built, assign it to `$row` first and:

```php
            $test = $tests[(string) ($block['id'] ?? '')] ?? null;
            if ($test !== null) {
                // Version B, presented exactly as A is; a B whose reference has gone is not offered.
                $b = self::data($type, $test['data'], $page);
                if ($b !== null) {
                    $row['test'] = ['id' => $test['id'], 'data' => (object) $b];
                }
            }
            $out[] = $row;
```

`faqEntries()` is untouched, so `faq_schema` is built from A alone.

Public `PageResource` line 32 becomes:

```php
            'sections' => $this->when($this->template === 'builder', fn () => SectionPresenter::present($this->blocks, $this->resource, [], SectionTests::runningFor($this->resource))),
```

Admin `PageResource` gains, after `sections`:

```php
            // C4: the page's draft and running tests by section id, so the builder can mark and lock a card.
            'section_tests' => $this->when($detail, fn () => (object) SectionTests::forPage($this->resource)),
```

In `PageController::builder()` (line 178), add to the `data` array, so the builder's "Test a variant" dialog draws the API's own goals rather than a list in TypeScript:

```php
            // C4: what a section test can count as its goal, with C3's labels.
            'section_test_goals' => SectionTests::goalOptions(),
            'section_test_excluded' => SectionTests::EXCLUDED_TYPES,
```

In `PublicSettings::build()`, beside `announcement_live`:

```php
        // C4: the running section tests the pre-paint script draws a version for. Absent when there are none.
        if (($running = SectionTests::runningIds()) !== '') {
            $values['ab_tests_running'] = $running;
        }
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cd api; php artisan test --filter="SectionTestApiTest|PageBuilderTest|AnalyticsAdminTest"`
Expected: PASS — the new suite, and the builder and analytics suites unchanged.

- [ ] **Step 7: Static analysis and commit**

Run: `cd api; ./vendor/bin/pint app routes tests/Feature/SectionTestApiTest.php; composer analyse`
Expected: pint fixes nothing material; analyse prints "No errors".

```bash
cd ..; git add api/app/Support/Tests/SectionTests.php api/app/Http/Requests/SectionTestRequest.php api/app/Http/Controllers/Api/V1/Admin/SectionTestController.php api/app/Http/Resources/Admin/SectionTestResource.php api/routes/api/admin-section-tests.php api/routes/api.php api/app/Support/PageSections/SectionPresenter.php api/app/Http/Resources/PageResource.php api/app/Http/Resources/Admin/PageResource.php api/app/Support/PublicSettings.php api/tests/Feature/SectionTestApiTest.php
git commit -m "Section tests: the staff API, version B on the public read, ab_tests_running

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The lock on a page save, and "Use version B"

**Files:**
- Modify: `api/app/Support/Tests/SectionTests.php` (`guardPageSave`, `apply`), `api/app/Http/Controllers/Api/V1/Admin/PageController.php` (`update()`), `api/app/Http/Controllers/Api/V1/Admin/SectionTestController.php` (`apply`), `api/routes/api/admin-section-tests.php`
- Test: `api/tests/Feature/SectionTestLockTest.php`

**Interfaces:**
- Consumes: Task 4; `SectionRules::forPayload/messages/after/normalise`, `Revisions::canonical()`, `StaleGuard::touch()`, `HasRevisions` on `Page`.
- Produces:
  - `SectionTests::guardPageSave(Page $page, ?array $blocks): void` — throws `ValidationException` on `blocks` (a deleted section) or `blocks.N.data` (changed data or type): "This section is being tested. End the test first."
  - `SectionTests::apply(SectionTest $test): void` — throws `ValidationException` (`status`, `section_id`, `blocks.N.data.<field>`).
  - Route `admin.section-tests.apply` (`POST section-tests/{sectionTest}/apply`).

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\ContentRevision;
use App\Models\Page;
use App\Models\Role;
use App\Models\SectionTest;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class SectionTestLockTest extends TestCase
{
    use RefreshDatabase;

    private Page $page;

    private string $hero;

    private SectionTest $test;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $user = User::create(['name' => 'Editor', 'email' => 'lock@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'Content manager'])->id);
        $this->hero = (string) Str::uuid();
        // Made before signing in: its first page-history version has no actor, so the editor's apply
        // is a new version rather than folding into one of their own from under five minutes ago.
        $this->page = Page::create(['title' => 'Offer', 'slug' => 'offer', 'template' => 'builder', 'status' => 'published', 'blocks' => [
            ['id' => $this->hero, 'type' => 'hero', 'hidden' => false, 'background' => null, 'data' => ['heading' => 'Version A', 'layout' => 'centered']],
            ['id' => (string) Str::uuid(), 'type' => 'divider', 'hidden' => false, 'background' => null, 'data' => ['size' => 'small']],
        ]]);
        $this->actingAs($user, 'sanctum');
        $id = $this->postJson('/api/v1/admin/section-tests', ['page_id' => $this->page->id, 'section_id' => $this->hero, 'name' => 'T', 'goal' => 'click',
            'variant_b' => ['heading' => 'Version B', 'layout' => 'centered']])->json('data.id');
        $this->postJson("/api/v1/admin/section-tests/{$id}/start")->assertOk();
        $this->test = SectionTest::findOrFail($id);
    }

    private function save(array $blocks, array $extra = [])
    {
        return $this->patchJson("/api/v1/admin/pages/{$this->page->id}", ['blocks' => $blocks, ...$extra]);
    }

    public function test_a_form_opened_before_the_test_started_saves_when_the_section_is_untouched(): void
    {
        $blocks = $this->page->fresh()->blocks;
        $blocks[1]['data']['size'] = 'large';
        $blocks[0]['background'] = ['kind' => 'solid', 'colour' => '#112233'];
        $this->save($blocks)->assertOk();
    }

    public function test_changing_or_deleting_the_tested_section_is_refused(): void
    {
        $blocks = $this->page->fresh()->blocks;
        $changed = $blocks;
        $changed[0]['data']['heading'] = 'Edited A';
        $this->save($changed)->assertStatus(422)->assertJsonValidationErrors(['blocks.0.data' => 'This section is being tested. End the test first.']);

        $retyped = $blocks;
        $retyped[0] = ['id' => $this->hero, 'type' => 'rich_text', 'hidden' => false, 'background' => null, 'data' => ['body' => '<p>x</p>']];
        $this->save($retyped)->assertStatus(422)->assertJsonValidationErrors('blocks.0.data');

        $this->save([$blocks[1]])->assertStatus(422)->assertJsonValidationErrors('blocks');
        $this->assertSame('Version A', $this->page->fresh()->blocks[0]['data']['heading']);
    }

    public function test_use_version_b_writes_b_records_a_version_and_ends_the_test(): void
    {
        $before = ContentRevision::query()->where('subject_type', 'page')->where('subject_id', $this->page->id)->count();
        $this->postJson("/api/v1/admin/section-tests/{$this->test->id}/apply")->assertOk()
            ->assertJsonPath('data.status', 'ended')->assertJsonPath('data.winner', 'b');

        $page = $this->page->fresh();
        $this->assertSame('Version B', $page->blocks[0]['data']['heading']);
        $this->assertNotNull($this->test->fresh()->applied_at);
        $this->assertGreaterThan($before, ContentRevision::query()->where('subject_type', 'page')->where('subject_id', $this->page->id)->count());
        $this->postJson("/api/v1/admin/section-tests/{$this->test->id}/apply")->assertStatus(422)->assertJsonValidationErrors('status');
    }

    public function test_a_b_that_no_longer_passes_is_refused_and_nothing_changes(): void
    {
        $this->test->update(['variant_b' => ['heading' => 'B', 'layout' => 'split', 'image_path' => 'media/deleted.jpg']]);
        $this->postJson("/api/v1/admin/section-tests/{$this->test->id}/apply")->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.image_path');
        $this->assertSame('Version A', $this->page->fresh()->blocks[0]['data']['heading']);
        $this->assertSame('running', $this->test->fresh()->status->value);
    }

    public function test_a_stale_form_after_use_version_b_is_refused_by_the_stale_guard(): void
    {
        $opened = $this->page->fresh();
        $this->travel(2)->seconds();
        $this->postJson("/api/v1/admin/section-tests/{$this->test->id}/apply")->assertOk();

        $this->save($opened->blocks, ['base_updated_at' => $opened->updated_at->toIso8601String()])
            ->assertStatus(422)->assertJsonValidationErrors('stale');
        $this->assertSame('Version B', $this->page->fresh()->blocks[0]['data']['heading']);
    }

    public function test_an_ended_test_no_longer_locks(): void
    {
        $this->postJson("/api/v1/admin/section-tests/{$this->test->id}/end", ['keep' => 'a'])->assertOk();
        $blocks = $this->page->fresh()->blocks;
        $blocks[0]['data']['heading'] = 'Edited after';
        $this->save($blocks)->assertOk();
    }
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd api; php artisan test --filter=SectionTestLockTest`
Expected: FAIL — the edit to a tested section saves (200 where 422 was expected), and `/apply` is a 404.

- [ ] **Step 3: The lock and the apply**

Add to `SectionTests` (imports `App\Support\Revisions`, `App\Support\Notifications\StaleGuard`, `Illuminate\Support\Facades\Validator`):

```php
    private const LOCKED = 'This section is being tested. End the test first.';

    /**
     * A page save may not change, retype or delete a section under a running
     * test. Its background, style, reveal and hidden switch are both
     * versions' and may change. Both sides normalised, so a page stored
     * before a normaliser change is not refused for keys nobody touched.
     *
     * @param  array<int, mixed>|null  $blocks  the request's validated blocks
     */
    public static function guardPageSave(Page $page, ?array $blocks): void
    {
        $locked = SectionTest::query()->running()->where('page_id', $page->id)->pluck('section_id')->all();
        if ($locked === []) {
            return;
        }
        $stored = collect(SectionRules::normalise($page->blocks ?? []))->keyBy('id');
        $next = array_values(SectionRules::normalise($blocks ?? []));
        $errors = [];
        foreach ($locked as $sectionId) {
            $was = $stored->get($sectionId);
            if ($was === null) {
                continue; // already gone: the test's own notes say so
            }
            $at = collect($next)->search(fn ($b) => ($b['id'] ?? null) === $sectionId);
            if ($at === false) {
                $errors['blocks'] = self::LOCKED;

                continue;
            }
            $now = $next[$at];
            if ($now['type'] !== $was['type'] || Revisions::canonical(json_decode((string) json_encode($now['data']), true)) !== Revisions::canonical(json_decode((string) json_encode($was['data']), true))) {
                $errors["blocks.{$at}.data"] = self::LOCKED;
            }
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * "Use version B": B into the section's data, through the rules a page save
     * runs (a 422 keyed `blocks.N.data.<field>` and nothing changed when it no
     * longer passes), recorded in page history by `HasRevisions`, the page
     * touched for `StaleGuard`, and the test ended with B the winner — one
     * transaction, the one write that passes the lock.
     */
    public static function apply(SectionTest $test): void
    {
        DB::transaction(function () use ($test) {
            $test = SectionTest::query()->whereKey($test->id)->lockForUpdate()->firstOrFail();
            if ($test->status !== SectionTestStatus::Running) {
                throw ValidationException::withMessages(['status' => 'This test is not running.']);
            }
            $page = Page::query()->whereKey($test->page_id)->lockForUpdate()->firstOrFail();
            $found = self::block($page, $test->section_id);
            if ($found === null) {
                throw ValidationException::withMessages(['section_id' => 'That section is no longer on the page.']);
            }
            $blocks = array_values($page->blocks ?? []);
            $blocks[$found['index']]['data'] = (array) $test->variant_b;

            $validator = Validator::make(['blocks' => $blocks], SectionRules::forPayload($blocks), SectionRules::messages('blocks', $blocks));
            $validator->after(fn ($v) => SectionRules::after($v, $blocks));
            $validator->validate();

            $page->blocks = json_decode((string) json_encode(SectionRules::normalise($blocks)), true);
            $page->save();
            StaleGuard::touch($page);

            $figures = Tallies::figures($test);
            $test->update([
                'status' => SectionTestStatus::Ended, 'ended_at' => now(), 'winner' => 'b', 'applied_at' => now(),
                'results' => ['figures' => $figures, 'verdict' => Verdict::of($figures)],
            ]);
        });
    }
```

`StaleGuard::touch` uses `touchQuietly()`, which moves `updated_at` even when `save()` wrote nothing. That is what makes Review Focus 2's stale form fail.

In `PageController::update`, after `StaleGuard::check($request, $page);`:

```php
        // C4: a section under a running test is locked (docs/section-tests.md).
        if (array_key_exists('blocks', $request->validated())) {
            SectionTests::guardPageSave($page, $request->validated('blocks'));
        }
```

with `use App\Support\Tests\SectionTests;`.

In `SectionTestController`:

```php
    public function apply(SectionTest $sectionTest): JsonResource
    {
        SectionTests::apply($sectionTest);

        return $this->show($sectionTest->fresh());
    }
```

In `admin-section-tests.php`:

```php
    Route::post('section-tests/{sectionTest}/apply', [SectionTestController::class, 'apply'])->whereNumber('sectionTest')->middleware('throttle:30,1')->name('section-tests.apply');
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd api; php artisan test --filter="SectionTestLockTest|PageBuilderTest|StaleSaveTest|ContentRevisionTest"`
Expected: PASS — the new suite and the three it touches.

- [ ] **Step 5: Commit**

```bash
cd api; ./vendor/bin/pint app/Support/Tests/SectionTests.php app/Http/Controllers/Api/V1/Admin/PageController.php app/Http/Controllers/Api/V1/Admin/SectionTestController.php routes/api/admin-section-tests.php tests/Feature/SectionTestLockTest.php; composer analyse
cd ..; git add api/app/Support/Tests/SectionTests.php api/app/Http/Controllers/Api/V1/Admin/PageController.php api/app/Http/Controllers/Api/V1/Admin/SectionTestController.php api/routes/api/admin-section-tests.php api/tests/Feature/SectionTestLockTest.php
git commit -m "Section tests: the lock on a page save, and Use version B through the page-save rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The hourly check and the bell

**Files:**
- Create: `api/app/Console/Commands/CheckSectionTests.php`
- Modify: `api/routes/console.php`, `api/app/Support/Notifications/ScreenAccess.php` (a row after `['/admin/pages/library', 'content_manager', false]`), `web/src/app/admin/(app)/nav-items.tsx` (the matching NAV row — `AdminNavRolesTest` compares the two in order)
- Test: `api/tests/Feature/SectionTestCheckTest.php`

**Interfaces:**
- Consumes: Tasks 1–4; `Notifications::send(User, StaffNotificationKind, string, ?string, ?Model)`.
- Produces: `technoware:check-section-tests`, scheduled hourly at :15 `withoutOverlapping()`; screen `/admin/section-tests` reachable by `content_manager`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Page;
use App\Models\Role;
use App\Models\SectionTest;
use App\Models\SectionTestTally;
use App\Models\StaffNotification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class SectionTestCheckTest extends TestCase
{
    use RefreshDatabase;

    private function editor(string $email): User
    {
        $u = User::create(['name' => $email, 'email' => $email, 'password' => 'password-for-tests', 'is_active' => true]);
        $u->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'Content manager'])->id);

        return $u;
    }

    private function running(?User $by, int $aGoals, int $bGoals, int $each = 1000, int $daysAgo = 3): SectionTest
    {
        $page = Page::firstOrCreate(['slug' => 'offer'], ['title' => 'Offer', 'template' => 'builder', 'status' => 'published', 'blocks' => []]);
        $t = SectionTest::create(['page_id' => $page->id, 'section_id' => (string) Str::uuid(), 'name' => 'Hero words', 'status' => 'running', 'goal' => 'click', 'variant_b' => [], 'started_at' => now()->subDays($daysAgo), 'created_by' => $by?->id]);
        $rows = [];
        foreach (['a' => $aGoals, 'b' => $bGoals] as $v => $goals) {
            for ($i = 0; $i < $each; $i++) {
                $rows[] = ['section_test_id' => $t->id, 'day' => now()->toDateString(), 'visitor' => random_bytes(16), 'variant' => $v, 'converted_at' => $i < $goals ? now() : null];
            }
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            SectionTestTally::insert($chunk);
        }

        return $t;
    }

    public function test_a_clear_result_tells_the_creator_once_and_changes_nothing(): void
    {
        $me = $this->editor('me@example.test');
        $t = $this->running($me, 30, 50);
        $this->artisan('technoware:check-section-tests')->assertSuccessful();
        $this->artisan('technoware:check-section-tests')->assertSuccessful();

        $row = StaffNotification::sole();
        $this->assertSame($me->id, $row->user_id);
        $this->assertSame('section_test_result', $row->kind->value);
        $this->assertSame("/admin/section-tests/{$t->id}", $row->path);
        $this->assertStringContainsString('Version B is ahead', $row->line);
        $this->assertSame('running', $t->fresh()->status->value);
    }

    public function test_leading_tells_nobody_until_60_days(): void
    {
        $this->running($this->editor('me@example.test'), 40, 50);
        $this->artisan('technoware:check-section-tests');
        $this->assertSame(0, StaffNotification::count());

        $this->running($this->editor('two@example.test'), 40, 50, 1000, 61);
        $this->artisan('technoware:check-section-tests');
        $this->assertStringContainsString('has run for 60 days', StaffNotification::sole()->line);
    }

    public function test_with_the_creator_gone_every_content_manager_is_told(): void
    {
        $this->editor('a@example.test');
        $this->editor('b@example.test');
        $this->running(null, 30, 50);
        $this->artisan('technoware:check-section-tests');
        $this->assertSame(2, StaffNotification::count());
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api; php artisan test --filter=SectionTestCheckTest`
Expected: FAIL — `The command "technoware:check-section-tests" does not exist.`

- [ ] **Step 3: The command, the schedule and the screen row**

```php
<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Enums\StaffNotificationKind;
use App\Models\SectionTest;
use App\Models\User;
use App\Support\Notifications\Notifications;
use App\Support\Tests\SectionTests;
use App\Support\Tests\Tallies;
use App\Support\Tests\Verdict;
use Illuminate\Console\Command;

/**
 * Tells the bell once when a running section test becomes clear or level, or
 * has run 60 days (C4). `notified_at` is the claim, by a conditional update.
 * Nothing on the page is changed.
 */
class CheckSectionTests extends Command
{
    protected $signature = 'technoware:check-section-tests';

    protected $description = 'Tell the bell when a section A/B test has an answer';

    public function handle(): int
    {
        foreach (SectionTest::query()->running()->whereNull('notified_at')->with(['page', 'creator'])->get() as $test) {
            $verdict = Verdict::of(Tallies::figures($test));
            $long = $test->started_at !== null && $test->started_at->lte(now()->subDays(SectionTests::MAX_DAYS));
            if (! in_array($verdict['state'], ['clear', 'level'], true) && ! $long) {
                continue;
            }
            if (SectionTest::query()->whereKey($test->id)->whereNull('notified_at')->update(['notified_at' => now()]) !== 1) {
                continue;
            }
            $line = in_array($verdict['state'], ['clear', 'level'], true)
                ? "“{$test->name}”: {$verdict['sentence']}"
                : "“{$test->name}” has run for ".SectionTests::MAX_DAYS." days. {$verdict['sentence']}";
            foreach ($this->recipients($test) as $user) {
                Notifications::send($user, StaffNotificationKind::SectionTestResult, $line, "/admin/section-tests/{$test->id}", $test);
            }
        }

        return self::SUCCESS;
    }

    /** @return iterable<User> */
    private function recipients(SectionTest $test): iterable
    {
        if ($test->creator !== null && $test->creator->is_active) {
            return [$test->creator];
        }

        return User::query()->where('is_active', true)
            ->whereHas('roles', fn ($q) => $q->where('slug', Role::ContentManager->value))->get();
    }
}
```

In `routes/console.php`, beside `check-alerts`:

```php
// Section A/B tests (C4): the bell, once, when a test has an answer or has run 60 days.
Schedule::command('technoware:check-section-tests')->hourlyAt(15)->withoutOverlapping();
```

In `ScreenAccess::ROWS`, directly after `['/admin/pages/library', 'content_manager', false],`:

```php
        ['/admin/section-tests', 'content_manager', false],
```

In `nav-items.tsx`, directly after the Section library row:

```tsx
      // Section A/B tests (docs/section-tests.md): two versions of one section, the console says which converts better.
      { role: "content_manager", href: "/admin/section-tests", label: "A/B tests", icon: IconArrows },
```

`IconArrows` is already imported. The screen itself arrives in Task 8. Until then the row links to a 404 on this branch only.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd api; php artisan test --filter="SectionTestCheckTest|AdminNavRolesTest|NotificationsTest"`
Expected: PASS. (If `NotificationsTest` is named otherwise, use `php artisan test --filter=Notification`.)

- [ ] **Step 5: Commit**

```bash
cd api; ./vendor/bin/pint app/Console/Commands/CheckSectionTests.php routes/console.php app/Support/Notifications/ScreenAccess.php tests/Feature/SectionTestCheckTest.php
cd ..; git add api/app/Console/Commands/CheckSectionTests.php api/routes/console.php api/app/Support/Notifications/ScreenAccess.php api/tests/Feature/SectionTestCheckTest.php "web/src/app/admin/(app)/nav-items.tsx"
git commit -m "Section tests: the hourly check tells the bell once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The public site — pre-paint choice, both versions, the beacon, the audit

**Files:**
- Create: `web/src/lib/ab-choice.ts`, `web/scripts/ab-choice.check.mjs`, `web/src/components/page-sections/ab-pair.tsx`
- Modify: `web/src/app/layout.tsx` (a second `<script>` after the existing pre-paint one, around line 214), `web/src/types/page-sections.ts:373` (`Of`), `web/src/components/page-sections/page-sections.tsx` (the map in `PageSections`, around line 91), `web/src/lib/analytics-beacon.ts`, `web/scripts/analytics-beacon.check.mjs`, `web/src/components/layout/analytics-beacon.tsx`, `web/scripts/audit.mjs:522`
- Test: the two check scripts; `npx tsc --noEmit`; `npm run lint`

**Interfaces:**
- Consumes: Task 4's `test: {id, data}` on a section and `ab_tests_running` on `/settings`; Task 3's `x` and `ab_click` bodies.
- Produces:
  - `abIds(raw: string | undefined): number[]`, `abScript(ids: number[]): string`, `abStyle(id: number): string` (`lib/ab-choice.ts`, no directive).
  - `exposures(wrappers: ArrayLike<Attr>, html: Attr): Record<string, "a" | "b">`, `variantOf(key: string | null): { t: number; v: "a" | "b" } | null` (`lib/analytics-beacon.ts`).
  - `PageSection`'s every member gains `test?: { id: number; data: D } | null`.
  - `<AbPair id a b />` — `div[data-ab-test]` > `div[data-ab-v="<id>a"]`, `div[data-ab-v="<id>b"]`, and one `<style>`.

- [ ] **Step 1: Write the failing check scripts**

`web/scripts/ab-choice.check.mjs`:

```js
// node --experimental-strip-types scripts/ab-choice.check.mjs
// Pins the pre-paint A/B choice (C4, docs/section-tests.md).
import vm from "node:vm";
import { abIds, abScript, abStyle } from "../src/lib/ab-choice.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

function run(ids, { stored = null, blockedRead = false, blockedWrite = false, path = "/offer", random = 0.1 } = {}) {
  const attrs = {};
  let store = stored;
  const sessionStorage = {
    getItem: (k) => { if (blockedRead) throw new Error("SecurityError"); return k === "tw_ab" ? store : null; },
    setItem: (k, v) => { if (blockedWrite) throw new Error("QuotaExceededError"); if (k === "tw_ab") store = v; },
  };
  const Math2 = Object.create(Math); Math2.random = () => random;
  vm.runInNewContext(abScript(ids), {
    location: { pathname: path }, sessionStorage, Math: Math2,
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
  });
  return { attrs, store };
}

ok(abScript([]) === "", "no running test, no script");
ok(JSON.stringify(abIds("12, 7,x,12,,3")) === "[12,7,3]", "ids are digits, de-duplicated");
ok(abIds(undefined).length === 0 && abIds(Array.from({ length: 30 }, (_, i) => i + 1).join(",")).length === 20, "absent is none, at most twenty");

let r = run([12], { random: 0.9 });
ok(r.attrs["data-ab-12"] === "b" && JSON.parse(r.store)["12"] === "b", "a fresh draw is stamped and stored");
r = run([12], { stored: '{"12":"a"}', random: 0.9 });
ok(r.attrs["data-ab-12"] === "a", "a stored choice is reused");
r = run([12, 13], { stored: '{"12":"a","99":"b"}', random: 0.1 });
ok(r.attrs["data-ab-13"] === "a" && !("99" in JSON.parse(r.store)), "a new test is drawn and an old one is forgotten");
r = run([12], { stored: "not json", random: 0.9 });
ok(r.attrs["data-ab-12"] === "b", "a malformed stored value is a fresh draw");
r = run([12], { blockedRead: true });
ok(Object.keys(r.attrs).length === 0, "blocked storage stamps nothing: the visitor sees A and is not counted");
r = run([12], { blockedWrite: true });
ok(Object.keys(r.attrs).length === 0, "a storage that will not keep the choice stamps nothing");
for (const p of ["/admin", "/admin/pages/1", "/portal", "/portal/tickets"]) ok(Object.keys(run([12], { path: p }).attrs).length === 0, `${p} is skipped`);
ok(abStyle(12).includes('html[data-ab-12="b"] [data-ab-v="12a"]') && abStyle(12).includes('html:not([data-ab-12="b"]) [data-ab-v="12b"]'), "the style hides the version not drawn, A by default");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
```

Append to `web/scripts/analytics-beacon.check.mjs`, before the summary lines, with the import extended to `exposures, variantOf`:

```js
const el = (attrs) => ({ getAttribute: (n) => attrs[n] ?? null });
ok(JSON.stringify(exposures([el({ "data-ab-test": "12" })], el({ "data-ab-12": "b" }))) === '{"12":"b"}', "a tested section the tab drew is an exposure");
ok(JSON.stringify(exposures([], el({ "data-ab-12": "b" }))) === "{}", "an attribute with no wrapper (a cached page from before the test) is nothing");
ok(JSON.stringify(exposures([el({ "data-ab-test": "12" })], el({}))) === "{}", "a wrapper with no attribute (blocked storage, or a test since ended) is nothing");
ok(JSON.stringify(variantOf("12b")) === '{"t":12,"v":"b"}' && variantOf("12c") === null && variantOf(null) === null, "a pressed version's key");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web; node --experimental-strip-types scripts/ab-choice.check.mjs; node --experimental-strip-types scripts/analytics-beacon.check.mjs`
Expected: FAIL — `Cannot find module '../src/lib/ab-choice.ts'`; the beacon script fails on the missing export `exposures`.

- [ ] **Step 3: `lib/ab-choice.ts`**

```ts
/*
 * Section A/B tests' pre-paint choice (C4, docs/section-tests.md). No
 * directive: the check script imports it under Node, and the root layout
 * embeds `abScript()` as a blocking inline script.
 */

const MAX = 20;

/** `ab_tests_running` from the public settings: digits only, de-duplicated, at most twenty. */
export function abIds(raw: string | undefined): number[] {
  if (!raw) return [];
  const ids = raw.split(",").map((s) => s.trim()).filter((s) => /^\d{1,10}$/.test(s)).map(Number);
  return [...new Set(ids)].slice(0, MAX);
}

/**
 * The statement the root layout runs before paint: the tab's choice for each
 * running test from `sessionStorage` (`tw_ab`, id → a|b), a 50/50 draw for a
 * new one, stored first and stamped second — so a storage that will not keep
 * the choice stamps nothing and the visitor sees A, uncounted. Public pages
 * only: the console and the portal are skipped by the path test the scheme
 * script already makes. Its own try, so a failure here cannot undo the scheme.
 */
export function abScript(ids: number[]): string {
  if (!ids.length) return "";
  return `(function(){try{var p=location.pathname;if(p==="/admin"||p.indexOf("/admin/")===0||p==="/portal"||p.indexOf("/portal/")===0)return;var ids=${JSON.stringify(ids)};var raw=sessionStorage.getItem("tw_ab");var m={};try{m=JSON.parse(raw||"{}")||{}}catch(e){m={}}var n={};for(var i=0;i<ids.length;i++){var k=String(ids[i]);var v=m[k];n[k]=(v==="a"||v==="b")?v:(Math.random()<0.5?"a":"b")}sessionStorage.setItem("tw_ab",JSON.stringify(n));var r=document.documentElement;for(var j in n){r.setAttribute("data-ab-"+j,n[j])}}catch(e){}})();`;
}

/** The one static rule per tested section: the version not drawn is `display: none`, and A is the default. */
export function abStyle(id: number): string {
  return `[data-ab-test="${id}"],[data-ab-v="${id}a"],[data-ab-v="${id}b"]{display:contents}html[data-ab-${id}="b"] [data-ab-v="${id}a"],html:not([data-ab-${id}="b"]) [data-ab-v="${id}b"]{display:none}`;
}
```

`display: contents` keeps the wrapper out of a flex or grid parent's layout. The `display: none` rule is more specific, so it wins on the hidden version.

- [ ] **Step 4: The layout, the wrapper and the section type**

In `layout.tsx`: `import { abIds, abScript } from "@/lib/ab-choice";`. In `RootLayout`, after `announcementId`:

```tsx
  // Section A/B tests (C4): the versions are chosen before paint, like the scheme.
  const abSrc = abScript(abIds(settings.ab_tests_running));
```

Directly after the existing `<script dangerouslySetInnerHTML=… />` in `<head>`:

```tsx
        {abSrc && <script dangerouslySetInnerHTML={{ __html: abSrc }} />}
```

Add one sentence to the comment block above: the fourth statement is C4's, a script of its own so a failure there cannot touch the scheme, and the `data-ab-*` attributes it writes are covered by the same `suppressHydrationWarning`.

`web/src/components/page-sections/ab-pair.tsx`:

```tsx
import type { ReactNode } from "react";
import { abStyle } from "@/lib/ab-choice";

/**
 * A section under a running A/B test (C4, docs/section-tests.md): both
 * versions in the HTML, the one this tab did not draw hidden by one static
 * rule keyed on `<html>`'s pre-paint attribute — so nothing swaps after
 * hydration and there is no flicker. Without JavaScript, or for a crawler,
 * the attribute is absent and A shows. The section's anchor and background
 * sit outside this, once.
 */
export function AbPair({ id, a, b }: { id: number; a: ReactNode; b: ReactNode }) {
  return (
    <div data-ab-test={id}>
      <style dangerouslySetInnerHTML={{ __html: abStyle(id) }} />
      <div data-ab-v={`${id}a`}>{a}</div>
      <div data-ab-v={`${id}b`}>{b}</div>
    </div>
  );
}
```

In `types/page-sections.ts` line 373:

```ts
type Of<T extends PageSectionType, D> = { id: string; type: T; background: SectionBackground | null; reveal?: string | null; style?: SectionStyle | null; data: D; /** C4: version B of a running test, presented as `data` is. */ test?: { id: number; data: D } | null };
```

In `PageSections`, replace `const node = renderSection(section, {...});` with:

```tsx
        const ctx = { first: ownsH1 && i === 0, eager: i <= 1, crumbs, themeId: theme.manifest.id, runCode, marked };
        const a = renderSection(section, ctx);
        // C4: both versions, B under its own id so a tabs or story section's DOM ids stay unique.
        const b = section.test && !marked ? renderSection({ ...section, id: `b${section.id}`, data: section.test.data } as PageSection, ctx) : null;
        const node = a && b && section.test ? <AbPair id={section.test.id} a={a} b={b} /> : a;
```

with `import { AbPair } from "./ab-pair";`. If `renderSection`'s second parameter has a named type, give `ctx` that type rather than an inline object.

- [ ] **Step 5: The beacon**

In `lib/analytics-beacon.ts`, append:

```ts
type Attr = { getAttribute(name: string): string | null };

/**
 * C4: the tests this page view showed, by the version the tab drew — a
 * wrapper on the page **and** the pre-paint attribute. A cached page from
 * before a test started has the attribute and no wrapper, and one from after
 * it ended has the wrapper and no attribute: neither is an exposure, and a
 * visitor who was never randomised is never counted.
 */
export function exposures(wrappers: ArrayLike<Attr>, html: Attr): Record<string, "a" | "b"> {
  const x: Record<string, "a" | "b"> = {};
  for (const w of Array.from(wrappers)) {
    const id = w.getAttribute("data-ab-test");
    if (!id || !/^\d+$/.test(id)) continue;
    const v = html.getAttribute(`data-ab-${id}`);
    if (v === "a" || v === "b") x[id] = v;
  }
  return x;
}

/** `12b` on a pressed version's box → test 12, version b. */
export function variantOf(key: string | null): { t: number; v: "a" | "b" } | null {
  const m = key?.match(/^(\d+)([ab])$/);
  return m ? { t: Number(m[1]), v: m[2] as "a" | "b" } : null;
}
```

In `analytics-beacon.tsx`:
- import `exposures, variantOf`;
- add `const pressed = useRef<Set<number>>(new Set());`;
- in the pageview effect, before `sendBeacon`:

```tsx
    pressed.current = new Set(); // one ab_click per test per page view
    const x = exposures(document.querySelectorAll("[data-ab-test]"), document.documentElement);
```

  and add `...(Object.keys(x).length ? { x } : {}),` to the JSON body;
- in `onClick`, before the existing `a[href]` lookup:

```tsx
      const target = e.target as Element | null;
      if (!collectable(location.pathname)) return;
      const press = target?.closest?.("a,button");
      const ab = press ? variantOf(press.closest("[data-ab-v]")?.getAttribute("data-ab-v") ?? null) : null;
      if (ab && !pressed.current.has(ab.t)) {
        pressed.current.add(ab.t);
        navigator.sendBeacon?.("/api/collect", JSON.stringify({ k: "ab_click", p: location.pathname, t: ab.t, v: ab.v }));
      }
```

  and change the existing line to `const a = target?.closest?.("a[href]") as HTMLAnchorElement | null; if (!a) return;`. The `collectable` test now runs once, above.

Extend the component's docblock by one line: C4 adds `x` on a page view and `ab_click` on a press inside a tested section.

- [ ] **Step 6: The audit counts rendered headings only**

`scripts/audit.mjs:522`:

```js
  // Rendered headings only: a hidden A/B version's h1 (C4) is display:none and not a second h1.
  const levels = [].slice.call(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter((h) => h.getClientRects().length > 0);
```

- [ ] **Step 7: Run the checks, the types and the lint**

Run: `cd web; node --experimental-strip-types scripts/ab-choice.check.mjs; node --experimental-strip-types scripts/analytics-beacon.check.mjs; npx tsc --noEmit; npm run lint`
Expected: both scripts end `all passed`; tsc prints nothing; lint reports no errors.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/ab-choice.ts web/scripts/ab-choice.check.mjs web/src/components/page-sections/ab-pair.tsx web/src/app/layout.tsx web/src/types/page-sections.ts web/src/components/page-sections/page-sections.tsx web/src/lib/analytics-beacon.ts web/scripts/analytics-beacon.check.mjs web/src/components/layout/analytics-beacon.tsx web/scripts/audit.mjs
git commit -m "Section tests: both versions on the page, chosen before paint, and the beacon's exposure and click

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The console — the builder dialog, the list and the test screen

**Files:**
- Create: `web/src/types/section-tests.ts`, `web/src/lib/admin/section-tests.ts`, `web/src/app/admin/(app)/section-tests/page.tsx`, `web/src/app/admin/(app)/section-tests/[id]/page.tsx`, `web/src/app/admin/(app)/section-tests/actions.ts`, `web/src/app/admin/(app)/section-tests/test-buttons.tsx`, `web/src/app/admin/(app)/section-tests/test-previews.tsx`, `web/src/app/admin/(app)/pages/builder/section-test-dialog.tsx`, `web/src/app/admin/(app)/pages/builder/section-test-action.ts`
- Modify: `web/src/lib/admin/index.ts`, `web/src/types/api.ts` (`AdminPage`), `web/src/app/admin/(app)/pages/page-form.tsx` (pass `tests`, `published`), `web/src/app/admin/(app)/pages/builder/section-builder.tsx` (props, card badge/lock/button, live-preview swap), `web/src/components/ui/toast-from-params.tsx` (four `?done=` keys)
- Test: `npx tsc --noEmit`, `npm run lint`, then the probe in Task 9

**Interfaces:**
- Consumes: Task 4's and Task 5's endpoints; `previewSectionsAction(json, pageId)` from `pages/builder/preview-action.tsx`; `SectionEditor`, `BlockEditorProvider`, `setIn` from the builder; `AreaChart`, `BarList`.
- Produces:
  - Types `SectionTestRow`, `SectionTestDetail`, `SectionTestIndex`, `PageSectionTests`, `AbFigures`, `AbVerdict`.
  - `getSectionTests(params)`, `getSectionTest(id)`, `createSectionTest(payload)`, `updateSectionTest(id, payload)`, `deleteSectionTest(id)`, `startSectionTest(id)`, `endSectionTest(id, keep?)`, `applySectionTest(id)`.
  - `saveSectionTestAction(input): Promise<{ error?: string; fieldErrors?: Record<string, string[]>; id?: number }>`.
  - `AdminPage.section_tests?: PageSectionTests`; `PageBuilderOptions.section_test_goals?` and `section_test_excluded?`.

- [ ] **Step 1: Types and the admin module**

`web/src/types/section-tests.ts`:

```ts
export type SectionTestStatus = "draft" | "running" | "ended";
export type AbFigures = { visitors: number; goals: number; rate: number | null };
export type AbVerdict = { state: "collecting" | "leading" | "clear" | "level"; leader: "a" | "b" | null; confidence: number | null; sentence: string };

export type SectionTestRow = {
  id: number;
  name: string;
  status: SectionTestStatus;
  status_label: string;
  page: { id: number; title: string; path: string; published: boolean } | null;
  section: { id: string; index: number; type: string | null; type_label: string | null; heading: string | null } | null;
  goal: string;
  goal_label: string;
  started_at: string | null;
  ended_at: string | null;
  days: number | null;
  winner: "a" | "b" | null;
  applied_at: string | null;
  figures: { a: AbFigures; b: AbFigures } | null;
  verdict: AbVerdict | null;
  notes: string[];
  created_by: string | null;
};

export type SectionTestDetail = SectionTestRow & {
  variant_b: Record<string, unknown>;
  variant_b_media: Record<string, string>;
  section_data: Record<string, unknown> | null;
  series: { date: string; label: string; a_rate: number | null; b_rate: number | null }[];
  credit_note: string;
};

export type SectionTestMeta = {
  goals: { value: string; label: string }[];
  statuses: { value: SectionTestStatus; label: string }[];
  limits: { section: number; page: number; site: number; visitors: number; goals: number; confidence: number; days: number };
  excluded_types: string[];
  analytics_enabled: boolean;
};

export type SectionTestIndex = { data: SectionTestRow[]; meta: SectionTestMeta };
export type PageSectionTests = Record<string, { id: number; status: SectionTestStatus }>;
export type SectionTestPayload = { page_id?: number; section_id?: string; name?: string; goal?: string; variant_b?: Record<string, unknown> };
```

`web/src/lib/admin/section-tests.ts`:

```ts
import "server-only";
import { apiFetch } from "@/lib/api";
import { token, query } from "./_shared";
import type { SectionTestDetail, SectionTestIndex, SectionTestMeta, SectionTestPayload } from "@/types/section-tests";

export type * from "@/types/section-tests";

type One = { data: SectionTestDetail; meta: SectionTestMeta };

/** Section A/B tests (C4, docs/section-tests.md). Every label and sentence is the API's. */
export async function getSectionTests(params: { status?: string; page_id?: number } = {}): Promise<SectionTestIndex> {
  return apiFetch<SectionTestIndex>(`/admin/section-tests${query(params)}`, { token: await token() });
}

export async function getSectionTest(id: number): Promise<One> {
  return apiFetch<One>(`/admin/section-tests/${id}`, { token: await token() });
}

export async function createSectionTest(payload: SectionTestPayload): Promise<One> {
  return apiFetch<One>("/admin/section-tests", { method: "POST", body: payload, token: await token() });
}

export async function updateSectionTest(id: number, payload: SectionTestPayload): Promise<One> {
  return apiFetch<One>(`/admin/section-tests/${id}`, { method: "PATCH", body: payload, token: await token() });
}

export async function deleteSectionTest(id: number): Promise<void> {
  await apiFetch<void>(`/admin/section-tests/${id}`, { method: "DELETE", token: await token() });
}

export async function startSectionTest(id: number): Promise<One> {
  return apiFetch<One>(`/admin/section-tests/${id}/start`, { method: "POST", token: await token() });
}

export async function endSectionTest(id: number, keep?: "a" | "b"): Promise<One> {
  return apiFetch<One>(`/admin/section-tests/${id}/end`, { method: "POST", body: keep ? { keep } : {}, token: await token() });
}

export async function applySectionTest(id: number): Promise<One> {
  return apiFetch<One>(`/admin/section-tests/${id}/apply`, { method: "POST", token: await token() });
}
```

Add `export * from "./section-tests";` to `lib/admin/index.ts`. Add to `AdminPage` in `types/api.ts`: `/** Detail-only (C4): the page's draft and running tests by section id. */ section_tests?: import("./section-tests").PageSectionTests;`.

- [ ] **Step 2: The actions**

`web/src/app/admin/(app)/section-tests/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { applySectionTest, deleteSectionTest, endSectionTest, startSectionTest } from "@/lib/admin";

export type TestActionState = { error?: string };

/** A start or an end changes `ab_tests_running` and the page's HTML: both caches go. */
function purge(id: number) {
  updateTag("settings");
  updateTag("pages");
  revalidatePath("/admin/section-tests");
  revalidatePath(`/admin/section-tests/${id}`);
}

function refusal(error: unknown): TestActionState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    if (error.status === 422 && first) return { error: first };
    if (error.status === 403) return { error: "Your account cannot run A/B tests." };
  }
  return { error: "That did not go through. Try again shortly." };
}

export async function testAction(_prev: TestActionState, formData: FormData): Promise<TestActionState> {
  const id = Number(formData.get("id"));
  const move = String(formData.get("move") ?? "");
  try {
    if (move === "start") await startSectionTest(id);
    else if (move === "end") await endSectionTest(id);
    else if (move === "keep-a") await endSectionTest(id, "a");
    else if (move === "apply") await applySectionTest(id);
    else if (move === "delete") await deleteSectionTest(id);
    else return { error: "Unknown action." };
  } catch (error) {
    return refusal(error);
  }
  purge(id);
  redirect(move === "delete" ? "/admin/section-tests?done=test-deleted" : `/admin/section-tests/${id}?done=test-${move}`);
}
```

In `toast-from-params.tsx` `OUTCOMES`, add:

```ts
  "test-start": { tone: "ok", title: "Test started", body: "Visitors now see one version or the other." },
  "test-end": { tone: "ok", title: "Test ended", body: "The page shows version A again." },
  "test-keep-a": { tone: "ok", title: "Kept version A", body: "The test has ended and the page is unchanged." },
  "test-apply": { tone: "ok", title: "Version B is on the page", body: "Page history has a version of the change." },
  "test-deleted": { tone: "ok", title: "Test deleted" },
```

Match the `Message` type's real field names when adding these. The `redirect()` calls sit outside the `try`.

- [ ] **Step 3: The list screen**

`web/src/app/admin/(app)/section-tests/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { BarList } from "@/components/charts/bar-list";
import { Alert } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { getSectionTests, type SectionTestRow } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({ title: "A/B tests", path: "/admin/section-tests", seo: noIndex });

const TABS = [["running", "Running"], ["draft", "Drafts"], ["ended", "Ended"]] as const;
const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);

export default async function SectionTestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireScreen();
  const { status = "running" } = await searchParams;
  const list = await getSectionTests({ status });

  return (
    <>
      <PageHeader title="A/B tests" lede="Two versions of one section on a page. Visitors see one or the other, and this list says which brings more of the goal you chose." />
      {!list.meta.analytics_enabled && (
        <Alert tone="warn" dismissible={false} title="Native analytics is switched off">Running tests count nothing until it is switched on in Site → Settings → Analytics.</Alert>
      )}
      <nav aria-label="Tests" className="mb-4 flex gap-2" data-tour="tests-tabs">
        {TABS.map(([v, l]) => (
          <Link key={v} href={`/admin/section-tests?status=${v}`} aria-current={status === v ? "page" : undefined}
            className="rounded-full border border-line-strong px-3 py-1.5 text-13 font-semibold aria-[current=page]:bg-brand-600 aria-[current=page]:text-brand-on">{l}</Link>
        ))}
      </nav>
      {list.data.length === 0 ? (
        <EmptyState title="No tests here" description="Open a published builder page, choose a section and press “Test a variant” to make version B." />
      ) : (
        <ul className="grid gap-3">{list.data.map((t) => <TestRow key={t.id} t={t} />)}</ul>
      )}
    </>
  );
}

function TestRow({ t }: { t: SectionTestRow }) {
  return (
    <li className="rounded-lg border border-line-strong bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/section-tests/${t.id}`} className="text-15 font-semibold text-brand-ink hover:underline">{t.name}</Link>
        <Badge tone={t.status === "running" ? "ok" : "closed"}>{t.status_label}</Badge>
        {t.notes.map((n) => <Badge key={n} tone="warn">{n}</Badge>)}
        {t.days !== null && <span className="ml-auto text-12-5 text-muted">{t.days} {t.days === 1 ? "day" : "days"}</span>}
      </div>
      <p className="mt-1 text-13 text-muted">{t.page?.title} · {t.section?.type_label} “{t.section?.heading}” · Goal: {t.goal_label}</p>
      {t.figures && (
        <div className="mt-3 max-w-xl">
          <BarList showShare={false} rows={[
            { label: `A ${pct(t.figures.a.rate)}`, value: Math.round((t.figures.a.rate ?? 0) * 1000), tone: "info" },
            { label: `B ${pct(t.figures.b.rate)}`, value: Math.round((t.figures.b.rate ?? 0) * 1000), tone: "ok" },
          ]} empty="No visitors yet." />
        </div>
      )}
      {t.verdict && <p className="mt-2 text-13-5 text-ink">{t.verdict.sentence}</p>}
    </li>
  );
}
```

Check before writing this screen:
- whether `Alert` and `Badge` take `tone`;
- whether `EmptyState` takes `description`;
- whether `BarList`'s `value` is a number it labels itself. If it prints the raw value next to the label, use `labelWidth` and keep the label as the rate.

- [ ] **Step 4: The test screen and its buttons**

`web/src/app/admin/(app)/section-tests/test-buttons.tsx` — a client component that renders one `<Form action={testAction} state={state}>` per move, with a hidden `id` and `move`. It asks for confirmation through `Modal`, and each confirmation names what happens to the page:
- **start**: "Visitors will see one version or the other from now on."
- **end**: "The page goes back to showing version A to everyone. No winner is recorded."
- **keep-a**: "The test ends and the page stays as it is."
- **apply**: "Version B replaces the section's content, and page history keeps a version of the change."
- **delete**: "The test and its figures are deleted. The page is unchanged."

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { testAction, type TestActionState } from "./actions";

const MOVES = {
  start: { label: "Start the test", body: "Visitors will see one version or the other from now on.", variant: "primary" },
  "keep-a": { label: "Keep version A", body: "The test ends and the page stays as it is.", variant: "secondary" },
  apply: { label: "Use version B", body: "Version B replaces the section’s content, and page history keeps a version of the change.", variant: "primary" },
  end: { label: "End test", body: "The page goes back to showing version A to everyone. No winner is recorded.", variant: "secondary" },
  delete: { label: "Delete", body: "The test and its figures are deleted. The page is unchanged.", variant: "destructive" },
} as const;
type Move = keyof typeof MOVES;

export function TestButtons({ id, moves }: { id: number; moves: Move[] }) {
  const [state, action, pending] = useActionState<TestActionState, FormData>(testAction, {});
  const [asking, setAsking] = useState<Move | null>(null);
  return (
    <div className="flex flex-wrap gap-2" data-tour="test-buttons">
      {state.error && <Alert tone="err" dismissible={false} title="Not done">{state.error}</Alert>}
      {moves.map((m) => (
        <Button key={m} type="button" variant={MOVES[m].variant} onClick={() => setAsking(m)}>{MOVES[m].label}</Button>
      ))}
      <Modal open={asking !== null} onClose={() => setAsking(null)} title={asking ? MOVES[asking].label : ""} description={asking ? MOVES[asking].body : undefined}>
        <Form action={action} state={state} className="flex justify-end gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="move" value={asking ?? ""} />
          <Button type="button" variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
          <Button type="submit" pending={pending}>{asking ? MOVES[asking].label : ""}</Button>
        </Form>
      </Modal>
    </div>
  );
}
```

Check the `Button` variant names against `components/ui/button.tsx` (`primary`, `secondary`, `ghost`, `destructive`) and adjust them to the real ones.

`web/src/app/admin/(app)/section-tests/test-previews.tsx` — a client component. On mount it calls `previewSectionsAction(JSON.stringify([section]), pageId)` for A (the stored block) and for B (the same block with `data: variant_b`). It frames each answer's `/admin/draft-preview/{id}` side by side (`grid md:grid-cols-2`, each a titled `iframe` 520px tall). A refusal shows the action's sentence instead of the frame.

```tsx
"use client";

import { useEffect, useState } from "react";
import { previewSectionsAction } from "../pages/builder/preview-action";
import type { StoredSection } from "@/types/api";

export function TestPreviews({ section, variantB, pageId }: { section: StoredSection; variantB: Record<string, unknown>; pageId: number }) {
  const [frames, setFrames] = useState<{ a?: string; b?: string; error?: string }>({});
  useEffect(() => {
    let live = true;
    Promise.all([
      previewSectionsAction(JSON.stringify([section]), pageId),
      previewSectionsAction(JSON.stringify([{ ...section, data: variantB }]), pageId),
    ]).then(([a, b]) => {
      if (!live) return;
      if ("id" in a && "id" in b && a.id && b.id) setFrames({ a: a.id, b: b.id });
      else setFrames({ error: "The preview could not be drawn." });
    });
    return () => { live = false; };
  }, [section, variantB, pageId]);
  if (frames.error) return <p className="text-13 text-err">{frames.error}</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(["a", "b"] as const).map((v) => (
        <figure key={v} className="min-w-0">
          <figcaption className="mb-1 text-12-5 font-semibold uppercase tracking-[.08em] text-muted">Version {v.toUpperCase()}</figcaption>
          {frames[v]
            ? <iframe title={`Version ${v.toUpperCase()}`} src={`/admin/draft-preview/${frames[v]}`} className="h-[520px] w-full rounded-lg border border-line-strong bg-card" />
            : <div className="h-[520px] rounded-lg border border-line-strong bg-surface-2" aria-busy="true" />}
        </figure>
      ))}
    </div>
  );
}
```

Check `PreviewResult`'s real shape in `preview-action.tsx` (`{ id }` or `{ error, fieldErrors }`) and narrow on it. Do not invent the shape.

`web/src/app/admin/(app)/section-tests/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { AreaChart } from "@/components/charts/area-chart";
import { Alert } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { getPage, getSectionTest } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TestButtons } from "../test-buttons";
import { TestPreviews } from "../test-previews";

export const metadata = buildMetadata({ title: "A/B test", path: "/admin/section-tests", seo: noIndex });
const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);

export default async function SectionTestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const id = Number((await params).id);
  const res = await getSectionTest(id).catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e)));
  if (!res) notFound();
  const t = res.data;
  const page = t.page ? await getPage(t.page.id).catch(() => null) : null;
  const block = page?.blocks?.find((b) => b.id === t.section?.id);
  const moves = t.status === "draft" ? (["start", "delete"] as const) : t.status === "running" ? (["apply", "keep-a", "end"] as const) : (["delete"] as const);

  return (
    <>
      <PageHeader title={t.name} back={{ href: "/admin/section-tests", label: "A/B tests" }} lede={`${t.page?.title ?? "A deleted page"} · ${t.section?.type_label ?? ""} · Goal: ${t.goal_label}`} />
      {t.notes.map((n) => <Alert key={n} tone="warn" dismissible={false} title={n} />)}
      {t.verdict && <p className="mb-4 text-16 font-semibold text-ink">{t.verdict.sentence}</p>}
      {t.figures && (
        <dl className="mb-6 grid max-w-xl grid-cols-2 gap-3">
          {(["a", "b"] as const).map((v) => (
            <div key={v} className="rounded-lg border border-line-strong bg-card p-4">
              <dt className="text-12-5 font-semibold uppercase text-muted">Version {v.toUpperCase()}</dt>
              <dd className="text-24 font-bold">{pct(t.figures![v].rate)}</dd>
              <dd className="text-12-5 text-muted">{t.figures![v].goals.toLocaleString("en-IN")} of {t.figures![v].visitors.toLocaleString("en-IN")} visitors</dd>
            </div>
          ))}
        </dl>
      )}
      {t.series.length > 0 && (
        <AreaChart
          series={[
            { key: "a", label: "Version A", tone: "info", values: t.series.map((d) => d.a_rate ?? 0) },
            { key: "b", label: "Version B", tone: "ok", values: t.series.map((d) => d.b_rate ?? 0) },
          ]}
          labels={t.series.map((d) => d.label)}
          unit="%"
          summary="Each version's conversion rate so far, by day."
        />
      )}
      <p className="my-3 text-12-5 text-muted">{t.credit_note}</p>
      <TestButtons id={t.id} moves={[...moves]} />
      {block && page && <div className="mt-6"><TestPreviews section={block} variantB={t.variant_b} pageId={page.id} /></div>}
    </>
  );
}
```

Check the `AreaChart`'s required props in `area-chart.tsx` (lines 46–70) and pass every required one with its real name. `summary` is required.

- [ ] **Step 5: The builder — "Test a variant", the lock and the preview**

`web/src/app/admin/(app)/pages/builder/section-test-action.ts`:

```ts
"use server";

import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { createSectionTest, startSectionTest, updateSectionTest } from "@/lib/admin";

export type SaveTestResult = { error?: string; fieldErrors?: Record<string, string[]>; id?: number };

/** Saves version B as a draft test, and starts it when asked (C4). A 422 on B is keyed `blocks.0.data.<field>`. */
export async function saveSectionTestAction(input: {
  id?: number; pageId: number; sectionId: string; name: string; goal: string; variantB: Record<string, unknown>; start: boolean;
}): Promise<SaveTestResult> {
  try {
    const saved = input.id
      ? await updateSectionTest(input.id, { name: input.name, goal: input.goal, variant_b: input.variantB })
      : await createSectionTest({ page_id: input.pageId, section_id: input.sectionId, name: input.name, goal: input.goal, variant_b: input.variantB });
    if (input.start) {
      await startSectionTest(saved.data.id);
      updateTag("settings");
      updateTag("pages");
    }
    revalidatePath(`/admin/pages/${input.pageId}`);
    revalidatePath("/admin/section-tests");
    return { id: saved.data.id };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return { error: Object.values(error.errors ?? {})[0]?.[0] ?? "Check the highlighted fields.", fieldErrors: error.errors };
    }
    return { error: "The test could not be saved. Try again shortly." };
  }
}
```

`web/src/app/admin/(app)/pages/builder/section-test-dialog.tsx` — a client component in a `Modal size="xl"`:
- it holds `draft` (version B's data, preloaded from A's `section.data`), a `goal` select, and a `name` defaulting to `${pageTitle} — ${summaryOf(section.data) || label}`;
- it renders the section's own editor against `draft` with a local context: `BlockEditorProvider` with `content: draft`, `set`/`setStep` writing `setIn(draft, path, value)`, and `err` reading `errors["blocks.0.data." + path.join(".")]`;
- its footer holds "Save as draft" and "Start the test", which call `saveSectionTestAction`;
- on success it toasts and calls `onSaved(id, status)`;
- it calls `onDraft(draft)` on every change, so the builder's live preview shows B while the dialog is open.

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { PageBuilderOptions, StoredSection } from "@/types/api";
import { BlockEditorProvider, setIn, type Json, type Obj, type Path } from "../../blocks/editors/shared";
import { SectionEditor } from "./section-editors";
import { saveSectionTestAction } from "./section-test-action";

export function SectionTestDialog({ open, onClose, section, label, pageId, pageTitle, options, media, onDraft, onSaved }: {
  open: boolean; onClose: () => void; section: StoredSection; label: string; pageId: number; pageTitle: string;
  options: PageBuilderOptions; media: Record<string, string>;
  onDraft: (data: Obj | null) => void; onSaved: (id: number, status: "draft" | "running") => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Obj>(() => structuredClone(section.data as Obj));
  const [goal, setGoal] = useState("click");
  const [name, setName] = useState(() => `${pageTitle} — ${String((section.data as Obj).heading ?? label)}`.slice(0, 120));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const set = useCallback((path: Path, value: Json | undefined) => setDraft((d) => {
    const next = setIn(d, path, value) as Obj;
    onDraft(next);
    return next;
  }), [onDraft]);
  const err = useCallback((path: Path) => errors[`blocks.0.data.${path.join(".")}`]?.[0], [errors]);
  const anyErr = useCallback((path: Path) => Object.keys(errors).some((k) => k.startsWith(`blocks.0.data.${path.join(".")}`)), [errors]);
  const idPrefix = `ab-${section.id.slice(0, 8)}`;
  const ctx = useMemo(() => ({ content: draft, set, setStep: set, err, anyErr, media, brands: [], idPrefix, epoch: 0 }), [draft, set, err, anyErr, media, idPrefix]);

  async function save(start: boolean) {
    setBusy(true);
    const res = await saveSectionTestAction({ pageId, sectionId: section.id, name, goal, variantB: draft, start });
    setBusy(false);
    if (res.id) {
      toast.show({ tone: "ok", title: start ? "Test started" : "Draft saved" });
      onSaved(res.id, start ? "running" : "draft");
      onDraft(null);
      onClose();
    } else {
      setErrors(res.fieldErrors ?? {});
      toast.show({ tone: "err", title: "Not saved", body: res.error });
    }
  }

  const close = () => { onDraft(null); onClose(); };
  return (
    <Modal open={open} onClose={close} title="Test a variant" size="xl" description="Change this section for version B. Half the visitors see it, the other half see the page as it is."
      footer={<div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
        <Button type="button" variant="secondary" pending={busy} onClick={() => save(false)}>Save as draft</Button>
        <Button type="button" pending={busy} onClick={() => save(true)}>Start the test</Button>
      </div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`${idPrefix}-name`} error={errors.name?.[0]}><Input id={`${idPrefix}-name`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Goal" htmlFor={`${idPrefix}-goal`} variant="float-static" error={errors.goal?.[0]}>
          <Select id={`${idPrefix}-goal`} value={goal} onChange={(e) => setGoal(e.target.value)}>
            {(options.section_test_goals ?? []).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </Select>
        </Field>
      </div>
      {errors.section_id && <p className="mb-3 text-12-5 text-err">{errors.section_id[0]}</p>}
      <BlockEditorProvider value={ctx}>
        <SectionEditor type={section.type} sectionId={`b${section.id}`} options={options} />
      </BlockEditorProvider>
    </Modal>
  );
}
```

The goals come from `GET /admin/pages/builder`'s `section_test_goals` (Task 4), already in hand as `options`. Add `section_test_goals?: { value: string; label: string }[]` to `PageBuilderOptions` in `types/api.ts`. No list of goals lives in TypeScript.

Check the toast hook's real call (`useToast()`'s method name) against `components/ui/toast.tsx`, and the context fields `BlockEditorProvider` expects against what `SectionCard` builds (line ~805), and match both exactly.

In `section-builder.tsx`:
- `SectionBuilder` takes two new optional props:
  - `tests?: PageSectionTests`
  - `testable?: { pageId: number; pageTitle: string }`, passed only for a published builder page
- It holds `const [testing, setTesting] = useState<string | null>(null)`, `const [bDraft, setBDraft] = useState<Obj | null>(null)` and `const [testMap, setTestMap] = useState(tests ?? {})`.
- `LivePreview` receives `sections={testing && bDraft ? sections.map((s) => (s.id === testing ? { ...s, data: bDraft } : s)) : sections}`.
- Each `SectionCard` receives `test={testMap[section.id]}`. It also receives `onTest`, set only when `testable` is set, the type is not excluded and the card has no test:

```tsx
onTest={testable && !testMap[section.id] && !(options.section_test_excluded ?? []).includes(section.type) && !kind ? () => setTesting(section.id) : undefined}
```

- `SectionCard`:
  - It shows a Badge "Testing" (running) or "Test draft" (draft).
  - It shows a MoveButton labelled `Test a variant of section ${index + 1}` when `onTest` is set.
  - When `test?.status === "running"`, the body renders this in place of the editor:

```tsx
<div className="rounded-lg border border-brand-ink/25 bg-brand-50 p-4">
  <p className="text-13-5 text-ink">This section is being tested. End the test first.</p>
  <Link href={`/admin/section-tests/${test.id}`} className="mt-2 inline-flex min-h-9 items-center rounded-md border border-line-strong bg-card px-3 text-13 font-semibold text-brand-ink">Open the test</Link>
</div>
```

  - It passes `onRemove={test?.status === "running" ? undefined : onRemove}` to `ReorderButtons`.
- The dialog is rendered once, after the live preview:

```tsx
{testing && testable && (() => {
  const s = sections.find((x) => x.id === testing);
  return s ? <SectionTestDialog open onClose={() => setTesting(null)} section={s} label={labelOf(s.type)} pageId={testable.pageId} pageTitle={testable.pageTitle}
    options={options} media={media} onDraft={setBDraft} onSaved={(id, status) => setTestMap((m) => ({ ...m, [s.id]: { id, status } }))} /> : null;
})()}
```

In `page-form.tsx`, pass these to `SectionBuilder`:
- `tests={page?.section_tests}`
- `testable={page && page.status === "published" && page.template === "builder" ? { pageId: page.id, pageTitle: page.title } : undefined}`

Add `section_test_excluded?: string[]` to `PageBuilderOptions` beside `section_test_goals`. The API refuses an excluded type anyway; the list only decides whether the button is drawn.

- [ ] **Step 6: Types, lint, and a look in the browser**

Run: `cd web; npx tsc --noEmit; npm run lint`
Expected: no output from tsc; lint reports no errors.

Open `npm run dev` and, signed in as a content manager, check that:
- `/admin/section-tests` draws its empty state;
- a published builder page's card offers "Test a variant";
- the dialog saves a draft, and the card then reads "Test draft".

- [ ] **Step 7: Commit**

```bash
git add web/src/types/section-tests.ts web/src/lib/admin/section-tests.ts web/src/lib/admin/index.ts web/src/types/api.ts "web/src/app/admin/(app)/section-tests" "web/src/app/admin/(app)/pages/builder/section-test-dialog.tsx" "web/src/app/admin/(app)/pages/builder/section-test-action.ts" "web/src/app/admin/(app)/pages/builder/section-builder.tsx" "web/src/app/admin/(app)/pages/page-form.tsx" web/src/components/ui/toast-from-params.tsx
git commit -m "Section tests: the builder dialog, the locked card, the list and the test screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Mock, probe, audits, help, docs, manual and the release

**Files:**
- Create: `web/scripts/probes/section-ab.mjs`, `docs/section-tests.md`, `manual/39-section-tests.md`
- Modify: `web/mock-api.mjs`, `web/scripts/audit.mjs` and `web/scripts/mobile-audit.mjs` (route lists, and a `DISCOVER` entry for `/admin/section-tests/{id}`), `web/src/lib/help-routes.ts`, `web/src/lib/tours.ts`, `web/src/app/admin/(app)/nav-items.tsx` (`PALETTE_SECTIONS`), `web/src/content/help.json` (regenerated by `npm run help`), `CLAUDE.md` (the Contents list near line 178, and a module block after "Native analytics"), `API.md` (a section after "## Analytics", and `POST /collect`'s `x`/`ab_click`), `manual/00-README.md`, `VERSION.md`, `web/src/lib/version.ts`
- Test: `npm run mock` with `npm run lint`/`tsc`; the probe; both audits

**Interfaces:**
- Consumes: everything above.
- Produces: `APP_VERSION = "0.189.0"`.

- [ ] **Step 1: The mock**

In `mock-api.mjs`, beside the `/admin/analytics/*` routes:

```js
      if (p === '/admin/section-tests' && req.method === 'GET') {
        return json(res, { data: [], meta: { goals: [{ value: 'click', label: 'A press on a button or link in the section' }, { value: 'enquiry', label: 'Enquiries' }],
          statuses: [{ value: 'draft', label: 'Draft' }, { value: 'running', label: 'Running' }, { value: 'ended', label: 'Ended' }],
          limits: { section: 1, page: 3, site: 20, visitors: 300, goals: 10, confidence: 95, days: 60 },
          excluded_types: ['theme_section', 'subnav', 'custom_code', 'saved', 'countdown'], analytics_enabled: true } });
      }
```

Use the mock's own JSON helper name. Add `section_tests: {}` to the mock's admin page detail. Leave `ab_tests_running` off the mock `/settings`: absent is the ordinary state.

- [ ] **Step 2: The probe**

`web/scripts/probes/section-ab.mjs`. Follow `native-analytics.mjs`'s shape: `BASE`/`API` from the environment and an administrator who only makes a throwaway content manager, deleted at the end. No credential goes in the file.

```js
import { chromium } from "playwright";

/**
 * Section A/B tests, end to end (0.189.0, docs/section-tests.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/section-ab.mjs
 *
 * Publishes the sample builder page for the run (and puts its status and
 * blocks back after), starts a test on its first allowed section with a
 * throwaway content manager, then:
 *   1. loads the page in two contexts with `tw_ab` seeded `a` and `b`: one
 *      version visible, the other display:none, no layout shift (CLS 0);
 *   2. reloads in the same tab: the version is kept;
 *   3. the pageview beacon body carries `x`; a press inside the section sends `ab_click`;
 *   4. Use version B: the page's section now holds B and page history has a new version.
 * Needs `native_analytics_enabled` on.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const API = `${process.env.API ?? "http://127.0.0.1:8000"}/api/v1`;
const env = process.env;
if (!env.ADMIN_LOGIN_EMAIL || !env.ADMIN_LOGIN_PASSWORD) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const admin = (await api("/admin/auth/login", { method: "POST", body: { email: env.ADMIN_LOGIN_EMAIL, password: env.ADMIN_LOGIN_PASSWORD } })).json?.token;
if (!admin) { console.error("Sign-in to the API failed."); process.exit(2); }
const stamp = Date.now().toString(36);
const made = await api("/admin/staff", { method: "POST", token: admin, body: { name: `Probe AB ${stamp}`, email: `probe-ab-${stamp}@example.test`, phone: "9876543210", roles: ["content_manager"], is_active: true } });
const staffId = made.json.data.id;
const editor = (await api("/admin/auth/login", { method: "POST", body: { email: made.json.data.email, password: made.json.data.generated_password } })).json.token;

const pages = (await api("/admin/pages?q=sample-builder-page", { token: editor })).json.data;
const pageId = pages.find((p) => p.slug === "sample-builder-page")?.id;
const original = (await api(`/admin/pages/${pageId}`, { token: editor })).json.data;
const target = original.blocks.find((b) => !["theme_section", "subnav", "custom_code", "saved", "countdown"].includes(b.type) && typeof b.data.heading === "string");
let testId = null;

try {
  await api(`/admin/pages/${pageId}`, { method: "PATCH", token: editor, body: { status: "published" } });
  const created = await api("/admin/section-tests", { method: "POST", token: editor, body: { page_id: pageId, section_id: target.id, name: `Probe ${stamp}`, goal: "click", variant_b: { ...target.data, heading: `Probe B ${stamp}` } } });
  testId = created.json.data.id;
  ok((await api(`/admin/section-tests/${testId}/start`, { method: "POST", token: editor })).status === 200, "the test starts");
  // The site's settings and page caches are purged by the console's action; the API alone cannot, so wait out a fresh render.
  await fetch(`${BASE}/sample-builder-page`);

  const browser = await chromium.launch();
  for (const v of ["a", "b"]) {
    const ctx = await browser.newContext({ userAgent: CHROME });
    await ctx.addInitScript(([id, v]) => sessionStorage.setItem("tw_ab", JSON.stringify({ [id]: v })), [String(testId), v]);
    const page = await ctx.newPage();
    const beacons = [];
    page.on("request", (r) => { if (r.url().endsWith("/api/collect")) beacons.push(r.postData() ?? ""); });
    await page.goto(`${BASE}/sample-builder-page`, { waitUntil: "networkidle" });
    const shown = await page.evaluate((id) => ["a", "b"].map((x) => getComputedStyle(document.querySelector(`[data-ab-v="${id}${x}"]`)).display !== "none"), testId);
    ok(shown[v === "a" ? 0 : 1] && !shown[v === "a" ? 1 : 0], `version ${v} alone is visible`);
    const cls = await page.evaluate(() => new Promise((res) => { let s = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) s += e.value; }).observe({ type: "layout-shift", buffered: true }); setTimeout(() => res(s), 500); }));
    ok(cls < 0.01, `no layout shift (${cls.toFixed(3)})`);
    await page.reload({ waitUntil: "networkidle" });
    ok(await page.evaluate((id) => document.documentElement.getAttribute(`data-ab-${id}`), testId) === v, "a reload in the same tab keeps the version");
    await page.waitForTimeout(2500);
    ok(beacons.some((b) => b.includes('"x"') && b.includes(`"${testId}":"${v}"`)), "the pageview beacon carries x");
    const link = page.locator(`[data-ab-v="${testId}${v}"] a, [data-ab-v="${testId}${v}"] button`).first();
    if (await link.count()) {
      await link.evaluate((el) => el.addEventListener("click", (e) => e.preventDefault(), { once: true }));
      await link.click();
      await page.waitForTimeout(300);
      ok(beacons.some((b) => b.includes('"ab_click"')), "a press sends ab_click");
    }
    await ctx.close();
  }
  await browser.close();

  const before = (await api(`/admin/revisions?type=page&id=${pageId}`, { token: editor })).json.data.length;
  ok((await api(`/admin/section-tests/${testId}/apply`, { method: "POST", token: editor })).status === 200, "Use version B goes through");
  const after = (await api(`/admin/pages/${pageId}`, { token: editor })).json.data;
  ok(after.blocks.find((b) => b.id === target.id).data.heading === `Probe B ${stamp}`, "the section now holds B");
  ok((await api(`/admin/revisions?type=page&id=${pageId}`, { token: editor })).json.data.length > before, "page history has a new version");
} finally {
  if (testId) await api(`/admin/section-tests/${testId}/end`, { method: "POST", token: editor });
  if (testId) await api(`/admin/section-tests/${testId}`, { method: "DELETE", token: editor });
  await api(`/admin/pages/${pageId}`, { method: "PATCH", token: editor, body: { blocks: original.blocks, status: original.status } });
  await api(`/admin/staff/${staffId}`, { method: "DELETE", token: admin });
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
```

Run against `npm run dev` (with the API up and analytics on). Under Git Bash, prefix the command with `MSYS_NO_PATHCONV=1`.

Run: `cd web; ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/section-ab.mjs`
Expected: every line `ok`, ending `all passed`.

Decision: the probe starts and ends the test by pressing the console's own buttons (Start, Use version B), never by calling the API directly — the console's Server Action is the door that purges `settings` and `pages` through `updateTag`, so the first public load after it is the new page. Say so in the probe's docblock. (A test started through the API alone shows the old page until the settings window passes; that is the same rule every settings write here follows, and docs/section-tests.md states it.)

Decision (kept from line 54): version B takes A's flags. Only the first two sections are eager, so the double download is limited to a tested section at the top of the page; making B lazy instead would make a visible B hero a lazy LCP image, which `next/image` warns about in dev and the audit fails on.

- [ ] **Step 3: Audits, help, tour, palette**

- `audit.mjs` and `mobile-audit.mjs`: add `"/admin/section-tests"`, `"/admin/section-tests?status=draft"` and `"/admin/section-tests?status=ended"` to the admin route lists, beside `/admin/analytics`. `audit.mjs` also gets `{ from: "/admin/section-tests?status=ended", match: /^\/admin\/section-tests\/\d+$/, admin: true }` in `DISCOVER`.
- `help-routes.ts`: add `{ prefix: "/admin/section-tests", sections: ["39-section-tests#starting-a-test", "39-section-tests#reading-the-result", "39-section-tests#using-the-winner"] }`.
- `tours.ts`: add a tour `sectionTests` matching `p === "/admin/section-tests"`, with these steps:
  - `[data-tour="tests-tabs"]` — "Running, drafts, ended": "Each test is in one of three lists."
  - `.grid li:first-child` — "Which is ahead": "Both versions' rates, and one sentence saying how sure that is."
- `nav-items.tsx` `PALETTE_SECTIONS`: add `{ label: "A/B tests (split tests)", href: "/admin/section-tests", group: "Content · A/B tests", keywords: "ab a/b split test experiment variant version b conversion" }`.

- [ ] **Step 4: Docs, manual, version**

- `docs/section-tests.md`: the full account of the approach, the tables, measurement, the verdict, the lock and the apply, the bell, the audits and this plan's "Decisions" section. Each rule carries the measurement or test that pins it.
- `CLAUDE.md`: add `  - Section A/B tests — \`docs/section-tests.md\`` to the Contents list after "Native analytics", and a `### Section A/B tests — \`docs/section-tests.md\`` block after the Native analytics block, one line per rule. Cover at least these:
  - both versions are in the cached HTML, the pre-paint script chooses, and `display: none` is the only hiding;
  - `ab_tests_running` is purged with `updateTag("settings")` and the page with `updateTag("pages")` on start/end/apply;
  - the beacon counts a test only with wrapper **and** attribute;
  - tallies and the newest-variant rule;
  - the same-day credit;
  - `Verdict`'s floors;
  - the lock in `PageController::update`, comparing normalised data;
  - apply validates the whole page, touches `StaleGuard`, and is recorded by `HasRevisions`;
  - B never in `faq_schema`;
  - the excluded types;
  - the morph alias `section_test`;
  - `ScreenAccess` and NAV change together;
  - the audit counts rendered headings.
- `API.md`: a "## Section A/B tests" section after "## Analytics", covering:
  - every route in Tasks 4–5, their bodies, answers and 422s with their sentences;
  - `section_tests` on `GET /admin/pages/{id}`;
  - `test` on `GET /pages/{slug}`;
  - `ab_tests_running` on `/settings`;
  - `x` and `ab_click` (`t`, `v`) on `POST /collect`, dropped silently when malformed.
- `manual/39-section-tests.md`: what a test is, "Starting a test", "Reading the result", "Using the winner", what is never counted, and why no cookie. Add its row to `manual/00-README.md` after chapter 38. Then run `cd web; npm run help` to regenerate `src/content/help.json`.
- `web/src/lib/version.ts`: `APP_VERSION = "0.189.0"`. `VERSION.md` gets a `## 0.189.0 — 2026-10-21` entry, "**A/B tests**", in the voice of the 0.188.0 entry above it.

- [ ] **Step 5: Run everything that can run**

Run, from `web/`: `npm run help; node scripts/help-routes.check.mjs; node scripts/help-convert.check.mjs; npx tsc --noEmit; npm run lint; npm run audit; npm run audit:mobile` (with `ADMIN_LOGIN_*` set, against a dev server).
Expected: the help checks pass; tsc and lint are clean; both audits exit 0 with `/admin/section-tests*` and the test screen in the run.

Run, from `api/`: `php artisan test --filter=SectionTest; composer analyse`. Do this only when no other suite is running.
Expected: every `SectionTest*` suite passes; "No errors".

Then run the whole PHP suite once: `cd api; php artisan test`.
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add web/mock-api.mjs web/scripts/probes/section-ab.mjs web/scripts/audit.mjs web/scripts/mobile-audit.mjs web/src/lib/help-routes.ts web/src/lib/tours.ts "web/src/app/admin/(app)/nav-items.tsx" web/src/content/help.json web/src/lib/version.ts docs/section-tests.md CLAUDE.md API.md manual/39-section-tests.md manual/00-README.md VERSION.md
git commit -m "0.189.0: section A/B tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

**Spec coverage.** Every spec section maps to a task:
- "How a version is chosen" → Tasks 4 (settings key) and 7.
- Data → Task 1.
- Measurement → Task 3.
- Deciding → Tasks 2 and 6.
- Ending and applying → Tasks 4 and 5.
- Rules → Tasks 4 and 5 (types, limits, lock, analytics switch, unpublished, role).
- The API → Tasks 4 and 5.
- The console → Task 8; the sidebar row and `ScreenAccess` are in Task 6, the palette, help and tour in Task 9.
- The audits → Tasks 7 and 9.
- Testing → every task.
- Release → Task 9.

**Things to verify while executing**, because the plan names them without having read every line:
- `Admin\PageResource::mediaUrls` has been made public (Task 4 says so).
- `renderSection`'s context type name.
- `PreviewResult`'s shape.
- The prop names of `Alert`, `Badge`, `EmptyState`, `Button` and `AreaChart`.
- `useToast()`'s method.
- The mock's JSON helper.
- The shape of the `OUTCOMES` `Message` type.

Each task's step says to check its own.

**Type consistency.** These names are the same everywhere they appear:
- `SectionTests::{pathOf, counts, block, refusalForSection, start, end, apply, guardPageSave, runningIds, runningFor, forPage, notes}`.
- `Tallies::{exposures, expose, click, convert, figures, figuresFor, series}`.
- `Verdict::{of, rate, percent}`.
- Web: `abIds/abScript/abStyle`, `exposures/variantOf`, and the routes' `section-tests.*` names.
