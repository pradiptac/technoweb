<?php

/*
 * The addresses allowed to tell this API who the client is.
 *
 * Read by the framework's TrustProxies middleware, which believes
 * `X-Forwarded-For` (and only that header — bootstrap/app.php) from these
 * addresses and from nobody else. It has to name the address the **Next
 * server** connects from: loopback when both run on one machine, which is the
 * default and the Plesk layout; the Next host's own address otherwise.
 *
 * Get it wrong in one direction and every visitor shares the Next server's
 * address again — one rate-limit bucket for the whole site, and five wrong
 * passwords lock an account for everybody. In the other direction (`*`, or a
 * range the public can connect from) anybody can pick the address they are
 * counted under. Comma-separated; CIDR ranges are accepted.
 *
 * A config file rather than an env() call in bootstrap/app.php, because
 * `php artisan optimize` caches config and an env() read outside it returns
 * null once the cache exists.
 */

return [
    'proxies' => env('TRUSTED_PROXIES', '127.0.0.1,::1'),
];
