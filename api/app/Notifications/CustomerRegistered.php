<?php

namespace App\Notifications;

use App\Models\Customer;
use App\Notifications\Concerns\QueuedMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Tells the support desk somebody registered.
 *
 * A pending account is invisible until a staff member happens to open the
 * customers screen, and an approval queue nobody is told about is an approval
 * queue nobody works.
 *
 * With `customer_approval_required` off, nothing is waiting — the account is
 * already `Active` by the time this sends. The wording below reads the
 * customer's own `status` rather than assuming, or every one of these emails
 * would ask staff to review an account there is nothing left to decide about.
 */
class CustomerRegistered extends Notification implements ShouldQueue
{
    use QueuedMail;

    public function __construct(public Customer $customer) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $base = rtrim(config('app.frontend_url'), '/');
        $active = $this->customer->status->canSignIn();

        $mail = (new MailMessage)
            ->subject('New portal registration: '.$this->customer->name)
            ->greeting('Someone has registered')
            ->line($active
                ? 'A new portal account has been created and is already active — no approval was needed.'
                : 'A new portal account is waiting for approval.')
            ->line('**Name:** '.$this->customer->name)
            ->line('**Email:** '.$this->customer->email);

        if (filled($this->customer->company)) {
            $mail->line('**Company:** '.$this->customer->company);
        }

        if (filled($this->customer->phone)) {
            $mail->line('**Phone:** '.$this->customer->phone);
        }

        if (! $active) {
            // Stated rather than assumed: a reviewer who does not know the
            // address is unconfirmed may approve on the strength of a
            // plausible-looking company name. Moot once the account is
            // already active, since there is nothing left to approve.
            $mail->line($this->customer->hasVerifiedEmail()
                ? 'Their email address is confirmed.'
                : 'Their email address is **not confirmed yet**.');
        }

        return $mail
            ->action($active ? 'View the account' : 'Review the account', $base.'/admin/customers/'.$this->customer->id)
            ->salutation('— Technoware');
    }
}
