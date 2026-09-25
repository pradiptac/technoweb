<?php

namespace App\Support\Messaging;

use App\Support\Messaging\Providers\ChannelProvider;

/**
 * One provider a channel can be carried by — what the three provider enums
 * (`WhatsAppProvider`, `RcsProvider`, `PushProvider`) have in common, so the
 * settings screen and `MessageChannel` can treat them as one list.
 *
 * Implemented by backed enums; `id()` is the stored value.
 */
interface ProviderOption
{
    /** The stored id — the enum's value. */
    public function id(): string;

    public function label(): string;

    public function blurb(): string;

    /**
     * The settings this provider reads, in the order the form draws them.
     *
     * @return list<string>
     */
    public function fields(): array;

    /** Whether this server can drive it at all — the code, and the PHP it needs. */
    public function isAvailable(): bool;

    /** The client that talks to it, built from the stored settings. */
    public function client(): ChannelProvider;
}
