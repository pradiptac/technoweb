<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Support\Store\Returns\ReturnPickups;
use App\Support\Store\Shipping\CourierSettings;
use App\Support\Store\Shipping\ShipmentStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * The courier platform telling us where a parcel is (0.143.0, docs/store.md
 * "Shiprocket").
 *
 * **The address is `/store/shipping/webhooks/courier` and may not name the
 * platform.** Shiprocket refuses a webhook URL containing "shiprocket",
 * "kartrocket", "sr" or "kr"; `ShiprocketTest` reads the route's URI for all
 * four.
 *
 * It follows the messaging webhooks' shape: **it answers 200 whatever
 * happened** — Shiprocket wants a bare 200 and retries on anything else, and
 * a retried bad request is still bad — and it **fails closed**. The payload
 * carries no signature, only an optional security token sent as `x-api-key`;
 * with no token saved nothing is accepted, and the header is compared with
 * `hash_equals`. A forged call could otherwise mark orders dispatched and
 * delivered, and email customers about it.
 *
 * What it does with a scan is `ShipmentStatus::apply()`, which never moves
 * an order backwards and ignores a status it cannot place. It matches the
 * order by Shiprocket's own order id (`sr_order_id`) before the AWB: the
 * `order_id` in the payload is our reference as Shiprocket holds it, and
 * "may carry a suffix", so it is not trusted to match.
 */
class CourierWebhookController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        try {
            $this->handle($request);
        } catch (Throwable $e) {
            logger()->warning('Courier webhook: could not be processed', ['error' => $e->getMessage()]);
        }

        return response()->json(['ok' => true]);
    }

    private function handle(Request $request): void
    {
        $token = CourierSettings::webhookToken();

        if ($token === '' || ! hash_equals($token, (string) $request->header('x-api-key'))) {
            return;
        }

        if (CourierSettings::provider() !== CourierSettings::SHIPROCKET) {
            return;
        }

        $id = $request->input('shipment_status_id');

        if (! is_numeric($id)) {
            return;
        }

        // A return pickup's scans are a different parcel going the other way
        // (0.159.0): they update that pickup's status and nothing else � the
        // return's own status and the order are never touched by a scan.
        if ((int) $request->input('is_return', 0) === 1) {
            $return = $this->findReturn($request);

            if ($return !== null) {
                ReturnPickups::apply($return, (int) $id);
            }

            return;
        }

        $order = $this->find($request);

        if ($order === null) {
            return;
        }

        ShipmentStatus::apply($order, (int) $id, $this->deliveredAt($request));
    }

    private function findReturn(Request $request): ?OrderReturn
    {
        $base = OrderReturn::query()->where('pickup_booking', 'created');
        $sr = $request->input('sr_order_id');

        if (is_scalar($sr) && (string) $sr !== '') {
            $return = (clone $base)->where('pickup_sr_order_id', (string) $sr)->first();

            if ($return !== null) {
                return $return;
            }
        }

        $awb = $request->input('awb');

        return is_scalar($awb) && (string) $awb !== ''
            ? (clone $base)->where('pickup_awb', (string) $awb)->first()
            : null;
    }

    private function find(Request $request): ?Order
    {
        $base = Order::query()->where('shipment_booking', 'created')->where('shipment_provider', CourierSettings::SHIPROCKET);

        $sr = $request->input('sr_order_id');

        if (is_scalar($sr) && (string) $sr !== '') {
            $order = (clone $base)->where('shipment_order_id', (string) $sr)->first();

            if ($order !== null) {
                return $order;
            }
        }

        $awb = $request->input('awb');

        return is_scalar($awb) && (string) $awb !== ''
            ? (clone $base)->where('tracking_number', (string) $awb)->first()
            : null;
    }

    /** The scan's time, for a delivery: `current_timestamp` arrives as `dd mm yyyy hh:mm:ss`. */
    private function deliveredAt(Request $request): ?string
    {
        $stamp = $request->input('current_timestamp');

        if (! is_string($stamp)) {
            return null;
        }

        try {
            // unverified against a real account: the format and the timezone of `current_timestamp`.
            return Carbon::createFromFormat('d m Y H:i:s', $stamp, config('app.timezone'))->format('Y-m-d H:i:s');
        } catch (Throwable) {
            return null;
        }
    }
}
