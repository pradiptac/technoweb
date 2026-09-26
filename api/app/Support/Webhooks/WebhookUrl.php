<?php

namespace App\Support\Webhooks;

use App\Support\Net\PublicHost;
use Illuminate\Support\Str;

/**
 * Whether a URL is one this server may be pointed at.
 *
 * A webhook is the API making an outbound request to an address an
 * administrator typed, with a signed body, from inside the network the API
 * lives on. That is the shape of an SSRF: `https://127.0.0.1:8000/…` or
 * `https://10.0.0.5/` would have this server post a lead's details at
 * itself, at the database host, or at whatever else answers on the LAN. So
 * the address is checked on **write**, once, with rules a person can read
 * back — not resolved through DNS on every delivery, which is a network
 * call on the request path.
 *
 * Three rules, each answering with a sentence for the form:
 *
 *  - **https only.** A signed payload over plain http is a payload anybody
 *    on the path can read, and the signature then proves only who sent it.
 *  - **No private, loopback or link-local address**, as an IP literal in
 *    either family — `FILTER_FLAG_NO_PRIV_RANGE | NO_RES_RANGE` is the
 *    check, so the ranges are PHP's list rather than one written here.
 *  - **No name that only resolves locally**: `localhost`, a bare hostname
 *    with no dot, or a `.local`/`.internal`/`.lan`/`.home.arpa` suffix.
 *
 * A fourth, since 2026-09-26: **no address written as a bare number** —
 * `127.1`, `0x7f.0.0.1`, `0177.0.0.1` are loopback to the resolver and were
 * not IP literals to `FILTER_VALIDATE_IP`, so they passed as names.
 *
 * A public name that *resolves* to a private address is caught at send
 * time instead: `DeliverWebhook` resolves the host, refuses a private
 * answer, and pins the address it checked so the connection cannot be made
 * to a different one. See `App\Support\Net\PublicHost`.
 */
class WebhookUrl
{
    private const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.localdomain'];

    /** The reason the URL is refused, or null when it is acceptable. */
    public static function refusal(string $url): ?string
    {
        $url = trim($url);

        if (filter_var($url, FILTER_VALIDATE_URL) === false) {
            return 'Enter a full URL, such as https://example.com/hooks/technoware.';
        }

        $parts = parse_url($url);

        if (! is_array($parts) || ($parts['scheme'] ?? '') !== 'https') {
            return 'A webhook must be an https:// address — a signed payload over plain http can be read on the way.';
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            return 'Credentials in the URL are not accepted. Use the signing secret instead.';
        }

        $host = Str::lower(trim((string) ($parts['host'] ?? ''), '[]'));

        if ($host === '') {
            return 'The URL has no host.';
        }

        if (filter_var($host, FILTER_VALIDATE_IP) !== false || str_starts_with($host, '::ffff:')) {
            if (! PublicHost::isPublicIp($host)) {
                return 'That address is private or local to this server. A webhook has to point at a public host.';
            }

            return null;
        }

        if (PublicHost::isNumericForm($host)) {
            return 'Write the host as a name, or as an ordinary address. A number in another form reads as a private one.';
        }

        if ($host === 'localhost' || ! str_contains($host, '.') || Str::endsWith($host, self::LOCAL_SUFFIXES)) {
            return 'That name only resolves locally. A webhook has to point at a public host.';
        }

        return null;
    }
}
