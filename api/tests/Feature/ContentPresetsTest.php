<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\ContentType;
use App\Models\CustomField;
use App\Models\CustomFieldGroup;
use App\Models\Entry;
use App\Models\Media;
use App\Models\Page;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
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

    /* ------------------------------------------------------------ entry pages */

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

    /* ------------------------------------------------------------ installing */

    public function test_installing_investors_makes_the_type_its_locked_fields_and_the_group(): void
    {
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/presets/investors')
            ->assertCreated()->assertJsonPath('data.0.slug', 'investors')->assertJsonPath('data.0.preset', 'investors');

        $type = ContentType::preset('investors')->firstOrFail();
        $this->assertFalse($type->entry_pages);
        $fields = CustomField::query()->whereHas('group', fn ($q) => $q->whereJsonContains('targets', 'entry:investors'))->get()->keyBy('key');
        $this->assertTrue($fields['document']->locked);
        $this->assertTrue($fields['document']->required);
        $this->assertSame('^\d{4}-\d{2}$', $fields['financial_year']->setting('pattern'));
        $this->assertDatabaseHas('newsletter_groups', ['source' => 'investors']);
    }

    public function test_installing_the_newsroom_makes_both_types(): void
    {
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/presets/newsroom')
            ->assertCreated()->assertJsonCount(2, 'data');

        $this->assertTrue((bool) ContentType::preset('newsroom_releases')->value('entry_pages'));
        $this->assertFalse((bool) ContentType::preset('newsroom_coverage')->value('entry_pages'));
        $this->assertSame('in-the-news', ContentType::preset('newsroom_coverage')->value('slug'));
    }

    public function test_a_preset_installs_once_and_a_clash_names_what_holds_the_slug(): void
    {
        Page::create(['title' => 'Awards', 'slug' => 'awards', 'status' => 'published']);
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
        $group = CustomFieldGroup::query()->forTarget('entry:awards')->firstOrFail();
        $fields = $as->getJson("/api/v1/admin/custom-field-groups/{$group->id}")->json('data.fields');
        $this->assertTrue($fields[0]['locked']);

        $relabel = array_map(fn ($f) => $f['key'] === 'awarding_body' ? [...$f, 'label' => 'Given by'] : $f, $fields);
        $as->patchJson("/api/v1/admin/custom-field-groups/{$group->id}", ['fields' => $relabel])->assertOk();

        $rekey = array_map(fn ($f) => $f['key'] === 'year' ? [...$f, 'key' => 'won_in'] : $f, $fields);
        $as->patchJson("/api/v1/admin/custom-field-groups/{$group->id}", ['fields' => $rekey])
            ->assertStatus(422)->assertJsonValidationErrors('fields.1.key');

        $without = array_values(array_filter($fields, fn ($f) => $f['key'] !== 'badge'));
        $as->patchJson("/api/v1/admin/custom-field-groups/{$group->id}", ['fields' => $without])
            ->assertStatus(422)->assertJsonValidationErrors('fields');

        $as->deleteJson("/api/v1/admin/custom-field-groups/{$group->id}")->assertStatus(422);
    }

    public function test_every_installed_preset_type_saves_unchanged_through_its_form(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        foreach (['newsroom', 'investors', 'testimonials', 'awards'] as $key) {
            $as->postJson("/api/v1/admin/content-types/presets/{$key}")->assertCreated();
        }

        foreach (ContentType::query()->whereNotNull('preset')->get() as $type) {
            $row = $as->getJson("/api/v1/admin/content-types/{$type->id}")->json('data');
            $as->patchJson("/api/v1/admin/content-types/{$type->id}", array_intersect_key($row, array_flip([
                'name', 'plural', 'slug', 'icon', 'description', 'has_body', 'has_image', 'archive_enabled',
                'entry_pages', 'per_page', 'sort', 'schema_type', 'sort_order', 'is_active',
            ])))->assertOk();
        }
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
        $this->assertSame(0, CustomFieldGroup::query()->forTarget('entry:awards')->count());
        $as->postJson('/api/v1/admin/content-types/presets/awards')->assertCreated();
    }

    public function test_a_preset_group_cannot_be_switched_off_or_given_another_slug(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $as->postJson('/api/v1/admin/content-types/presets/testimonials')->assertCreated();
        $group = CustomFieldGroup::query()->forTarget('entry:testimonials')->firstOrFail();

        $as->patchJson("/api/v1/admin/custom-field-groups/{$group->id}", ['is_active' => false])
            ->assertStatus(422)->assertJsonValidationErrors('is_active');
        $as->patchJson("/api/v1/admin/custom-field-groups/{$group->id}", ['slug' => 'quotes'])
            ->assertStatus(422)->assertJsonValidationErrors('slug');
        $as->patchJson("/api/v1/admin/custom-field-groups/{$group->id}", ['name' => 'Quote details', 'slug' => $group->slug, 'is_active' => true])
            ->assertOk();
    }

    public function test_deleting_a_preset_type_deletes_its_group_whatever_the_group_is_called(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $id = $as->postJson('/api/v1/admin/content-types/presets/awards')->json('data.0.id');
        CustomFieldGroup::query()->forTarget('entry:awards')->update(['slug' => 'renamed-by-hand']);

        $as->deleteJson("/api/v1/admin/content-types/{$id}")->assertNoContent();
        $this->assertSame(0, CustomFieldGroup::query()->where('slug', 'renamed-by-hand')->count());
    }

    public function test_the_general_settings_door_cleans_the_newsroom_boilerplate(): void
    {
        $this->seed(SettingsSeeder::class);
        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => [['key' => 'newsroom_boilerplate', 'value' => '<p>About us</p><img src=x onerror="alert(1)"><script>alert(2)</script>']],
        ])->assertOk();

        $stored = (string) Setting::query()->where('key', 'newsroom_boilerplate')->value('value');
        $this->assertStringContainsString('About us', $stored);
        $this->assertStringNotContainsString('onerror', $stored);
        $this->assertStringNotContainsString('<script', $stored);
    }

    public function test_a_featured_testimonial_with_no_role_does_not_borrow_the_typed_one(): void
    {
        $this->seed(SettingsSeeder::class);
        $this->install('testimonials');
        $this->entry('testimonials', 'A. Sen', ['quote' => 'Calm and quick.', 'featured' => true]);
        Setting::query()->where('key', 'testimonial_source')->update(['value' => 'preset']);
        Setting::query()->where('key', 'testimonial_role')->update(['value' => 'Somebody Else, Elsewhere']);
        Setting::flushCache();

        $this->getJson('/api/v1/settings')->assertOk()
            ->assertJsonPath('data.testimonial_author', 'A. Sen')
            ->assertJsonPath('data.testimonial_role', '');
    }

    /* ------------------------------------------------------------ public reads */

    private function install(string $key): void
    {
        $this->actingAs($this->staff(), 'sanctum')->postJson("/api/v1/admin/content-types/presets/{$key}")->assertCreated();
    }

    /** @param array<string, mixed> $fields */
    private function entry(string $preset, string $title, array $fields, array $extra = []): Entry
    {
        $type = ContentType::query()->preset($preset)->firstOrFail();
        $id = $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/content-types/{$type->slug}/entries", [
                'title' => $title, 'status' => 'published', 'custom_fields' => $fields, ...$extra,
            ])->assertCreated()->json('data.id');

        return Entry::findOrFail($id);
    }

    private function pdf(string $name = 'q2.pdf'): Media
    {
        return Media::create(['filename' => $name, 'path' => 'media/'.$name, 'mime' => 'application/pdf', 'size' => 1200, 'disk' => 'public']);
    }

    public function test_an_investors_archive_carries_custom_data_and_filters_by_type_and_year(): void
    {
        $this->install('investors');
        $pdf = $this->pdf();
        $this->entry('investors', 'Q2 results', ['document_type' => 'financial_results', 'financial_year' => '2026-27', 'document' => $pdf->path]);
        $this->entry('investors', 'Annual report', ['document_type' => 'annual_report', 'financial_year' => '2025-26', 'document' => $pdf->path]);

        $this->getJson('/api/v1/types/investors')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.type.preset', 'investors')
            ->assertJsonPath('data.0.custom_data.document.name', 'q2.pdf');
        $this->getJson('/api/v1/types/investors?type=annual_report')->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Annual report');
        $this->getJson('/api/v1/types/investors?year=2026-27')->assertJsonCount(1, 'data');
    }

    public function test_the_investors_archive_names_the_document_types_in_use(): void
    {
        $this->install('investors');
        $pdf = $this->pdf('b.pdf');
        $this->entry('investors', 'Annual report', ['document_type' => 'annual_report', 'financial_year' => '2025-26', 'document' => $pdf->path]);
        $this->entry('investors', 'Draft notice', ['document_type' => 'policy', 'financial_year' => '2025-26', 'document' => $pdf->path], ['status' => 'draft']);

        // Only what a published document uses, so the chips never lead to an
        // empty list — and the same chips on a filtered view.
        foreach (['/api/v1/types/investors', '/api/v1/types/investors?type=annual_report'] as $url) {
            $this->getJson($url)->assertOk()
                ->assertJsonCount(1, 'meta.document_types')
                ->assertJsonPath('meta.document_types.0.value', 'annual_report')
                ->assertJsonPath('meta.document_types.0.label', 'Annual report');
        }
    }

    public function test_a_financial_year_is_held_to_its_shape(): void
    {
        $this->install('investors');
        $pdf = $this->pdf('a.pdf');
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/investors/entries', [
            'title' => 'X', 'status' => 'published',
            'custom_fields' => ['document_type' => 'other', 'financial_year' => '2026', 'document' => $pdf->path],
        ])->assertStatus(422)->assertJsonValidationErrors('custom_fields.financial_year');
    }

    public function test_presets_are_found_by_preset_not_slug(): void
    {
        $this->seed(SettingsSeeder::class);
        $this->install('testimonials');
        $type = ContentType::query()->preset('testimonials')->firstOrFail();
        $this->actingAs($this->staff(), 'sanctum')->patchJson("/api/v1/admin/content-types/{$type->id}", ['slug' => 'kind-words'])->assertOk();
        $this->entry('testimonials', 'R. Kulkarni', ['quote' => 'They pick up.', 'featured' => true, 'role' => 'Head of IT']);

        Setting::query()->where('key', 'testimonial_source')->update(['value' => 'preset']);
        Setting::flushCache();

        $this->getJson('/api/v1/settings')->assertOk()
            ->assertJsonPath('data.testimonial_quote', 'They pick up.')
            ->assertJsonPath('data.testimonial_author', 'R. Kulkarni')
            ->assertJsonPath('data.testimonial_role', 'Head of IT');
    }

    public function test_the_homepage_quote_falls_back_to_the_typed_one(): void
    {
        $this->seed(SettingsSeeder::class);
        Setting::query()->where('key', 'testimonial_source')->update(['value' => 'preset']);
        Setting::flushCache();
        $typed = Setting::query()->where('key', 'testimonial_quote')->value('value');

        $this->getJson('/api/v1/settings')->assertJsonPath('data.testimonial_quote', $typed);
    }

    public function test_preset_settings_accept_only_their_own_keys(): void
    {
        $this->seed(SettingsSeeder::class);
        $this->install('newsroom');
        $type = ContentType::query()->preset('newsroom_releases')->firstOrFail();
        $as = $this->actingAs($this->staff(), 'sanctum');

        $as->getJson("/api/v1/admin/content-types/{$type->id}/preset-settings")->assertOk()
            ->assertJsonPath('data.0.key', 'newsroom_boilerplate');
        $as->patchJson("/api/v1/admin/content-types/{$type->id}/preset-settings", ['settings' => [
            ['key' => 'newsroom_boilerplate', 'value' => '<p>About us.</p><script>x()</script>'],
        ]])->assertOk();
        $this->assertSame('<p>About us.</p>', Setting::query()->where('key', 'newsroom_boilerplate')->value('value'));
        $this->getJson('/api/v1/settings')->assertJsonPath('data.newsroom_boilerplate', '<p>About us.</p>');

        $as->patchJson("/api/v1/admin/content-types/{$type->id}/preset-settings", ['settings' => [
            ['key' => 'smtp_password', 'value' => 'x'],
        ]])->assertStatus(422);
        $as->patchJson("/api/v1/admin/content-types/{$type->id}/preset-settings", ['settings' => [
            ['key' => 'investors_contact_name', 'value' => 'x'],
        ]])->assertStatus(422);
    }
}
