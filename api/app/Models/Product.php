<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use HasFactory, HasSeo, SoftDeletes, Sluggable;

    protected $fillable = [
        'brand_id', 'product_category_id', 'name', 'slug', 'sku',
        'short_description', 'description', 'specifications', 'features',
        'images', 'datasheet_path', 'status', 'is_featured', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'specifications' => 'array',
            'features' => 'array',
            'images' => 'array',
            'status' => PublishStatus::class,
            'is_featured' => 'boolean',
        ];
    }

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/products';
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'product_category_id');
    }

    public function solutions(): BelongsToMany
    {
        return $this->belongsToMany(Solution::class);
    }

    public function relatedProducts(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'product_related', 'product_id', 'related_product_id');
    }

    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }

    public function defaultSeo(): array
    {
        $brand = $this->brand?->name;

        return [
            'title' => trim(($brand ? "$brand " : '').$this->name).($this->sku ? " ({$this->sku})" : ''),
            'description' => str($this->short_description ?? $this->description ?? '')
                ->stripTags()->squish()->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/products/'.$this->slug,
            'og_image' => is_array($this->images) && $this->images ? asset('storage/'.$this->images[0]) : null,
            'schema_type' => 'Product',
        ];
    }
}
