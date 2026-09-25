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
 * "Something on your wishlist costs less."
 *
 * Sent by `SendWishlistPriceDrops`, once per drop: the job records the price
 * it told somebody about, and only a further fall from *that* is news again.
 * `$oldPaise` is the figure the drop was measured from — the price when it
 * was saved, or the last price they were told — so the email and the rule
 * agree about what "was" means.
 */
class WishlistPriceDrop extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public WishlistItem $item, public int $oldPaise, public int $newPaise) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'wishlist_price_drop';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'product_name' => WishlistMail::productName($this->item),
            'old_price' => Money::format($this->oldPaise),
            'new_price' => Money::format($this->newPaise),
            'saving_percent' => (string) $this->percent(),
            'url' => WishlistMail::productUrl($this->item),
            'wishlist_url' => WishlistMail::listUrl($this->item),
            'stop_url' => WishlistMail::stopUrl($this->item),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $name = WishlistMail::productName($this->item);

        return (new MailMessage)
            ->subject("{$name} is now ".Money::format($this->newPaise))
            ->greeting('A price came down.')
            ->line("**{$name}**, on your wishlist, was ".Money::format($this->oldPaise).' and is now '.Money::format($this->newPaise)." — {$this->percent()}% less.")
            ->action('See the product', WishlistMail::productUrl($this->item))
            ->line('[Your wishlist]('.WishlistMail::listUrl($this->item).') · [Stop these emails]('.WishlistMail::stopUrl($this->item).') — your list stays as it is.');
    }

    private function percent(): int
    {
        return $this->oldPaise > 0 ? (int) floor(($this->oldPaise - $this->newPaise) * 100 / $this->oldPaise) : 0;
    }
}
