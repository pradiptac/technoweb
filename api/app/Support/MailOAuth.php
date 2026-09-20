<?php

namespace App\Support;

use App\Enums\MailTransport;
use App\Support\OAuth\OAuthConnection;
use RuntimeException;

/**
 * Consent, tokens and refresh for the connected Google mailbox that outgoing
 * mail leaves through.
 *
 * A facade over `OAuthConnection::outgoing()` since the ticket mailbox joined
 * it (2026-09-18): the mechanics — the single-use state, the locked refresh,
 * the `mail_error` write on a refusal — live there once, keyed by a slot so
 * the two mailboxes share nothing. This class keeps the static API every
 * caller had; `MailSettingsProvider` reads `host`/`port` from `provider()`
 * and `MailController` drives the round trip through the four verbs below.
 *
 * The scope is broader than it looks and worth naming here.
 * `https://mail.google.com/` is full mailbox access: there is no send-only
 * scope that works over SMTP AUTH. `gmail.send` *is* send-only, and is
 * accepted only by the Gmail HTTP API — a different transport. That trade is
 * written down rather than discovered during a security review.
 */
class MailOAuth
{
    /**
     * @return array{auth: string, token: string, scope: string, host: string, port: int, revoke: ?string}
     */
    public static function provider(MailTransport $transport): array
    {
        return match ($transport) {
            MailTransport::Google => [
                ...OAuthConnection::outgoing($transport)->endpoints(),
                // Full mailbox access, because SMTP XOAUTH2 accepts nothing
                // narrower. See the class docblock.
                'scope' => 'https://mail.google.com/',
                'host' => 'smtp.gmail.com',
                'port' => 587,
            ],
            default => throw new RuntimeException("{$transport->value} does not connect a mailbox."),
        };
    }

    /**
     * Where to send the administrator, and the state proving they came back
     * from where we sent them. See OAuthConnection::authorizeUrl().
     *
     * @return array{url: string, state: string}
     */
    public static function authorizeUrl(MailTransport $transport, string $redirectUri): array
    {
        self::provider($transport);

        return OAuthConnection::outgoing($transport)->authorizeUrl($redirectUri, ['transport' => $transport->value]);
    }

    /** @return array{transport: MailTransport, redirect: string} */
    public static function consumeState(string $state): array
    {
        $stored = OAuthConnection::outgoing(MailTransport::Google)->consumeState($state);

        return [
            'transport' => MailTransport::from($stored['extra']['transport'] ?? MailTransport::Google->value),
            'redirect' => $stored['redirect'],
        ];
    }

    /** Swap the authorisation code for tokens; returns the connected address. */
    public static function exchange(MailTransport $transport, string $code, string $redirectUri): string
    {
        return OAuthConnection::outgoing($transport)->exchange($code, $redirectUri);
    }

    /** A valid access token, refreshed under a lock if it is close to expiring. */
    public static function accessToken(MailTransport $transport): string
    {
        return OAuthConnection::outgoing($transport)->accessToken();
    }

    public static function refresh(MailTransport $transport): string
    {
        return OAuthConnection::outgoing($transport)->refresh();
    }

    public static function disconnect(): void
    {
        OAuthConnection::outgoing(MailTransport::Google)->disconnect();
    }

    /**
     * Record why mail stopped working, somewhere a person will see it.
     * See OAuthConnection::fail().
     */
    public static function fail(string $message): void
    {
        OAuthConnection::outgoing(MailTransport::Google)->fail($message);
    }
}
