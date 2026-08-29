<?php

namespace App\Support;

use App\Models\Menu;
use App\Models\MenuItem;

/**
 * A menu, flattened into what the frontend renders.
 *
 * Every URL is resolved **here, at read time**, from the record the item points
 * at — so a slug edited anywhere in the console moves the navigation with it.
 * Storing the address instead would put a 404 in the header of every page on
 * the site the first time somebody fixed a typo, which is precisely the failure
 * `RepathsLandingPages` exists to prevent for a much smaller surface.
 */
class MenuTree
{
    /**
     * Build the tree for a location, or null when nothing is assigned.
     *
     * Null rather than an empty array, deliberately: "no menu is configured"
     * and "a menu is configured and empty" are different answers, and the
     * frontend falls back to its built-in navigation only for the first.
     * An empty array would blank the header of a site that had simply not
     * finished setting one up.
     */
    public static function forLocation(string $location): ?array
    {
        $menu = Menu::where('location', $location)
            ->with(['roots.target', 'roots.children.target'])
            ->first();

        if ($menu === null) {
            return null;
        }

        return self::level($menu->roots);
    }

    /** @param iterable<MenuItem> $items */
    private static function level(iterable $items): array
    {
        $out = [];

        foreach ($items as $item) {
            if (! $item->is_active) {
                continue;
            }

            $url = $item->resolveUrl();

            /*
             * An item whose destination has gone is dropped, not rendered dead.
             *
             * `resolveUrl()` returns null when the record was deleted or lost
             * its slug. Emitting the item anyway would put a link to
             * `/solutions/` — or worse, to `undefined` — in the site header;
             * emitting it without an href would put an inert word in a
             * navigation bar, which reads as a broken page rather than as a
             * missing entry. Its children go with it, because they were
             * reachable only underneath it.
             */
            if ($url === null) {
                continue;
            }

            $out[] = [
                'label' => $item->label,
                'href' => $url,
                'icon' => $item->icon,
                'summary' => $item->description,
                'new_tab' => $item->open_in_new_tab,
                'children' => $item->relationLoaded('children') ? self::level($item->children) : [],
            ];
        }

        return $out;
    }
}
