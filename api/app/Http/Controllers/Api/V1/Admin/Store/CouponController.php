<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\Store\CouponResource;
use App\Models\Coupon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Validation\Rule;

/**
 * Discount codes, behind `role:store_manager`.
 *
 * Deliberately small. The brief's list of what *not* to build here is longer
 * than what to: no bundles, no buy-one-get-one, no tiered discounts, no
 * segments, no flash sales. A percentage or an amount off, with the ordinary
 * guards.
 *
 * **A coupon is never deleted once it has been used.** The usage rows are the
 * record of a discount somebody was given, and `cascadeOnDelete` would erase
 * that along with the reason an order's total is what it is.
 */
class CouponController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $coupons = Coupon::query()
            ->withCount('usages')
            ->when($request->filled('q'), fn ($q) => $q->where('code', 'like', '%'.strtoupper($request->string('q')).'%'))
            ->when($request->boolean('active'), fn ($q) => $q->active())
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return CouponResource::collection($coupons);
    }

    public function show(Coupon $coupon): JsonResource
    {
        return new CouponResource($coupon->loadCount('usages'));
    }

    public function store(Request $request): JsonResponse
    {
        $coupon = Coupon::create($this->validated($request));

        // `->response()`, never `response()->json($resource)`: the second drops
        // the `data` wrapper and the console reports a failure for something it
        // just created. Twice on this codebase already.
        return (new CouponResource($coupon->loadCount('usages')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Coupon $coupon): JsonResource
    {
        $coupon->update($this->validated($request, $coupon));

        return new CouponResource($coupon->fresh()->loadCount('usages'));
    }

    /**
     * Delete an unused one; deactivate the rest.
     *
     * A used coupon's rows explain why an order's total is what it is. Removing
     * that is not tidying up, it is losing the answer to a question somebody
     * asks months later — so it is refused with the alternative named.
     */
    public function destroy(Coupon $coupon): JsonResponse
    {
        if ($coupon->usages()->exists()) {
            return response()->json([
                'message' => 'That code has been used on an order. Switch it off instead of deleting it.',
            ], 422);
        }

        $coupon->delete();

        return response()->json(null, 204);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Coupon $coupon = null): array
    {
        $required = $coupon === null ? 'required' : 'sometimes';

        $data = $request->validate([
            'code' => [
                $required, 'string', 'max:64', 'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('coupons', 'code')->ignore($coupon),
            ],
            'type' => [$required, Rule::in(['percentage', 'fixed'])],
            'value' => [$required, 'integer', 'min:1'],
            'minimum_order_paise' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'maximum_discount_paise' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'starts_at' => ['sometimes', 'nullable', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date', 'after:starts_at'],
            'usage_limit' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'per_customer_limit' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'is_active' => ['sometimes', 'boolean'],
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
        ], [
            'code.regex' => 'A code can contain letters, numbers, dots, dashes and underscores.',
            'ends_at.after' => 'The end date has to be after the start date.',
        ]);

        /*
         * A percentage above 100 is free money, and is refused rather than
         * clamped: somebody typing 150 meant something, and quietly making it
         * 100 hides which.
         */
        if (($data['type'] ?? $coupon?->type) === 'percentage' && ($data['value'] ?? 0) > 100) {
            abort(422, 'A percentage discount cannot be more than 100.');
        }

        return $data;
    }
}
