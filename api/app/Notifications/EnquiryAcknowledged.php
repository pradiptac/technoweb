<?php

namespace App\Notifications;

use App\Models\Enquiry;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The enquirer's receipt.
 *
 * Every enquiry notified the sales desk and nothing went back to the person
 * who wrote in. A ticket has acknowledged since it shipped
 * (`TicketAcknowledged`); enquiries and editor-built forms never grew the
 * second half, and the cost of that falls on the one case nobody sees:
 * somebody who mistypes their address learns it days later when a reply
 * bounces, having spent the time believing they had contacted the business.
 *
 * **It deliberately does not echo the message back.** An acknowledgement is a
 * message this server will send to any address somebody types into a public
 * form — a reflected-mail surface, bounded here by the 10/min throttle on the
 * endpoint. Fixed content sent to an address of an attacker's choosing is a
 * nuisance; content of their choosing sent to an address of their choosing is
 * a relay. So it confirms what was received and names nothing the sender
 * supplied beyond their own name and subject.
 */
class EnquiryAcknowledged extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public Enquiry $enquiry) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'enquiry_acknowledged';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'name' => (string) $this->enquiry->name,
            'subject' => (string) ($this->enquiry->subject ?: 'your enquiry'),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('We have your enquiry')
            ->greeting('Thank you, '.$this->enquiry->name)
            ->line('We have your enquiry about **'.($this->enquiry->subject ?: 'your enquiry').'** and somebody will be in touch.')
            // No promise of a time. A stated response time this business has
            // not agreed to is worse than none, and the invented figures on
            // the homepage are already on the must-not-ship list.
            ->line('If it is urgent, calling is faster than waiting for a reply to this.')
            ->salutation('— Technoware');
    }
}
