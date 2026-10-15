<?php

namespace App\Support\Store\Zoho;

use RuntimeException;

/**
 * Zoho Books said no, or could not be reached.
 *
 * The message is Zoho's own words where it gave any — they name the field
 * and what is wrong with it, and they are shown to staff on the order and
 * on the settings screen, never to a customer. `status` is the HTTP status
 * (0 when nothing answered), so a caller can tell a refusal that will be the
 * same next time from an outage that will not.
 */
final class ZohoRefused extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 0)
    {
        parent::__construct($message);
    }

    /** The account itself is the problem: no retry will help until somebody reconnects or fixes access. */
    public function isAuthorisation(): bool
    {
        return in_array($this->status, [401, 403], true);
    }
}
