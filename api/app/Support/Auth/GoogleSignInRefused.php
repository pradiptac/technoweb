<?php

namespace App\Support\Auth;

use RuntimeException;

/**
 * A Google sign-in that did not end with somebody identified.
 *
 * `reason` is what the frontend branches on — a short code, never the
 * sentence, the rule a refused login already follows — and the message is
 * the one line a person reads on the sign-in screen. Nothing Google said is
 * in either: its words go to the log.
 */
final class GoogleSignInRefused extends RuntimeException
{
    public function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }
}
