<?php

namespace Tests\Feature;

use App\Enums\MenuItemType;
use App\Enums\MenuLocation;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Models\Solution;
use App\Support\MenuTree;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A menu item shows its record's icon and summary.
 *
 * `MenuTree` resolves every **URL** from the record the item points at, and its
 * own docblock explains why: a stored address rots the first time somebody
 * fixes a typo in a slug. The icon and the summary were read from the menu
 * item's own columns instead — and nothing fills those. `technoware:seed-menus`
 * writes a reference and a label, and an editor building a menu by hand is
 * naming a navigation entry rather than re-describing a solution.
 *
 * So **assigning a menu silently stripped the icon and the summary from every
 * item in the mega panel**: two of the three things it draws. The header went
 * from an icon, a title and a line of description to a plain list of links, on
 * every page of the site, from a screen nobody associates with the homepage.
 *
 * Nothing could have caught it. The audits check contrast, headings, overflow
 * and structured data; none of them counts icons, and the navigation still
 * worked perfectly — every link went to the right place.
 */
class MenuIconTest extends TestCase
{
    use RefreshDatabase;

    /** Created directly: there is no factory for this model, as elsewhere in the suite. */
    private function solution(array $attributes): Solution
    {
        return Solution::create(array_merge([
            'title' => 'Enterprise networking',
            'slug' => 'networking-'.uniqid(),
            'status' => 'published',
        ], $attributes));
    }

    private function menuPointingAt(Solution $solution): Menu
    {
        $menu = Menu::create(['name' => 'Primary', 'location' => MenuLocation::Primary]);

        $parent = MenuItem::create([
            'menu_id' => $menu->id,
            'label' => 'Solutions',
            'type' => MenuItemType::Section,
            'target_key' => 'solutions',
            'sort_order' => 0,
        ]);

        MenuItem::create([
            'menu_id' => $menu->id,
            'parent_id' => $parent->id,
            // A label of the editor's choosing, deliberately not the record's
            // title: that is the field a menu *is* allowed to decide.
            'label' => 'Networking',
            'type' => MenuItemType::Solution,
            'target_type' => 'solution',
            'target_id' => $solution->id,
            'sort_order' => 0,
        ]);

        return $menu;
    }

    public function test_an_item_takes_its_icon_and_summary_from_the_record(): void
    {
        $solution = $this->solution(['icon' => 'network', 'summary' => 'Structured cabling and VLAN design.']);

        $this->menuPointingAt($solution);

        $child = MenuTree::forLocation('primary')[0]['children'][0];

        $this->assertSame('network', $child['icon']);
        $this->assertSame('Structured cabling and VLAN design.', $child['summary']);
        // The label is still the editor's, which is the whole distinction.
        $this->assertSame('Networking', $child['label']);
    }

    /** An icon typed on the item beats the record's, so a menu can still override. */
    public function test_the_items_own_icon_wins_where_it_has_one(): void
    {
        $solution = $this->solution(['icon' => 'network', 'summary' => 'From the record.']);
        $menu = $this->menuPointingAt($solution);

        $menu->items()->where('parent_id', '!=', null)->first()
            ->update(['icon' => 'shield', 'description' => 'From the menu.']);

        $child = MenuTree::forLocation('primary')[0]['children'][0];

        $this->assertSame('shield', $child['icon']);
        $this->assertSame('From the menu.', $child['summary']);
    }

    /**
     * A record with no icon yields null rather than an invented one.
     *
     * The frontend renders a tile only for a name its build knows, so null is
     * the honest answer for a record nobody has given an icon — and inventing a
     * default here would put the same glyph beside every unlabelled entry.
     */
    public function test_a_record_without_an_icon_yields_null(): void
    {
        $solution = $this->solution(['icon' => null, 'summary' => null]);
        $this->menuPointingAt($solution);

        $child = MenuTree::forLocation('primary')[0]['children'][0];

        $this->assertNull($child['icon']);
        $this->assertNull($child['summary']);
    }

    /**
     * An empty string on the item falls through to the record.
     *
     * `?:` rather than `??`, the trap the newsletter's footer address sprang: a
     * record edited and left blank stores `''`, and falling through only on null
     * would let a blank override beat a perfectly good value.
     */
    public function test_a_blank_override_falls_through_to_the_record(): void
    {
        $solution = $this->solution(['icon' => 'network', 'summary' => 'From the record.']);
        $menu = $this->menuPointingAt($solution);

        $menu->items()->where('parent_id', '!=', null)->first()
            ->update(['icon' => '', 'description' => '']);

        $child = MenuTree::forLocation('primary')[0]['children'][0];

        $this->assertSame('network', $child['icon']);
        $this->assertSame('From the record.', $child['summary']);
    }
}
