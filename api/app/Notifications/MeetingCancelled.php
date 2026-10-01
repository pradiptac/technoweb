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
 * A meeting was cancelled — to the customer, by the desk or by themselves
 * (docs/meetings.md). The reason is the desk's, and is blank when the
 * customer cancelled.
 */
class MeetingCancelled extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    /** @param  bool  $withIcs  a cancelling calendar file — only when the confirmation carried one */
    public function __construct(public Meeting $meeting, public bool $withIcs = false) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'meeting_cancelled';
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
            'reason' => (string) $m->cancel_reason,
            'book_url' => $this->bookUrl(),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $m = $this->meeting;
        $type = MeetingText::typeName($m);
        $when = MeetingText::date($m->starts_at).', '.MeetingText::time($m).' '.MeetingText::timezone();

        $message = (new MailMessage)
            ->subject("[{$m->reference}] Your {$type} on ".MeetingText::date($m->starts_at).' is cancelled')
            ->greeting('Hello '.MeetingText::firstName($m))
            ->line("Your **{$type}** on {$when} — reference {$m->reference} — is cancelled.");

        if (filled($m->cancel_reason)) {
            $message->line((string) $m->cancel_reason);
        }

        $message
            ->line('If this is a mistake, or you would still like to talk, book another time.')
            ->action('Book another time', $this->bookUrl())
            ->salutation(MailBrand::signoff());

        return $this->withIcs ? MeetingIcs::attach($message, $m, cancelled: true) : $message;
    }

    private function bookUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/book-a-meeting';
    }
}
