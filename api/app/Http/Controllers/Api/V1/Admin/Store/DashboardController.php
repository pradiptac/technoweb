<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Controller;
use App\Support\Store\StoreMetrics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The shop at a glance.
 *
 * Read-only, and deliberately one request rather than the six the screen would
 * otherwise make: every figure here is a fact about the same moment, and six
 * calls answered over a second and a half are six facts about six moments that
 * the reader will nonetheless add up.
 */
class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        // A window, not a free integer. The screen offers three, and an
        // unrecognised value falls back rather than returning 422 — the same
        // rule `?sort=` follows, because this arrives from a bookmark.
        $days = (int) $request->query('days', 30);

        if (! in_array($days, [7, 30, 90], true)) {
            $days = 30;
        }

        return response()->json(['data' => StoreMetrics::read($days)]);
    }
}
