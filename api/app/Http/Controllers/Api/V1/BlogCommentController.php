<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BlogComment;
use App\Models\BlogPost;
use App\Models\Customer;
use App\Notifications\CommentAwaitingModeration;
use App\Support\Blog\Comments;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reading and writing comments on a published post.
 *
 * The public half of `docs/blog-comments-plan.md`.
 */
class BlogCommentController extends Controller
{
    /**
     * Approved comments on a post, oldest first.
     *
     * Oldest first because this is a conversation: newest-first reads as a
     * feed, and a reply then appears above the thing it replies to.
     */
    public function index(string $slug): JsonResponse
    {
        $post = BlogPost::published()->where('slug', $slug)->firstOrFail();

        $comments = BlogComment::approved()
            ->where('blog_post_id', $post->id)
            ->whereNull('parent_id')
            ->with(['replies' => fn ($q) => $q->approved()])
            ->oldest('id')
            ->get();

        return response()->json([
            'data' => $comments->map(fn (BlogComment $c) => self::shape($c))->all(),
            'meta' => [
                'open' => Comments::openOn($post),
                // Replies included, because "3 comments" under a thread of one
                // comment and two replies is what a reader counts.
                'total' => BlogComment::approved()->where('blog_post_id', $post->id)->count(),
            ],
        ]);
    }

    /**
     * Leave a comment.
     *
     * **Answers 202 and one sentence for everything it accepts**, including a
     * submission the honeypot caught, which stores nothing. Telling a bot it
     * was caught tells it what to change — the rule `/auth/register` and the
     * contact form already follow.
     */
    public function store(Request $request, string $slug): JsonResponse
    {
        $post = BlogPost::published()->where('slug', $slug)->firstOrFail();

        if (! Comments::openOn($post)) {
            /*
             * Checked here and not only in the frontend.
             *
             * A tab left open across the day comments were closed would
             * otherwise post into a discussion that has ended — the same
             * reasoning that makes a closed vacancy refuse an application
             * rather than merely hiding itself.
             */
            return response()->json(['message' => 'Comments are closed on this post.'], 422);
        }

        $data = $request->validate([
            'author_name' => ['required', 'string', 'min:2', 'max:120'],
            /*
             * No `email:dns`. It is a DNS lookup on the request path, and this
             * project has measured what an uncontrolled network call there
             * costs once already at 12.5 seconds.
             */
            'author_email' => ['required', 'string', 'email:rfc', 'max:190'],
            'body' => ['required', 'string', 'min:2', 'max:5000'],
            'parent_id' => ['nullable', 'integer'],
            'seconds_on_page' => ['nullable', 'integer', 'min:0', 'max:86400'],
            // The honeypot, matching every other public form in the product.
            'website' => ['nullable', 'string', 'max:255'],
        ]);

        $accepted = 'Thank you. Your comment will appear once it has been read.';

        if (filled($data['website'] ?? null)) {
            // The ordinary success response, and nothing stored.
            return response()->json(['message' => $accepted], 202);
        }

        $comment = Comments::record(
            $post,
            $data,
            $this->customer($request),
            $request->ip(),
            $request->userAgent(),
        );

        /*
         * The desk is told, and a failure here never fails the comment.
         *
         * `Notifier::route` reads the address from settings and logs-and-swallows
         * a send failure: the comment is already committed, and
         * telling somebody their comment failed while it sits in the queue is
         * how you get it posted four more times.
         */
        if (CommentAwaitingModeration::shouldSend()) {
            Notifier::route('support_email', new CommentAwaitingModeration($comment));
        }

        return response()->json(['message' => $accepted], 202);
    }

    /**
     * What a comment looks like publicly.
     *
     * **The email address never appears**, and neither does the score, the IP
     * hash or the user agent. An address published beside a comment is an
     * address harvested from the page, and the rest is moderation working that
     * is nobody else's business. Structural, rather than a field somebody has
     * to remember to strip — the lesson the ticket module's internal notes
     * taught.
     *
     * @return array<string, mixed>
     */
    private static function shape(BlogComment $c): array
    {
        return [
            'id' => $c->id,
            'author_name' => $c->author_name,
            'body' => $c->body,
            'created_at' => $c->created_at?->toIso8601String(),
            'replies' => $c->relationLoaded('replies')
                ? $c->replies->map(fn (BlogComment $r) => self::shape($r))->all()
                : [],
        ];
    }

    /**
     * The signed-in customer, when the caller happens to be one.
     *
     * This route carries **no auth middleware** and must not: commenting is
     * open to a reader with no account, which is most of them. So the guard is
     * resolved by hand — Sanctum reads the bearer token if one was sent and
     * answers null if it was not — and the result is narrowed to a `Customer`,
     * because a staff token reaching this would be a `User` and
     * `Comments::record` correctly refuses to take one.
     *
     * `$request->user()` alone is always null here, which is worth stating: it
     * reads the *default* guard, and on a route outside `auth:sanctum` nothing
     * has ever resolved it. Written that way first, the customer link, the
     * name and address override and the `account` scoring signal were all dead
     * code that read as working — and nothing failed, because a comment from a
     * signed-in reader is stored perfectly well without them.
     */
    private function customer(Request $request): ?Customer
    {
        $user = $request->user('sanctum');

        return $user instanceof Customer ? $user : null;
    }
}
