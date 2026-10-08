<?php

namespace App\Notifications;

use App\Models\OrderReturn;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Money;
use App\Support\Store\Returns\ReturnMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

/**
 * What a customer is told about their return (docs/store.md "Returns"):
 * that it was received, accepted, not accepted, that the goods arrived, and
 * that the money went back. One class for the five, because they differ in
 * a sentence and share everything else — the `VisitConfirmed` shape — and
 * five template keys, so an editor can word each on its own.
 *
 * Nothing here echoes the customer's own words back: `details` is typed
 * into a form anybody holding an order link can reach, and a message this
 * server sends on request must not be a relay for what the sender wrote.
 */
class ReturnStatusChanged extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public const REQUESTED = 'return_requested';

    public const APPROVED = 'return_approved';

    public const REJECTED = 'return_rejected';

    public const GOODS_RECEIVED = 'return_goods_received';

    public const REFUNDED = 'return_refunded';

    public function __construct(public OrderReturn $return, public string $key) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return $this->key;
    }

    protected function templateData(object $notifiable): array
    {
        $return = $this->return->loadMissing(['order', 'items.orderItem']);

        return [
            'reference' => $return->reference,
            'order_number' => $return->order->order_number,
            'customer_name' => $return->order->customer_name,
            'items' => ReturnMail::itemsHtml($return),
            'note' => (string) $return->decision_note,
            'instructions' => ReturnMail::instructions(),
            'amount' => $return->refund_paise !== null ? Money::format($return->refund_paise) : '',
            'refund_reference' => (string) $return->refundPayment?->reference,
            'url' => $return->order->url(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $return = $this->return->loadMissing(['order', 'items.orderItem']);
        $order = $return->order;

        $message = (new MailMessage)->greeting("Hello {$order->customer_name},");

        match ($this->key) {
            self::APPROVED => $message
                ->subject("Your return {$return->reference} is approved")
                ->line("We have approved return **{$return->reference}** for order {$order->order_number}."),
            self::REJECTED => $message
                ->subject("About your return {$return->reference}")
                ->line("We have looked at return **{$return->reference}** for order {$order->order_number}, and we are not able to accept it."),
            self::GOODS_RECEIVED => $message
                ->subject("We have received your return {$return->reference}")
                ->line("The items for return **{$return->reference}** have reached us. We will check them and be in touch about the refund."),
            self::REFUNDED => $message
                ->subject("Your refund for return {$return->reference}")
                ->line('We have refunded **'.Money::format((int) $return->refund_paise)."** for return {$return->reference}."),
            default => $message
                ->subject("We have your return request {$return->reference}")
                ->line("We have received your request to return items from order {$order->order_number}. Its reference is **{$return->reference}**.")
                ->line('We will look at it and email you with what happens next. Please do not send anything back until we have approved it.'),
        };

        foreach (ReturnMail::itemLines($return) as $line) {
            $message->line($line);
        }

        if ($this->key === self::APPROVED && filled(ReturnMail::instructions())) {
            // A line that means markup is an HtmlString; everything else is text.
            $message->line(new HtmlString(nl2br(e(ReturnMail::instructions()))));
        }

        if (in_array($this->key, [self::APPROVED, self::REJECTED], true) && filled($return->decision_note)) {
            $message->line(new HtmlString(nl2br(e((string) $return->decision_note))));
        }

        if ($this->key === self::REFUNDED && filled($return->refundPayment?->reference)) {
            $message->line("Reference: {$return->refundPayment->reference}. It can take a few working days to show on your statement.");
        }

        return $message->action('View your order', $order->url());
    }
}
