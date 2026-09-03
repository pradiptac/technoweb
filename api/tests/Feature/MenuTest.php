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
     * Three levels save, and come back nested.
     *
     * The cap used to be two, refused on the grounds that neither location
     * rendered a third. That is no longer why: every renderer walks the whole
     * tree, so `MAX_DEPTH` is now a decision about navigation rather than a
     * gap in the code — and it is three.
     *
     * The third level is what this pins. A two-level chain would pass against
     * the old eager-load chain as well, so it would prove nothing about the
     * tree being built from one query.
     */
    public function test_a_menu_nests_to_the_configured_depth(): void
    {
        $deep = ['label' => 'Level 3', 'type' => 'custom', 'url' => '/three'];

        foreach ([2, 1] as $level) {
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

        $this->assertSame(3, MenuItem::count());

        $menu = Menu::first();

        $this->actingAs($this->editor(), 'sanctum')
            ->getJson("/api/v1/admin/menus/{$menu->id}")
            ->assertOk()
            ->assertJsonPath('data.items.0.children.0.children.0.label', 'Level 3');
    }

    /**
     * The read side has no depth limit of its own, and that is deliberate.
     *
     * Written straight to the database rather than through the API, and **five
     * levels rather than three on purpose**: validation is the only cap, so a
     * tree deeper than `MAX_DEPTH` — from a seeder, a migration, a hand-written
     * row, or simply from the constant being raised — must still render in full
     * rather than silently losing its bottom.
     *
     * That is what makes raising the limit a one-line change. If this test ever
     * has to be edited to match `MAX_DEPTH`, a second cap has appeared
     * somewhere and the constant has stopped being the whole answer.
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
     * One level past the limit is refused, and the refusal writes nothing.
     *
     * `range(1, MAX_DEPTH)` builds a tree exactly one deeper than allowed, so
     * this follows the constant rather than hard-coding a number beside it —
     * change `MAX_DEPTH` and this still tests the boundary.
     */
    public function test_nesting_past_the_limit_is_refused(): void
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
            'as deep as a menu goes here',
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

    /**
     * Rebuilding replaces the items and **keeps the menu**.
     *
     * The distinction is the whole of why this is not "delete and re-seed":
     * the row keeps its id, its name and its `location`, so rebuilding the live
     * navigation cannot unassign it and leave the site on the built-in menu for
     * however long nobody notices — and every bookmark into
     * `/admin/menus/{id}` still works.
     */
    public function test_rebuilding_replaces_the_items_and_keeps_the_menu(): void
    {
        $menu = Menu::create(['name' => 'Primary navigation', 'location' => MenuLocation::Primary]);

        $mine = MenuItem::create([
            'menu_id' => $menu->id,
            'label' => 'Something I arranged',
            'type' => MenuItemType::Custom,
            'url' => '/mine',
            'sort_order' => 0,
        ]);

        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus/rebuild/primary')
            ->assertOk()
            ->assertJsonPath('data.id', $menu->id);

        $menu->refresh();

        $this->assertSame(MenuLocation::Primary, $menu->location, 'A rebuild must not unassign the live menu.');
        $this->assertSame('Primary navigation', $menu->name);
        $this->assertDatabaseMissing('menu_items', ['id' => $mine->id]);
        $this->assertGreaterThan(0, $menu->items()->count());
    }

    /**
     * A location with no menu yet gets one.
     *
     * The button has to work on an install that has never run
     * `technoware:seed-menus`, which is every install until somebody does.
     */
    public function test_rebuilding_creates_a_menu_when_the_location_has_none(): void
    {
        $this->assertSame(0, Menu::count());

        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus/rebuild/footer')
            ->assertOk();

        $menu = Menu::firstOrFail();

        $this->assertSame(MenuLocation::Footer, $menu->location);
        $this->assertGreaterThan(0, $menu->items()->count());
    }

    /** An unknown location is a 422, not a menu called "sidebar". */
    public function test_rebuilding_an_unknown_location_is_refused(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus/rebuild/sidebar')
            ->assertStatus(422);

        $this->assertSame(0, Menu::count());
    }

    /**
     * `menus/rebuild/{location}` is declared above `menus/{menu:id}`.
     *
     * Laravel matches in declaration order, so underneath it "rebuild" binds as
     * an id and 404s from model binding — a routing bug that reads as a missing
     * record. `media/move` has a test for exactly this shape and this is the
     * same one.
     */
    public function test_the_rebuild_route_is_not_shadowed_by_the_id_route(): void
    {
        $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/menus/rebuild/primary')
            ->assertOk();
    }
}
