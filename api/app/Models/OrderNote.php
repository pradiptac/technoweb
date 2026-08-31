<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A staff note on an order, and it never reaches the customer.
 *
 * Separate from the status trail because they are different things: the trail
 * is what happened, a note is what somebody wants a colleague to know. The
 * ticket module keeps the same split, and there it is load-bearing — the worst
 * failure that module can have is an internal note in a customer's inbox.
 *
 * Nothing customer-facing loads this relation. That is the guard, and it is
 * kept at the resource rather than here.
 */
class OrderNote extends Model
{
    protected $fillable = ['order_id', 'user_id', 'actor_name', 'body'];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
