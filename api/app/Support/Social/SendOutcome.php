<?php

namespace App\Support\Social;

use App\Models\SocialPost;

/** What approving a post did: the post as it now stands, an address to open for the person, or why not. */
final class SendOutcome
{
    public function __construct(
        public SocialPost $post,
        public ?string $openUrl = null,
        public ?string $refusal = null,
    ) {}
}
