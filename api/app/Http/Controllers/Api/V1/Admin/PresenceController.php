<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\EditPresence;
use App\Models\User;
use App\Support\Notifications\NoteKinds;
use App\Support\Notifications\StaleGuard;
use App\Support\Revisions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Who else has an edit screen open (C2, docs/notifications.md). The console
 * beats every 20 seconds; a row unseen for 60 seconds does not count.
 */
class PresenceController extends Controller
{
    private const FRESH_SECONDS = 60;

    public function beat(Request $request): JsonResponse
    {
        [$alias, $record, $user] = $this->subject($request);

        $row = EditPresence::query()->firstOrNew(['user_id' => $user->id, 'subject_type' => $alias, 'subject_id' => $record->getKey()]);
        if ($row->last_seen_at === null || $row->last_seen_at->lt(now()->subSeconds(self::FRESH_SECONDS))) {
            $row->opened_at = now();
        }
        $row->dirty = $request->boolean('dirty');
        $row->last_seen_at = now();
        $row->save();

        $others = EditPresence::query()->with('user:id,name')
            ->where('subject_type', $alias)->where('subject_id', $record->getKey())
            ->where('user_id', '!=', $user->id)->where('last_seen_at', '>=', now()->subSeconds(self::FRESH_SECONDS))
            ->orderBy('opened_at')->get()
            ->map(fn (EditPresence $p) => ['name' => $p->user?->name, 'dirty' => (bool) $p->dirty, 'since' => $p->opened_at?->toIso8601String()])
            ->filter(fn (array $p) => $p['name'] !== null)->values();

        return response()->json(['data' => [
            'others' => $others,
            'saved' => ['at' => $record->getAttribute('updated_at')?->toIso8601String(), 'by' => StaleGuard::lastSavedBy($record)['name'] ?? null],
        ]]);
    }

    public function leave(Request $request): Response
    {
        [$alias, $record, $user] = $this->subject($request);
        EditPresence::query()->where('user_id', $user->id)->where('subject_type', $alias)->where('subject_id', $record->getKey())->delete();

        return response()->noContent();
    }

    /** @return array{0: string, 1: Model, 2: User} */
    private function subject(Request $request): array
    {
        $data = $request->validate(['type' => ['required', 'string', Rule::in(NoteKinds::aliases())], 'id' => ['required', 'integer']]);
        /** @var User $user */
        $user = $request->user();
        abort_unless(Revisions::allows($user, $data['type']), 403, 'You do not have permission to perform this action.');
        $record = NoteKinds::find($data['type'], (int) $data['id']);
        abort_if($record === null, 404);

        return [$data['type'], $record, $user];
    }
}
