<?php

namespace App\Notifications;

use App\Models\Meeting;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Mail\MailBrand;
use App\Support\Meetings\MeetingIcs;
use App\Support\Meetings\MeetingText;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A meeting moved to a new time or a new host — to the customer, whoever
 * moved it (docs/meetings.md). `$previous` is when it was, already written
 * out ("Mon 5 Oct 2026, 11:00 – 11:30 IST") by whoever moved it, since the
 * row no longer holds it.
 */
class MeetingRescheduled extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    /** @param  bool  $withIcs  an updated calendar file — only when the confirmation carried one */
    public function __construct(public Meeting $meeting, public string $previous = '', public bool $withIcs = false) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'meeting_rescheduled';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $m = $this->meeting;

        return [
            'name' => MeetingText::firstName($m),
            'reference' => $m->reference,
            'meeting_type' => MeetingText::typeName($m),
            'meeting_date' => MeetingText::date($m->starts_at),
            'meeting_time' => MeetingText::time($m),
            'timezone' => MeetingText::timezone(),
            'host_name' => MeetingText::hostName($m),
            'meet_url' => (string) $m->meet_url,
            'join' => MeetingText::joinHtml($m),
            'manage_url' => $m->manageUrl(),
            'previous' => $this->previous,
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $m = $this->meeting;
        $type = MeetingText::typeName($m);
        $when = MeetingText::date($m->starts_at).', '.MeetingText::time($m).' '.MeetingText::timezone();

        $message = (new MailMessage)
            ->subject("[{$m->reference}] Your {$type} has moved to {$when}")
            ->greeting('Hello '.MeetingText::firstName($m))
            ->line("Your **{$type}** has moved to **{$when}**, with ".MeetingText::hostName($m).'.');

        if ($this->previous !== '') {
            $message->line('It was: '.$this->previous);
        }

        if (filled($m->meet_url)) {
            $message->line('Join on Google Meet: '.$m->meet_url);
        }

        $message
            ->action('Cancel or choose another time', $m->manageUrl())
            ->salutation(MailBrand::signoff());

        return $this->withIcs ? MeetingIcs::attach($message, $m) : $message;
    }
}
