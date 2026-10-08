<?php

namespace App\Models;

use App\Casts\SpecSheet;
use App\Enums\ProductAvailability;
use App\Enums\PublishStatus;
use App\Models\Concerns\HasAnswerBlocks;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Models\Contracts\Answerable;
use App\Models\Contracts\Faqable;
use App\Support\HtmlSanitiser;
use App\Support\MediaUrl;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model implements Answerable, Faqable
{
    use HasAnswerBlocks, HasCustomFields, HasFactory, HasSeo, Sluggable, SoftDeletes;

    protected $fillable = [
        'brand_id', 'product_category_id', 'name', 'slug', 'sku',
        'short_description', 'description', 'specifications', 'features',
        'images', 'datasheet_path', 'status', 'is_featured', 'availability', 'sort_order',
        'body_layout', 'blocks',
    ];

    /** In memory as in the column: a new record's page draws its written body. */
    protected $attributes = ['body_layout' => 'body'];

    protected function casts(): array
    {
        return [
            // Not a plain array cast: MySQL JSON does not preserve object
            // key order, so the sheet is stored as an ordered list of pairs.
            'specifications' => SpecSheet::class,
            'features' => 'array',
            'images' => 'array',
            'status' => PublishStatus::class,
            'availability' => ProductAvailability::class,
            'is_featured' => 'boolean',
            'blocks' => 'array',
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

    /** @return BelongsTo<Brand, $this> */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    /** @return BelongsTo<ProductCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'product_category_id');
    }

    /** @return BelongsToMany<Solution, $this> */
    public function solutions(): BelongsToMany
    {
        return $this->belongsToMany(Solution::class);
    }

    /** @return BelongsToMany<self, $this> */
    public function relatedProducts(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'product_related', 'product_id', 'related_product_id');
    }

    /**
     * The files of the downloads centre attached to this product
     * (0.131.0, docs/downloads.md).
     *
     * @return MorphToMany<Download, $this>
     */
    public function downloads(): MorphToMany
    {
        return $this->morphToMany(Download::class, 'downloadable');
    }

    /**
     * The ones a visitor may be shown, in the order the centre lists them
     * within a shelf. What the product page loads.
     *
     * @return MorphToMany<Download, $this>
     */
    public function publishedDownloads(): MorphToMany
    {
        return $this->downloads()->published()
            ->orderBy('downloads.sort_order')
            ->orderByDesc('downloads.released_on')
            ->orderBy('downloads.title');
    }

    /** @return MorphMany<Faq, $this> */
    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }

    public function defaultSeo(): array
    {
        $brand = $this->brand?->name;

        return [
            'title' => trim(($brand ? "$brand " : '').$this->name).($this->sku ? " ({$this->sku})" : ''),
            'description' => str(HtmlSanitiser::toText($this->short_description ?? $this->description ?? ''))
                ->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/products/'.$this->slug,
            'og_image' => is_array($this->images) && $this->images ? MediaUrl::for($this->images[0]) : null,
            'schema_type' => 'Product',
        ];
    }
}
