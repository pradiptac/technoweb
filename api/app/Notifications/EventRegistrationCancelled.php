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
 * "Your registration is cancelled" — by the registrant from their own link,
 * or by the desk.
 *
 * One message for both, because the fact is the same and the address it goes
 * to is the one that registered: it is also how the owner of a mailbox
 * learns that somebody cancelled in their name.
 */
class EventRegistrationCancelled extends Notification implements ShouldQueue
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
        return 'event_registration_cancelled';
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
            'event_url' => $event->publicUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $r = $this->registration->loadMissing('event');
        $event = $r->event;

        return (new MailMessage)
            ->subject("Your registration is cancelled: {$event->title}")
            ->greeting('Hello '.EventText::firstName($r))
            ->line("Your registration for **{$event->title}** on ".EventText::when($event).' is cancelled.')
            ->line('If this is a mistake, or you change your mind, you can register again from the event page while places remain.')
            ->action('Open the event page', $event->publicUrl())
            ->salutation(MailBrand::signoff());
    }
}
