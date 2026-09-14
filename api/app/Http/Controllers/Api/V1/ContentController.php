<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\MenuLocation;
use App\Http\Controllers\Controller;
use App\Http\Resources\BlogCategoryResource;
use App\Http\Resources\BlogPostResource;
use App\Http\Resources\CaseStudyResource;
use App\Http\Resources\IndustryResource;
use App\Http\Resources\KnowledgeArticleResource;
use App\Http\Resources\PageResource;
use App\Http\Resources\PageSummaryResource;
use App\Http\Resources\ServiceResource;
use App\Http\Resources\SolutionResource;
use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Service;
use App\Models\Solution;
use App\Models\TicketCategory;
use App\Support\MenuTree;
use App\Support\PublicSettings;
use Carbon\Carbon;
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

    /**
     * The blog listing: search, category, archive month.
     *
     * Every filter is optional and they compose, because the sidebar offers
     * all three at once and somebody will use two of them. An unknown category
     * slug returns an empty page rather than a 422 — it arrives from a link,
     * and a stale bookmark should show nothing rather than an error, the rule
     * `?sort=` and `?check=` already follow.
     */
    public function posts(Request $request): AnonymousResourceCollection
    {
        $posts = BlogPost::published()
            ->with(['author', 'categories'])
            ->when(
                filled($request->query('q')),
                fn ($query) => $query->search((string) $request->query('q')),
            )
            ->when(
                filled($request->query('category')),
                fn ($query) => $query->whereHas(
                    'categories',
                    fn ($c) => $c->where('slug', $request->query('category')),
                ),
            )
            /*
             * The archive. Ranged on `published_at` and never `created_at`:
             * one is when the row was written and the other is when the piece
             * was published, and an archive is read against the second — the
             * same distinction the sales report had to be taught.
             */
            ->when(
                $request->filled('year'),
                fn ($query) => $query->whereYear('published_at', $request->integer('year')),
            )
            ->when(
                $request->filled('month'),
                fn ($query) => $query->whereMonth('published_at', $request->integer('month')),
            )
            /*
             * Newest first, unless somebody asks for the other end.
             *
             * `?order=oldest` exists for the blog's "you may have missed" row,
             * which wants the articles furthest from the front page. The
             * alternative was a random selection, and random is not
             * reproducible: the row would change on every render, so a reader
             * who saw something and scrolled back could not find it again.
             *
             * An unrecognised value falls back to newest rather than
             * returning 422 — it arrives from a link, and the listing's own
             * order is a better answer than an error page. The rule `?sort=`
             * already follows.
             */
            ->orderBy('published_at', $request->query('order') === 'oldest' ? 'asc' : 'desc')
            ->paginate(min($request->integer('per_page', 12), 50));

        return BlogPostResource::collection($posts);
    }

    /**
     * The featured posts, for the hero.
     *
     * **Falls back to the latest when nothing is ticked**, so a fresh install
     * renders a hero rather than a gap — the same shape as the homepage
     * leaving its NOC panel in place when no slider is assigned. Featured
     * first and newest within that, so ticking one is enough to promote it
     * without also having to un-tick another.
     */
    public function featuredPosts(Request $request): AnonymousResourceCollection
    {
        $posts = BlogPost::published()
            ->with(['author', 'categories'])
            ->orderByDesc('is_featured')
            ->orderByDesc('published_at')
            ->limit(min($request->integer('limit', 4), 10))
            ->get();

        return BlogPostResource::collection($posts);
    }

    /**
     * What the sidebar is built from: categories with counts, and the archive.
     *
     * Its own endpoint rather than `meta` on the listing, for a reason this
     * project has already written down: **a search response must never be
     * ISR-cached**, because `?q=` has an unbounded key space. Hanging the
     * sidebar off that response would make every search fetch it uncached too,
     * and the sidebar is the part that changes least.
     *
     * An empty category is omitted. The count and the listing it links to are
     * the same query, so a row reading eight cannot open a page of five — the
     * rule the store's out-of-stock tile follows.
     */
    public function blogTaxonomy(): JsonResponse
    {
        // Filtered in SQL: a category with nothing published in it is not
        // fetched at all, the way `/store/categories` already does it.
        $categories = BlogCategory::query()
            ->withCount('publishedPosts')
            ->having('published_posts_count', '>', 0)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        /*
         * Grouped in SQL rather than by loading every post and counting in
         * PHP: this is a sidebar on a cached endpoint, and the number of
         * published posts is the one thing here that grows without limit.
         */
        $archive = BlogPost::published()
            ->selectRaw('YEAR(published_at) as year, MONTH(published_at) as month, COUNT(*) as total')
            ->groupByRaw('YEAR(published_at), MONTH(published_at)')
            ->orderByRaw('YEAR(published_at) DESC, MONTH(published_at) DESC')
            ->get()
            ->map(fn ($row) => [
                'year' => (int) $row->year,
                'month' => (int) $row->month,
                // Formatted here so the frontend does not build a date from
                // two integers and get the month names from a second list.
                'label' => Carbon::create((int) $row->year, (int) $row->month, 1)->format('F Y'),
                'total' => (int) $row->total,
            ]);

        return response()->json([
            'data' => [
                'categories' => BlogCategoryResource::collection($categories)->resolve(),
                'archive' => $archive,
            ],
        ]);
    }

    public function post(BlogPost $post): JsonResource
    {
        abort_unless($post->status?->value === 'published', 404);

        $post->load(['author', 'seo', 'categories']);

        // The older and the newer post, for the foot of the article. Set as
        // relations so the resource's `whenLoaded` gates them the way it
        // gates everything else a detail read carries and a listing does not.
        foreach ($post->neighbours() as $side => $neighbour) {
            $post->setRelation($side, $neighbour);
        }

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
    /**
     * Site settings, whitelisted by group — see `App\Support\PublicSettings`
     * for the list and the exceptions, and API.md for why each is public.
     */
    public function settings(): JsonResponse
    {
        return response()->json(['data' => PublicSettings::build()]);
    }

    /**
     * The navigation for a place in the layout.
     *
     * **`{data: null}` when nothing is assigned**, not an empty collection
     * and not a 404. The frontend falls back to its built-in navigation on
     * null, which is what keeps an install that has never opened this screen
     * working exactly as it does today.
     *
     * It *was* a 404, on the argument that a 404 is what `/sliders/{slug}`
     * answers for an empty carousel — and the argument was fine and the
     * status was not: Next's data cache stores only a 200, so on an install
     * with nothing assigned the four menu fetches in the marketing layout
     * were live round trips on every render, for the rest of the install's
     * life, to be told "nothing" four times. A null inside a 200 is cached
     * for the ISR window like any other answer, and says the same thing.
     *
     * An unknown *location* is still a 404: that is a caller's mistake, not
     * a state of the site. An assigned but *empty* menu is a real answer and
     * comes back as `[]`: somebody deliberately emptied the header.
     */
    public function menu(string $location): JsonResponse
    {
        if (MenuLocation::tryFrom($location) === null) {
            abort(404);
        }

        return response()->json(['data' => MenuTree::forLocation($location)]);
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
