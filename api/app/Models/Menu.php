<?php

namespace App\Models;

use App\Enums\MenuLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
}
