<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Concerns\QueuedMail;
use App\Support\Money;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * To the buyer, the moment an order exists and before it is paid.
 *
 * Sent because a checkout that ends on a payment screen is a checkout people
 * abandon by closing the tab, and the order they left behind is then reachable
 * by exactly one link — this one. Without it a customer who lost the tab has
 * lost the order, and the first the shop hears of it is a telephone call.
 *
 * **It carries the payment link and says nothing has been charged.** Both
 * halves matter: the link is the only way back, and somebody who sees an order
 * confirmation without that sentence reasonably assumes the money has gone.
 */
class OrderPlaced extends Notification implements ShouldQueue
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

        return (new MailMessage)
            ->subject("Your order {$order->order_number} — payment not yet made")
            ->greeting("Thanks, {$order->customer_name}.")
            ->line("Your order **{$order->order_number}** is saved, and **nothing has been charged**.")
            ->line('Total: '.Money::format($order->total_paise).' (including GST of '.Money::format($order->gst_paise).').')
            ->action('Pay for this order', $this->order->url())
            ->line('Keep this link — it is how you come back to the order at any time.');
    }
}
