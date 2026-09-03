<?php

namespace App\Models;

use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Support\HtmlSanitiser;
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
    use HasSeo, Sluggable;

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

    /**
     * `HasSeo`, added after the fact.
     *
     * The class comment above used to end the case for a flat model there --
     * flat is right, and it does not follow that the record has no page. It
     * does: `/store/categories/{slug}` is a real route with its own canonical,
     * carried in the sitemap since the store shipped. `Store\CategoryRequest`
     * said "a category description is a line under a heading, not a page",
     * which was the same claim in the same wrong place -- a category with
     * something published in it is a listing page indistinguishable in shape
     * from `ProductCategory`, which has carried `HasSeo` from the start.
     */
    public function defaultSeo(): array
    {
        return [
            'title' => $this->name,
            'description' => str(HtmlSanitiser::toText($this->description ?? ''))->limit(155)->value()
                ?: "Browse {$this->name} in the Technoware shop.",
            'canonical_url' => rtrim((string) config('app.frontend_url'), '/').'/store/categories/'.$this->slug,
            'og_image' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'schema_type' => 'CollectionPage',
        ];
    }
}
