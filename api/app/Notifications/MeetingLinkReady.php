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
 * The Meet link, arriving after a confirmation that went out without one —
 * Google failed at booking and a later retry succeeded (docs/meetings.md).
 */
class MeetingLinkReady extends Notification implements ShouldQueue
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
        return 'meeting_link_ready';
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
            'meet_url' => (string) $m->meet_url,
            'manage_url' => $m->manageUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $m = $this->meeting;
        $type = MeetingText::typeName($m);
        $when = MeetingText::date($m->starts_at).', '.MeetingText::time($m).' '.MeetingText::timezone();

        return (new MailMessage)
            ->subject("[{$m->reference}] Your link to join the {$type}")
            ->greeting('Hello '.MeetingText::firstName($m))
            ->line("Here is the link for your **{$type}** on **{$when}**:")
            ->action('Join on Google Meet', (string) $m->meet_url)
            ->line('Need to change it? '.$m->manageUrl())
            ->salutation(MailBrand::signoff());
    }
}
