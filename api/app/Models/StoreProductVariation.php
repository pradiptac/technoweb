<?php

namespace App\Models;

use App\Casts\SpecSheet;
use App\Jobs\SendWishlistPriceDrops;
use App\Support\Store\SpecIndex;
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
        'store_product_id', 'name', 'sku', 'gtin', 'mpn', 'options', 'price_paise',
        'stock', 'allow_oversell', 'weight_grams', 'image_path', 'is_active', 'sort_order',
    ];

    /** As on the product: an unsaved variation answers what a saved one would. */
    /**
     * Defaults that match the columns, so an unsaved variation answers what a
     * saved one would.
     *
     * `is_active` is here for the same reason as `allow_oversell`: it is
     * `default(true)` in the database and **null** on a model that has not been
     * read back, and `inStock()` opens with `$this->is_active &&` — so a
     * variation created and asked about in the same breath reported itself
     * unsellable. Nothing in the application does that, and a test did, which
     * is how it surfaced.
     */
    protected $attributes = ['allow_oversell' => false, 'is_active' => true];

    protected function casts(): array
    {
        return [
            'options' => SpecSheet::class,
            'price_paise' => 'integer',
            'stock' => 'integer',
            'allow_oversell' => 'boolean',
            'weight_grams' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    /**
     * A variation's own price changing may be a drop for whoever saved it
     * (2026-09-25). Any change, not only a fall: a variation going from "the
     * product's price" to a price of its own is a change in what it costs
     * that `price_paise` alone does not describe. The job measures.
     */
    protected static function booted(): void
    {
        static::updated(function (self $variation) {
            if ($variation->wasChanged('price_paise')) {
                SendWishlistPriceDrops::watch((int) $variation->store_product_id);
            }
        });

        /*
         * A product matches a spec filter when any active variation has the
         * value, so its options and its switch are part of the product's
         * index (2026-09-26). Queued after commit — see `SpecIndex::queue()`.
         */
        static::saved(function (self $variation) {
            if ($variation->wasRecentlyCreated || $variation->wasChanged(['options', 'is_active'])) {
                SpecIndex::queue((int) $variation->store_product_id);
            }
        });
        static::deleted(fn (self $variation) => SpecIndex::queue((int) $variation->store_product_id));
    }

    /** @return BelongsTo<StoreProduct, $this> */
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
        // A back-ordered row is sellable however empty its shelf — that is the
        // whole of what the switch means.
        return $this->is_active
            && ($this->parent()?->track_stock === false || $this->allow_oversell || $this->stock > 0);
    }

    private function parent(): ?StoreProduct
    {
        return $this->relationLoaded('product') ? $this->product : $this->product()->first();
    }
}
