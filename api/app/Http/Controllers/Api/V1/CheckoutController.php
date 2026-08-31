<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Store\CheckoutRequest;
use App\Http\Resources\Store\OrderResource;
use App\Models\Cart;
use App\Models\Order;
use App\Support\Store\Checkout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Validation\ValidationException;

/**
 * Placing an order, and reading one back.
 *
 * Public and unauthenticated, because guest checkout is a requirement. The
 * order is addressed afterwards by `access_token` — in the link the
 * confirmation email carries — rather than by its number, which is printed on
 * paperwork and sequential.
 */
class CheckoutController extends Controller
{
    public function store(CheckoutRequest $request): JsonResponse
    {
        $cart = Cart::forToken($request->header('X-Cart-Token'));

        $cart->load(['items.product']);

        if ($cart->items->isEmpty()) {
            throw ValidationException::withMessages(['cart' => 'Your basket is empty.']);
        }

        /*
         * The address is required by the *basket*, not by the form.
         *
         * A digital-only order has nothing to deliver, and asking for a
         * delivery address to sell a licence is a form arguing with itself. So
         * the requirement is worked out here, where the basket has been read.
         */
        $needsShipping = $cart->items->contains(fn ($item) => $item->product?->type?->isShipped());
        $address = $request->input('address', []);

        if ($needsShipping) {
            $missing = collect(['line1', 'city', 'state', 'pin'])
                ->filter(fn (string $key) => blank($address[$key] ?? null))
                ->mapWithKeys(fn (string $key) => ["address.{$key}" => 'This is needed to deliver the order.'])
                ->all();

            if ($missing !== []) {
                throw ValidationException::withMessages($missing);
            }
        }

        $order = Checkout::place($cart, [
            'name' => $request->string('name')->value(),
            'email' => $request->string('email')->value(),
            'phone' => $request->string('phone')->value(),
            'billing_address' => $needsShipping || filled($address) ? $this->address($address) : null,
            'gst_required' => $request->boolean('gst_required'),
            'gstin' => $request->input('gstin'),
            'company_name' => $request->input('company_name'),
        ]);

        /*
         * The token is returned **once**, on the response to the request that
         * created the order, and it is what the confirmation page is addressed
         * by. It is not in any listing and not in any other response.
         */
        return (new OrderResource($order))
            ->additional(['meta' => ['access_token' => $order->access_token]])
            ->response()
            ->setStatusCode(201);
    }

    /**
     * One order, for whoever holds the link.
     *
     * The token is compared with `hash_equals` rather than `===`: it is a
     * secret being checked against a value somebody supplied, which is the
     * definition of a timing-attack target. The cost of getting that right is
     * one function call.
     *
     * A wrong token is a **404**, not a 403 — a 403 would confirm the order
     * number exists, and the numbers are sequential.
     */
    public function show(Request $request, string $orderNumber): JsonResource
    {
        $order = Order::where('order_number', $orderNumber)->firstOrFail();

        $token = (string) $request->query('token', '');

        abort_unless(hash_equals($order->access_token, $token), 404);

        return new OrderResource($order->load(['items', 'payments']));
    }

    /** @return array<string, string|null> */
    private function address(array $address): array
    {
        return [
            'line1' => $address['line1'] ?? null,
            'line2' => $address['line2'] ?? null,
            'city' => $address['city'] ?? null,
            'state' => $address['state'] ?? null,
            'pin' => $address['pin'] ?? null,
            'country' => $address['country'] ?? 'India',
        ];
    }
}
