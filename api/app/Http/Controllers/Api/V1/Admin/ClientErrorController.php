<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ClientError;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What the site's JavaScript has been failing at.
 *
 * `role:admin`, the argument `campaign_manager` and the chat console are both
 * made with: a stack message can carry a route, a record id and occasionally a
 * fragment of somebody's input, and this is not something a content editor has
 * any reason to read.
 *
 * Read-mostly. The only write marks a row dealt with — there is no create and
 * no delete, because a log its own subject can tidy is evidence of nothing and
 * because a row deleted is a bug that comes back looking new. Age is what
 * removes rows, through `technoware:prune-client-errors`.
 */
class ClientErrorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = ClientError::query()
            ->when(! $request->boolean('all'), fn ($q) => $q->unresolved())
            ->when($request->filled('area'), fn ($q) => $q->where('area', $request->string('area')))
            ->when($request->filled('q'), fn ($q) => $q->where('message', 'like', '%'.$request->string('q').'%'))
            /*
             * Most recent first, not most frequent.
             *
             * A bug that stopped happening a fortnight ago outranks nothing,
             * however many times it fired; the question this screen answers is
             * "what is broken now". The count is on the row for weighing two
             * that are both current.
             */
            ->latest('last_seen_at')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        $rows->getCollection()->transform(fn (ClientError $e) => [
            'id' => $e->id,
            'area' => $e->area,
            'message' => $e->message,
            'digest' => $e->digest,
            'path' => $e->path,
            'occurrences' => $e->occurrences,
            'first_seen_at' => $e->first_seen_at?->toIso8601String(),
            'last_seen_at' => $e->last_seen_at?->toIso8601String(),
            'resolved_at' => $e->resolved_at?->toIso8601String(),
        ]);

        return response()->json($rows->toArray() + ['meta' => [
            'unresolved' => ClientError::unresolved()->count(),
            'retention_days' => (int) (Setting::get('client_error_retention_days') ?? 30),
        ]]);
    }

    /**
     * Mark one dealt with.
     *
     * It re-opens by itself: `ClientError::report()` clears `resolved_at` on
     * every report, so a fix that did not hold says so rather than staying
     * ticked off while the thing keeps happening.
     */
    public function resolve(int $id): JsonResponse
    {
        $row = ClientError::findOrFail($id);

        $row->update(['resolved_at' => now()]);

        return response()->json(['data' => ['id' => $row->id, 'resolved_at' => $row->resolved_at?->toIso8601String()]]);
    }
}
