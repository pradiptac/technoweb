<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\NotFoundHit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The 404 page telling us what it was asked for.
 *
 * Public and unauthenticated, because the visitor has no session and the
 * answer has to come from the browser: a not-found boundary is given no params,
 * and the proxy that sees every request cannot know, when it forwards one, that
 * the page behind it will turn out not to exist.
 *
 * What stops it being a way to fill a table is the same as for the browser's
 * error reports: throttled, grouped by address so the table is bounded by the
 * number of *distinct* dead addresses, truncated on write (in the model), and
 * pruned by age. What it will not record at all is the model's business.
 *
 * It answers 204 whatever happens, a payload it threw away included — the
 * caller is the 404 page, and a validation error would be a message to nobody.
 */
class NotFoundController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $path = $request->input('path');
        $referrer = $request->input('referrer');

        if (is_string($path)) {
            NotFoundHit::report($path, is_string($referrer) ? $referrer : null);
        }

        return response()->json(null, 204);
    }
}
