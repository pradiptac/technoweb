<?php

namespace App\Support\Chat;

/**
 * What a provider gave back, or why it did not.
 *
 * A value object rather than a raw array, so a caller cannot read
 * `$reply['text']` from a response that failed and get null quietly. The
 * failure is a first-class answer here: the visitor still has to be told
 * something, and what they are told must never be the provider's own error —
 * that is where model names, quota messages and organisation ids live.
 */
readonly class AiReply
{
    public function __construct(
        public bool $ok,
        public string $text = '',
        public int $tokens = 0,
        /** For the log and the console. Never for the visitor. */
        public ?string $error = null,
    ) {}

    public static function of(string $text, int $tokens = 0): self
    {
        return new self(true, $text, $tokens);
    }

    public static function failed(string $error): self
    {
        return new self(false, '', 0, $error);
    }
}
