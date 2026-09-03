<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ClientError;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A browser telling us its JavaScript failed.
 *
 * Public and unauthenticated, because that is where the errors are: a visitor
 * on the marketing site has no session, and an error boundary on the sign-in
 * screen fires before anybody has one. Gating this on a token would collect
 * exactly the failures we already hear about and none of the rest.
 *
 * What stops it being a way to fill a table:
 *
 * - **Throttled**, hard. A browser reports once per boundary render.
 * - **Grouped by fingerprint**, so a flood of one message is one row with a
 *   count rather than a row each. The table's size is bounded by the number of
 *   *distinct* failures, which is a number a person could read.
 * - **Every field is truncated on write**, in the model. These are strings a
 *   caller chose.
 * - **Pruned by age**, like the activity log and the chat transcripts.
 *
 * It answers 204 whatever happens, including for a payload it throws away. The
 * caller is an error handler: telling it that reporting the error also failed
 * gives it nothing it can act on and invites a loop.
 */
class ClientErrorController extends Controller
{
    /** Which boundary caught it. An unknown value is recorded as `site`. */
    private const AREAS = ['site', 'admin', 'portal'];

    public function store(Request $request): JsonResponse
    {
        $area = (string) $request->input('area', 'site');

        ClientError::report(
            in_array($area, self::AREAS, true) ? $area : 'site',
            (string) $request->input('message', ''),
            $request->filled('digest') ? (string) $request->input('digest') : null,
            /*
             * A path, and only ever a path.
             *
             * Taken through parse_url so a caller cannot store an absolute URL
             * pointing anywhere it likes — this is read on an admin screen, and
             * a full URL somebody else chose is a link somebody else chose.
             */
            $this->pathOf((string) $request->input('path', '')),
            $request->userAgent(),
        );

        return response()->json(null, 204);
    }

    private function pathOf(string $value): ?string
    {
        if ($value === '') {
            return null;
        }

        $path = parse_url($value, PHP_URL_PATH);

        if (! is_string($path) || $path === '') {
            return null;
        }

        $query = parse_url($value, PHP_URL_QUERY);

        return $path.(is_string($query) && $query !== '' ? '?'.$query : '');
    }
}
