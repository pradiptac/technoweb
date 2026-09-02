<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Concerns\WritesCmsEntities;
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
    use WritesCmsEntities;

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
        return new BlogPostResource($blogPost->load(['author', 'seo', 'categories']));
    }

    public function store(StoreBlogPostRequest $request): JsonResponse
    {
        $post = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());

            // Whoever is writing it, unless they said otherwise.
            $attributes['author_id'] ??= $request->user()->id;
            $attributes = $this->withPublishedAt($attributes);

            $categories = $attributes['category_ids'] ?? null;
            unset($attributes['category_ids']);

            $post = BlogPost::create($attributes);

            $this->syncCategories($post, $categories);
            $this->saveSeo($post, $seo);

            return $post;
        });

        return response()->json(
            ['data' => new BlogPostResource($post->load(['author', 'seo', 'categories']))],
            201
        );
    }

    public function update(UpdateBlogPostRequest $request, BlogPost $blogPost): JsonResource
    {
        DB::transaction(function () use ($request, $blogPost) {
            [$attributes, $seo] = $this->splitSeo($request->validated());

            // Changing the slug leaves a 301 behind automatically — see the
            // updating hook in the Sluggable trait.
            $categories = $attributes['category_ids'] ?? null;
            unset($attributes['category_ids']);

            $blogPost->update($this->withPublishedAt($attributes, $blogPost));

            $this->syncCategories($blogPost, $categories);
            $this->saveSeo($blogPost, $seo);
        });

        return new BlogPostResource($blogPost->fresh(['author', 'seo', 'categories']));
    }

    /**
     * Replace the categories, or leave them alone.
     *
     * `null` means the key was absent and nothing is touched; `[]` means the
     * editor unticked everything and is honoured. That is the rule every
     * repeating relation here follows — omitting a key leaves the relation,
     * sending an empty array clears it — and it has to be possible or the last
     * category could never be removed.
     */
    private function syncCategories(BlogPost $post, ?array $categoryIds): void
    {
        if ($categoryIds === null) {
            return;
        }

        $post->categories()->sync($categoryIds);
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
}
