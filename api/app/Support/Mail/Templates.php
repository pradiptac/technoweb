<?php

namespace App\Support\Mail;

use App\Models\MailTemplate;
use App\Support\HtmlSanitiser;
use Closure;
use Illuminate\Mail\Markdown;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * An editor's copy in place of the built-in message — or, far more often,
 * not.
 *
 * ## It decorates, it does not rebuild
 *
 * The notification builds its own `MailMessage` exactly as it always has, and
 * this replaces the subject and the body on it. Everything else rides through
 * untouched: `->attach()` on `ActivationProcedureIssued`, `->replyTo()` on the
 * enquiry and form notifications, `$tries`, `backoff()`, `failed()`, `via()`
 * and `Notifier`'s guard. Building a fresh message instead would mean
 * remembering all of that in a second place, and the one that gets forgotten
 * is the attachment nobody notices is missing.
 *
 * ## It falls back twice, because there are two ways to fail
 *
 * No row, a switched-off row, a blank one — the built-in. And a row that
 * *throws* while rendering — also the built-in, logged. That second one is the
 * point: the caller has already committed its work. A receipt whose template
 * has a broken placeholder must still reach the customer, which is the rule
 * `Notifier::guard()` follows for the same reason.
 *
 * ## Nothing is assigned until everything has rendered
 *
 * `MailMessage` is mutable and `->subject()` writes in place, so the whole
 * message is rendered into locals first. Mutating and *then* discovering the
 * body throws would leave a customised subject sitting over built-in copy — a
 * half-applied template, which is the one outcome worse than no template.
 *
 * ## The row is read once and three things derive from it
 *
 * Wording, copies and the sender. The copies and the sender are applied
 * **before** the wording's early return, because a message with the built-in
 * text and an archive BCC must still carry the BCC — the first cut read the
 * row inside the wording branch, which would have dropped every address the
 * moment somebody reset the words. Whether the message goes at all is a
 * fourth thing from the same row, asked earlier, by `sends()`.
 */
class Templates
{
    /**
     * @param  Closure(): array<string, string>  $data  deferred, so an
     *                                                  uncustomised message never pays to assemble values nothing reads
     */
    public static function apply(MailMessage $message, string $key, Closure $data): MailMessage
    {
        $row = MailTemplate::query()->where('key', $key)->first();

        if ($row === null) {
            return $message;
        }

        self::address($message, $row);

        if (! $row->isUsable()) {
            return $message;
        }

        try {
            $rendered = self::render(
                $key,
                (string) $row->subject,
                (string) $row->body_html,
                $row->body_text,
                $data(),
            );
        } catch (Throwable $e) {
            Log::error('A mail template could not be rendered, so the built-in message was sent', [
                'key' => $key,
                'error' => $e->getMessage(),
            ]);

            return $message;
        }

        return $message
            ->subject($rendered['subject'])
            ->view(
                ['html' => 'mail.prerendered-html', 'text' => 'mail.prerendered-text'],
                ['document' => $rendered['document'], 'plain' => $rendered['plain']],
            );
    }

    /**
     * Does this message go at all?
     *
     * Asked from `Templated::shouldSend()`, which the framework and its fake
     * both honour and which runs at *delivery* — so a queued receipt re-reads
     * the switch when the job runs, not when the order was placed. No row is
     * the ordinary case and means yes.
     */
    public static function sends(string $key): bool
    {
        $row = MailTemplate::query()->where('key', $key)->first(['sends']);

        return $row === null || $row->sends;
    }

    /**
     * Who else gets a copy, and who it comes from.
     *
     * `cc()` and `bcc()` append, so a notification that set its own is not
     * overwritten (none do today). `from()` replaces, and none set one either
     * — the global sender is whatever `MailSettingsProvider` wrote into
     * `config('mail.from')` at boot, so a name without an address takes that
     * address with the given name, the campaign's rule.
     */
    private static function address(MailMessage $message, MailTemplate $row): void
    {
        if (filled($row->cc)) {
            $message->cc($row->cc);
        }

        if (filled($row->bcc)) {
            $message->bcc($row->bcc);
        }

        if (filled($row->from_email) || filled($row->from_name)) {
            $message->from(
                $row->from_email ?: (string) config('mail.from.address'),
                $row->from_name ?: (string) config('mail.from.name'),
            );
        }
    }

    /**
     * Copy in, finished message out — the one path, so a preview is a preview
     * of what will actually be sent rather than of something assembled a
     * second way. The console's preview endpoint calls exactly this.
     *
     * The shell is applied **here** rather than in the view the channel
     * renders, because the markdown path renders *one* view for both the HTML
     * and the text half and so cannot carry two different bodies. Rendering
     * eagerly through `Markdown` is what registers the `mail::` components and
     * inlines the theme CSS; the channel is then handed finished strings.
     *
     * @param  array<string, string>  $values
     * @return array{subject: string, html: string, text: string, document: string, plain: string}
     */
    public static function render(
        string $key,
        string $subject,
        string $bodyHtml,
        ?string $bodyText,
        array $values,
    ): array {
        $raw = MessageCatalogue::rawVariables($key);

        // A subject is not HTML, so escaping it would put `&amp;` into
        // somebody's inbox where an ampersand belongs.
        $subject = Placeholders::fillText($subject, $values);

        // A newline in a subject is header injection, and the sanitiser does
        // not cover it because a subject is not markup. It is refused on write
        // as well; this is the half that holds for a row written any other way.
        $subject = trim(preg_replace('/[\r\n]+/', ' ', $subject) ?? $subject);

        $html = Placeholders::fill($bodyHtml, $values, $raw);

        $text = filled($bodyText)
            ? Placeholders::fillText($bodyText, $values)
            : HtmlSanitiser::toEmailText($html);

        $markdown = app(Markdown::class);

        return [
            // The body alone, which is what the editor typed and what a
            // preview of *their* work should show under the shell.
            'subject' => $subject,
            'html' => $html,
            'text' => $text,
            // The whole email, themed and inlined.
            'document' => (string) $markdown->render('mail.template-html', ['html' => $html]),
            'plain' => (string) $markdown->renderText('mail.template-text', ['text' => $text]),
        ];
    }
}
