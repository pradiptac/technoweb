<?php

namespace App\Support\OAuth;

/**
 * The one check on where a consent round trip is allowed to come back to.
 *
 * The redirect URI is supplied by the frontend rather than built here — the
 * console and the API are different origins, and only the frontend knows the
 * URL it is actually reachable at — and it is echoed to the provider and used
 * again at the exchange. Unchecked, it is an open redirect that ends with
 * somebody else holding an authorisation code for this site's mailbox.
 *
 * The host is compared for equality: `str_contains` would accept
 * `technoware.in.attacker.test`, the reasoning `App\Support\YouTube` follows.
 * Only the exact console callback path is accepted, plus localhost for
 * development. Two callers now — outgoing mail and the ticket mailbox — each
 * naming its own path, which is why the path is an argument and not a
 * constant.
 */
final class CallbackPath
{
    public static function assert(string $url, string $path): string
    {
        $allowed = parse_url((string) config('app.frontend_url'), PHP_URL_HOST);
        $host = parse_url($url, PHP_URL_HOST);
        $actual = parse_url($url, PHP_URL_PATH);

        $isLocal = in_array($host, ['localhost', '127.0.0.1'], true);

        abort_unless(
            ($host === $allowed || $isLocal) && $actual === $path,
            422,
            'That is not this site\'s callback address.',
        );

        return $url;
    }
}
