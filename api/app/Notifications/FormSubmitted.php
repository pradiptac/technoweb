<?php

namespace App\Notifications;

use App\Models\Form;
use App\Models\FormSubmission;
use App\Models\Lead;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
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
    use Templated;

    /** Optional for the same reason it is on `EnquiryReceived`. */
    public function __construct(public Form $form, public FormSubmission $submission, public ?Lead $lead = null) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'form_submitted';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $labels = $this->form->fields->pluck('label', 'name');
        $answers = '';

        /*
         * A form's questions are whatever an editor built, so this cannot be a
         * fixed set of placeholders — the whole block is one.
         */
        foreach ($this->submission->data as $key => $value) {
            $text = is_bool($value)
                ? ($value ? 'Yes' : 'No')
                : str(HtmlSanitiser::toText((string) $value))->limit(1200)->value();

            if ($text !== '') {
                $answers .= '<p><strong>'.e($labels[$key] ?? $key).':</strong> '.e($text).'</p>';
            }
        }

        return [
            'form_name' => $this->form->name,
            'answers' => $answers,
            'lead' => LeadMailLines::html($this->lead),
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
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

    /**
     * The first email-kind answer, if the form collected one.
     *
     * The resolver moved to `Form::submitterEmail()` when the acknowledgement
     * to the submitter became a second caller for it. Same rule, one copy.
     */
    private function replyAddress(): ?string
    {
        return $this->form->submitterEmail($this->submission);
    }
}
