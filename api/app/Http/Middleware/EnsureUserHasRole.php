<?php

namespace App\Http\Middleware;

use App\Models\User;
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

        // The portal and admin share one auth:sanctum guard, so a customer's
        // token can reach this far. Customer has no isAdmin()/hasRole() —
        // without this check that would 500 instead of a clean 403.
        if (! $user instanceof User) {
            abort(403, 'Staff access only.');
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
