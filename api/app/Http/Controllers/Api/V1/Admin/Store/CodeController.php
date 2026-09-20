<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Enums\DigitalCodeStatus;
use App\Http\Controllers\Controller;
use App\Models\DigitalCode;
use App\Models\StoreProduct;
use App\Support\Store\DigitalFulfilment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The activation-code inventory.
 *
 * **A listing never shows a code.** The brief asks for that in as many words,
 * and the reason is that this screen is open on a desk in a room people walk
 * through: a page of licence keys is stock anybody passing can photograph. What
 * the listing shows is how many there are, what state each is in and which
 * order took it.
 *
 * Reading one is a separate, deliberate act on a single code — for the one case
 * that genuinely happens, somebody reading a key out to a customer on the
 * telephone. It is recorded like a customer's own reveal.
 */
class CodeController extends Controller
{
    public function index(Request $request, StoreProduct $storeProduct): JsonResponse
    {
        $codes = $storeProduct->digitalCodes()
            ->with('order:id,order_number')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 50), 200))
            ->withQueryString();

        return response()->json([
            'data' => $codes->map(fn (DigitalCode $c) => [
                'id' => $c->id,
                // No `code`. See the class docblock.
                'status' => $c->status?->value,
                'status_label' => $c->status?->label(),
                'order_number' => $c->order?->order_number,
                'assigned_at' => $c->assigned_at?->toIso8601String(),
                'revealed_at' => $c->revealed_at?->toIso8601String(),
                'reveal_count' => $c->reveal_count,
                'created_at' => $c->created_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                'current_page' => $codes->currentPage(),
                'last_page' => $codes->lastPage(),
                'per_page' => $codes->perPage(),
                'total' => $codes->total(),
                'statuses' => DigitalCodeStatus::options(),
                'available' => $storeProduct->digitalCodes()->where('status', DigitalCodeStatus::Available)->count(),
                'delivered' => $storeProduct->digitalCodes()->where('status', DigitalCodeStatus::Delivered)->count(),
            ],
        ]);
    }

    /**
     * Add codes, pasted one per line.
     *
     * A paste is how these arrive — a supplier sends a block of keys in an
     * email. Duplicates are **reported rather than dropped**: pasting the same
     * block twice is an ordinary mistake, and silently ignoring the second
     * paste hides that the count did not rise by what somebody expected.
     */
    public function store(Request $request, StoreProduct $storeProduct): JsonResponse
    {
        $data = $request->validate([
            'codes' => ['required', 'string', 'max:200000'],
        ]);

        $lines = preg_split('/\R/', $data['codes']) ?: [];

        $result = DigitalFulfilment::import($storeProduct->id, $lines);

        return response()->json(['meta' => $result], 201);
    }

    /**
     * Read one code, and record that somebody did.
     *
     * A POST for the same reasons the customer's reveal is one: it has a
     * consequence, and a GET would be pre-fetched, proxy-logged with its URL
     * and cached.
     */
    public function reveal(DigitalCode $code): JsonResponse
    {
        $code->recordReveal();

        return response()->json(['data' => [
            'id' => $code->id,
            'code' => $code->code,
            'reveal_count' => $code->reveal_count,
        ]]);
    }

    /**
     * Take an unsold code out of stock.
     *
     * Only an available one. A delivered code belongs to an order — deleting it
     * would leave a customer's line pointing at nothing, and the record of what
     * was sold is not this screen's to remove.
     */
    public function destroy(DigitalCode $code): JsonResponse
    {
        if ($code->status !== DigitalCodeStatus::Available) {
            return response()->json([
                'message' => 'That code has been issued to an order. Cancel it instead of deleting it.',
            ], 422);
        }

        $code->delete();

        return response()->json(null, 204);
    }
}
