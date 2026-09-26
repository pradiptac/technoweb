<?php

namespace App\Support\WordPress;

use App\Support\Net\SafeHttp;
use Illuminate\Http\Client\Response;
use RuntimeException;

/**
 * The two REST APIs a WordPress site with WooCommerce speaks, read-only.
 *
 * `wp/v2` is authenticated with an **application password** (Users → Profile
 * → Application Passwords, WordPress 5.6+) — it is what lets the scan see
 * drafts, private pages, authors' addresses and menus, none of which the
 * public API returns. `wc/v3` is authenticated with a WooCommerce **REST key
 * and secret** (WooCommerce → Settings → Advanced → REST API, read access is
 * enough) — or, when no key is given, with the same application password,
 * which WooCommerce also accepts from a shop manager or an administrator.
 * Both go as HTTP Basic auth, which WordPress accepts only over https (and
 * WooCommerce's own keys only over https, always) — the other reason
 * `SafeHttp` insists on it.
 *
 * Every request goes through `SafeHttp::get()`, so the site cannot redirect
 * the scan into the network this server lives on, and the credentials are
 * never sent to a host other than the one they were typed for.
 *
 * The API root is found rather than assumed: `/wp-json/` on a site with
 * pretty permalinks, `/?rest_route=/` on one without. `discover()` works out
 * which, once.
 */
class Client
{
    private ?string $root = null;

    public function __construct(
        private readonly string $siteUrl,
        private readonly ?string $wpUser = null,
        private readonly ?string $wpPassword = null,
        private readonly ?string $wcKey = null,
        private readonly ?string $wcSecret = null,
        private readonly bool $allowPrivate = false,
    ) {}

    /** @param  array<string, mixed>  $credentials  as sealed by `Credentials` */
    public static function fromCredentials(array $credentials): self
    {
        return new self(
            (string) $credentials['site_url'],
            $credentials['wp_user'] ?? null,
            $credentials['wp_password'] ?? null,
            $credentials['wc_key'] ?? null,
            $credentials['wc_secret'] ?? null,
            (bool) config('wordpress_import.allow_private_hosts'),
        );
    }

    public function siteUrl(): string
    {
        return rtrim($this->siteUrl, '/');
    }

    /**
     * The site's index: its name, its namespaces, and which of the two root
     * forms answered.
     *
     * @return array{name: string, url: string, namespaces: list<string>, root: string}
     */
    public function discover(): array
    {
        foreach (['/wp-json/', '/?rest_route=/'] as $root) {
            $response = $this->send($this->siteUrl().$root, auth: 'wp');

            if ($response->ok() && is_array($body = $response->json()) && isset($body['namespaces'])) {
                $this->root = $root;

                return [
                    'name' => (string) ($body['name'] ?? ''),
                    'url' => (string) ($body['url'] ?? $this->siteUrl()),
                    'namespaces' => array_values(array_map('strval', (array) $body['namespaces'])),
                    'root' => $root,
                ];
            }
        }

        throw new RuntimeException('No WordPress REST API answered at that address. Check it is the site\'s home page and that the REST API is not blocked by a security plugin.');
    }

    public function useRoot(string $root): void
    {
        $this->root = $root;
    }

    /**
     * One page of a collection, and how many pages there are.
     *
     * @param  array<string, scalar>  $query
     * @return array{items: list<array<string, mixed>>, total_pages: int, total: int}
     */
    public function page(string $route, array $query = [], int $page = 1, int $perPage = 100): array
    {
        $response = $this->get($route, $query + ['page' => $page, 'per_page' => $perPage]);

        // WordPress answers a page past the end with 400 rest_post_invalid_page_number.
        if ($response->status() === 400 && $page > 1) {
            return ['items' => [], 'total_pages' => $page - 1, 'total' => 0];
        }

        $this->refuseFailure($response, $route);

        $items = $response->json();

        return [
            'items' => is_array($items) ? array_values(array_filter($items, 'is_array')) : [],
            'total_pages' => max(1, (int) ($response->header('X-WP-TotalPages') ?: 1)),
            'total' => (int) ($response->header('X-WP-Total') ?: 0),
        ];
    }

    /**
     * One object (a settings group, say), or null for a 404 — an optional
     * endpoint the site does not have.
     *
     * @param  array<string, scalar>  $query
     * @return ?array<mixed>
     */
    public function one(string $route, array $query = []): ?array
    {
        $response = $this->get($route, $query);

        if (in_array($response->status(), [404, 403, 401], true)) {
            return null;
        }

        $this->refuseFailure($response, $route);

        $body = $response->json();

        return is_array($body) ? $body : null;
    }

    /** @param  array<string, scalar>  $query */
    public function get(string $route, array $query = []): Response
    {
        $auth = str_starts_with(ltrim($route, '/'), 'wc/') ? 'wc' : 'wp';

        return $this->send($this->url($route, $query), $auth);
    }

    /** @param  array<string, scalar>  $query */
    public function url(string $route, array $query = []): string
    {
        $root = $this->root ?? '/wp-json/';
        $route = ltrim($route, '/');

        if ($root === '/?rest_route=/') {
            return $this->siteUrl().'/?'.http_build_query(['rest_route' => '/'.$route] + $query);
        }

        return $this->siteUrl().'/wp-json/'.$route.($query === [] ? '' : '?'.http_build_query($query));
    }

    private function send(string $url, string $auth): Response
    {
        // WooCommerce accepts the application password too (its user needs
        // to be a shop manager or an administrator), so the REST key is
        // optional: used when given, the application password otherwise.
        $basic = match (true) {
            $auth === 'wc' && $this->wcKey && $this->wcSecret => [$this->wcKey, $this->wcSecret],
            $this->wpUser && $this->wpPassword => [$this->wpUser, $this->wpPassword],
            default => null,
        };

        return SafeHttp::get($url, array_filter([
            'basic' => $basic,
            'headers' => ['Accept' => 'application/json'],
            'timeout' => 30,
            'max_bytes' => 20 * 1024 * 1024,
            'allow_private' => $this->allowPrivate,
            'allow_http' => $this->allowPrivate,
        ], fn ($v) => $v !== null));
    }

    /**
     * A failure in words a person can act on. WordPress's own `message` is
     * kept — "Sorry, you are not allowed to list users" says exactly which
     * permission the application password's user lacks.
     */
    private function refuseFailure(Response $response, string $route): void
    {
        if ($response->successful()) {
            return;
        }

        $message = (string) ($response->json('message') ?? '');
        $status = $response->status();

        $reason = match (true) {
            $status === 401 => 'The site refused the credentials',
            $status === 403 => 'The credentials are not allowed to read this',
            default => "The site answered {$status}",
        };

        throw new RuntimeException(sprintf('%s (%s)%s', $reason, $route, $message !== '' ? ': '.strip_tags($message) : '.'));
    }
}
