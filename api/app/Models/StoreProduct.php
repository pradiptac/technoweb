<?php

namespace App\Models;

use App\Casts\SpecSheet;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Something the store sells.
 *
 * Deliberately not `Product`. See the migration: what the store sells is
 * maintained separately from what the site advertises, because the catalogue
 * exists to be found by somebody researching a project and most of it is quoted
 * per site rather than bought from a page.
 *
 * It reuses `Brand` — a manufacturer is a fact, not an editorial decision — and
 * has its own categories, because how a listing is arranged is precisely the
 * thing being maintained separately.
 */
class StoreProduct extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = [
        'store_category_id', 'brand_id', 'name', 'slug', 'sku', 'type',
        'short_description', 'description', 'images', 'specifications', 'features',
        'activation_procedure', 'activation_pdf_path',
        'price_paise', 'compare_at_paise', 'track_stock', 'stock', 'returnable',
        'status', 'is_featured', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            // Not a plain array cast: MySQL JSON does not preserve object key
            // order, so the sheet is stored as an ordered list of pairs.
            'specifications' => SpecSheet::class,
            'features' => 'array',
            'images' => 'array',
            'type' => ProductType::class,
            'status' => PublishStatus::class,
            'price_paise' => 'integer',
            'compare_at_paise' => 'integer',
            'track_stock' => 'boolean',
            'stock' => 'integer',
            'returnable' => 'boolean',
            'is_featured' => 'boolean',
        ];
    }

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/store/products';
    }

    /**
     * Products that cannot be sold right now.
     *
     * The query half of `inStock()`, and it has to agree with it — a product
     * with variations answers for the **set**, so its own counter is not the
     * answer and a plain `stock <= 0` reports a 48-port switch as unavailable
     * because the 24-port ran out.
     *
     * It exists because the dashboard counts these and then links to the list
     * that shows them. Two spellings of one rule is a tile reading "3 out of
     * stock" that opens a list of five, which is worse than not linking at all.
     */
    public function scopeOutOfStock(Builder $query): Builder
    {
        return $query->where('track_stock', true)->where(function (Builder $q) {
            $q->where(fn (Builder $q) => $q->whereDoesntHave('variations')->where('stock', '<=', 0))
                ->orWhere(fn (Builder $q) => $q
                    ->whereHas('variations')
                    ->whereDoesntHave('variations', fn (Builder $v) => $v->where('is_active', true)->where('stock', '>', 0)));
        });
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(StoreCategory::class, 'store_category_id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function variations(): HasMany
    {
        return $this->hasMany(StoreProductVariation::class)->orderBy('sort_order')->orderBy('id');
    }

    /**
     * The activation codes held for this product.
     *
     * Only meaningful for a digital one. Left as a plain relation rather than
     * guarded by type, because "a physical product with codes" is a data
     * mistake somebody should be able to *see* rather than one the model hides.
     */
    public function digitalCodes(): HasMany
    {
        return $this->hasMany(DigitalCode::class);
    }

    /**
     * Whether there is anything to sell right now.
     *
     * A product with variations answers for the **set**: it is in stock while
     * any active variation is, because that is what the buyer experiences — the
     * 24-port being gone does not make the 48-port unavailable. The product's
     * own counter is not consulted in that case; the variation is the thing
     * with a shelf.
     *
     * The loaded relation when there is one, a query when there is not. Reading
     * `$this->variations` unloaded is a lazy load, which throws outside
     * production — and quietly answering from `$this->stock` instead would be
     * worse than throwing: the same product would report "in stock" on a page
     * that eager-loads and "out of stock" on one that does not, which is a bug
     * nobody would think to look for in a getter.
     */
    public function inStock(): bool
    {
        if (! $this->track_stock) {
            return true;
        }

        $variations = $this->relationLoaded('variations')
            ? $this->variations
            : $this->variations()->get();

        if ($variations->isNotEmpty()) {
            return $variations->contains(fn (StoreProductVariation $v) => $v->is_active && $v->stock > 0);
        }

        return $this->stock > 0;
    }

    /** @return array<string, ?string> */
    public function defaultSeo(): array
    {
        return [
            'title' => $this->name,
            // `toText`, never `strip_tags`: that deletes a tag without leaving
            // anything in its place, so the end of one block runs into the
            // start of the next and a meta description reads "…asked for.Remote
            // supportWhen an engineer…".
            'description' => $this->short_description
                ?: mb_substr(HtmlSanitiser::toText($this->description ?? ''), 0, 160),
            'canonical_url' => rtrim((string) config('app.frontend_url'), '/').'/store/products/'.$this->slug,
            'og_image' => filled($this->images) ? asset('storage/'.$this->images[0]) : null,
        ];
    }
}
