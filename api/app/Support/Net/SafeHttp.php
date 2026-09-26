<?php

namespace App\Support\Net;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * An HTTP request to an address somebody typed, made so that it can only
 * reach the public internet.
 *
 * `DeliverWebhook` worked this out first and carried it inline: resolve the
 * host, refuse it if any answer is private (`PublicHost`), then tell cURL to
 * use exactly the addresses that were checked (`CURLOPT_RESOLVE`) so it
 * cannot ask DNS a second time and be handed `127.0.0.1` — and never follow
 * a redirect, since a 302 is the easiest way past every check before it.
 * The WordPress importer needs the same guarantees and also needs to follow
 * redirects (a site moved to `www.`, an upload served from a CDN), so the
 * rules live here once and both call them.
 *
 * `get()` follows up to three redirects **by hand**: each hop is checked and
 * pinned like the first, a hop from https to http is refused, and the
 * `Authorization` header is dropped the moment the host changes — the WP
 * application password is for the site that asked for it, not for wherever
 * it points.
 *
 * `$allowPrivate` exists for one reason: a WordPress running under Laragon on
 * the developer's own machine is a private address, and it is the only way to
 * test the importer against a real site. The importer passes
 * `config('wordpress_import.allow_private_hosts')`, which is false unless
 * `APP_ENV=local`. Nothing else passes it.
 */
final class SafeHttp
{
    public const MAX_REDIRECTS = 3;

    /** Why this URL may not be requested, or null. */
    public static function refusal(string $url, bool $allowPrivate = false, bool $allowHttp = false): ?string
    {
        $parts = parse_url($url);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = (string) ($parts['host'] ?? '');

        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return 'That is not a web address.';
        }

        if ($scheme === 'http' && ! $allowHttp && ! $allowPrivate) {
            return 'The address must start with https://.';
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            return 'Leave the username and password out of the address.';
        }

        if ($allowPrivate) {
            return null;
        }

        return PublicHost::refusal($host, requireResolution: true);
    }

    /**
     * A request bound to the addresses this URL's host was checked against.
     *
     * @throws UnsafeUrl when the URL may not be requested
     */
    public static function request(string $url, bool $allowPrivate = false, bool $allowHttp = false): PendingRequest
    {
        $refusal = self::refusal($url, $allowPrivate, $allowHttp);

        if ($refusal !== null) {
            throw new UnsafeUrl($refusal);
        }

        return Http::withoutRedirecting()->withOptions(['curl' => [CURLOPT_RESOLVE => self::pins($url)]]);
    }

    /**
     * A GET that follows redirects safely.
     *
     * @param  array{headers?: array<string, string>, basic?: array{0: string, 1: string}, timeout?: int, max_bytes?: int, sink?: string, allow_private?: bool, allow_http?: bool}  $options
     *
     * @throws UnsafeUrl when the URL, or a hop it redirects to, may not be requested
     */
    public static function get(string $url, array $options = []): Response
    {
        $allowPrivate = (bool) ($options['allow_private'] ?? false);
        $allowHttp = (bool) ($options['allow_http'] ?? false);
        $originHost = strtolower((string) parse_url($url, PHP_URL_HOST));

        for ($hop = 0; ; $hop++) {
            $pending = self::request($url, $allowPrivate, $allowHttp)
                ->timeout($options['timeout'] ?? 20)
                ->withHeaders(['User-Agent' => 'Technoware-Importer/1.0'] + ($options['headers'] ?? []));

            // Credentials go to the host they were typed for and nowhere else.
            $sameHost = strtolower((string) parse_url($url, PHP_URL_HOST)) === $originHost;

            if ($sameHost && isset($options['basic'])) {
                $pending = $pending->withBasicAuth($options['basic'][0], $options['basic'][1]);
            }

            if (isset($options['max_bytes'])) {
                $pending = $pending->withOptions(self::capped((int) $options['max_bytes']));
            }

            if (isset($options['sink'])) {
                $pending = $pending->sink($options['sink']);
            }

            $response = $pending->get($url);

            if (! $response->redirect()) {
                return $response;
            }

            if ($hop >= self::MAX_REDIRECTS) {
                throw new UnsafeUrl('The address redirected too many times.');
            }

            $next = self::absolute($url, (string) $response->header('Location'));

            if (parse_url($url, PHP_URL_SCHEME) === 'https' && parse_url($next, PHP_URL_SCHEME) !== 'https') {
                throw new UnsafeUrl('The address redirected from https to an insecure address.');
            }

            $url = $next;
        }
    }

    /** @return list<string> `host:port:address` for every address the host resolves to */
    public static function pins(string $url): array
    {
        $host = (string) parse_url($url, PHP_URL_HOST);
        $scheme = (string) parse_url($url, PHP_URL_SCHEME);
        $port = (int) (parse_url($url, PHP_URL_PORT) ?: ($scheme === 'http' ? 80 : 443));

        // An address literal was checked as itself and needs no pin.
        if (filter_var(trim($host, '[]'), FILTER_VALIDATE_IP) !== false) {
            return [];
        }

        return array_map(
            fn (string $ip) => $host.':'.$port.':'.(str_contains($ip, ':') ? '['.$ip.']' : $ip),
            PublicHost::resolve($host),
        );
    }

    /**
     * Abort a download that runs past `$maxBytes`, whether the server
     * declared its length or not — a `Content-Length` is a claim, the byte
     * count is a fact.
     *
     * @return array<string, mixed>
     */
    private static function capped(int $maxBytes): array
    {
        return [
            'on_headers' => function ($response) use ($maxBytes) {
                $length = (int) ($response->getHeaderLine('Content-Length') ?: 0);

                if ($length > $maxBytes) {
                    throw new UnsafeUrl('The file is larger than the limit.');
                }
            },
            'progress' => function ($total, $downloaded) use ($maxBytes) {
                if ($downloaded > $maxBytes) {
                    throw new UnsafeUrl('The file is larger than the limit.');
                }
            },
        ];
    }

    /** A `Location` header made absolute against the URL that sent it. */
    private static function absolute(string $base, string $location): string
    {
        if ($location === '') {
            throw new UnsafeUrl('The address redirected nowhere.');
        }

        if (preg_match('#^https?://#i', $location)) {
            return $location;
        }

        $parts = parse_url($base);
        $origin = $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');

        if (str_starts_with($location, '//')) {
            return $parts['scheme'].':'.$location;
        }

        if (str_starts_with($location, '/')) {
            return $origin.$location;
        }

        $dir = rtrim(dirname($parts['path'] ?? '/'), '/');

        return $origin.$dir.'/'.$location;
    }
}
