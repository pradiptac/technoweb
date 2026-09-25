<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Somebody's basket, addressed by a token.
 *
 * See the migration: the token is the identity because guest checkout means
 * most carts never belong to an account. Nothing about money is stored on it —
 * every figure is recomputed by `App\Support\Store\Basket` from the product as
 * it is now.
 */
class Cart extends Model
{
    protected $fillable = [
        'token', 'customer_id', 'coupon_code',
        // Abandoned-basket reminders — see the 2026_09_25 migration.
        'email', 'phone', 'contact_consent_at', 'reminders_sent', 'last_reminded_at',
        'recovered_order_id', 'restore_token',
    ];

    /**
     * In-memory defaults matching the columns, so an unsaved cart reads the
     * same as a saved one (`CLAUDE.md`: a model's defaults must match).
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'reminders_sent' => 0,
    ];

    protected function casts(): array
    {
        return [
            'contact_consent_at' => 'datetime',
            'last_reminded_at' => 'datetime',
            'reminders_sent' => 'integer',
        ];
    }

    /** @return HasMany<CartItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(CartItem::class)->orderBy('id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<Order, $this> */
    public function recoveredOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'recovered_order_id');
    }

    /**
     * Who a reminder about this basket goes to, or null for nobody.
     *
     * An address typed at the checkout counts only with its consent stamp —
     * the line under the field said a reminder might follow. An account
     * holder is reached at the account's address when the basket carries no
     * address of its own.
     */
    public function reminderEmail(): ?string
    {
        if (filled($this->email) && $this->contact_consent_at !== null) {
            return $this->email;
        }

        return $this->customer?->email;
    }

    /** The restore link's token, minted on first use and kept. */
    public function ensureRestoreToken(): string
    {
        if (blank($this->restore_token)) {
            $this->restore_token = self::newToken();
            $this->timestamps = false;
            $this->save();
            $this->timestamps = true;
        }

        return (string) $this->restore_token;
    }

    /**
     * 64 hex characters from a cryptographic source.
     *
     * This token is all that stands between a stranger and the contents of a
     * basket, including the address typed into it at the checkout, so it comes
     * from `random_bytes` directly and says so at the call site.
     *
     * This docblock used to claim `Str::random` "is not that". It is —
     * `Illuminate\Support\Str::random` has drawn from `random_bytes` since
     * Laravel 5, so the stated reason was simply wrong even though the code was
     * right. Recorded rather than quietly deleted: a comment that misdescribes
     * the framework teaches the wrong lesson everywhere else it is believed.
     * `bin2hex` of 32 bytes is still preferred here for being obvious about
     * where the entropy comes from and giving a fixed 64-character column.
     */
    public static function newToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    /** The cart for a token, or a new one. */
    public static function forToken(?string $token): self
    {
        if (filled($token) && Str::length($token) === 64) {
            $existing = self::where('token', $token)->first();

            if ($existing !== null) {
                return $existing;
            }
        }

        return self::create(['token' => self::newToken()]);
    }
}
