<?php

namespace App\Support\Net;

use Illuminate\Support\Str;

/**
 * Whether a host is one this server may open a connection to on somebody's
 * say-so.
 *
 * Four features reach out to an address an administrator or a campaign
 * manager typed — a webhook, the newsletter's mailbox scan, the ticket
 * mailbox and outgoing SMTP — and each is the shape of an SSRF: the API,
 * from inside the network it lives on, connecting to `127.0.0.1`, the cloud
 * metadata service at `169.254.169.254`, the database host, or whatever else
 * answers on the LAN, and in the webhook's case reading back what it said.
 * One definition, so the four cannot disagree about what "private" means.
 *
 * Three ways an address hides, each closed here:
 *
 *  - **A private or reserved IP**, in either family, and IPv4 written inside
 *    IPv6 (`::ffff:127.0.0.1`), which PHP's range flags do not unwrap.
 *  - **A number that is not a dotted quad** — `127.1`, `0x7f.0.0.1`,
 *    `0177.0.0.1`, `2130706433`. `FILTER_VALIDATE_IP` refuses to call them
 *    addresses, so they fell through to the name checks and passed, and then
 *    the resolver read them the way `inet_aton` does: as loopback.
 *  - **A public name that resolves to a private address.** Checked by
 *    resolving; the webhook also *pins* the address it checked, so the
 *    connection cannot be made to a second answer (DNS rebinding).
 *
 * The resolver is looked up in the container under `RESOLVER`, so a test
 * can say what a name resolves to without a DNS lookup; the base test case
 * binds one that resolves nothing.
 */
class PublicHost
{
    public const RESOLVER = 'net.host-resolver';

    /** IPv4 ranges PHP's flags leave out and that are nobody's public host. */
    private const EXTRA_V4 = [
        ['100.64.0.0', 10],   // carrier-grade NAT
        ['192.0.0.0', 24],    // IETF protocol assignments
        ['198.18.0.0', 15],   // benchmarking
    ];

    public static function isPublicIp(string $ip): bool
    {
        $ip = Str::lower(trim($ip, '[]'));

        // IPv4 carried in IPv6 is judged as the IPv4 it is.
        if (preg_match('/^::ffff:(\d+\.\d+\.\d+\.\d+)$/', $ip, $m)) {
            $ip = $m[1];
        }

        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return false;
        }

        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }

        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
            $long = ip2long($ip);

            foreach (self::EXTRA_V4 as [$base, $bits]) {
                $mask = -1 << (32 - $bits);

                if (($long & $mask) === (ip2long($base) & $mask)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * A host written as a number in a form other than an ordinary address:
     * every label decimal, octal-looking or `0x` hex. No real name is
     * written that way — a top-level domain is never a number — so such a
     * host is an address in disguise.
     */
    public static function isNumericForm(string $host): bool
    {
        $labels = explode('.', rtrim(Str::lower($host), '.'));

        foreach ($labels as $label) {
            if (! preg_match('/^(0x[0-9a-f]*|\d+)$/', $label)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Why this host may not be connected to, or null.
     *
     * `$requireResolution` is for a connection that will be pinned: an
     * address that resolves to nothing cannot be checked, and letting the
     * HTTP client resolve it afresh is the rebinding gap.
     */
    public static function refusal(string $host, bool $requireResolution = false): ?string
    {
        $host = Str::lower(trim($host, '[] '));

        if ($host === '') {
            return 'There is no host.';
        }

        if (filter_var($host, FILTER_VALIDATE_IP) !== false || str_starts_with($host, '::ffff:')) {
            return self::isPublicIp($host) ? null : 'That address is private or local to this server.';
        }

        if (self::isNumericForm($host)) {
            return 'Write the address as a name, or as four ordinary numbers.';
        }

        $addresses = self::resolve($host);

        if ($addresses === []) {
            return $requireResolution ? 'That name could not be resolved.' : null;
        }

        foreach ($addresses as $address) {
            if (! self::isPublicIp($address)) {
                return 'That name resolves to a private or local address.';
            }
        }

        return null;
    }

    /** @return list<string> every address the name resolves to, in both families */
    public static function resolve(string $host): array
    {
        $resolver = app()->bound(self::RESOLVER) ? app(self::RESOLVER) : [self::class, 'dns'];

        return array_values(array_unique(array_map('strval', (array) $resolver($host))));
    }

    /** @return list<string> */
    public static function dns(string $host): array
    {
        $v4 = @gethostbynamel($host) ?: [];
        $v6 = array_column(@dns_get_record($host, DNS_AAAA) ?: [], 'ipv6');

        return [...$v4, ...$v6];
    }
}
