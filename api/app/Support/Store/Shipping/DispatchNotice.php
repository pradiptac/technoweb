<?php

namespace App\Support\Store\Shipping;

use App\Enums\MessageEvent;
use App\Models\Order;
use App\Notifications\OrderDispatched;
use App\Support\Messaging\OrderMessages;
use App\Support\Notifier;

/**
 * Telling the customer their order has gone, in one place.
 *
 * It was two lines in the console's status action. A courier's scan moves an
 * order to Dispatched from a webhook as well (0.143.0), and a notice written
 * out twice is a notice that one day goes out from one door and not the
 * other — or from both. Both doors call this, after the move, and nothing
 * else sends `OrderDispatched`.
 */
final class DispatchNotice
{
    public static function send(Order $order): void
    {
        $order = $order->fresh() ?? $order;

        Notifier::to($order->customer_email, new OrderDispatched($order));
        OrderMessages::order(MessageEvent::OrderDispatched, $order);
    }
}
