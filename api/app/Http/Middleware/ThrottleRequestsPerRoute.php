<?php

namespace App\Http\Middleware;

use Illuminate\Routing\Middleware\ThrottleRequests;
use RuntimeException;

/**
 * `throttle:N,M`, counted per route.
 *
 * Registered over the framework's `throttle` alias in `bootstrap/app.php`, so
 * every `->middleware('throttle:10,1')` in `routes/api/*.php` means what it
 * reads as: ten a minute **on this route**, for this caller.
 *
 * Laravel's own `ThrottleRequests` keys an unnamed limit on
 * `sha1(domain|ip)` — or the user's id — and nothing about the route. Every
 * throttled route on this API therefore shared one counter per caller: ten
 * contact-form posts used up a visitor's sign-in attempts, a basket read
 * counted against the coupon field, and twenty JavaScript error reports were
 * enough to answer 429 on `auth/login`. Behind the Next server, where every
 * visitor used to arrive from one address, that was one counter for the
 * whole site.
 *
 * The route's name is the component added; a route without one falls back to
 * its methods and URI, so a route somebody forgets to name is still its own
 * counter. Doing it here rather than as a prefix argument on ~80 route lines is
 * the same argument as `staff` on the admin group: a rule every route has to
 * remember is a rule the next route forgets. The numbers stay where they were,
 * on each route.
 *
 * Named limiters (`throttle:<name>`) are untouched — they build their own key.
 */
class ThrottleRequestsPerRoute extends ThrottleRequests
{
    /**
     * @param  \Illuminate\Http\Request  $request
     */
    protected function resolveRequestSignature($request)
    {
        $route = $request->route();

        if (! $route instanceof \Illuminate\Routing\Route) {
            throw new RuntimeException('Unable to generate the request signature. Route unavailable.');
        }

        $scope = $route->getName() ?? implode('|', $route->methods()).' '.$route->uri();

        $who = ($user = $request->user())
            ? 'user:'.$user::class.':'.$user->getAuthIdentifier()
            : 'ip:'.$route->getDomain().'|'.$request->ip();

        $signature = $scope.'|'.$who;

        return static::$shouldHashKeys ? sha1($signature) : $signature;
    }
}
