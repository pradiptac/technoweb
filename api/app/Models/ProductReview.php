<?php

namespace App\Models;

use App\Enums\ReviewStatus;
use App\Support\Store\ReviewSummary;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One customer's review of one shop product.
 *
 * **The body is plain text and is stored as typed**, rendered escaped — the
 * blog comment's rule and for the same reason: none of the editor's markup
 * is what somebody needs to say "the fan is loud", and plain text rendered
 * escaped removes stored XSS from the feature rather than defending against
 * it.
 *
 * **The product's summary follows the review, from here.** `saved` and
 * `deleted` call `ReviewSummary::refresh()` whenever a review enters or
 * leaves `published` or a published one changes its stars — every path
 * (moderation, an edit sending it back to the queue, a delete) goes through
 * the model, so none of them can forget. A mass `update()` would skip it,
 * which is why moderation moves one row at a time. The one path that cannot
 * fire an event is a customer's row being deleted by the foreign key, and
 * nothing in the product deletes a customer.
 */
class ProductReview extends Model
{
    protected $fillable = [
        'store_product_id', 'variation_id', 'customer_id', 'order_id',
        'rating', 'title', 'body', 'display_name', 'variant_label',
        'status', 'is_featured', 'published_at', 'moderated_by', 'moderated_at',
    ];

    /**
     * Defaults that match the columns, so a review created and asked about in
     * the same breath answers what a saved one would — the rule the store's
     * models learned from `track_stock`.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => ReviewStatus::Pending->value,
        'is_featured' => false,
    ];

    protected function casts(): array
    {
        return [
            'status' => ReviewStatus::class,
            'rating' => 'integer',
            'is_featured' => 'boolean',
            'published_at' => 'datetime',
            'moderated_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saved(function (self $review) {
            // `getOriginal()` still holds the row as it was before this save:
            // `saved` fires before the originals are synced.
            $original = $review->getOriginal('status');
            $wasPublic = $original instanceof ReviewStatus && $original->isPublic();
            $isPublic = $review->status->isPublic();

            if (
                ($review->wasRecentlyCreated && $isPublic)
                || ($review->wasChanged('status') && ($wasPublic || $isPublic))
                || ($isPublic && $review->wasChanged('rating'))
            ) {
                ReviewSummary::refreshById($review->store_product_id);
            }
        });

        static::deleted(function (self $review) {
            if ($review->status->isPublic()) {
                ReviewSummary::refreshById($review->store_product_id);
            }
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
        return $this->belongsTo(StoreProductVariation::class, 'variation_id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<User, $this> */
    public function moderator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'moderated_by');
    }

    /** What the shop renders, and the only thing it renders. */
    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', ReviewStatus::Published);
    }

    /** The console's queue, and the dashboard's count of it. */
    public function scopeWaiting(Builder $query): Builder
    {
        return $query->where('status', ReviewStatus::Pending);
    }

    /**
     * The shop's four orderings — `featured`, `newest`, `highest`, `lowest` —
     * each ending on `id`, so a page boundary cannot show one review twice
     * and hide another. Anything else reads as featured.
     *
     * Featured is what the shop chose to put first, then the stars, then the
     * newest — so a product nobody has curated still opens on its best
     * reviews rather than its oldest. One scope, read by the public list and
     * by the product graph's `review` nodes, so the markup names the reviews
     * the page opens on.
     */
    public function scopeSorted(Builder $query, string $sort): Builder
    {
        match ($sort) {
            'newest' => $query->orderByDesc('published_at'),
            'highest' => $query->orderByDesc('rating')->orderByDesc('published_at'),
            'lowest' => $query->orderBy('rating')->orderByDesc('published_at'),
            default => $query->orderByDesc('is_featured')->orderByDesc('rating')->orderByDesc('published_at'),
        };

        return $query->orderByDesc('id');
    }

    /** Whether a paid order stands behind it. */
    public function isVerified(): bool
    {
        return $this->order_id !== null;
    }

    /**
     * Move a review, stamping who decided and when.
     *
     * `published_at` is set on the first arrival at `published` and **never
     * cleared** — the rule `approved_at` follows on comments and
     * `resolved_at` on tickets. `moderated_by`/`moderated_at` are the last
     * decision, whichever it was.
     */
    public function moveTo(ReviewStatus $status, ?User $by = null): void
    {
        $this->status = $status;
        $this->moderated_by = $by?->id;
        $this->moderated_at = now();

        if ($status === ReviewStatus::Published && $this->published_at === null) {
            $this->published_at = now();
        }

        $this->save();
    }

    /**
     * "Neil B." from "Neil Basu" — the name a published card shows.
     *
     * A first name and an initial, never the whole name: a review is public
     * and permanent, and the full name of a buyer beside what they bought is
     * more than the reader needs to trust it. One word stays one word.
     */
    public static function displayNameFor(?string $name): string
    {
        $parts = preg_split('/\s+/u', trim((string) $name), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        if ($parts === []) {
            return 'A customer';
        }

        $first = mb_substr($parts[0], 0, 60);

        if (count($parts) === 1) {
            return $first;
        }

        return $first.' '.mb_strtoupper(mb_substr((string) end($parts), 0, 1)).'.';
    }
}
