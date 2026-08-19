<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\BlogPostResource;
use App\Http\Resources\CaseStudyResource;
use App\Http\Resources\IndustryResource;
use App\Http\Resources\KnowledgeArticleResource;
use App\Http\Resources\ServiceResource;
use App\Http\Resources\SolutionResource;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Service;
use App\Models\TicketCategory;
use App\Models\Solution;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

class ContentController extends Controller
{
    public function solutions(): AnonymousResourceCollection
    {
        return SolutionResource::collection(
            Solution::published()->orderBy('sort_order')->get()
        );
    }

    public function solution(Solution $solution): JsonResource
    {
        abort_unless($solution->status?->value === 'published', 404);

        $solution->load(['products.brand', 'industries', 'faqs', 'seo']);

        return new SolutionResource($solution);
    }

    public function services(): AnonymousResourceCollection
    {
        return ServiceResource::collection(
            Service::published()->orderBy('sort_order')->get()
        );
    }

    public function service(Service $service): JsonResource
    {
        abort_unless($service->status?->value === 'published', 404);

        $service->load(['faqs', 'seo']);

        return new ServiceResource($service);
    }

    public function industries(): AnonymousResourceCollection
    {
        return IndustryResource::collection(Industry::orderBy('sort_order')->get());
    }

    public function industry(Industry $industry): JsonResource
    {
        $industry->load(['solutions', 'seo']);

        return new IndustryResource($industry);
    }

    public function posts(Request $request): AnonymousResourceCollection
    {
        $posts = BlogPost::published()
            ->with('author')
            ->orderByDesc('published_at')
            ->paginate(min($request->integer('per_page', 12), 50));

        return BlogPostResource::collection($posts);
    }

    public function post(BlogPost $post): JsonResource
    {
        abort_unless($post->status?->value === 'published', 404);

        $post->load(['author', 'seo']);

        return new BlogPostResource($post);
    }

    public function caseStudies(): AnonymousResourceCollection
    {
        return CaseStudyResource::collection(
            CaseStudy::published()->with('industry')->latest()->get()
        );
    }

    public function caseStudy(CaseStudy $caseStudy): JsonResource
    {
        abort_unless($caseStudy->status?->value === 'published', 404);

        $caseStudy->load(['industry', 'seo']);

        return new CaseStudyResource($caseStudy);
    }

    /**
     * Reference data for the "raise a ticket" form. Public because the form is
     * rendered before the customer's session is checked, and the list contains
     * nothing sensitive.
     */
    public function ticketCategories(): JsonResponse
    {
        $categories = TicketCategory::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get(['id', 'name', 'default_sla_hours']);

        return response()->json(['data' => $categories]);
    }

    public function knowledgeArticles(Request $request): AnonymousResourceCollection
    {
        $articles = KnowledgeArticle::published()
            ->with('category')
            ->search($request->string('q')->value() ?: null)
            ->when($request->filled('category'), fn ($q) => $q->whereHas(
                'category', fn ($c) => $c->where('slug', $request->string('category'))
            ))
            ->orderByDesc('helpful_count')
            ->paginate(min($request->integer('per_page', 20), 50));

        return KnowledgeArticleResource::collection($articles);
    }

    public function knowledgeArticle(KnowledgeArticle $article): JsonResource
    {
        abort_unless($article->status?->value === 'published', 404);

        $article->increment('view_count');
        $article->load(['category', 'seo']);

        return new KnowledgeArticleResource($article);
    }
}
