<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Somebody's wishlist — a guest's, addressed by a token like a basket, or an
 * account's, addressed by the customer.
 *
 * See the migration for the shape and `App\Support\Store\Wishlists` for the
 * rules about which one a request reaches. Nothing about money is fixed here
 * but `price_at_save` on each line, which is what a price drop is measured
 * from; the price shown is always the price now.
 */
class Wishlist extends Model
{
    protected $fillable = ['token', 'customer_id', 'email', 'alerts_token', 'alerts_off_at'];

    protected function casts(): array
    {
        return ['alerts_off_at' => 'immutable_datetime'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $row) {
            $row->token ??= self::newToken();
            $row->alerts_token ??= self::newToken();
        });

        static::saving(function (self $row) {
            $row->email = filled($row->email) ? Str::lower(trim((string) $row->email)) : null;
        });
    }

    /** @return HasMany<WishlistItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(WishlistItem::class)->orderByDesc('id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Lists nobody has signed in to — the only ones a token alone reaches.
     *
     * @param  Builder<static>  $query
     */
    public function scopeGuest(Builder $query): void
    {
        $query->whereNull('customer_id');
    }

    /** 64 hex characters from `random_bytes`, the basket token's shape. */
    public static function newToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    /**
     * Where a back-in-stock or price-drop email for this list goes, or null.
     *
     * An account's address while the account may sign in — a suspended or
     * rejected customer is not written to about a shop they cannot use — and
     * a guest's own "email me about these" address otherwise. Null for a
     * guest who gave none, which is the "told nothing" the brief asks for,
     * and for a list whose stop link has been pressed.
     */
    public function alertAddress(): ?string
    {
        if ($this->alerts_off_at !== null) {
            return null;
        }

        if ($this->customer_id !== null) {
            $customer = $this->customer;

            return $customer !== null && $customer->status->canSignIn() && filled($customer->email)
                ? (string) $customer->email
                : null;
        }

        return filled($this->email) ? (string) $this->email : null;
    }
}
