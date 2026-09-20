<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Redirect;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Slug changes leave a 301 behind, and this is how the frontend finds them.
 *
 * Two endpoints, and the split is the whole of the performance story.
 * `index` is the active table, fetched by the Next proxy once a minute per
 * process and held in memory, so the question "does this path redirect?" is
 * answered from a Map on every request and never from here. `lookup` is one
 * path — what the proxy used to call on *every* request under the content
 * prefixes, existing pages included, and now calls only on a hit, because it
 * is the one that records the hit.
 */
class RedirectController extends Controller
{
    /**
     * Every active redirect, as `from => {to, status}` rows.
     *
     * Public and unauthenticated: a redirect is an old URL that answers 301,
     * which anybody can discover by requesting it. Bounded rather than
     * paginated, because the proxy wants the whole table in one read and the
     * table is renamed slugs — hundreds at the outside. The bound is there so
     * a runaway import cannot turn this into a megabyte on every refresh.
     */
    public function index(): JsonResponse
    {
        $rows = Redirect::query()
            ->where('is_active', true)
            ->orderBy('id')
            ->limit(5000)
            ->get(['from_path', 'to_path', 'status_code']);

        return response()
            ->json(['data' => $rows->map(fn (Redirect $r) => [
                'from' => $r->from_path,
                'to' => $r->to_path,
                'status' => $r->status_code,
            ])->all()])
            ->header('Cache-Control', 'public, max-age=60');
    }

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
