<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\PublishStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBlogPostRequest;
use App\Http\Requests\UpdateBlogPostRequest;
use App\Http\Resources\Admin\BlogPostResource;
use App\Models\BlogPost;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Blog CRUD for the CMS. Behind auth:sanctum + role:content_manager
 * (admins pass implicitly).
 */
class BlogPostController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $posts = BlogPost::query()
            ->with('author')
            // No published() scope here, unlike the public endpoint — drafts
            // are exactly what the editor came to see.
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('author_id'), fn ($q) => $q->where('author_id', $request->integer('author_id')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('title', 'like', "%{$term}%")
                    ->orWhere('excerpt', 'like', "%{$term}%"));
            })
            // Newest first, but drafts have no published_at and must not sink
            // below every published post — they are the ones needing work.
            ->orderByRaw('published_at IS NULL DESC')
            ->orderByDesc('published_at')
            ->orderByDesc('updated_at')
            ->paginate(min($request->integer('per_page', 20), 100))
            ->withQueryString();

        return BlogPostResource::collection($posts);
    }

    public function show(BlogPost $blogPost): JsonResource
    {
        return new BlogPostResource($blogPost->load(['author', 'seo']));
    }

    public function store(StoreBlogPostRequest $request): JsonResponse
    {
        $post = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->split($request->validated());

            // Whoever is writing it, unless they said otherwise.
            $attributes['author_id'] ??= $request->user()->id;
            $attributes = $this->withPublishedAt($attributes);

            $post = BlogPost::create($attributes);

            if ($seo !== null) {
                $post->seo()->updateOrCreate([], $seo);
            }

            return $post;
        });

        return response()->json(
            ['data' => new BlogPostResource($post->load(['author', 'seo']))],
            201
        );
    }

    public function update(UpdateBlogPostRequest $request, BlogPost $blogPost): JsonResource
    {
        DB::transaction(function () use ($request, $blogPost) {
            [$attributes, $seo] = $this->split($request->validated());

            // Changing the slug leaves a 301 behind automatically — see the
            // updating hook in the Sluggable trait.
            $blogPost->update($this->withPublishedAt($attributes, $blogPost));

            if ($seo !== null) {
                $blogPost->seo()->updateOrCreate([], $seo);
            }
        });

        return new BlogPostResource($blogPost->fresh(['author', 'seo']));
    }

    public function destroy(BlogPost $blogPost): JsonResponse
    {
        // The SEO row is polymorphic, so nothing cascades it for us.
        DB::transaction(function () use ($blogPost) {
            $blogPost->seo()->delete();
            $blogPost->delete();
        });

        return response()->json(['message' => 'Post deleted.']);
    }

    /**
     * Model attributes and the nested SEO override are validated together but
     * must be written separately: preventSilentlyDiscardingAttributes is on,
     * so passing `seo` to update() would throw rather than be ignored.
     *
     * @return array{0: array<string, mixed>, 1: array<string, mixed>|null}
     */
    private function split(array $validated): array
    {
        $seo = $validated['seo'] ?? null;
        unset($validated['seo']);

        return [$validated, $seo];
    }

    /**
     * Publishing without naming a date means "now". Without this an editor
     * hits Publish, the post is status=published with a null published_at,
     * and the public scopePublished filters it straight back out — it would
     * look like publishing silently failed.
     */
    private function withPublishedAt(array $attributes, ?BlogPost $existing = null): array
    {
        $status = $attributes['status'] ?? $existing?->status?->value;

        $becomingPublished = $status instanceof PublishStatus
            ? $status === PublishStatus::Published
            : $status === PublishStatus::Published->value;

        if ($becomingPublished
            && empty($attributes['published_at'])
            && $existing?->published_at === null) {
            $attributes['published_at'] = now();
        }

        return $attributes;
    }
}
