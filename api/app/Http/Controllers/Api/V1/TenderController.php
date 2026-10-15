<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\TenderDetailResource;
use App\Http\Resources\TenderResource;
use App\Models\Tender;
use App\Models\TenderCategory;
use App\Support\Tenders\TenderDocuments;
use App\Support\Tenders\TenderWindow;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Tenders, as the public site reads them (0.174.0, docs/tenders.md).
 *
 * Four routes: the list, the categories, the notice, and its state. Nothing
 * writes — a tender is a notice, and a bid is not submitted here.
 *
 * **The state route exists because the notice's page is cached.** A detail
 * page is in the ISR cache, so the badge it renders is the state when it was
 * rendered; the page re-asks this, uncached, after it mounts. Without it a
 * cached page would tell a bidder that a tender which shut yesterday is
 * still open.
 */
class TenderController extends Controller
{
    /**
     * Published tenders, open ones first.
     *
     * The order is the one a bidder wants: what can still be bid on, closing
     * soonest — a deadline is only useful in that order — then what has
     * closed, most recently first. It ends on `id`, so a page boundary
     * cannot show one row twice and hide another.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $term = trim($request->string('q')->value());
        // An unknown value is ignored rather than refused: it arrives from a
        // link, and an old link should show the list.
        $when = in_array($request->string('when')->value(), ['open', 'closed', 'upcoming', 'all'], true)
            ? $request->string('when')->value()
            : 'open';

        $query = Tender::query()
            ->published()
            ->with('category')
            ->when($term !== '', fn (Builder $q) => $q->search(mb_substr($term, 0, 100)))
            ->when($request->filled('category'), fn (Builder $q) => $q->whereHas(
                'category', fn (Builder $c) => $c->where('slug', $request->string('category')->value()),
            ))
            ->when($when === 'open', fn (Builder $q) => $q->open())
            ->when($when === 'closed', fn (Builder $q) => $q->closed())
            ->when($when === 'upcoming', fn (Builder $q) => $q->upcoming());

        // Open first, then closed — and the two want opposite directions, so
        // they are two keys rather than one: a deadline still to come is
        // useful soonest-first, and one that has passed is useful
        // newest-first. Each key is null for the other group, and the first
        // key has already separated them, so the nulls never interleave.
        $now = now()->toDateTimeString();

        $tenders = $query
            ->orderByRaw('CASE WHEN tenders.closes_at > ? THEN 0 ELSE 1 END', [$now])
            ->orderByRaw('CASE WHEN tenders.closes_at > ? THEN tenders.closes_at END ASC', [$now])
            ->orderByRaw('CASE WHEN tenders.closes_at <= ? THEN tenders.closes_at END DESC', [$now])
            ->orderBy('tenders.id')
            ->paginate(min(max($request->integer('per_page', 20), 1), 100))
            ->withQueryString();

        // One query for the whole page's documents, not one per row — the
        // resource asks for each tender's count, and `DownloadFiles::prime()`
        // exists for exactly this shape of N+1.
        TenderDocuments::prime($tenders->getCollection());

        return TenderResource::collection($tenders);
    }

    /**
     * The categories that have something in them, in order, each with how
     * many. A plain collection, 200 when empty — the page's filter row.
     *
     * Only categories holding a published tender, the downloads centre's
     * rule: a filter that can only ever return nothing is worse than an
     * absent one, because a reader takes an empty result for "they have none
     * of those" rather than "that filter was never going to match".
     */
    public function categories(): JsonResponse
    {
        $counts = Tender::query()->published()
            ->whereNotNull('tenders.tender_category_id')
            ->selectRaw('tenders.tender_category_id as id, COUNT(*) as n')
            ->groupBy('tenders.tender_category_id')
            ->pluck('n', 'id');

        $categories = TenderCategory::query()->active()->ordered()
            ->whereIn('id', $counts->keys())
            ->get()
            ->map(fn (TenderCategory $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'slug' => $c->slug,
                'description' => $c->description,
                'count' => (int) $counts[$c->id],
            ]);

        return response()->json([
            'data' => $categories->values(),
            'meta' => [
                'total' => Tender::query()->published()->count(),
                'open' => Tender::query()->published()->open()->count(),
                // The newest change, for the sitemap's `lastmod`.
                'updated_at' => Tender::query()->published()->max('tenders.updated_at'),
            ],
        ]);
    }

    public function show(string $slug): TenderDetailResource
    {
        return $this->present($this->published($slug));
    }

    /**
     * One tender, loaded and marked as the page.
     *
     * Public, and called by `/preview/{token}` as well as by `show()` — so a
     * field added to the page is in the preview without anybody remembering
     * to add it, and the two cannot drift. The events' pattern.
     */
    public function present(Tender $tender): TenderDetailResource
    {
        $tender->load(['seo', 'category']);

        return (new TenderDetailResource($tender))->withSchema();
    }

    /**
     * Whether a bid can be submitted right now, asked by the page's badge
     * after it mounts.
     *
     * `no-store`, because this is the answer the cached page cannot give.
     */
    public function state(string $slug): JsonResponse
    {
        return response()
            ->json(['data' => TenderWindow::for($this->published($slug))->toArray()])
            ->header('Cache-Control', 'no-store');
    }

    /**
     * A published tender by slug, or a 404.
     *
     * Bound in the method rather than by route-model binding, because
     * `tender-categories` shares the prefix and a model-bound `{slug}` would
     * have to be declared below it anyway.
     */
    private function published(string $slug): Tender
    {
        return Tender::query()->published()->where('tenders.slug', $slug)->firstOrFail();
    }
}
