<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\LandingPageKind;
use App\Http\Controllers\Controller;
use App\Http\Resources\LandingPageResource;
use App\Models\LandingPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Landing pages, as the public site reads them.
 *
 * **Resolved by path, in one lookup.** `/products/[slug]` has to try the
 * category endpoint and then the product endpoint because two kinds of record
 * share one URL segment, and that resolution order is a documented cost in this
 * project. Here the database owns the whole path, so there is nothing to guess:
 * one indexed column, one query, and a page can be re-pointed at a different
 * pair without its URL moving.
 *
 * **Only published pages exist here.** A draft 404s rather than rendering with
 * a noindex, because a draft landing page is by definition one that has not
 * passed the quality gate — and the entire premise of the module is that those
 * never become URLs. Something that answers 200 is something that gets linked,
 * shared and crawled regardless of what its meta tags say.
 */
class LandingPageController extends Controller
{
    /**
     * Every published landing page, for the two index screens and the sitemap.
     *
     * A plain collection rather than a paginator. The set is bounded by design
     * — `LandingPageQuality` refuses to publish past a configured cap — so
     * paginating it would add a round trip to every consumer to solve a problem
     * that cannot occur.
     */
    public function index(Request $request): JsonResponse
    {
        $kind = LandingPageKind::tryFrom((string) $request->string('kind'));

        $pages = LandingPage::query()
            ->published()
            ->when($kind, fn ($q) => $q->where('kind', $kind->value))
            ->with(['brand', 'location'])
            ->orderBy('title')
            ->get();

        return response()->json([
            'data' => $pages->map(fn (LandingPage $p) => [
                'path' => $p->path,
                'kind' => $p->kind?->value,
                'title' => $p->title,
                'heading' => $p->heading,
                'brand' => $p->brand?->only(['name', 'slug']),
                /*
                 * Spelled out rather than `only([... 'state'])`. The state is
                 * derived from the tree, so it is not an attribute — asking for
                 * it by name sends Eloquent looking for a relationship and
                 * throws. See Location::stateAncestor().
                 */
                'location' => $p->location ? [
                    'name' => $p->location->name,
                    'slug' => $p->location->slug,
                    'state' => $p->location->stateAncestor()?->name,
                ] : null,
                'updated_at' => $p->updated_at?->toIso8601String(),
            ])->all(),
        ]);
    }

    /**
     * One page by its full path.
     *
     * `?path=` rather than a wildcard segment, the same shape as
     * `/redirects/lookup` — a path contains slashes, and a route parameter that
     * has to be told to accept them is a route that will one day accept one it
     * should not.
     */
    public function lookup(Request $request): JsonResponse
    {
        $path = '/'.trim((string) $request->string('path'), '/');

        $page = LandingPage::query()->published()->withContext()->where('path', $path)->first();

        abort_if(! $page, 404);

        // The products this page is about, attached under the name the resource
        // renders. Not a real relation — which products belong here depends on
        // the kind, and Eloquent cannot branch on a column of its own row.
        $page->setRelation('relatedProducts', $page->evidenceProducts());

        return response()->json(['data' => new LandingPageResource($page)]);
    }
}
