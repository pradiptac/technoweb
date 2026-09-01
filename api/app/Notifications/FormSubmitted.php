<?php

namespace App\Notifications;

use App\Models\Form;
use App\Models\FormSubmission;
use App\Models\Lead;
use App\Notifications\Concerns\QueuedMail;
use App\Support\Crm\LeadMailLines;
use App\Support\HtmlSanitiser;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A submission from a form an editor built.
 *
 * Every value is printed as plain text through `HtmlSanitiser::toText()` — the
 * same treatment the derived meta descriptions get. A submission is the one
 * piece of content on this site written by an anonymous stranger, and a mail
 * client renders HTML; nothing typed into a public form should reach one as
 * markup.
 */
class FormSubmitted extends Notification implements ShouldQueue
{
    use QueuedMail;

    /** Optional for the same reason it is on `EnquiryReceived`. */
    public function __construct(public Form $form, public FormSubmission $submission, public ?Lead $lead = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)
            ->subject('Website form: '.$this->form->name)
            ->greeting('New submission from '.$this->form->name.'.');

        $labels = $this->form->fields->pluck('label', 'name');

        foreach ($this->submission->data as $key => $value) {
            $label = $labels[$key] ?? $key;
            $text = is_bool($value)
                ? ($value ? 'Yes' : 'No')
                : str(HtmlSanitiser::toText((string) $value))->limit(1200)->value();

            if ($text !== '') {
                $message->line("**{$label}:** {$text}");
            }
        }

        LeadMailLines::add($message, $this->lead);

        // Reply goes to whoever wrote in, when the form collected an address,
        // rather than to the site's own from address.
        $replyTo = $this->replyAddress();
        if ($replyTo) {
            $message->replyTo($replyTo);
        }

        return $message->salutation('— Technoware');
    }

    /** The first email-kind field's value, if the form collected one. */
    private function replyAddress(): ?string
    {
        foreach ($this->form->fields as $field) {
            if ($field->kind !== 'email') {
                continue;
            }
            $value = $this->submission->data[$field->name] ?? null;
            if (is_string($value) && filter_var($value, FILTER_VALIDATE_EMAIL)) {
                return $value;
            }
        }

        return null;
    }
}
