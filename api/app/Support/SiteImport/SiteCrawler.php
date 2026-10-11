<?php

namespace App\Support\SiteImport;

use App\Models\SiteImport;
use App\Support\Net\SafeHttp;
use App\Support\Newsletter\EmailExtractor;
use App\Support\Newsletter\Robots;
use App\Support\WordPress\Harvest;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Response;
use Throwable;

/**
 * Reads a website page by page into the harvest, a slice at a time
 * (`docs/site-import.md`). The newsletter crawler's shape — a frontier, a
 * visited set, robots.txt read once per host and obeyed, a host asked at most
 * every `delay_ms` — but staying on one host and keeping the pages whole.
 *
 * It starts from the start page and `/sitemap.xml` when there is one (a
 * sitemap index is followed one level), follows links on the same site
 * (`www.` or not) to the depth asked for, and never reads more than the page
 * limit. Every request goes through `SafeHttp`. A page that is not HTML, or
 * does not answer 200, is not kept and is named under its reason.
 */
final class SiteCrawler
{
    public const PAUSED = 'paused';

    public const DONE = 'done';

    public const AGENT = 'technoware-importer';

    private const NOT_PAGES = '/\.(jpe?g|png|gif|svg|webp|avif|ico|bmp|tiff?|pdf|zip|rar|7z|gz|tgz|mp[34]|m4[av]|mov|avi|webm|wav|ogg|docx?|xlsx?|pptx?|csv|txt|xml|json|css|js|woff2?|ttf|eot|exe|dmg|apk)$/i';

    private const NOT_WORTH = '#/(wp-admin|wp-login|wp-json|cart|checkout|my-account|login|logout|signin|signup|register|feed|xmlrpc)(/|$|\?)|[?&](add-to-cart|replytocom|share|print)=#i';

    public function run(SiteImport $import, ScanState $state, Harvest $harvest, CarbonImmutable $deadline): string
    {
        $settings = (array) $import->settings;
        $start = $import->site_url;

        if ($state->frontier === [] && $state->visited === [] && $state->pages === 0) {
            $this->queue($state, $start, 0);

            foreach ($this->sitemap($state, $start) as $url) {
                $this->queue($state, $url, 1);
            }
        }

        $worked = false;

        while (($item = array_shift($state->frontier)) !== null) {
            if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                array_unshift($state->frontier, $item);

                return self::PAUSED;
            }

            if ($state->pages >= (int) ($settings['max_pages'] ?? config('site_import.max_pages'))) {
                $state->capped = true;
                $state->frontier = [];

                break;
            }

            $worked = true;
            $state->current = $item['url'];
            $host = strtolower((string) parse_url($item['url'], PHP_URL_HOST));

            if (! $this->robots($state, $item['url'], $host)->allows($item['url'])) {
                $state->skip('robots.txt asks crawlers to stay away from these pages.', Paths::normalise($item['url']));

                continue;
            }

            $response = $this->fetch($state, $item['url'], $host);

            if ($response === null) {
                continue;
            }

            $url = (string) ($response->effectiveUri() ?? $item['url']);
            $html = mb_convert_encoding(self::utf8($response), 'UTF-8', 'UTF-8');

            $harvest->append($import, 'pages', [[
                'url' => $url,
                'path' => Paths::normalise($url),
                'title' => self::title($html),
                'status' => 200,
                'html' => $html,
            ]]);
            $state->pages++;
            StyleSheets::note($state, $html, $url, $start);

            if ($item['depth'] < (int) ($settings['depth'] ?? 3)) {
                $this->follow($state, $item['depth'], EmailExtractor::links($html, $url), $start);
            }
        }

        $state->current = null;

        return self::DONE;
    }

    /** The page, if it answered 200 with HTML; null with a reason noted otherwise. */
    private function fetch(ScanState $state, string $url, string $host): ?Response
    {
        $this->wait($state, $host);
        $state->requests++;

        try {
            $response = SafeHttp::get($url, [
                'allow_http' => true,
                'allow_private' => (bool) config('site_import.allow_private_hosts'),
                'timeout' => (int) config('site_import.timeout', 15),
                'max_bytes' => (int) config('site_import.max_bytes'),
                'headers' => ['Accept' => 'text/html,application/xhtml+xml'],
            ]);
        } catch (Throwable $e) {
            $state->lastFetch[$host] = microtime(true);
            $state->skip('Could not be read: '.mb_substr($e->getMessage(), 0, 120), Paths::normalise($url));

            return null;
        }

        $state->lastFetch[$host] = microtime(true);

        if ($response->status() !== 200) {
            $state->skip("The site answered {$response->status()}.", Paths::normalise($url));

            return null;
        }

        if (! str_contains(strtolower((string) $response->header('Content-Type')), 'html')) {
            $state->skip('Not a web page (not HTML).', Paths::normalise($url));

            return null;
        }

        return $response;
    }

    /**
     * Queue what a page links to on the same site.
     *
     * @param  list<array{url: string, text: string}>  $links
     */
    private function follow(ScanState $state, int $depth, array $links, string $start): void
    {
        foreach (array_slice($links, 0, (int) config('site_import.links_per_page')) as $link) {
            $url = $link['url'];

            if (! Paths::sameSite($url, $start)
                || preg_match(self::NOT_PAGES, (string) parse_url($url, PHP_URL_PATH))
                || preg_match(self::NOT_WORTH, $url)) {
                continue;
            }

            $this->queue($state, $url, $depth + 1);
        }
    }

    private function queue(ScanState $state, string $url, int $depth): void
    {
        $key = sha1(Paths::bare($url).Paths::normalise($url));

        if (isset($state->visited[$key])) {
            return;
        }

        $state->visited[$key] = true;
        $state->frontier[] = ['url' => $url, 'depth' => $depth];
    }

    /**
     * The same-host addresses in `/sitemap.xml` (and the sitemaps an index
     * lists, one level down), or none.
     *
     * @return list<string>
     */
    private function sitemap(ScanState $state, string $start): array
    {
        $found = [];
        $todo = [self::origin($start).'/sitemap.xml'];

        for ($i = 0; $i < count($todo) && $i < 6; $i++) {
            $xml = $this->text($state, $todo[$i]);

            if ($xml === null) {
                continue;
            }

            preg_match_all('#<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)#i', $xml, $m);

            foreach ($m[1] as $loc) {
                $loc = html_entity_decode($loc, ENT_QUOTES);

                if (! Paths::sameSite($loc, $start)) {
                    continue;
                }

                if ($i === 0 && preg_match('/\.xml(\.gz)?$/i', $loc)) {
                    $todo[] = $loc;
                } elseif (! preg_match(self::NOT_PAGES, (string) parse_url($loc, PHP_URL_PATH))) {
                    $found[] = $loc;
                }
            }
        }

        return array_slice(array_values(array_unique($found)), 0, (int) config('site_import.max_pages'));
    }

    private function text(ScanState $state, string $url): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $this->wait($state, $host);

        try {
            $response = SafeHttp::get($url, [
                'allow_http' => true,
                'allow_private' => (bool) config('site_import.allow_private_hosts'),
                'timeout' => 10,
                'max_bytes' => 5 * 1024 * 1024,
            ]);
        } catch (Throwable) {
            return null;
        } finally {
            $state->lastFetch[$host] = microtime(true);
        }

        return $response->status() === 200 ? $response->body() : null;
    }

    /** The host's rules: read once, remembered for the run. */
    private function robots(ScanState $state, string $url, string $host): Robots
    {
        if (isset($state->robots[$host])) {
            return Robots::fromRules($state->robots[$host]);
        }

        $this->wait($state, $host);
        $robots = Robots::allowAll();

        try {
            $response = SafeHttp::get(self::origin($url).'/robots.txt', [
                'allow_http' => true,
                'allow_private' => (bool) config('site_import.allow_private_hosts'),
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

    private function wait(ScanState $state, string $host): void
    {
        $delay = max(0, (int) config('site_import.delay_ms', 500)) / 1000;
        $since = microtime(true) - ($state->lastFetch[$host] ?? 0);

        if ($delay > 0 && $since < $delay) {
            usleep((int) (($delay - $since) * 1_000_000));
        }
    }

    public static function origin(string $url): string
    {
        $p = parse_url($url);

        return strtolower(($p['scheme'] ?? 'https').'://'.($p['host'] ?? '')).(isset($p['port']) ? ':'.$p['port'] : '');
    }

    /** The body as UTF-8, by the header's charset or the page's `<meta charset>`. */
    private static function utf8(Response $response): string
    {
        $body = $response->body();
        $charset = null;

        if (preg_match('/charset=([\w-]+)/i', (string) $response->header('Content-Type'), $m)
            || preg_match('/<meta[^>]+charset=["\']?([\w-]+)/i', substr($body, 0, 4096), $m)) {
            $charset = strtoupper($m[1]);
        }

        if ($charset !== null && $charset !== 'UTF-8' && in_array($charset, array_map('strtoupper', mb_list_encodings()), true)) {
            return mb_convert_encoding($body, 'UTF-8', $charset);
        }

        return $body;
    }

    public static function title(string $html): string
    {
        return preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)
            ? trim((string) preg_replace('/\s+/', ' ', html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8')))
            : '';
    }
}
