<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Models\ProductReview;
use App\Support\ListSort;
use App\Support\PaginatedEnvelope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The review queue, under Store.
 *
 * **`role:store_manager`**: a review sits on a product page beside the price
 * and the Buy button, and deciding what appears there is the same job as
 * deciding what the listing says. The blog comment queue is the pattern —
 * waiting by default, one door for one decision or fifty, every row moved
 * through the model so the stamps and the product's summary follow.
 */
class ReviewController extends Controller
{
    /** @var array<string, string> */
    private const SORTS = [
        'created' => 'created_at',
        'rating' => 'rating',
        'published' => 'published_at',
    ];

    public function index(Request $request): JsonResponse
    {
        $status = $request->string('status')->value();
        $term = $request->string('q')->trim()->value();

        $rows = ProductReview::query()
            ->with(['product:id,name,slug', 'customer:id,name,email', 'moderator:id,name'])
            /*
             * Waiting by default — the screen exists to be emptied — and
             * `all` for everything. Anything else that is not a status reads
             * as the default, rather than an empty list that looks like a
             * queue somebody has already cleared.
             */
            ->when(
                $status === 'all',
                fn (Builder $q) => $q,
                fn (Builder $q) => $q->where('status', ReviewStatus::tryFrom($status) ?? ReviewStatus::Pending),
            )
            ->when($request->filled('rating'), fn (Builder $q) => $q->where('rating', $request->integer('rating')))
            ->when($request->filled('product'), fn (Builder $q) => $q->where('store_product_id', $request->integer('product')))
            ->when($request->query('verified') === '1', fn (Builder $q) => $q->whereNotNull('order_id'))
            ->when($request->query('verified') === '0', fn (Builder $q) => $q->whereNull('order_id'))
            ->when($term !== '', fn (Builder $q) => $q->where(function (Builder $w) use ($term) {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $w->where('body', 'like', $like)
                    ->orWhere('title', 'like', $like)
                    ->orWhere('display_name', 'like', $like)
                    ->orWhereHas('customer', fn (Builder $c) => $c->where('email', 'like', $like)->orWhere('name', 'like', $like))
                    ->orWhereHas('product', fn (Builder $p) => $p->where('name', 'like', $like));
            }))
            ->tap(fn (Builder $q) => ListSort::apply($q, $request, self::SORTS, fn (Builder $q) => $q->latest('created_at')))
            ->paginate(min(max($request->integer('per_page', 25), 1), 100))
            ->withQueryString();

        $rows->getCollection()->transform(fn (ProductReview $r) => self::row($r));

        return response()->json(PaginatedEnvelope::from($rows, [
            'statuses' => ReviewStatus::options(),
            'pending_count' => ProductReview::waiting()->count(),
            'sorts' => ListSort::keys(self::SORTS),
        ]));
    }

    /**
     * Move one review or a selection of them.
     *
     * **One row at a time**, deliberately: a mass `update()` skips
     * `moveTo()` — where `published_at` and the moderator are stamped — and
     * skips the model's `saved` hook, which is what keeps the product's
     * rating in step. Fast and wrong here is a card claiming 4.8 from
     * reviews nobody can see.
     */
    public function moderate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer'],
            'status' => ['required', 'string'],
        ]);

        $status = ReviewStatus::tryFrom($data['status']);

        if ($status === null) {
            return response()->json(['message' => 'That is not a status a review can have.', 'errors' => ['status' => ['Choose publish, reject, spam or back to waiting.']]], 422);
        }

        $moved = 0;
        $slugs = [];

        foreach (ProductReview::with('product:id,slug')->whereIn('id', $data['ids'])->get() as $review) {
            if ($review->status->canTransitionTo($status)) {
                $review->moveTo($status, $request->user());
                $moved++;
                $slugs[] = $review->product?->slug;
            }
        }

        return response()->json(['data' => [
            'moved' => $moved,
            'pending_count' => ProductReview::waiting()->count(),
            // Which product pages to refresh — the console's action purges
            // their cached first page by tag, and learns the slugs from here
            // rather than with a fetch per review.
            'slugs' => array_values(array_unique(array_filter($slugs))),
        ]]);
    }

    /** Feature or unfeature one review — what "Featured" sorts first. */
    public function update(Request $request, ProductReview $review): JsonResponse
    {
        $data = $request->validate([
            'is_featured' => ['required', 'boolean'],
        ]);

        $review->is_featured = (bool) $data['is_featured'];
        $review->save();

        return response()->json(['data' => self::row($review->load(['product:id,name,slug', 'customer:id,name,email', 'moderator:id,name']))]);
    }

    /**
     * Delete for good. Rejecting is the reversible choice; this is for a
     * review that must not sit in the database at all.
     */
    public function destroy(ProductReview $review): JsonResponse
    {
        $review->delete();

        return response()->json(null, 204);
    }

    /** @return array<string, mixed> */
    private static function row(ProductReview $r): array
    {
        return [
            'id' => $r->id,
            'product' => $r->product ? ['id' => $r->product->id, 'name' => $r->product->name, 'slug' => $r->product->slug] : null,
            'display_name' => $r->display_name,
            // Shown here and nowhere public: a moderator recognises a
            // repeat author by it, and a reader has no business with it.
            'customer' => $r->customer ? ['id' => $r->customer->id, 'name' => $r->customer->name, 'email' => $r->customer->email] : null,
            'verified' => $r->isVerified(),
            'order_id' => $r->order_id,
            'variant_label' => $r->variant_label,
            'rating' => (int) $r->rating,
            'title' => $r->title,
            'body' => $r->body,
            'status' => $r->status->value,
            'status_label' => $r->status->label(),
            'is_featured' => (bool) $r->is_featured,
            'published_at' => $r->published_at?->toIso8601String(),
            'moderated_at' => $r->moderated_at?->toIso8601String(),
            'moderated_by' => $r->moderator?->name,
            'created_at' => $r->created_at?->toIso8601String(),
            'updated_at' => $r->updated_at?->toIso8601String(),
        ];
    }
}
