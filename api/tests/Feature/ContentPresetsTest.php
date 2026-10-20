<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\ContentType;
use App\Models\CustomField;
use App\Models\CustomFieldGroup;
use App\Models\Entry;
use App\Models\Page;
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
}
