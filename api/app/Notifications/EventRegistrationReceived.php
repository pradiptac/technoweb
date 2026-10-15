<?php

namespace App\Notifications;

use App\Models\EventRegistration;
use App\Models\Lead;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Crm\LeadMailLines;
use App\Support\Events\EventText;
use App\Support\Mail\MailBrand;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * To the events address (else the sales inbox): somebody registered.
 *
 * Sent for a **new** registration only — a repeat from the same address is
 * the same row, and telling the desk twice about one person is how a count
 * in somebody's head goes wrong.
 *
 * This one may carry the registrant's note: it goes to the desk's own
 * address and never to anything a stranger typed.
 */
class EventRegistrationReceived extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public EventRegistration $registration, public ?Lead $lead = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'event_registration_received';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $r = $this->registration->loadMissing('event');
        $event = $r->event;

        return [
            'name' => (string) $r->name,
            'email' => (string) $r->email,
            'phone' => (string) $r->phone,
            'company' => (string) $r->company,
            'seats' => EventText::seats((int) $r->seats),
            'status' => $r->status->label(),
            'note' => str((string) $r->note)->limit(800)->value(),
            'event_title' => (string) $event->title,
            'event_date' => EventText::dateLabel($event),
            'event_time' => EventText::timeLabel($event),
            'url' => $this->consoleUrl(),
            'lead' => LeadMailLines::html($this->lead),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $r = $this->registration->loadMissing('event');
        $event = $r->event;

        $message = (new MailMessage)
            ->subject("Event registration: {$event->title} — {$r->name}")
            ->greeting('Somebody registered for an event.')
            ->line("**{$event->title}** — ".EventText::when($event))
            ->line("**{$r->name}**".($r->company ? " · {$r->company}" : ''))
            ->line($r->email.($r->phone ? ' · '.$r->phone : ''))
            ->line(EventText::seats((int) $r->seats).' · '.$r->status->label());

        if (filled($r->note)) {
            $message->line(str((string) $r->note)->limit(800)->value());
        }

        LeadMailLines::add($message, $this->lead);

        return $message
            ->action('Open the registrations', $this->consoleUrl())
            ->replyTo($r->email, $r->name)
            ->salutation(MailBrand::signoff());
    }

    private function consoleUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$this->registration->adminPath();
    }
}
