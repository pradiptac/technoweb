<?php

namespace App\Models;

use App\Enums\ReturnReason;
use App\Enums\ReturnStatus;
use App\Support\References;
use App\Support\Store\Returns\ReturnPhotos;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A customer's request to send back lines of an order (0.132.0,
 * docs/store.md "Returns").
 *
 * Its lines point at the order's own lines, which are snapshots — so what
 * is coming back is named and priced from the order, never from a product
 * that may have been renamed since. The decision, the receipt and the refund
 * each stamp a time on arrival that is never cleared, the rule
 * `resolved_at` had to be taught on tickets.
 *
 * Status moves through `App\Support\Store\Returns\ReturnActions` and nowhere
 * else: each move does something besides write the column — mails the
 * customer, puts stock back, records a refund.
 */
class OrderReturn extends Model
{
    protected $fillable = [
        'reference', 'order_id', 'customer_id', 'status', 'reason', 'details',
        'decision_note', 'staff_note', 'decided_by', 'refund_payment_id', 'refund_paise',
        'approved_at', 'rejected_at', 'received_at', 'refunded_at', 'closed_at',
    ];

    // Mirrors the column default — see `Popup::$attributes`.
    protected $attributes = [
        'status' => 'requested',
    ];

    protected function casts(): array
    {
        return [
            'status' => ReturnStatus::class,
            'reason' => ReturnReason::class,
            'refund_paise' => 'integer',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
            'received_at' => 'datetime',
            'refunded_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $return) {
            $return->reference ??= self::nextReference();
        });

        // The photographs go with the request: nothing else can reach them.
        static::deleting(function (self $return) {
            $return->photos()->get()->each(fn (OrderReturnPhoto $photo) => ReturnPhotos::discard($photo->path));
            ReturnPhotos::forget($return);
        });
    }

    /**
     * RMA-2026-00001 — the ticket reference's shape, sequential within a
     * year and counted per prefix. Concurrent inserts could pick the same
     * number; the unique index turns that into a failed insert rather than
     * two returns under one reference, the trade `Ticket::nextReference()`
     * makes.
     */
    public static function nextReference(): string
    {
        $year = now()->year;
        $prefix = References::returns();

        $last = self::query()
            ->where('reference', 'like', "{$prefix}-{$year}-%")
            ->orderByDesc('id')
            ->value('reference');

        $n = $last ? ((int) Str::afterLast($last, '-')) + 1 : 1;

        return sprintf('%s-%d-%05d', $prefix, $year, $n);
    }

    public function getRouteKeyName(): string
    {
        return 'reference';
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<User, $this> */
    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    /** @return BelongsTo<Payment, $this> */
    public function refundPayment(): BelongsTo
    {
        return $this->belongsTo(Payment::class, 'refund_payment_id');
    }

    /** @return HasMany<OrderReturnItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(OrderReturnItem::class);
    }

    /** @return HasMany<OrderReturnPhoto, $this> */
    public function photos(): HasMany
    {
        return $this->hasMany(OrderReturnPhoto::class)->orderBy('id');
    }

    /** Waiting on the desk: asked for, and nobody has answered. */
    public function scopeWaiting(Builder $query): Builder
    {
        return $query->where('status', ReturnStatus::Requested);
    }

    /** Anything the desk still has to act on. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', [ReturnStatus::Requested, ReturnStatus::Approved, ReturnStatus::Received]);
    }

    /**
     * Whether this return's quantities still count against what the order
     * may send back. A refusal gives them back, and so does a return closed
     * before anything arrived — the customer kept the goods.
     */
    public function holdsQuantity(): bool
    {
        if (! $this->status->claimsQuantity()) {
            return false;
        }

        return ! ($this->status === ReturnStatus::Closed && $this->received_at === null);
    }

    public function adminPath(): string
    {
        return "/admin/store/returns/{$this->reference}";
    }
}
