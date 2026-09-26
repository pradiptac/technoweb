<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PublishStatus;
use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Store\ReviewResource;
use App\Models\Customer;
use App\Models\ProductReview;
use App\Models\StoreProduct;
use App\Support\PaginatedEnvelope;
use App\Support\Store\ReviewPurchase;
use App\Support\Store\ReviewSummary;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reviews on the shop's products — reading them, and writing your own.
 *
 * The public half of `docs/store-reviews-plan.md`. Reading is open to
 * anybody; writing is a portal route (`auth:sanctum` + `customer`), because
 * the client's decision is that only a signed-in customer may review, and a
 * verified purchase is decided from that customer's own paid orders.
 */
class ProductReviewController extends Controller
{
    public const PER_PAGE = 6;

    /** The accepted sentence, for every write — the honeypot's included. */
    public const ACCEPTED = 'Thanks — we will publish it once it has been checked.';

    /**
     * `?sort=` is a whitelist of four and an unknown value falls back to
     * featured — the catalogue's rule: a sort parameter arrives mangled from
     * an old link, and an error page is the worse answer.
     */
    private const SORTS = ['featured', 'newest', 'highest', 'lowest'];

    public function index(Request $request, StoreProduct $storeProduct): JsonResponse
    {
        abort_unless($storeProduct->status === PublishStatus::Published, 404);

        $sort = in_array($request->query('sort'), self::SORTS, true) ? $request->query('sort') : 'featured';

        $page = ProductReview::query()
            ->published()
            ->where('store_product_id', $storeProduct->id)
            ->sorted($sort)
            ->paginate(self::PER_PAGE)
            ->withQueryString();

        $page->getCollection()->transform(fn (ProductReview $r) => (new ReviewResource($r))->resolve($request));

        return response()->json(PaginatedEnvelope::from($page, [
            'sort' => $sort,
            'average' => $storeProduct->rating_count > 0 ? (float) $storeProduct->rating_average : null,
            'count' => (int) $storeProduct->rating_count,
            'distribution' => ReviewSummary::distribution($storeProduct->id),
        ]));
    }

    /**
     * The caller's own review of this product, in whatever state it is in.
     *
     * What the write-a-review dialog opens on: an existing review is edited
     * rather than duplicated, and `verified` lets the dialog say before
     * anything is typed whether the card will carry the badge.
     */
    public function mine(Request $request, StoreProduct $storeProduct): JsonResponse
    {
        abort_unless($storeProduct->status === PublishStatus::Published, 404);

        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);

        $review = ProductReview::query()
            ->where('store_product_id', $storeProduct->id)
            ->where('customer_id', $customer->id)
            ->first();

        return response()->json([
            'data' => $review === null ? null : [
                'id' => $review->id,
                'rating' => (int) $review->rating,
                'title' => $review->title,
                'body' => $review->body,
                'status' => $review->status->value,
                'status_label' => $review->status->label(),
                'verified' => $review->isVerified(),
                'variant_label' => $review->variant_label,
                'updated_at' => $review->updated_at?->toIso8601String(),
            ],
            'meta' => [
                'can_review' => true,
                'verified' => ReviewPurchase::for($customer, $storeProduct) !== null,
            ],
        ]);
    }

    /**
     * Write or rewrite the caller's review.
     *
     * **One per customer per product**, and a second write edits the first —
     * the unique index is the rule. **Every write goes back to `pending`**,
     * including an edit to a published review: what staff approved was the
     * text that was there, and a published card whose words changed after
     * approval is an unmoderated review. The featured flag goes with it for
     * the same reason. `published_at` is kept (never cleared).
     *
     * Verification is re-read on every write, so somebody who reviews first
     * and buys later is verified on their next edit. The name and the variant
     * are snapshots taken now.
     *
     * **202 and one sentence** for everything accepted, a filled honeypot
     * included — which stores nothing.
     */
    public function store(Request $request, StoreProduct $storeProduct): JsonResponse
    {
        abort_unless($storeProduct->status === PublishStatus::Published, 404);

        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);

        $data = $request->validate([
            'rating' => ['required', 'integer', 'between:1,5'],
            'title' => ['nullable', 'string', 'max:120'],
            'body' => ['required', 'string', 'min:2', 'max:2000'],
            'website' => ['nullable', 'string', 'max:255'],
        ]);

        if (filled($data['website'] ?? null)) {
            return response()->json(['message' => self::ACCEPTED], 202);
        }

        $line = ReviewPurchase::for($customer, $storeProduct);

        $review = ProductReview::query()->firstOrNew([
            'store_product_id' => $storeProduct->id,
            'customer_id' => $customer->id,
        ]);

        $review->fill([
            'rating' => (int) $data['rating'],
            'title' => filled($data['title'] ?? null) ? trim((string) $data['title']) : null,
            'body' => trim((string) $data['body']),
            'display_name' => ProductReview::displayNameFor($customer->name),
            'order_id' => $line?->order_id,
            'variation_id' => $line?->store_product_variation_id,
            'variant_label' => $line !== null ? ReviewPurchase::variantLabel($line) : null,
            'status' => ReviewStatus::Pending,
            'is_featured' => false,
        ]);

        try {
            $review->save();
        } catch (UniqueConstraintViolationException) {
            // A double press racing itself: the other request wrote the row,
            // with these same words. Nothing is lost by saying so.
        }

        return response()->json(['message' => self::ACCEPTED], 202);
    }
}
