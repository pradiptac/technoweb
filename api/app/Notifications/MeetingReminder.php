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
 * A reminder before an online meeting — one per offset in Settings
 * (docs/meetings.md). Transactional, so no quiet hours. `starts_in` is
 * worked out when the mail is built, so one wording reads right a day ahead
 * and an hour ahead.
 */
class MeetingReminder extends Notification implements ShouldQueue
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
        return 'meeting_reminder';
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
            'starts_in' => MeetingText::startsIn($m),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $m = $this->meeting;
        $type = MeetingText::typeName($m);
        $when = MeetingText::date($m->starts_at).', '.MeetingText::time($m).' '.MeetingText::timezone();
        $in = MeetingText::startsIn($m);

        $message = (new MailMessage)
            ->subject("[{$m->reference}] Reminder: your {$type} starts {$in}")
            ->greeting('Hello '.MeetingText::firstName($m))
            ->line("A reminder that your **{$type}** with ".MeetingText::hostName($m)." starts {$in} — **{$when}**.");

        $message->line(filled($m->meet_url)
            ? 'Join on Google Meet: '.$m->meet_url
            : 'We will send the link to join before the meeting.');

        return $message
            ->action('Cancel or choose another time', $m->manageUrl())
            ->salutation(MailBrand::signoff());
    }
}
