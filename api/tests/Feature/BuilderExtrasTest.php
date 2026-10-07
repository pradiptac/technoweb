<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\JobOpening;
use App\Models\ProductCategory;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The builder's visual extras (0.126.0, docs/page-builder.md): shaped edges,
 * an animated background, more live lists for a Cards section, and an
 * in-page menu worked out from the page's own anchors.
 */
class BuilderExtrasTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): User
    {
        $user = User::firstOrCreate(['email' => 'extras-editor@example.test'], [
            'name' => 'Editor', 'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([
            Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()])->id,
        ]);

        return $user;
    }

    /** @param  array<string, mixed>  $data @return array<string, mixed> */
    private static function section(string $type, array $data, array $extra = []): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'background' => null, 'data' => $data, ...$extra];
    }

    /** @param  list<array<string, mixed>>  $blocks */
    private function create(array $blocks, string $title = 'Extras page')
    {
        return $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => $title, 'template' => 'builder', 'status' => 'published', 'blocks' => $blocks,
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function publicSections(string $slug): array
    {
        return $this->getJson("/api/v1/pages/{$slug}")->assertOk()->json('data.sections');
    }

    public function test_a_shaped_edge_is_a_choice_from_the_list_and_the_straight_one_is_not_stored(): void
    {
        $text = fn (array $style) => self::section('rich_text', ['heading' => 'Edges', 'body' => '<p>Body.</p>'], [
            'background' => ['kind' => 'solid', 'colour' => '#1e3a8a'], 'style' => $style,
        ]);

        $this->create([$text(['edge_top' => 'zigzag'])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.style.edge_top');

        $this->create([$text(['edge_top' => 'wave', 'edge_bottom' => 'default'])], 'Edged page')->assertCreated();
        $style = $this->publicSections('edged-page')[0]['style'];

        $this->assertSame('wave', $style['edge_top']);
        $this->assertArrayNotHasKey('edge_bottom', $style);
    }

    public function test_an_animated_background_names_a_scene_and_carries_nothing_else(): void
    {
        $text = fn (array $bg) => self::section('rich_text', ['heading' => 'Moving', 'body' => '<p>Body.</p>'], ['background' => $bg]);

        // No scene, and a scene that is not the shape of an id.
        $this->create([$text(['kind' => 'scene'])])->assertStatus(422);
        $this->create([$text(['kind' => 'scene', 'scene' => 'Aurora; DROP'])])->assertStatus(422);

        $this->create([$text(['kind' => 'scene', 'scene' => 'aurora', 'colour' => '#ff0000', 'texture' => 'grain'])], 'Scene page')->assertCreated();

        $this->assertSame(['kind' => 'scene', 'scene' => 'aurora'], $this->publicSections('scene-page')[0]['background']);
    }

    public function test_cards_can_list_categories_vacancies_and_a_custom_content_type(): void
    {
        ProductCategory::create(['name' => 'Switches', 'slug' => 'switches', 'description' => 'Managed and unmanaged.', 'sort_order' => 1]);
        JobOpening::create([
            'title' => 'Network engineer', 'slug' => 'network-engineer', 'department' => 'Projects', 'summary' => 'Sites across the east.',
            'status' => 'published', 'published_at' => now()->subDay(),
        ]);
        JobOpening::create([
            'title' => 'Closed role', 'slug' => 'closed-role', 'status' => 'published', 'published_at' => now()->subMonth(), 'closes_at' => now()->subDay(),
        ]);
        $type = ContentType::create(['name' => 'Partner story', 'plural' => 'Partner stories', 'slug' => 'partner-stories', 'is_active' => true, 'archive_enabled' => true]);
        Entry::create(['content_type_id' => $type->id, 'title' => 'A first story', 'slug' => 'a-first-story', 'summary' => 'How it went.', 'status' => 'published', 'published_at' => now()->subDay()]);
        Entry::create(['content_type_id' => $type->id, 'title' => 'A draft story', 'slug' => 'a-draft-story', 'status' => 'draft']);

        // The picker is sent the type, labelled by its plural.
        $sources = collect($this->actingAs($this->editor(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk()->json('data.card_sources'));
        $this->assertSame('Partner stories (your content)', $sources->firstWhere('value', 'entry:partner-stories')['label'] ?? null);
        $this->assertNotNull($sources->firstWhere('value', 'vacancies'));

        $cards = fn (string $source) => self::section('cards', ['heading' => 'A list', 'source' => $source, 'limit' => 6]);

        // A type nobody made is not a source.
        $this->create([$cards('entry:nothing-here')])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.source');

        $this->create([$cards('product_categories'), $cards('vacancies'), $cards('entry:partner-stories')], 'Lists page')->assertCreated();
        [$categories, $vacancies, $stories] = $this->publicSections('lists-page');

        $this->assertSame('/products/switches', $categories['data']['items'][0]['path']);
        $this->assertSame('/products', $categories['data']['index_path']);

        $this->assertCount(1, $vacancies['data']['items']);
        $this->assertSame(['Network engineer', 'Projects', 'Remote'], [$vacancies['data']['items'][0]['title'], $vacancies['data']['items'][0]['kicker'], $vacancies['data']['items'][0]['meta']]);

        $this->assertCount(1, $stories['data']['items']);
        $this->assertSame('/partner-stories/a-first-story', $stories['data']['items'][0]['path']);
        $this->assertSame('/partner-stories', $stories['data']['index_path']);

        // Switched off, the type's list is empty and the section goes with it.
        $type->update(['is_active' => false]);
        $this->assertCount(2, $this->publicSections('lists-page'));
    }

    public function test_an_in_page_menu_lists_the_anchored_sections_that_are_drawn(): void
    {
        $text = fn (string $heading, array $extra = []) => self::section('rich_text', ['heading' => $heading, 'body' => '<p>Body.</p>'], $extra);

        $this->create([
            self::section('subnav', ['label' => 'On this page']),
            $text('What we do', ['style' => ['anchor' => 'what']]),
            $text('No anchor here'),
            $text('How we work', ['style' => ['anchor' => 'how']]),
            $text('Hidden for now', ['style' => ['anchor' => 'hidden'], 'hidden' => true]),
        ], 'Menu page')->assertCreated();

        $menu = $this->publicSections('menu-page')[0];

        $this->assertSame('subnav', $menu['type']);
        $this->assertSame('On this page', $menu['data']['label']);
        $this->assertSame([
            ['anchor' => 'what', 'label' => 'What we do'],
            ['anchor' => 'how', 'label' => 'How we work'],
        ], $menu['data']['items']);

        // One place to go is not a menu.
        $this->create([self::section('subnav', []), $text('Alone', ['style' => ['anchor' => 'alone']])], 'Lonely page')->assertCreated();
        $this->assertSame(['rich_text'], array_column($this->publicSections('lonely-page'), 'type'));
    }
}
