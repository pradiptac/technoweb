<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Concerns\QueuedMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * "It is on its way", with the tracking number in the body of the message.
 *
 * The number is written out as well as linked, because a courier's site is
 * exactly the sort of page that is down, slow, or asks for the number again —
 * and somebody standing at a gate needs the number, not a URL.
 *
 * The button goes to the courier when there is a link and to the order when
 * there is not. A button labelled "Track this shipment" that opens an order
 * summary is a button that lies.
 */
class OrderDispatched extends Notification implements ShouldQueue
{
    use QueuedMail;

    public function __construct(public Order $order) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order;

        $message = (new MailMessage)
            ->subject("Your order {$order->order_number} is on its way")
            ->greeting("Good news, {$order->customer_name}.")
            ->line("Order **{$order->order_number}** has been dispatched.");

        if (filled($order->courier)) {
            $message->line("Courier: **{$order->courier}**");
        }

        if (filled($order->tracking_number)) {
            $message->line("Tracking number: **{$order->tracking_number}**");
        }

        if (filled($order->shipping_notes)) {
            $message->line($order->shipping_notes);
        }

        return filled($order->tracking_url)
            ? $message->action('Track this shipment', $order->tracking_url)
            : $message->action('View your order', rtrim((string) config('app.frontend_url'), '/')
                .'/order/'.$order->order_number.'?token='.$order->access_token);
    }
}
