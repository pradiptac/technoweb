<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Store\ReturnRequest;
use App\Http\Resources\Store\OrderReturnResource;
use App\Models\Customer;
use App\Models\Order;
use App\Support\Store\Returns\ReturnActions;
use Illuminate\Http\JsonResponse;

/**
 * A customer asking to return something (0.132.0, docs/store.md "Returns").
 *
 * Two doors onto one action, the order page's own two: the **link** — an
 * order number and the secret in its email — for somebody who never signed
 * in, and the **portal** for somebody who has. Both end in
 * `ReturnActions::request()`, which decides whether the order may return
 * anything and how much.
 *
 * There is no read here. A return is read with its order: `GET
 * /orders/{number}` and `GET /my/orders/{number}` carry `returns` and
 * `return_policy`.
 */
class OrderReturnController extends Controller
{
    /** The guest door: the order's token, compared in constant time; a wrong one is the 404 a wrong number is. */
    public function store(ReturnRequest $request, string $orderNumber): JsonResponse
    {
        $order = Order::where('order_number', $orderNumber)->firstOrFail();

        abort_unless(hash_equals((string) $order->access_token, (string) $request->input('token', '')), 404);

        return $this->created($order, $request, null);
    }

    /** The portal door: the signed-in customer's own order, or a 404. */
    public function storeMine(ReturnRequest $request, string $orderNumber): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $order = Order::where('order_number', $orderNumber)
            ->where('customer_id', $customer->id)
            ->firstOrFail();

        return $this->created($order, $request, $customer);
    }

    private function created(Order $order, ReturnRequest $request, ?Customer $customer): JsonResponse
    {
        $data = $request->validated();

        $return = ReturnActions::request($order, [
            'reason' => $data['reason'],
            'details' => $data['details'] ?? null,
            'items' => $data['items'],
        ], $request->photos(), $customer);

        return (new OrderReturnResource($return))
            ->additional(['message' => "We have your return request. Its reference is {$return->reference}, and we have emailed it to you."])
            ->response()
            ->setStatusCode(201);
    }
}
