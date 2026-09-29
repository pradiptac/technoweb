<?php

namespace App\Support\Newsletter;

use App\Support\Net\SafeHttp;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Response;
use Throwable;

/**
 * Walks a website for addresses, a slice at a time (2026-09-27,
 * docs/newsletter.md "Crawling a website").
 *
 * **The start site**, level by level from the start page to the depth asked
 * for, following links on the same site only (`www.` or not), and never more
 * than the page limit. **Directory mode** adds the businesses a directory
 * links to: each linked site's home page and up to three pages that look like
 * its contact, about or team page — where a business puts its own address.
 * **Hunter**, last and only if asked, looks the domains up that were found,
 * most-mentioned first, within both the run's limit and the plan's remaining
 * searches.
 *
 * **Polite by construction.** Every request goes through `SafeHttp` — public
 * hosts only, the connection pinned to the checked address, every redirect
 * re-checked — `robots.txt` is read once per host and obeyed, a host is asked
 * at most once a second, a page is read to 2 MB and nothing but HTML is read
 * at all. Links to social networks, stores and search engines are never
 * followed: they are not businesses, and they would not welcome it.
 */
final class WebsiteCrawler
{
    public const PAUSED = 'paused';

    public const DONE = 'done';

    public const AGENT = 'technoware-importer';

    /** Hosts a directory links to that are platforms, not businesses. */
    private const PLATFORMS = [
        'facebook.com', 'fb.com', 'twitter.com', 'x.com', 'linkedin.com', 'instagram.com', 'youtube.com', 'youtu.be',
        'google.com', 'google.co.in', 'goo.gl', 'g.page', 'wa.me', 'whatsapp.com', 't.me', 'telegram.me', 'pinterest.com',
        'wikipedia.org', 'apple.com', 'microsoft.com', 'bit.ly', 'tiktok.com', 'github.com', 'wordpress.org', 'wordpress.com',
        'w3.org', 'schema.org', 'cloudflare.com', 'gstatic.com', 'googleapis.com', 'amazon.com', 'amazon.in', 'flipkart.com',
        'justdial.com', 'indiamart.com', 'maps.app.goo.gl', 'play.google.com', 'apps.apple.com', 'vimeo.com', 'medium.com',
    ];

    private const NOT_PAGES = '/\.(jpe?g|png|gif|svg|webp|avif|ico|bmp|tiff?|pdf|zip|rar|7z|gz|tgz|mp[34]|m4[av]|mov|avi|webm|wav|ogg|docx?|xlsx?|pptx?|csv|txt|xml|json|css|js|woff2?|ttf|eot|exe|dmg|apk)$/i';

    private const NOT_WORTH = '#/(wp-admin|wp-login|wp-json|cart|checkout|my-account|login|logout|signin|signup|register|feed|xmlrpc)(/|$|\?)|[?&](add-to-cart|replytocom|share|print)=#i';

    private const CONTACTISH = '/contact|about|team|people|staff|reach|get-in-touch|enquir|inquir|office|locat|who-we-are|leadership|management/i';

    /**
     * @param  array<string, mixed>  $settings  the run's `progress` as the controller wrote it
     * @param  list<string>  $ownDomains  never collected, never looked up
     */
    public function run(CrawlState $state, array $settings, array $ownDomains, CarbonImmutable $deadline): string
    {
        $start = (string) $settings['start_url'];
        $startHost = self::bare((string) parse_url($start, PHP_URL_HOST));

        if ($state->frontier === [] && $state->visited === [] && $state->phase === 'crawl') {
            $state->frontier[] = ['url' => $start, 'depth' => 0, 'kind' => 'start', 'site' => null];
            $state->visited[sha1($start)] = true;
        }

        $worked = false;

        while ($state->phase === 'crawl') {
            if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                return self::PAUSED;
            }

            $item = array_shift($state->frontier);

            if ($item === null) {
                $state->phase = (int) ($settings['hunter_domains'] ?? 0) > 0 && HunterClient::configured() ? 'hunter' : 'done';
                $state->current = null;

                break;
            }

            if ($item['kind'] === 'start' && $state->pages >= (int) $settings['max_pages']) {
                $state->capped = true;

                continue;
            }

            if ($item['kind'] === 'linked' && ($state->sites[$item['site']] ?? 0) >= (int) config('crawl.pages_per_linked_site', 4)) {
                continue;
            }

            $worked = true;
            $state->current = $item['url'];

            // A page robots.txt refuses is never asked for, so it spends none of the page limit.
            $host = strtolower((string) parse_url($item['url'], PHP_URL_HOST));

            if (! $this->robots($state, $item['url'], $host)->allows($item['url'])) {
                $state->refused++;

                continue;
            }

            $response = $this->fetch($state, $item['url'], $settings);

            if ($item['kind'] === 'start') {
                $state->pages++;
            } else {
                $state->linkedPages++;
                $state->sites[$item['site']] = ($state->sites[$item['site']] ?? 0) + 1;
            }

            if ($response === null) {
                continue;
            }

            $url = (string) ($response->effectiveUri() ?? $item['url']);
            $html = $response->body();
            $page = EmailExtractor::extract($html, $url);
            $linkedOrigin = $item['kind'] === 'linked' ? self::origin($url) : null;

            foreach ($page['emails'] as $email => $info) {
                $domain = AddressKinds::domain($email);

                if (in_array($domain, $ownDomains, true)) {
                    continue;
                }

                $website = $linkedOrigin ?? (AddressKinds::isFreemail($domain) ? null : 'https://'.$domain);
                $state->add($email, $info['name'], $info['company'], $website, $url);
            }

            $this->follow($state, $item, EmailExtractor::links($html, $url), $settings, $startHost);
        }

        if ($state->phase === 'hunter') {
            $done = $this->hunt($state, (int) $settings['hunter_domains'], $ownDomains, $startHost, $deadline);

            if (! $done) {
                return self::PAUSED;
            }

            $state->phase = 'done';
        }

        return self::DONE;
    }

    /**
     * The page, if it is HTML; null otherwise, with a failure noted. Waits
     * out the host's second first. robots.txt has been asked by the caller.
     */
    private function fetch(CrawlState $state, string $url, array $settings): ?Response
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $this->wait($state, $host);

        try {
            $response = SafeHttp::get($url, [
                'allow_http' => true,
                'allow_private' => (bool) config('crawl.allow_private_hosts'),
                'timeout' => (int) config('crawl.timeout', 10),
                'max_bytes' => (int) config('crawl.max_bytes', 2 * 1024 * 1024),
                'headers' => ['Accept' => 'text/html,application/xhtml+xml'],
            ]);
        } catch (Throwable $e) {
            $state->refused++;
            $state->lastFetch[$host] = microtime(true);

            if (count($state->notes) < 50) {
                $state->notes[] = mb_substr($url.' — '.$e->getMessage(), 0, 300);
            }

            return null;
        }

        $state->lastFetch[$host] = microtime(true);

        if ($response->status() !== 200 || ! str_contains(strtolower((string) $response->header('Content-Type')), 'html')) {
            return null;
        }

        return $response;
    }

    /** The host's rules: read once, remembered for the run. */
    private function robots(CrawlState $state, string $url, string $host): Robots
    {
        if (isset($state->robots[$host])) {
            return Robots::fromRules($state->robots[$host]);
        }

        $this->wait($state, $host);
        $robots = Robots::allowAll();

        try {
            $response = SafeHttp::get(self::origin($url).'/robots.txt', [
                'allow_http' => true,
                'allow_private' => (bool) config('crawl.allow_private_hosts'),
                'timeout' => 5,
                'max_bytes' => 256 * 1024,
            ]);

            $robots = match (true) {
                $response->status() === 200 => Robots::parse($response->body(), self::AGENT),
                in_array($response->status(), [401, 403], true) => Robots::denyAll(),
                default => Robots::allowAll(),
            };
        } catch (Throwable) {
            // A robots.txt nobody can read says nothing; the page request will say more.
        }

        $state->lastFetch[$host] = microtime(true);
        $state->robots[$host] = $robots->rules();

        return $robots;
    }

    private function wait(CrawlState $state, string $host): void
    {
        $delay = max(0, (int) config('crawl.delay_ms', 1000)) / 1000;
        $since = microtime(true) - ($state->lastFetch[$host] ?? 0);

        if ($since < $delay) {
            usleep((int) (($delay - $since) * 1_000_000));
        }
    }

    /**
     * Queue what this page links to: deeper on the start site, the linked
     * businesses from a directory, and a linked site's contact pages.
     *
     * @param  array{url: string, depth: int, kind: string, site: ?string}  $item
     * @param  list<array{url: string, text: string}>  $links
     */
    private function follow(CrawlState $state, array $item, array $links, array $settings, string $startHost): void
    {
        $links = array_slice($links, 0, (int) config('crawl.links_per_page', 200));
        $contactPages = 0;

        foreach ($links as $link) {
            $url = $link['url'];
            $host = self::bare((string) parse_url($url, PHP_URL_HOST));

            if (preg_match(self::NOT_PAGES, (string) parse_url($url, PHP_URL_PATH)) || preg_match(self::NOT_WORTH, $url)) {
                continue;
            }

            if ($item['kind'] === 'start') {
                if ($host === $startHost) {
                    if ($item['depth'] < (int) $settings['depth'] && count($state->frontier) + $state->pages < (int) $settings['max_pages'] * 2) {
                        $this->queue($state, $url, $item['depth'] + 1, 'start', null);
                    }

                    continue;
                }

                if (($settings['visit_linked_sites'] ?? false) && ! isset($state->sites[$host]) && ! self::platform($host)
                    && count($state->sites) < (int) $settings['linked_sites_max']) {
                    $state->sites[$host] = 0;
                    $this->queue($state, self::origin($url).'/', 0, 'linked', $host);
                }

                continue;
            }

            // A linked site: its own contact-like pages, from its home page only.
            if ($item['depth'] === 0 && $host === $item['site'] && $contactPages < 3
                && preg_match(self::CONTACTISH, ((string) parse_url($url, PHP_URL_PATH)).' '.$link['text'])) {
                if ($this->queue($state, $url, 1, 'linked', $item['site'])) {
                    $contactPages++;
                }
            }
        }
    }

    private function queue(CrawlState $state, string $url, int $depth, string $kind, ?string $site): bool
    {
        $key = sha1($url);

        if (isset($state->visited[$key])) {
            return false;
        }

        $state->visited[$key] = true;
        $state->frontier[] = ['url' => $url, 'depth' => $depth, 'kind' => $kind, 'site' => $site];

        return true;
    }

    /**
     * Hunter's domain search over the domains the crawl met, most-mentioned
     * first. True when finished — the limit reached, the allowance spent, or
     * nothing left to ask.
     *
     * @param  list<string>  $ownDomains
     */
    private function hunt(CrawlState $state, int $limit, array $ownDomains, string $startHost, CarbonImmutable $deadline): bool
    {
        $client = new HunterClient;

        if ($state->hunterLeft === null) {
            try {
                $state->hunterLeft = $client->account()['searches_available'];
            } catch (Throwable $e) {
                $state->notes[] = 'Hunter was not asked: '.mb_substr($e->getMessage(), 0, 200);

                return true;
            }
        }

        $counts = [];

        foreach ($state->found as $email => $info) {
            $domain = AddressKinds::domain((string) $email);
            $counts[$domain] = ($counts[$domain] ?? 0) + $info['count'];
        }

        foreach (array_keys($state->sites) as $host) {
            $counts[$host] = ($counts[$host] ?? 0) + 1;
        }

        $counts[$startHost] = ($counts[$startHost] ?? 0) + 1;
        arsort($counts);

        $worked = false;

        foreach (array_keys($counts) as $domain) {
            $domain = (string) $domain;

            if (count($state->hunted) >= $limit || $state->hunterLeft <= 0) {
                if ($state->hunterLeft <= 0) {
                    $state->notes[] = 'Hunter has no domain searches left this month.';
                }

                return true;
            }

            if (in_array($domain, $state->hunted, true) || in_array($domain, $ownDomains, true) || AddressKinds::isFreemail($domain) || self::platform($domain) || ! str_contains($domain, '.')) {
                continue;
            }

            if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                return false;
            }

            $worked = true;
            $state->current = 'Hunter: '.$domain;

            try {
                $result = $client->domainSearch($domain);
            } catch (Throwable $e) {
                $state->notes[] = "Hunter did not answer for {$domain}: ".mb_substr($e->getMessage(), 0, 200);

                return true;
            }

            $state->hunted[] = $domain;
            $state->hunterLeft--;

            foreach ($result['emails'] as $row) {
                if (EmailExtractor::acceptable($row['email']) && ! in_array(AddressKinds::domain($row['email']), $ownDomains, true)) {
                    $name = trim(($row['first_name'] ?? '').' '.($row['last_name'] ?? ''));
                    $state->add($row['email'], $name !== '' ? $name : null, $result['organization'], 'https://'.$domain, 'Hunter: '.$domain);
                }
            }
        }

        return true;
    }

    public static function bare(string $host): string
    {
        $host = strtolower(trim($host, '.'));

        return str_starts_with($host, 'www.') ? substr($host, 4) : $host;
    }

    public static function origin(string $url): string
    {
        $p = parse_url($url);

        return strtolower(($p['scheme'] ?? 'https').'://'.($p['host'] ?? '')).(isset($p['port']) ? ':'.$p['port'] : '');
    }

    private static function platform(string $host): bool
    {
        foreach (self::PLATFORMS as $platform) {
            if ($host === $platform || str_ends_with($host, '.'.$platform)) {
                return true;
            }
        }

        return false;
    }
}
