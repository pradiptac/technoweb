<?php

namespace App\Support\Store\Returns;

use App\Enums\ReturnStatus;
use App\Models\OrderItem;
use App\Models\OrderReturn;
use App\Models\User;
use App\Support\Address;
use App\Support\IndianStates;
use App\Support\Store\Fulfilment;
use App\Support\Store\Shipping\CourierSettings;
use App\Support\Store\Shipping\Shipments;
use App\Support\Store\Shipping\ShipmentStatus;
use App\Support\Store\Shipping\Shiprocket;
use App\Support\Store\Shipping\ShiprocketRefused;
use App\Support\Store\ShippingQuote;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The courier collecting an approved return from the customer (0.159.0,
 * docs/store.md "Return pickups"): `Shipments` run the other way round.
 *
 * **Book once.** Creating Shiprocket's return order is behind a conditional
 * claim on `order_returns.pickup_booking`, exactly `Shipments::book()`'s: a
 * duplicate `order_id` has no documented answer, so two presses cannot both
 * create it. The reference is the return's (`RMA-…`), then `RMA-…-2` after a
 * cancelled or failed attempt.
 *
 * **The roles are swapped.** Shiprocket's `pickup_*` is where the courier
 * collects — the customer, from the order's delivery address — and its
 * `shipping_*` is where it goes — the seller, the chosen pickup location,
 * read from Shiprocket itself so the address on the parcel is the one the
 * warehouse is known by. Lines go at the price the order sold them for.
 *
 * **A refusal stops at the step that failed** and is stored on
 * `pickup_error`; pressing Book again carries on from there (the AWB, then
 * the pickup request) without a second order. Nothing here changes the
 * return's own status: "Receive" is a person's tick, not a scan's.
 */
final class ReturnPickups
{
    private const CLAIM_MINUTES = 10;

    /** Why this return cannot be booked now, or null. */
    public static function refusalToBook(OrderReturn $return): ?string
    {
        if (! CourierSettings::active()) {
            return 'Return pickups are booked with Shiprocket, which is not switched on.';
        }

        if ($return->status !== ReturnStatus::Approved) {
            return 'A pickup can be booked once the return is approved.';
        }

        $return->loadMissing(['order', 'items.orderItem']);

        if ($return->items->isEmpty()) {
            return 'This return names no items.';
        }

        if (self::customerAddress($return) === null) {
            return 'The order has no address for the courier to collect from.';
        }

        return null;
    }

    /** Whether the booking is made and still lacks its courier or its pickup request. */
    public static function incomplete(OrderReturn $return): bool
    {
        return $return->pickup_booking === 'created'
            && ($return->pickup_awb === null || $return->pickup_requested_at === null);
    }

    /** Whether a press of Book will be taken. */
    public static function canBook(OrderReturn $return): bool
    {
        if (self::refusalToBook($return) !== null) {
            return false;
        }

        return in_array($return->pickup_booking, [null, 'failed', 'cancelled'], true)
            || ($return->pickup_booking === 'creating' && $return->pickup_claimed_at?->lt(now()->subMinutes(self::CLAIM_MINUTES)))
            || self::incomplete($return);
    }

    /** Whether there is a live booking to cancel: made, and not yet settled. */
    public static function canCancel(OrderReturn $return): bool
    {
        return CourierSettings::active()
            && $return->pickup_booking === 'created'
            && filled($return->pickup_sr_order_id)
            && ! ShipmentStatus::settled($return->pickup_status_id);
    }

    /** Couriers and prices for collecting it: customer PIN to the seller's. @return array<string, mixed> */
    public static function rates(OrderReturn $return): array
    {
        if ($why = self::refusalToBook($return)) {
            throw new ShiprocketRefused($why);
        }

        $client = new Shiprocket;
        $seller = $client->pickupLocation(CourierSettings::pickupLocation());
        $from = (string) (self::customerAddress($return)['pin'] ?? '');
        $grams = self::weightGrams($return);

        return [
            'couriers' => $client->serviceability($from, $seller['pin'], $grams, false, intdiv(self::goodsPaise($return), 100), true),
            'weight_grams' => $grams,
            'pickup_pin' => $from,
            'delivery_pin' => $seller['pin'],
            'cod' => false,
        ];
    }

    /**
     * The body of Shiprocket's create-return-order call.
     *
     * @param  array<string, mixed>  $seller  a pickup location, as `Shiprocket::pickupLocation()` reads it
     * @return array<string, mixed>
     */
    public static function payload(OrderReturn $return, array $seller, int $attempt): array
    {
        $return->loadMissing(['order', 'items.orderItem']);
        $order = $return->order;
        $address = self::customerAddress($return) ?? Address::normalise([]);
        $size = CourierSettings::parcel();

        return [
            'order_id' => $attempt > 1 ? $return->reference.'-'.$attempt : $return->reference,
            'order_date' => now()->timezone(config('app.timezone'))->format('Y-m-d'),
            // The customer: where the courier collects.
            'pickup_customer_name' => Str::limit((string) $order->customer_name, 100, ''),
            'pickup_address' => Str::limit((string) ($address['line1'] ?? ''), 190, ''),
            'pickup_address_2' => Str::limit((string) ($address['line2'] ?? ''), 190, ''),
            'pickup_city' => Str::limit((string) ($address['city'] ?? ''), 30, ''),
            'pickup_state' => self::stateName($address),
            'pickup_country' => (string) ($address['country'] ?? 'India') ?: 'India',
            'pickup_pincode' => (int) preg_replace('/\D/', '', (string) ($address['pin'] ?? '')),
            'pickup_email' => (string) $order->customer_email,
            'pickup_phone' => (int) Shipments::phone((string) $order->customer_phone),
            // The seller: where it goes back to.
            'shipping_customer_name' => Str::limit($seller['contact'] !== '' ? $seller['contact'] : $seller['name'], 100, ''),
            'shipping_address' => Str::limit($seller['address'], 190, ''),
            'shipping_city' => Str::limit($seller['city'], 30, ''),
            'shipping_country' => 'India',
            'shipping_pincode' => (int) preg_replace('/\D/', '', $seller['pin']),
            'shipping_state' => $seller['state'],
            'shipping_phone' => (int) Shipments::phone($seller['phone']),
            ...($seller['email'] !== '' ? ['shipping_email' => $seller['email']] : []),
            'order_items' => $return->items->map(fn ($line) => [
                'name' => Str::limit(($line->orderItem->name ?? 'Item').(filled($line->orderItem->variation_name ?? null) ? ' — '.$line->orderItem->variation_name : ''), 190, ''),
                'sku' => filled($line->orderItem->sku ?? null) ? (string) $line->orderItem->sku : 'ITEM-'.$line->order_item_id,
                'units' => (int) $line->quantity,
                'selling_price' => Shipments::rupees((int) ($line->orderItem->unit_price_paise ?? 0)),
            ])->values()->all(),
            'payment_method' => 'PREPAID',
            'total_discount' => 0,
            'sub_total' => Shipments::rupees(self::goodsPaise($return)),
            'length' => max(1, (float) $size['length']),
            'breadth' => max(1, (float) $size['breadth']),
            'height' => max(1, (float) $size['height']),
            'weight' => Shipments::kg(self::weightGrams($return)),
        ];
    }

    /**
     * Create the return order, assign its courier and AWB, and ask for the
     * pickup. A return already created but unfinished is carried on from the
     * step that failed.
     */
    public static function book(OrderReturn $return, ?User $actor = null, ?int $courierId = null): OrderReturn
    {
        $return = $return->fresh(['order', 'items.orderItem']) ?? $return;

        if ($why = self::refusalToBook($return)) {
            throw new ShiprocketRefused($why);
        }

        if ($return->pickup_booking === 'created') {
            if (! self::incomplete($return)) {
                throw new ShiprocketRefused('A pickup is already booked for this return.');
            }

            return self::finish($return, $actor, $courierId, quiet: false);
        }

        $claimed = OrderReturn::query()->whereKey($return->id)
            ->where(function ($q) {
                $q->whereNull('pickup_booking')
                    ->orWhereIn('pickup_booking', ['failed', 'cancelled'])
                    ->orWhere(fn ($stale) => $stale->where('pickup_booking', 'creating')
                        ->where('pickup_claimed_at', '<', now()->subMinutes(self::CLAIM_MINUTES)));
            })
            ->update([
                'pickup_booking' => 'creating',
                'pickup_claimed_at' => now(),
                'pickup_attempts' => DB::raw('pickup_attempts + 1'),
                'pickup_error' => null,
                'pickup_sr_order_id' => null,
                'pickup_shipment_id' => null,
                'pickup_awb' => null,
                'pickup_courier' => null,
                'pickup_status_id' => null,
                'pickup_status' => null,
                'pickup_status_at' => null,
                'pickup_requested_at' => null,
                'pickup_checked_at' => null,
            ]);

        if ($claimed !== 1) {
            throw new ShiprocketRefused('A pickup is being booked for this return right now. Reload in a moment.');
        }

        $return = $return->fresh(['order', 'items.orderItem']) ?? $return;

        try {
            $client = new Shiprocket;
            $made = $client->createReturnOrder(self::payload(
                $return, $client->pickupLocation(CourierSettings::pickupLocation()), (int) $return->pickup_attempts,
            ));
        } catch (ShiprocketRefused $e) {
            $return->forceFill([
                'pickup_booking' => 'failed',
                'pickup_error' => Str::limit(
                    $e->getMessage().($e->unknown ? ' Shiprocket may still have received the order — check its panel before booking again.' : ''),
                    500,
                    '',
                ),
            ])->save();

            throw $e;
        }

        $return->forceFill([
            'pickup_booking' => 'created',
            'pickup_sr_order_id' => $made['order_id'],
            'pickup_shipment_id' => $made['shipment_id'],
            'pickup_error' => null,
        ])->save();

        self::trail($return, "Return pickup booked with Shiprocket (order {$made['order_id']}).", $actor);

        return self::finish($return->fresh(['order', 'items.orderItem']) ?? $return, $actor, $courierId, quiet: true);
    }

    /**
     * Cancel the pickup at Shiprocket (the AWB, then the order) and let the
     * return be booked again. Shiprocket refuses once the courier is out for
     * pickup, in its own words, and the booking is left as it was.
     */
    public static function cancel(OrderReturn $return, ?User $actor = null): OrderReturn
    {
        $return = $return->fresh(['order']) ?? $return;

        if (! self::canCancel($return)) {
            throw new ShiprocketRefused('There is no live pickup to cancel for this return.');
        }

        try {
            (new Shiprocket)->cancel((string) $return->pickup_sr_order_id, $return->pickup_awb);
        } catch (ShiprocketRefused $e) {
            $return->forceFill(['pickup_error' => Str::limit($e->getMessage(), 500, '')])->save();

            throw $e;
        }

        $return->forceFill(['pickup_booking' => 'cancelled', 'pickup_error' => null])->save();
        self::trail($return, 'Return pickup cancelled with Shiprocket'.($return->pickup_awb !== null ? " (AWB {$return->pickup_awb})" : '').'.', $actor);

        return $return->fresh(['order']) ?? $return;
    }

    /**
     * Take a scan in — the webhook's `is_return: 1` and the tracker. Only
     * the pickup's own status is written: never the return's status, never
     * the order's. Monotonic and idempotent, `ShipmentStatus`'s rules, from
     * its table.
     *
     * @return string `applied`, `same`, `older` or `unknown`
     */
    public static function apply(OrderReturn $return, int $id): string
    {
        $info = ShipmentStatus::MAP[$id] ?? null;

        if ($info === null) {
            return 'unknown';
        }

        $outcome = 'applied';

        DB::transaction(function () use ($return, $id, $info, &$outcome) {
            $row = OrderReturn::query()->whereKey($return->id)->lockForUpdate()->first();

            if ($row === null || $row->pickup_booking !== 'created') {
                $outcome = 'older';

                return;
            }

            if ($row->pickup_status_id === $id) {
                $outcome = 'same';

                return;
            }

            if ($info[1] < ShipmentStatus::rank($row->pickup_status_id)) {
                $outcome = 'older';

                return;
            }

            $row->forceFill([
                'pickup_status_id' => $id,
                'pickup_status' => $info[0],
                'pickup_status_at' => now(),
                // The courier's own cancellation frees the return to be booked again.
                ...($info[2] === 'cancelled' ? ['pickup_booking' => 'cancelled'] : []),
            ])->save();

            $row->loadMissing('order');
            self::trail($row, "Return pickup: {$info[0]}.", null);

            $return->setRawAttributes($row->getAttributes(), true);
        });

        return $outcome;
    }

    /**
     * The open pickups the tracker still has something to ask about.
     *
     * @return Builder<OrderReturn>
     */
    public static function trackable(): Builder
    {
        return OrderReturn::query()
            ->where('pickup_booking', 'created')
            ->whereNotNull('pickup_awb')
            ->whereIn('status', [ReturnStatus::Approved->value, ReturnStatus::Received->value])
            ->where(fn ($q) => $q->whereNull('pickup_status_id')
                ->orWhereNotIn('pickup_status_id', array_keys(array_filter(ShipmentStatus::MAP, fn ($m) => in_array($m[2], ['done', 'returned', 'cancelled'], true)))));
    }

    /* ------------------------------------------------------------- helpers */

    /** AWB and pickup request, in turn, each skipped once done. `$quiet` keeps a refusal on the return rather than throwing. */
    private static function finish(OrderReturn $return, ?User $actor, ?int $courierId, bool $quiet): OrderReturn
    {
        try {
            if ($return->pickup_awb === null) {
                $awb = (new Shiprocket)->assignAwb((string) $return->pickup_shipment_id, $courierId, isReturn: true);

                $return->forceFill([
                    'pickup_awb' => Str::limit($awb['awb'], 120, ''),
                    'pickup_courier' => Str::limit($awb['courier'] !== '' ? $awb['courier'] : 'Shiprocket', 120, ''),
                    'pickup_error' => null,
                ])->save();
                self::trail($return, 'Return pickup courier assigned: '.trim($awb['courier'].' · AWB '.$awb['awb'], ' ·'), $actor);
            }

            if ($return->pickup_requested_at === null) {
                $said = (new Shiprocket)->requestPickup((string) $return->pickup_shipment_id);

                $return->forceFill(['pickup_requested_at' => now(), 'pickup_error' => null])->save();
                self::trail($return, 'Return pickup requested. '.Str::limit($said, 200, ''), $actor);
            }
        } catch (ShiprocketRefused $e) {
            $return->forceFill(['pickup_error' => Str::limit($e->getMessage(), 500, '')])->save();

            if (! $quiet) {
                throw $e;
            }
        }

        return $return->fresh(['order', 'items.orderItem']) ?? $return;
    }

    /** The grams coming back: each line's units at its own unit weight, as a forward parcel's are worked out. */
    public static function weightGrams(OrderReturn $return): int
    {
        $return->loadMissing('items.orderItem.product', 'items.orderItem.variation');

        $grams = 0;

        foreach ($return->items as $line) {
            $item = $line->orderItem;

            if (! $item instanceof OrderItem) {
                continue;
            }

            $unit = $item->product !== null
                ? ShippingQuote::unitWeight($item->product, $item->variation)
                : Fulfilment::defaultWeightGrams();

            $grams += max(0, (int) $line->quantity) * $unit;
        }

        return max(1, $grams);
    }

    /** What the lines came to, at the price each sold for, in paise. */
    private static function goodsPaise(OrderReturn $return): int
    {
        $return->loadMissing('items.orderItem');

        return (int) $return->items->sum(fn ($line) => (int) $line->quantity * (int) ($line->orderItem->unit_price_paise ?? 0));
    }

    /** @return array<string, mixed>|null */
    private static function customerAddress(OrderReturn $return): ?array
    {
        $return->loadMissing('order');

        return $return->order !== null ? Shipments::address($return->order) : null;
    }

    /** @param  array<string, mixed>  $address */
    private static function stateName(array $address): string
    {
        $state = (string) ($address['state'] ?? '');

        return IndianStates::name(IndianStates::code($state)) ?? $state;
    }

    private static function trail(OrderReturn $return, string $note, ?User $actor): void
    {
        $return->loadMissing('order');

        $return->order?->history()->create([
            'to_status' => $return->order->status->value,
            'note' => "{$return->reference}: {$note}",
            'user_id' => $actor?->id,
            'actor_name' => $actor?->name,
        ]);
    }
}
