<?php

use App\Http\Middleware\EnsureUserHasRole;
use App\Http\Middleware\EnsureUserIsCustomer;
use App\Http\Middleware\EnsureUserIsStaff;
use App\Http\Middleware\RecordActivity;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

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
        ]);

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
