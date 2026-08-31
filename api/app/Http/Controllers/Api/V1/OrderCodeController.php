<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DigitalCode;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Revealing an activation code to the person who bought it.
 *
 * **A POST, not a GET, and deliberately.** It is an action with a consequence:
 * the reveal is recorded, and "they say they never received it" against a row
 * saying it was revealed three times from their own account is the whole of
 * that conversation. A GET would also be pre-fetched by a browser, logged by
 * every proxy in the path with the URL, and cached — none of which is
 * acceptable for the thing being handed over.
 *
 * **The code never appears in an ordinary order read.** `OrderResource` says
 * only that a line *has* one. Somebody has to ask, and asking is recorded —
 * which is the "controlled reveal" the brief asks for rather than a code
 * printed on a page anybody with the link may leave open on a shared screen.
 *
 * Three conditions, all of which must hold: the order's token verifies, the
 * order is paid, and the line belongs to that order. The second is the one
 * worth naming — a code released before payment is a licence given away.
 */
class OrderCodeController extends Controller
{
    public function reveal(Request $request, string $orderNumber, int $item): JsonResponse
    {
        $order = Order::where('order_number', $orderNumber)->firstOrFail();

        // `hash_equals`, and a 404 rather than a 403: a 403 would confirm the
        // order number exists, and the numbers are sequential.
        abort_unless(hash_equals($order->access_token, (string) $request->input('token', '')), 404);

        if (! $order->status->isPaid()) {
            return response()->json([
                'message' => 'This order has not been paid, so there is nothing to reveal yet.',
            ], 422);
        }

        // Scoped to this order. A line somebody else bought is simply not found.
        $line = $order->items()->whereKey($item)->firstOrFail();

        $codes = DigitalCode::where('order_item_id', $line->id)->orderBy('id')->get();

        if ($codes->isEmpty()) {
            /*
             * Paid, digital, and nothing to hand over — which happens when the
             * inventory ran out or the shop fulfils by hand. Said plainly
             * rather than as an error: the customer has done nothing wrong and
             * somebody is already dealing with it.
             */
            return response()->json([
                'message' => 'Your code is being prepared. We will email it shortly.',
                'data' => [],
            ], 202);
        }

        $codes->each->recordReveal();

        return response()->json(['data' => $codes->map(fn (DigitalCode $c) => [
            'id' => $c->id,
            // The one place in the application that publishes a code, to the
            // one person entitled to it.
            'code' => $c->code,
            'delivered_at' => $c->delivered_at?->toIso8601String(),
        ])->all()]);
    }
}
