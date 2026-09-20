<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
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
    use Templated;

    public function __construct(public Order $order) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'order_dispatched';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $order = $this->order;

        return [
            'order_number' => $order->order_number,
            'customer_name' => $order->customer_name,
            'courier' => $order->courier ?? '',
            'tracking_number' => $order->tracking_number ?? '',
            'notes' => $order->shipping_notes ?? '',
            // The courier's own page when there is one, because that is what
            // somebody pressing "track" expects; the order otherwise.
            'url' => filled($order->tracking_url)
                ? $order->tracking_url
                : rtrim((string) config('app.frontend_url'), '/')
                    .'/order/'.$order->order_number.'?token='.$order->access_token,
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
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
