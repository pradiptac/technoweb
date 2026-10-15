<?php

namespace App\Notifications;

use App\Models\OrderReturn;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Store\Returns\ReturnMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A return has been asked for — to the desk (docs/store.md "Returns"), with
 * what is coming back and a link to decide it. The customer's own words are
 * read on that screen, not here: this goes to an inbox, and an inbox is
 * forwarded.
 */
class ReturnRequestReceived extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public OrderReturn $return) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'return_received_internal';
    }

    protected function templateData(object $notifiable): array
    {
        $return = $this->return->loadMissing(['order', 'items.orderItem']);

        return [
            'reference' => $return->reference,
            'order_number' => $return->order->order_number,
            'customer_name' => $return->order->customer_name,
            'customer_email' => $return->order->customer_email,
            'reason' => $return->reason->label(),
            'items' => ReturnMail::itemsHtml($return),
            'url' => rtrim((string) config('app.frontend_url'), '/').$return->adminPath(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $return = $this->return->loadMissing(['order', 'items.orderItem']);
        $order = $return->order;

        $message = (new MailMessage)
            ->subject("Return requested: {$return->reference} for order {$order->order_number}")
            ->greeting('A customer has asked to return something.')
            ->line("**{$return->reference}** — order {$order->order_number}, {$order->customer_name} ({$order->customer_email}).")
            ->line('Reason: '.$return->reason->label().'.');

        foreach (ReturnMail::itemLines($return) as $line) {
            $message->line($line);
        }

        return $message->action('Open the return', rtrim((string) config('app.frontend_url'), '/').$return->adminPath());
    }
}
