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
 * "You are registered" — the confirmation, and the same facts sent to
 * somebody a place has just opened for.
 *
 * Two messages for one class, the `VisitConfirmed` shape: a first
 * confirmation and a promotion off the waiting list want different opening
 * lines and the same content, so they share the class and the placeholder
 * list.
 *
 * **This is where the join link lives.** `online_url` is on no public read;
 * it is sent here, to an address that registered, and in the calendar file
 * attached. The manage link beside it carries the registration's token, and
 * the registrant's emails are the **only** place it appears: the register
 * response goes to whoever typed the address, the email to its mailbox.
 *
 * The attachment is added to the built-in message, and `Templates::apply()`
 * rewrites the subject and body of that same object — so an edited wording
 * still carries the calendar file.
 */
class EventRegistrationConfirmed extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public EventRegistration $registration, public bool $promoted = false) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return $this->promoted ? 'event_waitlist_promoted' : 'event_registration_confirmed';
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
        $when = EventText::when($event);

        $message = (new MailMessage)
            ->subject($this->promoted
                ? "A place has opened: {$event->title}"
                : "You are registered: {$event->title}")
            ->greeting('Hello '.EventText::firstName($r))
            ->line($this->promoted
                ? "A place has opened and you are off the waiting list — you are registered for **{$event->title}** (".EventText::seats((int) $r->seats).').'
                : "You are registered for **{$event->title}** (".EventText::seats((int) $r->seats).').')
            ->line('When: '.$when)
            ->line('Where: '.EventText::place($event));

        if ($event->format->isOnline() && filled($event->online_url)) {
            // An `HtmlString`, so the link survives the secured encoding
            // every other line gets: the address is one an editor saved and
            // the request held to http(s), and it is the point of the line.
            $message->line(new HtmlString('Join online: [open the join link](<'.$event->online_url.'>)'));
        }

        $message
            ->line('The calendar file attached adds it to your diary.')
            ->action('See or cancel your registration', $r->manageUrl())
            ->salutation(MailBrand::signoff());

        $message->attachData(EventIcs::forRegistration($r), EventIcs::filename($event), ['mime' => 'text/calendar; charset=utf-8; method=PUBLISH']);

        return $message;
    }
}
