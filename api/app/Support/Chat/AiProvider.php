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
     * `content` is a string, or — for a vision-capable model — a list of
     * parts (`{type: 'text', text}` and `{type: 'image_url', image_url: {url}}`),
     * which is what `AltText` sends. The provider passes the list through
     * unchanged; a model that cannot see answers about the text alone.
     *
     * @param  array<int, array{role: string, content: string|array<int, array<string, mixed>>}>  $messages
     * @param  array{model?: string, response_format?: array, temperature?: float, timeout?: int}  $options
     *
     * `$options` is additive and defaults to empty, which sends exactly the
     * request this interface sent before it existed — so the assistant's
     * behaviour cannot move because something else wanted a knob.
     *
     * It exists for two things the chat path never needed and the SEO
     * assistant cannot work without: a **model chosen per feature**, because
     * writing a meta description and answering a visitor are not worth the same
     * money; and **`response_format`**, because that caller wants JSON it can
     * validate rather than prose it has to guess the shape of. Both are
     * provider-agnostic ideas, which is why they are here rather than smuggled
     * in as a magic message.
     *
     * **`timeout`** is seconds to wait for the reply, for a caller that asks
     * for a long one with nobody watching a typing indicator — a page draft,
     * an article draft. Absent, the provider's own short default stands,
     * which is the one a visitor's question should keep.
     */
    public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply;

    /** Whether this provider can run at all — a key, a package, a host. */
    public function isConfigured(): bool;

    public function name(): string;
}
