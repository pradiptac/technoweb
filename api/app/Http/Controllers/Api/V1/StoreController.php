<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Store\CategoryResource;
use App\Http\Resources\Store\ProductResource;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
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

    public function product(StoreProduct $storeProduct): JsonResource
    {
        abort_unless($storeProduct->status?->value === 'published', 404);

        $storeProduct->load(['category', 'brand', 'variations', 'seo']);

        return new ProductResource($storeProduct);
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
            ->withCount(['products' => fn ($q) => $q->published()])
            ->having('products_count', '>', 0)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return CategoryResource::collection($categories);
    }

    public function category(StoreCategory $storeCategory): JsonResource
    {
        abort_unless($storeCategory->is_active, 404);

        return new CategoryResource($storeCategory->loadCount(['products' => fn ($q) => $q->published()]));
    }
}
