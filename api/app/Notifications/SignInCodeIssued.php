<?php

namespace App\Notifications;

use App\Enums\SignInAudience;
use App\Support\SignInCodes;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The code itself.
 *
 * **No link.** A one-time code is typed back into the tab the person is
 * already standing in, which is what makes it resistant to the thing a magic
 * link is not: a link is clickable from anywhere, arrives in a mailbox that
 * may be shared or forwarded, and leaves the secret in browser history and in
 * any referrer along the way. Typing a code also means the browser that
 * finishes the sign-in is the one that started it.
 *
 * The audience is named in the subject and the body, because the two sign-ins
 * are different doors and the same person may legitimately have both. "Your
 * code for the admin console" arriving when you asked for the portal is the
 * one signal a reader has that something is wrong.
 */
class SignInCodeIssued extends Notification
{
    use Queueable;

    public function __construct(
        public string $code,
        public SignInAudience $audience,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $where = $this->audience === SignInAudience::Admin
            ? 'the Technoware admin console'
            : 'the Technoware support portal';

        return (new MailMessage)
            ->subject('Your sign-in code: '.$this->code)
            ->greeting('Your sign-in code')
            ->line('Enter this code to sign in to '.$where.':')
            // On its own line and nothing else on it, so it survives being
            // read on a phone, in a notification preview, and by whatever
            // strips the formatting out.
            ->line($this->code)
            ->line('It expires in '.SignInCodes::TTL_MINUTES.' minutes and can be used once.')
            /*
             * The sentence that matters most in this email.
             *
             * A code arriving unasked-for is the earliest warning anybody gets
             * that their address is being tried, and it is the only warning
             * this system can give — the sign-in form is deliberately
             * uninformative, so nothing else about the attempt is visible to
             * the person it concerns.
             */
            ->line('If you did not ask to sign in, ignore this email — nobody can use the code without it, and it will expire on its own. If codes keep arriving, tell us.')
            ->salutation('— Technoware');
    }
}
