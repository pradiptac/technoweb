<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Redirect;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Slug changes leave a 301 behind. The Next.js middleware asks this endpoint
 * before rendering a 404, so old URLs keep their rankings.
 */
class RedirectController extends Controller
{
    public function lookup(Request $request): JsonResponse
    {
        $path = '/'.ltrim($request->string('path')->value(), '/');

        $redirect = Redirect::where('from_path', $path)->where('is_active', true)->first();

        if (! $redirect) {
            return response()->json(['data' => null], 404);
        }

        $redirect->recordHit();

        return response()->json(['data' => [
            'to' => $redirect->to_path,
            'status' => $redirect->status_code,
        ]]);
    }
}
