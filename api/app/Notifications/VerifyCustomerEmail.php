<?php

namespace App\Notifications;

use App\Models\Customer;
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
 * Proves the person who typed an address can read it.
 *
 * Without this, anyone can register somebody else's address — and since a
 * portal account is what a support ticket hangs off, the address is the one
 * thing about a registration that has to be true.
 *
 * The link points at the frontend, which posts the token back to the API. The
 * API has no HTML to serve, and a link that lands on a JSON endpoint is a link
 * that looks broken to the person who clicked it.
 */
class VerifyCustomerEmail extends Notification
{
    use Queueable;

    public function __construct(
        public string $token,
        public string $email,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $base = rtrim(config('app.frontend_url'), '/');
        $url = $base.'/portal/verify-email?token='.urlencode($this->token).'&email='.urlencode($this->email);

        return (new MailMessage)
            ->subject('Confirm your email address')
            ->greeting('Almost there')
            ->line('Confirm this address so we know we can reach you about your support tickets.')
            ->action('Confirm my address', $url)
            ->line('This link works once and expires in '.Customer::VERIFICATION_HOURS.' hours.')
            // Said plainly, because it is the part people are surprised by: a
            // confirmed address is not yet an account they can sign in to.
            ->line('Once confirmed, a member of our team reviews the account and activates it. We will email you when that is done.')
            ->line('If you did not ask for this, you can ignore this email — no account will be created.')
            ->salutation('— Technoware');
    }
}
