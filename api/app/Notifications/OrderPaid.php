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
 * The receipt.
 *
 * Careful about two things a shop routinely gets wrong.
 *
 * **It never contains an activation code.** A licence key in an inbox is a
 * licence key in every mail server it passed through and in whatever backs that
 * inbox up. The code is revealed from the order page, where the act is
 * recorded; this points there instead.
 *
 * **It says what happens next, and only what is true.** A physical order is
 * waiting to be packed; a digital one either has its code ready or is waiting
 * on somebody, and those are different sentences. Promising a code that is not
 * there is how a receipt turns into a complaint.
 */
class OrderPaid extends Notification implements ShouldQueue
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
            ->subject("Payment received for {$order->order_number}")
            ->greeting("Thank you, {$order->customer_name}.")
            ->line('We have your payment of **'.Money::format($order->total_paise)
                .'**, which includes GST of '.Money::format($order->gst_paise).'.');

        foreach ($order->items as $item) {
            $message->line("{$item->quantity} x {$item->name}"
                .($item->variation_name ? " ({$item->variation_name})" : '')
                .' - '.Money::format($item->line_total_paise));
        }

        if ($order->items->contains(fn ($item) => $item->type?->needsCode())) {
            $message->line(DigitalFulfilment::isOutstanding($order)
                ? 'Your activation code is being prepared - we will email you the moment it is ready.'
                : 'Your activation code is ready. Open your order to reveal it.');
        }

        if ($order->shipping_address !== null) {
            $message->line('We will email the tracking details as soon as it is dispatched.');
        }

        if ($order->gst_required) {
            // Said before somebody looks for a download that is not there: the
            // brief is explicit that the invoice is prepared by hand.
            $message->line('Your GST invoice is prepared by hand and will follow by email.');
        }

        return $message
            ->action('View your order', $this->url())
            ->line('Keep this link - it is how you come back to the order at any time.');
    }

    private function url(): string
    {
        return rtrim((string) config('app.frontend_url'), '/')
            .'/order/'.$this->order->order_number
            .'?token='.$this->order->access_token;
    }
}
