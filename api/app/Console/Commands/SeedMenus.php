<?php

namespace App\Console\Commands;

use App\Enums\MenuItemType;
use App\Enums\MenuLocation;
use App\Enums\PublishStatus;
use App\Models\Industry;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Models\Page;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;
use Illuminate\Console\Command;

/**
 * Build the navigation the site already renders, as editable menus.
 *
 * The menu module has been complete and unused since it shipped, and the
 * reason is the first screen: `/admin/menus` opens empty, and the moment a
 * menu is assigned to a location it **replaces** the built-in navigation
 * entirely. So taking editorial control meant hand-building about thirty items
 * correctly, in one sitting, with a sitewide header as the blast radius if you
 * got it wrong. Nobody does that voluntarily, which is why there are no menus.
 *
 * This removes the cliff. It writes what the site renders today — the same
 * links, the same order, the same groupings — so assigning it changes nothing
 * visible, and the editor's first act is a small edit rather than a rebuild.
 * That is what WordPress does, and it is the whole of why its menu screen is
 * usable.
 *
 * **Unassigned by default**, and `--assign` is opt-in. The same shape as
 * `technoware:landing-pages`, for the same reason: this touches every page on
 * the site, so going live is a decision somebody takes deliberately rather
 * than a side effect of running a command to see what it would do.
 *
 * ## What it cannot preserve
 *
 * Three footer columns are **generated** — solutions, product categories and
 * services are read from the catalogue on every render, so publishing a new
 * solution puts it in the footer with nothing else happening. A menu is a list
 * somebody wrote. Assign this and those columns stop tracking the catalogue:
 * renaming a solution still follows, because a menu item stores a record
 * reference rather than a URL, but a *new* one will not appear.
 *
 * That is the real cost of editorial control and it is not a bug to be fixed
 * — it is the trade. The command says so on the way past rather than leaving
 * somebody to notice in three months that the footer has stopped growing.
 */
class SeedMenus extends Command
{
    protected $signature = 'technoware:seed-menus
                            {--assign : Put them live, replacing the built-in navigation}
                            {--force : Rebuild even if a menu of that name exists}';

    protected $description = 'Create Primary and Footer menus matching the navigation the site renders today';

    public function handle(): int
    {
        $existing = Menu::whereIn('name', ['Primary navigation', 'Footer navigation'])->count();

        if ($existing > 0 && ! $this->option('force')) {
            $this->warn('Those menus already exist. Re-run with --force to rebuild them, which discards any edits.');

            return self::FAILURE;
        }

        if ($this->option('force')) {
            Menu::whereIn('name', ['Primary navigation', 'Footer navigation'])->each(function (Menu $menu) {
                // One at a time through the model, not a mass delete: the
                // items cascade on the foreign key, and a mass delete would
                // skip any model event the menu ever gains.
                $menu->items()->delete();
                $menu->delete();
            });
        }

        $primary = $this->buildPrimary();
        $footer = $this->buildFooter();

        $this->newLine();
        $this->info("Primary navigation: {$primary->items()->count()} items");
        $this->info("Footer navigation:  {$footer->items()->count()} items");

        if ($this->option('assign')) {
            $primary->update(['location' => MenuLocation::Primary]);
            $footer->update(['location' => MenuLocation::Footer]);

            $this->newLine();
            $this->info('Both are live. The built-in navigation is no longer used.');
            $this->line('The footer\'s Solutions, Products and Web services columns are now a written');
            $this->line('list rather than a generated one: renaming a record still follows it, but a');
            $this->line('newly published one will not appear until somebody adds it.');
        } else {
            $this->newLine();
            $this->line('Nothing is live. Assign them at /admin/menus, or re-run with --assign.');
            $this->line('Until then the site renders the navigation built into it, unchanged.');
        }

        return self::SUCCESS;
    }

    private function buildPrimary(): Menu
    {
        $menu = Menu::create(['name' => 'Primary navigation', 'location' => null]);

        $order = 0;

        /*
         * The four that open a panel, each with its children.
         *
         * The parent is a section rather than a custom link, so "all
         * solutions" keeps working if that route ever moves. `getPrimaryNav`
         * turns any top-level item **with children** into a mega panel and uses
         * the parent as its "view all", which is exactly this shape.
         */
        foreach ([
            ['Solutions', 'solutions', Solution::class, MenuItemType::Solution, 'title'],
            ['Products', 'products', ProductCategory::class, MenuItemType::ProductCategory, 'name'],
            ['Web Services', 'services', Service::class, MenuItemType::Service, 'title'],
            ['Industries', 'industries', Industry::class, MenuItemType::Industry, 'name'],
        ] as [$label, $section, $model, $type, $column]) {
            $parent = $this->section($menu, $label, $section, $order++);

            $records = $model::query()
                ->when(
                    // Industries and categories have no status column -- they
                    // are reference data the catalogue points at, not
                    // something anybody drafts.
                    in_array($type, [MenuItemType::Solution, MenuItemType::Service], true),
                    fn ($q) => $q->where('status', PublishStatus::Published),
                )
                ->when(
                    // `show_in_menu` is the existing answer to "is this in the
                    // navigation", and a seeded menu that ignored it would put
                    // back everything an editor had already taken out.
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
            $this->section($menu, $label, $key, $order++);
        }

        return $menu;
    }

    private function buildFooter(): Menu
    {
        $menu = Menu::create(['name' => 'Footer navigation', 'location' => null]);

        $order = 0;

        /*
         * A column heading with no link of its own.
         *
         * The footer renders a heading as plain text when it has no URL and as
         * a link when it has one, so a custom item with no URL is how a
         * non-clickable heading is expressed. It is the one place a custom
         * item is used here, and it carries no address to rot.
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
        // into a list. Seven each, which is what `footerNav` slices to.
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

        $support = $column('Support');
        $this->children($menu, $support, [
            ['Customer login', 'section', 'portal_login'],
            ['Submit a ticket', 'section', 'portal_new_ticket'],
            ['Track a ticket', 'section', 'portal_tickets'],
            ['Knowledge base', 'section', 'knowledge_base'],
            // A CMS page, so it points at the record and follows a slug change.
            ['Downloads', 'page', 'downloads'],
            ['Contact', 'section', 'contact'],
        ]);

        $company = $column('Company');
        $this->children($menu, $company, [
            ['About us', 'section', 'about'],
            ['Blog', 'section', 'blog'],
            ['Gallery', 'page', 'gallery'],
            ['Careers', 'section', 'careers'],
            ['Contact', 'section', 'contact'],
        ]);

        return $menu;
    }

    private function section(Menu $menu, string $label, string $key, int $order, ?int $parent = null): MenuItem
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
     * @param  array<int, array{0: string, 1: string, 2: string}>  $rows
     */
    private function children(Menu $menu, MenuItem $parent, array $rows): void
    {
        $i = 0;

        foreach ($rows as [$label, $kind, $key]) {
            if ($kind === 'section') {
                $this->section($menu, $label, $key, $i++, $parent->id);

                continue;
            }

            $page = Page::where('slug', $key)->first();

            if (! $page) {
                // Said out loud rather than skipped quietly: a footer short of
                // a link is exactly the kind of thing nobody notices, and the
                // page may simply not have been created on this install.
                $this->warn("  No CMS page with slug '{$key}' — '{$label}' was left out.");

                continue;
            }

            MenuItem::create([
                'menu_id' => $menu->id,
                'parent_id' => $parent->id,
                'sort_order' => $i++,
                'label' => $label,
                'type' => MenuItemType::Page,
                'target_type' => MenuItemType::Page->value,
                'target_id' => $page->id,
                'is_active' => true,
            ]);
        }
    }
}
