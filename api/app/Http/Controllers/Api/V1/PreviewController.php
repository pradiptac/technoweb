<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PublishStatus;
use App\Http\Controllers\Controller;
use App\Models\Entry;
use App\Models\LandingPage;
use App\Models\PreviewLink;
use App\Support\PreviewLinks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Opens a draft from its share link (0.138.0, `docs/admin-console.md`).
 *
 * **One 404 for everything.** An unknown token, an expired one, one that was
 * revoked and one that was replaced all answer the same, and so does a link to
 * a record that has since been deleted: nothing here says which of them it was.
 *
 * `record` is what the record's public detail endpoint answers (see
 * `PreviewLinks::present()`), with no check that it is published, active or
 * still open for applications — that is the whole point — and without the
 * structured data. Everything the public read withholds is withheld here for
 * the same reason: it is the same resource.
 */
class PreviewController extends Controller
{
    public function show(Request $request, string $token): JsonResponse
    {
        $link = PreviewLink::query()->where('token', $token)->first();

        // The query matched on equality already; this is the comparison that
        // does not leak timing, and it is cheap.
        abort_if($link === null || ! hash_equals((string) $link->token, $token) || $link->isExpired(), 404);

        $record = PreviewLinks::find((string) $link->subject_type, (int) $link->subject_id);

        abort_if($record === null, 404);

        // An entry needs its type to be read at all.
        abort_if($record instanceof Entry && $record->contentType === null, 404);

        // Through the query builder: `updated_at` is not a view counter.
        DB::table('preview_links')->where('id', $link->id)
            ->increment('views', 1, ['last_viewed_at' => now()]);

        $type = (string) $link->subject_type;
        $status = PreviewLinks::statusOf($record);

        return response()->json([
            'data' => [
                'type' => $type,
                'slug' => $record->getAttribute('slug'),
                'type_slug' => $record instanceof Entry ? $record->typeSlug() : null,
                'path' => $record instanceof LandingPage ? $record->path : null,
                'record' => PreviewLinks::present($type, $record, $request),
            ],
            'meta' => [
                'title' => PreviewLinks::titleOf($record),
                'status' => $status->value,
                'status_label' => $status->label(),
                'published' => $status === PublishStatus::Published,
                'expires_at' => $link->expires_at->toIso8601String(),
                'expires_label' => $link->expires_at->format('j F Y'),
            ],
        ])->header('Cache-Control', 'no-store');
    }
}
