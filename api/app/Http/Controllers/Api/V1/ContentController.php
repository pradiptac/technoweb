<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\MenuLocation;
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
use App\Models\Media;
use App\Models\Page;
use App\Models\Service;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\TicketCategory;
use App\Support\MenuTree;
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
        // `auth` says which sign-in methods are offered, never anything about
        // a credential. Both login screens are unauthenticated, so they cannot
        // render the right first step without it.
        $public = ['general', 'contact', 'social', 'homepage', 'analytics', 'consent', 'appearance', 'portal', 'auth'];

        $values = Setting::whereIn('group', $public)
            ->get()
            ->mapWithKeys(fn (Setting $s) => [$s->key => $s->value])
            ->filter(fn ($v) => $v !== null && $v !== '');

        $images = [
            'logo_path' => 'logo',
            'favicon_path' => 'favicon',
            'login_image_path' => 'login_image',
        ];

        /*
         * The natural dimensions travel with the URL, in one query for all
         * three.
         *
         * Without them the frontend has to guess an aspect ratio in order to
         * reserve space, and a guess is wrong by definition: the file is
         * whatever the client uploaded. The header guessed 180x40 for a mark
         * that is 600x81, so the box was 126px until the image arrived and
         * 207px afterwards — and the navigation beside it visibly jumped
         * right on every cold load.
         *
         * `withTrashed`, because deleting a media row fills the bin and
         * **keeps the bytes**: the path still serves, so the image still
         * renders and its dimensions are still the truth about it.
         *
         * A path with no media row behind it — typed by hand, or uploaded
         * before the library recorded dimensions — simply carries no numbers,
         * and the frontend falls back. That is a smaller layout shift than
         * a wrong ratio, not a correct reservation.
         */
        $dimensions = Media::withTrashed()
            ->whereIn('path', collect($images)->keys()
                ->filter(fn ($k) => $values->has($k))
                ->map(fn ($k) => $values[$k])
                ->all())
            ->get(['path', 'width', 'height'])
            ->keyBy('path');

        // Stored as paths, served as URLs — the same split the media library
        // and every cover image use. The path stays in the response so the
        // admin can round-trip it.
        foreach ($images as $path => $prefix) {
            if (! $values->has($path)) {
                continue;
            }

            $values[$prefix.'_url'] = asset('storage/'.$values[$path]);

            $file = $dimensions->get($values[$path]);

            if ($file?->width && $file?->height) {
                // Strings, like every other value in this map — it is a flat
                // key/value response and a caller reading one number as a
                // number and its neighbour as a string is a trap.
                $values[$prefix.'_width'] = (string) $file->width;
                $values[$prefix.'_height'] = (string) $file->height;
            }
        }

        return response()->json(['data' => $values]);
    }

    /**
     * The navigation for a place in the layout.
     *
     * **404 when nothing is assigned**, not an empty collection. The frontend
     * falls back to its built-in navigation on a 404, which is what keeps an
     * install that has never opened this screen working exactly as it does
     * today — the same shape as `/sliders/{slug}`, where an empty carousel is
     * a 404 so the homepage renders the NOC panel instead of two arrows that
     * do nothing.
     *
     * An assigned but *empty* menu is a real answer and comes back as `[]`:
     * somebody deliberately emptied the header.
     */
    public function menu(string $location): JsonResponse
    {
        if (MenuLocation::tryFrom($location) === null) {
            abort(404);
        }

        $items = MenuTree::forLocation($location);

        abort_if($items === null, 404);

        return response()->json(['data' => $items]);
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
