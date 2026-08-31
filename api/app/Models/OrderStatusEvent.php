<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of the order's trail.
 *
 * Append-only by construction: nothing in the application updates or deletes
 * one. A status somebody disputes is a question about when and who, and a
 * single column holding the current value can answer neither.
 *
 * `actor_name` is copied rather than joined, the rule the activity log follows:
 * a trail that forgets who did something once they leave has failed at exactly
 * the point it is being read.
 */
class OrderStatusEvent extends Model
{
    protected $table = 'order_status_history';

    public $timestamps = false;

    protected $fillable = ['order_id', 'from_status', 'to_status', 'note', 'user_id', 'actor_name'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::creating(fn (self $event) => $event->created_at ??= now());
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
