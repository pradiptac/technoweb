<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One use of a coupon, on one order.
 *
 * A row rather than an incremented counter, and that is the whole design: a
 * `used_count` column cannot answer "has *this person* used it", and it cannot
 * be made safe under concurrency without a lock that a unique index gives for
 * free. The index on `(coupon_id, order_id)` is what stops a retried webhook or
 * a double-pressed button burning a single-use code twice.
 *
 * The email is stored lower-cased, because that is what it is matched on and a
 * per-customer limit that treats two spellings of one address as two people is
 * not a limit at all.
 */
class CouponUsage extends Model
{
    public $timestamps = false;

    protected $fillable = ['coupon_id', 'order_id', 'email', 'discount_paise'];

    protected function casts(): array
    {
        return [
            'discount_paise' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $usage) {
            $usage->created_at ??= now();
            $usage->email = strtolower(trim((string) $usage->email));
        });
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
