<?php

use App\Http\Middleware\EnsureUserHasRole;
use App\Http\Middleware\EnsureUserIsCustomer;
use App\Http\Middleware\EnsureUserIsStaff;
use App\Http\Middleware\RecordActivity;
use App\Http\Middleware\ThrottleRequestsPerRoute;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'role' => EnsureUserHasRole::class,
            'customer' => EnsureUserIsCustomer::class,
            'staff' => EnsureUserIsStaff::class,
            'activity' => RecordActivity::class,
            // Per route, not per caller: see ThrottleRequestsPerRoute.
            'throttle' => ThrottleRequestsPerRoute::class,
        ]);

        /*
         * Whose address `$request->ip()` is.
         *
         * Every public request reaches this API from the Next server, so
         * without this every visitor had the Next host's address and every
         * per-IP limit was one counter for the whole site. The Next server
         * now sends `X-Forwarded-For: <the visitor>` (web/src/lib/client-ip.ts)
         * and that header is believed **only** from the addresses in
         * `TRUSTED_PROXIES` (config/trustedproxy.php, default loopback) —
         * from anywhere else it is ignored and the connecting address stands,
         * so a caller cannot choose its own rate-limit bucket.
         *
         * X-Forwarded-For only. Host, proto and port are not believed from
         * anybody, which is what they were before this existed: `asset()`
         * and every canonical are built from them, and the Next server has no
         * business changing either.
         */
        $middleware->trustProxies(headers: Request::HEADER_X_FORWARDED_FOR);

        // The frontend is a separate origin, so the API is stateless and
        // token-authenticated. No CSRF cookie dance, no session for /api.
        $middleware->statefulApi();
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Always answer API routes with JSON, never an HTML error page.
        $exceptions->shouldRenderJsonWhen(
            fn ($request) => $request->is('api/*') || $request->expectsJson()
        );
    })->create();
