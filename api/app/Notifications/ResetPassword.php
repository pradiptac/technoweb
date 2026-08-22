<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The reset link, for either principal.
 *
 * The link points at the frontend, not the API — the API has no HTML — and
 * which frontend path it uses is the whole reason this class takes an
 * audience. A staff reset must never land a customer on the admin form, and a
 * customer must never be sent to it.
 */
class ResetPassword extends Notification
{
    use Queueable;

    public function __construct(
        public string $token,
        public string $email,
        /** "admin" or "portal" — decides which reset form the link opens. */
        public string $audience,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $base = rtrim(config('app.frontend_url'), '/');
        $path = $this->audience === 'admin' ? '/admin/reset-password' : '/portal/reset-password';
        $url = $base.$path.'?token='.urlencode($this->token).'&email='.urlencode($this->email);

        $minutes = config('auth.passwords.'.($this->audience === 'admin' ? 'users' : 'customers').'.expire', 60);

        return (new MailMessage)
            ->subject('Reset your Technoware password')
            ->greeting('Password reset')
            ->line('Someone asked to reset the password for this address.')
            ->action('Choose a new password', $url)
            ->line("This link works once and expires in {$minutes} minutes.")
            // No "if this was not you, your account may be at risk" alarm: a
            // reset request proves nothing, and the honest advice is simply
            // that ignoring it changes nothing.
            ->line('If you did not ask for this, you can ignore this email — nothing will change.')
            ->salutation('— Technoware');
    }
}
