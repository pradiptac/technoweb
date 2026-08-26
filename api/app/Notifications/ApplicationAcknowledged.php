<?php

namespace App\Notifications;

use App\Models\JobApplication;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The candidate's receipt.
 *
 * Sent because the alternative is somebody wondering for a fortnight whether
 * the form worked at all. It deliberately promises nothing about a reply
 * beyond "if there is a fit": an acknowledgement that implies an interview is
 * worse than none.
 */
class ApplicationAcknowledged extends Notification
{
    use Queueable;

    public function __construct(public JobApplication $application) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('We have your application — '.$this->application->job_title)
            ->greeting('Thank you, '.$this->application->name)
            ->line('Your application for **'.$this->application->job_title.'** has reached us, along with your CV.')
            ->line('A member of the team reads every application. If your experience lines up with what the role needs, we will be in touch to arrange a conversation.')
            // Said plainly. People are entitled to know how long their CV sits
            // with a company they may never hear from again.
            ->line('We keep applications on file for six months and then delete them, CV included.')
            ->salutation('— Technoware');
    }
}
