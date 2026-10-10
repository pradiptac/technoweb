<?php

namespace App\Support\Store\Shipping;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Support\Address;
use App\Support\IndianStates;
use App\Support\Money;
use App\Support\Store\Fulfilment;
use App\Support\Store\ShippingQuote;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Booking an order's parcel with the courier platform (0.143.0,
 * docs/store.md "Shiprocket"): the claim, the body Shiprocket is sent, the
 * courier and AWB, the pickup, the label and the cancellation.
 *
 * **Book once.** Creating Shiprocket's order is behind a conditional claim on
 * `orders.shipment_booking`, the `ZohoInvoices` pattern: two presses, or a
 * press and a retry, cannot both create it — a duplicate `order_id` has no
 * documented answer, so it is never retried blind. Each claim counts an
 * attempt, and every attempt after the first sends `{number}-{attempt}`:
 * Shiprocket will not take the id of a cancelled order, and a booking that
 * failed with no answer may or may not have been created.
 *
 * **Units are converted at the edge, on integers.** Weight leaves as a
 * three-place decimal *string* of kilograms built from grams by integer
 * division and remainder — never a float; money as rupees from paise;
 * sizes in centimetres, each above 0.5.
 *
 * **Only what a courier needs leaves.** The name, the phone number, the
 * delivery address, each shipped line's name, SKU, quantity and price, and
 * the order number. Not the customer's note, not the GSTIN, not the billing
 * address (the delivery address goes as both), not a digital line.
 *
 * A failure is `ShiprocketRefused`, local refusals ("this order is unpaid")
 * included — the controllers turn the message into a 422.
 */
final class Shipments
{
    /** A claim older than this was abandoned by whatever held it. */
    private const CLAIM_MINUTES = 10;

    /** Orders in these states are not shipped. */
    private const NOT_SHIPPABLE = [
        OrderStatus::PendingPayment, OrderStatus::Cancelled, OrderStatus::RefundRequested, OrderStatus::Refunded,
    ];

    /** Why this order cannot be booked now, or null. */
    public static function refusalToBook(Order $order): ?string
    {
        if (! CourierSettings::active()) {
            return CourierSettings::provider() === CourierSettings::SHIPROCKET
                ? 'Shiprocket is not fully set up: '.implode(' ', CourierSettings::missing())
                : 'Parcels are not booked with a courier platform on this site.';
        }

        $order->loadMissing('items');

        if (! $order->needsShipping()) {
            return 'This order has nothing to ship — it is a licence or a service.';
        }

        if (in_array($order->status, self::NOT_SHIPPABLE, true)) {
            return $order->status === OrderStatus::PendingPayment
                ? 'This order has not been paid yet, so there is nothing to ship.'
                : "An order that is {$order->status->label()} cannot be booked.";
        }

        // A prepaid order must have been paid; a cash-on-delivery one is booked as COD.
        if ($order->paid_at === null && $order->payment_method !== 'cod') {
            return 'This order has not been paid yet, so there is nothing to ship. Record the payment first.';
        }

        if ($order->delivered_at !== null) {
            return 'This order has already been delivered.';
        }

        if (self::address($order) === null) {
            return 'This order has no delivery address to send the parcel to.';
        }

        return null;
    }

    /**
     * The parcel's weight in grams: the order's own, which the checkout
     * recorded when it quoted the delivery, else worked out from the lines by
     * the same rule `ShippingQuote` uses for a basket.
     */
    public static function weightGrams(Order $order): int
    {
        if ((int) $order->shipping_weight_grams > 0) {
            return (int) $order->shipping_weight_grams;
        }

        $order->loadMissing(['items.product', 'items.variation']);

        $grams = 0;

        foreach ($order->items as $item) {
            if (! $item->type->isShipped()) {
                continue;
            }

            $unit = $item->product !== null
                ? ShippingQuote::unitWeight($item->product, $item->variation)
                : Fulfilment::defaultWeightGrams();

            $grams += max(0, (int) $item->quantity) * $unit;
        }

        return max(1, $grams);
    }

    /** What the booking form is prefilled with. */
    public static function defaults(Order $order): array
    {
        return ['weight_grams' => self::weightGrams($order)] + CourierSettings::parcel();
    }

    /**
     * The body of Shiprocket's create-order call.
     *
     * @param  array{weight_grams?: int|null, length?: int|float|null, breadth?: int|float|null, height?: int|float|null}  $parcel
     * @return array<string, mixed>
     */
    public static function payload(Order $order, array $parcel, int $attempt): array
    {
        $order->loadMissing('items');

        $address = self::address($order) ?? Address::normalise([]);
        $size = CourierSettings::parcel();
        $grams = (int) ($parcel['weight_grams'] ?? 0) > 0 ? (int) $parcel['weight_grams'] : self::weightGrams($order);

        $shipped = $order->items->filter(fn (OrderItem $item) => (bool) $item->type->isShipped())->values();
        $goods = (int) $shipped->sum('line_total_paise');

        // The discount is the order's, so a basket that also held a licence
        // carries its share only: the shipped lines' fraction of the subtotal.
        $discount = (int) $order->subtotal_paise > 0
            ? intdiv((int) $order->discount_paise * $goods, (int) $order->subtotal_paise)
            : 0;

        $state = IndianStates::name(IndianStates::code((string) ($address['state'] ?? ''))) ?? (string) ($address['state'] ?? '');

        return [
            // Shiprocket's reference, not its id: the first attempt is the order's number as it is.
            'order_id' => $attempt > 1 ? $order->order_number.'-'.$attempt : $order->order_number,
            'order_date' => ($order->placed_at ?? now())->copy()->timezone(config('app.timezone'))->format('Y-m-d H:i'),
            'pickup_location' => CourierSettings::pickupLocation(),
            'billing_customer_name' => Str::limit((string) $order->customer_name, 100, ''),
            'billing_address' => Str::limit((string) ($address['line1'] ?? ''), 190, ''),
            'billing_address_2' => Str::limit((string) ($address['line2'] ?? ''), 190, ''),
            'billing_city' => Str::limit((string) ($address['city'] ?? ''), 30, ''),
            'billing_pincode' => (int) preg_replace('/\D/', '', (string) ($address['pin'] ?? '')),
            'billing_state' => $state,
            'billing_country' => (string) ($address['country'] ?? 'India') ?: 'India',
            'billing_email' => (string) $order->customer_email,
            'billing_phone' => (int) self::phone((string) $order->customer_phone),
            // The delivery address is the only one a courier needs.
            'shipping_is_billing' => true,
            'order_items' => $shipped->map(fn (OrderItem $item) => [
                'name' => Str::limit($item->name.(filled($item->variation_name) ? ' — '.$item->variation_name : ''), 190, ''),
                'sku' => filled($item->sku) ? (string) $item->sku : 'ITEM-'.$item->id,
                'units' => (int) $item->quantity,
                'selling_price' => self::rupees((int) $item->unit_price_paise),
                'tax' => intdiv(Money::GST_BASIS_POINTS, 100),
            ])->all(),
            // "COD" or "Prepaid", exactly as the docs spell them.
            'payment_method' => $order->paid_at === null ? 'COD' : 'Prepaid',
            'shipping_charges' => self::rupees((int) $order->shipping_paise),
            'giftwrap_charges' => 0,
            'transaction_charges' => 0,
            'total_discount' => 0,
            // unverified against a real account: Shiprocket documents `sub_total` as "after deductions" and has no separate
            // COD amount, so the discount is taken off here (and `total_discount` left 0) to make
            // sub_total + shipping_charges the amount a COD parcel collects. Confirm on the first real COD order.
            'sub_total' => self::rupees(max(0, $goods - $discount)),
            'length' => max(1, (float) ($parcel['length'] ?? $size['length'])),
            'breadth' => max(1, (float) ($parcel['breadth'] ?? $size['breadth'])),
            'height' => max(1, (float) ($parcel['height'] ?? $size['height'])),
            'weight' => self::kg($grams),
        ];
    }

    /**
     * Create the order at Shiprocket, assign its courier and AWB, and write
     * both down. The first call is claimed; the AWB step's failure leaves the
     * booking made and says why on `shipment_error`, so "Assign courier"
     * can be pressed again without making a second order.
     *
     * @param  array<string, mixed>  $parcel
     */
    public static function book(Order $order, ?User $actor = null, array $parcel = [], ?int $courierId = null): Order
    {
        $order = $order->fresh(['items']) ?? $order;

        if ($why = self::refusalToBook($order)) {
            throw new ShiprocketRefused($why);
        }

        $before = $order->shipment_booking;

        $claimed = Order::query()->whereKey($order->id)
            ->where(function ($q) {
                $q->whereNull('shipment_booking')
                    ->orWhereIn('shipment_booking', ['failed', 'cancelled'])
                    ->orWhere(fn ($stale) => $stale->where('shipment_booking', 'creating')
                        ->where('shipment_claimed_at', '<', now()->subMinutes(self::CLAIM_MINUTES)))
                    // A parcel the courier itself cancelled or sent back may be booked again.
                    ->orWhere(fn ($again) => $again->where('shipment_booking', 'created')
                        ->whereIn('shipment_problem', ['cancelled', 'returned']));
            })
            ->update([
                'shipment_booking' => 'creating',
                'shipment_claimed_at' => now(),
                'shipment_provider' => CourierSettings::SHIPROCKET,
                'shipment_attempts' => DB::raw('shipment_attempts + 1'),
                'shipment_error' => null,
                'shipment_order_id' => null,
                'shipment_id' => null,
                'shipment_awb_at' => null,
                'shipment_pickup_at' => null,
                'shipment_cancelled_at' => null,
                'shipment_label_url' => null,
                'shipment_status_id' => null,
                'shipment_status' => null,
                'shipment_status_at' => null,
                'shipment_problem' => null,
                'shipment_checked_at' => null,
            ]);

        if ($claimed !== 1) {
            throw new ShiprocketRefused(
                $before === 'created'
                    ? 'This order is already booked with Shiprocket.'
                    : 'This order is being booked right now. Reload in a moment.',
            );
        }

        $order = $order->fresh(['items']) ?? $order;

        // A re-booking supersedes a courier and tracking number the last one wrote.
        if ($before === 'created' || $before === 'cancelled') {
            $order->forceFill(['courier' => null, 'tracking_number' => null, 'tracking_url' => null])->save();
        }

        try {
            $made = (new Shiprocket)->createOrder(self::payload($order, $parcel, (int) $order->shipment_attempts));
        } catch (ShiprocketRefused $e) {
            self::failed($order, $e);

            throw $e;
        }

        $order->forceFill([
            'shipment_booking' => 'created',
            'shipment_order_id' => $made['order_id'],
            'shipment_id' => $made['shipment_id'],
            'shipment_error' => null,
            'shipment_checked_at' => null,
        ])->save();

        self::trail($order, "Booked with Shiprocket (order {$made['order_id']}).", $actor);

        return self::assign($order->fresh(['items']) ?? $order, $actor, $courierId, quiet: true);
    }

    /**
     * Assign the courier (Shiprocket's default unless one is named) and write
     * the AWB where a hand-typed tracking number goes. `$quiet` keeps a
     * refusal on the order (`shipment_error`) instead of throwing, for the
     * booking call, which has already succeeded.
     */
    public static function assign(Order $order, ?User $actor = null, ?int $courierId = null, bool $quiet = false): Order
    {
        $order = self::booked($order);

        if ($order->shipment_awb_at !== null) {
            throw new ShiprocketRefused('A courier is already assigned to this parcel.');
        }

        try {
            $awb = (new Shiprocket)->assignAwb((string) $order->shipment_id, $courierId);
        } catch (ShiprocketRefused $e) {
            $order->forceFill(['shipment_error' => $e->getMessage()])->save();

            if ($quiet) {
                return $order->fresh(['items']) ?? $order;
            }

            throw $e;
        }

        $order->forceFill([
            'courier' => Str::limit($awb['courier'] !== '' ? $awb['courier'] : 'Shiprocket', 120, ''),
            'tracking_number' => Str::limit($awb['awb'], 120, ''),
            // unverified against a real account: the public tracking page's address.
            'tracking_url' => 'https://shiprocket.co/tracking/'.rawurlencode($awb['awb']),
            'shipment_awb_at' => now(),
            'shipment_error' => null,
        ])->save();

        self::trail($order, 'Courier assigned: '.trim($awb['courier'].' · AWB '.$awb['awb'], ' ·'), $actor);

        return $order->fresh(['items']) ?? $order;
    }

    /** Ask for the courier to collect it. */
    public static function pickup(Order $order, ?User $actor = null): Order
    {
        $order = self::booked($order);

        if ($order->shipment_awb_at === null) {
            throw new ShiprocketRefused('Assign a courier before asking for a pickup.');
        }

        try {
            $said = (new Shiprocket)->requestPickup((string) $order->shipment_id);
        } catch (ShiprocketRefused $e) {
            $order->forceFill(['shipment_error' => $e->getMessage()])->save();

            throw $e;
        }

        $order->forceFill(['shipment_pickup_at' => now(), 'shipment_error' => null])->save();
        self::trail($order, 'Pickup requested. '.Str::limit($said, 200, ''), $actor);

        return $order->fresh(['items']) ?? $order;
    }

    /** Make the label and keep its address. */
    public static function label(Order $order): Order
    {
        $order = self::booked($order);

        if ($order->shipment_awb_at === null) {
            throw new ShiprocketRefused('Assign a courier before making the label.');
        }

        try {
            $url = (new Shiprocket)->label((string) $order->shipment_id);
        } catch (ShiprocketRefused $e) {
            $order->forceFill(['shipment_error' => $e->getMessage()])->save();

            throw $e;
        }

        $order->forceFill(['shipment_label_url' => Str::limit($url, 500, ''), 'shipment_error' => null])->save();

        return $order->fresh(['items']) ?? $order;
    }

    /**
     * Cancel the booking at Shiprocket and take its courier and tracking off
     * the order. Shiprocket cancels the AWB later, and refuses once the
     * parcel is out for pickup — in which case its words come back and the
     * order is left exactly as it was.
     */
    public static function cancel(Order $order, ?User $actor = null): Order
    {
        $order = self::booked($order);

        if ($order->delivered_at !== null) {
            throw new ShiprocketRefused('This parcel has been delivered; there is nothing to cancel.');
        }

        $awb = $order->shipment_awb_at !== null ? $order->tracking_number : null;

        try {
            (new Shiprocket)->cancel((string) $order->shipment_order_id, $awb);
        } catch (ShiprocketRefused $e) {
            $order->forceFill(['shipment_error' => $e->getMessage()])->save();

            throw $e;
        }

        $order->forceFill([
            'shipment_booking' => 'cancelled',
            'shipment_cancelled_at' => now(),
            'shipment_label_url' => null,
            'shipment_error' => null,
            'courier' => $order->shipment_awb_at !== null ? null : $order->courier,
            'tracking_number' => $order->shipment_awb_at !== null ? null : $order->tracking_number,
            'tracking_url' => $order->shipment_awb_at !== null ? null : $order->tracking_url,
        ])->save();

        self::trail($order, 'Shipment cancelled with Shiprocket'.($awb !== null ? " (AWB {$awb})" : '').'.', $actor);

        return $order->fresh(['items']) ?? $order;
    }

    /* ------------------------------------------------------------- helpers */

    /** The order, with a live booking — or a refusal saying there is none. */
    private static function booked(Order $order): Order
    {
        $order = $order->fresh(['items']) ?? $order;

        if (! CourierSettings::active()) {
            throw new ShiprocketRefused('Shiprocket is not switched on.');
        }

        if ($order->shipment_booking !== 'created' || blank($order->shipment_id)) {
            throw new ShiprocketRefused('This order is not booked with Shiprocket yet.');
        }

        return $order;
    }

    private static function failed(Order $order, ShiprocketRefused $e): void
    {
        $order->forceFill([
            'shipment_booking' => 'failed',
            'shipment_error' => Str::limit(
                $e->getMessage().($e->unknown ? ' Shiprocket may still have received the order — check its panel before booking again.' : ''),
                500,
                '',
            ),
        ])->save();
    }

    private static function trail(Order $order, string $note, ?User $actor): void
    {
        $order->history()->create([
            'to_status' => $order->status->value,
            'note' => $note,
            'user_id' => $actor?->id,
            'actor_name' => $actor?->name,
        ]);
    }

    /** The address the parcel goes to: the delivery address, else the billing one. @return array<string, mixed>|null */
    private static function address(Order $order): ?array
    {
        foreach ([$order->shipping_address, $order->billing_address] as $candidate) {
            if (is_array($candidate) && ! Address::isBlank($candidate)) {
                return Address::normalise($candidate);
            }
        }

        return null;
    }

    /** Ten digits: a courier takes the number without `+91` or a leading zero. */
    public static function phone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if (strlen($digits) === 12 && str_starts_with($digits, '91')) {
            return substr($digits, 2);
        }

        if (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            return substr($digits, 1);
        }

        return $digits;
    }

    /** Grams as kilograms, three places, by integer division — never a float. */
    public static function kg(int $grams): string
    {
        $grams = max(1, $grams);

        return intdiv($grams, 1000).'.'.str_pad((string) ($grams % 1000), 3, '0', STR_PAD_LEFT);
    }

    /**
     * Paise as rupees for Shiprocket's money fields: a whole number when it
     * is one, else the exact two-place decimal from `Money`'s helper.
     * unverified against a real account: whether the money fields accept decimals (they are typed `integer`).
     */
    public static function rupees(int $paise): int|float
    {
        return $paise % 100 === 0 ? intdiv($paise, 100) : (float) Money::toRupeeString($paise);
    }
}
