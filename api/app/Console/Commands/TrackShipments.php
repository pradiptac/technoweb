<?php

namespace App\Console\Commands;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Support\Store\Shipping\CourierSettings;
use App\Support\Store\Shipping\ShipmentStatus;
use App\Support\Store\Shipping\Shiprocket;
use App\Support\Store\Shipping\ShiprocketRefused;
use Illuminate\Console\Command;

/**
 * Asks the courier platform where the parcels that are out are
 * (0.143.0, docs/store.md "Shiprocket").
 *
 * The webhook is the fast path and this is the one that cannot be missed: a
 * webhook is a promise from somebody else's servers, it carries no retry
 * policy anyone has written down, and a parcel whose last scan never arrived
 * would sit at "dispatched" for ever. Every thirty minutes it takes the
 * booked parcels that are not yet delivered, returned or cancelled — the one
 * checked longest ago first, a bounded number per run — and feeds what it
 * learns through the same `ShipmentStatus::apply()` the webhook uses.
 *
 * **It never throws.** It exits 0 whatever Shiprocket says: a refusal is
 * written to `shiprocket_error` by the client and the run stops, because a
 * refused sign-in would be refused for every remaining parcel too. A parcel
 * is stamped as checked *before* it is asked about, so one that always
 * fails cannot hold the front of the queue for ever. It does nothing at all
 * while the provider is manual, or the sign-in is not saved.
 */
class TrackShipments extends Command
{
    protected $signature = 'technoware:track-shipments {--limit=40 : Parcels to ask about in one run}';

    protected $description = 'Ask the courier platform where booked parcels are';

    public function handle(): int
    {
        if (! CourierSettings::active()) {
            return self::SUCCESS;
        }

        $limit = max(1, min(200, (int) $this->option('limit')));

        $orders = Order::query()
            ->where('shipment_booking', 'created')
            ->where('shipment_provider', CourierSettings::SHIPROCKET)
            ->whereNotNull('shipment_awb_at')
            ->whereNotNull('tracking_number')
            ->whereNull('delivered_at')
            ->whereNotIn('status', [OrderStatus::Cancelled->value, OrderStatus::Refunded->value])
            // Returned and cancelled are settled; a parcel coming back is still worth following.
            ->where(fn ($q) => $q->whereNull('shipment_problem')->orWhere('shipment_problem', 'returning'))
            ->orderByRaw('shipment_checked_at is not null')
            ->orderBy('shipment_checked_at')
            ->limit($limit)
            ->get();

        $client = new Shiprocket;
        $changed = 0;

        foreach ($orders as $order) {
            $order->forceFill(['shipment_checked_at' => now()])->save();

            try {
                $scan = $client->track((string) $order->tracking_number);
            } catch (ShiprocketRefused $e) {
                $this->warn("Stopped: {$e->getMessage()}");

                break;
            }

            if ($scan !== null && ShipmentStatus::apply($order, $scan['status_id'], $scan['delivered_at']) === 'applied') {
                $changed++;
            }
        }

        $this->info($orders->isEmpty() ? 'Nothing to track.' : "Asked about {$orders->count()} parcel(s); {$changed} moved.");

        return self::SUCCESS;
    }
}
