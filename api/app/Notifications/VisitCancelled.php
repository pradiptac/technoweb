<?php

namespace App\Notifications;

use App\Models\VisitRequest;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Mail\MailBrand;
use App\Support\Visits\VisitText;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A visit is off — to the customer, whoever called it off.
 *
 * Sent when the desk cancels and when the customer cancels from their own
 * link: in the second case it is the receipt for what they just did, which
 * is also how a cancellation somebody else made with a forwarded link comes
 * to light. The reason is the desk's `cancel_reason`, blank when the
 * customer cancelled — never anything the customer typed.
 */
class VisitCancelled extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public VisitRequest $visit, public bool $byCustomer = false) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'visit_cancelled';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'name' => VisitText::firstName($this->visit),
            'reference' => $this->visit->reference,
            'topic' => $this->visit->topic(),
            'reason' => $this->byCustomer ? '' : (string) $this->visit->cancel_reason,
            'book_url' => rtrim((string) config('app.frontend_url'), '/').'/book-a-visit',
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $v = $this->visit;

        $message = (new MailMessage)
            ->subject("[{$v->reference}] Your engineer visit is cancelled")
            ->greeting('Hello '.VisitText::firstName($v))
            ->line("Your engineer visit — **{$v->topic()}**, reference {$v->reference} — is cancelled.");

        if (! $this->byCustomer && filled($v->cancel_reason)) {
            $message->line('Reason: '.$v->cancel_reason);
        }

        return $message
            ->line('If this is a mistake, or you would still like somebody to come, ask for a new visit and we will arrange it.')
            ->action('Request a visit', rtrim((string) config('app.frontend_url'), '/').'/book-a-visit')
            ->salutation(MailBrand::signoff());
    }
}
