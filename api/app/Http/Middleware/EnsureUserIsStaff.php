<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: staff
 *
 * The mirror of EnsureUserIsCustomer, for the admin side.
 *
 * Most admin routes sit behind `role:`, which already refuses a customer
 * token. The handful that cannot — logout, me, and changing your own password
 * — are reachable by every role by design, and were each carrying their own
 * inline `instanceof User` check instead.
 *
 * That is exactly the arrangement CLAUDE.md warns about, and it failed the way
 * it was always going to: the third route was added without the line, and a
 * customer token could call it. One middleware on the group cannot be
 * forgotten the next time a route is added there.
 */
class EnsureUserIsStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(401, 'Authentication required.');
        }

        if (! $user instanceof User) {
            abort(403, 'Staff access only.');
        }

        // A staff member deactivated after signing in still holds a valid
        // token until it expires; this closes that window.
        if (! $user->is_active) {
            abort(403, 'This staff account has been deactivated.');
        }

        return $next($request);
    }
}
