<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\PreviewLinkResource;
use App\Models\PreviewLink;
use App\Models\User;
use App\Support\PreviewLinks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Draft share links (0.138.0, `docs/admin-console.md` "Draft share links").
 *
 * The routes sit behind the union of the three roles that own a kind of
 * record; this controller narrows to the one that owns *this* kind — a
 * content manager cannot share a shop product, a store manager cannot share a
 * blog post, an administrator can share anything.
 */
class PreviewLinkController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(PreviewLinks::aliases())],
            'id' => ['required', 'integer', 'min:1'],
        ]);

        $this->authoriseType($request, $data['type']);

        $link = PreviewLinks::linkFor($data['type'], (int) $data['id']);

        return response()->json([
            'data' => $link ? (new PreviewLinkResource($link))->resolve($request) : null,
            'meta' => $this->meta(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(PreviewLinks::aliases())],
            'id' => ['required', 'integer', 'min:1'],
            'days' => ['nullable', 'integer', Rule::in(PreviewLinks::DAYS)],
        ]);

        $this->authoriseType($request, $data['type']);

        $record = PreviewLinks::find($data['type'], (int) $data['id']);

        if ($record === null) {
            throw ValidationException::withMessages(['id' => 'That record does not exist.']);
        }

        $days = (int) ($data['days'] ?? PreviewLinks::DEFAULT_DAYS);

        // One live link per record: making a new one replaces the old, which
        // stops working at once. Delete and create in one transaction so a
        // failure cannot leave the record with none.
        $link = DB::transaction(function () use ($data, $record, $days, $request) {
            PreviewLink::query()
                ->where('subject_type', $data['type'])
                ->where('subject_id', $record->getKey())
                ->delete();

            return PreviewLink::create([
                'subject_type' => $data['type'],
                'subject_id' => $record->getKey(),
                'token' => PreviewLink::newToken(),
                'expires_at' => now()->addDays($days),
                'created_by' => $request->user()?->getKey(),
            ]);
        });

        $link->load('creator');

        return (new PreviewLinkResource($link))
            ->additional(['meta' => $this->meta()])
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Request $request, PreviewLink $previewLink): Response
    {
        $this->authoriseType($request, (string) $previewLink->subject_type);

        $previewLink->delete();

        return response()->noContent();
    }

    /** @return array{days: array<int, int>, default_days: int} */
    private function meta(): array
    {
        return ['days' => PreviewLinks::DAYS, 'default_days' => PreviewLinks::DEFAULT_DAYS];
    }

    private function authoriseType(Request $request, string $type): void
    {
        $user = $request->user();

        abort_unless($user instanceof User && PreviewLinks::allows($user, $type), 403, 'You do not have permission to perform this action.');
    }
}
