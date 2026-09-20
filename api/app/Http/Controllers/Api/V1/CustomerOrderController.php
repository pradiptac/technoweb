<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Store\OrderResource;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A signed-in customer's own orders.
 *
 * Separate from `/orders/{number}?token=`, which is how a guest reaches theirs,
 * and the two are not interchangeable: one is authorised by a session, the
 * other by a secret in a link. Both exist because both cases are real — most
 * buyers here never sign in, and the ones who do should not have to keep an
 * email to see what they bought.
 *
 * **Every query is scoped to the authenticated customer**, in the query rather
 * than after it. The portal's own rule, and the reason `EnsureUserIsCustomer`
 * exists: `Customer` and `User` ids collide on a seeded install, so authorising
 * by comparing ids after a lookup is a bug waiting for the numbers to match.
 */
class CustomerOrderController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $orders = Order::query()
            ->where('customer_id', $request->user()->id)
            ->with('items')
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 20), 50));

        return OrderResource::collection($orders);
    }

    /**
     * One order, scoped to the customer.
     *
     * An order belonging to somebody else is a **404**, not a 403 — a 403
     * confirms the order number exists, and the numbers are sequential. Same
     * rule the guest link follows for a wrong token.
     */
    public function show(Request $request, string $orderNumber): JsonResource
    {
        $order = Order::where('order_number', $orderNumber)
            ->where('customer_id', $request->user()->id)
            ->firstOrFail();

        return new OrderResource($order->load(['items', 'payments']));
    }
}
