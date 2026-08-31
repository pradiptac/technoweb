<?php

namespace App\Models;

use App\Casts\SpecSheet;
use App\Enums\ProductType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of what was sold — a snapshot, not a pointer.
 *
 * Everything a person needs to read this back in five years is on the row: the
 * name, the part number, the options, the price paid and whether it could be
 * returned. The product reference is kept for reporting and is `nullOnDelete`,
 * because deleting a product must not delete the record of having sold it.
 *
 * This is the opposite of `CartItem`, deliberately. A cart line is repriced on
 * every read because it is a thing somebody intends to buy; an order line is
 * frozen because it is a thing somebody bought.
 */
class OrderItem extends Model
{
    protected $fillable = [
        'order_id', 'store_product_id', 'store_product_variation_id',
        'name', 'variation_name', 'sku', 'options', 'type',
        'quantity', 'unit_price_paise', 'line_total_paise', 'returnable',
    ];

    protected function casts(): array
    {
        return [
            'options' => SpecSheet::class,
            'type' => ProductType::class,
            'quantity' => 'integer',
            'unit_price_paise' => 'integer',
            'line_total_paise' => 'integer',
            'returnable' => 'boolean',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(StoreProduct::class, 'store_product_id');
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(StoreProductVariation::class, 'store_product_variation_id');
    }
}
