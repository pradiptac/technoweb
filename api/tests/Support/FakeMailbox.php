<?php

namespace Tests\Support;

use App\Support\InboundMail\IncomingAttachment;
use App\Support\InboundMail\IncomingMessage;
use App\Support\InboundMail\Mailbox;
use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * A mailbox made of arrays, so the piper can be tested without IMAP.
 *
 * Bind it in the container (`$this->app->instance(Mailbox::class, $fake)`)
 * and every path from "a message arrived" to "a ticket exists and somebody
 * was told" runs for real against the database. What it cannot test is the
 * IMAP session itself, which is the same standing the Google consent
 * handshake has.
 */
class FakeMailbox implements Mailbox
{
    /** @var list<IncomingMessage> */
    public array $messages = [];

    /** @var list<string> the ids that were flagged or moved, in order */
    public array $processed = [];

    /** When set, every call answers with this refusal, the way a server would. */
    public ?string $refuse = null;

    /** @param  list<IncomingMessage>  $messages */
    public function __construct(array $messages = [])
    {
        $this->messages = $messages;
    }

    public function unseen(int $limit): iterable
    {
        $this->refuseIfAsked();

        $out = [];
        foreach ($this->messages as $message) {
            if (! in_array($message->id, $this->processed, true)) {
                $out[] = $message;
            }
            if (count($out) >= $limit) {
                break;
            }
        }

        return $out;
    }

    public function markProcessed(IncomingMessage $message): void
    {
        $this->processed[] = $message->id;
    }

    public function probe(): array
    {
        $this->refuseIfAsked();

        return ['account' => 'desk@example.test', 'folder' => 'INBOX', 'unseen' => count($this->unseen(1000))];
    }

    /**
     * A message with sensible defaults, so a test names only what it is about.
     *
     * @param  array<string, string>  $headers
     * @param  list<IncomingAttachment>  $attachments
     */
    public static function message(
        string $from = 'neil@example.test',
        string $subject = 'The core switch keeps rebooting',
        ?string $text = "Since Monday the core switch reboots every few hours.\nNothing in the logs.",
        ?string $html = null,
        ?string $fromName = 'Neil Basu',
        ?string $messageId = null,
        array $headers = [],
        array $attachments = [],
        ?string $id = null,
        ?string $returnPath = null,
        ?string $contentType = null,
        ?CarbonImmutable $date = null,
    ): IncomingMessage {
        static $n = 0;
        $n++;

        return new IncomingMessage(
            id: $id ?? "uid-{$n}",
            messageId: $messageId ?? "<msg-{$n}@example.test>",
            fromEmail: $from,
            fromName: $fromName,
            subject: $subject,
            text: $text,
            html: $html,
            headers: array_change_key_case($headers, CASE_LOWER),
            date: $date ?? CarbonImmutable::parse('2026-09-18 10:00:00'),
            attachments: $attachments,
            to: ['support@technoware.in'],
            returnPath: $returnPath,
            contentType: $contentType,
        );
    }

    public static function attachment(string $filename, string $contents, ?string $mime = null, bool $inline = false, ?string $contentId = null, ?int $size = null): IncomingAttachment
    {
        return new IncomingAttachment(
            filename: $filename,
            mime: $mime,
            size: $size ?? strlen($contents),
            inline: $inline,
            contentId: $contentId,
            contents: fn () => $contents,
        );
    }

    private function refuseIfAsked(): void
    {
        if ($this->refuse !== null) {
            throw new RuntimeException($this->refuse);
        }
    }
}
