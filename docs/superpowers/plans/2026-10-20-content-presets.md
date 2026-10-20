# Content-type presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-press presets — Newsroom (press releases + "In the news"), Investors, Testimonials, Awards — built on Custom content types, each with a purpose-built archive, a builder section, a newsroom RSS feed and investor email alerts.

**Architecture:** A preset is an ordinary `ContentType` with a `preset` key and a field group whose fields are `locked`; `App\Support\Presets\Presets` is the one list. The public archive branch draws `components/presets/<preset>-archive.tsx` when `meta.type.preset` is set. Investor alerts are ordinary newsletter campaigns built from a fixed template and sent through `CampaignSender` to a standing group (`source: investors`).

**Tech Stack:** Laravel 13 / PHP 8.3 / MySQL 8 (api/), Next.js 16 App Router / TypeScript / Tailwind v4 (web/), PHPUnit 12, Playwright audits.

**Spec:** `docs/superpowers/specs/2026-10-20-content-presets-design.md`

## Global Constraints

- Read `CLAUDE.md` ("Things that will bite you") and `docs/custom-content.md` before starting. Every rule there applies.
- PHP files are LF (`.gitattributes`); `web/` files are CRLF. Never edit with Python `write_text`.
- PowerShell 5.1 has no `&&`. Bash heredocs eat backslashes — write long files with the Write tool.
- Never hard-code a hex; tokens only. Never a card without a ground (`bg-card`).
- Every label on the wire (dates especially) is the API's. Dates in `en-IN` through `lib/dates.ts` if formatted client-side at all.
- A route handler link is a plain `<a>`, never `next/link`.
- Server Actions: `updateTag()`, never `revalidateTag()`; `redirect()` outside `try`.
- `role:content_manager` for everything in this release.
- Preset keys (type-level): `newsroom_releases`, `newsroom_coverage`, `investors`, `testimonials`, `awards`. Install keys: `newsroom`, `investors`, `testimonials`, `awards`.
- Default slugs: `newsroom`, `in-the-news`, `investors`, `testimonials`, `awards`.
- Version 0.186.0: `VERSION.md` + `web/src/lib/version.ts`.
- If you change an API response shape, change `web/mock-api.mjs` too.
- Tests: `php artisan test --filter=<Name>` from `api/`; the DB is `technoweb_test` (pinned in `phpunit.xml`). `composer analyse` must say "No errors".

## Review Focus

1. **A preset type renamed (slug changed) after installing** — the layouts, the RSS feed, the homepage testimonial, the investor group and the builder section must keep working: everything looks a type up by `preset`, never by slug. Test in Task 3 (`test_presets_are_found_by_preset_not_slug`).
2. **An editor deletes or rekeys a locked field through the group form** — refused with a sentence naming the preset; a label edit still saves. Test in Task 2.
3. **An investors entry saved published with a future date and the switch on** — no alert until the date arrives, then exactly one. Test in Task 4 (`test_a_scheduled_document_alerts_once_when_it_goes_live`).
4. **`entry_pages: false` entries reached by an old link or the sitemap** — the detail read 404s, search/menus link the archive, the sitemap lists no entry URL. Tests in Task 1 and Task 7.
5. **A content manager edits the newsroom boilerplate** (settings are `role:admin` otherwise) — the narrow preset-settings door accepts only the preset's own keys and sanitises the rich text. Test in Task 3 (`test_preset_settings_accept_only_their_own_keys`).

---

### Task 1: Schema, `entry_pages` and the locked flag on the models

**Files:**
- Create: `api/database/migrations/2026_10_25_100000_add_presets_to_content_types.php`
- Modify: `api/app/Models/ContentType.php` (fillable, casts, `PRESETS`, `scopePreset`)
- Modify: `api/app/Models/Entry.php` (fillable, casts, `publicPath()`, `hasOwnPage()`)
- Modify: `api/app/Models/CustomField.php` (fillable, casts for `locked`)
- Modify: `api/app/Http/Controllers/Api/V1/ContentTypeController.php` (`show()` 404 when no own page)
- Modify: `api/app/Http/Resources/ContentTypeResource.php` (public: `preset`, `entry_pages`)
- Modify: `api/app/Http/Resources/Admin/ContentTypeResource.php` (`preset`, `entry_pages`)
- Modify: `api/app/Http/Requests/ContentTypeRequest.php` (`entry_pages` boolean, `preset` prohibited)
- Test: `api/tests/Feature/ContentPresetsTest.php` (new)

**Interfaces:**
- Produces: `ContentType::PRESETS` (string[] of the five type-level keys), `ContentType::scopePreset(Builder, string)`, `Entry::hasOwnPage(): bool`, `Entry::publicPath(): string` (archive path when the type has `entry_pages = false`), columns `content_types.preset|entry_pages`, `custom_fields.locked`, `entries.alert_on_publish|alert_sent_at|alert_error|alert_campaign_id`.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/ContentPresetsTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Content-type presets (docs/content-presets.md): newsroom, investors,
 * testimonials and awards, installed in one press on top of custom content
 * types.
 */
class ContentPresetsTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::firstOrCreate(['email' => $role->value.'-presets@example.test'], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(
            ['slug' => $role->value], ['name' => $role->label()],
        )->id]);

        return $user;
    }

    public function test_an_entry_of_a_type_without_entry_pages_links_to_the_archive_and_has_no_page(): void
    {
        $type = ContentType::create([
            'name' => 'Testimonial', 'plural' => 'Testimonials', 'slug' => 'praise',
            'schema_type' => 'WebPage', 'entry_pages' => false,
        ]);
        $entry = Entry::create([
            'content_type_id' => $type->id, 'title' => 'R. Kulkarni', 'status' => 'published',
        ]);

        $this->assertFalse($entry->hasOwnPage());
        $this->assertSame('/praise', $entry->publicPath());
        $this->getJson('/api/v1/types/praise/'.$entry->slug)->assertNotFound();
        $this->getJson('/api/v1/types/praise')->assertOk()
            ->assertJsonPath('meta.type.entry_pages', false)
            ->assertJsonPath('data.0.path', '/praise');
    }

    public function test_an_ordinary_type_keeps_its_entry_pages(): void
    {
        $type = ContentType::create(['name' => 'Event', 'plural' => 'Events', 'slug' => 'gatherings', 'schema_type' => 'Article']);
        $entry = Entry::create(['content_type_id' => $type->id, 'title' => 'Launch', 'status' => 'published']);

        $this->assertTrue($entry->hasOwnPage());
        $this->assertSame('/gatherings/launch', $entry->publicPath());
        $this->getJson('/api/v1/types/gatherings/launch')->assertOk()->assertJsonPath('data.type.slug', 'gatherings');
    }

    public function test_preset_cannot_be_set_through_the_type_form(): void
    {
        $type = ContentType::create(['name' => 'Event', 'plural' => 'Events', 'slug' => 'gatherings', 'schema_type' => 'Article']);

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/content-types/{$type->id}", ['preset' => 'awards'])
            ->assertStatus(422)->assertJsonValidationErrors('preset');

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/content-types/{$type->id}", ['entry_pages' => false])
            ->assertOk()->assertJsonPath('data.entry_pages', false);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `api/`): `php artisan test --filter=ContentPresetsTest`
Expected: FAIL — unknown column `entry_pages`.

- [ ] **Step 3: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content-type presets (0.186.0, docs/content-presets.md). Additive: a type
 * may say which preset it was installed from and whether its entries have
 * pages of their own; a field may be locked because a preset's layout reads
 * it; an investors entry remembers its email alert.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('content_types', function (Blueprint $table) {
            $table->string('preset', 40)->nullable()->unique()->after('slug');
            $table->boolean('entry_pages')->default(true)->after('archive_enabled');
        });

        Schema::table('custom_fields', function (Blueprint $table) {
            $table->boolean('locked')->default(false)->after('show_on_page');
        });

        Schema::table('entries', function (Blueprint $table) {
            $table->boolean('alert_on_publish')->default(false)->after('sort_order');
            $table->timestamp('alert_sent_at')->nullable()->after('alert_on_publish');
            $table->text('alert_error')->nullable()->after('alert_sent_at');
            $table->unsignedBigInteger('alert_campaign_id')->nullable()->after('alert_error');
        });
    }

    public function down(): void
    {
        Schema::table('entries', fn (Blueprint $t) => $t->dropColumn(['alert_on_publish', 'alert_sent_at', 'alert_error', 'alert_campaign_id']));
        Schema::table('custom_fields', fn (Blueprint $t) => $t->dropColumn('locked'));
        Schema::table('content_types', function (Blueprint $t) {
            $t->dropUnique(['preset']);
            $t->dropColumn(['preset', 'entry_pages']);
        });
    }
};
```

- [ ] **Step 4: Model changes**

`ContentType.php`: add `'preset', 'entry_pages'` to `$fillable`; `'entry_pages' => 'boolean'` to casts; add

```php
    /** Every preset a type can carry (docs/content-presets.md). */
    public const PRESETS = ['newsroom_releases', 'newsroom_coverage', 'investors', 'testimonials', 'awards'];

    /**
     * The type installed from a preset — found by `preset`, never by slug:
     * an editor may rename the address, and every layout, the feed and the
     * investor alerts must follow it.
     *
     * @param  Builder<ContentType>  $query
     * @return Builder<ContentType>
     */
    public function scopePreset(Builder $query, string $preset): Builder
    {
        return $query->where('preset', $preset);
    }
```

`CustomField.php`: add `'locked'` to fillable and `'locked' => 'boolean'` to casts.

`Entry.php`: add `'alert_on_publish'` to fillable; casts `'alert_on_publish' => 'boolean', 'alert_sent_at' => 'datetime'`; add `private ?bool $ownPageCache = null;` and:

```php
    /**
     * Whether this entry has a page of its own. A testimonial, an award, a
     * piece of coverage or an investor document is drawn on its type's
     * archive and nowhere else (`entry_pages`), so its address is the
     * archive's — search, menus, share paths and site health all link there.
     */
    public function hasOwnPage(): bool
    {
        if ($this->relationLoaded('contentType') && $this->contentType !== null) {
            return (bool) $this->contentType->entry_pages;
        }

        return $this->ownPageCache ??= (bool) (ContentType::query()->whereKey($this->content_type_id)->value('entry_pages') ?? true);
    }

    public function publicPath(): string
    {
        return $this->hasOwnPage() ? $this->urlPrefix().'/'.$this->slug : $this->urlPrefix();
    }
```

- [ ] **Step 5: Request, controller, resources**

`ContentTypeRequest::rules()` add:

```php
            'entry_pages' => ['sometimes', 'boolean'],
            // Set by installing a preset, never by the form: a preset is a
            // promise that its locked fields exist, which a form cannot keep.
            'preset' => ['prohibited'],
```

and to `messages()`: `'preset.prohibited' => 'A preset is chosen by installing it from the presets strip, not on this form.'`.

`Api\V1\ContentTypeController::show()` — after finding the entry type:

```php
        $contentType = ContentType::active()->where('slug', $type)->firstOrFail();
        // An entry drawn only on its archive has no page to read (`entry_pages`).
        abort_unless($contentType->entry_pages, 404);
```

Both `ContentTypeResource`s: add `'preset' => $this->preset, 'entry_pages' => (bool) $this->entry_pages,` beside `archive_enabled`. In `EntryResource` the `type` block add `'preset' => $this->contentType->preset, 'entry_pages' => (bool) $this->contentType->entry_pages`.

- [ ] **Step 6: Run the tests**

Run: `php artisan migrate` then `php artisan test --filter=ContentPresetsTest` and `php artisan test --filter=ContentTypesTest`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add api/database/migrations/2026_10_25_100000_add_presets_to_content_types.php api/app/Models api/app/Http api/tests/Feature/ContentPresetsTest.php
git commit -m "Presets: the schema, entry_pages and the locked flag"
```

---

### Task 2: The preset list, installing, and locked fields

**Files:**
- Create: `api/app/Support/Presets/Presets.php`
- Create: `api/app/Support/Presets/PresetInstaller.php`
- Create: `api/app/Http/Controllers/Api/V1/Admin/ContentPresetController.php`
- Modify: `api/routes/api/admin-content-manager.php` (two routes above `content-types/{content_type:id}`)
- Modify: `api/app/Http/Requests/CustomFieldGroupRequest.php` (locked-field checks)
- Modify: `api/app/Http/Controllers/Api/V1/Admin/CustomFieldGroupController.php` (`destroy` refusal; keep `locked` and `pattern` on sync)
- Modify: `api/app/Support/CustomFields/CustomFields.php` (Text `pattern` setting → `regex:`)
- Modify: `api/app/Http/Resources/Admin/CustomFieldGroupResource.php` (field `locked`)
- Test: `api/tests/Feature/ContentPresetsTest.php`

**Interfaces:**
- Consumes: Task 1 columns and `ContentType::scopePreset`.
- Produces: `Presets::all(): array<string, array{label:string, blurb:string, types: list<array>}>` keyed by install key; `Presets::forType(string $preset): ?array` (one type definition); `Presets::INSTALL_KEYS`; `PresetInstaller::install(string $key, array $slugs): array<ContentType>`; `Presets::INVESTOR_GROUP_SOURCE = 'investors'`; `Presets::investorGroup(): NewsletterGroup`.
- Routes: `GET /admin/content-types/presets`, `POST /admin/content-types/presets/{key}`.

- [ ] **Step 1: Write the failing tests** (append to `ContentPresetsTest`)

```php
    public function test_installing_investors_makes_the_type_its_locked_fields_and_the_group(): void
    {
        $res = $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/presets/investors')
            ->assertCreated()->assertJsonPath('data.0.slug', 'investors')->assertJsonPath('data.0.preset', 'investors');

        $type = ContentType::preset('investors')->firstOrFail();
        $this->assertFalse($type->entry_pages);
        $fields = \App\Models\CustomField::query()->whereHas('group', fn ($q) => $q->whereJsonContains('targets', 'entry:investors'))->get()->keyBy('key');
        $this->assertTrue($fields['document']->locked);
        $this->assertTrue($fields['document']->required);
        $this->assertSame('^\d{4}-\d{2}$', $fields['financial_year']->setting('pattern'));
        $this->assertDatabaseHas('newsletter_groups', ['source' => 'investors']);
    }

    public function test_installing_the_newsroom_makes_both_types(): void
    {
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/presets/newsroom')
            ->assertCreated()->assertJsonCount(2, 'data');

        $this->assertTrue(ContentType::preset('newsroom_releases')->value('entry_pages'));
        $this->assertFalse(ContentType::preset('newsroom_coverage')->value('entry_pages'));
        $this->assertSame('in-the-news', ContentType::preset('newsroom_coverage')->value('slug'));
    }

    public function test_a_preset_installs_once_and_a_clash_names_what_holds_the_slug(): void
    {
        \App\Models\Page::create(['title' => 'Awards', 'slug' => 'awards', 'status' => 'published']);
        $as = $this->actingAs($this->staff(), 'sanctum');

        $as->postJson('/api/v1/admin/content-types/presets/awards')
            ->assertStatus(422)->assertJsonValidationErrors('slug');
        $as->getJson('/api/v1/admin/content-types/presets')->assertOk()
            ->assertJsonPath('data.3.key', 'awards')->assertJsonPath('data.3.clash', 'A page already uses /awards.');

        $as->postJson('/api/v1/admin/content-types/presets/awards', ['slug' => 'recognition'])->assertCreated();
        $as->postJson('/api/v1/admin/content-types/presets/awards', ['slug' => 'other'])
            ->assertStatus(422)->assertJsonValidationErrors('key');
    }

    public function test_a_locked_field_keeps_its_key_and_kind_and_cannot_be_deleted(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $as->postJson('/api/v1/admin/content-types/presets/awards')->assertCreated();
        $group = \App\Models\CustomFieldGroup::query()->forTarget('entry:awards')->firstOrFail();
        $fields = $as->getJson("/api/v1/admin/custom-field-groups/{$group->id}")->json('data.fields');

        // Relabel: fine.
        $relabel = array_map(fn ($f) => $f['key'] === 'awarding_body' ? [...$f, 'label' => 'Given by'] : $f, $fields);
        $as->patchJson("/api/v1/admin/custom-field-groups/{$group->id}", ['fields' => $relabel])->assertOk();

        // Rekey: refused.
        $rekey = array_map(fn ($f) => $f['key'] === 'year' ? [...$f, 'key' => 'won_in'] : $f, $fields);
        $as->patchJson("/api/v1/admin/custom-field-groups/{$group->id}", ['fields' => $rekey])
            ->assertStatus(422)->assertJsonValidationErrors('fields.1.key');

        // Delete: refused.
        $without = array_values(array_filter($fields, fn ($f) => $f['key'] !== 'badge'));
        $as->patchJson("/api/v1/admin/custom-field-groups/{$group->id}", ['fields' => $without])
            ->assertStatus(422)->assertJsonValidationErrors('fields');

        // The whole group: refused.
        $as->deleteJson("/api/v1/admin/custom-field-groups/{$group->id}")->assertStatus(422);
    }

    public function test_installing_needs_a_content_manager(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->postJson('/api/v1/admin/content-types/presets/awards')->assertForbidden();
    }

    public function test_deleting_an_empty_preset_type_frees_the_preset(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $id = $as->postJson('/api/v1/admin/content-types/presets/awards')->json('data.0.id');
        $as->deleteJson("/api/v1/admin/content-types/{$id}")->assertNoContent();
        $as->postJson('/api/v1/admin/content-types/presets/awards')->assertCreated();
    }
```

Note: `test_deleting_an_empty_preset_type_frees_the_preset` requires the type's field group to be deleted with the type. `PresetInstaller` records the group on the type implicitly through its target `entry:<slug>`; in `Admin\ContentTypeController::destroy()`, before deleting, delete groups `forTarget($type->target())` whose fields are all locked to this preset (the installer's own group: `slug = 'preset-'.<preset>`). Implement: `CustomFieldGroup::query()->where('slug', 'preset-'.$contentType->preset)->delete()` when `$contentType->preset` is set.

- [ ] **Step 2: Run to verify failures**

Run: `php artisan test --filter=ContentPresetsTest`
Expected: the six new tests FAIL (404 route).

- [ ] **Step 3: `Presets.php`**

```php
<?php

namespace App\Support\Presets;

use App\Models\NewsletterGroup;
use Illuminate\Support\Str;

/**
 * The one list of content-type presets (docs/content-presets.md). A preset is
 * the defaults of one or more content types and one field group each; once
 * installed it is an ordinary type the editor owns. The fields marked
 * `locked` are the ones a layout reads by key.
 */
final class Presets
{
    public const INSTALL_KEYS = ['newsroom', 'investors', 'testimonials', 'awards'];

    public const INVESTOR_GROUP_SOURCE = 'investors';

    /** @return array<string, array{label: string, blurb: string, types: list<array<string, mixed>>}> */
    public static function all(): array
    {
        return [
            'newsroom' => [
                'label' => 'Newsroom',
                'blurb' => 'Press releases with a dateline and a media contact, the coverage others have written about you, and a media kit.',
                'types' => [self::releases(), self::coverage()],
            ],
            'investors' => [
                'label' => 'Investors',
                'blurb' => 'Results, annual reports, filings and notices, grouped by financial year, with an email alert for subscribers.',
                'types' => [self::investors()],
            ],
            'testimonials' => [
                'label' => 'Testimonials',
                'blurb' => 'Quotes from customers with their name, role, company and photo — shown as cards, on the homepage and in any page.',
                'types' => [self::testimonials()],
            ],
            'awards' => [
                'label' => 'Awards',
                'blurb' => 'Awards and recognition by year, each with the awarding body and its badge.',
                'types' => [self::awards()],
            ],
        ];
    }

    /** One type's definition by its type-level preset key. */
    public static function forType(string $preset): ?array
    {
        foreach (self::all() as $def) {
            foreach ($def['types'] as $type) {
                if ($type['preset'] === $preset) {
                    return $type;
                }
            }
        }

        return null;
    }

    /** The standing "Investor updates" group, found by `source`, created if absent. */
    public static function investorGroup(): NewsletterGroup
    {
        return NewsletterGroup::firstOrCreate(['source' => self::INVESTOR_GROUP_SOURCE], [
            'name' => 'Investor updates',
            'slug' => Str::slug('Investor updates'),
            'description' => 'People who asked, on the investors page, to be emailed when a document is published.',
            'is_active' => true,
        ]);
    }

    /** @param list<array<string, mixed>> $fields */
    private static function type(string $preset, string $name, string $plural, string $slug, string $icon, string $schema, bool $body, bool $image, bool $pages, string $sort, int $perPage, array $fields): array
    {
        return [
            'preset' => $preset,
            'defaults' => [
                'name' => $name, 'plural' => $plural, 'slug' => $slug, 'icon' => $icon,
                'schema_type' => $schema, 'has_body' => $body, 'has_image' => $image,
                'archive_enabled' => true, 'entry_pages' => $pages, 'sort' => $sort, 'per_page' => $perPage,
            ],
            'fields' => $fields,
        ];
    }

    /** @param array<string, mixed> $extra */
    private static function field(string $key, string $label, string $kind, bool $locked = true, bool $required = false, array $extra = []): array
    {
        return ['key' => $key, 'label' => $label, 'kind' => $kind, 'locked' => $locked, 'required' => $required, 'show_on_page' => false, ...$extra];
    }

    private static function releases(): array
    {
        return self::type('newsroom_releases', 'Press release', 'Press releases', 'newsroom', 'megaphone', 'Article', true, true, true, 'newest', 12, [
            self::field('dateline', 'Dateline', 'text', true, false, ['help' => 'The city the release is issued from, e.g. Kolkata.', 'settings' => ['max_length' => 60]]),
            self::field('release_pdf', 'Release as a PDF', 'file'),
            self::field('contact_name', 'Media contact (this release only)', 'text', false),
            self::field('contact_email', 'Media contact email', 'email', false),
            self::field('contact_phone', 'Media contact phone', 'text', false),
        ]);
    }

    private static function coverage(): array
    {
        return self::type('newsroom_coverage', 'Coverage', 'In the news', 'in-the-news', 'newspaper', 'WebPage', false, false, false, 'newest', 24, [
            self::field('publication', 'Publication', 'text', true, true),
            self::field('article_url', 'Link to the article', 'url', true, true),
            self::field('publication_logo', 'Publication logo', 'image'),
            self::field('coverage_date', 'Date of the article', 'date'),
        ]);
    }

    private static function investors(): array
    {
        $types = ['Financial results', 'Annual report', 'Shareholding pattern', 'Board meeting outcome', 'Notice of meeting',
            'Corporate governance', 'Policy', 'Stock exchange filing', 'Other'];

        return self::type('investors', 'Investor document', 'Investors', 'investors', 'chart', 'WebPage', false, false, false, 'newest', 100, [
            self::field('document_type', 'Document type', 'select', true, true, ['options' => array_map(
                fn ($l) => ['value' => Str::slug($l, '_'), 'label' => $l], $types)]),
            self::field('financial_year', 'Financial year', 'text', true, true, [
                'help' => 'Written as 2025-26.', 'settings' => ['max_length' => 7, 'pattern' => '^\d{4}-\d{2}$']]),
            self::field('document', 'Document', 'file', true, true),
            self::field('document_date', 'Date of the document', 'date'),
        ]);
    }

    private static function testimonials(): array
    {
        return self::type('testimonials', 'Testimonial', 'Testimonials', 'testimonials', 'quote', 'WebPage', false, false, false, 'manual', 24, [
            self::field('quote', 'Quote', 'textarea', true, true),
            self::field('role', 'Their role', 'text'),
            self::field('company', 'Company', 'text'),
            self::field('photo', 'Photo', 'image'),
            self::field('company_logo', 'Company logo', 'image'),
            self::field('featured', 'Featured', 'boolean', true, false, ['help' => 'The newest featured testimonial can stand on the homepage.']),
        ]);
    }

    private static function awards(): array
    {
        return self::type('awards', 'Award', 'Awards', 'awards', 'trophy', 'WebPage', false, false, false, 'newest', 48, [
            self::field('awarding_body', 'Awarding body', 'text', true, true),
            self::field('year', 'Year', 'number', true, true, ['settings' => ['min' => 1900, 'max' => 2100]]),
            self::field('category', 'Category', 'text'),
            self::field('badge', 'Badge', 'image'),
            self::field('link', 'Link', 'url'),
        ]);
    }
}
```

Check every icon name exists in `web/src/components/icons.tsx` `iconMap` (`grep -n "megaphone\|newspaper\|chart\|quote\|trophy" web/src/components/icons.tsx`); substitute an existing key for any that does not, or use `ms:campaign`, `ms:newspaper`, `ms:monitoring`, `ms:format_quote`, `ms:trophy` (Material Symbols, valid per `IconKey::RULE`).

- [ ] **Step 4: `PresetInstaller.php`**

```php
<?php

namespace App\Support\Presets;

use App\Models\ContentType;
use App\Models\CustomFieldGroup;
use App\Models\Page;
use App\Support\ReservedSlugs;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Installs a preset: its type(s) and a field group each, in one transaction,
 * so a half-made preset cannot exist.
 */
final class PresetInstaller
{
    /** Why a slug cannot be used, in one sentence, or null. */
    public static function clash(string $slug): ?string
    {
        if (in_array($slug, ReservedSlugs::all(), true)) {
            return "/{$slug} belongs to a part of the site that already exists.";
        }
        if (Page::query()->where('slug', $slug)->exists()) {
            return "A page already uses /{$slug}.";
        }
        if ($other = ContentType::query()->where('slug', $slug)->value('plural')) {
            return "The content type “{$other}” already uses /{$slug}.";
        }

        return null;
    }

    /**
     * @param  array<string, string>  $slugs  type-level preset key => chosen slug
     * @return list<ContentType>
     */
    public static function install(string $key, array $slugs = []): array
    {
        $def = Presets::all()[$key] ?? null;
        abort_if($def === null, 404);

        foreach ($def['types'] as $t) {
            if (ContentType::preset($t['preset'])->exists()) {
                throw ValidationException::withMessages(['key' => "The {$def['label']} preset is already installed."]);
            }
        }

        foreach ($def['types'] as $i => $t) {
            $slug = strtolower(trim($slugs[$t['preset']] ?? $t['defaults']['slug']));
            $field = $i === 0 ? 'slug' : 'coverage_slug';
            if (! preg_match('/^[a-z][a-z0-9-]*$/', $slug)) {
                throw ValidationException::withMessages([$field => 'The address must start with a letter and use only lowercase letters, numbers and hyphens.']);
            }
            if ($why = self::clash($slug)) {
                throw ValidationException::withMessages([$field => $why.' Choose another address.']);
            }
        }

        return DB::transaction(function () use ($def, $slugs, $key) {
            $made = [];
            foreach ($def['types'] as $t) {
                $type = ContentType::create([
                    ...$t['defaults'],
                    'slug' => strtolower(trim($slugs[$t['preset']] ?? $t['defaults']['slug'])),
                    'preset' => $t['preset'],
                ]);

                $group = CustomFieldGroup::create([
                    'name' => $t['defaults']['plural'],
                    'slug' => 'preset-'.$t['preset'],
                    'targets' => [$type->target()],
                    'placement' => 'hidden',
                    'is_active' => true,
                ]);

                foreach ($t['fields'] as $n => $f) {
                    $group->fields()->create([
                        'key' => $f['key'], 'label' => $f['label'], 'kind' => $f['kind'],
                        'help' => $f['help'] ?? null, 'required' => $f['required'],
                        'show_on_page' => false, 'locked' => $f['locked'],
                        'options' => $f['options'] ?? null, 'settings' => $f['settings'] ?? null,
                        'sort_order' => $n,
                    ]);
                }

                $made[] = $type;
            }

            if ($key === 'investors') {
                Presets::investorGroup();
            }

            return $made;
        });
    }
}
```

`placement: hidden` because the preset layouts draw the fields themselves; the generic "Details" list would repeat them.

- [ ] **Step 5: Controller and routes**

`ContentPresetController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\ContentTypeResource;
use App\Models\ContentType;
use App\Support\Presets\PresetInstaller;
use App\Support\Presets\Presets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The presets strip on Content → Content types (docs/content-presets.md). */
class ContentPresetController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = [];
        foreach (Presets::all() as $key => $def) {
            $first = $def['types'][0];
            $installed = ContentType::preset($first['preset'])->first(['id', 'slug']);
            $rows[] = [
                'key' => $key,
                'label' => $def['label'],
                'blurb' => $def['blurb'],
                'slug' => $first['defaults']['slug'],
                'types' => array_map(fn ($t) => [
                    'preset' => $t['preset'], 'plural' => $t['defaults']['plural'], 'slug' => $t['defaults']['slug'],
                    'fields' => array_map(fn ($f) => ['key' => $f['key'], 'label' => $f['label'], 'kind' => $f['kind']], $t['fields']),
                ], $def['types']),
                'installed' => $installed ? ['id' => $installed->id, 'slug' => $installed->slug] : null,
                'clash' => $installed ? null : PresetInstaller::clash($first['defaults']['slug']),
            ];
        }

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, Presets::INSTALL_KEYS, true), 404);
        $data = $request->validate([
            'slug' => ['nullable', 'string', 'max:60'],
            'coverage_slug' => ['nullable', 'string', 'max:60'],
        ]);

        $types = Presets::all()[$key]['types'];
        $slugs = array_filter([
            $types[0]['preset'] => $data['slug'] ?? null,
            ($types[1]['preset'] ?? '') => $data['coverage_slug'] ?? null,
        ]);

        $made = PresetInstaller::install($key, $slugs);

        return ContentTypeResource::collection(collect($made)->map->loadCount('entries'))
            ->response()->setStatusCode(201);
    }
}
```

Routes (`admin-content-manager.php`, **above** `content-types/{content_type:id}`):

```php
    Route::get('content-types/presets', [ContentPresetController::class, 'index'])->name('content-types.presets');
    Route::post('content-types/presets/{key}', [ContentPresetController::class, 'store'])->whereIn('key', ['newsroom', 'investors', 'testimonials', 'awards'])->name('content-types.presets.install');
```

`Admin\ContentTypeController::destroy()`: before `$contentType->delete()` add `if ($contentType->preset) { CustomFieldGroup::query()->where('slug', 'preset-'.$contentType->preset)->delete(); }`.

- [ ] **Step 6: Locked fields in the group request and controller**

In `CustomFieldGroupRequest::withValidator()` add a call `$this->checkLocked($v, $group)` where `$group` is the routed group; implement:

```php
    /**
     * A preset's layout reads these fields by key (docs/content-presets.md),
     * so their key and kind are fixed and they cannot be removed. The label,
     * the help and whether they are required stay the editor's.
     */
    private function checkLocked(Validator $v, ?CustomFieldGroup $group): void
    {
        if ($group === null || ! $this->has('fields')) {
            return;
        }

        $locked = $group->fields()->where('locked', true)->get()->keyBy('id');
        if ($locked->isEmpty()) {
            return;
        }

        $preset = str_replace('preset-', '', (string) $group->slug);
        $label = \App\Support\Presets\Presets::forType($preset)['defaults']['plural'] ?? 'preset';
        $sent = collect((array) $this->input('fields'))->values();

        foreach ($locked as $id => $field) {
            $i = $sent->search(fn ($f) => (int) ($f['id'] ?? 0) === $id);
            if ($i === false) {
                $v->errors()->add('fields', "“{$field->label}” is part of the {$label} layout and cannot be removed.");
                continue;
            }
            $row = $sent[$i];
            if (($row['key'] ?? null) !== $field->key) {
                $v->errors()->add("fields.$i.key", "The {$label} layout reads this field as “{$field->key}”, so its key cannot change.");
            }
            if (($row['kind'] ?? null) !== $field->kind->value) {
                $v->errors()->add("fields.$i.kind", "The {$label} layout reads this field as {$field->kind->label()}, so its type cannot change.");
            }
        }

        if ($this->has('targets') && $group->slug && str_starts_with($group->slug, 'preset-')) {
            $own = (array) $group->targets;
            foreach ($own as $t) {
                if (! in_array($t, (array) $this->input('targets'), true)) {
                    $v->errors()->add('targets', "This group belongs to the {$label} preset and must stay attached to it.");
                }
            }
        }
    }
```

In `CustomFieldGroupController::syncFields()`, when `$existing` is found, keep the stored lock and pattern:

```php
            if ($existing) {
                $attributes['locked'] = $existing->locked;
                if ($existing->setting('pattern') !== null) {
                    $attributes['settings'] = [...($attributes['settings'] ?? []), 'pattern' => $existing->setting('pattern')];
                }
                $existing->update($attributes);
            }
```

`destroy()`: refuse a preset group:

```php
        if ($customFieldGroup->fields()->where('locked', true)->exists()) {
            return response()->json([
                'message' => 'This group belongs to a preset — its layout reads these fields. Delete the content type instead.',
                'errors' => ['group' => ['A preset’s field group cannot be deleted on its own.']],
            ], 422);
        }
```

`CustomFieldGroupResource` field rows: add `'locked' => (bool) $field->locked`.

`CustomFields::rules()` Text case: after building, `if (is_string($field->setting('pattern'))) { $rules[$path][] = 'regex:/'.$field->setting('pattern').'/'; }`, and in `attributes()`/messages add for a pattern field the message `"{$field->label} must be written like 2025-26."` via a `messages(string $target): array` method if one exists; otherwise add the message in `EntryRequest::messages()` as `custom_fields.financial_year.regex`.

- [ ] **Step 7: Run tests**

Run: `php artisan test --filter=ContentPresetsTest` then `php artisan test --filter=CustomFieldsTest`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/app/Support/Presets api/app/Http api/app/Support/CustomFields api/routes/api/admin-content-manager.php api/tests/Feature/ContentPresetsTest.php
git commit -m "Presets: the list, installing, and locked fields"
```

---

### Task 3: Public reads, preset settings and the homepage testimonial

**Files:**
- Modify: `api/app/Http/Controllers/Api/V1/ContentTypeController.php` (`archive()`: custom values, filters, `newsroom_kit`)
- Create: `api/app/Http/Controllers/Api/V1/Admin/PresetSettingsController.php`
- Modify: `api/routes/api/admin-content-manager.php` (`GET|PATCH content-types/{content_type:id}/preset-settings`)
- Modify: `api/database/seeders/SettingsSeeder.php` (groups `newsroom`, `investors`; `homepage.testimonial_source`)
- Modify: `api/app/Support/PublicSettings.php` (`GROUPS` + the testimonial override)
- Modify: `api/app/Models/Entry.php` (a `saved` hook purging the settings cache for a testimonial — see step 5)
- Test: `api/tests/Feature/ContentPresetsTest.php`

**Interfaces:**
- Consumes: Task 2 install.
- Produces: `GET /types/{type}` index rows carry `custom_data` for preset types; `?type=`, `?year=` (investors), `?featured=1` (testimonials); `meta.newsroom_kit` (releases type: `DownloadResource[]`); settings keys `newsroom_boilerplate`, `newsroom_contact_name|email|phone`, `newsroom_kit_category_id`, `investors_contact_name|email|phone`, `investors_signup_line`, `testimonial_source`; `PresetSettingsController::KEYS[preset]`.

- [ ] **Step 1: Write the failing tests**

```php
    private function install(string $key): void
    {
        $this->actingAs($this->staff(), 'sanctum')->postJson("/api/v1/admin/content-types/presets/{$key}")->assertCreated();
    }

    private function entry(string $preset, string $title, array $fields, array $extra = []): Entry
    {
        $type = ContentType::preset($preset)->firstOrFail();
        $id = $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/content-types/{$type->slug}/entries", [
                'title' => $title, 'status' => 'published', 'custom_fields' => $fields, ...$extra,
            ])->assertCreated()->json('data.id');

        return Entry::findOrFail($id);
    }

    public function test_an_investors_archive_carries_custom_data_and_filters_by_type_and_year(): void
    {
        $this->install('investors');
        $pdf = \App\Models\Media::create(['filename' => 'q2.pdf', 'path' => 'media/q2.pdf', 'mime' => 'application/pdf', 'size' => 1200]);
        $this->entry('investors', 'Q2 results', ['document_type' => 'financial_results', 'financial_year' => '2026-27', 'document' => $pdf->path]);
        $this->entry('investors', 'Annual report', ['document_type' => 'annual_report', 'financial_year' => '2025-26', 'document' => $pdf->path]);

        $this->getJson('/api/v1/types/investors')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.custom_data.document.name', 'q2.pdf');
        $this->getJson('/api/v1/types/investors?type=annual_report')->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Annual report');
        $this->getJson('/api/v1/types/investors?year=2026-27')->assertJsonCount(1, 'data');
    }

    public function test_a_financial_year_is_held_to_its_shape(): void
    {
        $this->install('investors');
        $type = ContentType::preset('investors')->firstOrFail();
        $pdf = \App\Models\Media::create(['filename' => 'a.pdf', 'path' => 'media/a.pdf', 'mime' => 'application/pdf', 'size' => 10]);
        $this->actingAs($this->staff(), 'sanctum')->postJson("/api/v1/admin/content-types/{$type->slug}/entries", [
            'title' => 'X', 'status' => 'published',
            'custom_fields' => ['document_type' => 'other', 'financial_year' => '2026', 'document' => $pdf->path],
        ])->assertStatus(422)->assertJsonValidationErrors('custom_fields.financial_year');
    }

    public function test_presets_are_found_by_preset_not_slug(): void
    {
        $this->install('testimonials');
        $type = ContentType::preset('testimonials')->firstOrFail();
        $this->actingAs($this->staff(), 'sanctum')->patchJson("/api/v1/admin/content-types/{$type->id}", ['slug' => 'kind-words'])->assertOk();
        $this->entry('testimonials', 'R. Kulkarni', ['quote' => 'They pick up.', 'featured' => true, 'role' => 'Head of IT']);

        \App\Models\Setting::query()->where('key', 'testimonial_source')->update(['value' => 'preset']);
        \App\Models\Setting::flushCache();

        $this->getJson('/api/v1/settings')->assertOk()
            ->assertJsonPath('data.testimonial_quote', 'They pick up.')
            ->assertJsonPath('data.testimonial_author', 'R. Kulkarni')
            ->assertJsonPath('data.testimonial_role', 'Head of IT');
    }

    public function test_the_homepage_quote_falls_back_to_the_typed_one(): void
    {
        $this->seed(\Database\Seeders\SettingsSeeder::class);
        \App\Models\Setting::query()->where('key', 'testimonial_source')->update(['value' => 'preset']);
        \App\Models\Setting::flushCache();
        $typed = \App\Models\Setting::query()->where('key', 'testimonial_quote')->value('value');

        $this->getJson('/api/v1/settings')->assertJsonPath('data.testimonial_quote', $typed);
    }

    public function test_preset_settings_accept_only_their_own_keys(): void
    {
        $this->seed(\Database\Seeders\SettingsSeeder::class);
        $this->install('newsroom');
        $type = ContentType::preset('newsroom_releases')->firstOrFail();
        $as = $this->actingAs($this->staff(), 'sanctum');

        $as->patchJson("/api/v1/admin/content-types/{$type->id}/preset-settings", ['settings' => [
            ['key' => 'newsroom_boilerplate', 'value' => '<p>About us.</p><script>x()</script>'],
        ]])->assertOk();
        $this->assertSame('<p>About us.</p>', \App\Models\Setting::query()->where('key', 'newsroom_boilerplate')->value('value'));

        $as->patchJson("/api/v1/admin/content-types/{$type->id}/preset-settings", ['settings' => [
            ['key' => 'smtp_password', 'value' => 'x'],
        ]])->assertStatus(422);
        $as->patchJson("/api/v1/admin/content-types/{$type->id}/preset-settings", ['settings' => [
            ['key' => 'investors_contact_name', 'value' => 'x'],
        ]])->assertStatus(422);
    }
```

Check `Media` model's real column names (`grep -n fillable api/app/Models/Media.php`) and adjust the `Media::create` calls.

- [ ] **Step 2: Run to verify failures**

Run: `php artisan test --filter=ContentPresetsTest`
Expected: the new tests FAIL.

- [ ] **Step 3: `archive()` changes**

In `Api\V1\ContentTypeController::archive()` after `$query = …->with('seo');`:

```php
        // A preset's layout reads its fields on every row (docs/content-presets.md);
        // an ordinary archive's tiles do not, and do not pay for them.
        if ($contentType->preset) {
            $query->with('customValues.field.group');
        }

        $byValue = function (string $key, mixed $value) use ($query) {
            $query->whereHas('customValues', fn ($q) => $q
                ->whereHas('field', fn ($f) => $f->where('key', $key))
                ->whereJsonContains('value', $value));
        };

        if ($contentType->preset === 'investors') {
            if ($request->filled('type')) {
                $byValue('document_type', $request->string('type')->value());
            }
            if ($request->filled('year')) {
                $byValue('financial_year', $request->string('year')->value());
            }
        }
        if ($contentType->preset === 'testimonials' && $request->boolean('featured')) {
            $byValue('featured', true);
        }
```

and in the `additional` meta:

```php
        $meta = ['type' => new ContentTypeResource($contentType)];
        if ($contentType->preset === 'newsroom_releases' && ($cat = (int) Setting::get('newsroom_kit_category_id')) > 0) {
            $meta['newsroom_kit'] = DownloadResource::collection(
                Download::query()->published()->where('download_category_id', $cat)->orderBy('sort_order')->orderBy('title')->get()
            )->resolve();
        }
```

Check `DownloadResource` needs any eager loads (`grep -n whenLoaded api/app/Http/Resources/DownloadResource.php`) and add them.

- [ ] **Step 4: Settings rows**

`SettingsSeeder` (beside the `homepage` rows):

```php
            ['group' => 'homepage', 'key' => 'testimonial_source', 'value' => 'typed', 'type' => 'string',
                'options' => [['value' => 'typed', 'label' => 'The quote typed here'], ['value' => 'preset', 'label' => 'The newest featured testimonial']]],
            ['group' => 'newsroom', 'key' => 'newsroom_boilerplate', 'value' => null, 'type' => 'html'],
            ['group' => 'newsroom', 'key' => 'newsroom_contact_name', 'value' => null, 'type' => 'string'],
            ['group' => 'newsroom', 'key' => 'newsroom_contact_email', 'value' => null, 'type' => 'string'],
            ['group' => 'newsroom', 'key' => 'newsroom_contact_phone', 'value' => null, 'type' => 'string'],
            ['group' => 'newsroom', 'key' => 'newsroom_kit_category_id', 'value' => null, 'type' => 'string'],
            ['group' => 'investors', 'key' => 'investors_contact_name', 'value' => null, 'type' => 'string'],
            ['group' => 'investors', 'key' => 'investors_contact_email', 'value' => null, 'type' => 'string'],
            ['group' => 'investors', 'key' => 'investors_contact_phone', 'value' => null, 'type' => 'string'],
            ['group' => 'investors', 'key' => 'investors_signup_line', 'value' => null, 'type' => 'string'],
```

Match the seeder's real row shape — read how an existing row with `options` and a rich-text row (`login_message`) is declared and copy that exactly. Add `'newsroom', 'investors'` to `PublicSettings::GROUPS`. Add the two groups to the settings screen's exclusions the way `store_promo` is excluded (`grep -n "store_promo" web/src/app/admin/(app)/settings/settings-copy.ts`), and add `testimonial_source` to the Homepage tab's `why` field list beside `testimonial_quote` with copy `{ label: "Which quote", hint: "The typed quote, or the newest testimonial marked Featured (Testimonials preset). Falls back to the typed quote." }`.

- [ ] **Step 5: The testimonial override in `PublicSettings::build()`**

At the end of `build()`, before returning the map:

```php
        /*
         * The homepage pull-quote may be the newest featured testimonial
         * (docs/content-presets.md). Resolved here, onto the same three keys
         * the twelve themes' `WhyUs` already read, so no theme changes; a
         * testimonials type that is absent, off or holds nothing featured
         * leaves the typed quote standing.
         */
        if (($map['testimonial_source'] ?? 'typed') === 'preset') {
            $map = [...$map, ...self::featuredTestimonial()];
        }
```

```php
    /** @return array<string, string> */
    private static function featuredTestimonial(): array
    {
        $type = ContentType::active()->preset('testimonials')->first();
        if ($type === null) {
            return [];
        }

        $entry = $type->entries()->published()
            ->whereHas('customValues', fn ($q) => $q->whereHas('field', fn ($f) => $f->where('key', 'featured'))->whereJsonContains('value', true))
            ->with('customValues.field')
            ->orderByDesc('published_at')->orderByDesc('id')->first();
        if ($entry === null) {
            return [];
        }

        $value = fn (string $key) => $entry->customValues->first(fn ($v) => $v->field?->key === $key)?->value;
        $quote = trim((string) $value('quote'));
        if ($quote === '') {
            return [];
        }

        $role = implode(', ', array_filter([trim((string) $value('role')), trim((string) $value('company'))]));

        return array_filter([
            'testimonial_quote' => $quote,
            'testimonial_author' => (string) $entry->title,
            'testimonial_role' => $role,
        ], fn ($v) => $v !== '');
    }
```

Use the variable name `build()` actually returns (read the method; it may not be `$map`). If `build()` is cached (`Cache::remember`), the cached map would hold a stale testimonial: add to `Entry::booted()` a `saved`/`deleted` hook — `if ($entry->contentType()->value('preset') === 'testimonials') { Setting::flushCache(); }` — read it through `ContentType::query()->whereKey($entry->content_type_id)->value('preset')`, never a lazy load. On the web side (Task 9) the testimonials entry action also `updateTag("settings")`.

- [ ] **Step 6: `PresetSettingsController`**

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContentType;
use App\Models\DownloadCategory;
use App\Models\Setting;
use App\Support\HtmlSanitiser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * A preset type's own settings — the newsroom's boilerplate and press
 * contact, the investors page's contact — edited on the type's form by the
 * content manager who owns it. Settings as a whole stay `role:admin`; this
 * door names its keys (the store promo's rule) and refuses any other.
 */
class PresetSettingsController extends Controller
{
    public const KEYS = [
        'newsroom_releases' => ['newsroom_boilerplate', 'newsroom_contact_name', 'newsroom_contact_email', 'newsroom_contact_phone', 'newsroom_kit_category_id'],
        'investors' => ['investors_contact_name', 'investors_contact_email', 'investors_contact_phone', 'investors_signup_line'],
    ];

    public function show(ContentType $contentType): JsonResponse
    {
        return response()->json(['data' => $this->rows($contentType), 'meta' => $this->meta($contentType)]);
    }

    public function update(Request $request, ContentType $contentType): JsonResponse
    {
        $keys = self::KEYS[$contentType->preset] ?? [];
        abort_if($keys === [], 404);

        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'in:'.implode(',', $keys)],
            'settings.*.value' => ['nullable', 'string', 'max:5000'],
        ]);

        foreach ($data['settings'] as $i => $row) {
            $v = $row['value'] ?? null;
            if (blank($v)) {
                continue;
            }
            if (str_ends_with($row['key'], '_email') && ! filter_var($v, FILTER_VALIDATE_EMAIL)) {
                throw ValidationException::withMessages(["settings.$i.value" => 'That is not an email address.']);
            }
            if ($row['key'] === 'newsroom_kit_category_id' && ! DownloadCategory::query()->whereKey((int) $v)->exists()) {
                throw ValidationException::withMessages(["settings.$i.value" => 'Choose a downloads category.']);
            }
            if ($row['key'] === 'investors_signup_line' && mb_strlen($v) > 200) {
                throw ValidationException::withMessages(["settings.$i.value" => 'At most 200 characters.']);
            }
        }

        $existing = Setting::query()->whereIn('key', $keys)->get()->keyBy('key');
        foreach ($data['settings'] as $row) {
            $setting = $existing->get($row['key']);
            if (! $setting) {
                continue;
            }
            $value = $row['key'] === 'newsroom_boilerplate' ? HtmlSanitiser::clean($row['value'] ?? null) : ($row['value'] ?? null);
            $setting->setPlainValue($value);
            $setting->save();
        }
        Setting::flushCache();

        return response()->json(['message' => 'Saved.', 'data' => $this->rows($contentType), 'meta' => $this->meta($contentType)]);
    }

    private function rows(ContentType $type): array
    {
        $keys = self::KEYS[$type->preset] ?? [];

        return Setting::query()->whereIn('key', $keys)->get()
            ->sortBy(fn ($s) => array_search($s->key, $keys, true))
            ->map(fn (Setting $s) => ['key' => $s->key, 'value' => $s->plainValue(), 'type' => $s->type])
            ->values()->all();
    }

    private function meta(ContentType $type): array
    {
        return $type->preset === 'newsroom_releases'
            ? ['download_categories' => DownloadCategory::query()->orderBy('sort_order')->get(['id', 'name'])->toArray()]
            : [];
    }
}
```

Use the setting accessors the promo controller uses (`setPlainValue`, and whatever its `rows()` uses to read — copy it). Routes:

```php
    Route::get('content-types/{content_type:id}/preset-settings', [PresetSettingsController::class, 'show'])->name('content-types.preset-settings');
    Route::patch('content-types/{content_type:id}/preset-settings', [PresetSettingsController::class, 'update'])->name('content-types.preset-settings.update');
```

- [ ] **Step 7: Run tests**

Run: `php artisan test --filter=ContentPresetsTest` and `php artisan test --filter=Settings`
Expected: PASS. Run `php artisan test --filter=SettingsScreensTest` too — it reads `settings-copy.ts` against the seeder; it will tell you whether the two groups need an entry in `STANDALONE_GROUPS` / exclusions.

- [ ] **Step 8: Commit**

```bash
git add api "web/src/app/admin/(app)/settings/settings-copy.ts"
git commit -m "Presets: public reads, preset settings and the homepage testimonial"
```

---

### Task 4: Investor signup and email alerts

**Files:**
- Create: `api/app/Support/Presets/InvestorAlerts.php`
- Create: `api/app/Console/Commands/SendInvestorAlerts.php`
- Create: `api/app/Jobs/SendInvestorAlertsJob.php`
- Modify: `api/routes/console.php` (every 10 minutes)
- Modify: `api/app/Http/Controllers/Api/V1/NewsletterController.php` (`subscribe()` `list`)
- Modify: `api/app/Http/Requests/EntryRequest.php` (`alert_on_publish`)
- Modify: `api/app/Http/Controllers/Api/V1/Admin/EntryController.php` (dispatch after save; clear `alert_error`; `alert()` action)
- Modify: `api/app/Http/Resources/Admin/EntryResource.php` (four alert fields)
- Modify: `api/routes/api/admin-content-manager.php` (`POST content-types/{content_type:slug}/entries/{entry:id}/alert`, throttle 6/min)
- Test: `api/tests/Feature/InvestorAlertsTest.php` (new)

**Interfaces:**
- Consumes: `Presets::investorGroup()`, `ContentType::scopePreset`, `CampaignSender::queue(NewsletterCampaign): array{queued: bool, recipients: int, batches: int, reason?: string}`, `HealthCheck::run(NewsletterCampaign): array{score:int, blocking: list<string>}`, `EmailRenderer::render(array $blocks, array $branding): string`, `Branding::all()`, `HtmlSanitiser::toText()`, `SubscriberIntake::take(?string $email, array $attributes, array $groupIds, string $source)`.
- Produces: `InvestorAlerts::due(): Builder`, `InvestorAlerts::send(Entry $entry): ?string` (null on success, the refusal sentence otherwise), command `technoware:send-investor-alerts`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\Media;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\User;
use App\Support\Presets\InvestorAlerts;
use App\Support\Presets\Presets;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Investor alerts (docs/content-presets.md): once per document, through a campaign. */
class InvestorAlertsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\SettingsSeeder::class);
        // A postal address so the campaign passes its blocking health checks.
        \App\Models\Setting::query()->where('key', 'address')->update(['value' => '1 Park Street, Kolkata 700016']);
        \App\Models\Setting::flushCache();
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/presets/investors')->assertCreated();
    }

    private function staff(): User
    {
        $u = User::firstOrCreate(['email' => 'cm-alerts@example.test'], ['name' => 'Ed', 'password' => 'password-for-tests', 'is_active' => true]);
        $u->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'CM'])->id]);

        return $u;
    }

    private function document(array $extra = []): Entry
    {
        $pdf = Media::firstOrCreate(['path' => 'media/r.pdf'], ['filename' => 'r.pdf', 'mime' => 'application/pdf', 'size' => 10]);
        $id = $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/investors/entries', [
            'title' => 'Q2 results', 'status' => 'published',
            'custom_fields' => ['document_type' => 'financial_results', 'financial_year' => '2026-27', 'document' => $pdf->path],
            ...$extra,
        ])->assertCreated()->json('data.id');

        return Entry::findOrFail($id);
    }

    private function subscriber(string $email = 'investor@example.test'): void
    {
        $this->postJson('/api/v1/newsletter/subscribe', ['email' => $email, 'list' => 'investors'])->assertStatus(202);
    }

    public function test_signup_with_the_investors_list_lands_in_the_investor_group(): void
    {
        $this->subscriber();
        $group = Presets::investorGroup();
        $this->assertTrue($group->subscribers()->where('email', 'investor@example.test')->exists());
    }

    public function test_the_switch_sends_one_alert_when_the_document_is_published(): void
    {
        $this->subscriber();
        $entry = $this->document(['alert_on_publish' => true]);
        $this->artisan('technoware:send-investor-alerts')->assertSuccessful();
        $this->artisan('technoware:send-investor-alerts')->assertSuccessful();

        $this->assertNotNull($entry->fresh()->alert_sent_at);
        $this->assertSame(1, NewsletterCampaign::query()->count());
        $this->assertStringContainsString('Q2 results', (string) NewsletterCampaign::query()->value('subject'));
    }

    public function test_a_scheduled_document_alerts_once_when_it_goes_live(): void
    {
        $this->subscriber();
        $entry = $this->document(['alert_on_publish' => true, 'published_at' => now()->addDay()->toIso8601String()]);
        $this->artisan('technoware:send-investor-alerts');
        $this->assertNull($entry->fresh()->alert_sent_at);

        $this->travel(2)->days();
        $this->artisan('technoware:send-investor-alerts');
        $this->artisan('technoware:send-investor-alerts');
        $this->assertNotNull($entry->fresh()->alert_sent_at);
        $this->assertSame(1, NewsletterCampaign::query()->count());
    }

    public function test_the_button_sends_once_and_refuses_a_second_press_and_a_draft(): void
    {
        $this->subscriber();
        $entry = $this->document();
        $url = "/api/v1/admin/content-types/investors/entries/{$entry->id}/alert";

        $this->actingAs($this->staff(), 'sanctum')->postJson($url)->assertStatus(202);
        $this->actingAs($this->staff(), 'sanctum')->postJson($url)->assertStatus(422)->assertJsonValidationErrors('alert');

        $draft = $this->document(['status' => 'draft']);
        $this->actingAs($this->staff(), 'sanctum')->postJson("/api/v1/admin/content-types/investors/entries/{$draft->id}/alert")
            ->assertStatus(422)->assertJsonValidationErrors('alert');
    }

    public function test_two_sends_at_once_make_one_campaign(): void
    {
        $this->subscriber();
        $entry = $this->document();
        $this->assertNull(InvestorAlerts::send($entry->fresh()));
        $this->assertSame('An alert for this document has already been sent.', InvestorAlerts::send($entry->fresh()));
        $this->assertSame(1, NewsletterCampaign::query()->count());
    }

    public function test_a_health_refusal_is_written_and_not_retried(): void
    {
        $this->subscriber();
        \App\Models\Setting::query()->whereIn('key', ['address', 'newsletter_address'])->update(['value' => null]);
        \App\Models\Setting::flushCache();
        $entry = $this->document(['alert_on_publish' => true]);

        $this->artisan('technoware:send-investor-alerts');
        $fresh = $entry->fresh();
        $this->assertNull($fresh->alert_sent_at);
        $this->assertNotNull($fresh->alert_error);
        $this->assertSame(0, InvestorAlerts::due()->count());
    }

    public function test_a_suppressed_address_is_not_added(): void
    {
        NewsletterSuppression::create(['email' => 'gone@example.test', 'reason' => 'unsubscribed']);
        $this->subscriber('gone@example.test');
        $this->assertFalse(Presets::investorGroup()->subscribers()->where('email', 'gone@example.test')->exists());
    }

    public function test_the_alert_switch_belongs_to_investors_only(): void
    {
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/presets/awards')->assertCreated();
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/awards/entries', [
            'title' => 'Best partner', 'status' => 'published', 'alert_on_publish' => true,
            'custom_fields' => ['awarding_body' => 'Cisco', 'year' => 2026],
        ])->assertStatus(422)->assertJsonValidationErrors('alert_on_publish');
    }
}
```

Check the real `NewsletterSuppression` columns and the health check's postal-address keys (`grep -n "address" api/app/Support/Newsletter/HealthCheck.php`) and adjust setUp and the refusal test accordingly.

- [ ] **Step 2: Run to verify failures**

Run: `php artisan test --filter=InvestorAlertsTest`
Expected: FAIL.

- [ ] **Step 3: Signup `list`**

In `NewsletterController::subscribe()` add `'list' => ['nullable', Rule::in(['general', 'investors'])]` to the rules, and replace the group lookup:

```php
        // `list: investors` is the investors page's signup band
        // (docs/content-presets.md): the same intake, into the standing
        // group the preset made. Not installed, nothing is written and the
        // answer is the same.
        if (($data['list'] ?? 'general') === 'investors') {
            $group = NewsletterGroup::where('source', Presets::INVESTOR_GROUP_SOURCE)->first();
            if ($group === null) {
                return $answer;
            }
        } else {
            $group = NewsletterGroup::where('slug', 'general-newsletter')->first();
        }
        $groupIds = $group ? [$group->id] : [];
```

- [ ] **Step 4: `InvestorAlerts.php`**

```php
<?php

namespace App\Support\Presets;

use App\Enums\CampaignStatus;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\NewsletterCampaign;
use App\Support\HtmlSanitiser;
use App\Support\Newsletter\Branding;
use App\Support\Newsletter\CampaignSender;
use App\Support\Newsletter\EmailRenderer;
use App\Support\Newsletter\HealthCheck;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Investor alerts (docs/content-presets.md): one email per document, to the
 * "Investor updates" group, as an ordinary campaign — so the unsubscribe
 * link, the suppression list, tracking, the blocking health checks and the
 * report in Campaign are the newsletter's own. Never throws to its caller.
 */
final class InvestorAlerts
{
    /** @return Builder<Entry> */
    public static function due(): Builder
    {
        return Entry::query()->published()
            ->whereIn('content_type_id', ContentType::query()->preset('investors')->select('id'))
            ->where('alert_on_publish', true)
            ->whereNull('alert_sent_at')
            ->whereNull('alert_error');
    }

    /** Null when sent; otherwise the sentence saying why not. */
    public static function send(Entry $entry): ?string
    {
        try {
            if (! $entry->isPublic()) {
                return 'Only a published document can be announced.';
            }

            // The claim: one conditional UPDATE, so two presses or a press and
            // the sweep cannot both send.
            $claimed = Entry::query()->whereKey($entry->id)->whereNull('alert_sent_at')
                ->update(['alert_sent_at' => now(), 'alert_error' => null]);
            if ($claimed === 0) {
                return 'An alert for this document has already been sent.';
            }

            $campaign = self::campaign($entry->fresh());
            $health = HealthCheck::run($campaign);
            if ($health['blocking'] !== []) {
                return self::refuse($entry, $campaign, implode(' ', $health['blocking']));
            }

            $campaign->update(['status' => CampaignStatus::Ready, 'health_score' => $health['score']]);
            $result = CampaignSender::queue($campaign->fresh());
            if (! $result['queued']) {
                return self::refuse($entry, $campaign, (string) ($result['reason'] ?? 'The alert could not be queued.'));
            }

            Entry::query()->whereKey($entry->id)->update(['alert_campaign_id' => $campaign->id]);

            return null;
        } catch (Throwable $e) {
            Log::warning('Investor alert failed', ['entry' => $entry->id, 'error' => $e->getMessage()]);
            Entry::query()->whereKey($entry->id)->update(['alert_sent_at' => null, 'alert_error' => 'The alert could not be sent. Try again.']);

            return 'The alert could not be sent. Try again.';
        }
    }

    private static function refuse(Entry $entry, NewsletterCampaign $campaign, string $why): string
    {
        $campaign->groups()->detach();
        $campaign->delete();
        Entry::query()->whereKey($entry->id)->update(['alert_sent_at' => null, 'alert_error' => $why]);

        return $why;
    }

    private static function campaign(Entry $entry): NewsletterCampaign
    {
        $branding = Branding::all();
        $company = (string) ($branding['company'] ?? config('app.name'));
        $type = ContentType::query()->whereKey($entry->content_type_id)->firstOrFail();
        $values = $entry->customValues()->with('field')->get()->mapWithKeys(fn ($v) => [$v->field?->key => $v->value]);
        $kind = collect($type->target() ? \App\Support\CustomFields\CustomFields::fieldsFor($type->target()) : [])
            ->get('document_type')?->optionLabel((string) ($values['document_type'] ?? '')) ?? '';
        $url = rtrim((string) config('app.frontend_url'), '/').'/'.$type->slug.'#entry-'.$entry->id;

        $blocks = [
            ['type' => 'header'],
            ['type' => 'heading', 'level' => 1, 'text' => $entry->title],
            ['type' => 'text', 'html' => '<p>'.e(trim($kind.' · '.($values['financial_year'] ?? ''), ' ·')).'</p>'],
            ['type' => 'button', 'label' => 'View on our investors page', 'url' => $url],
            ['type' => 'footer'],
        ];
        $html = EmailRenderer::render($blocks, $branding);

        $campaign = NewsletterCampaign::create([
            'name' => 'Investor alert — '.$entry->title,
            'subject' => $company.': '.$entry->title,
            'blocks' => $blocks,
            'html_content' => $html,
            'text_content' => HtmlSanitiser::toText($html),
            'status' => CampaignStatus::Draft,
        ]);
        $campaign->groups()->sync([Presets::investorGroup()->id]);

        return $campaign;
    }
}
```

Before writing: read `EmailRenderer::text()` and `button()` for the real block keys (`html` vs `text`, `url` vs `href`), `CustomField` for an option-label helper (add `optionLabel(string $value): ?string` to `CustomField` if absent: `collect($this->options ?? [])->firstWhere('value', $value)['label'] ?? null`), `NewsletterCampaign::$fillable` and `CampaignStatus` cases; adjust names to match. `DB` import unused — remove it.

- [ ] **Step 5: Command, job, schedule**

```php
<?php

namespace App\Console\Commands;

use App\Support\Presets\InvestorAlerts;
use Illuminate\Console\Command;

class SendInvestorAlerts extends Command
{
    protected $signature = 'technoware:send-investor-alerts';

    protected $description = 'Email the investor list about documents that went live with "Email subscribers when published" on.';

    public function handle(): int
    {
        InvestorAlerts::due()->get()->each(fn ($entry) => InvestorAlerts::send($entry));

        return self::SUCCESS;
    }
}
```

`SendInvestorAlertsJob` (queued, `ShouldBeUnique` for 60s) whose `handle()` calls `Artisan::call('technoware:send-investor-alerts')`. `routes/console.php`: `Schedule::command('technoware:send-investor-alerts')->everyTenMinutes()->withoutOverlapping();`.

- [ ] **Step 6: Entry request, controller, resource**

`EntryRequest::rules()`: `'alert_on_publish' => ['sometimes', 'boolean']`, and in `withValidator` add: when `alert_on_publish` is present and the routed type's `preset !== 'investors'`, error `alert_on_publish` "Only investor documents send an email alert.". `EntryController::store()`/`update()`: after the save, if the type is investors: clear `alert_error` (`$entry->forceFill(['alert_error' => null])->saveQuietly()`) and `SendInvestorAlertsJob::dispatch()->afterCommit()`. New action:

```php
    public function alert(ContentType $contentType, Entry $entry): JsonResponse
    {
        abort_unless($entry->content_type_id === $contentType->id, 404);
        if ($contentType->preset !== 'investors') {
            return response()->json(['message' => 'Only investor documents send an email alert.', 'errors' => ['alert' => ['Only investor documents send an email alert.']]], 422);
        }
        if ($why = InvestorAlerts::send($entry)) {
            return response()->json(['message' => $why, 'errors' => ['alert' => [$why]]], 422);
        }

        return response()->json(['message' => 'The alert is on its way to the investor list.'], 202);
    }
```

Admin `EntryResource`: add `'alert_on_publish' => (bool) $this->alert_on_publish, 'alert_sent_at' => $this->alert_sent_at?->toIso8601String(), 'alert_error' => $this->alert_error, 'alert_campaign_id' => $this->alert_campaign_id,`. Route (in the scoped entries group):

```php
        Route::post('content-types/{content_type:slug}/entries/{entry:id}/alert', [EntryController::class, 'alert'])->middleware('throttle:6,1')->name('entries.alert');
```

- [ ] **Step 7: Run tests**

Run: `php artisan test --filter=InvestorAlertsTest` then `php artisan test --filter=Newsletter`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api
git commit -m "Presets: investor signup and email alerts"
```

---

### Task 5: Builder — the "From a preset" section and the testimonials source

**Files:**
- Modify: `api/app/Enums/PageSectionType.php` (`PresetList = 'preset_list'`, label, blurb)
- Modify: `api/app/Support/PageSections/SectionRules.php` (rules for `preset_list`; `testimonials` `source`)
- Modify: `api/app/Support/PageSections/SectionPresenter.php` (present both)
- Modify: the builder options controller that answers `GET /admin/pages/builder` (`grep -rn "section_types" api/app/Http/Controllers | head`) — add `presets`
- Test: `api/tests/Feature/PresetSectionsTest.php` (new)

**Interfaces:**
- Consumes: `ContentType::scopePreset`, `CustomFields::publicData(Model)`.
- Produces: section `preset_list` public shape `{preset, kicker?, heading?, lede?, index_path, items: EntryResource-shaped rows with custom_data}`; `testimonials` with `source: preset` presents `items: [{quote, name, role, photo, photo_alt, photo_focus, photo_blur, company_logo}]`; builder options `presets: [{value, label, document_types?: [{value,label}]}]`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\ContentType;
use App\Models\Page;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PresetSectionsTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
    {
        $u = User::firstOrCreate(['email' => 'cm-sections@example.test'], ['name' => 'Ed', 'password' => 'password-for-tests', 'is_active' => true]);
        $u->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'CM'])->id]);

        return $u;
    }

    private function page(array $section)
    {
        return $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => 'About', 'slug' => 'about-us', 'status' => 'published', 'template' => 'builder',
            'blocks' => [['id' => (string) Str::uuid(), 'type' => $section['type'], 'data' => $section['data']]],
        ]);
    }

    public function test_a_preset_list_needs_an_installed_preset(): void
    {
        $this->page(['type' => 'preset_list', 'data' => ['preset' => 'awards']])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.preset');
    }

    public function test_a_preset_list_presents_published_entries_and_drops_when_empty(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $as->postJson('/api/v1/admin/content-types/presets/awards')->assertCreated();
        $this->page(['type' => 'preset_list', 'data' => ['preset' => 'awards', 'limit' => 3]])->assertCreated();
        $this->getJson('/api/v1/pages/about-us')->assertOk()->assertJsonCount(0, 'data.sections');

        $as->postJson('/api/v1/admin/content-types/awards/entries', [
            'title' => 'Partner of the year', 'status' => 'published',
            'custom_fields' => ['awarding_body' => 'Cisco', 'year' => 2026],
        ])->assertCreated();
        $this->getJson('/api/v1/pages/about-us')->assertOk()
            ->assertJsonPath('data.sections.0.type', 'preset_list')
            ->assertJsonPath('data.sections.0.data.index_path', '/awards')
            ->assertJsonPath('data.sections.0.data.items.0.custom_data.awarding_body', 'Cisco');
    }

    public function test_testimonials_from_the_preset_have_the_typed_shape(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $as->postJson('/api/v1/admin/content-types/presets/testimonials')->assertCreated();
        foreach (['A. Sen', 'B. Roy'] as $name) {
            $as->postJson('/api/v1/admin/content-types/testimonials/entries', [
                'title' => $name, 'status' => 'published', 'custom_fields' => ['quote' => "Quote from {$name}", 'role' => 'CIO'],
            ])->assertCreated();
        }
        $this->page(['type' => 'testimonials', 'data' => ['source' => 'preset', 'limit' => 4]])->assertCreated();

        $this->getJson('/api/v1/pages/about-us')->assertOk()
            ->assertJsonCount(2, 'data.sections.0.data.items')
            ->assertJsonPath('data.sections.0.data.items.0.name', 'B. Roy')
            ->assertJsonPath('data.sections.0.data.items.0.role', 'CIO');
    }

    public function test_typed_testimonials_are_unchanged(): void
    {
        $this->page(['type' => 'testimonials', 'data' => ['items' => [
            ['quote' => 'One', 'name' => 'A'], ['quote' => 'Two', 'name' => 'B'],
        ]]])->assertCreated();
        $data = $this->getJson('/api/v1/pages/about-us')->json('data.sections.0.data');
        $this->assertArrayNotHasKey('source', $data);
        $this->assertSame('One', $data['items'][0]['quote']);
    }
}
```

Note the manual sort: testimonials are `sort: manual` (by `sort_order`, then title) — "B. Roy" first only if the presenter orders newest first. Decide: the section uses the type's own order (manual → `sort_order`, title), so change the expectation to `'A. Sen'`. Keep whichever matches the type's `sort` and say so in the presenter comment.

- [ ] **Step 2: Run to verify failures**

Run: `php artisan test --filter=PresetSectionsTest`
Expected: FAIL.

- [ ] **Step 3: Enum and rules**

`PageSectionType`: add `case PresetList = 'preset_list';` beside `Downloads`, with label "From a preset" and blurb "A live list from the newsroom, the coverage, the investors page or the awards." (follow the enum's existing `label()`/`blurb()` match arms). It must **not** be a record block.

`SectionRules::for()`:

```php
            PageSectionType::PresetList => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'preset' => ['required', Rule::in(['newsroom_releases', 'newsroom_coverage', 'investors', 'awards'])],
                'limit' => ['nullable', 'integer', 'min:1', 'max:12'],
                'document_type' => ['nullable', 'string', 'max:60'],
            ],
```

`Testimonials`: make items conditional:

```php
            PageSectionType::Testimonials => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                // Typed here (the default, not stored) or read from the
                // Testimonials preset (docs/content-presets.md).
                'source' => ['nullable', Rule::in(['custom', 'preset'])],
                'featured_only' => ['nullable', 'boolean'],
                'limit' => ['nullable', 'integer', 'min:2', 'max:9'],
                'items' => [($data['source'] ?? 'custom') === 'preset' ? 'nullable' : 'required', 'array', 'min:2', 'max:9'],
                'items.*.quote' => ['required', 'string', 'max:600'],
                'items.*.name' => ['required', 'string', 'max:120'],
                'items.*.role' => ['nullable', 'string', 'max:160'],
                'items.*.photo_path' => ['nullable', 'string', 'max:255'],
            ],
```

Check how `for()` receives the section's data (the Downloads `source` rule does the same — copy its mechanism for the conditional). In `after()`:

```php
            case PageSectionType::PresetList:
                if (filled($data['preset'] ?? null) && ! ContentType::query()->preset((string) $data['preset'])->exists()) {
                    $validator->errors()->add("{$at}.preset", 'That preset is not installed. Install it from Content → Content types first.');
                }
                break;
```

and in `normalise()` drop `source: custom` (default never stored), drop `items` when `source: preset`, drop `featured_only`/`limit` when not preset — follow how Downloads normalises `source`.

- [ ] **Step 4: Presenter**

In `SectionPresenter`:

```php
            PageSectionType::PresetList => self::presetList($data),
            PageSectionType::Testimonials => ($data['source'] ?? null) === 'preset'
                ? self::presetTestimonials($data)
                : [...$data, 'items' => /* the existing mapping, unchanged */],
```

```php
    /**
     * A preset's published entries, in its own order (docs/content-presets.md).
     * Dropped when the preset is not installed, is switched off, or has
     * nothing published — a dead reference's rule.
     */
    private static function presetList(array $data): ?array
    {
        $type = ContentType::active()->preset((string) ($data['preset'] ?? ''))->first();
        if ($type === null) {
            return null;
        }

        $query = $type->entries()->published()->with('customValues.field.group');
        if ($type->preset === 'investors' && filled($data['document_type'] ?? null)) {
            $query->whereHas('customValues', fn ($q) => $q->whereHas('field', fn ($f) => $f->where('key', 'document_type'))
                ->whereJsonContains('value', (string) $data['document_type']));
        }
        $type->sort === 'manual' ? $query->orderBy('sort_order')->orderBy('title') : $query->orderByDesc('published_at')->orderByDesc('id');

        $entries = $query->limit((int) ($data['limit'] ?? 6))->get()->each(fn ($e) => $e->setRelation('contentType', $type));
        if ($entries->isEmpty()) {
            return null;
        }

        return [...$data, 'index_path' => $type->publicPath(), 'items' => EntryResource::collection($entries)->resolve()];
    }

    /** The Testimonials preset in the typed section's shape. */
    private static function presetTestimonials(array $data): ?array
    {
        $type = ContentType::active()->preset('testimonials')->first();
        if ($type === null) {
            return null;
        }

        $query = $type->entries()->published()->with('customValues.field')->orderBy('sort_order')->orderBy('title');
        if (! empty($data['featured_only'])) {
            $query->whereHas('customValues', fn ($q) => $q->whereHas('field', fn ($f) => $f->where('key', 'featured'))->whereJsonContains('value', true));
        }

        $items = $query->limit((int) ($data['limit'] ?? 6))->get()->map(function ($e) {
            $v = fn (string $k) => $e->customValues->first(fn ($c) => $c->field?->key === $k)?->value;
            $photo = $v('photo');
            $logo = $v('company_logo');

            return [
                'quote' => (string) $v('quote'),
                'name' => (string) $e->title,
                'role' => implode(', ', array_filter([$v('role'), $v('company')])) ?: null,
                'photo' => $photo ? MediaUrl::for($photo) : null,
                'photo_alt' => MediaMeta::alt($photo),
                'photo_focus' => MediaMeta::focus($photo),
                'photo_blur' => MediaMeta::blur($photo),
                'company_logo' => $logo ? MediaUrl::for($logo) : null,
            ];
        })->filter(fn ($i) => $i['quote'] !== '')->values()->all();

        if (count($items) < 2) {
            return null;
        }

        return [...collect($data)->except(['source', 'featured_only', 'limit'])->all(), 'items' => $items];
    }
```

Match the existing typed mapping's keys exactly (read the current `Testimonials` arm and copy its item keys — if it emits `photo` and `photo_alt`, the preset output must emit the same names). Remove `source` from the presented data so the web component is unchanged.

- [ ] **Step 5: Builder options**

In the controller that builds `GET /admin/pages/builder`, add:

```php
            'presets' => ContentType::query()->whereNotNull('preset')
                ->whereIn('preset', ['newsroom_releases', 'newsroom_coverage', 'investors', 'awards'])
                ->get()->map(fn (ContentType $t) => array_filter([
                    'value' => $t->preset,
                    'label' => $t->plural,
                    'document_types' => $t->preset === 'investors'
                        ? (CustomFields::fieldsFor($t->target())['document_type']->options ?? [])
                        : null,
                ], fn ($v) => $v !== null))->values()->all(),
            'testimonials_installed' => ContentType::query()->preset('testimonials')->exists(),
```

- [ ] **Step 6: Run tests**

Run: `php artisan test --filter=PresetSectionsTest`, `php artisan test --filter=PageSections`, `php artisan test --filter=SectionRules`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "Presets: the From a preset section and the testimonials source"
```

---

### Task 6: Frontend types, fetchers and the mock

**Files:**
- Modify: `web/src/types/api.ts` (`ContentTypeSummary.preset|entry_pages`, `ContentEntry.custom_data`, `PresetKey`)
- Create: `web/src/types/presets.ts` (custom data shapes, `NewsroomKit`, admin preset rows)
- Modify: `web/src/lib/api.ts` (`contentArchive` meta typing incl. `newsroom_kit`)
- Create: `web/src/lib/admin/presets.ts` (+ re-export in `web/src/lib/admin/index.ts`)
- Modify: `web/mock-api.mjs` (presets list/install, preset-settings, archive `custom_data`, `meta.type.preset`, alert endpoint, `list` on subscribe, builder `presets`)

**Interfaces:**
- Produces (TypeScript):

```ts
// web/src/types/presets.ts
export type PresetKey = "newsroom_releases" | "newsroom_coverage" | "investors" | "testimonials" | "awards";
export type InstallKey = "newsroom" | "investors" | "testimonials" | "awards";
export type MediaFile = { url: string; name: string; mime?: string | null };
export type MediaPicture = { url: string; alt: string | null; focus: string | null; width?: number | null; height?: number | null; blur?: string | null };
export type ReleaseData = { dateline?: string; release_pdf?: MediaFile; contact_name?: string; contact_email?: string; contact_phone?: string };
export type CoverageData = { publication?: string; article_url?: string; publication_logo?: MediaPicture; coverage_date?: string };
export type InvestorData = { document_type?: string; financial_year?: string; document?: MediaFile; document_date?: string };
export type TestimonialData = { quote?: string; role?: string; company?: string; photo?: MediaPicture; company_logo?: MediaPicture; featured?: boolean };
export type AwardData = { awarding_body?: string; year?: number | string; category?: string; badge?: MediaPicture; link?: string };
export type PresetRow = {
  key: InstallKey; label: string; blurb: string; slug: string;
  types: { preset: PresetKey; plural: string; slug: string; fields: { key: string; label: string; kind: string }[] }[];
  installed: { id: number; slug: string } | null; clash: string | null;
};
```

Before writing these, read how `CustomFields::publicData()` resolves each kind (`api/app/Support/CustomFields/CustomFields.php` `present()`): a date's `custom_data` value may be the raw `Y-m-d` and a select may be the raw option value — the archives need the option **label** for `document_type`, so check whether `custom_fields` (which carries `display`) should be read instead for labels; if so type `custom_fields` too and read `display` from it.

- [ ] **Step 1:** Add the types above; extend `ContentTypeSummary` with `preset: PresetKey | null; entry_pages: boolean;` and `ContentEntry` with `custom_data?: Record<string, unknown>` (if absent) and `type?.preset`.
- [ ] **Step 2:** `web/src/lib/admin/presets.ts`:

```ts
import "server-only";
import { adminFetch } from "./_shared";
import type { PresetRow, InstallKey } from "@/types/presets";

export const getPresets = () => adminFetch<{ data: PresetRow[] }>("/admin/content-types/presets");
export const installPreset = (key: InstallKey, body: { slug?: string; coverage_slug?: string }) =>
  adminFetch<{ data: { id: number; slug: string }[] }>(`/admin/content-types/presets/${key}`, { method: "POST", body });
export const getPresetSettings = (typeId: number) =>
  adminFetch<{ data: { key: string; value: string | null; type: string }[]; meta: { download_categories?: { id: number; name: string }[] } }>(`/admin/content-types/${typeId}/preset-settings`);
export const savePresetSettings = (typeId: number, settings: { key: string; value: string | null }[]) =>
  adminFetch(`/admin/content-types/${typeId}/preset-settings`, { method: "PATCH", body: { settings } });
export const sendInvestorAlert = (typeSlug: string, entryId: number) =>
  adminFetch<{ message: string }>(`/admin/content-types/${typeSlug}/entries/${entryId}/alert`, { method: "POST" });
```

Use the real helper name and signature from `web/src/lib/admin/_shared.ts` (read it; it may be `token()` + `apiFetch` rather than `adminFetch`) — copy the shape of an existing module such as `lib/admin/downloads.ts`.

- [ ] **Step 3:** Mock: add every route above to `mock-api.mjs` beside the existing `/admin/content-types` handlers, the `custom_data` on archive rows of preset types, `meta.type.preset/entry_pages`, `meta.newsroom_kit`, and `POST /newsletter/subscribe` accepting `list`.
- [ ] **Step 4:** Run (from `web/`): `npx tsc --noEmit` and `npm run lint`. Expected: clean.
- [ ] **Step 5: Commit** — `git add web/src/types web/src/lib web/mock-api.mjs` then `git commit -m "Presets: types, fetchers and the mock"`.

---

### Task 7: The five archives, the release page, RSS and the sitemap

**Files:**
- Create: `web/src/components/presets/newsroom-archive.tsx`
- Create: `web/src/components/presets/coverage-archive.tsx`
- Create: `web/src/components/presets/investors-archive.tsx`
- Create: `web/src/components/presets/investor-signup.tsx` (client island) + `web/src/components/presets/investor-signup-action.ts`
- Create: `web/src/components/presets/testimonials-archive.tsx`
- Create: `web/src/components/presets/awards-archive.tsx`
- Create: `web/src/components/presets/preset-parts.tsx` (shared: `ContactCard`, `CoverageCard`, `QuoteCard`, `AwardBadge`, `InvestorRow`, `read()` helper)
- Create: `web/src/components/presets/release-frame.tsx`
- Create: `web/src/app/(marketing)/[slug]/feed.xml/route.ts`
- Modify: `web/src/app/(marketing)/[slug]/page.tsx` (preset branch; `?type`/`?year` pass-through; RSS `<link rel="alternate">` in metadata)
- Modify: `web/src/app/(marketing)/[slug]/archive.ts` (pass the query string through)
- Modify: `web/src/app/(marketing)/[slug]/[entry]/page.tsx` (release frame)
- Modify: `web/src/app/sitemap.ts`, `web/src/lib/llms.ts` (skip entries when `entry_pages === false`; list the RSS in `llms.txt`)
- Modify: `web/src/app/(marketing)/certifications/page.tsx` (link to the awards archive when one is published)
- Modify: `web/src/app/globals.css` (masonry columns for testimonials; anything else is Tailwind utilities)

**Interfaces:**
- Consumes: Task 6 types; `publicApi.contentArchive(slug, query)`; `getSettings()` from `lib/settings.ts`.
- Produces: `PresetArchive({ archive, settings, query })` dispatcher in `components/presets/preset-archive.tsx` used by the `[slug]` page.

- [ ] **Step 1: The dispatcher and the shared parts.** `preset-archive.tsx`:

```tsx
import type { Archive } from "@/app/(marketing)/[slug]/archive";
import type { SiteSettings } from "@/lib/site-settings";
import { NewsroomArchive } from "./newsroom-archive";
import { CoverageArchive } from "./coverage-archive";
import { InvestorsArchive } from "./investors-archive";
import { TestimonialsArchive } from "./testimonials-archive";
import { AwardsArchive } from "./awards-archive";

/**
 * A preset type's archive (docs/content-presets.md). Each preset draws its
 * own layout from the same archive read; an unknown preset returns null and
 * the route draws the generic `ContentArchive`.
 */
export function PresetArchive({ archive, settings, query }: { archive: Archive; settings: SiteSettings; query: { type?: string; year?: string } }) {
  switch (archive.type.preset) {
    case "newsroom_releases": return <NewsroomArchive archive={archive} settings={settings} />;
    case "newsroom_coverage": return <CoverageArchive archive={archive} />;
    case "investors": return <InvestorsArchive archive={archive} settings={settings} query={query} />;
    case "testimonials": return <TestimonialsArchive archive={archive} />;
    case "awards": return <AwardsArchive archive={archive} />;
    default: return null;
  }
}
```

The newsroom archive fetches the six newest coverage cards itself: `publicApi.contentTypes()` → the type with `preset === "newsroom_coverage"` → `publicApi.contentArchive(slug, "?per_page=6")`, inside a `.catch(() => null)` so a failure draws no strip.

- [ ] **Step 2: Each archive.** Every archive opens with `PageHero` (title = `type.plural`, lede = `type.description`, `Breadcrumbs`), sits in `Container` + `.section-y`, stamps `data-preset="<key>"` on its root and `data-preset-item` on each item, uses `Card`/`bg-card` grounds and tokens only, and ends with the numbered `Pagination` when `entries.meta.last_page > 1`. Specifics:
  - **Newsroom:** the lead is `entries.data[0]` (only on page 1) as a two-column card (`lg:grid-cols-[7fr_5fr]`, `next/image` with `sizes="(min-width:1024px) 58vw, 100vw"`), then the rest grouped by year (`new Date(published_at).getFullYear()` — the year only, never a formatted date; dates shown are the API's `published_at` rendered with `formatDate` from `lib/dates.ts`). Each row: date, headline link, summary. Then the coverage strip (`CoverageCard`: publication logo or the publication's name, headline, outbound `<a href rel="noopener" target="_blank">`), then the media kit band: `Prose` of `settings.newsroom_boilerplate`, `ContactCard` from the three `newsroom_contact_*`, and `meta.newsroom_kit` rows as plain `<a href={"/api/downloads/" + id}>` (never `next/link`). Head metadata carries `alternates.types["application/rss+xml"] = "/{slug}/feed.xml"`.
  - **Coverage:** a `Collection`-free grid of `CoverageCard`s, `sm:grid-cols-2 lg:grid-cols-3`, newest first.
  - **Investors:** type chips as `<Link href="?type=…">` built from the distinct `document_type` values present plus "All"; `?year=` chips likewise; rows grouped by `financial_year` descending, each `InvestorRow` with `id={"entry-" + entry.id}` (the alert's anchor): date (`document_date` or `published_at`), title, type label, file size/extension, and a plain `<a href={document.url} download>` "Download". Below: `InvestorSignup` (client island: email input + honeypot `website`, `<Form>` with a Server Action posting `{ email, website, list: "investors" }` to `/newsletter/subscribe`, one success sentence) when `settings.newsletter_signup_enabled` allows, with `settings.investors_signup_line` as its line; and `ContactCard` from `investors_contact_*`. The route reads `searchParams` — the `[slug]` route is already dynamic, so this is allowed (see CLAUDE.md "`[slug]` … stays dynamic").
  - **Testimonials:** `QuoteCard`s in CSS columns (`columns-1 sm:columns-2 lg:columns-3 gap-6`, each card `break-inside-avoid mb-6`), photo through `next/image` with `blurProps`, initials disc via `initials()` when no photo, company logo small under the name.
  - **Awards:** grouped by `year` descending, each `AwardBadge` (badge `next/image` in a fixed `h-24` well, `object-contain`), award title, awarding body, category; title links out to `link` when set (`rel="noopener"`). Ends with "See our certifications" `ArrowLink` when `publicApi.certifications()` has rows (catch → none).
- [ ] **Step 3: Wire the `[slug]` route.** In `page.tsx` where the archive renders:

```tsx
    const sp = await searchParams;
    const archive = await loadArchive(slug, sp.page, { type: sp.type, year: sp.year });
    if (archive) {
      if (archive.type.preset) {
        const settings = await getSettings();
        const drawn = <PresetArchive archive={archive} settings={settings} query={{ type: sp.type, year: sp.year }} />;
        if (drawn) return drawn;
      }
      return <ContentArchive type={archive.type} entries={archive.entries} />;
    }
```

(`PresetArchive` returns `null` only for an unknown preset — make the dispatcher's return typed `JSX.Element | null` and test it before returning.) `archive.ts` gains a third argument building `?page=&type=&year=` with `URLSearchParams`, sending only filled values; cache `revalidate` stays 600 except when `type` or `year` is present, where `cache: false` (never ISR-cache a filtered view — CLAUDE.md "Never ISR-cache a user's search query"); add that flag to `publicApi.contentArchive`. `listingMetadata` already makes a filtered view `noindex, follow`; pass `type`/`year` in its `searchParams`.
- [ ] **Step 4: Release page.** In `[entry]/page.tsx`, when `entry.type?.preset === "newsroom_releases"`, wrap the body in `ReleaseFrame` (server component): before the body `<p className="text-12-5 font-semibold uppercase tracking-wide text-brand-ink">For immediate release</p>` and `<p><strong>{DATELINE}, {formatDate(published_at)} —</strong></p>` (dateline upper-cased with `toLocaleUpperCase("en-IN")`); after it the PDF as a plain `<a download>` row, an "About {company}" `h2` + `Prose` boilerplate (from settings), and the `ContactCard` (the entry's contact fields when any is set, else the newsroom's). The entry route must keep reading no request-time API (CLAUDE.md: ISR) — settings come from `getSettings()`, which is a cached fetch.
- [ ] **Step 5: RSS route.** `web/src/app/(marketing)/[slug]/feed.xml/route.ts`:

```ts
import { publicApi } from "@/lib/api";
import { siteUrl } from "@/lib/site-url";

/** The newsroom's RSS feed (docs/content-presets.md). 404 for any other type. */
export const revalidate = 600;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await publicApi.contentArchive(slug, "?per_page=30").catch(() => null);
  if (!res || res.meta.type.preset !== "newsroom_releases") return new Response("Not found", { status: 404 });

  const base = siteUrl();
  const items = res.data.map((e) => `<item><title>${esc(e.title)}</title><link>${esc(base + e.path)}</link><guid isPermaLink="true">${esc(base + e.path)}</guid>${e.published_at ? `<pubDate>${new Date(e.published_at).toUTCString()}</pubDate>` : ""}${e.summary ? `<description>${esc(e.summary)}</description>` : ""}</item>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(res.meta.type.plural)}</title><link>${esc(base + res.meta.type.path)}</link><description>${esc(res.meta.type.description ?? res.meta.type.plural)}</description>${items}</channel></rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
```

Use the real names for the site origin and the XML escaper — copy them from `web/src/app/(marketing)/store/feed.xml/route.ts` (it already has both). Check `ReservedSlugsTest` still passes (`php artisan test --filter=ReservedSlugsTest`) — `feed.xml` is under `[slug]`, not a top-level directory, so it should.
- [ ] **Step 6: Sitemap and llms.** In `sitemap.ts` where custom entries are mapped, skip entries for `t.entry_pages === false` (keep the archive entry); in `llms.ts` likewise, and add a line for the newsroom feed when a `newsroom_releases` type exists.
- [ ] **Step 7: Certifications ↔ Awards.** `certifications/page.tsx`: after the grid, `ArrowLink` "See our awards" to the awards type's `path` when `publicApi.contentTypes()` has a `preset === "awards"` type with a published entry (`contentArchive(slug, "?per_page=1")` non-empty), every call `.catch(() => null)`.
- [ ] **Step 8: Verify.** Run `npx tsc --noEmit`, `npm run lint`. Start the API and `npm run dev`; install all four presets through the API (or the mock: `npm run mock` + `API_BASE_URL=http://127.0.0.1:8899 npm run dev`), add two entries each, and open `/newsroom`, `/in-the-news`, `/investors`, `/investors?type=annual_report`, `/testimonials`, `/awards`, one release page, `/newsroom/feed.xml` (parse it: `curl -s localhost:3000/newsroom/feed.xml | node -e "require('fs').readFileSync(0,'utf8').includes('<rss')||process.exit(1)"`). Screenshot each at 360 and 1280.
- [ ] **Step 9: Commit** — `git add web/src` then `git commit -m "Presets: the archives, the release page, the feed and the sitemap"`.

---

### Task 8: The builder on the website and in the console

**Files:**
- Create: `web/src/components/page-sections/preset-sections.tsx` (`PresetListSection`)
- Modify: `web/src/components/page-sections/page-sections.tsx` (`case "preset_list"`)
- Modify: `web/src/types/` page-section types (`PresetListSectionData`; `TestimonialsSectionData` adds optional `company_logo` on items)
- Modify: `web/src/components/page-sections/visual-sections.tsx` (`TestimonialsSection` draws `company_logo` when present)
- Modify: `web/src/app/admin/(app)/pages/builder/section-editors.tsx` (`blankData`, the `preset_list` editor, the testimonials source choice)
- Modify: the builder options type (`presets`, `testimonials_installed`)

**Interfaces:**
- Consumes: Task 5 shapes; Task 7's `preset-parts.tsx` cards.
- Produces: `PresetListSection({ data, reveal })`.

- [ ] **Step 1:** `PresetListSection` renders `SectionFrame type="preset_list"` with `SectionHead` (kicker/heading/lede), then by `data.preset`: releases → dated list rows (≤ limit); coverage → `CoverageCard` grid; investors → `InvestorRow`s; awards → `AwardBadge` grid using `rowItem(n, 3)` so a short row centres; then an `ArrowLink` "See all" to `data.index_path`. Reuse the parts from Task 7 — no second copy.
- [ ] **Step 2:** `section-editors.tsx`: `blankData` `case "preset_list": return { preset: options.presets?.[0]?.value ?? "awards", limit: 6 };` and the editor:

```tsx
    case "preset_list": {
      const presets = options.presets ?? [];
      const investors = presets.find((p) => p.value === "investors");
      return (
        <>
          <Head />
          {presets.length === 0 ? (
            <p className="mb-4 text-12-5 text-faint">No preset is installed yet. <Link href="/admin/content-types" className="font-semibold text-brand-ink underline">Install one</Link>.</p>
          ) : (
            <Row>
              <Choice path={["preset"]} label="Which list" fallback={presets[0].value} options={presets.map((p) => ({ value: p.value, label: p.label }))} />
              <NumberInput path={["limit"]} label="How many, at most" min={1} max={12} hint="Six when left blank." />
            </Row>
          )}
          {content.preset === "investors" && investors?.document_types ? (
            <Choice path={["document_type"]} label="Only one kind of document" fallback=""
              options={[{ value: "", label: "Every kind" }, ...investors.document_types]} />
          ) : null}
        </>
      );
    }
```

Testimonials editor: add above the repeater

```tsx
          {options.testimonials_installed ? (
            <Choice path={["source"]} label="Which quotes" fallback="custom"
              options={[{ value: "custom", label: "Quotes typed here" }, { value: "preset", label: "From Testimonials" }]} />
          ) : null}
          {content.source === "preset" ? (
            <Row>
              <Toggle path={["featured_only"]} label="Only those marked Featured" />
              <NumberInput path={["limit"]} label="How many, at most" min={2} max={9} />
            </Row>
          ) : (/* the existing Repeater, unchanged */)}
```

Check the real prop names of `Choice`/`Toggle`/`NumberInput` against their uses in this file before writing.
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npm run lint`. In the console, add a "From a preset" section and a Testimonials section on source "From Testimonials" to a draft builder page; open its live preview at 1400px and confirm both draw.
- [ ] **Step 4: Commit** — `git commit -am "Presets: the builder section on the site and in the console"` (stage new files with `git add` first).

---

### Task 9: The console — presets strip, preset settings, alert controls, locked fields

**Files:**
- Create: `web/src/app/admin/(app)/content-types/preset-strip.tsx` (server component) + `preset-install-button.tsx` (client: confirm + slug dialog via `Modal`)
- Modify: `web/src/app/admin/(app)/content-types/page.tsx` (render the strip above the list)
- Modify: `web/src/app/admin/(app)/content-types/actions.ts` (`installPresetAction`, `savePresetSettingsAction`)
- Create: `web/src/app/admin/(app)/content-types/preset-settings-panel.tsx`
- Modify: `web/src/app/admin/(app)/content-types/type-form.tsx` (a "Preset" tab when `type.preset` is `newsroom_releases` or `investors`, last before none — tabs are positional, keep one child per tab)
- Modify: `web/src/app/admin/(app)/content/[type]/entry-form.tsx` (investors: `RecordSwitch` `alert_on_publish`, the Send alert button, `alert_error` as `Alert tone="warn" dismissible={false}`, "Alert sent on …")
- Modify: `web/src/app/admin/(app)/content/[type]/actions.ts` (post `alert_on_publish`; `sendInvestorAlertAction`; `updateTag("settings")` for a testimonials entry; `updateTag` for the entries tags as today)
- Modify: the custom field group editor (`web/src/app/admin/(app)/custom-fields/…`): a locked field shows a lock badge, its key and kind inputs are disabled, its remove button is hidden
- Modify: `web/scripts/audit.mjs` and `web/scripts/mobile-audit.mjs` route lists (`/admin/content-types`, the six public archives, one release page via `DISCOVER`)

**Interfaces:**
- Consumes: Task 6 fetchers.

- [ ] **Step 1: Preset strip.** Four `Card interactive={false}` tiles, `sm:grid-cols-2 xl:grid-cols-4`, each: label, blurb, the field labels as small chips, and either "Installed — open" (`Link` to `/admin/content/{slug}`) or `PresetInstallButton`. When `clash` is set, the button opens a `Modal` with one `Field` for the address (and a second for the newsroom's coverage address) and posts `installPresetAction`; otherwise it posts directly. The action uses `<Form action state>`, `redirect()` outside `try` to `/admin/content-types?done=preset-installed`, and `updateTag("content-types")`, `updateTag("menu")`. Add `preset-installed` to the console's `?done=` lookup map (find the map by grepping `"type-saved"` or similar in the content-types screens) with copy "Preset installed. Add the first entry from Content → Custom content."
- [ ] **Step 2: Preset settings panel.** A `Card` with `Field`s: boilerplate through `EditorField` (rich), the contact name/email/phone, and for the newsroom a `Select` (with `variant="float-static"`) of `meta.download_categories` plus a blank "No media kit". Its own `<Form>` posting `savePresetSettingsAction(typeId)` (`updateTag("settings")`, toast via `?done=` or returned state). It sits in the type form's Preset tab but is **not** inside the type's own `<form>` — render it as a sibling panel below the tabs if nesting forms is unavoidable (nested `<form>` is invalid HTML).
- [ ] **Step 3: Entry form.** For `type.preset === "investors"`: a `RecordSwitch name="alert_on_publish"` labelled "Email subscribers when published" with hint "Sent once, to the Investor updates list, when this document is live."; when `entry.alert_sent_at`, a line "Alert sent on {formatDate}" linking to `/admin/newsletter/campaigns/{alert_campaign_id}/report` (check the real report path); when published and not sent, a separate one-press `<Form>` "Send alert now" calling `sendInvestorAlertAction`; `alert_error` as a standing warn `Alert`. Add `alert_on_publish` to the Content tab's `fields` list in `buildFormTabs`.
- [ ] **Step 4: Locked fields.** In the field builder row: when `field.locked`, render a `Badge` "Used by the layout", disable the key input and the kind select (`disabled` + the hidden inputs still posting the values, the pattern `RecordSwitch` uses for posted values), hide the delete control.
- [ ] **Step 5: Audits.** Add the routes to both audit lists. Run `npm run audit` against `npm run dev` with the API seeded and the four presets installed (one entry each), and `npm run audit:mobile`; fix every failure. `MSYS_NO_PATHCONV=1` when passing routes from Git Bash.
- [ ] **Step 6: Commit** — `git add web` then `git commit -m "Presets: the console — install strip, preset settings, alerts, locked fields"`.

---

### Task 10: Probe, themes check, docs and the version

**Files:**
- Create: `web/scripts/probes/content-presets.mjs`
- Create: `docs/content-presets.md`
- Create: `manual/36-presets.md`
- Modify: `CLAUDE.md` (module line under "Modules"), `API.md` (a "Content-type presets" section), `README.md` (a short dated section), `VERSION.md`, `web/src/lib/version.ts`, `docs/superpowers/specs/2026-10-20-content-presets-design.md` (record the two deviations below)
- Modify: `web/src/lib/help-routes.ts` + `npm run help` (the new manual chapter mapped to `/admin/content-types`)

- [ ] **Step 1: Probe.** `content-presets.mjs` (docblock: what it measures, how to run; `BASE`, `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD`; no credentials in the file): sign in, open `/admin/content-types`, assert four preset tiles; for each archive route assert HTTP 200, exactly one `h1`, `[data-preset]` present, and no horizontal overflow at 360px; fetch `/newsroom/feed.xml` and assert it starts `<?xml` and contains `<rss`; open a builder page holding a Testimonials section on `source: preset` and assert at least two quote cards. Run it: `node scripts/probes/content-presets.mjs`. Expected: every line OK.
- [ ] **Step 2: Themes.** Open each of the six archive routes under every theme via `/theme-preview/<id>` paths where they exist (or by switching `site_theme` on a throwaway install) at 360/768/1280/1920; fix odd ratios, cramped badges, single orphan cards (use `rowItem`). Light and dark.
- [ ] **Step 3: Full suites.** `php artisan test` (all green), `composer analyse` ("No errors"), `./vendor/bin/pint`, `npx tsc --noEmit`, `npm run lint`, `npm run build` against a reachable API.
- [ ] **Step 4: Docs.** `docs/content-presets.md` follows `docs/tenders.md`'s shape: what it is, the data, the rules with their reasons (found by `preset` never slug; locked fields; `entry_pages`; alerts once through a campaign; the narrow settings door; the homepage override on the API side), the console, the tests. `API.md`: every new and changed route and field from Tasks 1–5. `CLAUDE.md` module entry: `### Content-type presets — docs/content-presets.md` with 6–8 one-line rules. Manual chapter in the voice of `manual/29-tenders.md`. Spec: note (a) the homepage testimonial is resolved by `PublicSettings` onto the existing three keys rather than by `loadHome()`, so no theme changes; (b) the preset settings are edited through `PATCH /admin/content-types/{id}/preset-settings`, because settings are `role:admin`.
- [ ] **Step 5: Version.** `web/src/lib/version.ts` → `0.186.0`; `VERSION.md` entry "Content-type presets" (newest first, three to five bullets in the existing voice).
- [ ] **Step 6: Commit** — `git add -A docs manual CLAUDE.md API.md README.md VERSION.md web` then `git commit -m "0.186.0: content-type presets"`.
