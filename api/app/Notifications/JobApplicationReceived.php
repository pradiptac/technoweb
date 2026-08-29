<?php

namespace App\Notifications;

use App\Models\JobApplication;
use App\Notifications\Concerns\QueuedMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Tells the hiring inbox somebody applied.
 *
 * The CV is deliberately **not attached**. It would put a stranger's file into
 * an inbox, through a mail server, on its way past whatever scans it -- and the
 * console already has it behind a login. A link to the record is the safe
 * version of the same message.
 */
class JobApplicationReceived extends Notification implements ShouldQueue
{
    use QueuedMail;

    public function __construct(public JobApplication $application) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $base = rtrim(config('app.frontend_url'), '/');
        $a = $this->application;

        $mail = (new MailMessage)
            ->subject('Application: '.$a->job_title.' — '.$a->name)
            ->greeting('A new application')
            ->line('**Role:** '.$a->job_title)
            ->line('**Name:** '.$a->name)
            ->line('**Email:** '.$a->email);

        if (filled($a->phone)) {
            $mail->line('**Phone:** '.$a->phone);
        }

        if (filled($a->current_company)) {
            $mail->line('**Currently at:** '.$a->current_company);
        }

        if ($a->experience_years !== null) {
            $mail->line('**Experience:** '.$a->experience_years.' years');
        }

        return $mail
            ->action('Open the application', $base.'/admin/applications/'.$a->id)
            ->line('The CV is on the record — it is not attached to this email on purpose.')
            ->salutation('— Technoware');
    }
}
