<?php

namespace App\Notifications;

use App\Models\Enquiry;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** To the sales inbox, when the public contact form is used. */
class EnquiryReceived extends Notification
{
    use Queueable;

    public function __construct(public Enquiry $enquiry) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $e = $this->enquiry;

        $message = (new MailMessage)
            ->subject('Website enquiry: '.($e->subject ?: 'no subject'))
            ->greeting('New enquiry from the website.')
            ->line("**{$e->name}**".($e->company ? " · {$e->company}" : ''))
            ->line($e->email.($e->phone ? " · {$e->phone}" : ''));

        if ($e->subject) {
            $message->line("Subject: {$e->subject}");
        }

        return $message
            ->line(str($e->message ?? '')->stripTags()->squish()->limit(800)->value())
            // Reply-to the enquirer so hitting reply in the mail client goes
            // where it should, rather than to the site's own from address.
            ->replyTo($e->email, $e->name)
            ->salutation('— Technoware');
    }
}
