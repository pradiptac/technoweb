<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Somebody waiting to hear that a product is back.
 *
 * One row per address per shelf — the product, or one variation of it —
 * and `notified_at` is the whole state: null is waiting, set is told,
 * cleared is re-armed. See the migration for why the token is what it is.
 */
class StockNotice extends Model
{
    protected $fillable = ['store_product_id', 'store_product_variation_id', 'email', 'customer_id', 'token', 'notified_at'];

    protected function casts(): array
    {
        return ['notified_at' => 'immutable_datetime'];
    }

    protected static function booted(): void
    {
        static::saving(function (self $row) {
            $row->email = Str::lower(trim($row->email));
        });
    }

    /** @return BelongsTo<StoreProduct, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(StoreProduct::class, 'store_product_id');
    }

    /** @return BelongsTo<StoreProductVariation, $this> */
    public function variation(): BelongsTo
    {
        return $this->belongsTo(StoreProductVariation::class, 'store_product_variation_id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Rows nobody has been told about yet. The one definition the admin
     * count, the `?notices=1` filter, the dashboard figure and the job all
     * read — two spellings of "waiting" is a tile that opens a list of a
     * different length.
     *
     * @param  Builder<static>  $query
     */
    public function scopeWaiting(Builder $query): void
    {
        $query->whereNull('notified_at');
    }

    /**
     * Ask to be told, idempotently.
     *
     * Finds before it creates, because MySQL's unique index treats a null
     * variation as distinct every time; a row already told is re-armed by
     * clearing `notified_at` rather than refused, since "tell me again next
     * time" is exactly what a second request means.
     */
    public static function arm(StoreProduct $product, ?StoreProductVariation $variation, string $email, ?Customer $customer): self
    {
        $email = Str::lower(trim($email));

        $row = static::query()
            ->where('store_product_id', $product->id)
            ->where('store_product_variation_id', $variation?->id)
            ->where('email', $email)
            ->first();

        if ($row === null) {
            return static::create([
                'store_product_id' => $product->id,
                'store_product_variation_id' => $variation?->id,
                'email' => $email,
                'customer_id' => $customer?->id,
                'token' => self::newToken(),
            ]);
        }

        $row->fill([
            'notified_at' => null,
            'customer_id' => $customer !== null ? $customer->id : $row->customer_id,
        ])->save();

        return $row;
    }

    /** 64 hex characters from `random_bytes`, the shape a conversation token has. */
    public static function newToken(): string
    {
        return bin2hex(random_bytes(32));
    }
}
