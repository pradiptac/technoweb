<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A word on the shop front: a coloured pill under the search bar, and a filter.
 *
 * Not `Sluggable`: the slug is not a page's address (no 301 follows a rename)
 * and is how two spellings become one tag — see `App\Support\Store\Tags`,
 * which owns every write. The colour is not stored; it is a hash of the slug
 * on the website (`lib/tag-colour.ts`), so a tag is the same colour on every
 * page and every visit.
 */
class StoreTag extends Model
{
    protected $fillable = ['name', 'slug', 'is_visible', 'sort_order'];

    protected function casts(): array
    {
        return [
            'is_visible' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** @return BelongsToMany<StoreProduct, $this> */
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(StoreProduct::class, 'store_product_tag');
    }

    /** @param  Builder<StoreTag>  $query */
    public function scopeVisible(Builder $query): void
    {
        $query->where('is_visible', true);
    }
}
