<?php

namespace App\Support\Health;

use App\Http\Controllers\Api\V1\Admin\SeoController;
use App\Models\Redirect;
use App\Support\SiteSection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

/**
 * What an href points at, and — for a path on this site — whether anything
 * is there, cheapest answer first (docs/health.md "How an internal link is
 * judged"): a published record's own address, an index page, an active
 * redirect, a file under /storage/; anything else is `ask`, which the link
 * checker answers by asking the website.
 */
final class LinkTarget
{
    private const CACHE_KEY = 'health:published-paths';

    /** @return array{kind: 'internal'|'external'|'anchor', value: string}|null */
    public static function classify(string $href): ?array
    {
        $href = trim($href);

        if ($href === '' || $href === '#' || preg_match('/^(mailto|tel|javascript|data):/i', $href)) {
            return null;
        }

        if (str_starts_with($href, '#')) {
            return ['kind' => 'anchor', 'value' => substr($href, 1)];
        }

        if (str_starts_with($href, '//')) {
            $href = 'https:'.$href;
        }

        if (preg_match('#^https?://#i', $href)) {
            $host = strtolower((string) parse_url($href, PHP_URL_HOST));

            if (self::bare($host) !== self::bare(strtolower((string) parse_url((string) config('app.frontend_url'), PHP_URL_HOST)))) {
                return ['kind' => 'external', 'value' => $href];
            }

            $href = (string) (parse_url($href, PHP_URL_PATH) ?: '/');
        }

        if (! str_starts_with($href, '/')) {
            return null;
        }

        $path = (string) strtok($href, '?#');

        return ['kind' => 'internal', 'value' => rtrim($path, '/') ?: '/'];
    }

    /** @return array{state: 'ok'|'dead'|'redirect'|'ask', to?: string} */
    public static function judge(string $path): array
    {
        if (isset(self::paths()[$path])) {
            return ['state' => 'ok'];
        }

        foreach (SiteSection::keys() as $key) {
            if ((rtrim((string) SiteSection::path($key), '/') ?: '/') === $path) {
                return ['state' => 'ok'];
            }
        }

        $to = Redirect::query()->where('is_active', true)->where('from_path', $path)->value('to_path');
        if ($to !== null) {
            return ['state' => 'redirect', 'to' => (string) $to];
        }

        if (str_starts_with($path, '/storage/')) {
            $file = rawurldecode(substr($path, strlen('/storage/')));

            // An editor-typed `..` would make the disk throw and abort the record's whole check.
            try {
                return ['state' => ! str_contains($file, '..') && Storage::disk('public')->fileExists($file) ? 'ok' : 'dead'];
            } catch (\Throwable) {
                return ['state' => 'dead'];
            }
        }

        return ['state' => 'ask'];
    }

    public static function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /** @return array<string, true> */
    private static function paths(): array
    {
        // shortcut: the whole set is rebuilt after any save of a checked kind; fine to a few thousand records, a per-kind index past that.
        return Cache::remember(self::CACHE_KEY, 600, fn () => SeoController::publishedPaths());
    }

    private static function bare(string $host): string
    {
        return str_starts_with($host, 'www.') ? substr($host, 4) : $host;
    }
}
