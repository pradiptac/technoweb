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
    protected $fillable = ['token', 'customer_id'];

    public function items(): HasMany
    {
        return $this->hasMany(CartItem::class)->orderBy('id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * 64 hex characters from a cryptographic source.
     *
     * `Str::random` is not that — it is fine for a filename and wrong for
     * anything that addresses somebody's data. This token is all that stands
     * between a stranger and the contents of a basket, including, once the
     * checkout exists, the address typed into it.
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
