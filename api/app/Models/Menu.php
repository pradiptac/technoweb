<?php

namespace App\Models;

use App\Enums\MenuLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

/**
 * A named menu, optionally assigned to a place in the layout.
 *
 * A menu with no location renders nowhere and that is a legitimate state — one
 * being built, or held aside for a seasonal swap. The location column is
 * unique so two menus can never both claim the header.
 */
class Menu extends Model
{
    protected $fillable = ['name', 'location'];

    protected function casts(): array
    {
        return ['location' => MenuLocation::class];
    }

    public function items(): HasMany
    {
        return $this->hasMany(MenuItem::class);
    }

    /**
     * Only the roots, each with its subtree ordered.
     *
     * The ordering ends on `id` for the reason the media library's does:
     * items created in one request share a `sort_order` until they are dragged,
     * and MySQL may order equal rows differently between two queries — which
     * in a menu means the links quietly swap places between page loads.
     */
    public function roots(): HasMany
    {
        return $this->items()
            ->whereNull('parent_id')
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    /**
     * The whole tree, to whatever depth it goes, in **one** query.
     *
     * A menu nests without limit now, and `->with('roots.children.target')`
     * cannot express that: each level is another clause written by hand, so a
     * fixed chain is a fixed ceiling — the same ceiling in a different file.
     * Adding levels speculatively would be worse, since every unused one is a
     * query against a table that mostly has nothing at that depth.
     *
     * So every item is fetched at once and the parents are joined up in PHP.
     * One query for a menu of any shape, `target` eager-loaded alongside
     * because `preventLazyLoading` is on and `resolveUrl()` touches it.
     *
     * The `children` relation is **set** rather than queried, which is what
     * lets `MenuTree` and `MenuItemResource` recurse through `whenLoaded` and
     * `relationLoaded` exactly as they did when the depth was two.
     *
     * @return Collection<int, MenuItem>
     */
    public function tree(): Collection
    {
        $items = $this->items()
            ->with('target')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $byParent = $items->groupBy('parent_id');

        foreach ($items as $item) {
            /*
             * Keyed on the id as a string.
             *
             * `groupBy` on an integer column gives integer keys here and string
             * keys elsewhere depending on the driver, and a miss is silent: the
             * item simply renders with no children, which looks exactly like a
             * menu that has none. Casting both sides removes the question.
             */
            $item->setRelation('children', $byParent->get((string) $item->id, collect())->values());
        }

        return $items->whereNull('parent_id')->values();
    }
}
