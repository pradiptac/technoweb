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
