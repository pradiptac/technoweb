<?php

namespace App\Notifications;

use App\Models\VisitRequest;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Mail\MailBrand;
use App\Support\Visits\Ics;
use App\Support\Visits\VisitText;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The appointment, with a calendar file — the first confirmation, or a move.
 *
 * Two messages for one class, the `TicketReplied` shape: "we have booked
 * this" and "we have moved this" want different subjects and the same facts.
 * Both carry the `.ics`, whose UID is the reference, so a moved visit
 * updates the event already in somebody's calendar instead of adding a
 * second one beside it (`App\Support\Visits\Ics`).
 *
 * The attachment is added to the built-in message, and `Templates::apply()`
 * rewrites the subject and body of that same object — so an edited wording
 * still carries the calendar file.
 */
class VisitConfirmed extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public VisitRequest $visit, public bool $rescheduled = false) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return $this->rescheduled ? 'visit_rescheduled' : 'visit_confirmed';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $v = $this->visit;

        return [
            'name' => VisitText::firstName($v),
            'reference' => $v->reference,
            'topic' => $v->topic(),
            'visit_date' => VisitText::date($v->scheduled_start_at),
            'visit_time' => VisitText::time($v),
            'site_address' => VisitText::address($v),
            'manage_url' => $v->manageUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $v = $this->visit;
        $when = VisitText::date($v->scheduled_start_at).', '.VisitText::time($v);

        $message = (new MailMessage)
            ->subject($this->rescheduled
                ? "[{$v->reference}] Your engineer visit has moved to {$when}"
                : "[{$v->reference}] Your engineer visit is booked for {$when}")
            ->greeting('Hello '.VisitText::firstName($v))
            ->line($this->rescheduled
                ? "We have moved your engineer visit — **{$v->topic()}** — to **{$when}**."
                : "An engineer will visit — **{$v->topic()}** — on **{$when}**.");

        $address = VisitText::address($v);

        if ($address !== '') {
            $message->line('At: '.$address);
        }

        $message
            ->line('The calendar file attached adds it to your diary. We will remind you the day before.')
            ->action('Cancel or ask for another time', $v->manageUrl())
            ->salutation(MailBrand::signoff());

        $ics = Ics::forVisit($v);

        if ($ics !== null) {
            $message->attachData($ics, $v->reference.'.ics', ['mime' => 'text/calendar; charset=utf-8; method=PUBLISH']);
        }

        return $message;
    }
}
