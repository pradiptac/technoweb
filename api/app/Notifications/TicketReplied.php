<?php

namespace App\Notifications;

use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Notifications\Concerns\QueuedMail;
use App\Support\HtmlSanitiser;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A new message on an existing ticket, to whichever side did not write it.
 *
 * Internal notes never reach here — the caller decides, and it checks
 * is_internal before dispatching. Getting that wrong would put a private
 * engineering note in a customer's inbox, so the guard is asserted at the call
 * site rather than trusted to a flag on this class.
 */
class TicketReplied extends Notification implements ShouldQueue
{
    use QueuedMail;

    public function __construct(
        public Ticket $ticket,
        public TicketMessage $message,
        /** True when the recipient is the customer rather than the desk. */
        public bool $toCustomer,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $t = $this->ticket;
        $path = $this->toCustomer
            ? "/portal/tickets/{$t->reference}"
            : "/admin/tickets/{$t->reference}";

        return (new MailMessage)
            ->subject("[{$t->reference}] New reply: {$t->subject}")
            ->greeting($this->toCustomer ? 'There is a reply on your ticket.' : 'A customer has replied.')
            ->line(str(HtmlSanitiser::toText($this->message->body ?? ''))->limit(600)->value())
            ->action($this->toCustomer ? 'Read and reply' : 'Open in the console',
                rtrim(config('app.frontend_url'), '/').$path)
            ->salutation('— Technoware Support');
    }
}
