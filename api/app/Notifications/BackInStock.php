<?php

namespace App\Notifications;

use App\Models\StockNotice;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Money;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

/**
 * "It is back": the product somebody asked to hear about has stock again.
 *
 * Sent once per notice by `SendStockNotices`, which stamps the row as it
 * goes — so this class never decides whether to send, only what to say.
 * The price is the price *now*, read off the product when the job runs,
 * because a figure remembered from the day somebody asked is a quote the
 * shop did not make. The cancel link removes this one notice and no other:
 * it is not an unsubscribe, and it must not read like one.
 */
class BackInStock extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(
        public StockNotice $notice,
        public StoreProduct $product,
        public ?StoreProductVariation $variation = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'back_in_stock';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'product_name' => $this->product->name,
            'variation_name' => $this->variation !== null ? $this->variation->name : '',
            'price' => Money::format($this->pricePaise()),
            'url' => $this->productUrl(),
            'cancel_url' => $this->cancelUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $name = $this->variation !== null
            ? "{$this->product->name} — {$this->variation->name}"
            : $this->product->name;

        return (new MailMessage)
            ->subject("{$this->product->name} is back in stock")
            ->greeting('Good news.')
            ->line("**{$name}** is back in stock at ".Money::format($this->pricePaise()).'.')
            ->line('You asked us to let you know. This is the one message we will send about it.')
            ->action('See the product', $this->productUrl())
            // An `HtmlString`, so the Markdown link survives the secured
            // encoding every other line gets: this one is ours, built from a
            // URL we minted, and is the only line here meant to be a link.
            ->line(new HtmlString('Did not ask for this? [Cancel the notice]('.$this->cancelUrl().') and we will not email you about it again.'));
    }

    /** The variation's price when it has one of its own, the product's otherwise — the price today. */
    private function pricePaise(): int
    {
        $own = $this->variation !== null ? $this->variation->price_paise : null;

        return (int) ($own ?? $this->product->price_paise);
    }

    private function productUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/store/products/'.$this->product->slug;
    }

    private function cancelUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/store/notify/cancel/'.$this->notice->token;
    }
}
