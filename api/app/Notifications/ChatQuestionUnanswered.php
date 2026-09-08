<?php

namespace App\Notifications;

use App\Models\ChatConversation;
use App\Notifications\Concerns\QueuedMail;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The assistant could not answer, and here is who was asking.
 *
 * `/admin/chat/unanswered` already collects the *questions*, grouped, so the
 * same thing asked forty times is one piece of work. This is the other half and
 * a different job: one person, on the site now, whose question the website does
 * not cover — and everything intake collected about them, so somebody can ring
 * back rather than write a page and hope they return.
 *
 * **Off by default** (`chatbot_forward_unanswered`). Switched on, every
 * unanswerable question becomes an email; a busy afternoon is then a mailbox
 * somebody builds a filter for, and the message that mattered arrives in a
 * folder nobody opens. That is the failure the blog-comment notification had to
 * be throttled to one an hour to avoid, and it is worth stating rather than
 * rediscovering.
 *
 * Queued, like the rest — `use Queueable` alone queues nothing, which is why
 * every notification in this application carried that trait for months and every
 * one of them was still sent inline. The visitor is waiting on a reply while
 * this goes out.
 */
class ChatQuestionUnanswered extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail;

    /**
     * @param  array<string, string>  $contact  What intake collected, which may
     *                                          be empty — intake is switchable
     *                                          and every step can be declined.
     */
    public function __construct(
        private readonly ChatConversation $conversation,
        private readonly string $question,
        private readonly array $contact,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $who = $this->contact['name'] ?? null;

        $mail = (new MailMessage)
            ->subject('The website assistant could not answer a question')
            ->greeting(filled($who) ? "{$who} asked something the website does not cover." : 'A visitor asked something the website does not cover.')
            ->line('**They asked:**')
            ->line($this->question);

        /*
         * Whatever was collected, and nothing invented to fill a gap. A blank
         * line reading "Phone: —" tells the desk the number is missing; a line
         * that is simply absent tells them the same thing without the noise,
         * which matters when three of the four are usually absent.
         */
        $any = false;

        foreach ([
            'Name' => $this->contact['name'] ?? null,
            'Email' => $this->contact['email'] ?? null,
            'Phone' => $this->contact['phone'] ?? null,
            'Company' => $this->contact['company'] ?? null,
            'What they came for' => $this->contact['requirement'] ?? null,
        ] as $label => $value) {
            if (filled($value)) {
                $mail->line("**{$label}:** {$value}");
                $any = true;
            }
        }

        if (! $any) {
            $mail->line('_They gave no contact details, so there is nobody to ring — this one is a page worth writing._');
        }

        if (filled($this->conversation->source_path)) {
            $mail->line('**Asked from:** '.$this->conversation->source_path);
        }

        /*
         * Absolute, because this is a link in an email and there is no origin to
         * inherit. `frontend_url` is pinned to the production domain on every
         * machine for exactly that.
         */
        $base = rtrim((string) config('app.frontend_url'), '/');

        return $mail
            ->action('Read the conversation', $base.'/admin/chat/conversations/'.$this->conversation->id)
            ->line('The unanswered list groups this with anyone else who asked the same thing.');
    }
}
