<?php

namespace App\Notifications;

use App\Models\Cart;
use App\Models\Coupon;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Money;
use App\Support\Store\Basket;
use App\Support\Store\CartReminders;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Symfony\Component\Mime\Email;

/**
 * "You left something in your basket" — the first reminder, or the second.
 *
 * **Two messages, one class**, the `TicketReplied` arrangement: the two differ
 * in wording and in the coupon, and one template cannot say both, so
 * `templateKey()` answers `cart_reminder_1` or `cart_reminder_2` and each is
 * edited on its own in Settings → Email templates. Both offer the same
 * variables, so an editor can move a line from one to the other.
 *
 * Sent by `CartReminders::send()`, which has already decided that it should
 * be — the switch, the delays, the quiet hours, the suppression list — so this
 * class decides only what to say. The basket is priced when the job runs, so
 * the email shows today's figures rather than the ones from when it was
 * queued; the coupon code was chosen by the command and is re-labelled here.
 *
 * **The link restores the basket; it never carries the cart token.** And the
 * email carries a real unsubscribe: the newsletter's own page, which accepts
 * this basket's restore token and puts the address on the suppression list —
 * the one do-not-mail list every campaign, notice and reminder reads.
 */
class CartReminder extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    /** @param  1|2  $number */
    public function __construct(
        public Cart $cart,
        public int $number,
        public ?string $couponCode = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return $this->number === 2 ? 'cart_reminder_2' : 'cart_reminder_1';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $summary = $this->summary();
        $coupon = $this->coupon();

        return [
            'customer_name' => $this->name(),
            'items' => $this->itemsHtml($summary['items']),
            'item_count' => (string) $summary['item_count'],
            'basket_total' => Money::format($summary['total_paise']),
            'basket_url' => $this->restoreUrl(),
            'coupon' => $coupon !== null
                ? '<p>Use the code <strong>'.e($coupon->code).'</strong> at the checkout for '.e($coupon->label()).'.</p>'
                : '',
            'coupon_code' => $coupon !== null ? $coupon->code : '',
            'unsubscribe_url' => $this->unsubscribeUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $summary = $this->summary();
        $coupon = $this->coupon();
        $unsubscribe = $this->unsubscribeUrl();

        $message = (new MailMessage)
            ->subject($this->number === 2 ? 'Your basket is still waiting' : 'You left something in your basket')
            ->greeting('Hello '.$this->name().',')
            ->line($this->number === 2
                ? 'The things you chose are still in your basket, and we have kept it for you.'
                : 'You started an order with us and did not finish it. Your basket is saved:');

        foreach ($summary['items'] as $line) {
            $message->line("{$line['quantity']} x {$line['name']}"
                .($line['variation_name'] ? " ({$line['variation_name']})" : '')
                .' - '.Money::format($line['line_total_paise']));
        }

        $message->line('Total: **'.Money::format($summary['total_paise']).'** including GST.');

        if ($coupon !== null) {
            $message->line("Use the code **{$coupon->code}** at the checkout for {$coupon->label()}.");
        }

        return $message
            ->action('Return to your basket', $this->restoreUrl())
            ->line('Prices and stock are checked again when you order, so the basket shows today\'s figures.')
            ->line("Rather not hear about baskets? [Unsubscribe]({$unsubscribe}) and we will not email you about one again.")
            ->withSymfonyMessage(function (Email $email) use ($unsubscribe) {
                // What puts the mail client's own unsubscribe button beside
                // the sender, instead of the "report spam" one — the same
                // header every campaign carries.
                $email->getHeaders()->addTextHeader('List-Unsubscribe', "<{$unsubscribe}>");
                $email->getHeaders()->addTextHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
            });
    }

    /** @return array{items: array<int, array<string, mixed>>, item_count: int, total_paise: int} */
    private function summary(): array
    {
        $summary = Basket::summarise($this->cart);

        return [
            'items' => $summary['items'],
            'item_count' => $summary['item_count'],
            // Goods less discount, never the basket's total: that one carries
            // a delivery charge quoted for whatever destination was last typed
            // (0.142.0), and a half-typed address is not a figure to email.
            'total_paise' => $summary['subtotal_paise'] - $summary['discount_paise'],
        ];
    }

    /** @param  array<int, array<string, mixed>>  $items */
    private function itemsHtml(array $items): string
    {
        $lines = collect($items)->map(fn (array $line) => '<li>'
            .e($line['quantity'].' × '.$line['name'].($line['variation_name'] ? " ({$line['variation_name']})" : ''))
            .' — '.e(Money::format($line['line_total_paise'])).'</li>')->implode('');

        return $lines !== '' ? "<ul>{$lines}</ul>" : '';
    }

    private function coupon(): ?Coupon
    {
        return filled($this->couponCode)
            ? Coupon::where('code', Coupon::normalise($this->couponCode))->first()
            : null;
    }

    private function name(): string
    {
        // Loaded here rather than assumed: the queued job restores the cart
        // on its own, and a lazy load is refused outside production.
        $customer = $this->cart->loadMissing('customer')->customer;
        $name = $customer !== null ? $customer->name : null;

        return filled($name) ? (string) $name : 'there';
    }

    private function restoreUrl(): string
    {
        return CartReminders::restoreUrl((string) $this->cart->restore_token);
    }

    private function unsubscribeUrl(): string
    {
        return CartReminders::unsubscribeUrl((string) $this->cart->restore_token);
    }
}
