<?php

namespace App\Notifications;

use App\Models\EventRegistration;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Events\EventText;
use App\Support\Mail\MailBrand;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

/**
 * The reminder before an event, to each confirmed registrant, once.
 *
 * `technoware:remind-events` decides who is due and claims each row before
 * this is sent (`EventReminders`); this only says what the reminder says.
 * It carries the join link again, because the day of a webinar is when
 * somebody goes looking for it.
 */
class EventReminder extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public EventRegistration $registration) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'event_reminder';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $r = $this->registration->loadMissing('event');
        $event = $r->event;
        $join = $event->format->isOnline() && filled($event->online_url) ? (string) $event->online_url : '';

        return [
            'name' => EventText::firstName($r),
            'event_title' => (string) $event->title,
            'event_date' => EventText::dateLabel($event),
            'event_time' => EventText::timeLabel($event),
            'event_place' => EventText::place($event),
            'seats' => EventText::seats((int) $r->seats),
            'join' => $join === '' ? '' : '<p><a href="'.e($join).'">Join the event online</a></p>',
            'join_url' => $join,
            'event_url' => $event->publicUrl(),
            'manage_url' => $r->manageUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $r = $this->registration->loadMissing('event');
        $event = $r->event;

        $message = (new MailMessage)
            ->subject("Reminder: {$event->title} — ".EventText::dateLabel($event))
            ->greeting('Hello '.EventText::firstName($r))
            ->line("A reminder that **{$event->title}** is on ".EventText::when($event).'.')
            ->line('Where: '.EventText::place($event));

        if ($event->format->isOnline() && filled($event->online_url)) {
            $message->line(new HtmlString('Join online: [open the join link](<'.$event->online_url.'>)'));
        }

        return $message
            ->line('If you can no longer come, please cancel so that somebody on the waiting list can take the place.')
            ->action('See or cancel your registration', $r->manageUrl())
            ->salutation(MailBrand::signoff());
    }
}
