<?php

namespace App\Models;

use App\Enums\MessageChannel;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Somebody who agreed to be messaged on a channel at an address.
 *
 * The row is the consent record, so it is never deleted by an opt-out: an
 * opt-out stamps `opted_out_at` and the reason, and the row stays as the
 * evidence that we stopped. Opting in again clears the stamp and records a
 * fresh `opted_in_at`, but only from something the person did themselves —
 * a checkbox, a portal toggle, the bell.
 *
 * Unique per (channel, address): one number is one contact on WhatsApp
 * whoever typed it, and `customer_id` is filled in when an account is known.
 */
class MessageContact extends Model
{
    protected $fillable = [
        'channel', 'address', 'customer_id', 'name', 'source',
        'opted_in_at', 'opted_out_at', 'opt_out_reason', 'last_sent_at',
    ];

    protected function casts(): array
    {
        return [
            'channel' => MessageChannel::class,
            'opted_in_at' => 'datetime',
            'opted_out_at' => 'datetime',
            'last_sent_at' => 'datetime',
        ];
    }

    public function isActive(): bool
    {
        return $this->opted_in_at !== null && $this->opted_out_at === null;
    }

    /**
     * Opted in and not out: the only rows anything may send to.
     *
     * @param  Builder<MessageContact>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->whereNotNull('opted_in_at')->whereNull('opted_out_at');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
