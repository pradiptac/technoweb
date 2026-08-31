<?php

namespace App\Models;

use App\Enums\PaymentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One attempt to pay for an order.
 *
 * **`gateway_payment_id` is unique, and that uniqueness is the idempotency.**
 * Gateways retry webhooks — that is not an edge case, it is the documented
 * behaviour of every one of them — so the same success can arrive three times.
 * Without the index the second arrival marks the order paid again, assigns a
 * second activation code and reduces stock twice; with it, the second insert
 * simply cannot happen and the handler recognises the payment it already has.
 *
 * Nothing about a card is stored. Not the number, not the last four, not the
 * expiry: the gateway holds all of it and this holds a reference.
 */
class Payment extends Model
{
    protected $fillable = [
        'order_id', 'gateway', 'gateway_order_id', 'gateway_payment_id', 'signature',
        'amount_paise', 'currency', 'status', 'method', 'failure_reason', 'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => PaymentStatus::class,
            'amount_paise' => 'integer',
            'paid_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
