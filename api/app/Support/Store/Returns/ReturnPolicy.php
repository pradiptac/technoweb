<?php

namespace App\Support\Store\Returns;

use App\Enums\OrderStatus;
use App\Enums\ReturnReason;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderReturn;
use App\Models\Setting;
use App\Support\Store\Fulfilment;
use Carbon\CarbonInterface;

/**
 * Whether an order may send something back, what, and until when
 * (docs/store.md "Returns").
 *
 * One definition, read by the customer's order page (to decide whether to
 * offer the form), by the request (to refuse what the page should not have
 * offered) and by the console. Three questions:
 *
 *   - **Is it offered at all?** `store_returns_enabled`, a switch on Store →
 *     Settings. The window's length is `store_return_days`, the figure the
 *     product pages and the Google feed already state — a second number here
 *     would be a second promise.
 *   - **Is this order inside its window?** The window opens when the order
 *     is dispatched and is counted from the day it was *delivered*:
 *     `completed_at` when the desk has marked it complete, otherwise the
 *     dispatch date plus the longest transit time the shop quotes — the
 *     reading that never closes a window on a parcel still in a van.
 *   - **How many of each line?** What was bought, less what other returns
 *     of this order already hold. Only a line that ships and was sold as
 *     returnable: a licence key cannot be handed back, and `returnable` is
 *     the order line's own snapshot of what the product page said that day.
 */
final class ReturnPolicy
{
    public static function enabled(): bool
    {
        return (bool) Setting::get('store_returns_enabled', true);
    }

    /** The last moment a return may be asked for, or null before the order has left. */
    public static function deadline(Order $order): ?CarbonInterface
    {
        $delivered = $order->completed_at
            ?? $order->dispatched_at?->copy()->addDays(Fulfilment::transitDays()['max']);

        if ($order->dispatched_at === null || $delivered === null) {
            return null;
        }

        return $delivered->copy()->addDays(Fulfilment::returnDays())->endOfDay();
    }

    /** Why this order cannot send anything back, in a sentence — or null when it can. */
    public static function refusal(Order $order): ?string
    {
        if (! self::enabled()) {
            return 'Returns are not arranged online. Contact us and we will help directly.';
        }

        if (in_array($order->status, [OrderStatus::Cancelled, OrderStatus::Refunded], true)) {
            return 'This order was '.strtolower($order->status->label()).', so there is nothing to return.';
        }

        $deadline = self::deadline($order);

        if ($deadline === null || ! in_array($order->status, [OrderStatus::Dispatched, OrderStatus::Completed], true)) {
            return 'A return can be asked for once the order has been dispatched.';
        }

        if (now()->greaterThan($deadline)) {
            return 'The return window for this order closed on '.$deadline->format('j F Y').'.';
        }

        return null;
    }

    /**
     * How many of each line may still be sent back: order line id => count.
     * Every line of the order is present; one that cannot be returned is 0.
     *
     * @return array<int, int>
     */
    public static function returnable(Order $order): array
    {
        $order->loadMissing('items');

        $held = [];
        foreach (OrderReturn::query()->where('order_id', $order->id)->with('items')->get() as $return) {
            if (! $return->holdsQuantity()) {
                continue;
            }
            foreach ($return->items as $line) {
                $held[$line->order_item_id] = ($held[$line->order_item_id] ?? 0) + (int) $line->quantity;
            }
        }

        $out = [];
        foreach ($order->items as $item) {
            $out[$item->id] = self::lineReturns($item)
                ? max(0, (int) $item->quantity - ($held[$item->id] ?? 0))
                : 0;
        }

        return $out;
    }

    /** A line that ships and was sold as returnable. */
    public static function lineReturns(OrderItem $item): bool
    {
        return (bool) $item->returnable && $item->type->isShipped();
    }

    /**
     * What the customer's order page needs to draw the form — or to say why
     * there is none.
     *
     * @return array<string, mixed>
     */
    public static function describe(Order $order): array
    {
        $refusal = self::refusal($order);
        $returnable = self::returnable($order);
        $deadline = self::deadline($order);
        $anything = array_sum($returnable) > 0;

        return [
            'enabled' => self::enabled(),
            'open' => $refusal === null && $anything,
            // Null when the form is offered; otherwise the one sentence to show.
            'message' => $refusal ?? ($anything ? null : 'Nothing on this order is left to return.'),
            'closes_on' => $deadline?->toDateString(),
            'closes_label' => $deadline?->format('j F Y'),
            'days' => Fulfilment::returnDays(),
            'items' => collect($returnable)->map(fn (int $n, int $id) => ['order_item_id' => $id, 'returnable' => $n])->values()->all(),
            'reasons' => ReturnReason::options(),
            'max_photos' => ReturnPhotos::MAX_PHOTOS,
            'max_photo_kb' => ReturnPhotos::MAX_KB,
        ];
    }
}
