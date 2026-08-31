<?php

namespace App\Models;

use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A discount code.
 *
 * The model owns **what a coupon is worth** and **whether it may be used**,
 * because both questions are asked from three places — the basket, the checkout
 * and the console — and three implementations of "is this expired" would be
 * three answers on a Friday evening.
 *
 * Every refusal returns a sentence written to be read by whoever typed the
 * code. "This coupon has expired" is actionable; "invalid coupon" sends
 * somebody to the telephone.
 */
class Coupon extends Model
{
    protected $fillable = [
        'code', 'type', 'value', 'minimum_order_paise', 'maximum_discount_paise',
        'starts_at', 'ends_at', 'usage_limit', 'per_customer_limit', 'is_active', 'description',
    ];

    protected function casts(): array
    {
        return [
            'value' => 'integer',
            'minimum_order_paise' => 'integer',
            'maximum_discount_paise' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'usage_limit' => 'integer',
            'per_customer_limit' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        // Normalised on the way in, so the unique index is on the form that is
        // matched. Nobody types a coupon the way it was printed.
        static::saving(fn (self $coupon) => $coupon->code = self::normalise($coupon->code));
    }

    public static function normalise(?string $code): string
    {
        return strtoupper(trim((string) $code));
    }

    public function usages(): HasMany
    {
        return $this->hasMany(CouponUsage::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Why this coupon cannot be used on this basket, or null if it can.
     *
     * One method, so the basket and the checkout cannot disagree — and it takes
     * the email rather than a customer, because guest checkout means most
     * baskets have no account at the moment a code is typed. Keying the
     * per-customer limit on an account id would let one person use a
     * "once per customer" code as often as they liked by not signing in.
     */
    public function refusalFor(int $subtotalPaise, ?string $email = null): ?string
    {
        if (! $this->is_active) {
            return 'That code is no longer available.';
        }

        if ($this->starts_at !== null && $this->starts_at->isFuture()) {
            return 'That code is not active yet.';
        }

        if ($this->ends_at !== null && $this->ends_at->isPast()) {
            return 'That code has expired.';
        }

        if ($this->minimum_order_paise !== null && $subtotalPaise < $this->minimum_order_paise) {
            // The figure is in the sentence: "spend more" is not an instruction
            // somebody can act on.
            return 'That code needs an order of '.Money::format($this->minimum_order_paise).' or more.';
        }

        if ($this->usage_limit !== null && $this->usages()->count() >= $this->usage_limit) {
            return 'That code has been fully used.';
        }

        if ($this->per_customer_limit !== null && filled($email)) {
            $used = $this->usages()->where('email', strtolower($email))->count();

            if ($used >= $this->per_customer_limit) {
                return 'You have already used that code.';
            }
        }

        return null;
    }

    /**
     * What it takes off, in paise.
     *
     * Clamped to the basket, so a fixed-amount code on a small order cannot
     * produce a negative total — which is a refund nobody authorised. Clamped
     * again to `maximum_discount_paise`, which is the guard that stops "20% off"
     * against a rack of switches being a discount nobody agreed to.
     */
    public function discountFor(int $subtotalPaise): int
    {
        $discount = $this->type === 'percentage'
            ? Money::percentage($subtotalPaise, $this->value)
            : $this->value;

        if ($this->maximum_discount_paise !== null) {
            $discount = min($discount, $this->maximum_discount_paise);
        }

        return max(0, min($discount, $subtotalPaise));
    }

    /** "10% off" or "₹500 off", for the basket and the console. */
    public function label(): string
    {
        return $this->type === 'percentage'
            ? "{$this->value}% off"
            : Money::format($this->value).' off';
    }
}
