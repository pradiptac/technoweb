<?php

namespace App\Models;

use App\Enums\MenuItemType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class MenuItem extends Model
{
    protected $fillable = [
        'menu_id', 'parent_id', 'sort_order', 'label', 'type',
        'target_type', 'target_id', 'url', 'icon', 'description',
        'open_in_new_tab', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'menu_id' => 'integer',
            'parent_id' => 'integer',
            'sort_order' => 'integer',
            'target_id' => 'integer',
            'type' => MenuItemType::class,
            'open_in_new_tab' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function menu(): BelongsTo
    {
        return $this->belongsTo(Menu::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    /** The record this points at. Null for a custom link. */
    public function target(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * Where this item goes, resolved now rather than stored.
     *
     * A custom link is the only one with a URL of its own. Everything else
     * asks the record, so a slug edited on another screen moves the menu with
     * it instead of leaving a 404 in the header of every page.
     *
     * Null means "this cannot be linked any more" — the record was deleted, or
     * has no slug. The renderer drops the item rather than emitting a link to
     * nowhere, which is the one thing worse than the item being missing.
     */
    public function resolveUrl(): ?string
    {
        if ($this->type === MenuItemType::Custom) {
            return blank($this->url) ? null : $this->url;
        }

        return $this->type->url($this->target);
    }

    /*
     * There is deliberately no `wouldCycle()` here, and that is worth saying
     * because the sibling tree — `Location` — needs one.
     *
     * A menu is written **wholesale**: the console submits the tree it drew,
     * and `MenuController::syncItems()` walks that nested array assigning
     * `parent_id` and `sort_order` from the structure itself. A nested array
     * cannot contain a cycle, so a loop here is not refused, it is
     * unrepresentable. Locations differ because they are edited one row at a
     * time by `parent_id`, which is exactly where a loop can be written.
     *
     * If a partial-update endpoint is ever added, the check comes back with it.
     */
}
