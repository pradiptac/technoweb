<?php

namespace App\Models;

use App\Enums\DigitalCodeStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One activation code.
 *
 * **Encrypted at rest**, because it is commercial stock: a database read, a
 * backup on a laptop or a leaked dump is otherwise a pile of licences somebody
 * can sell. The cost of that is real and is written down — Laravel's
 * `encrypted` cast uses `APP_KEY`, so rotating the key makes every unsold code
 * unreadable. The SMTP password already makes the same trade.
 *
 * `code_fingerprint` is what an encrypted column takes away: encrypted values
 * differ every time, so a unique index on the ciphertext catches nothing and a
 * duplicate import cannot be recognised. The fingerprint is a SHA-256 of the
 * plain code and is uniquely indexed per product.
 */
class DigitalCode extends Model
{
    protected $fillable = [
        'store_product_id', 'code', 'code_fingerprint', 'status',
        'order_id', 'order_item_id', 'assigned_at', 'delivered_at',
        'revealed_at', 'reveal_count', 'note',
    ];

    /**
     * Hidden by default, so a careless `toArray()` cannot leak the stock.
     *
     * The resources are explicit about what they publish, and this is the
     * belt underneath that: a code reaches a response only where somebody
     * deliberately wrote it.
     */
    protected $hidden = ['code', 'code_fingerprint'];

    protected function casts(): array
    {
        return [
            'code' => 'encrypted',
            'status' => DigitalCodeStatus::class,
            'assigned_at' => 'datetime',
            'delivered_at' => 'datetime',
            'revealed_at' => 'datetime',
            'reveal_count' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        // Written on save rather than at every call site: a fingerprint that
        // depends on whoever inserts the row is a fingerprint that is missing
        // on the one path somebody forgot.
        static::saving(function (self $code) {
            if ($code->isDirty('code') && filled($code->code)) {
                $code->code_fingerprint = hash('sha256', (string) $code->code);
            }
        });
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(StoreProduct::class, 'store_product_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }

    public function scopeAvailable(Builder $query): Builder
    {
        return $query->where('status', DigitalCodeStatus::Available);
    }

    /**
     * Somebody looked at it.
     *
     * Counted rather than merely stamped: "they say they never got the code"
     * against a row saying it was revealed three times from their own account
     * is the whole of that conversation, and a single timestamp cannot tell
     * one look from ten.
     */
    public function recordReveal(): void
    {
        $this->forceFill([
            'revealed_at' => now(),
            'reveal_count' => $this->reveal_count + 1,
        ])->save();
    }
}
