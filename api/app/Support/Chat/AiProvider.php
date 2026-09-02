<?php

namespace App\Support\Chat;

/**
 * The one thing the assistant needs from a model.
 *
 * Deliberately narrow: messages in, text out. Streaming, tools and function
 * calling are all absent because the first version does not use them, and an
 * interface written for features nobody has built yet is a shape that turns out
 * to be wrong when they are.
 *
 * The specification asks for this abstraction so a provider can be swapped, and
 * it is the same argument `MailTransport` makes for the six mail transports:
 * one list, so adding a provider is a class rather than a change in four files
 * that then have to agree.
 */
interface AiProvider
{
    /**
     * @param  array<int, array{role: string, content: string}>  $messages
     */
    public function complete(array $messages, int $maxTokens = 500): AiReply;

    /** Whether this provider can run at all — a key, a package, a host. */
    public function isConfigured(): bool;

    public function name(): string;
}
