<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A photograph sent with a return — the damage, the wrong box. On the
 * private disk under a random name; `path` is never in a response, and the
 * one way to the bytes is the console's own route.
 */
class OrderReturnPhoto extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['order_return_id', 'path', 'name', 'size', 'mime'];

    protected function casts(): array
    {
        return ['size' => 'integer'];
    }

    /** @return BelongsTo<OrderReturn, $this> */
    public function orderReturn(): BelongsTo
    {
        return $this->belongsTo(OrderReturn::class);
    }
}
