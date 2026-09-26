<?php

namespace App\Notifications;

use App\Models\WishlistItem;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Money;
use App\Support\Store\WishlistMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * "Something on your wishlist is back."
 *
 * Sent once per arrival by `SyncWishlistStock`, which claims the line before
 * it sends — so this class never decides whether to send, only what to say.
 * The price is the price *now*. The stop link switches the list's emails off
 * and nothing else: it is not an unsubscribe from the newsletter, and the
 * wording says so.
 */
class WishlistBackInStock extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public WishlistItem $item) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'wishlist_back_in_stock';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'product_name' => WishlistMail::productName($this->item),
            'price' => Money::format($this->item->currentPricePaise()),
            'url' => WishlistMail::productUrl($this->item),
            'wishlist_url' => WishlistMail::listUrl($this->item),
            'stop_url' => WishlistMail::stopUrl($this->item),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $name = WishlistMail::productName($this->item);

        return (new MailMessage)
            ->subject("{$name} is back in stock")
            ->greeting('Good news.')
            ->line("**{$name}**, on your wishlist, is back in stock at ".Money::format($this->item->currentPricePaise()).'.')
            ->action('See the product', WishlistMail::productUrl($this->item))
            ->line('[Your wishlist]('.WishlistMail::listUrl($this->item).') · [Stop these emails]('.WishlistMail::stopUrl($this->item).') — your list stays as it is.');
    }
}
