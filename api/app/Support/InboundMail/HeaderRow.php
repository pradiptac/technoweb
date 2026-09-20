<?php

namespace App\Support\InboundMail;

use Carbon\CarbonImmutable;

/**
 * What a headers-only scan sees of one message: who it was to and copied
 * to, who it was from, when, and enough to tell it from a copy of itself.
 * Never the body — the newsletter's scan wants addresses, not contents.
 */
final class HeaderRow
{
    /**
     * @param  list<MailAddress>  $to
     * @param  list<MailAddress>  $cc
     */
    public function __construct(
        public readonly int $uid,
        public readonly ?string $messageId,
        public readonly ?MailAddress $from,
        public readonly array $to,
        public readonly array $cc,
        public readonly ?CarbonImmutable $date,
    ) {}
}
