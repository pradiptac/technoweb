<?php

namespace App\Notifications;

use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
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
    use Templated;

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

    /**
     * Two messages, not one.
     *
     * The customer's version and the desk's differ in greeting, action label
     * *and* recipient — so a single template would have to say both things at
     * once, which means lying about one of them. Hence an instance method
     * rather than a constant, and 23 catalogue entries for 22 classes.
     */
    public function templateKey(): string
    {
        return $this->toCustomer ? 'ticket_replied_customer' : 'ticket_replied_desk';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'reference' => $this->ticket->reference,
            'subject' => $this->ticket->subject,
            'body' => str(HtmlSanitiser::toText($this->message->body ?? ''))->limit(600)->value(),
            'url' => $this->url(),
        ];
    }

    /** One definition, so the built-in message and the template cannot differ. */
    private function url(): string
    {
        $path = $this->toCustomer
            ? "/portal/tickets/{$this->ticket->reference}"
            : "/admin/tickets/{$this->ticket->reference}";

        return rtrim((string) config('app.frontend_url'), '/').$path;
    }

    protected function defaultMail(object $notifiable): MailMessage
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
