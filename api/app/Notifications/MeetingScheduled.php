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
 * The customer's confirmation of an online meeting (docs/meetings.md).
 *
 * Sent from the end of the Google sync, so it can carry the Meet link; when
 * Google is not connected it is sent at booking. Never repeats the agenda
 * the customer typed. Laid down with the catalogue entry — the booking
 * rules decide when it goes and whether a calendar file rides with it.
 */
class MeetingScheduled extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    /**
     * @param  bool  $withIcs  our calendar file rides along — only when Google
     *                         is not sending the invitation (MeetingNotices)
     */
    public function __construct(public Meeting $meeting, public bool $withIcs = false) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'meeting_scheduled';
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
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $m = $this->meeting;
        $type = MeetingText::typeName($m);
        $when = MeetingText::date($m->starts_at).', '.MeetingText::time($m).' '.MeetingText::timezone();

        $message = (new MailMessage)
            ->subject("[{$m->reference}] Your {$type} is booked for {$when}")
            ->greeting('Hello '.MeetingText::firstName($m))
            ->line("Your **{$type}** with ".MeetingText::hostName($m)." is booked for **{$when}**. Your reference is **{$m->reference}**.");

        $message->line(filled($m->meet_url)
            ? 'Join on Google Meet: '.$m->meet_url
            : 'We will send the link to join before the meeting.');

        if ($this->withIcs) {
            $message->line('The calendar file attached adds it to your diary.');
        }

        $message
            ->line('We will remind you before it starts.')
            ->action('Cancel or choose another time', $m->manageUrl())
            ->salutation(MailBrand::signoff());

        return $this->withIcs ? MeetingIcs::attach($message, $m) : $message;
    }
}
