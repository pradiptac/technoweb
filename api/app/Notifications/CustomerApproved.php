<?php

namespace App\Notifications;

use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** The account is live. This is the email the person has been waiting for. */
class CustomerApproved extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'customer_approved';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'customer_name' => $this->customer->name ?? '',
            'url' => rtrim((string) config('app.frontend_url'), '/').'/portal/login',
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $base = rtrim(config('app.frontend_url'), '/');

        return (new MailMessage)
            ->subject('Your Technoware support account is active')
            ->greeting('You are all set')
            ->line('Your support portal account has been approved. You can sign in and raise a ticket whenever you need us.')
            ->action('Sign in to the portal', $base.'/portal/login')
            ->line('Before you open a ticket, it is worth a look at the knowledge base — a lot of questions are answered there already.')
            ->salutation('— Technoware');
    }
}
