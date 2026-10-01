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
 * A meeting could not be put into Google Calendar after every retry — to the
 * desk (docs/meetings.md). The meeting stands; the console's Retry button is
 * the way back.
 */
class MeetingSyncFailed extends Notification implements ShouldQueue
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
        return 'meeting_sync_failed';
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
            'name' => $m->name,
            'error' => (string) $m->google_error,
            'url' => $this->consoleUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $m = $this->meeting;
        $type = MeetingText::typeName($m);
        $when = MeetingText::date($m->starts_at).', '.MeetingText::time($m).' '.MeetingText::timezone();

        $message = (new MailMessage)
            ->subject("[{$m->reference}] Could not add the meeting to Google Calendar")
            ->greeting('A meeting is not in Google Calendar.')
            ->line("The meeting with **{$m->name}** — {$type}, {$when} — could not be put into Google Calendar.");

        if (filled($m->google_error)) {
            $message->line('Google said: '.$m->google_error);
        }

        return $message
            ->line('The meeting still stands, and the customer was sent a calendar file. There is no Meet link until it syncs.')
            ->action('Open it in the console to retry', $this->consoleUrl())
            ->salutation(MailBrand::signoff());
    }

    private function consoleUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$this->meeting->adminPath();
    }
}
