<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Store\CheckoutRequest;
use App\Http\Resources\Store\OrderResource;
use App\Models\Cart;
use App\Models\Customer;
use App\Models\Order;
use App\Support\Address;
use App\Support\Store\Checkout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;
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

        /*
         * Delivered somewhere else, or not.
         *
         * `shipping_same` defaults to true when the key is absent, which is
         * both the common case and what every caller that predates this field
         * meant. Read only when the basket actually ships something: a licence
         * has no delivery address, and validating one somebody left half-typed
         * would refuse an order that needs no address at all.
         */
        $shipElsewhere = $needsShipping && $request->has('shipping_same') && ! $request->boolean('shipping_same');
        $shippingInput = $request->input('shipping_address', []);

        if ($needsShipping) {
            /*
             * Both addresses are checked, not whichever one the parcel goes to.
             *
             * Requiring only the delivery address was the first cut and it left
             * a hole: ticking "deliver somewhere else" made the billing block
             * optional, so an order could be placed with an invoice address
             * that was blank. The frontend marks both `required` and the
             * frontend is not the boundary.
             *
             * The messages differ because the fields do different jobs — one
             * is where the invoice is made out to, the other is where the
             * parcel goes — and a person reading an error under a field wants
             * to know why *that* one is being asked for.
             */
            $blocks = [['address', $address, 'This is needed for the invoice.']];

            if ($shipElsewhere) {
                $blocks[] = ['shipping_address', $shippingInput, 'This is needed to deliver the order.'];
            }

            $missing = [];

            foreach ($blocks as [$field, $values, $message]) {
                foreach (['line1', 'city', 'state', 'pin'] as $key) {
                    if (blank($values[$key] ?? null)) {
                        $missing["{$field}.{$key}"] = $message;
                    }
                }
            }

            if ($missing !== []) {
                throw ValidationException::withMessages($missing);
            }
        }

        /*
         * Who is buying, when somebody is signed in.
         *
         * Named by guard: this route is public, so `$request->user()` asks
         * the default guard, which nothing here populates — a signed-in
         * customer would arrive as a guest. The portal token is forwarded by
         * the checkout's Server Action, and a staff token is not a customer.
         * It decides whose saved address the order may replace; see
         * `Checkout::accountFor()`.
         */
        $buyer = $request->user('sanctum');

        $order = Checkout::place($cart, [
            'customer_id' => $buyer instanceof Customer ? $buyer->id : null,
            'name' => $request->string('name')->value(),
            'email' => $request->string('email')->value(),
            'phone' => $request->string('phone')->value(),
            'customer_note' => $request->input('customer_note'),
            'billing_address' => $needsShipping || filled($address) ? $this->address($address) : null,
            // Null when it is the same, which is what `Checkout::shippingAddress`
            // already falls back on — the order stores one address rather than
            // two identical ones.
            'shipping_address' => $shipElsewhere ? $this->address($shippingInput) : null,
            'gst_required' => $request->boolean('gst_required'),
            'gstin' => $request->input('gstin'),
            'company_name' => $request->input('company_name'),
            'payment_method' => $request->input('payment_method'),
            'message_opt_in' => (array) $request->input('message_opt_in', []),
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

        return new OrderResource($order->load(['items', 'payments', 'returns.items.orderItem', 'returns.photos']));
    }

    /**
     * The invoice, to whoever holds the order's link (0.176.0).
     *
     * `has_invoice` has been on the customer's order since the store
     * shipped and there was **no route behind it** — a flag telling a buyer
     * their invoice exists, on a page with no way to open it. This is that
     * route. It is the same token the page itself is read with, compared
     * the same way, and a wrong one is the same 404 a wrong number is.
     *
     * Streamed from the private disk, never a URL: the document carries a
     * name, an address and a GSTIN, and a public path for one is a file
     * anybody who guesses a filename can read. `private, no-store`, because
     * a shared or proxy cache holding somebody's invoice is a copy nobody
     * authorised.
     */
    public function invoice(Request $request, string $orderNumber)
    {
        $order = Order::where('order_number', $orderNumber)->firstOrFail();

        abort_unless(hash_equals($order->access_token, (string) $request->query('token', '')), 404);

        return self::streamInvoice($order);
    }

    /**
     * The one place an invoice is handed to a customer, shared with the
     * portal so the two doors cannot differ on what they check.
     *
     * **Only for a paid order.** An invoice is a record of money received;
     * handing one to somebody who has not paid is handing them a document
     * their own accountant may act on.
     */
    public static function streamInvoice(Order $order)
    {
        abort_unless($order->paid_at !== null, 404);
        abort_unless(filled($order->invoice_path) && Storage::disk('local')->exists($order->invoice_path), 404);

        return Storage::disk('local')->download(
            $order->invoice_path,
            'invoice-'.str_replace(['/', '\\', ' '], '-', $order->invoice_number ?: $order->order_number).'.pdf',
            ['Cache-Control' => 'private, no-store'],
        );
    }

    /** @return array<string, string|null> */
    /** One definition of the shape, shared with the portal's profile screen. */
    private function address(array $address): array
    {
        return Address::normalise($address);
    }
}
