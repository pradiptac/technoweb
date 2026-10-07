<?php

namespace App\Support;

/**
 * First URL segments a custom content type may not take.
 *
 * A type's slug is the top-level segment its archive and entries live under
 * (`/events`, `/events/launch`), which is the same segment every route the
 * site already has lives under. Next resolves a static segment before the
 * `[slug]` catch-all, so a type called `blog` would not break the blog — it
 * would be a type whose every page is silently unreachable, which is worse.
 *
 * Three lists in one, kept here so a single rule refuses them all:
 *
 * - every top-level route under `web/src/app/(marketing)` and `web/src/app`,
 *   including the files Next serves at the root — `ReservedSlugsTest` reads
 *   the frontend's app directory and fails when a route is missing here, so
 *   the commit that adds `/partners` to the site is the one that has to add
 *   it to this list too;
 * - the API's public prefixes, which do not collide with a page today and
 *   are reserved so a future frontend route mirroring one cannot;
 * - a few words that mean something to a server rather than to the site.
 *
 * A CMS page's slug is refused as well, by the request rather than here —
 * those are rows, not code.
 */
final class ReservedSlugs
{
    /** Top-level routes of the Next application. */
    private const FRONTEND = [
        // (marketing)
        'about', 'blog', 'brands', 'careers', 'cart', 'case-studies', 'certifications',
        'checkout', 'clients', 'contact', 'industries', 'knowledge-base', 'locations',
        'newsletter', 'order', 'products', 'resources', 'search', 'services', 'solutions',
        'store', 'support', 'team', 'book-a-visit', 'visit', 'book-a-meeting', 'meeting', 'ticket-survey', 'offline', 'pwa-icon', 'sw.js', 'manifest.webmanifest', 'coming-soon',
        // The events module's own pages (0.118.0, docs/events.md). Until
        // then `events` was the example a custom content type was given.
        'events',
        // The application root.
        'admin', 'api', 'embed', 'portal', 'push', 'theme-preview', 'indexnow',
        'favicon.ico', 'sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt',
        'google-shopping-feed.xml', 'meta-catalogue.xml', 'meta-catalogue.csv', 'opengraph-image',
    ];

    /** The API's public prefixes (`routes/api/public.php`). */
    private const API = [
        'types', 'content-types', 'product-categories', 'pages', 'popups', 'sliders',
        'blocks', 'galleries', 'forms', 'menus', 'settings', 'redirects', 'landing-pages',
        'enquiries', 'chat', 'auth', 'companies', 'client-errors', 'messaging', 'tickets',
        'ticket-attachments', 'ticket-categories', 'orders', 'payments', 'wishlist', 'my', 'visits',
    ];

    /** Words a server, a crawler or the framework already means something by. */
    private const OTHER = [
        '_next', 'static', 'public', 'storage', 'assets', 'images', 'media', 'feed',
        'rss', 'well-known', 'login', 'logout', 'register', 'account', 'home', 'index',
        'preview', 'entries', 'content', 'custom-content',
    ];

    /** @return array<int, string> */
    public static function all(): array
    {
        return array_values(array_unique(array_merge(self::FRONTEND, self::API, self::OTHER)));
    }

    /** @return array<int, string> */
    public static function frontend(): array
    {
        return self::FRONTEND;
    }

    public static function reserved(string $slug): bool
    {
        return in_array(strtolower($slug), self::all(), true);
    }

    /** One of the Next application's own top-level routes. */
    public static function isFrontendRoute(string $slug): bool
    {
        return in_array(strtolower($slug), self::FRONTEND, true);
    }

    /**
     * A validation rule for a **CMS page's** slug: not one of the site's own
     * routes.
     *
     * A page lives at `/{slug}`, the same segment every route of the site
     * lives at, and Next resolves a static segment before the catch-all — so
     * a page saved at `/events` is not a broken page, it is one nobody can
     * ever open, with nothing saying so. The page forms had no such check
     * until the events module made the commonest example of it real.
     *
     * Only the frontend's routes, not the whole list: the API prefixes and
     * the server words are reserved so a *content type* cannot take them,
     * and a page at `/media` or `/account` is one this install may already
     * have. And only when the slug is **changing** — `$current` is the
     * stored slug on an edit — so a page that already sits on one of these
     * can still be saved while somebody decides what to call it.
     */
    public static function pageSlugRule(?string $current = null): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) use ($current): void {
            if (is_string($value) && strcasecmp($value, (string) $current) !== 0 && self::isFrontendRoute($value)) {
                $fail("/{$value} is one of the site's own pages, so a page cannot take that address. Choose another slug.");
            }
        };
    }
}
