<?php

namespace App\Notifications;

use App\Models\ChatConversation;
use App\Models\Lead;
use App\Notifications\Concerns\QueuedMail;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Somebody asked the assistant to have the team call them.
 *
 * Queued, like the other eleven — `use Queueable` alone queues nothing, which
 * is why every notification here carried that trait for months and every one
 * was still sent inline. The request that captures a lead must not wait on
 * SMTP: an unreachable host was measured taking a contact form from 0.2s to
 * 12.5 seconds, and this one is sent while somebody is sitting in a chat
 * window watching for an acknowledgement.
 *
 * **The lead is written before this is dispatched**, so a dead mail server
 * cannot cost the sales desk an enquiry. The email is the announcement; the row
 * is the record. That is the rule `LeadIntake` is built on.
 */
class ChatLeadCaptured extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail;

    public function __construct(
        private readonly Lead $lead,
        private readonly ChatConversation $conversation,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject('Callback requested through the website assistant')
            ->greeting('A visitor asked us to get in touch.')
            ->line('**'.($this->lead->name ?: 'Somebody').'** used the assistant on the website and asked for a call.');

        foreach ([
            'Email' => $this->lead->email,
            'Phone' => $this->lead->phone,
            'Company' => $this->lead->company,
        ] as $label => $value) {
            if (filled($value)) {
                $mail->line("**{$label}:** {$value}");
            }
        }

        if (filled($this->lead->message)) {
            $mail->line('**What they want:**')->line($this->lead->message);
        }

        /*
         * Where they were standing when they asked. The single most useful line
         * in this email — a callback request from a firewall page is a
         * different conversation from one raised on the careers page — and it
         * is only here because the browser posted it: every request in this
         * product goes through a Server Action, so `Referer` on the API side is
         * the Next server.
         */
        if (filled($this->conversation->source_path)) {
            $mail->line('**Asked from:** '.$this->conversation->source_path);
        }

        /*
         * A path, so the browser supplies the origin — no. Absolute, because
         * this is a link in an email and there is no origin to inherit.
         * `frontend_url` is pinned to the production domain on every machine
         * precisely so a link mailed to somebody is right wherever the code is
         * running.
         */
        return $mail
            ->action('Open this lead', rtrim((string) config('app.frontend_url'), '/').'/admin/leads/'.$this->lead->id)
            ->line('The whole conversation is on that screen, so you can read what was said before ringing.');
    }
}
