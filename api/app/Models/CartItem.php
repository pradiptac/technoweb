<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A line in a basket: a pointer at something for sale, and a quantity.
 *
 * Deliberately not a snapshot. An *order* item keeps its own copy of the name
 * and the price, because it records what was sold; a cart line is a thing
 * somebody intends to buy, and it should reflect what that thing costs now.
 */
class CartItem extends Model
{
    protected $fillable = ['cart_id', 'store_product_id', 'store_product_variation_id', 'quantity'];

    protected function casts(): array
    {
        return ['quantity' => 'integer'];
    }

    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(StoreProduct::class, 'store_product_id');
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(StoreProductVariation::class, 'store_product_variation_id');
    }

    /** What one of these costs right now: the variation's price, or the product's. */
    public function unitPricePaise(): int
    {
        return (int) ($this->variation?->price_paise ?? $this->product?->price_paise ?? 0);
    }

    /**
     * How many can actually be had.
     *
     * Null means "as many as you like" — an untracked product, which is the
     * right answer for a service. A variation answers for itself; the product's
     * own counter is not consulted once there is one, because the variation is
     * the thing with a shelf.
     */
    public function availableQuantity(): ?int
    {
        if ($this->product === null || ! $this->product->track_stock) {
            return null;
        }

        // Null here too for a back-ordered line: the basket's warning exists to
        // say "you cannot have this many", and for one the shop will back-order
        // that is not true. Saying it anyway would warn somebody off a purchase
        // the checkout is about to accept.
        if ($this->product->allowsOversell($this->variation)) {
            return null;
        }

        return $this->variation !== null ? $this->variation->stock : $this->product->stock;
    }
}
