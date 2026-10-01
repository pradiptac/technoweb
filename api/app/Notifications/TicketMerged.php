<?php

namespace App\Notifications;

use App\Models\Ticket;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\InboundMail\MailHeaders;
use App\Support\Mail\MailBrand;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * To the customer, when the desk merges one of their tickets into another.
 *
 * Sent because the reference they have been quoting has just stopped being
 * the place the conversation is: a reply to the old one still threads onto
 * the new one (the piper follows `merged_into_id`), but the portal link in
 * their last email now opens a closed ticket with nothing on it, and this
 * says where to look instead. One message per merge, whatever moved.
 */
class TicketMerged extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(
        /** The ticket that was closed by the merge. */
        public Ticket $source,
        /** The ticket the conversation now lives on. */
        public Ticket $target,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'ticket_merged';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'reference' => $this->target->reference,
            'subject' => $this->target->subject,
            'source_reference' => $this->source->reference,
            'source_subject' => $this->source->subject,
            'url' => $this->url(),
        ];
    }

    /** One definition, so the built-in message and the template cannot differ. */
    private function url(): string
    {
        return rtrim((string) config('app.frontend_url'), '/')."/portal/tickets/{$this->target->reference}";
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)
            ->subject("[{$this->target->reference}] Your ticket {$this->source->reference} has been merged into it")
            ->greeting('We have merged two of your tickets.')
            ->line("**{$this->source->reference}** ({$this->source->subject}) was about the same thing as **{$this->target->reference}** ({$this->target->subject}), so everything you sent on it is now on the one ticket.")
            ->line("Quote {$this->target->reference} from now on. A reply to the old reference still reaches us, and it lands on the right ticket.")
            ->action('Open the ticket', $this->url())
            ->salutation(MailBrand::signoff().' Support');

        return MailHeaders::machine(MailHeaders::replyToMailbox($message), MailHeaders::REPLIED);
    }
}
