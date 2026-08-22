<?php

namespace App\Models;

use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductCategory extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = ['parent_id', 'name', 'slug', 'description', 'icon', 'sort_order'];

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

    public function defaultSeo(): array
    {
        return [
            // Bare name: the frontend's root layout applies the
            // "%s | Technoware" template, so appending the brand here would
            // render "Switches — Technoware | Technoware". Every other model's
            // defaultSeo() returns an unbranded title for the same reason.
            'title' => $this->name,
            'description' => str($this->description ?? '')->stripTags()->limit(155)->value()
                ?: "Browse {$this->name} supplied, deployed and supported by Technoware engineers.",
            'canonical_url' => config('app.frontend_url').'/products/'.$this->slug,
            'og_image' => null,
            'schema_type' => 'CollectionPage',
        ];
    }
}
