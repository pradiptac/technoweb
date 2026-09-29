<?php

namespace App\Http\Middleware;

use App\Models\Setting;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: portal
 *
 * `portal_enabled` (the public `portal` settings group, a switch on
 * Customers → Portal) closes the whole customer portal. It sat on the
 * settings screen for months with nothing reading it; this is the reader.
 *
 * Applied to every customer-principal endpoint — the eight public
 * `/auth/*` routes a customer signs in, registers or recovers through,
 * and everything behind the `customer` middleware — so a switch that says
 * "closed" is closed at the API and not only on the website. A session
 * token issued before the switch was thrown stops working with it, because
 * every route it could reach carries this. Staff are untouched: nothing in
 * the `admin` group carries it.
 *
 * What it does **not** close, deliberately: a guest checkout (which still
 * creates the buyer's account, since an order needs somebody to belong to),
 * a guest engineer-visit request, the wishlist, the chat and every other
 * public route that merely *reads* an optional bearer. None of those is a
 * portal sign-in, and with the portal closed no customer bearer can be
 * obtained in the first place.
 *
 * Refused like `password_login_disabled`: a 403 whose `reason` the website
 * branches on, never the sentence.
 */
class EnsurePortalEnabled
{
    public const REASON = 'portal_disabled';

    public const MESSAGE = 'The customer portal is switched off. Contact us and we will help directly.';

    public function handle(Request $request, Closure $next): Response
    {
        if (! self::open()) {
            return self::refusal();
        }

        return $next($request);
    }

    /** Whether the portal is open. The row is boolean-typed, so this is a real bool. */
    public static function open(): bool
    {
        return (bool) Setting::get('portal_enabled', true);
    }

    public static function refusal(): JsonResponse
    {
        return response()->json([
            'message' => self::MESSAGE,
            'reason' => self::REASON,
        ], 403);
    }
}
