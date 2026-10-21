<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\StaffNotificationKind;
use App\Http\Controllers\Controller;
use App\Models\RecordNote;
use App\Models\User;
use App\Support\Notifications\Mentions;
use App\Support\Notifications\NoteKinds;
use App\Support\Revisions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/**
 * Team notes on the kinds page history knows (C2, docs/notifications.md).
 * Narrowed per kind to its owning role, the `/admin/revisions` rule; the body
 * is plain text, stored as typed and drawn escaped.
 */
class RecordNoteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        [$alias, $record] = $this->subject($request, $request->query());

        $notes = RecordNote::query()->where('subject_type', $alias)->where('subject_id', $record->getKey())->orderBy('id')->get();

        return response()->json(['data' => $this->rows($notes, $request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(NoteKinds::aliases())],
            'id' => ['required', 'integer'],
            'body' => ['required', 'string', 'max:2000'],
        ]);
        [$alias, $record] = $this->subject($request, $data);
        /** @var User $author */
        $author = $request->user();
        $path = NoteKinds::adminPath($alias, $record);
        $people = Mentions::resolve($data['body'], $request->input('mentions'), $path, $author);

        $note = RecordNote::create([
            'subject_type' => $alias,
            'subject_id' => $record->getKey(),
            'user_id' => $author->id,
            'author_name' => $author->name,
            'body' => $data['body'],
            'mentions' => $people->pluck('id')->all(),
        ]);
        Mentions::notify($people, StaffNotificationKind::MentionNote, "{$author->name} mentioned you in a note on ".NoteKinds::title($record).'.', $path, $record, $author);

        return response()->json(['data' => $this->rows(collect([$note]), $author)[0]], 201);
    }

    public function destroy(Request $request, int $id): Response
    {
        $note = RecordNote::query()->findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        abort_unless(Revisions::allows($user, $note->subject_type), 403, 'You do not have permission to perform this action.');
        abort_unless($user->isAdmin() || $note->user_id === $user->id, 403, 'Only the person who wrote a note, or an administrator, can delete it.');
        $note->delete();

        return response()->noContent();
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{0: string, 1: Model}
     */
    private function subject(Request $request, array $input): array
    {
        $alias = (string) ($input['type'] ?? '');
        if (! in_array($alias, NoteKinds::aliases(), true)) {
            abort(response()->json(['message' => 'Unknown type.', 'errors' => ['type' => ['Unknown type.']]], 422));
        }
        /** @var User $user */
        $user = $request->user();
        abort_unless(Revisions::allows($user, $alias), 403, 'You do not have permission to perform this action.');
        $record = NoteKinds::find($alias, (int) ($input['id'] ?? 0));
        abort_if($record === null, 404);

        return [$alias, $record];
    }

    /**
     * @param  Collection<int, RecordNote>  $notes
     * @return list<array<string, mixed>>
     */
    private function rows(Collection $notes, User $viewer): array
    {
        $names = User::query()->whereIn('id', $notes->pluck('mentions')->flatten()->unique()->all())->pluck('name', 'id');

        return $notes->map(fn (RecordNote $n) => [
            'id' => $n->id,
            'author_name' => $n->author_name,
            'body' => $n->body,
            'mentioned' => collect($n->mentions ?? [])->filter(fn ($id) => $names->has($id))->map(fn ($id) => ['id' => (int) $id, 'name' => $names[$id]])->values()->all(),
            'created_at' => $n->created_at?->toIso8601String(),
            'can_delete' => $viewer->isAdmin() || $n->user_id === $viewer->id,
        ])->values()->all();
    }
}
