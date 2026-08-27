<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\LandingPageKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\LandingPageRequest;
use App\Http\Resources\Admin\LandingPageResource;
use App\Models\Faq;
use App\Models\LandingPage;
use App\Support\LandingPageOpportunities;
use App\Support\LandingPageQuality;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Programmatic landing pages. Behind auth:sanctum + role:seo_manager.
 *
 * **`seo_manager`, not `content_manager`.** These are not content decisions —
 * a landing page is a decision about which queries the site competes for, and
 * getting it wrong costs the ranking of pages nobody touched. The role that
 * already owns the redirects table and the SEO overview is the one that should
 * own this.
 *
 * Every index and show loads the other pages' intros once and hands them to the
 * resource, because judging a page means comparing it against all of them and
 * a resource left to fetch its own would do that per row.
 */
class LandingPageController extends Controller
{
    public function index(Request $request)
    {
        $pages = LandingPage::query()
            ->withContext()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->string('kind')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('title', 'like', "%{$term}%")->orWhere('path', 'like', "%{$term}%"));
            })
            // Drafts first: a published page is finished and a draft is a
            // question waiting for somebody, which is what a work list is for.
            ->orderByRaw("field(status, 'draft', 'published', 'archived')")
            ->orderByDesc('updated_at')
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        LandingPageResource::compareAgainst($this->comparisonSet());

        return LandingPageResource::collection($pages)->additional(['meta' => [
            'cap' => LandingPageQuality::publishedCap(),
            'published' => LandingPage::query()->published()->count(),
            'kinds' => array_map(
                fn (LandingPageKind $k) => ['value' => $k->value, 'label' => $k->label()],
                LandingPageKind::cases(),
            ),
        ]]);
    }

    public function show(LandingPage $landingPage): JsonResponse
    {
        $landingPage->loadMissing(['brand', 'category', 'solution', 'service', 'location', 'seo', 'faqs']);

        LandingPageResource::compareAgainst($this->comparisonSet());

        return response()->json([
            'data' => (new LandingPageResource($landingPage))->toArray(request()),
        ]);
    }

    /**
     * What the catalogue would support that does not exist yet.
     *
     * The screen this feeds is the one an editor uses instead of inventing
     * combinations, which is the whole safety argument: they are choosing from
     * a list the data produced rather than typing a brand and a city into a
     * form. `skipped` is returned alongside because "no opportunities" from a
     * console listing three cities reads as a broken feature when the real
     * answer is that nobody has written the local detail yet.
     */
    public function opportunities(Request $request): JsonResponse
    {
        $kind = LandingPageKind::tryFrom((string) $request->string('kind'));

        return response()->json([
            'data' => LandingPageOpportunities::find($kind),
            'meta' => [
                'skipped_locations' => LandingPageOpportunities::skippedLocations(),
                'min_products' => LandingPageQuality::MIN_PRODUCTS,
                'cap' => LandingPageQuality::publishedCap(),
                'published' => LandingPage::query()->published()->count(),
            ],
        ]);
    }

    public function store(LandingPageRequest $request): JsonResponse
    {
        $data = $request->validated();
        $page = new LandingPage($this->columns($data));
        $page->auto_generated = false;
        $page->save();

        $this->writeRelations($page, $data);

        LandingPageResource::compareAgainst($this->comparisonSet());

        return response()->json([
            'data' => (new LandingPageResource($page->fresh()->loadMissing(['brand', 'category', 'solution', 'service', 'location', 'seo', 'faqs'])))->toArray($request),
        ], 201);
    }

    public function update(LandingPageRequest $request, LandingPage $landingPage): JsonResponse
    {
        $data = $request->validated();
        $landingPage->fill($this->columns($data));

        $landingPage->save();
        $this->writeRelations($landingPage, $data);

        LandingPageResource::compareAgainst($this->comparisonSet());

        return response()->json([
            'data' => (new LandingPageResource($landingPage->fresh()->loadMissing(['brand', 'category', 'solution', 'service', 'location', 'seo', 'faqs'])))->toArray($request),
        ]);
    }

    public function destroy(LandingPage $landingPage): JsonResponse
    {
        $landingPage->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    /* ------------------------------------------------------------ plumbing */

    /** Columns only — `seo` and `faqs` are relations and would throw. */
    private function columns(array $data): array
    {
        return array_intersect_key($data, array_flip([
            'kind', 'brand_id', 'product_category_id', 'solution_id', 'service_id',
            'location_id', 'title', 'heading', 'intro', 'body', 'status',
        ]));
    }

    /**
     * `preventSilentlyDiscardingAttributes` is on, so the nested keys have to
     * be split off the payload rather than passed through to `update()`.
     * Repeating fields are replaced wholesale, the rule every other entity
     * follows: omitting the key leaves them alone, sending `[]` clears them.
     */
    private function writeRelations(LandingPage $page, array $data): void
    {
        if (array_key_exists('seo', $data)) {
            $page->seo()->updateOrCreate([], $data['seo'] ?? []);
        }

        if (array_key_exists('faqs', $data)) {
            $page->faqs()->delete();

            foreach ($data['faqs'] ?? [] as $i => $faq) {
                $page->faqs()->save(new Faq([
                    'question' => $faq['question'],
                    'answer' => $faq['answer'],
                    'sort_order' => $i,
                ]));
            }
        }
    }

    /**
     * Every other page's intro, for the duplicate check.
     *
     * Three columns rather than the whole row: this is compared against, never
     * rendered, and a landing page's body can be a hundred kilobytes.
     */
    private function comparisonSet()
    {
        return LandingPage::query()->whereNotNull('intro')->get(['id', 'title', 'intro']);
    }
}
