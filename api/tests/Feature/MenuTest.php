<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
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
    public function test_a_third_level_is_refused_with_a_sentence(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus', [
                'name' => 'Main',
                'items' => [[
                    'label' => 'One', 'type' => 'custom', 'url' => '/one',
                    'children' => [[
                        'label' => 'Two', 'type' => 'custom', 'url' => '/two',
                        'children' => [
                            ['label' => 'Three', 'type' => 'custom', 'url' => '/three'],
                        ],
                    ]],
                ]],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('items.0.children.0.children');
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
}
