<?php

namespace App\Notifications;

use App\Models\Form;
use App\Models\FormSubmission;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The receipt for an editor-built form, including the contact page's.
 *
 * The sibling of `EnquiryAcknowledged`, and separate from it for the reason
 * the two desk notifications are separate: an enquiry has fixed columns and a
 * form has whatever an editor built, so the two have different things to say
 * and different variables to say them with. One class covering both would be
 * one editable message that could only ever use what they have in common.
 *
 * **Sent only when the form actually collected an address.** A form need not
 * ask for one — an editor can build a three-question poll — and
 * `Form::submitterEmail()` returns null there, which `Notifier::to()` already
 * treats as "no recipient" and skips. Guessing at a text field that looks like
 * an address would be worse than not writing: the wrong stranger gets the mail.
 *
 * **It does not echo the answers back.** This is a message the server will send
 * to whatever address a public form is given, bounded by the endpoint's 10/min
 * throttle. Fixed content is a nuisance to abuse; content the sender supplies
 * is a relay. The form's name is enough to say what was received.
 */
class FormAcknowledged extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    public function __construct(public Form $form, public FormSubmission $submission) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'form_acknowledged';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'name' => $this->submitterName(),
            'form_name' => (string) $this->form->name,
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $name = $this->submitterName();

        return (new MailMessage)
            ->subject('We have your message')
            ->greeting($name === '' ? 'Thank you' : 'Thank you, '.$name)
            ->line('We have your **'.$this->form->name.'** submission and somebody will be in touch.')
            ->line('If it is urgent, calling is faster than waiting for a reply to this.')
            ->salutation('— Technoware');
    }

    /**
     * Their name, where the form asked for one.
     *
     * By key rather than by kind, because there is no "name" field kind to
     * read — a name is a `text` field like any other, so the likely keys are
     * the only signal there is. That makes it a guess, which is fine for a
     * greeting and would not be for a recipient: getting this wrong produces
     * "Thank you" instead of "Thank you, Priya", where getting the address
     * wrong would send somebody else's enquiry to a stranger.
     */
    private function submitterName(): string
    {
        foreach (['name', 'full_name', 'your_name', 'contact_name', 'first_name'] as $key) {
            $value = $this->submission->data[$key] ?? null;

            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return '';
    }
}
