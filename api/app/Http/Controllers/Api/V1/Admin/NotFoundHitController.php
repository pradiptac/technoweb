<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\NotFoundHit;
use App\Support\ListSort;
use App\Support\PaginatedEnvelope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The addresses visitors asked for that do not exist. Behind
 * `role:seo_manager`, who also owns the redirect table the answer goes into.
 *
 * Read-mostly. The only writes are a tick — ignore, and its undo — because the
 * list is a worklist and not evidence: it ages out through
 * `technoware:prune-not-found`, and a row an editor could delete is an address
 * that climbs straight back onto the list on its next request. Ignoring is the
 * way to say "not worth a redirect" that lasts.
 *
 * There is no "handled" write at all. An address leaves the list when a
 * redirect starts at it (`NotFoundHit::scopeLive()`), which is the one fact
 * that makes it handled.
 */
class NotFoundHitController extends Controller
{
    /** The retention the prune command applies; the screen says it out loud. */
    public const RETENTION_DAYS = 90;

    public function index(Request $request): JsonResponse
    {
        $query = NotFoundHit::query()
            ->when(
                $request->boolean('ignored'),
                fn ($q) => $q->ignored(),
                fn ($q) => $q->live(),
            )
            ->when($request->filled('q'), fn ($q) => $q->where(
                'path', 'like', '%'.addcslashes($request->string('q')->value(), '%_\\').'%',
            ));

        ListSort::apply($query, $request, [
            'hits' => 'hits',
            'last_seen' => 'last_seen_at',
        ], fn ($q) => $q->orderByDesc('hits')->orderByDesc('last_seen_at'));

        $rows = $query
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        $rows->getCollection()->transform(fn (NotFoundHit $hit) => $this->present($hit));

        return response()->json(PaginatedEnvelope::from($rows, [
            'live' => NotFoundHit::live()->count(),
            'ignored' => NotFoundHit::ignored()->count(),
            'retention_days' => self::RETENTION_DAYS,
        ]));
    }

    /** "Not worth a redirect." Idempotent; a second press keeps the first moment. */
    public function ignore(NotFoundHit $hit): JsonResponse
    {
        $hit->forceFill(['ignored_at' => $hit->ignored_at ?? now()])->save();

        return response()->json(['data' => $this->present($hit)]);
    }

    public function restore(NotFoundHit $hit): JsonResponse
    {
        $hit->forceFill(['ignored_at' => null])->save();

        return response()->json(['data' => $this->present($hit)]);
    }

    /** @return array<string, mixed> */
    private function present(NotFoundHit $hit): array
    {
        return [
            'id' => $hit->id,
            'path' => $hit->path,
            'hits' => $hit->hits,
            'referrer' => $hit->referrer,
            'first_seen_at' => $hit->first_seen_at?->toIso8601String(),
            'last_seen_at' => $hit->last_seen_at?->toIso8601String(),
            'ignored_at' => $hit->ignored_at?->toIso8601String(),
            // A console path, never a URL (see CLAUDE.md on `frontend_url`): the
            // browser supplies the origin. The form reads `from` once, as the
            // starting value of "Redirect from".
            'redirect_path' => '/admin/redirects/new?from='.rawurlencode($hit->path),
        ];
    }
}
