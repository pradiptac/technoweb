<?php

namespace App\Notifications;

use App\Models\VisitRequest;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Visits\VisitText;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The customer's receipt for a visit request.
 *
 * **It does not echo the notes back**, the `EnquiryAcknowledged` rule: this
 * is a message the server sends to any address typed into a public form, and
 * content of the sender's choosing to an address of their choosing is a
 * relay. What it repeats — the dates and parts of the day — are choices from
 * lists the site offered, not free text. The reference and the manage link
 * are the point of it: they are how somebody cancels without ringing.
 */
class VisitRequested extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public VisitRequest $visit) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'visit_requested';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'name' => VisitText::firstName($this->visit),
            'reference' => $this->visit->reference,
            'topic' => $this->visit->topic(),
            'preferred' => VisitText::preferredHtml($this->visit),
            'manage_url' => $this->visit->manageUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $v = $this->visit;

        $message = (new MailMessage)
            ->subject("[{$v->reference}] We have your visit request")
            ->greeting('Thank you, '.VisitText::firstName($v))
            ->line("We have your request for an engineer visit — **{$v->topic()}**. Your reference is **{$v->reference}**.")
            ->line('You asked for:');

        foreach (VisitText::preferredLines($v) as $line) {
            $message->line('- '.$line);
        }

        return $message
            ->line('This is a request, not a booking yet. We will confirm the actual time by email once an engineer is free.')
            ->action('Cancel or ask for another time', $v->manageUrl())
            ->salutation('— Technoware');
    }
}
