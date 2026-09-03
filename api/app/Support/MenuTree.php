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
        $menu = Menu::where('location', $location)->first();

        if ($menu === null) {
            return null;
        }

        /*
         * `tree()` rather than a chain of eager loads.
         *
         * A menu nests without limit, and `roots.children.children…` is a
         * ceiling written as a query. One query, joined up in PHP, works for
         * any shape.
         */
        return self::level($menu->tree());
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
                /*
                 * Resolved from the record when the item does not override it,
                 * for the same reason the URL is.
                 *
                 * These two were read from the menu item's own columns alone,
                 * and nothing fills them: `technoware:seed-menus` writes a
                 * reference and a label, and an editor building a menu by hand
                 * is naming a navigation entry rather than re-describing a
                 * solution. So **assigning a menu silently stripped the icon and
                 * the summary from every item in the mega panel** — which is
                 * two of the three things it draws, leaving a plain list of
                 * links where the built-in navigation had shown an icon, a
                 * title and a line of description.
                 *
                 * An icon and a summary are facts about the *record*; the label
                 * is a decision about the *menu*. That is the whole of why the
                 * label is not resolved this way and these are.
                 *
                 * The item's own value still wins where it has one, so a menu
                 * can override either without the record changing.
                 */
                'icon' => $item->icon ?: self::fromTarget($item, ['icon']),
                'summary' => $item->description ?: self::fromTarget($item, ['summary', 'description', 'excerpt', 'short_description']),
                'new_tab' => $item->open_in_new_tab,
                'children' => $item->relationLoaded('children') ? self::level($item->children) : [],
            ];
        }

        return $out;
    }

    /**
     * The first of these attributes the item's target actually has.
     *
     * Read out of the loaded attributes rather than off the model, because the
     * targets are nine different classes and most lack most of these columns —
     * `Solution` has `summary`, `ProductCategory` has `description`, a blog post
     * has `excerpt`, and a `section` item has no target at all. Asking the
     * model directly would be a lazy-load away from throwing under
     * `preventLazyLoading`.
     *
     * `?:` rather than `??`: a record edited and left blank stores an empty
     * string, and falling through only on null would hand the menu an empty
     * summary that beats every later candidate. Same trap the newsletter's
     * footer address sprang.
     *
     * @param  array<int, string>  $candidates
     */
    private static function fromTarget(MenuItem $item, array $candidates): ?string
    {
        if (! $item->relationLoaded('target') || $item->target === null) {
            return null;
        }

        $attributes = $item->target->getAttributes();

        foreach ($candidates as $key) {
            $value = $attributes[$key] ?? null;

            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return null;
    }
}
