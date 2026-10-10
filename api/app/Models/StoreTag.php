<?php

namespace App\Models;

use App\Models\Concerns\HasSeo;
use App\Support\HtmlSanitiser;
use App\Support\Mail\MailBrand;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A word on the shop front: a coloured pill under the search bar, and a filter.
 *
 * Not `Sluggable`: the slug is how two spellings become one tag (see
 * `App\Support\Store\Tags`, which owns every write), so it is never derived
 * from the name here. Since 0.157.0 it is also a page's address,
 * `/store/tags/{slug}`, and `Admin\Store\TagController` writes the 301 when a
 * rename or a merge moves it, as `Sluggable` does for the other models.
 *
 * The colour is not stored; it is a hash of the slug
 * on the website (`lib/tag-colour.ts`), so a tag is the same colour on every
 * page and every visit.
 */
class StoreTag extends Model
{
    use HasSeo;

    /** A tag page with fewer published products than this is `noindex` and out of the sitemap. */
    public const MIN_INDEXABLE = 3;

    protected $fillable = ['name', 'slug', 'heading', 'intro', 'is_visible', 'sort_order'];

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

    public function urlPrefix(): string
    {
        return '/store/tags';
    }

    public function publicPath(): string
    {
        return $this->urlPrefix().'/'.$this->slug;
    }

    public function adminPath(): string
    {
        return '/admin/store/tags/'.$this->id;
    }

    public function defaultSeo(): array
    {
        return [
            'title' => $this->heading ?: $this->name,
            'description' => str(HtmlSanitiser::toText($this->intro ?? ''))->limit(155)->value()
                ?: "Shop {$this->name} products in the ".MailBrand::name().' shop.',
            'canonical_url' => rtrim((string) config('app.frontend_url'), '/').$this->publicPath(),
            'og_image' => null,
            'schema_type' => 'CollectionPage',
        ];
    }
}
