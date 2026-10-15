<?php

namespace App\Support\SiteImport;

use App\Models\SiteImport;
use App\Support\Net\SafeHttp;
use App\Support\Newsletter\EmailExtractor;
use App\Support\WordPress\Harvest;
use Carbon\CarbonImmutable;
use Throwable;

/**
 * The site's own stylesheets, kept for `Brand` (0.164.0).
 *
 * The crawler notes every `<link rel="stylesheet">` on the site's host as it
 * reads a page (`note()`); once the pages are read, this fetches them — a few,
 * politely, through `SafeHttp` — into the harvest's `assets` collection
 * (`{url, css}`), a slice at a time like everything else. A stylesheet on
 * another host (a font service, a CDN's framework) says nothing about this
 * site's brand and is not read. An uploaded ZIP's stylesheets are added by
 * `ZipSource` as it unpacks.
 */
final class StyleSheets
{
    public const PAUSED = 'paused';

    public const DONE = 'done';

    /** The largest stylesheet read, in bytes. */
    private const MAX_BYTES = 1_500_000;

    /** Remember the same-site stylesheets a page links to. */
    public static function note(ScanState $state, string $html, string $pageUrl, string $siteUrl): void
    {
        if (! preg_match_all('/<link\b[^>]*>/i', $html, $links)) {
            return;
        }

        foreach ($links[0] as $tag) {
            if (! preg_match('/\brel=["\']?[^"\'>]*stylesheet/i', $tag) || ! preg_match('/\bhref=["\']([^"\']+)["\']/i', $tag, $m)) {
                continue;
            }

            $url = EmailExtractor::resolve($pageUrl, html_entity_decode($m[1], ENT_QUOTES));

            if ($url !== null && Paths::sameSite($url, $siteUrl) && ! in_array($url, $state->css, true) && count($state->css) < (int) config('site_import.max_stylesheets', 12)) {
                $state->css[] = $url;
            }
        }
    }

    public function run(SiteImport $import, ScanState $state, Harvest $harvest, CarbonImmutable $deadline): string
    {
        while (isset($state->css[$state->cssNext])) {
            if ($state->cssNext > 0 && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                return self::PAUSED;
            }

            $url = $state->css[$state->cssNext++];
            $state->current = $url;
            $css = $this->fetch($url);

            if ($css !== null) {
                $harvest->append($import, 'assets', [['url' => $url, 'css' => $css]]);
            }
        }

        $state->current = null;

        return self::DONE;
    }

    private function fetch(string $url): ?string
    {
        $delay = max(0, (int) config('site_import.delay_ms', 500));

        if ($delay > 0) {
            usleep($delay * 1000);
        }

        try {
            $response = SafeHttp::get($url, [
                'allow_http' => true,
                'allow_private' => (bool) config('site_import.allow_private_hosts'),
                'timeout' => 10,
                'max_bytes' => self::MAX_BYTES,
                'headers' => ['Accept' => 'text/css,*/*;q=0.1'],
            ]);
        } catch (Throwable) {
            return null;
        }

        return $response->status() === 200 ? mb_convert_encoding($response->body(), 'UTF-8', 'UTF-8') : null;
    }
}
