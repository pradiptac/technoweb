<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The account was not activated.
 *
 * Sent because the alternative is somebody waiting indefinitely for an email
 * that is never coming. It deliberately carries no reason: the staff note is
 * internal, and "we could not match you to a support contract" is a
 * conversation for a person to have, with a way to reply.
 */
class CustomerRejected extends Notification
{
    use Queueable;

    public function __construct(public ?string $supportEmail = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject('About your Technoware portal registration')
            ->greeting('Thanks for registering')
            ->line('We were not able to activate a support portal account for this address.')
            ->line('This usually means we could not match the address to a current support agreement.');

        if (filled($this->supportEmail)) {
            $mail->line('If you think that is wrong, reply to '.$this->supportEmail.' and we will sort it out.');
        }

        return $mail->salutation('— Technoware');
    }
}
