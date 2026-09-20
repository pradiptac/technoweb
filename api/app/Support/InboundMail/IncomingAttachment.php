<?php

namespace App\Support\InboundMail;

use Closure;

/**
 * One file on an incoming email, with its bytes behind a closure.
 *
 * Lazy on purpose: the size gate runs before anything is read, so a 40MB
 * dump the portal's rule would refuse is never pulled off the socket into
 * memory. A signature logo arrives as an inline part with a Content-ID and
 * is skipped by the same rule the portal has no need of — nobody uploads
 * their signature to a ticket form.
 */
final class IncomingAttachment
{
    /** @param  Closure(): string  $contents */
    public function __construct(
        public readonly string $filename,
        public readonly ?string $mime,
        public readonly int $size,
        public readonly bool $inline,
        public readonly ?string $contentId,
        private readonly Closure $contents,
    ) {}

    public function contents(): string
    {
        return ($this->contents)();
    }

    public function extension(): string
    {
        return strtolower(pathinfo($this->filename, PATHINFO_EXTENSION));
    }
}
