<?php

namespace App\Http\Middleware;

use App\Models\Customer;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: customer
 *
 * The mirror of EnsureUserHasRole, for the portal side. Sanctum resolves a
 * token to whichever model owns it, so without this a staff token reaches
 * customer endpoints — and those authorise by comparing
 * $request->user()->id against a ticket's customer_id, which are ids from
 * two entirely different tables. They collide whenever the numbers happen
 * to match.
 */
class EnsureUserIsCustomer
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(401, 'Authentication required.');
        }

        if (! $user instanceof Customer) {
            abort(403, 'Portal access only.');
        }

        // A customer suspended after signing in still holds a valid token
        // until it expires; this closes that window. The admin actions revoke
        // tokens as well, but belt and braces: this is the check that cannot
        // be forgotten at a new call site.
        //
        // Reads the same `canSignIn()` the login does, deliberately. When this
        // was `! $user->is_active` and that column was dropped, the missing
        // attribute read as false and *every* authenticated portal request
        // 403'd — one source of truth for "may this account be here" is what
        // stops the two drifting.
        if (! $user->status->canSignIn()) {
            abort(403, 'This portal account is not active.');
        }

        return $next($request);
    }
}
