<?php

namespace App\Support\Messaging;

use App\Enums\MessageChannel;
use App\Enums\MessageEvent;
use App\Models\Order;
use App\Models\Ticket;
use App\Support\Money;
use Illuminate\Support\Facades\Log;

/**
 * The fire points' one line each: the recipient and the placeholder values
 * for an order or a ticket event, built in one place so the four callers
 * cannot fill `order_total` four different ways.
 */
final class OrderMessages
{
    /**
     * The checkout's opt-in boxes, for the number typed at the checkout.
     * Recorded inside the order's transaction, before the order-placed
     * message is queued, so that message already reaches the new contact.
     *
     * @param  array<int, string>  $channels
     */
    public static function optIn(Order $order, array $channels): void
    {
        // Inside the checkout's transaction, so it must never throw: a
        // consent row that could not be written is not a reason to lose the order.
        try {
            foreach ($channels as $value) {
                $channel = MessageChannel::tryFrom((string) $value);

                if ($channel !== null && $channel->addressKind() === 'phone' && $channel->ready()) {
                    Contacts::optIn($channel, $order->customer_phone, $order->customer_id, 'checkout', $order->customer_name);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('A checkout messaging opt-in could not be recorded', ['order' => $order->order_number, 'error' => $e->getMessage()]);
        }
    }

    public static function order(MessageEvent $event, Order $order): void
    {
        Messenger::notify($event, new MessageRecipient($order->customer_id, $order->customer_phone, $order->customer_name), [
            'order_number' => $order->order_number,
            'order_total' => Money::format((int) $order->total_paise),
            'order_url' => $order->url(),
            'courier' => $order->courier,
            'tracking_number' => $order->tracking_number,
            'tracking_url' => $order->tracking_url,
        ]);
    }

    /** A customer-visible reply only — never an internal note; the caller checks. */
    public static function ticketReplied(Ticket $ticket): void
    {
        $customer = $ticket->customer;

        if ($customer === null) {
            return;
        }

        Messenger::notify(MessageEvent::TicketReplied, MessageRecipient::customer($customer), [
            'reference' => $ticket->reference,
            'subject' => $ticket->subject,
            'ticket_url' => rtrim((string) config('app.frontend_url'), '/').'/portal/tickets/'.$ticket->reference,
        ]);
    }
}
