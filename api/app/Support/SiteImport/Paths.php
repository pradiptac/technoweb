<?php

namespace App\Support\SiteImport;

use Illuminate\Support\Str;

/**
 * An old site's addresses as comparable keys: `/about/`, `/about.html` and
 * `/about/index.html` are one path, `/about`; the home page is `/`. Case is
 * folded, the query and fragment dropped — a static site's page is its path.
 */
final class Paths
{
    /** The origin an uploaded ZIP's pages pretend to live at; nothing ever requests it. */
    public const ZIP_ORIGIN = 'https://zip.import';

    public static function normalise(string $urlOrPath): string
    {
        $path = '/'.ltrim(rawurldecode((string) parse_url($urlOrPath, PHP_URL_PATH)), '/');
        $path = strtolower(str_replace('\\', '/', $path));
        $path = (string) preg_replace('#/{2,}#', '/', $path);
        $path = (string) preg_replace('#/index\.(?:html?|php|aspx?)$#', '', $path);
        $path = (string) preg_replace('#\.(?:html?|php|aspx?)$#', '', $path);
        $path = trim($path, '/');

        return $path === '' ? '/' : '/'.$path;
    }

    /** The slug a page at this path gets here: `/services/web-design` → `services-web-design`. */
    public static function slug(string $path): string
    {
        if ($path === '/') {
            return 'home-page';
        }

        $slug = Str::slug(str_replace('/', ' ', trim($path, '/')));

        return $slug !== '' ? Str::limit($slug, 150, '') : 'imported';
    }

    /** The registrable-ish host, lower-cased, without `www.`. */
    public static function bare(string $url): string
    {
        $host = strtolower((string) (str_contains($url, '/') || str_contains($url, ':') ? parse_url($url, PHP_URL_HOST) : $url));

        return str_starts_with($host, 'www.') ? substr($host, 4) : $host;
    }

    public static function sameSite(string $url, string $siteUrl): bool
    {
        $host = self::bare($url);

        return $host !== '' && $host === self::bare($siteUrl);
    }
}
