<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Money;
use App\Support\Store\DigitalFulfilment;
use App\Support\Store\OrderMail;
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
    use Templated;

    public function __construct(public Order $order) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'order_paid';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $order = $this->order->loadMissing('items');

        /*
         * The lines that apply to *this* order, built here because a template
         * cannot hold a conditional. Empty when none of them do, which is why
         * the catalogue marks it `html`: an empty string renders nothing
         * rather than an empty paragraph.
         */
        $notes = '';

        if ($order->items->contains(fn ($item) => $item->type?->needsCode())) {
            $notes .= '<p>'.(DigitalFulfilment::isOutstanding($order)
                ? 'Your activation code is being prepared — we will email you the moment it is ready.'
                : 'Your activation code is ready. Open your order to reveal it.').'</p>';
        }

        if ($order->shipping_address !== null) {
            $notes .= '<p>We will email the tracking details as soon as it is dispatched.</p>';
        }

        if ($order->gst_required) {
            $notes .= '<p>Your GST invoice is prepared by hand and will follow by email.</p>';
        }

        return [
            'order_number' => $order->order_number,
            'customer_name' => $order->customer_name,
            'total' => Money::format($order->total_paise),
            'gst' => Money::format($order->gst_paise),
            // The same list the confirmation carried, from the same helper.
            'items' => OrderMail::itemsHtml($order),
            'notes' => $notes,
            'url' => $order->url(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('items');

        $message = (new MailMessage)
            ->subject("Payment received for {$order->order_number}")
            ->greeting("Thank you, {$order->customer_name}.")
            ->line('We have your payment of **'.Money::format($order->total_paise)
                .'**, which includes GST of '.Money::format($order->gst_paise).'.');

        foreach (OrderMail::itemLines($order) as $line) {
            $message->line($line);
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
            ->action('View your order', $this->order->url())
            ->line('Keep this link - it is how you come back to the order at any time.');
    }
}
