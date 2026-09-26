<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBlogPostRequest;
use App\Http\Requests\UpdateBlogPostRequest;
use App\Http\Resources\Admin\BlogPostResource;
use App\Models\BlogPost;
use App\Support\CustomFields\CustomFields;
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

        // Sent by the API, never listed in TypeScript: the console's kind
        // select is built from this, the `meta.transitions` rule.
        return BlogPostResource::collection($posts)->additional(['meta' => [
            'answer_block_kinds' => AnswerBlockKind::options(),
            // The custom field groups that apply, for the console's Fields tab.
            'custom_field_groups' => CustomFields::definitions('blog_post'),
        ]]);
    }

    public function show(BlogPost $blogPost): JsonResource
    {
        return new BlogPostResource($blogPost->load(['author', 'seo', 'categories', 'faqs', 'answerBlocks', 'customValues.field.group']));
    }

    public function store(StoreBlogPostRequest $request): JsonResponse
    {
        $post = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);

            // Whoever is writing it, unless they said otherwise.
            $attributes['author_id'] ??= $request->user()->id;
            $attributes = $this->withPublishedAt($attributes);

            $categories = $attributes['category_ids'] ?? null;
            unset($attributes['category_ids']);
            $content = $this->pullAnswerContent($attributes);

            $post = BlogPost::create($attributes);

            $this->syncCategories($post, $categories);
            $this->saveAnswerContent($post, $content);
            $this->saveSeo($post, $seo);
            $this->saveCustomFields($post, $custom);

            return $post;
        });

        return response()->json(
            ['data' => new BlogPostResource($post->load(['author', 'seo', 'categories', 'faqs', 'answerBlocks', 'customValues.field.group']))],
            201
        );
    }

    public function update(UpdateBlogPostRequest $request, BlogPost $blogPost): JsonResource
    {
        DB::transaction(function () use ($request, $blogPost) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);

            // Changing the slug leaves a 301 behind automatically — see the
            // updating hook in the Sluggable trait.
            $categories = $attributes['category_ids'] ?? null;
            unset($attributes['category_ids']);
            $content = $this->pullAnswerContent($attributes);

            $blogPost->update($this->withPublishedAt($attributes, $blogPost));

            $this->syncCategories($blogPost, $categories);
            $this->saveAnswerContent($blogPost, $content);
            $this->saveSeo($blogPost, $seo);
            $this->saveCustomFields($blogPost, $custom);
        });

        return new BlogPostResource($blogPost->fresh(['author', 'seo', 'categories', 'faqs', 'answerBlocks', 'customValues.field.group']));
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
            $blogPost->faqs()->delete();
            $blogPost->answerBlocks()->delete();
            $blogPost->delete();
        });

        return response()->json(['message' => 'Post deleted.']);
    }
}
