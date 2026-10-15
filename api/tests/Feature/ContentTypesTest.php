<?php

namespace Tests\Feature;

use App\Enums\MenuItemType;
use App\Enums\Role as RoleEnum;
use App\Models\ContentType;
use App\Models\CustomFieldGroup;
use App\Models\Entry;
use App\Models\Menu;
use App\Models\Page;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\User;
use App\Support\MenuTree;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Custom content types and their entries (docs/custom-content.md): a type's
 * slug is a top-level address, an entry's slug is unique within its type,
 * and both move with a 301 when renamed.
 */
class ContentTypesTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::firstOrCreate(['email' => $role->value.'-ct@example.test'], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(
            ['slug' => $role->value], ['name' => $role->label()],
        )->id]);

        return $user;
    }

    /** @param array<string, mixed> $overrides */
    private function createType(array $overrides = [])
    {
        return $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types', array_replace([
            'name' => 'Event', 'plural' => 'Events', 'slug' => 'gatherings', 'schema_type' => 'Article',
        ], $overrides));
    }

    /** @param array<string, mixed> $overrides */
    private function createEntry(string $type, array $overrides = [])
    {
        return $this->actingAs($this->staff(), 'sanctum')->postJson("/api/v1/admin/content-types/{$type}/entries", array_replace([
            'title' => 'Launch day', 'summary' => 'The new office opens.', 'body' => '<p>Doors at nine.</p>', 'status' => 'published',
        ], $overrides));
    }

    /* ------------------------------------------------------------ types */

    public function test_a_type_is_refused_a_reserved_address_a_page_slug_and_a_bad_shape(): void
    {
        Page::create(['title' => 'Downloads', 'slug' => 'downloads', 'status' => 'published']);

        // `events` is the events module's own segment since 0.118.0 — until
        // then it was this file's example slug.
        foreach (['blog', 'admin', 'solutions', 'types', 'events', 'downloads', 'Bad Slug', '9lives'] as $slug) {
            $this->createType(['slug' => $slug])->assertUnprocessable()->assertJsonValidationErrors('slug');
        }

        $this->createType()->assertCreated()->assertJsonPath('data.path', '/gatherings')->assertJsonPath('data.target', 'entry:gatherings');
        $this->createType(['name' => 'Other'])->assertUnprocessable()->assertJsonValidationErrors('slug');
    }

    public function test_only_a_content_manager_manages_types(): void
    {
        // The type exists, so the refusal is the role's and not the binding's.
        $this->createType()->assertCreated();
        // The resolved guard outlives a request in one test; switch cleanly.
        $this->app['auth']->forgetGuards();

        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/content-types')->assertForbidden();
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/content-types/gatherings/entries')->assertForbidden();
    }

    public function test_a_type_with_entries_cannot_be_deleted(): void
    {
        $id = $this->createType()->json('data.id');
        $this->createEntry('gatherings')->assertCreated();

        $this->actingAs($this->staff(), 'sanctum')->deleteJson("/api/v1/admin/content-types/{$id}")
            ->assertUnprocessable();

        Entry::query()->delete();
        $this->actingAs($this->staff(), 'sanctum')->deleteJson("/api/v1/admin/content-types/{$id}")
            ->assertNoContent();
    }

    /* ---------------------------------------------------------- entries */

    public function test_an_entry_slug_is_unique_within_its_type_only(): void
    {
        $this->createType()->assertCreated();
        $this->createType(['name' => 'Whitepaper', 'plural' => 'Whitepapers', 'slug' => 'whitepapers'])->assertCreated();

        $this->createEntry('gatherings')->assertCreated()->assertJsonPath('data.slug', 'launch-day');
        $this->createEntry('whitepapers')->assertCreated()->assertJsonPath('data.slug', 'launch-day');

        // A generated one steps aside within the type.
        $this->createEntry('gatherings')->assertCreated()->assertJsonPath('data.slug', 'launch-day-2');

        // A chosen one is refused.
        $this->createEntry('gatherings', ['slug' => 'launch-day'])
            ->assertUnprocessable()->assertJsonValidationErrors('slug');
    }

    public function test_an_entry_of_another_type_is_not_found_through_this_one(): void
    {
        $this->createType()->assertCreated();
        $this->createType(['name' => 'Whitepaper', 'plural' => 'Whitepapers', 'slug' => 'whitepapers'])->assertCreated();
        $id = $this->createEntry('whitepapers')->json('data.id');

        $this->actingAs($this->staff(), 'sanctum')->getJson("/api/v1/admin/content-types/gatherings/entries/{$id}")->assertNotFound();
        $this->actingAs($this->staff(), 'sanctum')->getJson("/api/v1/admin/content-types/whitepapers/entries/{$id}")->assertOk();
    }

    public function test_renaming_an_entry_leaves_a_301_under_its_type(): void
    {
        $this->createType()->assertCreated();
        $id = $this->createEntry('gatherings')->json('data.id');

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/content-types/gatherings/entries/{$id}", ['slug' => 'opening-day'])
            ->assertOk()->assertJsonPath('data.path', '/gatherings/opening-day');

        $this->assertSame('/gatherings/opening-day', Redirect::where('from_path', '/gatherings/launch-day')->value('to_path'));
    }

    public function test_renaming_a_type_moves_its_archive_its_entries_and_its_field_groups(): void
    {
        $typeId = $this->createType()->json('data.id');
        $this->createEntry('gatherings')->assertCreated();
        $this->createEntry('gatherings', ['title' => 'Open house'])->assertCreated();

        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/custom-field-groups', [
            'name' => 'Event facts', 'targets' => ['entry:gatherings'],
            'fields' => [['key' => 'venue', 'label' => 'Venue', 'kind' => 'text']],
        ])->assertCreated();

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/content-types/{$typeId}", ['slug' => 'happenings'])
            ->assertOk()->assertJsonPath('data.path', '/happenings');

        $this->assertSame('/happenings', Redirect::where('from_path', '/gatherings')->value('to_path'));
        $this->assertSame('/happenings/launch-day', Redirect::where('from_path', '/gatherings/launch-day')->value('to_path'));
        $this->assertSame('/happenings/open-house', Redirect::where('from_path', '/gatherings/open-house')->value('to_path'));
        $this->assertSame(['entry:happenings'], CustomFieldGroup::value('targets'));
    }

    public function test_an_entry_takes_the_custom_fields_attached_to_its_type(): void
    {
        $this->createType()->assertCreated();
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/custom-field-groups', [
            'name' => 'Event facts', 'targets' => ['entry:gatherings'],
            'fields' => [['key' => 'venue', 'label' => 'Venue', 'kind' => 'text', 'required' => true]],
        ])->assertCreated();

        $this->createEntry('gatherings', ['custom_fields' => ['venue' => '']])
            ->assertUnprocessable()->assertJsonValidationErrors('custom_fields.venue');

        $this->createEntry('gatherings', ['custom_fields' => ['venue' => 'Salt Lake']])->assertCreated()
            ->assertJsonPath('data.custom_fields.venue', 'Salt Lake');

        $this->getJson('/api/v1/types/gatherings/launch-day')->assertOk()
            ->assertJsonPath('data.custom_fields.0.display', 'Salt Lake');
    }

    /* ----------------------------------------------------------- public */

    public function test_the_archive_and_the_entry_show_only_what_is_published(): void
    {
        $typeId = $this->createType()->json('data.id');
        $this->createEntry('gatherings')->assertCreated();
        $this->createEntry('gatherings', ['title' => 'Draft thing', 'status' => 'draft'])->assertCreated();
        $this->createEntry('gatherings', ['title' => 'Next year', 'published_at' => now()->addYear()->toIso8601String()])->assertCreated();

        $this->getJson('/api/v1/types/gatherings')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.path', '/gatherings/launch-day')
            ->assertJsonPath('meta.type.plural', 'Events')
            ->assertJsonMissingPath('data.0.body');

        $this->getJson('/api/v1/types/gatherings/launch-day')->assertOk()
            ->assertJsonPath('data.body', '<p>Doors at nine.</p>')
            ->assertJsonPath('data.schema.@type', 'Article')
            ->assertJsonPath('data.type.slug', 'gatherings');

        $this->getJson('/api/v1/types/gatherings/draft-thing')->assertNotFound();
        $this->getJson('/api/v1/types/gatherings/next-year')->assertNotFound();

        $this->getJson('/api/v1/content-types')->assertOk()->assertJsonPath('data.0.slug', 'gatherings');

        ContentType::whereKey($typeId)->update(['is_active' => false]);
        $this->getJson('/api/v1/types/gatherings')->assertNotFound();
        $this->getJson('/api/v1/types/gatherings/launch-day')->assertNotFound();
        $this->getJson('/api/v1/content-types')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_a_web_page_type_emits_a_web_page_graph(): void
    {
        $this->createType(['name' => 'Partner', 'plural' => 'Partners', 'slug' => 'partners', 'schema_type' => 'WebPage'])->assertCreated();
        $this->createEntry('partners', ['title' => 'Acme'])->assertCreated();

        $this->getJson('/api/v1/types/partners/acme')->assertOk()
            ->assertJsonPath('data.schema.@type', 'WebPage')
            ->assertJsonPath('data.schema.name', 'Acme');
    }

    /* -------------------------------------------------------- registries */

    public function test_entries_reach_the_seo_overview_search_menus_and_faq_owners(): void
    {
        $typeId = $this->createType()->json('data.id');
        $id = $this->createEntry('gatherings')->json('data.id');

        $admin = $this->staff(RoleEnum::Admin);

        $rows = collect($this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/seo?type=entry')->assertOk()->json('data'));
        $this->assertSame("/admin/content/gatherings/{$id}", $rows->firstWhere('id', $id)['admin_path']);
        $this->assertSame('/gatherings/launch-day', $rows->firstWhere('id', $id)['public_path']);

        $groups = collect($this->getJson('/api/v1/search?q=launch')->assertOk()->json('data.groups'));
        $this->assertSame('/gatherings/launch-day', $groups->firstWhere('type', 'entry')['results'][0]['path']);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/faq-owners')->assertOk()
            ->assertJsonFragment(['type' => 'entry']);

        $menu = Menu::create(['name' => 'Footer', 'location' => 'footer']);
        $menu->items()->create(['type' => MenuItemType::Entry->value, 'target_type' => 'entry', 'target_id' => $id, 'label' => 'Launch', 'sort_order' => 0, 'is_active' => true]);
        $menu->items()->create(['type' => MenuItemType::ContentType->value, 'target_type' => 'content_type', 'target_id' => $typeId, 'label' => 'Events', 'sort_order' => 1, 'is_active' => true]);

        $tree = MenuTree::forLocation('footer');
        $this->assertSame(['/gatherings/launch-day', '/gatherings'], array_column($tree ?? [], 'href'));
    }
}
