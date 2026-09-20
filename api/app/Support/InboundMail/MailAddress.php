<?php

namespace App\Support\InboundMail;

/** One address off a header line: the mailbox, lower-cased, and the display name if it had one. */
final class MailAddress
{
    public function __construct(
        public readonly string $email,
        public readonly ?string $name = null,
    ) {}
}
