<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a return: how many of one order line are coming back, how many
 * arrived, and how many of those went back on the shelf. The name and the
 * price are the order line's own — it is a snapshot, so they cannot move.
 */
class OrderReturnItem extends Model
{
    public $timestamps = false;

    protected $fillable = ['order_return_id', 'order_item_id', 'quantity', 'received_quantity', 'restocked_quantity'];

    protected $attributes = [
        'restocked_quantity' => 0,
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'received_quantity' => 'integer',
            'restocked_quantity' => 'integer',
        ];
    }

    /** @return BelongsTo<OrderReturn, $this> */
    public function orderReturn(): BelongsTo
    {
        return $this->belongsTo(OrderReturn::class);
    }

    /** @return BelongsTo<OrderItem, $this> */
    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }
}
