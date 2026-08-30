<?php

namespace App\Mail;

use App\Models\NewsletterCampaign;
use App\Models\NewsletterCampaignRecipient;
use Illuminate\Mail\Attachment;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Support\Facades\Storage;

/**
 * One campaign email, already rendered.
 *
 * A `Mailable` rather than a `Notification`, and not for style: the HTML and
 * the text part are built per recipient before this is constructed, so there
 * is nothing here to render. Every other message in this application is a
 * notification because it is composed from a model; a campaign is composed by
 * an editor and is handed over whole.
 *
 * **Not queued itself.** `SendCampaignBatch` is the job, and one queued
 * mailable per recipient would put fifty thousand rows in the `jobs` table for
 * a campaign of fifty thousand — each carrying its own copy of the rendered
 * HTML. The batch is the unit of work; this is the message.
 */
class CampaignMessage extends Mailable
{
    public function __construct(
        public NewsletterCampaign $campaign,
        public string $bodyHtml,
        public string $bodyText,
        public NewsletterCampaignRecipient $recipient,
    ) {}

    public function envelope(): Envelope
    {
        $from = filled($this->campaign->from_email)
            ? new Address($this->campaign->from_email, $this->campaign->from_name ?: (string) config('mail.from.name'))
            : null;

        return new Envelope(
            from: $from,
            replyTo: filled($this->campaign->reply_to) ? [$this->campaign->reply_to] : [],
            subject: $this->campaign->subject,
        );
    }

    public function headers(): Headers
    {
        $base = rtrim((string) config('app.frontend_url'), '/');
        $token = $this->recipient->subscriber?->unsubscribe_token;

        return new Headers(text: array_filter([
            /*
             * `List-Unsubscribe`, which is what puts the client's own
             * unsubscribe button beside the sender name.
             *
             * It matters more than it looks: Gmail and Outlook show that
             * button instead of the "report spam" one people otherwise reach
             * for, and a spam complaint costs the sending domain far more than
             * an unsubscribe does. `One-Click` is the RFC 8058 half — without
             * it the header is advisory and some clients ignore it.
             */
            'List-Unsubscribe' => $token ? '<'.$base.'/newsletter/unsubscribe/'.$token.'>' : null,
            'List-Unsubscribe-Post' => $token ? 'List-Unsubscribe=One-Click' : null,
        ]));
    }

    /**
     * The campaign's one attachment, if it has one.
     *
     * Attached by path from the public disk and named with the human filename
     * — the stored name is a hash, and `a8f3c1….pdf` in somebody's downloads
     * folder is worse than no attachment at all. A missing file is skipped
     * rather than throwing: the message is worth sending without its brochure,
     * and a campaign that fails wholesale because a file was deleted after it
     * was queued is the worse outcome.
     *
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        if (blank($this->campaign->attachment_path)) {
            return [];
        }

        $disk = Storage::disk('public');

        if (! $disk->exists($this->campaign->attachment_path)) {
            return [];
        }

        return [
            Attachment::fromStorageDisk('public', $this->campaign->attachment_path)
                ->as($this->campaign->attachment_name ?: 'attachment.pdf')
                ->withMime('application/pdf'),
        ];
    }

    public function content(): Content
    {
        // Both parts, always — `multipart/alternative`. A message with no text
        // alternative is one of the strongest spam signals there is, which is
        // why the health check refuses to pass a campaign without one.
        return new Content(
            htmlString: $this->bodyHtml,
            // `text:` is the plain-text *view*, not `textView:` — the latter
            // is not a parameter this version accepts and fails at send.
            text: 'mail.campaign-text',
            with: ['body' => $this->bodyText],
        );
    }
}
