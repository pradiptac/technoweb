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

/**
 * "You are on the waiting list" — the event is full and this registration
 * waits for a place.
 *
 * No join link and no calendar file: neither is theirs until a place opens,
 * and a calendar entry for an event somebody may not get into is one they
 * turn up for.
 */
class EventRegistrationWaitlisted extends Notification implements ShouldQueue
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
        return 'event_registration_waitlisted';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $r = $this->registration->loadMissing('event');
        $event = $r->event;

        return [
            'name' => EventText::firstName($r),
            'event_title' => (string) $event->title,
            'event_date' => EventText::dateLabel($event),
            'event_time' => EventText::timeLabel($event),
            'event_place' => EventText::place($event),
            'seats' => EventText::seats((int) $r->seats),
            'event_url' => $event->publicUrl(),
            'manage_url' => $r->manageUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $r = $this->registration->loadMissing('event');
        $event = $r->event;

        return (new MailMessage)
            ->subject("You are on the waiting list: {$event->title}")
            ->greeting('Hello '.EventText::firstName($r))
            ->line("**{$event->title}** is full, so we have put you on the waiting list (".EventText::seats((int) $r->seats).').')
            ->line('When: '.EventText::when($event))
            ->line('If a place opens we will email you straight away. You do not need to do anything until then.')
            ->action('See or cancel your place on the list', $r->manageUrl())
            ->salutation(MailBrand::signoff());
    }
}
