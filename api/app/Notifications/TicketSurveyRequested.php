<?php

namespace App\Notifications;

use App\Models\Ticket;
use App\Models\TicketSurvey;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\InboundMail\MailHeaders;
use App\Support\Mail\MailBrand;
use App\Support\Tickets\Survey;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

/**
 * To the customer, when their ticket is closed: "how was it?"
 *
 * Five one-click ratings, each a link to the survey page with that answer
 * chosen. The link records **nothing** by itself: the page records the rating
 * when it runs in a browser, then asks for feedback worded for the score.
 * Mail scanners fetch every link, and a survey answered by the fetch itself
 * would say "Excellent" and "Very Bad" for the same ticket in the same
 * second.
 *
 * Says nothing about what the ticket was about beyond its reference and
 * subject, so a sensitive one leaks nothing it would not already put in the
 * subject line of every other message about it.
 */
class TicketSurveyRequested extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public Ticket $ticket, public TicketSurvey $survey) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'ticket_survey';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'customer_name' => (string) ($notifiable->name ?? ''),
            'reference' => $this->ticket->reference,
            'subject' => $this->ticket->subject,
            'rating_buttons' => Survey::buttonsHtml($this->survey),
            'survey_url' => Survey::url($this->survey),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $name = trim((string) ($notifiable->name ?? ''));

        $message = (new MailMessage)
            ->subject("[{$this->ticket->reference}] How did we do?")
            ->greeting($name !== '' ? "Dear {$name}," : 'Hello,')
            ->line("Thank you for getting in touch. Your ticket {$this->ticket->reference} ({$this->ticket->subject}) is now closed, and we would like to hear how it went. Your answer helps us keep improving our support.")
            ->line('**How would you rate your overall satisfaction with the resolution you received from our support team?**')
            ->line(new HtmlString(Survey::buttonsHtml($this->survey)))
            ->line('It takes a few seconds, and you can add a comment if you wish.')
            ->salutation(MailBrand::signoff().' Support');

        return MailHeaders::machine($message, MailHeaders::GENERATED);
    }
}
