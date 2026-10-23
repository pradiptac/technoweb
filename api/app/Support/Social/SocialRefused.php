<?php

namespace App\Support\Social;

use RuntimeException;

/** LinkedIn answered, and said no. The message is LinkedIn's own sentence; it never carries a token. */
final class SocialRefused extends RuntimeException
{
    public function __construct(string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
