<?php

namespace App\Notifications;

use App\Enums\PaymentMethod;
use App\Models\Order;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Money;
use App\Support\Store\OrderMail;
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
 * **It is the sales order, and its second half follows the payment method.**
 * It used to say "nothing has been charged" and offer a Pay button to every
 * order — right for a card somebody abandoned, wrong for the customer who had
 * just chosen to pay the courier, and useless to the one who needed our bank
 * account number, which was only on the order page. Every line item is here
 * now, and the closing block is read from `PaymentOptions::forOrder()` — the
 * same array the order page renders — through `OrderMail`, so the email and
 * the page cannot give two account numbers. The receipt, `OrderPaid`, stays
 * the confirmation that money arrived.
 */
class OrderPlaced extends Notification implements ShouldQueue
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
        return 'order_placed';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $order = $this->order->loadMissing('items');

        return [
            'order_number' => $order->order_number,
            'customer_name' => $order->customer_name,
            'total' => Money::format($order->total_paise),
            'gst' => Money::format($order->gst_paise),
            'items' => OrderMail::itemsHtml($order),
            'payment' => OrderMail::paymentHtml($order),
            'payment_method' => (PaymentMethod::tryFrom((string) $order->payment_method) ?? PaymentMethod::Gateway)->label(),
            'payment_status' => OrderMail::paymentStatus($order),
            'url' => $order->url(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('items');
        $method = PaymentMethod::tryFrom((string) $order->payment_method) ?? PaymentMethod::Gateway;

        $message = (new MailMessage)
            ->subject("Your order {$order->order_number} — ".OrderMail::paymentStatus($order))
            ->greeting("Thanks, {$order->customer_name}.")
            ->line("Your order **{$order->order_number}** is saved. You chose to pay by {$method->label()}.");

        foreach (OrderMail::itemLines($order) as $line) {
            $message->line($line);
        }

        $message->line('Total: **'.Money::format($order->total_paise).'** (including GST of '.Money::format($order->gst_paise).').');

        foreach (OrderMail::paymentLines($order) as $line) {
            $message->line($line);
        }

        return $message
            ->action(OrderMail::asksForPayment($order) ? 'Pay for this order' : 'View your order', $order->url())
            ->line('Keep this link — it is how you come back to the order at any time.');
    }
}
