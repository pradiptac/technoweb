<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\ChatEvent;
use App\Support\Chat\ChatMetrics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * The assistant, from the desk.
 *
 * **`role:admin`, and that is the narrow answer rather than the lazy one.**
 * These transcripts hold whatever visitors typed — names, telephone numbers,
 * descriptions of somebody's network — given by people with no account and no
 * expectation that the whole company would read them. Blast radius, the
 * argument `campaign_manager` and `sales_manager` were split out with. If the
 * unanswered list turns out to be something the content team works daily, that
 * is a deliberate widening with a role of its own, not a default.
 *
 * Read-only apart from resolving an unanswered question. There is no way to
 * edit a transcript and no way to delete one: a log its own subject can prune
 * to taste is evidence of nothing, and the only thing that removes a
 * conversation is `technoware:prune-chats` deleting by age.
 */
class ChatAdminController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json(['data' => ChatMetrics::read($from, $to)]);
    }

    /**
     * Conversations, newest first.
     *
     * The transcript is deliberately not here — a list of two hundred
     * conversations carrying every message is a page nobody waits for, and the
     * question a list answers is "which one do I want", not "what did it say".
     */
    public function conversations(Request $request): JsonResponse
    {
        $query = ChatConversation::query()
            ->withCount(['messages as question_count' => fn ($q) => $q->where('role', 'user')])
            ->with('lead:id,name,email,status')
            ->latest('id');

        if ($request->filled('q')) {
            $term = '%'.$request->string('q').'%';

            // Searched on what was said, because that is the only thing anybody
            // remembers about a conversation they are trying to find again.
            $query->whereHas('messages', fn ($m) => $m->where('content', 'like', $term));
        }

        if ($request->boolean('with_lead')) {
            $query->whereNotNull('lead_id');
        }

        if ($request->boolean('unanswered')) {
            $query->whereHas('messages', fn ($m) => $m->where('role', 'assistant')->where('grounded', false));
        }

        $conversations = $query
            ->paginate(min((int) $request->integer('per_page', 25), 100))
            ->withQueryString();

        return response()->json([
            'data' => $conversations->through(fn (ChatConversation $c) => [
                'id' => $c->id,
                'started_at' => $c->created_at?->toIso8601String(),
                'last_message_at' => $c->last_message_at?->toIso8601String(),
                'questions' => (int) $c->question_count,
                'source_path' => $c->source_path,
                'lead' => $c->lead ? [
                    'id' => $c->lead->id,
                    'name' => $c->lead->name,
                    'status' => $c->lead->status?->value,
                ] : null,
            ])->items(),
            'meta' => [
                'current_page' => $conversations->currentPage(),
                'last_page' => $conversations->lastPage(),
                'per_page' => $conversations->perPage(),
                'total' => $conversations->total(),
            ],
        ]);
    }

    /**
     * One conversation, in full.
     *
     * `visibleMessages`, so the system message — the instructions and the
     * retrieved context — does not reach the console either. That is not
     * secrecy from staff: it is that the boundary is structural, and a second
     * reader with a second rule is how the first one stops being true.
     */
    public function conversation(ChatConversation $chatConversation): JsonResponse
    {
        $chatConversation->load(['visibleMessages', 'lead:id,name,email,status']);

        return response()->json(['data' => [
            'id' => $chatConversation->id,
            'started_at' => $chatConversation->created_at?->toIso8601String(),
            'source_path' => $chatConversation->source_path,
            'source_title' => $chatConversation->source_title,
            'tokens_used' => (int) $chatConversation->tokens_used,
            'lead' => $chatConversation->lead ? [
                'id' => $chatConversation->lead->id,
                'name' => $chatConversation->lead->name,
                'status' => $chatConversation->lead->status?->value,
            ] : null,
            'messages' => $chatConversation->visibleMessages->map(fn ($m) => [
                'id' => $m->id,
                'role' => $m->role,
                'content' => $m->content,
                'intent' => $m->intent,
                'grounded' => (bool) $m->grounded,
                'rating' => $m->rating,
                'rating_note' => $m->rating_note,
                'at' => $m->created_at?->toIso8601String(),
            ])->all(),
        ]]);
    }

    /**
     * Questions the website could not answer.
     *
     * §42: these are not failures to hide, they are the list of pages somebody
     * should write. Grouped by the question so a thing forty people asked
     * appears once with a forty beside it rather than forty times — an
     * ungrouped list is one where the most important item is the hardest to
     * see.
     */
    public function unanswered(Request $request): JsonResponse
    {
        $rows = ChatEvent::where('type', 'unanswered')
            ->when(! $request->boolean('all'), fn ($q) => $q->whereNull('resolved_at'))
            ->orderByDesc('id')
            ->limit(500)
            ->get();

        $grouped = $rows
            ->groupBy(fn (ChatEvent $e) => mb_strtolower(trim((string) ($e->context['question'] ?? ''))))
            ->filter(fn ($group, $key) => $key !== '')
            ->map(fn ($group) => [
                // The most recent id, which is what resolving acts on — one
                // press marks the whole group.
                'ids' => $group->pluck('id')->all(),
                'question' => $group->first()->context['question'] ?? '',
                'asked' => $group->count(),
                'last_asked' => $group->first()->created_at?->toIso8601String(),
                'conversation_id' => $group->first()->chat_conversation_id,
                'resolved' => $group->first()->resolved_at !== null,
            ])
            ->sortByDesc('asked')
            ->values();

        return response()->json(['data' => $grouped->all()]);
    }

    /**
     * Somebody has dealt with it — written the page, added the FAQ.
     *
     * The whole group at once, because a question asked forty times is one
     * piece of work and forty presses is a queue nobody empties.
     */
    public function resolve(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'max:500'],
            'ids.*' => ['integer'],
        ]);

        ChatEvent::whereIn('id', $data['ids'])
            ->where('type', 'unanswered')
            ->update(['resolved_at' => now()]);

        return response()->json(null, 204);
    }

    /**
     * Thirty days by default, and a backwards range is corrected.
     *
     * Swapping two dates in a form is a slip, not a question — the same call
     * the sales and stock reports make.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    private function range(Request $request): array
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $to = isset($data['to']) ? Carbon::parse($data['to'])->startOfDay() : Carbon::today();
        $from = isset($data['from']) ? Carbon::parse($data['from'])->startOfDay() : $to->copy()->subDays(29);

        return $from->gt($to) ? [$to, $from] : [$from, $to];
    }
}
