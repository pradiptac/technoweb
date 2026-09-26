<?php

return [
    /*
     * Whether the importer may read a site on a private address.
     *
     * Only for development: a WordPress under Laragon on this machine is the
     * one real source the importer can be tested against, and it lives on
     * 127.0.0.1. Everywhere else a private host is refused (`SafeHttp`),
     * because the scan is the API reading an address an administrator typed.
     * It also permits plain http, since a local site rarely has a
     * certificate. Ignored unless APP_ENV is local.
     */
    'allow_private_hosts' => env('APP_ENV') === 'local' && (bool) env('WORDPRESS_IMPORT_ALLOW_PRIVATE', false),

    /** The largest single file the media step will download, in bytes. */
    'max_media_bytes' => 50 * 1024 * 1024,

    /** How long a scanned, unreviewed import is kept before its harvest is deleted. */
    'ready_days' => 3,
];
