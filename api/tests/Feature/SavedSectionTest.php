<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\SavedSection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The section library and page templates (2026-10-05, docs/page-builder.md
 * "The library").
 *
 * A saved section is one section, never itself a link; a page places it
 * linked as a `saved` section and the public read draws the library's
 * section in its place — the page's own id and Hidden switch kept — so an
 * edit to the library reaches the page; a section still placed linked
 * cannot be deleted; a template is a stack.
 */
class SavedSectionTest extends TestCase
{
    use RefreshDatabase;

    private function user(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::firstOrCreate(['email' => "library-{$role->value}@example.test"], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user;
    }

    /** @return array<string, mixed> */
    private static function section(string $type, array $data, array $extra = []): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'background' => null, 'data' => $data, ...$extra];
    }

    private function save(array $payload)
    {
        return $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/saved-sections', $payload);
    }

    private function librarySection(string $heading = 'Talk to us'): int
    {
        return $this->save([
            'kind' => 'section', 'name' => 'Closing text',
            'blocks' => [self::section('rich_text', ['heading' => $heading, 'body' => '<p>Ring the desk.</p>'])],
        ])->assertCreated()->json('data.id');
    }

    public function test_a_section_is_one_section_and_never_itself_a_link(): void
    {
        $this->save(['kind' => 'section', 'name' => 'Two', 'blocks' => [
            self::section('divider', []), self::section('divider', []),
        ]])->assertStatus(422)->assertJsonValidationErrors('blocks');

        $id = $this->librarySection();
        $this->save(['kind' => 'section', 'name' => 'Link', 'blocks' => [self::section('saved', ['saved_id' => $id])]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.type');

        // A section is checked by a page's own rules: a heading is required here.
        $this->save(['kind' => 'section', 'name' => 'Hero', 'blocks' => [self::section('hero', ['layout' => 'centered'])]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.heading');
    }

    public function test_a_template_is_a_stack_and_the_builder_lists_both(): void
    {
        $this->librarySection();
        $this->save(['kind' => 'template', 'name' => 'Landing', 'description' => 'Hero, text, divider.', 'blocks' => [
            self::section('hero', ['heading' => 'Hello', 'layout' => 'centered']),
            self::section('rich_text', ['body' => '<p>Words.</p>']),
            self::section('divider', []),
        ]])->assertCreated()->assertJsonPath('data.count', 3);

        $library = $this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk()->json('data.library');
        $this->assertSame('Closing text', $library['sections'][0]['name']);
        $this->assertSame('rich_text', $library['sections'][0]['type']);
        $this->assertSame(['Landing', 3], [$library['templates'][0]['name'], $library['templates'][0]['count']]);
    }

    public function test_a_linked_section_is_drawn_from_the_library_and_follows_its_edits(): void
    {
        $id = $this->librarySection('Talk to us');
        $link = self::section('saved', ['saved_id' => $id]);
        $hidden = self::section('saved', ['saved_id' => $id], ['hidden' => true]);

        $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => 'Linked page', 'template' => 'builder', 'status' => 'published', 'blocks' => [$link, $hidden],
        ])->assertCreated();

        $this->getJson('/api/v1/pages/linked-page')->assertOk()
            ->assertJsonCount(1, 'data.sections')
            ->assertJsonPath('data.sections.0.id', $link['id'])
            ->assertJsonPath('data.sections.0.type', 'rich_text')
            ->assertJsonPath('data.sections.0.data.heading', 'Talk to us');

        $this->actingAs($this->user(), 'sanctum')->patchJson("/api/v1/admin/saved-sections/{$id}", [
            'blocks' => [self::section('rich_text', ['heading' => 'Ring the desk', 'body' => '<p>Any time.</p>'])],
        ])->assertOk();

        $this->getJson('/api/v1/pages/linked-page')->assertOk()
            ->assertJsonPath('data.sections.0.data.heading', 'Ring the desk');
    }

    public function test_a_link_must_name_a_section_still_in_the_library(): void
    {
        $template = $this->save(['kind' => 'template', 'name' => 'T', 'blocks' => [self::section('divider', [])]])->json('data.id');

        foreach ([999, $template] as $bad) {
            $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages', [
                'title' => 'Bad link', 'template' => 'builder', 'status' => 'draft',
                'blocks' => [self::section('saved', ['saved_id' => $bad])],
            ])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.saved_id');
        }
    }

    public function test_a_section_placed_linked_cannot_be_deleted_until_it_is_not(): void
    {
        $id = $this->librarySection();
        $page = $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => 'Uses it', 'template' => 'builder', 'status' => 'draft',
            'blocks' => [self::section('saved', ['saved_id' => $id])],
        ])->json('data.id');

        $this->actingAs($this->user(), 'sanctum')->deleteJson("/api/v1/admin/saved-sections/{$id}")
            ->assertStatus(422)->assertJsonPath('linked_from.0.title', 'Uses it');

        $this->actingAs($this->user(), 'sanctum')->patchJson("/api/v1/admin/pages/{$page}", [
            'blocks' => [self::section('divider', [])],
        ])->assertOk();

        $this->actingAs($this->user(), 'sanctum')->deleteJson("/api/v1/admin/saved-sections/{$id}")->assertNoContent();
        $this->assertNull(SavedSection::find($id));
    }

    public function test_a_template_that_links_a_section_blocks_its_delete_and_is_named(): void
    {
        $id = $this->librarySection();
        $this->save(['kind' => 'template', 'name' => 'Holds it', 'blocks' => [self::section('saved', ['saved_id' => $id])]])->assertCreated();

        $this->actingAs($this->user(), 'sanctum')->deleteJson("/api/v1/admin/saved-sections/{$id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'This section is still placed, linked, on 1 template. Make a copy of it there first.')
            ->assertJsonPath('linked_from.0.kind', 'template');
    }

    public function test_only_a_content_manager_reaches_the_library(): void
    {
        $this->actingAs($this->user(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/saved-sections')->assertForbidden();
    }
}
