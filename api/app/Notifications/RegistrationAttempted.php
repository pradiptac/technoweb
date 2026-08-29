<?php

namespace App\Notifications;

use App\Notifications\Concerns\QueuedMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sent when somebody registers with an address that already has an account.
 *
 * The registration endpoint answers identically whether or not the address is
 * known — otherwise it is a membership oracle, and this audience's addresses
 * are worth phishing. But answering identically means the real account holder
 * would never learn that someone tried, so they are told here instead: the
 * stranger at the form learns nothing, and the person who owns the address
 * learns everything.
 */
class RegistrationAttempted extends Notification implements ShouldQueue
{
    use QueuedMail;

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $base = rtrim(config('app.frontend_url'), '/');

        return (new MailMessage)
            ->subject('Someone tried to register with your address')
            ->greeting('You already have an account')
            ->line('Somebody just filled in the portal registration form using this address. You already have an account, so nothing was created and nothing has changed.')
            ->line('If that was you, sign in with your existing password instead.')
            ->action('Sign in', $base.'/portal/login')
            ->line('Forgotten it? Use the "Forgotten your password?" link on that page.')
            ->salutation('— Technoware');
    }
}
