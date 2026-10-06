<?php

namespace App\Notifications;

use App\Models\Form;
use App\Models\FormSubmission;
use App\Models\Lead;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Crm\LeadMailLines;
use App\Support\Forms\AnswerText;
use App\Support\Mail\MailBrand;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A submission from a form an editor built.
 *
 * Every value is printed as plain text through `HtmlSanitiser::toText()` (by
 * way of `AnswerText`, the one formatter the CSV export shares) — the same
 * treatment the derived meta descriptions get. A submission is the one
 * piece of content on this site written by an anonymous stranger, and a mail
 * client renders HTML; nothing typed into a public form should reach one as
 * markup.
 */
class FormSubmitted extends Notification implements ShouldQueue
{
    use QueuedMail;
    use Templated;

    /**
     * What the message says instead of carrying the file.
     *
     * **An upload is never attached.** It came from a stranger through a form
     * open to the internet, and an attachment would deliver it into an inbox
     * — past the role check that guards the download, onto whatever device
     * reads that mailbox, and forwarded from there by one press. The filename
     * is in the answers; the file stays behind the console's sign-in.
     */
    public const UPLOAD_LINE = 'Uploaded files are not attached to this message. Download them from this form’s submissions in the console.';

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
        $answers = '';

        /*
         * A form's questions are whatever an editor built, so this cannot be a
         * fixed set of placeholders — the whole block is one.
         */
        foreach ($this->answers() as [$label, $text]) {
            $answers .= '<p><strong>'.e($label).':</strong> '.e($text).'</p>';
        }

        if ($this->hasUploads()) {
            $answers .= '<p>'.e(self::UPLOAD_LINE).'</p>';
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

        foreach ($this->answers() as [$label, $text]) {
            $message->line("**{$label}:** {$text}");
        }

        if ($this->hasUploads()) {
            $message->line(self::UPLOAD_LINE);
        }

        LeadMailLines::add($message, $this->lead);

        // Reply goes to whoever wrote in, when the form collected an address,
        // rather than to the site's own from address.
        $replyTo = $this->replyAddress();
        if ($replyTo) {
            $message->replyTo($replyTo);
        }

        return $message->salutation(MailBrand::signoff());
    }

    /**
     * Every answer as a label and a line of text, in the form's own order.
     *
     * `AnswerText` is the one formatter, shared with the CSV export: a list
     * of choices joined by commas, a rating as "4 / 5", a tick box as a word,
     * an upload as its filename.
     *
     * **Walked by the form's fields, not by the stored keys.** `data` is a
     * MySQL JSON object, and MySQL keeps an object's keys by length and then
     * alphabetically — the trap `App\Casts\SpecSheet` exists for — so the
     * order a submission comes back in is not the order the form asked. A
     * key the form no longer declares (the field was renamed since) is still
     * printed, after the rest, under its key.
     *
     * @return list<array{0: string, 1: string}>
     */
    private function answers(): array
    {
        $data = $this->submission->data ?? [];
        $answers = [];

        foreach ($this->form->valueFields() as $field) {
            if (! array_key_exists($field->name, $data)) {
                continue;
            }

            $text = AnswerText::for($field, $data[$field->name]);
            unset($data[$field->name]);

            if ($text !== '') {
                $answers[] = [(string) $field->label, $text];
            }
        }

        foreach ($data as $key => $value) {
            if (($text = AnswerText::for(null, $value)) !== '') {
                $answers[] = [(string) $key, $text];
            }
        }

        return $answers;
    }

    private function hasUploads(): bool
    {
        return ! empty($this->submission->files);
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
