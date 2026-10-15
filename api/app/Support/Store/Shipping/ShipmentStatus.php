<?php

namespace App\Support\Store\Shipping;

use App\Enums\OrderStatus;
use App\Models\Order;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * What a courier's status means for an order (0.143.0, docs/store.md
 * "Shiprocket"). The webhook and the tracker both end here, so the two
 * cannot disagree about what a scan does.
 *
 * **Read from the shipment-level status (`shipment_status_id`), never from
 * `current_status_id`.** Shiprocket has two numbering schemes — one for
 * shipments (7 Delivered, 8 Canceled, 17 Out for delivery) and one for
 * orders (7 Delivered, 5 Canceled, 19 Out for delivery) — and a webhook
 * carries both, the second unexplained. Only the first is mapped here.
 *
 * **It never moves backwards.** Delivery order and uniqueness are not
 * promised, scans repeat, and a late "in transit" must not undo "delivered".
 * Every mapped status has a rank, an update with a lower rank than the one
 * stored changes nothing, and the same status twice is a no-op — the
 * `MessageDelivery::rank()` rule for provider callbacks. An id that is not
 * in the table is ignored: it is a label we cannot place, and storing it
 * would let it outrank something we can.
 *
 * What a mapped status does:
 *   - picked up / shipped / handed over / in transit / out for delivery
 *     move the order to Dispatched through its own `moveTo()`, and the
 *     customer's dispatch notice goes out exactly as a manual dispatch's
 *     does (`DispatchNotice`);
 *   - delivered stamps `delivered_at` and moves the order to Completed,
 *     which is where the returns window starts counting;
 *   - RTO (the parcel is coming back), the courier's own cancellation: no
 *     status change — a person decides what that means — a line in the
 *     order's trail, and the dashboard's "parcels in trouble" figure.
 *
 * An order already further along (completed, cancelled, refunded) is never
 * moved back, and one nobody dispatched is walked through the states
 * `OrderStatus` allows rather than jumped.
 */
final class ShipmentStatus
{
    /**
     * id => [label, rank, kind]. `kind` is what the status does to the
     * order: `book` nothing (it is bookkeeping), `move` dispatches, `done`
     * delivers, or a `shipment_problem` value.
     *
     * @var array<int, array{0: string, 1: int, 2: string}>
     */
    public const MAP = [
        1 => ['AWB assigned', 10, 'book'],
        2 => ['Label generated', 11, 'book'],
        3 => ['Pickup scheduled', 20, 'book'],
        4 => ['Pickup queued', 20, 'book'],
        5 => ['Manifest generated', 15, 'book'],
        13 => ['Pickup error', 18, 'book'],
        15 => ['Pickup rescheduled', 20, 'book'],
        19 => ['Out for pickup', 22, 'book'],
        20 => ['Pickup exception', 18, 'book'],
        27 => ['Pickup booked', 20, 'book'],
        52 => ['Shipment booked', 10, 'book'],
        42 => ['Picked up', 30, 'move'],
        6 => ['Shipped', 30, 'move'],
        51 => ['Handed to courier', 30, 'move'],
        18 => ['In transit', 40, 'move'],
        50 => ['In flight', 40, 'move'],
        38 => ['Reached destination hub', 42, 'move'],
        17 => ['Out for delivery', 50, 'move'],
        9 => ['RTO initiated', 60, 'returning'],
        14 => ['RTO acknowledged', 61, 'returning'],
        40 => ['RTO: delivery failed again', 61, 'returning'],
        41 => ['RTO out for delivery', 62, 'returning'],
        46 => ['RTO in transit', 62, 'returning'],
        10 => ['RTO delivered', 70, 'returned'],
        8 => ['Cancelled', 90, 'cancelled'],
        45 => ['Cancelled before dispatch', 90, 'cancelled'],
        7 => ['Delivered', 100, 'done'],
    ];

    public static function label(?int $id): ?string
    {
        return $id !== null ? (self::MAP[$id][0] ?? null) : null;
    }

    public static function rank(?int $id): int
    {
        return $id !== null ? (self::MAP[$id][1] ?? 0) : 0;
    }

    /** Whether the tracker still has anything to ask about this parcel. */
    public static function settled(?int $id): bool
    {
        return in_array(self::MAP[$id ?? 0][2] ?? null, ['done', 'returned', 'cancelled'], true);
    }

    /**
     * Take a status in. Returns `applied`, `same`, `older` or `unknown`.
     *
     * `$deliveredAt` is the courier's own delivery time when it gave one
     * (`Y-m-d H:i:s`, taken as the application's timezone — unverified).
     */
    public static function apply(Order $order, int $id, ?string $deliveredAt = null): string
    {
        $info = self::MAP[$id] ?? null;

        if ($info === null) {
            return 'unknown';
        }

        $notices = false;
        $outcome = 'applied';

        DB::transaction(function () use ($order, $id, $info, $deliveredAt, &$notices, &$outcome) {
            // The row is locked: a webhook and the tracker can arrive together,
            // and a manual status change may be in flight beside them.
            $row = Order::query()->whereKey($order->id)->lockForUpdate()->first();

            if ($row === null || $row->shipment_booking !== 'created') {
                $outcome = 'older';

                return;
            }

            if ($row->shipment_status_id === $id) {
                $outcome = 'same';

                return;
            }

            if ($info[1] < self::rank($row->shipment_status_id)) {
                $outcome = 'older';

                return;
            }

            $row->forceFill([
                'shipment_status_id' => $id,
                'shipment_status' => $info[0],
                'shipment_status_at' => now(),
            ]);

            match ($info[2]) {
                'move' => $notices = self::dispatch($row),
                'done' => $notices = self::deliver($row, $deliveredAt),
                'returning', 'returned', 'cancelled' => self::trouble($row, $info[2], $info[0]),
                default => $row->save(),
            };

            // The caller's copy reads what was just written.
            $order->setRawAttributes($row->getAttributes(), true);
        });

        if ($notices) {
            try {
                DispatchNotice::send($order);
            } catch (Throwable $e) {
                // A dispatch that is saved must not be undone by a mail server.
                logger()->warning('Courier: could not send the dispatch notice', ['order' => $order->order_number, 'error' => $e->getMessage()]);
            }
        }

        return $outcome;
    }

    /** Whether a scan may take this order to Dispatched, and takes it. True when the customer is to be told. */
    private static function dispatch(Order $order): bool
    {
        $order->save();

        $note = 'Courier: '.$order->shipment_status.'.';

        if (! self::canDispatch($order)) {
            return false;
        }

        // Paid is not allowed straight to Dispatched; the desk would have
        // gone through "ready" first, and so does this.
        if ($order->status === OrderStatus::Paid) {
            $order->moveTo(OrderStatus::ReadyForDispatch, $note);
        }

        $order->moveTo(OrderStatus::Dispatched, $note);

        return true;
    }

    private static function deliver(Order $order, ?string $deliveredAt): bool
    {
        $order->delivered_at ??= self::parse($deliveredAt) ?? now();
        $order->save();

        $notices = false;
        $note = 'Courier: delivered.';

        if (self::canDispatch($order)) {
            if ($order->status === OrderStatus::Paid) {
                $order->moveTo(OrderStatus::ReadyForDispatch, $note);
            }

            $order->moveTo(OrderStatus::Dispatched, $note);
            $notices = true;
        }

        if ($order->status === OrderStatus::Dispatched) {
            $order->moveTo(OrderStatus::Completed, $note);
        }

        return $notices;
    }

    private static function trouble(Order $order, string $problem, string $label): void
    {
        $order->shipment_problem = $problem;
        $order->save();

        $order->history()->create([
            'to_status' => $order->status->value,
            'note' => match ($problem) {
                'returning' => "Courier: {$label} — the parcel is coming back to you. Decide what happens to this order.",
                'returned' => 'Courier: the parcel has been returned to you. Decide what happens to this order.',
                default => 'Courier: the shipment was cancelled. Book it again, or decide what happens to this order.',
            },
        ]);
    }

    /** The states a courier scan may take an order on to Dispatched from. */
    private static function canDispatch(Order $order): bool
    {
        return in_array($order->status, [
            OrderStatus::Confirmed, OrderStatus::Paid, OrderStatus::Processing, OrderStatus::ReadyForDispatch,
        ], true);
    }

    private static function parse(?string $value): ?Carbon
    {
        if (blank($value)) {
            return null;
        }

        try {
            // unverified against a real account: Shiprocket does not state the timezone of its dates.
            return Carbon::parse($value, config('app.timezone'));
        } catch (Throwable) {
            return null;
        }
    }
}
