<?php

namespace App\Notifications;

use App\Models\VisitRequest;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Mail\MailBrand;
use App\Support\Visits\VisitText;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The day before a confirmed visit.
 *
 * Transactional, not promotional: somebody expecting an engineer wants to
 * be told at whatever hour the reminder falls due, so it is not held to the
 * quiet-hours window the basket reminders keep to. Sent once, claimed by
 * `technoware:remind-visits` before it goes (`VisitReminders::send()`).
 */
class VisitReminder extends Notification implements ShouldQueue
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
        return 'visit_reminder';
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
            ->subject("[{$v->reference}] Reminder: engineer visit on {$when}")
            ->greeting('Hello '.VisitText::firstName($v))
            ->line("A reminder that an engineer visits — **{$v->topic()}** — on **{$when}**.");

        $address = VisitText::address($v);

        if ($address !== '') {
            $message->line('At: '.$address);
        }

        return $message
            ->line('Please make sure somebody can let them in and show them the equipment.')
            ->action('Cancel or ask for another time', $v->manageUrl())
            ->salutation(MailBrand::signoff());
    }
}
