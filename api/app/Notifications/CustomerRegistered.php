<?php

namespace App\Notifications;

use App\Models\Customer;
use App\Notifications\Concerns\QueuedMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Tells the support desk somebody is waiting.
 *
 * A pending account is invisible until a staff member happens to open the
 * customers screen, and an approval queue nobody is told about is an approval
 * queue nobody works.
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

        $mail = (new MailMessage)
            ->subject('New portal registration: '.$this->customer->name)
            ->greeting('Someone has registered')
            ->line('A new portal account is waiting for approval.')
            ->line('**Name:** '.$this->customer->name)
            ->line('**Email:** '.$this->customer->email);

        if (filled($this->customer->company)) {
            $mail->line('**Company:** '.$this->customer->company);
        }

        if (filled($this->customer->phone)) {
            $mail->line('**Phone:** '.$this->customer->phone);
        }

        return $mail
            // Stated rather than assumed: a reviewer who does not know the
            // address is unconfirmed may approve on the strength of a
            // plausible-looking company name.
            ->line($this->customer->hasVerifiedEmail()
                ? 'Their email address is confirmed.'
                : 'Their email address is **not confirmed yet**.')
            ->action('Review the account', $base.'/admin/customers/'.$this->customer->id)
            ->salutation('— Technoware');
    }
}
