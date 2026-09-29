<?php

/*
 * Crawling a website for newsletter subscribers (2026-09-27,
 * docs/newsletter.md "Crawling a website"). What a campaign manager chooses
 * per run is on the form; what bounds any run — and how polite it is — is
 * here, where only somebody with the server in front of them can change it.
 */

return [
    /* A crawl of a site on this machine or the office network, for development only. */
    'allow_private_hosts' => env('APP_ENV') === 'local' && (bool) env('CRAWL_ALLOW_PRIVATE', false),

    'max_depth' => 4,
    'max_pages' => 500,
    'max_linked_sites' => 100,
    'max_hunter_domains' => 50,

    /* The least time between two requests to one host. */
    'delay_ms' => (int) env('CRAWL_DELAY_MS', 1000),

    'timeout' => 10,
    'max_bytes' => 2 * 1024 * 1024,

    /* Links taken from any one page, so a sitemap page cannot flood the frontier. */
    'links_per_page' => 200,

    /* Pages opened on each linked business site: its home and up to three contact-like pages. */
    'pages_per_linked_site' => 4,
];
