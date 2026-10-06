<?php

namespace App\Notifications;

use App\Models\EventRegistration;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Events\EventIcs;
use App\Support\Events\EventText;
use App\Support\Mail\MailBrand;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

/**
 * "The details have changed" — to each confirmed registrant, when the
 * console saves a new time, place or join link **with "Tell everyone
 * registered" ticked**.
 *
 * Ticked, never automatic: fixing a typo in a venue's name is not news, and
 * forty people emailed about it is forty people who stop reading the next
 * one. The editor decides whether a save is an announcement.
 *
 * It states the event as it now stands rather than what moved — one message
 * that is right whichever of the three changed — and carries the calendar
 * file again, whose UID is the event's and whose sequence is higher, so it
 * updates the entry already in somebody's diary.
 */
class EventChanged extends Notification implements ShouldQueue
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
        return 'event_changed';
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
            ->subject("Updated details: {$event->title}")
            ->greeting('Hello '.EventText::firstName($r))
            ->line("The details of **{$event->title}** have changed. You are still registered; this is how it stands now.")
            ->line('When: '.EventText::when($event))
            ->line('Where: '.EventText::place($event));

        if ($event->format->isOnline() && filled($event->online_url)) {
            $message->line(new HtmlString('Join online: [open the join link](<'.$event->online_url.'>)'));
        }

        $message
            ->line('The calendar file attached updates the one we sent before.')
            ->action('See or cancel your registration', $r->manageUrl())
            ->salutation(MailBrand::signoff());

        $message->attachData(EventIcs::forRegistration($r), EventIcs::filename($event), ['mime' => 'text/calendar; charset=utf-8; method=PUBLISH']);

        return $message;
    }
}
