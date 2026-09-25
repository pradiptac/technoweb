<?php

namespace App\Models;

use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One thing on a wishlist: a pointer at a product (and, optionally, one of
 * its variations), the price it had when it was saved, and the stamps the
 * two notices read. Like a basket line it is a pointer, never a snapshot —
 * the list shows what the thing costs *now*.
 */
class WishlistItem extends Model
{
    protected $fillable = [
        'wishlist_id', 'store_product_id', 'store_product_variation_id', 'price_at_save',
        'awaiting_stock_at', 'back_in_stock_notified_at', 'price_drop_notified_at', 'price_drop_notified_paise',
    ];

    protected function casts(): array
    {
        return [
            'price_at_save' => 'integer',
            'price_drop_notified_paise' => 'integer',
            'awaiting_stock_at' => 'immutable_datetime',
            'back_in_stock_notified_at' => 'immutable_datetime',
            'price_drop_notified_at' => 'immutable_datetime',
        ];
    }

    protected static function booted(): void
    {
        // The unique index reads this rather than the nullable id — see the
        // migration. Written here so no caller can get it wrong.
        static::saving(function (self $row) {
            $row->variation_key = (int) ($row->store_product_variation_id ?? 0);
        });
    }

    /** @return BelongsTo<Wishlist, $this> */
    public function wishlist(): BelongsTo
    {
        return $this->belongsTo(Wishlist::class);
    }

    /** @return BelongsTo<StoreProduct, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(StoreProduct::class, 'store_product_id');
    }

    /** @return BelongsTo<StoreProductVariation, $this> */
    public function variation(): BelongsTo
    {
        return $this->belongsTo(StoreProductVariation::class, 'store_product_variation_id');
    }

    /** The price today: the variation's own when it has one, the product's otherwise. */
    public function currentPricePaise(): int
    {
        return (int) ($this->variation->price_paise ?? $this->product->price_paise ?? 0);
    }

    /**
     * Whether the thing saved can be bought right now.
     *
     * The variation's shelf when one was chosen, the product's otherwise —
     * which for a product with variations is "any active one", the answer
     * `StoreProduct::inStock()` already gives. A draft is not buyable
     * whatever its shelf says.
     */
    public function buyable(): bool
    {
        $product = $this->product;

        if ($product === null || $product->status !== PublishStatus::Published) {
            return false;
        }

        if ($this->variation !== null) {
            $this->variation->setRelation('product', $product);

            return $this->variation->inStock();
        }

        return $product->inStock();
    }
}
