<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: role:admin,support_engineer
 *
 * Admins pass every check implicitly — otherwise every route would need
 * "admin" appended and someone would eventually forget.
 */
class EnsureUserHasRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(401, 'Authentication required.');
        }

        if (! $user->is_active) {
            abort(403, 'This account has been deactivated.');
        }

        if (! $user->isAdmin() && ! $user->hasRole(...$roles)) {
            abort(403, 'You do not have permission to perform this action.');
        }

        return $next($request);
    }
}
