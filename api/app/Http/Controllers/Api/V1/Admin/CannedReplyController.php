<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCannedReplyRequest;
use App\Http\Requests\UpdateCannedReplyRequest;
use App\Http\Resources\Admin\CannedReplyResource;
use App\Models\CannedReply;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Saved replies for the support desk. Behind role:support_engineer.
 *
 * Two reads, deliberately. The index is the management screen's: the stored
 * text, placeholders and all, with `meta.placeholders` so the screen's chips
 * come from the same list the fill reads. `forTicket()` is the reply form's:
 * the same rows with every placeholder **already filled for that ticket** —
 * the console inserts what it is given, and the placeholder rules live in
 * exactly one place, which is `CannedReply::fillFor()` on top of
 * `Placeholders::fillText`. See the model for why that is not
 * `EmailRenderer::personalise()`.
 */
class CannedReplyController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $replies = CannedReply::query()
            ->with('author')
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('title', 'like', "%{$term}%")
                    ->orWhere('body', 'like', "%{$term}%"));
            })
            ->ordered()
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        return CannedReplyResource::collection($replies)
            ->additional(['meta' => ['placeholders' => CannedReply::placeholders()]]);
    }

    /**
     * Every reply, filled for this ticket and this agent, in the picker's
     * order. Not paginated: a desk keeps a few dozen of these, and a picker
     * with a page two is a picker nobody scrolls.
     */
    public function forTicket(Request $request, Ticket $ticket): JsonResponse
    {
        $ticket->loadMissing('customer');
        $agent = $request->user();
        // The `staff` middleware on the admin group has already refused
        // anything that is not a User; this narrows the type, not the access.
        abort_unless($agent instanceof User, 403);

        $replies = CannedReply::query()->ordered()->get()
            ->each(fn (CannedReply $reply) => $reply->setAttribute('body', $reply->fillFor($ticket, $agent)));

        return response()->json([
            'data' => CannedReplyResource::collection($replies)->resolve(),
        ]);
    }

    public function show(CannedReply $canned_reply): JsonResource
    {
        return new CannedReplyResource($canned_reply->load('author'));
    }

    public function store(StoreCannedReplyRequest $request): JsonResponse
    {
        $data = $request->validated();

        $reply = CannedReply::create([
            'title' => $data['title'],
            'body' => $data['body'],
            'sort_order' => $data['sort_order'] ?? 0,
            'created_by' => $request->user()->id,
        ]);

        return (new CannedReplyResource($reply->load('author')))->response()->setStatusCode(201);
    }

    public function update(UpdateCannedReplyRequest $request, CannedReply $canned_reply): JsonResource
    {
        $data = $request->validated();

        if (array_key_exists('sort_order', $data) && $data['sort_order'] === null) {
            $data['sort_order'] = 0;
        }

        $canned_reply->update($data);

        return new CannedReplyResource($canned_reply->fresh('author'));
    }

    public function destroy(CannedReply $canned_reply): JsonResponse
    {
        $canned_reply->delete();

        return response()->json(['message' => 'Saved reply deleted.']);
    }
}
