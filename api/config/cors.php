<?php

/*
 * The frontend is a different origin (www.technoware.in calling
 * api.technoware.in), so CORS has to be explicit. Never widen
 * allowed_origins to '*' while supports_credentials is true.
 */
return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_filter([
        env('FRONTEND_URL'),
        env('APP_ENV') === 'local' ? 'http://localhost:3000' : null,
    ]),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Requested-With'],

    'exposed_headers' => [],

    'max_age' => 3600,

    'supports_credentials' => true,
];
