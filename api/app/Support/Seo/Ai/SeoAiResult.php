<?php

namespace App\Support\Seo\Ai;

use App\Models\SeoSuggestion;

/**
 * What a run produced, or why it produced nothing.
 *
 * A value object rather than an array, for the reason `AiReply` gives: a caller
 * reading `$result['data']` from a run that failed gets null quietly, and a
 * quiet null in an admin screen is a button that appears to do nothing.
 *
 * `$error` is the sentence shown to the editor and is written by us. The
 * provider's own words — which carry model names, quota messages and
 * organisation ids — go to the log and never here.
 */
readonly class SeoAiResult
{
    public function __construct(
        public bool $ok,
        public ?SeoSuggestion $suggestion = null,
        public ?string $error = null,
    ) {}

    public static function of(SeoSuggestion $suggestion): self
    {
        return new self(true, $suggestion);
    }

    public static function failed(string $error): self
    {
        return new self(false, null, $error);
    }
}
