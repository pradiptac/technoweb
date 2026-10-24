<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\SocialNetwork;
use App\Enums\SocialPostStatus as Status;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\SocialPostResource;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Entry;
use App\Models\Event;
use App\Models\SocialPost;
use App\Support\Social\LinkedInPoster;
use App\Support\Social\SocialDrafts;
use App\Support\Social\SocialSender;
use App\Support\Social\SocialSubjects;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Reviewing the LinkedIn and X drafts made for published records (C7).
 * Approving goes through `SocialSender`, which owns every rule about what may
 * be sent; this controller only shapes the answers.
 */
class SocialPostController extends Controller
{
    /** GET admin/social-posts. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'status' => ['sometimes', 'nullable', 'string'],
            'network' => ['sometimes', 'nullable', 'string'],
            'per_page' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100'],
        ]);

        // Like `?sort=`, a stale value falls back rather than answering 422; `all` lifts the filter.
        $status = Status::tryFrom((string) ($data['status'] ?? ''));
        $network = SocialNetwork::tryFrom((string) ($data['network'] ?? ''));

        $posts = SocialPost::query()
            ->with(['subject', 'drafter', 'approver'])
            ->when(($data['status'] ?? null) !== 'all', fn ($q) => $q->where('status', ($status ?? Status::Draft)->value))
            ->when($network !== null, fn ($q) => $q->where('network', $network->value))
            ->orderByDesc('created_at')->orderByDesc('id')
            ->paginate((int) ($data['per_page'] ?? 25));

        $ready = app(LinkedInPoster::class)->ready();

        return SocialPostResource::collection($posts)->additional(['meta' => [
            'networks' => array_map(fn (SocialNetwork $n) => [
                'value' => $n->value, 'label' => $n->label(), 'limit' => $n->limit(),
                // X is never sent by API, so it is never "connected".
                'connected' => $n === SocialNetwork::LinkedIn && $ready,
            ], SocialNetwork::cases()),
            'statuses' => Status::options(),
            'waiting' => SocialPost::query()->where('status', Status::Draft->value)->count(),
        ]]);
    }

    /** GET admin/social-posts/{id}. */
    public function show(SocialPost $socialPost): SocialPostResource
    {
        return new SocialPostResource($this->loaded($socialPost));
    }

    /** PATCH admin/social-posts/{id}: the wording, while it can still be sent. */
    public function update(Request $request, SocialPost $socialPost): SocialPostResource
    {
        $data = $request->validate(['text' => ['required', 'string', 'max:20000']]);

        // One conditional update, so an edit cannot land on a post that is being sent.
        $changed = SocialPost::query()->whereKey($socialPost->id)
            ->whereIn('status', [Status::Draft->value, Status::Failed->value, Status::Unconfirmed->value])
            ->update(['text' => $data['text']]);
        if ($changed === 0) {
            throw ValidationException::withMessages(['text' => ['This post can no longer be edited.']]);
        }
        $socialPost->refresh();

        return new SocialPostResource($this->loaded($socialPost));
    }

    /** POST admin/social-posts/draft: a pair for a published record, on demand. */
    public function draft(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(SocialSubjects::ALIASES)],
            'id' => ['required', 'integer', 'min:1'],
        ]);

        $subject = SocialSubjects::find($data['type'], (int) $data['id']);
        if (! ($subject instanceof BlogPost || $subject instanceof CaseStudy || $subject instanceof Event || $subject instanceof Entry)
            || ! SocialSubjects::supports($subject) || ! SocialSubjects::isVisible($subject)) {
            throw ValidationException::withMessages(['id' => ['Only a published blog post, case study, event or press release can be shared.']]);
        }

        $pair = SocialDrafts::forRecord($subject, 'manual', $request->user());

        return SocialPostResource::collection(
            SocialPost::query()->with(['subject', 'drafter', 'approver'])->whereKey(array_map(fn (SocialPost $p) => $p->id, $pair))->orderBy('id')->get()
        )->response()->setStatusCode(201);
    }

    /**
     * POST admin/social-posts/{id}/approve. A refusal is a 422 on `text` with the post's
     * state in `data`, so the screen can redraw it; `meta.open_url` is the address to open
     * when the person has to finish the share themselves.
     */
    public function approve(Request $request, SocialPost $socialPost, SocialSender $sender): JsonResponse
    {
        $data = $request->validate([
            'text' => ['required', 'string', 'max:20000'],
            'confirm' => ['sometimes', 'boolean'],
            'manual' => ['sometimes', 'boolean'],
        ]);

        $outcome = $sender->approve($socialPost, $data['text'], $request->user(), (bool) ($data['confirm'] ?? false), (bool) ($data['manual'] ?? false));
        $resource = new SocialPostResource($this->loaded($outcome->post));

        if ($outcome->refusal !== null) {
            return response()->json([
                'message' => $outcome->refusal,
                'errors' => ['text' => [$outcome->refusal]],
                'data' => $resource->resolve($request),
            ], 422);
        }

        return response()->json(['data' => $resource->resolve($request), 'meta' => ['open_url' => $outcome->openUrl]]);
    }

    /** POST admin/social-posts/{id}/discard. */
    public function discard(Request $request, SocialPost $socialPost, SocialSender $sender): SocialPostResource
    {
        $refusal = $sender->discard($socialPost);
        if ($refusal !== null) {
            throw ValidationException::withMessages(['status' => [$refusal]]);
        }

        return new SocialPostResource($this->loaded($socialPost));
    }

    private function loaded(SocialPost $post): SocialPost
    {
        return $post->load(['subject', 'drafter', 'approver']);
    }
}
