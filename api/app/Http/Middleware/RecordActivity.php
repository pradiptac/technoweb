<?php

namespace App\Http\Middleware;

use App\Support\ActivityLogger;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: activity
 *
 * On the whole admin group, for the same reason `staff` is: a check that has to
 * be remembered at 67 call sites is a check that will be missed at one of them,
 * and the one that is missed is the one somebody comes looking for.
 *
 * It runs *after* the response, so it can see whether the work actually
 * succeeded — a 422 changed nothing and is not an event. What counts as worth
 * recording is `ActivityLogger`'s decision, not this class's.
 */
class RecordActivity
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        ActivityLogger::record($request, $response);

        return $response;
    }
}
