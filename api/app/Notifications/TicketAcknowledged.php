<?php

namespace App\Notifications;

use App\Models\Ticket;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * To the customer, confirming their ticket exists.
 *
 * Sent because the alternative is a form that appears to swallow the request:
 * the portal shows the ticket, but people close the tab. It carries the
 * reference and the SLA due time, and nothing else — this is a receipt, not
 * an answer.
 */
class TicketAcknowledged extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public Ticket $ticket) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'ticket_acknowledged';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $t = $this->ticket;

        return [
            'reference' => $t->reference,
            'subject' => $t->subject,
            // Blank rather than absent, so the sentence around it still reads
            // when there is no target — a stripped placeholder leaves a gap.
            'due_at' => $t->due_at?->format('j M Y, H:i') ?? '',
            'url' => rtrim((string) config('app.frontend_url'), '/')."/portal/tickets/{$t->reference}",
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $t = $this->ticket;

        $message = (new MailMessage)
            ->subject("[{$t->reference}] We have your ticket: {$t->subject}")
            ->greeting('Thanks — this is logged.')
            ->line("Your reference is **{$t->reference}**. Quote it if you call.")
            ->line("**{$t->subject}**");

        if ($t->due_at) {
            $message->line('An engineer will respond by '.$t->due_at->format('j M Y, H:i').'.');
        }

        return $message
            ->action('Track this ticket', rtrim(config('app.frontend_url'), '/')."/portal/tickets/{$t->reference}")
            ->line('Replying to this email will not reach us — use the portal so the conversation stays on the ticket.')
            ->salutation('— Technoware Support');
    }
}
