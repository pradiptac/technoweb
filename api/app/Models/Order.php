<?php

namespace App\Models;

use App\Enums\OrderStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * What was sold, to whom, and where it got to.
 *
 * The row is deliberately self-contained: the customer's name, the address, the
 * price of every line and the terms of the sale are all copied onto it. A
 * product renamed, repriced or deleted next year cannot change what this says
 * happened — which is the difference between an order and a cart, and the
 * reason `order_items` snapshots rather than joins.
 */
class Order extends Model
{
    protected $fillable = [
        'order_number', 'customer_id', 'status',
        'subtotal_paise', 'discount_paise', 'taxable_paise', 'gst_paise', 'total_paise',
        'coupon_id', 'coupon_code',
        'customer_name', 'customer_email', 'customer_phone',
        'billing_address', 'shipping_address',
        'gst_required', 'gstin', 'company_name',
        'invoice_number', 'invoice_date', 'invoice_path',
        'courier', 'tracking_number', 'tracking_url', 'shipping_notes',
        'access_token', 'placed_at', 'paid_at', 'dispatched_at', 'completed_at', 'cancelled_at',
    ];

    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class,
            'subtotal_paise' => 'integer',
            'discount_paise' => 'integer',
            'taxable_paise' => 'integer',
            'gst_paise' => 'integer',
            'total_paise' => 'integer',
            // Read by name rather than by position, so MySQL's key reordering
            // is harmless here -- unlike a spec sheet, where order is content.
            'billing_address' => 'array',
            'shipping_address' => 'array',
            'gst_required' => 'boolean',
            'invoice_date' => 'date',
            'placed_at' => 'datetime',
            'paid_at' => 'datetime',
            'dispatched_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $order) {
            $order->order_number ??= self::nextNumber();
            $order->access_token ??= bin2hex(random_bytes(32));
        });
    }

    /**
     * ORD-2026-00001 — sequential within a year, so staff can sort by eye.
     *
     * Concurrent inserts could in theory pick the same number; the unique index
     * turns that into a failed insert rather than a duplicate order, which is
     * the right way round. Same approach as a ticket reference.
     *
     * **It is not a secret and must never be treated as one.** It is printed on
     * paperwork and read out on the telephone, and the next one is the obvious
     * guess — which is why a guest reaches their order through `access_token`
     * instead.
     */
    public static function nextNumber(): string
    {
        $year = now()->year;

        $last = self::where('order_number', 'like', "ORD-{$year}-%")
            ->orderByDesc('id')
            ->value('order_number');

        $n = $last ? ((int) Str::afterLast($last, '-')) + 1 : 1;

        return sprintf('ORD-%d-%05d', $year, $n);
    }

    public function getRouteKeyName(): string
    {
        return 'order_number';
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class)->orderBy('id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderByDesc('id');
    }

    public function history(): HasMany
    {
        return $this->hasMany(OrderStatusEvent::class)->orderBy('id');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(OrderNote::class)->orderByDesc('id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** Whether anything on this order has to be put in a box. */
    public function needsShipping(): bool
    {
        return $this->items->contains(fn (OrderItem $item) => $item->type?->isShipped());
    }

    /**
     * Move the order on, and write down that it moved.
     *
     * The trail is written here rather than at the call sites, because there
     * will be several — the console, a webhook, a scheduled sweep — and a trail
     * that depends on every caller remembering to append to it is a trail with
     * holes in exactly the places somebody later goes looking.
     */
    public function moveTo(OrderStatus $status, ?string $note = null, ?User $actor = null): void
    {
        $from = $this->status;

        $this->status = $status;

        // The stamps are set on arrival and never cleared, the rule
        // `resolved_at` had to be taught: closing a ticket used to erase the
        // moment it had been resolved, and everything the dashboard said about
        // throughput read that column.
        match ($status) {
            OrderStatus::Paid => $this->paid_at ??= now(),
            OrderStatus::Dispatched => $this->dispatched_at ??= now(),
            OrderStatus::Completed => $this->completed_at ??= now(),
            OrderStatus::Cancelled => $this->cancelled_at ??= now(),
            default => null,
        };

        $this->save();

        $this->history()->create([
            'from_status' => $from?->value,
            'to_status' => $status->value,
            'note' => $note,
            'user_id' => $actor?->id,
            'actor_name' => $actor?->name,
        ]);
    }
}
