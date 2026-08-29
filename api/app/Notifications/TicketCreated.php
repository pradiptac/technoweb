<?php

namespace App\Notifications;

use App\Models\Ticket;
use App\Notifications\Concerns\QueuedMail;
use App\Support\HtmlSanitiser;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * To the support desk, when a customer raises a ticket.
 *
 * The reference is in the subject because that is what people search their
 * mailbox for, and it is the same string the portal and the admin queue show.
 */
class TicketCreated extends Notification implements ShouldQueue
{
    use QueuedMail;

    public function __construct(public Ticket $ticket) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $t = $this->ticket;

        return (new MailMessage)
            ->subject("[{$t->reference}] New ticket: {$t->subject}")
            ->greeting('A new ticket has been raised.')
            ->line("**{$t->subject}**")
            ->line($t->customer?->name
                ? "From {$t->customer->name}".($t->customer->company ? " at {$t->customer->company}" : '')
                : 'From a customer.')
            ->line('Priority: '.$t->priority->label().' · Category: '.($t->category?->name ?? 'Uncategorised'))
            ->line(str(HtmlSanitiser::toText($t->description ?? ''))->limit(400)->value())
            ->action('Open in the console', rtrim(config('app.frontend_url'), '/')."/admin/tickets/{$t->reference}")
            ->salutation('— Technoware');
    }
}
