<?php

namespace Tests\Feature;

use App\Enums\MenuItemType;
use App\Enums\MenuLocation;
use App\Enums\Role as RoleEnum;
use App\Http\Requests\MenuRequest;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Models\Role;
use App\Models\Solution;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Editable navigation.
 *
 * The tests that matter here are not the CRUD ones. A menu renders on every
 * page of the site, so the two failures worth engineering against are a link
 * that rots when somebody edits a slug on a different screen, and a menu that
 * silently empties the header.
 */
class MenuTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'mabel-menus@example.test'],
            ['name' => 'Mabel Editor', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if (! $user->roles()->count()) {
            $role = Role::firstOrCreate(
                ['slug' => RoleEnum::ContentManager->value],
                ['name' => RoleEnum::ContentManager->label()],
            );
            $user->roles()->attach($role);
        }

        return $user;
    }

    private function solution(string $title, string $slug): Solution
    {
        return Solution::create([
            'title' => $title,
            'slug' => $slug,
            'summary' => 'A summary that exists so the record is complete.',
            'status' => 'published',
        ]);
    }

    public function test_a_nested_tree_is_saved_from_the_shape_of_the_payload(): void
    {
        $networking = $this->solution('Networking', 'networking');

        $response = $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', [
                'name' => 'Main',
                'location' => 'primary',
                'items' => [
                    [
                        'label' => 'Solutions',
                        'type' => 'custom',
                        'url' => '/solutions',
                        'children' => [
                            ['label' => 'Networking', 'type' => 'solution', 'target_id' => $networking->id],
                        ],
                    ],
                    ['label' => 'Support', 'type' => 'custom', 'url' => '/support'],
                ],
            ])
            ->assertCreated();

        // sort_order and parent_id are read off the structure, never trusted
        // from the payload — neither was sent.
        $this->assertSame(0, $response->json('data.items.0.sort_order'));
        $this->assertSame(1, $response->json('data.items.1.sort_order'));
        $this->assertSame('Networking', $response->json('data.items.0.children.0.label'));

        $child = MenuItem::where('label', 'Networking')->firstOrFail();
        $this->assertSame(MenuItem::where('label', 'Solutions')->value('id'), $child->parent_id);
    }

    /**
     * The test this whole design exists for.
     *
     * A menu item stores a record reference, so renaming a slug on the
     * solution's own edit screen has to move the navigation with it. Storing
     * the resolved URL would leave a 404 in the header of every page on the
     * site, from an edit made somewhere else entirely.
     */
    public function test_a_link_follows_its_record_when_the_slug_changes(): void
    {
        $solution = $this->solution('Networking', 'networking');
        $menu = Menu::create(['name' => 'Main', 'location' => 'primary']);
        MenuItem::create([
            'menu_id' => $menu->id, 'label' => 'Networking', 'type' => 'solution',
            'target_type' => 'solution', 'target_id' => $solution->id, 'sort_order' => 0,
        ]);

        $this->getJson('/api/v1/menus/primary')
            ->assertOk()
            ->assertJsonPath('data.0.href', '/solutions/networking');

        // Renamed on its own screen. Nothing touches the menu.
        $solution->update(['slug' => 'enterprise-networking']);

        $this->getJson('/api/v1/menus/primary')
            ->assertOk()
            ->assertJsonPath('data.0.href', '/solutions/enterprise-networking');
    }

    public function test_an_item_whose_record_is_gone_is_dropped_rather_than_rendered_dead(): void
    {
        $solution = $this->solution('Networking', 'networking');
        $menu = Menu::create(['name' => 'Main', 'location' => 'primary']);

        MenuItem::create([
            'menu_id' => $menu->id, 'label' => 'Networking', 'type' => 'solution',
            'target_type' => 'solution', 'target_id' => $solution->id, 'sort_order' => 0,
        ]);
        MenuItem::create([
            'menu_id' => $menu->id, 'label' => 'Support', 'type' => 'custom',
            'url' => '/support', 'sort_order' => 1,
        ]);

        $solution->delete();

        // One item left, and it is the one that still resolves — not an inert
        // word in the site header, and not a link to `/solutions/`.
        $this->getJson('/api/v1/menus/primary')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.href', '/support');
    }

    public function test_an_inactive_item_is_not_rendered_but_keeps_its_place(): void
    {
        $menu = Menu::create(['name' => 'Main', 'location' => 'primary']);
        MenuItem::create(['menu_id' => $menu->id, 'label' => 'Hidden', 'type' => 'custom',
            'url' => '/hidden', 'sort_order' => 0, 'is_active' => false]);
        MenuItem::create(['menu_id' => $menu->id, 'label' => 'Shown', 'type' => 'custom',
            'url' => '/shown', 'sort_order' => 1]);

        $this->getJson('/api/v1/menus/primary')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.label', 'Shown');

        $this->assertDatabaseHas('menu_items', ['label' => 'Hidden', 'sort_order' => 0]);
    }

    /**
     * No menu assigned is a 404, and that is what makes this feature additive.
     *
     * The frontend falls back to its built-in navigation on a 404, so an
     * install that never opens this screen keeps the header it has today. An
     * empty 200 would blank it.
     */
    public function test_an_unassigned_location_is_a_404_and_an_empty_menu_is_not(): void
    {
        $this->getJson('/api/v1/menus/primary')->assertNotFound();

        Menu::create(['name' => 'Main', 'location' => 'primary']);

        $this->getJson('/api/v1/menus/primary')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_an_unknown_location_is_a_404(): void
    {
        $this->getJson('/api/v1/menus/sidebar')->assertNotFound();
    }

    public function test_two_menus_cannot_claim_one_location(): void
    {
        Menu::create(['name' => 'Main', 'location' => 'primary']);

        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', ['name' => 'Another', 'location' => 'primary'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('location');
    }

    /**
     * Depth is capped at what a location renders, so nothing is stored that an
     * editor arranges carefully and never sees.
     */
    /**
     * A menu nests as deep as somebody builds it.
     *
     * This replaces a test that asserted the opposite — a third level used to
     * be a 422, on the grounds that neither location rendered one and it would
     * be data an editor arranged carefully and never saw. That reasoning was
     * sound and is now obsolete: every renderer walks the whole tree, so the
     * cap has gone rather than been raised.
     *
     * Five levels here because four would pass against a chain of eager loads
     * one level longer than before, and the point is that nothing is chained.
     */
    public function test_a_menu_nests_without_a_limit(): void
    {
        $deep = ['label' => 'Level 5', 'type' => 'custom', 'url' => '/five'];

        foreach ([4, 3, 2, 1] as $level) {
            $deep = [
                'label' => "Level {$level}",
                'type' => 'custom',
                'url' => "/{$level}",
                'children' => [$deep],
            ];
        }

        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', ['name' => 'Main', 'items' => [$deep]])
            ->assertCreated();

        $this->assertSame(5, MenuItem::count());

        // And it comes back nested, to the bottom, from one query.
        $menu = Menu::first();

        $this->actingAs($this->editor(), 'sanctum')
            ->getJson("/api/v1/admin/menus/{$menu->id}")
            ->assertOk()
            ->assertJsonPath('data.items.0.children.0.children.0.children.0.children.0.label', 'Level 5');
    }

    /**
     * The public tree carries every level too.
     *
     * The half that matters: an editor can now build five levels, so anything
     * that reads a menu has to return five — otherwise this is the old bug in a
     * new place, with the arranging done and the showing not.
     */
    public function test_the_public_tree_returns_every_level(): void
    {
        $menu = Menu::create(['name' => 'Main', 'location' => MenuLocation::Primary]);

        $parent = null;

        foreach (range(1, 5) as $level) {
            $parent = MenuItem::create([
                'menu_id' => $menu->id,
                'parent_id' => $parent?->id,
                'label' => "Level {$level}",
                'type' => MenuItemType::Custom,
                'url' => "/{$level}",
                'sort_order' => 0,
            ]);
        }

        $this->getJson('/api/v1/menus/primary')
            ->assertOk()
            ->assertJsonPath('data.0.children.0.children.0.children.0.children.0.label', 'Level 5');
    }

    /**
     * The abuse ceiling, which is arithmetic rather than an opinion.
     *
     * Recursion on attacker-controlled input with no floor is how a request
     * exhausts the stack. Twenty is far past anything a navigation could mean,
     * and the message says that rather than claiming a menu should not be deep.
     */
    public function test_runaway_nesting_is_refused(): void
    {
        $deep = ['label' => 'Bottom', 'type' => 'custom', 'url' => '/bottom'];

        // One past the ceiling.
        foreach (range(1, MenuRequest::MAX_DEPTH) as $level) {
            $deep = [
                'label' => "L{$level}",
                'type' => 'custom',
                'url' => '/x',
                'children' => [$deep],
            ];
        }

        $response = $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', ['name' => 'Main', 'items' => [$deep]])
            ->assertStatus(422);

        $this->assertStringContainsString(
            'as deep as this will go',
            json_encode($response->json('errors')),
        );

        $this->assertSame(0, MenuItem::count(), 'A refused save must write nothing at all.');
    }

    /** A custom link's URL becomes an href on every page of the site. */
    public function test_a_javascript_url_is_refused(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', [
                'name' => 'Main',
                'items' => [['label' => 'Bad', 'type' => 'custom', 'url' => 'javascript:alert(1)']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('items.0.url');
    }

    /**
     * An item pointing at a record type needs a record, or it saves happily
     * and vanishes at render — which reads as the menu losing entries by
     * itself.
     */
    public function test_a_record_link_without_a_record_is_refused(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', [
                'name' => 'Main',
                'items' => [['label' => 'Networking', 'type' => 'solution']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('items.0.target_id');
    }

    public function test_saving_replaces_the_tree_wholesale(): void
    {
        $menu = Menu::create(['name' => 'Main']);
        MenuItem::create(['menu_id' => $menu->id, 'label' => 'Old', 'type' => 'custom',
            'url' => '/old', 'sort_order' => 0]);

        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/menus/{$menu->id}", [
                'items' => [['label' => 'New', 'type' => 'custom', 'url' => '/new']],
            ])
            ->assertOk();

        $this->assertDatabaseMissing('menu_items', ['label' => 'Old']);
        $this->assertDatabaseHas('menu_items', ['label' => 'New']);

        // Omitting the key leaves the items alone; sending [] empties them.
        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/menus/{$menu->id}", ['name' => 'Renamed'])
            ->assertOk();
        $this->assertDatabaseHas('menu_items', ['label' => 'New']);

        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/menus/{$menu->id}", ['items' => []])
            ->assertOk();
        $this->assertSame(0, MenuItem::count());
    }

    /** Deleting a menu takes its items, and a parent takes its children. */
    public function test_deleting_cascades(): void
    {
        $menu = Menu::create(['name' => 'Main']);
        $parent = MenuItem::create(['menu_id' => $menu->id, 'label' => 'Parent',
            'type' => 'custom', 'url' => '/p', 'sort_order' => 0]);
        MenuItem::create(['menu_id' => $menu->id, 'parent_id' => $parent->id, 'label' => 'Child',
            'type' => 'custom', 'url' => '/c', 'sort_order' => 0]);

        $this->actingAs($this->editor(), 'sanctum')
            ->deleteJson("/api/v1/admin/menus/{$menu->id}")
            ->assertNoContent();

        $this->assertSame(0, MenuItem::count());
    }

    public function test_the_admin_endpoints_need_authentication(): void
    {
        $this->getJson('/api/v1/admin/menus')->assertUnauthorized();
    }

    /**
     * A site section resolves through the allowlist, not from anything stored.
     *
     * The reason this type exists: `/blog`, `/products` and `/support` are Next
     * routes with no record behind them, so the only way to put one in a menu
     * was a **custom link** — free text, checked for shape and nothing else, on
     * an element that renders on every page. `/blogs` saved perfectly happily.
     */
    public function test_a_site_section_item_resolves_to_its_path(): void
    {
        $menu = Menu::create(['name' => 'Primary', 'location' => 'primary']);

        MenuItem::create([
            'menu_id' => $menu->id,
            'sort_order' => 0,
            'label' => 'Blog',
            'type' => 'section',
            'target_key' => 'blog',
            'is_active' => true,
        ]);

        $node = $this->getJson('/api/v1/menus/primary')->assertOk()->json('data.0');

        $this->assertSame('Blog', $node['label']);
        $this->assertSame('/blog', $node['href']);
    }

    /**
     * A section that no longer exists is dropped, exactly like a deleted record.
     *
     * An inert word in a navigation bar reads as a broken page, and a link to a
     * route that has gone is worse. The public resource already drops an item
     * whose record was deleted; a section removed from `SiteSection` has to
     * behave the same way or the two answers diverge.
     */
    public function test_a_section_that_no_longer_exists_is_dropped(): void
    {
        $menu = Menu::create(['name' => 'Primary', 'location' => 'primary']);

        MenuItem::create([
            'menu_id' => $menu->id, 'sort_order' => 0, 'label' => 'Good',
            'type' => 'section', 'target_key' => 'blog', 'is_active' => true,
        ]);

        MenuItem::create([
            'menu_id' => $menu->id, 'sort_order' => 1, 'label' => 'Retired',
            'type' => 'section', 'target_key' => 'no_such_section', 'is_active' => true,
        ]);

        $data = $this->getJson('/api/v1/menus/primary')->assertOk()->json('data');

        $this->assertCount(1, $data, 'A section with no path must not be rendered.');
        $this->assertSame('Good', $data[0]['label']);
    }

    /**
     * The console cannot save a section key the site does not have.
     *
     * Validated against the allowlist rather than accepted as a string, which
     * is the whole difference between this and a custom link.
     */
    public function test_an_unknown_section_key_is_refused(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', [
                'name' => 'Primary',
                'items' => [
                    ['label' => 'Nope', 'type' => 'section', 'target_key' => 'not_a_section'],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('items.0.target_key');
    }

    /** A section item with no key at all is refused, and says which field. */
    public function test_a_section_needs_a_key(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', [
                'name' => 'Primary',
                'items' => [['label' => 'Nope', 'type' => 'section']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('items.0.target_key');
    }

    /**
     * A section carries no morph, and that is not tidiness.
     *
     * `enforceMorphMap` throws for an alias it does not know, and `section` is
     * not a model — so writing the type into `target_type` because every other
     * case does would throw the moment anything touched the relation.
     */
    public function test_a_section_stores_no_morph_type(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', [
                'name' => 'Primary',
                'items' => [['label' => 'Blog', 'type' => 'section', 'target_key' => 'blog']],
            ])
            ->assertCreated();

        $item = MenuItem::firstOrFail();

        $this->assertNull($item->target_type);
        $this->assertNull($item->target_id);
        $this->assertSame('blog', $item->target_key);
    }

    /** The options travel on `meta`, so the console never lists them itself. */
    public function test_the_section_options_are_sent_by_the_api(): void
    {
        $sections = $this->actingAs($this->editor(), 'sanctum')
            ->getJson('/api/v1/admin/menus')->assertOk()->json('meta.sections');

        $this->assertNotEmpty($sections);

        $blog = collect($sections)->firstWhere('value', 'blog');

        $this->assertNotNull($blog, 'The blog index must be offerable.');
        $this->assertSame('/blog', $blog['path']);
    }
}
