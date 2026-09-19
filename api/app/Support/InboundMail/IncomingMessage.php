<?php

namespace App\Support\InboundMail;

use Carbon\CarbonImmutable;

/**
 * An email as the piper sees it: already parsed, provider-agnostic.
 *
 * `ImapMailbox` builds one from a webklex message; the tests build them by
 * hand. Nothing downstream knows what IMAP is.
 *
 * `$id` is whatever the mailbox needs to find the message again to mark it
 * processed (the IMAP UID). `$messageId` is the RFC 5322 Message-ID, the
 * thing the ledger is keyed on — see dedupeKey() for what happens when a
 * sender omits it.
 *
 * @property-read array<string, string> $headers  lower-cased names, first value
 */
final class IncomingMessage
{
    /**
     * @param  list<string>  $to
     * @param  list<string>  $cc
     * @param  list<string>  $references
     * @param  array<string, string>  $headers
     * @param  list<IncomingAttachment>  $attachments
     */
    public function __construct(
        public readonly string $id,
        public readonly ?string $messageId,
        public readonly string $fromEmail,
        public readonly ?string $fromName,
        public readonly string $subject,
        public readonly ?string $text = null,
        public readonly ?string $html = null,
        public readonly array $headers = [],
        public readonly ?CarbonImmutable $date = null,
        public readonly array $attachments = [],
        public readonly array $to = [],
        public readonly array $cc = [],
        public readonly ?string $inReplyTo = null,
        public readonly array $references = [],
        public readonly ?string $returnPath = null,
        public readonly ?string $contentType = null,
    ) {}

    /**
     * What the ledger is keyed on.
     *
     * The Message-ID with its angle brackets off and its case folded — the
     * same message re-delivered by a flaky IMAP session is the same key. A
     * message with no Message-ID at all (rare, and usually a script) gets
     * one derived from what it *does* carry, so a redelivery of that still
     * collapses to one row. A synthetic id is marked as such, because
     * nobody should ever try to look it up anywhere but here.
     */
    public function dedupeKey(): string
    {
        $id = strtolower(trim((string) $this->messageId, " <>\t\r\n"));

        if ($id !== '') {
            return mb_substr($id, 0, 255);
        }

        $first = $this->attachments[0]->filename ?? '';

        return sha1(implode('|', [
            strtolower($this->fromEmail),
            $this->subject,
            $this->date?->toIso8601String() ?? '',
            $first,
        ])).'@synthetic.technoware';
    }

    /** A header by name, case-insensitively; null when absent. */
    public function header(string $name): ?string
    {
        $value = $this->headers[strtolower($name)] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    public function fromLocalPart(): string
    {
        return strtolower((string) strstr($this->fromEmail, '@', true) ?: $this->fromEmail);
    }
}
