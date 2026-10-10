<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContentRevision;
use App\Models\User;
use App\Support\PageSections\RecordSections;
use App\Support\Revisions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Page history (0.145.0, `docs/page-builder.md` "Page history").
 *
 * Read-only on purpose: there is no restore endpoint. A restore is the console
 * loading a snapshot into the edit form for the editor to save, so the save's
 * own validation answers for a version that points at something since
 * unpublished or deleted.
 *
 * The routes sit behind the union of the roles that own a kind of record; this
 * controller narrows to the one that owns *this* kind, as `PreviewLinkController`
 * does.
 */
class RevisionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(Revisions::aliases())],
            'id' => ['required', 'integer', 'min:1'],
        ]);

        $this->authoriseType($request, $data['type']);

        // The snapshot is the heavy column and the list never needs it; its
        // length is all the "size" column reads.
        $rows = ContentRevision::query()
            ->select(['id', 'user_id', 'actor_name', 'changed', 'blocks_count', 'created_at', 'updated_at'])
            ->selectRaw('LENGTH(snapshot) as size')
            ->where('subject_type', $data['type'])
            ->where('subject_id', (int) $data['id'])
            ->orderByDesc('id')
            ->limit(Revisions::KEEP)
            ->get();

        return response()->json([
            'data' => $rows->map(fn (ContentRevision $r) => $this->row($r) + ['size' => (int) $r->getAttribute('size')])->all(),
            'meta' => $this->meta($data['type']),
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $revision = ContentRevision::query()->findOrFail($id);

        abort_unless(Revisions::knows($revision->subject_type), 404);
        $this->authoriseType($request, $revision->subject_type);

        $snapshot = $revision->snapshot;
        $blocks = $snapshot['blocks'] ?? null;

        return response()->json([
            'data' => $this->row($revision) + [
                'type' => $revision->subject_type,
                'subject_id' => $revision->subject_id,
                'snapshot' => $snapshot,
                'blocks_media' => (object) (is_array($blocks) ? RecordSections::mediaUrls($blocks) : []),
            ],
            'meta' => $this->meta($revision->subject_type),
        ]);
    }

    /** @return array<string, mixed> */
    private function row(ContentRevision $r): array
    {
        return [
            'id' => $r->id,
            // The moment this state was last saved: a folded revision keeps
            // moving, so `created_at` is when the run of saves began.
            'saved_at' => $r->updated_at?->toIso8601String(),
            'created_at' => $r->created_at?->toIso8601String(),
            'actor_name' => $r->actor_name,
            'changed' => $r->changed ?? [],
            'blocks_count' => $r->blocks_count,
        ];
    }

    /** @return array<string, mixed> */
    private function meta(string $type): array
    {
        return [
            'labels' => Revisions::labels($type),
            'keep' => Revisions::KEEP,
            'coalesce_minutes' => Revisions::COALESCE_MINUTES,
            // What the console needs to put a version into this kind's edit
            // form and to draw it, sent so it lists none of it itself (0.148.0):
            // the control name where it differs from the column, the columns
            // that are the written body (a preview shows them when there are
            // no sections), and whether the form can take a version at all.
            'fields' => (object) Revisions::fieldMap($type),
            'body_columns' => Revisions::bodyColumns($type),
            'restorable' => Revisions::restorable($type),
        ];
    }

    private function authoriseType(Request $request, string $type): void
    {
        $user = $request->user();

        abort_unless($user instanceof User && Revisions::allows($user, $type), 403, 'You do not have permission to perform this action.');
    }
}
