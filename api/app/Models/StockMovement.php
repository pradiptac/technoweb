<?php

namespace App\Models;

use App\Enums\StockMovementReason;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One change to one stock level.
 *
 * Append-only, like the activity log and for the same reason: a ledger its own
 * subject can edit is evidence of nothing. There is no update path and no
 * delete endpoint, and `$timestamps` is off on the `updated_at` half because
 * a row that is never edited has no second date to keep.
 *
 * @property int $delta
 */
class StockMovement extends Model
{
    /** A ledger row is written once. `created_at` is set explicitly. */
    public const UPDATED_AT = null;

    protected $fillable = [
        'store_product_id', 'store_product_variation_id',
        'product_name', 'variation_name', 'sku',
        'delta', 'balance_after', 'reason',
        'order_id', 'order_number', 'user_id', 'actor_name', 'note',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'delta' => 'integer',
            'balance_after' => 'integer',
            'reason' => StockMovementReason::class,
            'created_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(StoreProduct::class, 'store_product_id');
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(StoreProductVariation::class, 'store_product_variation_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** Stock that arrived. */
    public function scopeIncoming(Builder $query): Builder
    {
        return $query->where('delta', '>', 0);
    }

    /** Stock that left. */
    public function scopeOutgoing(Builder $query): Builder
    {
        return $query->where('delta', '<', 0);
    }
}
