<?php

return [
    'name' => env('APP_NAME', 'Technoware'),
    'env' => env('APP_ENV', 'production'),
    'debug' => (bool) env('APP_DEBUG', false),
    'url' => env('APP_URL', 'http://localhost'),

    /*
     * Public site origin. Used to build canonical URLs and Open Graph tags on
     * the API side, so generated SEO points at the Next.js host rather than
     * at api.technoware.in.
     */
    'frontend_url' => env('FRONTEND_URL', 'https://www.technoware.in'),

    /*
     * Where this server reaches the website to ask how it is
     * (`SystemController`, the updater's health check). Blank means the
     * public address, which is right whenever the server can reach itself by
     * its own name; the setup wizard sets it otherwise.
     */
    'web_internal_url' => env('WEB_INTERNAL_URL'),

    /*
     * The shared secret the API sends the website to have it throw away its
     * cached pages (`/api/internal/revalidate`), after an install or an
     * update. Written into both config/api.env and config/web.env by the
     * setup wizard; blank on a development checkout.
     */
    'internal_token' => env('INTERNAL_TOKEN'),

    'timezone' => env('APP_TIMEZONE', 'Asia/Kolkata'),
    'locale' => env('APP_LOCALE', 'en'),
    'fallback_locale' => env('APP_FALLBACK_LOCALE', 'en'),
    'faker_locale' => env('APP_FAKER_LOCALE', 'en_IN'),

    'key' => env('APP_KEY'),
    'cipher' => 'AES-256-CBC',

    'maintenance' => [
        'driver' => env('APP_MAINTENANCE_DRIVER', 'file'),
        'store' => env('APP_MAINTENANCE_STORE', 'database'),
    ],
];
