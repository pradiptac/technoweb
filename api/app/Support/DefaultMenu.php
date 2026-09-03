<?php

namespace App\Support;

use App\Enums\MenuItemType;
use App\Enums\PublishStatus;
use App\Models\Industry;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Models\Page;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;

/**
 * The navigation the site renders when no menu is assigned, as menu rows.
 *
 * One definition of "the default", used by `technoware:seed-menus` and by the
 * console's Rebuild button. It lived inside the command, which was fine while
 * the command was the only caller — a second copy behind a button is exactly
 * the drift that gave the newsletter two definitions of "delivered" and the
 * store two of "paid".
 *
 * **It replaces a menu's items in place.** The menu row keeps its id, its name
 * and — importantly — its `location`, so rebuilding the live navigation does not
 * unassign it and leave the site on the built-in menu for however long nobody
 * notices.
 *
 * Warnings are returned rather than printed, because the callers report
 * differently: a command writes to a console, an endpoint answers a request.
 */
class DefaultMenu
{
    /**
     * Rebuild a menu from the catalogue as it stands today.
     *
     * @return array<int, string> anything left out, and why
     */
    public static function rebuild(Menu $menu, string $kind): array
    {
        /*
         * Roots only: `parent_id` cascades, so the subtrees go with them —
         * the same deletion `MenuController::syncItems` makes, and for the
         * same reason. One at a time through the model rather than a mass
         * delete, so any model event `MenuItem` ever gains still fires.
         */
        $menu->items()->whereNull('parent_id')->get()->each->delete();

        /*
         * A match rather than the ternary this was.
         *
         * `$kind === 'footer' ? footer : primary` was exhaustive over two
         * locations and silently wrong the moment there were four: a top bar
         * would have been rebuilt with the header's mega panels in it. The
         * same shape as the controller's name ternary, found the same way.
         */
        return match ($kind) {
            'topbar' => self::topBar($menu),
            'footer' => self::footer($menu),
            'bottom' => self::bottomBar($menu),
            default => self::primary($menu),
        };
    }

    /** @return array<int, string> */
    private static function primary(Menu $menu): array
    {
        $order = 0;

        /*
         * The four that open a panel, each with its children.
         *
         * The parent is a section rather than a custom link, so "all
         * solutions" keeps working if that route ever moves. The header turns
         * any top-level item **with children** into a mega panel and uses the
         * parent as its "view all", which is exactly this shape.
         */
        foreach ([
            ['Solutions', 'solutions', Solution::class, MenuItemType::Solution, 'title'],
            ['Products', 'products', ProductCategory::class, MenuItemType::ProductCategory, 'name'],
            ['Web Services', 'services', Service::class, MenuItemType::Service, 'title'],
            ['Industries', 'industries', Industry::class, MenuItemType::Industry, 'name'],
        ] as [$label, $section, $model, $type, $column]) {
            $parent = self::section($menu, $label, $section, $order++);

            $records = $model::query()
                ->when(
                    // Industries and categories have no status column — they
                    // are reference data the catalogue points at, not
                    // something anybody drafts.
                    in_array($type, [MenuItemType::Solution, MenuItemType::Service], true),
                    fn ($q) => $q->where('status', PublishStatus::Published),
                )
                ->when(
                    // `show_in_menu` is the existing answer to "is this in the
                    // navigation", and a rebuild that ignored it would put back
                    // everything an editor had already taken out.
                    in_array('show_in_menu', $model::make()->getFillable(), true),
                    fn ($q) => $q->where('show_in_menu', true),
                )
                ->orderBy('sort_order')
                ->get();

            $child = 0;

            foreach ($records as $record) {
                MenuItem::create([
                    'menu_id' => $menu->id,
                    'parent_id' => $parent->id,
                    'sort_order' => $child++,
                    'label' => $record->{$column},
                    'type' => $type,
                    'target_type' => $type->value,
                    'target_id' => $record->id,
                    'is_active' => true,
                ]);
            }
        }

        // The three that are a plain link, in the order the header has them.
        foreach ([['Store', 'store'], ['Support', 'support'], ['Resources', 'resources']] as [$label, $key]) {
            self::section($menu, $label, $key, $order++);
        }

        return [];
    }

    /** @return array<int, string> */
    private static function footer(Menu $menu): array
    {
        $order = 0;
        $warnings = [];

        /*
         * A column heading with no link of its own.
         *
         * The footer renders a heading as plain text when it has no URL and as
         * a link when it has one, so a custom item with no URL is how a
         * non-clickable heading is expressed. It is the one place a custom item
         * is used here, and it carries no address to rot.
         */
        $column = function (string $heading) use ($menu, &$order): MenuItem {
            return MenuItem::create([
                'menu_id' => $menu->id,
                'parent_id' => null,
                'sort_order' => $order++,
                'label' => $heading,
                'type' => MenuItemType::Custom,
                'url' => null,
                'is_active' => true,
            ]);
        };

        // Solutions, products and web services: the generated columns, frozen
        // into a list. Seven each, which is what the built-in footer slices to.
        foreach ([
            ['Solutions', Solution::class, MenuItemType::Solution, 'title', 7],
            ['Products', ProductCategory::class, MenuItemType::ProductCategory, 'name', 7],
            ['Web services', Service::class, MenuItemType::Service, 'title', null],
        ] as [$heading, $model, $type, $col, $limit]) {
            $parent = $column($heading);

            $records = $model::query()
                ->when(
                    in_array($type, [MenuItemType::Solution, MenuItemType::Service], true),
                    fn ($q) => $q->where('status', PublishStatus::Published),
                )
                ->orderBy('sort_order')
                ->when($limit !== null, fn ($q) => $q->limit($limit))
                ->get();

            $i = 0;

            foreach ($records as $record) {
                MenuItem::create([
                    'menu_id' => $menu->id,
                    'parent_id' => $parent->id,
                    'sort_order' => $i++,
                    'label' => $record->{$col},
                    'type' => $type,
                    'target_type' => $type->value,
                    'target_id' => $record->id,
                    'is_active' => true,
                ]);
            }
        }

        $warnings = array_merge($warnings, self::children($menu, $column('Support'), [
            ['Customer login', 'section', 'portal_login'],
            ['Submit a ticket', 'section', 'portal_new_ticket'],
            ['Track a ticket', 'section', 'portal_tickets'],
            ['Knowledge base', 'section', 'knowledge_base'],
            // A CMS page, so it points at the record and follows a slug change.
            ['Downloads', 'page', 'downloads'],
            ['Contact', 'section', 'contact'],
        ]));

        $warnings = array_merge($warnings, self::children($menu, $column('Company'), [
            ['About us', 'section', 'about'],
            ['Blog', 'section', 'blog'],
            ['Gallery', 'page', 'gallery'],
            ['Careers', 'section', 'careers'],
            ['Contact', 'section', 'contact'],
        ]));

        return $warnings;
    }

    /**
     * The top bar: the three links in the dark strip above the header.
     *
     * The strip also carries the telephone number, the address and the search
     * field, and **none of those is here**. They are chrome rather than
     * navigation: the phone and email come from settings and a search field is
     * a form, so a menu that owned them would be a menu that could delete the
     * only search on the site. Same division `getPrimaryNav` already makes,
     * where an assigned menu replaces the links and leaves the consultation
     * button and the menu toggle alone.
     *
     * All three are sections rather than custom links, so `/knowledge-base`
     * moving is one line in `SiteSection` rather than three rows nobody
     * associates with it.
     *
     * @return array<int, string>
     */
    private static function topBar(Menu $menu): array
    {
        return self::children($menu, null, [
            ['Knowledge base', 'section', 'knowledge_base'],
            ['Track a ticket', 'section', 'portal_tickets'],
            ['Customer login', 'section', 'portal_login'],
        ]);
    }

    /**
     * The footer's bottom row: the policy links beside the copyright line.
     *
     * Privacy and Terms are **CMS pages**, so they point at the record and
     * follow a slug change — the rule the footer's Downloads link already
     * follows, and the reason a menu item stores a reference rather than a
     * URL. They are also the two pages on this site most likely to be renamed,
     * since both currently hold placeholder copy awaiting a legal review.
     *
     * The sitemap is the one custom link, because it is not a record and not a
     * page — it is a route handler emitting XML, so there is nothing to point
     * at. It carries no slug to rot either, which is what makes a custom link
     * the right answer rather than a shortcut.
     *
     * @return array<int, string>
     */
    private static function bottomBar(Menu $menu): array
    {
        $warnings = self::children($menu, null, [
            ['Privacy', 'page', 'privacy'],
            ['Terms', 'page', 'terms'],
        ]);

        MenuItem::create([
            'menu_id' => $menu->id,
            'parent_id' => null,
            // After whatever the two pages produced: a missing page is left
            // out, so counting the rows written is the only correct order —
            // hardcoding 2 would collide when one of them is absent.
            'sort_order' => $menu->items()->whereNull('parent_id')->count(),
            'label' => 'Sitemap',
            'type' => MenuItemType::Custom,
            'url' => '/sitemap.xml',
            'is_active' => true,
        ]);

        return $warnings;
    }

    private static function section(Menu $menu, string $label, string $key, int $order, ?int $parent = null): MenuItem
    {
        return MenuItem::create([
            'menu_id' => $menu->id,
            'parent_id' => $parent,
            'sort_order' => $order,
            'label' => $label,
            'type' => MenuItemType::Section,
            'target_key' => $key,
            'is_active' => true,
        ]);
    }

    /**
     * Write a list of rows, under a parent or at the root.
     *
     * `$parent` is nullable so the two flat bars reuse this rather than
     * carrying a near-copy of it: a top-bar link and a footer-column link are
     * the same row differing only in what sits above them.
     *
     * @param  array<int, array{0: string, 1: string, 2: string}>  $rows
     * @return array<int, string>
     */
    private static function children(Menu $menu, ?MenuItem $parent, array $rows): array
    {
        $i = 0;
        $warnings = [];

        foreach ($rows as [$label, $kind, $key]) {
            if ($kind === 'section') {
                self::section($menu, $label, $key, $i++, $parent?->id);

                continue;
            }

            $page = Page::where('slug', $key)->first();

            if (! $page) {
                /*
                 * Reported rather than skipped quietly: a footer short of a
                 * link is exactly the kind of thing nobody notices, and the
                 * page may simply not have been created on this install.
                 */
                $warnings[] = "No CMS page with the slug “{$key}”, so “{$label}” was left out.";

                continue;
            }

            MenuItem::create([
                'menu_id' => $menu->id,
                'parent_id' => $parent?->id,
                'sort_order' => $i++,
                'label' => $label,
                'type' => MenuItemType::Page,
                'target_type' => MenuItemType::Page->value,
                'target_id' => $page->id,
                'is_active' => true,
            ]);
        }

        return $warnings;
    }
}
