<?php

namespace App\Notifications;

use App\Models\Meeting;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Mail\MailBrand;
use App\Support\Meetings\MeetingText;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A meeting was booked — to the desk (the meetings address, else sales) and
 * to the host (docs/meetings.md). Carries the agenda, which the customer's
 * copy never does; replying goes to the customer.
 */
class MeetingBooked extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public Meeting $meeting) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'meeting_booked_internal';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $m = $this->meeting;

        return [
            'reference' => $m->reference,
            'meeting_type' => MeetingText::typeName($m),
            'meeting_date' => MeetingText::date($m->starts_at),
            'meeting_time' => MeetingText::time($m),
            'timezone' => MeetingText::timezone(),
            'host_name' => MeetingText::hostName($m),
            'name' => $m->name,
            'company' => (string) $m->company,
            'email' => $m->email,
            'phone' => (string) $m->phone,
            'agenda' => str((string) $m->agenda)->limit(800)->value(),
            'source' => $m->source->label(),
            'meet_url' => (string) $m->meet_url,
            'url' => $this->consoleUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $m = $this->meeting;
        $type = MeetingText::typeName($m);
        $when = MeetingText::date($m->starts_at).', '.MeetingText::time($m).' '.MeetingText::timezone();

        $message = (new MailMessage)
            ->subject("[{$m->reference}] Meeting booked: {$type}, ".MeetingText::date($m->starts_at).' '.MeetingText::time($m))
            ->replyTo($m->email, $m->name)
            ->greeting("A {$type} has been booked with ".MeetingText::hostName($m).'.')
            ->line("**{$when}**")
            ->line("**{$m->name}**".($m->company ? " · {$m->company}" : ''))
            ->line($m->email.($m->phone ? ' · '.$m->phone : ''));

        if (filled($m->agenda)) {
            $message->line('Agenda: '.str((string) $m->agenda)->limit(800)->value());
        }

        return $message
            ->line('Booked from: '.$m->source->label())
            ->action('Open it in the console', $this->consoleUrl())
            ->salutation(MailBrand::signoff());
    }

    private function consoleUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$this->meeting->adminPath();
    }
}
