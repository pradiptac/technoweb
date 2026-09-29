<?php

namespace App\Notifications;

use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Mail\MailBrand;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * "You asked to rejoin — confirm it": the way back for an address that
 * unsubscribed. Sent by `App\Support\Newsletter\Rejoin::offer()` when the
 * public signup form is given an address suppressed for its own unsubscribe;
 * following the link is what lifts it.
 *
 * **It echoes nothing the form was given** — not the name, not the groups.
 * The signup is public, so this is a message the server sends to an address
 * somebody else may have typed; fixed wording keeps that a nuisance at worst
 * (and the address hears at most once a day), never a relay.
 *
 * Queued, like every message nobody is waiting on at a form with no other way
 * in. The raw token rides in the queued job until it is sent — the table holds
 * only its hash — which is the same exposure every queued link here has, for a
 * link whose whole power is to put one address back on a newsletter.
 */
class NewsletterRejoinRequested extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public string $token, public int $days) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'newsletter_rejoin';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'url' => $this->url(),
            'days' => (string) $this->days,
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Confirm you want to rejoin the '.MailBrand::name().' newsletter')
            ->greeting('Welcome back?')
            ->line('Somebody asked to sign this address up to our newsletter. You unsubscribed earlier, so we will not add you back unless you confirm it.')
            ->action('Yes, add me back', $this->url())
            ->line('The link expires in '.$this->days.' days.')
            ->line('If you did not ask for this, ignore this email — nothing changes, and you stay unsubscribed.')
            ->salutation(MailBrand::signoff());
    }

    private function url(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/newsletter/rejoin/'.$this->token;
    }
}
