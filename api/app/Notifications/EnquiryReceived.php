<?php

namespace App\Notifications;

use App\Models\Enquiry;
use App\Models\Lead;
use App\Notifications\Concerns\QueuedMail;
use App\Support\Crm\LeadMailLines;
use App\Support\HtmlSanitiser;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** To the sales inbox, when the public contact form is used. */
class EnquiryReceived extends Notification implements ShouldQueue
{
    use QueuedMail;

    /**
     * The lead is optional, and stays optional.
     *
     * `LeadIntake` swallows its own failures so that a submission can never be
     * lost to a pipeline problem, which means null is a state this has to
     * render rather than assume away. Without it the message still says
     * everything it said before; with it, it says where the form was and links
     * to the record.
     */
    public function __construct(public Enquiry $enquiry, public ?Lead $lead = null) {}

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

        $message->line(str(HtmlSanitiser::toText($e->message ?? ''))->limit(800)->value());

        LeadMailLines::add($message, $this->lead);

        return $message
            // Reply-to the enquirer so hitting reply in the mail client goes
            // where it should, rather than to the site's own from address.
            ->replyTo($e->email, $e->name)
            ->salutation('— Technoware');
    }
}
