<?php

/*
 * Importing a website that has no API — a live URL read page by page, or an
 * uploaded ZIP of its files (docs/site-import.md). What a person chooses per
 * import is on the form; what bounds any run, and how polite it is, is here.
 */

return [
    /*
     * Whether the crawler may read a site on a private address.
     *
     * Only for development, where a static site served from this machine
     * (`python -m http.server`) is the one real source to test against. It
     * also permits plain http. Ignored unless APP_ENV is local; everywhere
     * else a private host is refused (`SafeHttp`).
     */
    'allow_private_hosts' => env('APP_ENV') === 'local' && (bool) env('SITE_IMPORT_ALLOW_PRIVATE', false),

    'max_depth' => 6,
    'max_pages' => 1000,

    /* The least time between two requests to one host. */
    'delay_ms' => (int) env('SITE_IMPORT_DELAY_MS', 500),

    'timeout' => 15,

    /* The largest page read, in bytes. */
    'max_bytes' => 2 * 1024 * 1024,

    /* Links taken from any one page, so a sitemap page cannot flood the frontier. */
    'links_per_page' => 300,

    /* The largest single file the media step will download, in bytes. */
    'max_media_bytes' => 50 * 1024 * 1024,

    /* How long a scanned, unreviewed import is kept before its harvest is deleted. */
    'ready_days' => 3,

    /* An uploaded ZIP: how big it may be, how many files and how much unpacked. */
    'zip' => [
        'max_bytes' => 200 * 1024 * 1024,
        'max_files' => 5000,
        'max_unpacked_bytes' => 500 * 1024 * 1024,
        'extensions' => ['html', 'htm', 'css', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'pdf', 'woff2'],
    ],
];
