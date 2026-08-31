<?php

namespace App\Models;

use App\Casts\SpecSheet;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One buyable configuration of a store product.
 *
 * See the migration for why this is a flat list rather than a matrix. Two
 * things worth knowing from here.
 *
 * **`options` goes through `SpecSheet`**, the ordered-pairs cast, because MySQL
 * normalises JSON *object* keys by length and then alphabetically — so "RAM"
 * and "Storage" come back in an order nobody chose and the selectors on the
 * product page reorder themselves between two loads.
 *
 * **A null `price_paise` means the product's price.** A variation costing the
 * same as its parent must not be a second copy of a number that then has to be
 * changed in two places, one of which will be missed.
 */
class StoreProductVariation extends Model
{
    protected $fillable = [
        'store_product_id', 'name', 'sku', 'options', 'price_paise',
        'stock', 'weight_grams', 'image_path', 'is_active', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'options' => SpecSheet::class,
            'price_paise' => 'integer',
            'stock' => 'integer',
            'weight_grams' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(StoreProduct::class, 'store_product_id');
    }

    /**
     * The price actually charged: this variation's, or the product's.
     *
     * Not "null when the parent is not loaded". This method decides what a
     * variation *costs*, and a price that silently comes back null depending on
     * how the caller happened to load the row is a landmine pointed at a
     * checkout. A query builder is not a lazy load, so `preventLazyLoading` is
     * satisfied and the answer is always right; every caller eager-loads or
     * sets the relation, so the query is the path nothing takes.
     */
    public function pricePaise(): ?int
    {
        return $this->price_paise ?? $this->parent()?->price_paise;
    }

    public function inStock(): bool
    {
        return $this->is_active && ($this->parent()?->track_stock === false || $this->stock > 0);
    }

    private function parent(): ?StoreProduct
    {
        return $this->relationLoaded('product') ? $this->product : $this->product()->first();
    }
}
