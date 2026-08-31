<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Concerns\QueuedMail;
use App\Support\Money;
use App\Support\Store\DigitalFulfilment;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * To the shop, when money has arrived.
 *
 * Sent on **payment** rather than at checkout, deliberately: an unpaid order is
 * not work, and a desk told about every abandoned basket stops reading the
 * alerts. The same reasoning customer registration follows, where the support
 * desk hears about a confirmed address and not about a submitted form.
 *
 * It leads with whatever needs doing, because that is the only reason to open
 * it — a licence key nobody has issued is somebody actively waiting.
 */
class OrderReceived extends Notification implements ShouldQueue
{
    use QueuedMail;

    public function __construct(public Order $order) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('items');

        $message = (new MailMessage)
            ->subject("New order {$order->order_number} - ".Money::format($order->total_paise))
            ->greeting('A paid order has come in.')
            ->line("**{$order->order_number}** from {$order->customer_name} ({$order->customer_email}).");

        foreach ($order->items as $item) {
            $message->line("{$item->quantity} x {$item->name}"
                .($item->variation_name ? " ({$item->variation_name})" : ''));
        }

        if (DigitalFulfilment::isOutstanding($order)) {
            $message->line('**An activation code is outstanding.** The customer is waiting on it.');
        }

        if ($order->shipping_address !== null) {
            $message->line('This one needs dispatching.');
        }

        return $message->action('Open the order', rtrim((string) config('app.frontend_url'), '/')
            .'/admin/store/orders/'.$order->order_number);
    }
}
