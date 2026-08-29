<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/*
 * **Deliberately not queued**, unlike every other notification here.
 *
 * Somebody is sitting at a form waiting for this exact message — it is not an
 * announcement about something already saved, it is the next step of what they
 * are doing. The queue is drained by the scheduler once a minute, so queueing
 * this would mean a wait of up to a minute for a code or a link that is
 * expected in seconds, which is a sign-in nobody can use.
 *
 * The cost is that SMTP stays on the request path for this one route, and with
 * it the timing side-channel `SignInCodes` documents: an address with an
 * account behind it answers measurably slower. Closing that needs the send
 * queued *and* drained in seconds, which needs a daemon worker rather than a
 * cron — a deployment change, and the one thing here that is not code.
 */
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
