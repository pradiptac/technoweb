<?php

namespace App\Support\WordPress\Steps;

use App\Enums\ReviewStatus;
use App\Models\Customer;
use App\Models\OrderItem;
use App\Models\ProductReview;
use App\Support\HtmlSanitiser;
use App\Support\WordPress\Context;
use App\Support\WordPress\Harvest;
use App\Support\WordPress\Outcome;
use Illuminate\Support\Str;

/**
 * WooCommerce product reviews, as the store's reviews.
 *
 * A review here belongs to a customer account — one per customer per
 * product — so a WooCommerce review is brought across only when its address
 * belongs to an account (one the customers step just made, or one already
 * here). A review left by a guest has nobody to belong to and is skipped and
 * counted. Newest first, so when a customer reviewed a product twice the
 * later review is the one kept.
 *
 * Verified means what it means everywhere here: one of the customer's paid
 * orders contains the product. The product's rating summary is kept by the
 * review's own hooks (`ReviewSummary`), not written here.
 */
class ReviewsStep extends Step
{
    /** @var array<string, true> product|email pairs already planned this run — newest first, so the first wins */
    private array $seen = [];

    public function key(): string
    {
        return 'reviews';
    }

    public function label(): string
    {
        return 'Product reviews';
    }

    public function section(): string
    {
        return 'catalogue';
    }

    public function mapType(): ?string
    {
        return 'review';
    }

    public function records(Context $ctx): iterable
    {
        $reviews = Harvest::all($ctx->import, 'reviews');
        usort($reviews, fn ($a, $b) => strcmp((string) ($b['date_created_gmt'] ?? ''), (string) ($a['date_created_gmt'] ?? '')));

        return $reviews;
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $name = trim((string) ($record['reviewer'] ?? '')) ?: 'A customer';
        $label = $name.' on product #'.($record['product_id'] ?? '?');

        if (! in_array($record['status'] ?? '', ['approved', 'hold'], true)) {
            return Outcome::skip($label, 'Spam or binned.');
        }

        if (! $ctx->map->has('product', $record['product_id'] ?? 0)) {
            return Outcome::skip($label, 'Its product is not being imported.');
        }

        $email = strtolower(trim((string) ($record['reviewer_email'] ?? '')));
        $imported = $ctx->import->wants('customers') ? $ctx->memo('customer-emails', fn () => collect(Harvest::read($ctx->import, 'customers'))
            ->pluck('email')->map(fn ($e) => strtolower((string) $e))->flip()->all()) : [];
        $customerPlanned = $email !== '' && isset($imported[$email]);
        $customer = $email !== '' ? Customer::query()->where('email', $email)->value('id') : null;

        if ($customer === null && $customerPlanned === false) {
            return Outcome::skip($label, 'Left by somebody with no account here; a review here belongs to a signed-in customer.');
        }

        $existing = $ctx->map->targetId('review', $record['id']);
        $pair = ($record['product_id'] ?? '').'|'.$email;

        if ($existing === null && isset($this->seen[$pair])) {
            return Outcome::skip($label, 'An older review by the same customer of the same product; the newest is kept.');
        }

        $this->seen[$pair] = true;

        if ($existing === null && $customer !== null && ($product = $ctx->map->targetId('product', $record['product_id']))
            && ProductReview::query()->where('store_product_id', $product)->where('customer_id', $customer)->exists()) {
            return Outcome::skip($label, 'This customer already has a review of this product here.');
        }

        return Outcome::upsert($existing !== null, $label, ['existing' => $existing, 'email' => $email, 'name' => $name]);
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $customer = Customer::query()->where('email', $outcome->data['email'])->firstOrFail();
        $product = (int) $ctx->map->targetId('product', $record['product_id']);
        $date = self::date($record['date_created_gmt'] ?? null) ?? now()->toImmutable();
        $published = ($record['status'] ?? '') === 'approved';

        $order = OrderItem::query()
            ->where('store_product_id', $product)
            ->whereHas('order', fn ($q) => $q->where('customer_id', $customer->id)->whereNotNull('paid_at'))
            ->value('order_id');

        $values = [
            'store_product_id' => $product,
            'customer_id' => $customer->id,
            'order_id' => $order,
            'rating' => max(1, min(5, (int) ($record['rating'] ?? 5))),
            'body' => Str::limit(HtmlSanitiser::toEmailText((string) ($record['review'] ?? '')), 2000, '') ?: '—',
            'display_name' => ProductReview::displayNameFor($outcome->data['name']),
            'status' => $published ? ReviewStatus::Published : ReviewStatus::Pending,
            'published_at' => $published ? $date : null,
            'moderated_at' => $published ? $date : null,
        ];

        $review = $outcome->data['existing'] ? ProductReview::query()->find($outcome->data['existing']) : null;
        $review ??= new ProductReview;
        $review->fill($values);
        $review->forceFill(['created_at' => $date])->save();

        $ctx->map->put('review', $record['id'], $review);
    }
}
