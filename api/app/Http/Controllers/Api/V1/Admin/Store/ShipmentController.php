<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\Store\OrderResource;
use App\Models\Order;
use App\Support\Store\Shipping\Shipments;
use App\Support\Store\Shipping\ShipmentStatus;
use App\Support\Store\Shipping\Shiprocket;
use App\Support\Store\Shipping\ShiprocketRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Booking an order's parcel from its page (0.143.0, docs/store.md
 * "Shiprocket"): book, assign the courier, ask for a pickup, make the label,
 * cancel, and ask where it is now — and, since 0.159.0, quote the couriers
 * and make the manifest.
 *
 * `role:store_manager`, on the order's own routes â€” a press on an order, the
 * rule the Zoho invoice button follows. The connection is the
 * administrator's (`ShiprocketController`). Every action answers the order,
 * so the screen redraws from one shape; a refusal is a 422 in Shiprocket's
 * own words. With the provider on `manual` every one of these is a 422 and
 * nothing is sent anywhere.
 */
class ShipmentController extends Controller
{
    /** Create the order at Shiprocket, then assign its courier and AWB. */
    public function book(Request $request, Order $order): JsonResource|JsonResponse
    {
        $data = $request->validate([
            // Grams on the wire, like the order's own weight; the console shows kilograms.
            'weight_grams' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            // Each side above 0.5 cm, as Shiprocket requires; whole centimetres are what the form takes.
            'length' => ['nullable', 'integer', 'min:1', 'max:300'],
            'breadth' => ['nullable', 'integer', 'min:1', 'max:300'],
            'height' => ['nullable', 'integer', 'min:1', 'max:300'],
            'courier_id' => ['nullable', 'integer', 'min:1'],
        ]);

        return $this->run($order, fn () => Shipments::book(
            $order, $request->user(), array_filter($data, fn ($v, $k) => $k !== 'courier_id' && $v !== null, ARRAY_FILTER_USE_BOTH), $data['courier_id'] ?? null,
        ));
    }

    /** Assign the courier again, after a refusal (a low wallet, an unserviceable pincode), or a different one. */
    public function assign(Request $request, Order $order): JsonResource|JsonResponse
    {
        $data = $request->validate(['courier_id' => ['nullable', 'integer', 'min:1']]);

        return $this->run($order, fn () => Shipments::assign($order, $request->user(), $data['courier_id'] ?? null));
    }

    public function pickup(Request $request, Order $order): JsonResource|JsonResponse
    {
        return $this->run($order, fn () => Shipments::pickup($order, $request->user()));
    }

    public function label(Request $request, Order $order): JsonResource|JsonResponse
    {
        return $this->run($order, fn () => Shipments::label($order));
    }

    public function cancel(Request $request, Order $order): JsonResource|JsonResponse
    {
        return $this->run($order, fn () => Shipments::cancel($order, $request->user()));
    }

    /** Ask Shiprocket where it is now, without waiting for the next scan or the tracker. */
    public function track(Request $request, Order $order): JsonResource|JsonResponse
    {
        return $this->run($order, function () use ($order) {
            if (blank($order->tracking_number) || $order->shipment_booking !== 'created') {
                throw new ShiprocketRefused('This order has no booked parcel to track.');
            }

            $scan = (new Shiprocket)->track((string) $order->tracking_number);
            $order->forceFill(['shipment_checked_at' => now()])->save();

            if ($scan !== null) {
                ShipmentStatus::apply($order, $scan['status_id'], $scan['delivered_at']);
            }

            return $order->fresh() ?? $order;
        });
    }

    /** Couriers and what each would charge for this parcel (0.159.0). A quote: nothing is booked. */
    public function rates(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate(['weight_grams' => ['nullable', 'integer', 'min:1', 'max:1000000']]);

        try {
            $quote = Shipments::rates($order, $data['weight_grams'] ?? null);
        } catch (ShiprocketRefused $e) {
            return $this->refused($e);
        }

        return response()->json(['data' => $quote['couriers'], 'meta' => array_diff_key($quote, ['couriers' => 1])]);
    }

    /** The manifest for one order's parcel (0.159.0). */
    public function manifest(Request $request, Order $order): JsonResource|JsonResponse
    {
        return $this->run($order, function () use ($request, $order) {
            Shipments::manifest([$order], $request->user());

            return $order;
        });
    }

    /**
     * One manifest for many orders (0.159.0): the ones that are ready are on
     * it, the rest come back with the reason. Declared above `{order}`.
     */
    public function manifestMany(Request $request): JsonResponse
    {
        $data = $request->validate([
            'numbers' => ['required', 'array', 'min:1', 'max:50'],
            'numbers.*' => ['required', 'string', 'max:40', 'distinct'],
        ]);

        $orders = Order::query()->whereIn('order_number', $data['numbers'])->get();
        $missing = array_values(array_diff($data['numbers'], $orders->pluck('order_number')->all()));

        try {
            $made = Shipments::manifest($orders, $request->user());
        } catch (ShiprocketRefused $e) {
            return response()->json(['message' => $e->getMessage(), 'errors' => ['shipment' => [$e->getMessage()]]], 422);
        }

        $made['refused'] = array_merge($made['refused'], array_map(fn ($n) => ['number' => $n, 'message' => 'No such order.'], $missing));

        return response()->json($made);
    }

    private function refused(ShiprocketRefused $e): JsonResponse
    {
        return response()->json(['message' => $e->getMessage(), 'errors' => ['shipment' => [$e->getMessage()]]], 422);
    }

    /** @param  \Closure(): Order  $action */
    private function run(Order $order, \Closure $action): JsonResource|JsonResponse
    {
        try {
            $done = $action();
        } catch (ShiprocketRefused $e) {
            return $this->refused($e);
        }

        return new OrderResource($done->fresh()->load(['items', 'payments', 'history', 'notes']));
    }
}
