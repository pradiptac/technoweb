<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Store\CategoryResource;
use App\Http\Resources\Store\ProductResource;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Support\EntityLinks;
use App\Support\Store\ProductFeed;
use App\Support\Store\SpecFilter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The shop, unauthenticated.
 *
 * Separate from `CatalogueController`, which serves the marketing catalogue —
 * the two lists are maintained separately and this is the endpoint that says
 * so. Nothing here reads `products`.
 */
class StoreController extends Controller
{
    /**
     * `?sort=` is a whitelist of three, and an unrecognised value falls back
     * rather than returning 422 — the rule the catalogue already follows. A
     * sort parameter is the kind of thing that arrives mangled from an old
     * bookmark, and an error page is a worse answer than the shop's own order.
     */
    private const SORTS = ['featured', 'price-low', 'price-high', 'name', 'newest'];

    public function products(Request $request): AnonymousResourceCollection
    {
        $sort = in_array($request->query('sort'), self::SORTS, true)
            ? $request->query('sort')
            : 'featured';

        // `?spec[Ports][]=24 ports` — OR within a label, AND across labels,
        // labels nothing carries ignored (2026-09-26). See `SpecFilter`.
        $specs = SpecFilter::parse($request->query('spec'));

        $products = StoreProduct::query()
            ->published()
            /*
             * `variations` is eager-loaded on the index too, and it is not
             * over-fetching: a card says whether the thing can be bought, and
             * once a product has variations that answer belongs to them. Without
             * it every card either lazy-loads — which throws — or falls back to
             * the product's own counter and reports "out of stock" for a switch
             * with four 48-port units on the shelf.
             */
            ->with(['category', 'brand', 'variations', 'seo'])
            ->when($request->filled('category'), fn ($q) => $q->whereHas(
                'category', fn ($c) => $c->where('slug', $request->string('category'))
            ))
            ->when($request->filled('brand'), fn ($q) => $q->whereHas(
                'brand', fn ($b) => $b->where('slug', $request->string('brand'))
            ))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')))
            ->when($specs !== [], fn ($q) => SpecFilter::apply($q, $specs))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('sku', 'like', "%{$term}%")
                    ->orWhere('short_description', 'like', "%{$term}%")
                    // The manufacturer is rarely in the product's own name --
                    // "6100 48G Switch" is an Aruba and nothing in that string
                    // says so. Searching hardware by brand is the first thing
                    // this audience tries.
                    ->orWhereHas('brand', fn ($b) => $b->where('name', 'like', "%{$term}%")));
            })
            ->when($sort === 'featured', fn ($q) => $q->orderByDesc('is_featured')->orderBy('sort_order'))
            ->when($sort === 'price-low', fn ($q) => $q->orderBy('price_paise'))
            ->when($sort === 'price-high', fn ($q) => $q->orderByDesc('price_paise'))
            ->when($sort === 'newest', fn ($q) => $q->orderByDesc('created_at'))
            // Every ordering ends on name so the sequence is total: without a
            // tiebreak a page boundary can show one row twice and hide another,
            // because MySQL is free to order equal rows differently between two
            // queries and need not pick the same one twice.
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 24), 60))
            ->withQueryString();

        return ProductResource::collection($products);
    }

    /**
     * The shop as a shopping feed, for Google Merchant Center.
     *
     * Data, not markup. `/store/feed.xml` on the frontend renders the RSS,
     * because that is where the XML escaper lives and escaping belongs at the
     * sink — the same boundary `JsonLd` keeps for structured data, and for the
     * same reason: a product legitimately named `A <> B` must not be able to
     * close the document.
     *
     * Its own endpoint rather than a wider `/store/products`. The feed needs the
     * full `description`, which the storefront index deliberately withholds
     * because building a list of cards has no use for the HTML and the cost
     * grows with every product. The alternative was one API call per product.
     *
     * Paginated at a hundred, so a catalogue that grows does not turn into one
     * unbounded response. The caller walks the pages, exactly as `sitemap.ts`
     * already does for these same records.
     */
    public function feed(Request $request): JsonResponse
    {
        $products = StoreProduct::query()
            ->published()
            ->with(['category', 'brand', 'variations'])
            ->orderBy('id')
            ->paginate(min($request->integer('per_page', 100), 200))
            ->withQueryString();

        $built = ProductFeed::build(collect($products->items()));

        return response()->json([
            'data' => $built['items'],
            'meta' => [
                'current_page' => $products->currentPage(),
                'last_page' => $products->lastPage(),
                'per_page' => $products->perPage(),
                'total' => $products->total(),

                /*
                 * What was left out of this page and why.
                 *
                 * "Nothing in the feed" from a shop holding forty products reads
                 * as a broken feature — the argument `meta.skipped_locations`
                 * already makes on the landing-page opportunities screen.
                 * `problems` is the half somebody can act on; `skipped` counts
                 * the deliberate exclusions beside it so the two are never
                 * confused for each other.
                 */
                'problems' => $built['problems'],
                'skipped' => $built['skipped'],
            ],
        ]);
    }

    public function product(StoreProduct $storeProduct): JsonResource
    {
        abort_unless($storeProduct->status?->value === 'published', 404);

        $storeProduct->load(['category', 'brand', 'variations', 'services', 'faqs', 'publishedAnswerBlocks', 'seo']);

        // What the page lists beside it: up to six others from the same
        // category, the storefront's own query. Set as a relation so the
        // graph's `isRelatedTo` reads it through `relationLoaded` like
        // everything else, and names what the page actually shows.
        $storeProduct->setRelation('relatedProducts', $storeProduct->store_category_id
            ? StoreProduct::query()->published()
                ->where('store_category_id', $storeProduct->store_category_id)
                ->whereKeyNot($storeProduct->getKey())
                ->orderByDesc('is_featured')->orderBy('sort_order')->orderBy('name')
                ->limit(6)->get()
            : $storeProduct->newCollection());
        EntityLinks::attach($storeProduct);

        return (new ProductResource($storeProduct))->withSchema();
    }

    /**
     * Only categories that have something in them.
     *
     * A facet that can only ever return an empty result is worse than an absent
     * one: the visitor reads the empty page as "they do not sell this" rather
     * than "that filter was never going to match". Same rule `/brands` follows.
     */
    public function categories(): AnonymousResourceCollection
    {
        $categories = StoreCategory::query()
            ->where('is_active', true)
            // `seo`, so `sitemap_include` reaches the frontend's sitemap
            // generator -- without it every category was unconditionally
            // indexed, whatever an SEO manager had switched off.
            ->with('seo')
            ->withCount(['products' => fn ($q) => $q->published()])
            ->having('products_count', '>', 0)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return CategoryResource::collection($categories);
    }

    /**
     * The category's specification filters: for each label it offers, the
     * values its published products carry and how many products each would
     * leave under the *other* choices in `?spec` (2026-09-26).
     *
     * Unfiltered, the answer is cached for five minutes; with a selection it
     * is counted fresh every time — a combination somebody ticked is a
     * user's query, never a cache key. An empty `data` is the ordinary answer
     * for a category with no filters chosen, in a 200, so the frontend's own
     * fetch cache can hold it (the `/menus/*` lesson).
     */
    public function facets(Request $request, StoreCategory $storeCategory): JsonResponse
    {
        abort_unless($storeCategory->is_active, 404);

        $selected = SpecFilter::parse($request->query('spec'));

        return response()->json([
            'data' => SpecFilter::facets($storeCategory, $selected),
            'meta' => [
                'category' => $storeCategory->slug,
                'filtered' => $selected !== [],
            ],
        ]);
    }

    public function category(StoreCategory $storeCategory): JsonResource
    {
        abort_unless($storeCategory->is_active, 404);

        $storeCategory->loadCount(['products' => fn ($q) => $q->published()])
            ->load(['faqs', 'publishedAnswerBlocks', 'seo']);
        EntityLinks::attach($storeCategory);

        // `withSchema()` marks it as the page for `entity` and `faq_schema`.
        return (new CategoryResource($storeCategory))->withSchema();
    }
}
