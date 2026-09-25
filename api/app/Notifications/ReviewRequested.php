<?php

namespace App\Notifications;

use App\Models\Order;
use App\Models\StoreProduct;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * "How was it?" — the request for a review, a week after delivery.
 *
 * Sent once per order by `technoware:request-reviews`, which stamps the
 * order as it goes, so this class never decides whether to send — only what
 * to say. Each product is a link to its own page with `?review=1`, which
 * opens the reviews and the dialog; a product the customer has already
 * reviewed is left off by the command, so the list is only what is still
 * owed.
 */
class ReviewRequested extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    /** @param  array<int, StoreProduct>  $products */
    public function __construct(public Order $order, public array $products) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'review_request';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'customer_name' => $this->order->customer_name,
            'order_number' => $this->order->order_number,
            'products' => $this->productList(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)
            ->subject("How was your order {$this->order->order_number}?")
            ->greeting("Hello {$this->order->customer_name},")
            ->line('We hope everything arrived as it should. A line or two about what you bought helps the next person decide — and tells us what to keep doing.');

        foreach ($this->products as $product) {
            $message->line("[Review {$product->name}](".self::reviewUrl($product).')');
        }

        return $message->line('Every review is read by a person before it appears. Thank you for taking the time.');
    }

    /** One link per product, escaped — the one HTML placeholder here. */
    private function productList(): string
    {
        return '<ul>'.collect($this->products)->map(fn (StoreProduct $p) => '<li><a href="'.e(self::reviewUrl($p)).'">'
            .e($p->name).'</a></li>')->implode('').'</ul>';
    }

    public static function reviewUrl(StoreProduct $product): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/store/products/'.$product->slug.'?review=1';
    }
}
