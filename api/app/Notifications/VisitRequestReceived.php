<?php

namespace App\Notifications;

use App\Models\Lead;
use App\Models\VisitRequest;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Crm\LeadMailLines;
use App\Support\Mail\MailBrand;
use App\Support\Visits\VisitText;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * To the visits desk: a new request, or a customer changing one.
 *
 * Two messages, the `TicketReplied` shape — a new request and a customer
 * cancelling or asking for other times read differently and want different
 * subjects, but carry the same facts, so they share the class and the
 * placeholder list. `$change` is null for a new request and a sentence
 * saying what the customer did otherwise.
 *
 * This one may carry the customer's notes: it goes to the desk's own address
 * and never to anything a stranger typed.
 */
class VisitRequestReceived extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public VisitRequest $visit, public ?Lead $lead = null, public ?string $change = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return $this->change === null ? 'visit_request_received' : 'visit_request_changed';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $v = $this->visit;

        return [
            'reference' => $v->reference,
            'name' => $v->name,
            'company' => (string) $v->company,
            'email' => $v->email,
            'phone' => $v->phone,
            'topic' => $v->topic(),
            'preferred' => VisitText::preferredHtml($v),
            'site_address' => VisitText::address($v),
            'notes' => str((string) $v->notes)->limit(800)->value(),
            'change' => (string) $this->change,
            'url' => $this->consoleUrl(),
            'lead' => LeadMailLines::html($this->lead),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $v = $this->visit;

        $message = (new MailMessage)
            ->subject($this->change === null
                ? "[{$v->reference}] Visit requested: {$v->topic()}"
                : "[{$v->reference}] Visit changed by the customer")
            ->greeting($this->change === null ? 'A site visit has been requested.' : 'A customer changed their visit.');

        if ($this->change !== null) {
            $message->line($this->change);
        }

        $message
            ->line("**{$v->name}**".($v->company ? " · {$v->company}" : ''))
            ->line($v->email.' · '.$v->phone)
            ->line('About: '.$v->topic());

        $address = VisitText::address($v);

        if ($address !== '') {
            $message->line('Site: '.$address);
        }

        $lines = VisitText::preferredLines($v);

        if ($lines !== []) {
            $message->line('Preferred times:');

            foreach ($lines as $line) {
                $message->line('- '.$line);
            }
        }

        if (filled($v->notes)) {
            $message->line(str((string) $v->notes)->limit(800)->value());
        }

        LeadMailLines::add($message, $this->lead);

        return $message
            ->action('Open it in the console', $this->consoleUrl())
            ->replyTo($v->email, $v->name)
            ->salutation(MailBrand::signoff());
    }

    private function consoleUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$this->visit->adminPath();
    }
}
