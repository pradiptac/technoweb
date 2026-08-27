<?php

namespace App\Models;

use App\Models\Concerns\HasSeo;
use App\Models\Concerns\RepathsLandingPages;
use App\Models\Concerns\Sluggable;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductCategory extends Model
{
    use HasSeo, RepathsLandingPages, Sluggable;

    protected $fillable = ['parent_id', 'name', 'slug', 'description', 'icon', 'sort_order', 'show_in_menu'];

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/products';
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    /**
     * Ids of every category beneath this one, at any depth.
     *
     * Iterative and query-based rather than a recursive walk over ->children:
     * preventLazyLoading is on outside production, so touching the relation
     * per level would throw. The visited check also means a cycle already
     * present in the data cannot spin this forever.
     *
     * Used to stop an editor reparenting a category under its own descendant,
     * which would detach that whole branch from the tree.
     */
    public function descendantIds(): array
    {
        $found = [];
        $frontier = [$this->id];

        while ($frontier !== []) {
            $next = static::whereIn('parent_id', $frontier)
                ->pluck('id')
                ->reject(fn ($id) => in_array($id, $found, true))
                ->all();

            if ($next === []) {
                break;
            }

            $found = array_merge($found, $next);
            $frontier = $next;
        }

        return $found;
    }

    public function defaultSeo(): array
    {
        return [
            // Bare name: the frontend's root layout applies the
            // "%s | Technoware" template, so appending the brand here would
            // render "Switches — Technoware | Technoware". Every other model's
            // defaultSeo() returns an unbranded title for the same reason.
            'title' => $this->name,
            'description' => str(HtmlSanitiser::toText($this->description ?? ''))->limit(155)->value()
                ?: "Browse {$this->name} supplied, deployed and supported by Technoware engineers.",
            'canonical_url' => config('app.frontend_url').'/products/'.$this->slug,
            'og_image' => null,
            'schema_type' => 'CollectionPage',
        ];
    }

    /** Renaming this moves every landing page composed from it. See the trait. */
    public static function landingPageKeyColumn(): string
    {
        return 'product_category_id';
    }
}
