<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\CommentStatus;
use App\Http\Controllers\Controller;
use App\Models\BlogComment;
use App\Support\PaginatedEnvelope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The moderation queue.
 *
 * **`role:content_manager`.** Unlike leads or chat transcripts this is content:
 * comments are published on the blog beside the articles the same person wrote,
 * and deciding what appears there is the same job as deciding what the article
 * says. The blast-radius argument that put leads behind `sales_manager` does not
 * apply — a comment holds a name, an address and some public prose, and the
 * address never leaves this screen.
 *
 * Moderation is done in batches or it is not done at all, so the bulk action is
 * the primary control rather than a convenience: two hundred rows one at a time
 * is a queue nobody empties.
 */
class BlogCommentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = BlogComment::query()
            ->with(['post:id,title,slug'])
            /*
             * Waiting by default.
             *
             * This screen exists to be emptied. Opening on everything ever
             * posted would bury the handful that need a decision under a year
             * of published ones — the argument `/admin/seo`'s `?issues=1` makes.
             */
            ->when(
                $request->filled('status'),
                fn ($q) => $q->where('status', $request->string('status')),
                fn ($q) => $q->where('status', CommentStatus::Pending),
            )
            ->when($request->filled('post'), fn ($q) => $q->where('blog_post_id', $request->integer('post')))
            ->when($request->filled('q'), fn ($q) => $q->where(
                fn ($w) => $w->where('body', 'like', '%'.$request->string('q').'%')
                    ->orWhere('author_name', 'like', '%'.$request->string('q').'%')
                    ->orWhere('author_email', 'like', '%'.$request->string('q').'%')
            ))
            ->latest('id')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        $rows->getCollection()->transform(fn (BlogComment $c) => [
            'id' => $c->id,
            'post' => $c->post ? ['id' => $c->post->id, 'title' => $c->post->title, 'slug' => $c->post->slug] : null,
            'parent_id' => $c->parent_id,
            'author_name' => $c->author_name,
            // Shown here and nowhere public: a moderator needs it to recognise a
            // repeat spammer, and a reader has no business with it.
            'author_email' => $c->author_email,
            'is_customer' => $c->customer_id !== null,
            'body' => $c->body,
            'status' => $c->status->value,
            'status_label' => $c->status->label(),
            'score' => $c->score,
            // The working, so a number never appears without it.
            'score_reasons' => $c->score_reasons,
            'created_at' => $c->created_at?->toIso8601String(),
        ]);

        return response()->json(PaginatedEnvelope::from($rows, [
            'statuses' => CommentStatus::options(),
            'waiting' => BlogComment::waiting()->count(),
        ]));
    }

    /**
     * Move one or many comments.
     *
     * A single endpoint for both, because a bulk action that is a different
     * code path from the single one is two rules about what a status change
     * does — and the drift is silent. The console sends one id or fifty
     * through the same door.
     */
    public function moderate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer'],
            'status' => ['required', 'string'],
        ]);

        $status = CommentStatus::tryFrom($data['status']);

        if ($status === null) {
            return response()->json(['message' => 'That is not a status a comment can have.'], 422);
        }

        $moved = 0;

        /*
         * One at a time, deliberately.
         *
         * A mass `update()` skips model events and, more to the point here,
         * skips `moveTo()` — which is where `approved_at` and `approved_by` are
         * stamped. Fast and wrong here is a queue of comments that were
         * approved by nobody at no time, which is the column somebody reads to
         * answer "who let that through". Same reasoning as the CV prune and the
         * landing-page repath.
         */
        foreach (BlogComment::whereIn('id', $data['ids'])->get() as $comment) {
            if ($comment->status->canTransitionTo($status)) {
                $comment->moveTo($status, $request->user());
                $moved++;
            }
        }

        return response()->json(['data' => ['moved' => $moved, 'waiting' => BlogComment::waiting()->count()]]);
    }

    /**
     * Delete for good.
     *
     * Separate from `trash`, which is the reversible one. This exists because
     * spam is genuinely worth removing rather than keeping for ever, and
     * because a comment can contain something that must not sit in a database —
     * which is a request nobody should have to answer with a database client.
     */
    public function destroy(BlogComment $comment): JsonResponse
    {
        $comment->delete();

        return response()->json(null, 204);
    }
}
