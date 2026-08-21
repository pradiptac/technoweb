<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreKnowledgeArticleRequest;
use App\Http\Requests\UpdateKnowledgeArticleRequest;
use App\Http\Resources\Admin\KnowledgeArticleResource;
use App\Models\KnowledgeArticle;
use App\Models\KnowledgeCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Knowledge-base CRUD. Behind auth:sanctum + role:content_manager.
 */
class KnowledgeArticleController extends Controller
{
    use WritesCmsEntities;

    public function index(Request $request): AnonymousResourceCollection
    {
        $articles = KnowledgeArticle::query()
            ->with('category')
            // Drafts included, unlike the public endpoint.
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when(
                $request->filled('knowledge_category_id'),
                fn ($q) => $q->where('knowledge_category_id', $request->integer('knowledge_category_id'))
            )
            // Reuses the model's own search scope, so the CMS finds an article
            // exactly the way a customer would — tags and hyphen-insensitive
            // titles included.
            ->when($request->filled('q'), fn ($q) => $q->search($request->string('q')->value()))
            ->orderByRaw('published_at IS NULL DESC')
            ->orderByDesc('published_at')
            ->orderByDesc('updated_at')
            ->paginate(min($request->integer('per_page', 20), 100))
            ->withQueryString();

        return KnowledgeArticleResource::collection($articles);
    }

    /** Categories for the picker. Small, fixed list — no pagination. */
    public function categories(): JsonResponse
    {
        return response()->json([
            'data' => KnowledgeCategory::orderBy('sort_order')->orderBy('name')
                ->get(['id', 'name', 'slug']),
        ]);
    }

    public function show(KnowledgeArticle $knowledgeArticle): JsonResource
    {
        return new KnowledgeArticleResource($knowledgeArticle->load(['category', 'seo']));
    }

    public function store(StoreKnowledgeArticleRequest $request): JsonResponse
    {
        $article = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());

            $article = KnowledgeArticle::create($this->withPublishedAt($attributes));

            $this->saveSeo($article, $seo);

            return $article;
        });

        return response()->json(
            ['data' => new KnowledgeArticleResource($article->load(['category', 'seo']))],
            201
        );
    }

    public function update(UpdateKnowledgeArticleRequest $request, KnowledgeArticle $knowledgeArticle): JsonResource
    {
        DB::transaction(function () use ($request, $knowledgeArticle) {
            [$attributes, $seo] = $this->splitSeo($request->validated());

            $knowledgeArticle->update($this->withPublishedAt($attributes, $knowledgeArticle));

            $this->saveSeo($knowledgeArticle, $seo);
        });

        return new KnowledgeArticleResource($knowledgeArticle->fresh(['category', 'seo']));
    }

    public function destroy(KnowledgeArticle $knowledgeArticle): JsonResponse
    {
        DB::transaction(function () use ($knowledgeArticle) {
            $knowledgeArticle->seo()->delete();
            $knowledgeArticle->delete();
        });

        return response()->json(['message' => 'Article deleted.']);
    }
}
