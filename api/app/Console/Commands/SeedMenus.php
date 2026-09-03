<?php

namespace App\Console\Commands;

use App\Enums\MenuLocation;
use App\Models\Menu;
use App\Models\Page;
use App\Models\Solution;
use App\Support\DefaultMenu;
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
        /*
         * The names come from the enum rather than a literal pair.
         *
         * This read `['Primary navigation', 'Footer navigation']` in three
         * places, so adding a location would have left the new menus outside
         * the existence check and outside `--force` — the command would have
         * created a second top bar on every run and reported success.
         */
        $names = array_map(fn (MenuLocation $c) => $c->defaultName(), MenuLocation::cases());

        $existing = Menu::whereIn('name', $names)->count();

        if ($existing > 0 && ! $this->option('force')) {
            $this->warn('Those menus already exist. Re-run with --force to rebuild them, which discards any edits.');

            return self::FAILURE;
        }

        if ($this->option('force')) {
            Menu::whereIn('name', $names)->each(function (Menu $menu) {
                // One at a time through the model, not a mass delete: the
                // items cascade on the foreign key, and a mass delete would
                // skip any model event the menu ever gains.
                $menu->items()->delete();
                $menu->delete();
            });
        }

        /*
         * Built by `DefaultMenu`, which the console's Rebuild button also
         * calls. This command used to own the definition, which was fine while
         * it was the only caller — a second copy behind a button is exactly the
         * drift that gave the newsletter two definitions of "delivered".
         */
        $made = [];

        foreach (MenuLocation::cases() as $case) {
            $menu = Menu::create(['name' => $case->defaultName(), 'location' => null]);

            foreach (DefaultMenu::rebuild($menu, $case->value) as $warning) {
                $this->warn('  '.$warning);
            }

            $made[] = [$case, $menu];
        }

        $this->newLine();

        foreach ($made as [$case, $menu]) {
            $this->info(str_pad($case->label().':', 20).$menu->items()->count().' items');
        }

        if ($this->option('assign')) {
            foreach ($made as [$case, $menu]) {
                $menu->update(['location' => $case]);
            }

            $this->newLine();
            $this->info('All four are live. The built-in navigation is no longer used.');
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
}
