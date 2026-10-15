<?php

namespace App\Support;

use App\Models\Media;
use App\Models\Setting;
use App\Support\Net\PublicHost;

/**
 * The public address of a file on the media disk (0.124.0, docs/cdn.md).
 *
 * Every public response used to build this with `asset('storage/'.$path)`,
 * and with nothing configured and a file nobody has edited that is still
 * exactly what this returns. It exists for the two things that one-liner
 * could not do:
 *
 * **A version when the bytes have changed.** An in-place edit keeps the
 * path, and the path is cached for a year — by the browser, by the image
 * optimiser (`minimumCacheTTL`) and by a CDN in front of either — so an
 * edited picture went on being served as it was. `media.revision` counts
 * the edits and rides on the URL as `?v=N`; zero adds nothing. A caller that
 * has a better version of its own (a brand's `updated_at`, which also moves
 * when the logo is *swapped for another file*) passes it.
 *
 * **The media CDN, for the files a browser fetches itself.** With
 * `media_cdn_enabled` on and `media_cdn_url` set, a video, a document or a
 * vector is addressed at the CDN, whose pull zone mirrors this server's
 * `/storage`. A raster is not: every public photograph is fetched by the
 * website's image optimiser, server to server, and routing that through a
 * CDN buys a detour — the optimised copy is what a visitor downloads, and
 * that is served from the website's own domain.
 */
final class MediaUrl
{
    /**
     * Fetched and re-encoded by the website's optimiser, so never sent to
     * the media CDN. Everything else — svg, mp4, webm, pdf, zip, docx… — is.
     */
    private const OPTIMISED = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];

    public static function for(?string $path, ?int $version = null): string
    {
        $path = (string) $path;
        $cdn = self::direct($path) ? self::cdn() : null;

        $url = $cdn !== null ? $cdn.'/storage/'.ltrim($path, '/') : asset('storage/'.$path);
        $version ??= MediaMeta::revision($path);

        return $version ? $url.'?v='.$version : $url;
    }

    /** Whether a browser fetches this file itself, rather than through the optimiser. */
    public static function direct(string $path): bool
    {
        return ! in_array(strtolower(pathinfo($path, PATHINFO_EXTENSION)), self::OPTIMISED, true);
    }

    /**
     * The CDN's origin while it is switched on, or null. Checked for shape
     * again on the way out: a row edited in the database directly must not
     * be able to put `javascript:` or a path in front of every download.
     */
    public static function cdn(): ?string
    {
        if (! Setting::get('media_cdn_enabled', false)) {
            return null;
        }

        return self::clean((string) Setting::get('media_cdn_url', ''));
    }

    /** `https://cdn.example.com`, or null when the value is not an https origin. */
    public static function clean(string $value): ?string
    {
        $value = rtrim(trim($value), '/');
        $parts = parse_url($value);

        if ($value === '' || ! is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) {
            return null;
        }

        // An origin and nothing else: a pull zone mirrors this server from
        // its root, so a path, a query or credentials can only be a mistake.
        if (isset($parts['path']) || isset($parts['query']) || isset($parts['fragment']) || isset($parts['user'])) {
            return null;
        }

        return 'https://'.strtolower($parts['host']).(isset($parts['port']) ? ':'.$parts['port'] : '');
    }

    /**
     * Why an address cannot be used, as a sentence for the settings form, or
     * null when it can. Shape first, then that the host is a public one —
     * `PublicHost`, the rule a webhook's and a backup's host is held to.
     */
    public static function refusalFor(string $value): ?string
    {
        $clean = self::clean($value);

        if ($clean === null) {
            return 'Enter the CDN’s address as https://cdn.example.com — https, and nothing after the name.';
        }

        $host = (string) parse_url($clean, PHP_URL_HOST);

        // A bare name or a private suffix first, by its spelling: a name that
        // does not resolve from here is let through by `PublicHost` (a CDN
        // subdomain created a minute ago may not have reached this server's
        // resolver), and `localhost` must not ride in on that.
        if (! str_contains($host, '.') || preg_match('/\.(local|localhost|internal|lan|home\.arpa)$/', $host) === 1
            || PublicHost::refusal($host) !== null) {
            return 'That address is not a public host name.';
        }

        if ($host === parse_url((string) config('app.url'), PHP_URL_HOST)) {
            return 'That is this server’s own address. Enter the address the CDN gave you.';
        }

        return null;
    }

    /** A library file to prove the CDN with: the newest one a browser would fetch from it, else any. */
    public static function sample(): ?Media
    {
        $files = Media::query()->latest('id')->limit(200)->get();

        return $files->first(fn (Media $m) => self::direct($m->path)) ?? $files->first();
    }
}
