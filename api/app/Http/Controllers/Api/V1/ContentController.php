<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\BlogPostResource;
use App\Http\Resources\CaseStudyResource;
use App\Http\Resources\IndustryResource;
use App\Http\Resources\KnowledgeArticleResource;
use App\Http\Resources\PageResource;
use App\Http\Resources\PageSummaryResource;
use App\Http\Resources\ServiceResource;
use App\Http\Resources\SolutionResource;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Service;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\TicketCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

class ContentController extends Controller
{
    /*
     * `?in_menu=1` narrows an index to what the mega menu may show.
     *
     * A filter rather than a second endpoint, because it is the same list
     * answering a narrower question -- and the index pages must keep returning
     * everything. "Published" and "in the navigation" are different questions:
     * a live solution can be deliberately kept out of the menu, which is the
     * whole point of the flag.
     */
    public function solutions(Request $request): AnonymousResourceCollection
    {
        return SolutionResource::collection(
            Solution::published()->with('seo')
                ->when($request->boolean('in_menu'), fn ($q) => $q->where('show_in_menu', true))
                ->orderBy('sort_order')->get()
        );
    }

    public function solution(Solution $solution): JsonResource
    {
        abort_unless($solution->status?->value === 'published', 404);

        // `locations` feeds `areaServed` in the structured data. Named here
        // because preventLazyLoading is on outside production, so a relation
        // the resource reads and the controller forgot is a 500, not a query.
        $solution->load(['products.brand', 'industries', 'faqs', 'seo', 'locations']);

        return (new SolutionResource($solution))->withSchema();
    }

    public function services(Request $request): AnonymousResourceCollection
    {
        return ServiceResource::collection(
            Service::published()->with('seo')
                ->when($request->boolean('in_menu'), fn ($q) => $q->where('show_in_menu', true))
                ->orderBy('sort_order')->get()
        );
    }

    public function service(Service $service): JsonResource
    {
        abort_unless($service->status?->value === 'published', 404);

        $service->load(['faqs', 'seo', 'locations']);

        return (new ServiceResource($service))->withSchema();
    }

    public function industries(Request $request): AnonymousResourceCollection
    {
        return IndustryResource::collection(
            Industry::with('seo')
                ->when($request->boolean('in_menu'), fn ($q) => $q->where('show_in_menu', true))
                ->orderBy('sort_order')->get()
        );
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

        return (new BlogPostResource($post))->withSchema();
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

        return (new CaseStudyResource($caseStudy))->withSchema();
    }

    /**
     * Reference data for the "raise a ticket" form. Public because the form is
     * rendered before the customer's session is checked, and the list contains
     * nothing sensitive.
     */
    /**
     * Site settings the public frontend needs — social links, contact details,
     * company name.
     *
     * Whitelisted by group rather than returned wholesale. Settings is a
     * key/value table that will accumulate operational values over time, and
     * "everything not marked secret" is the wrong default for an endpoint with
     * no authentication in front of it.
     */
    public function settings(): JsonResponse
    {
        // mail and integrations are deliberately absent: they hold the SMTP
        // credentials and the API key, and this endpoint has no authentication
        // in front of it.
        $public = ['general', 'contact', 'social', 'homepage', 'analytics', 'consent', 'appearance', 'portal'];

        $values = Setting::whereIn('group', $public)
            ->get()
            ->mapWithKeys(fn (Setting $s) => [$s->key => $s->value])
            ->filter(fn ($v) => $v !== null && $v !== '');

        // Stored as paths, served as URLs — the same split the media library
        // and every cover image use. The path stays in the response so the
        // admin can round-trip it.
        foreach ([
            'logo_path' => 'logo_url',
            'favicon_path' => 'favicon_url',
            'login_image_path' => 'login_image_url',
        ] as $path => $url) {
            if ($values->has($path)) {
                $values[$url] = asset('storage/'.$values[$path]);
            }
        }

        return response()->json(['data' => $values]);
    }

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

    /**
     * A standalone page — privacy, terms, downloads. Slug-bound, so the
     * frontend can resolve any unmatched top-level path against it.
     */
    /**
     * Every published page, without bodies.
     *
     * Only the sitemap asks for this: /privacy, /terms and /downloads are CMS
     * rows, so there was no way to discover them and all three were missing
     * from sitemap.xml along with anything an editor adds later. Eager-loads
     * seo because the sitemap honours each page's sitemap_include, and
     * preventLazyLoading would throw on it otherwise.
     */
    public function pages(): AnonymousResourceCollection
    {
        return PageSummaryResource::collection(
            Page::published()->with('seo')->orderBy('slug')->get()
        );
    }

    public function page(Page $page): JsonResource
    {
        abort_unless($page->status?->value === 'published', 404);

        $page->load(['faqs', 'seo']);

        return new PageResource($page);
    }

    public function knowledgeArticle(KnowledgeArticle $article): JsonResource
    {
        abort_unless($article->status?->value === 'published', 404);

        $article->increment('view_count');
        $article->load(['category', 'seo']);

        return (new KnowledgeArticleResource($article))->withSchema();
    }
}
