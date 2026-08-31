<?php

namespace App\Models;

use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * How the store's own listing is arranged.
 *
 * Separate from `ProductCategory` on purpose, and it is the one piece of the
 * split that looks like duplication and is not: the catalogue's taxonomy is
 * built for somebody researching a project ("Enterprise Networking"), and a
 * shop's is built for somebody buying ("Switches under ₹20,000"). Sharing them
 * means every change to one is a decision about the other.
 *
 * Flat rather than a tree. `ProductCategory` nests because the catalogue has
 * three levels of hardware taxonomy; a shop with a few dozen lines does not,
 * and a tree nobody uses is a parent selector on every form for ever.
 */
class StoreCategory extends Model
{
    use Sluggable;

    protected $fillable = ['name', 'slug', 'description', 'image_path', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/store/categories';
    }

    public function products(): HasMany
    {
        return $this->hasMany(StoreProduct::class);
    }
}
