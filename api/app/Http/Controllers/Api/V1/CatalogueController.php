<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\BrandResource;
use App\Http\Resources\ProductCategoryResource;
use App\Http\Resources\ProductResource;
use App\Models\Brand;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Solution;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

class CatalogueController extends Controller
{
    /**
     * Orderings a visitor can ask for, and what each one means in SQL.
     *
     * A whitelist rather than a column name off the query string, for the
     * obvious reason — but also so an unrecognised value falls back to the
     * catalogue's own order instead of erroring. A sort parameter is the kind
     * of thing that arrives mangled from an old bookmark, and a 422 on a
     * browse page is a worse answer than the default ordering.
     */
    private const SORTS = ['featured', 'name', 'newest'];

    public function products(Request $request): AnonymousResourceCollection
    {
        $sort = in_array($request->query('sort'), self::SORTS, true)
            ? $request->query('sort')
            : 'featured';

        $products = Product::query()
            ->published()
            ->with(['brand', 'category', 'seo'])
            ->when($request->filled('category'), fn ($q) => $q->whereHas(
                'category', fn ($c) => $c->where('slug', $request->string('category'))
            ))
            ->when($request->filled('brand'), fn ($q) => $q->whereHas(
                'brand', fn ($b) => $b->where('slug', $request->string('brand'))
            ))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('sku', 'like', "%{$term}%")
                    ->orWhere('short_description', 'like', "%{$term}%")
                    // The manufacturer's name is rarely in the product's own —
                    // "6100 48G Switch" is an Aruba, and nothing in that string
                    // says so. Searching a catalogue by brand is the first thing
                    // this audience tries, and it returned nothing.
                    ->orWhereHas('brand', fn ($b) => $b->where('name', 'like', "%{$term}%")));
            })
            // Every ordering ends on name so the sequence is total: without
            // it, a page boundary can show the same row twice and hide
            // another, because MySQL is free to return equal rows in any
            // order and does not have to pick the same one twice.
            ->when($sort === 'featured', fn ($q) => $q
                ->orderByDesc('is_featured')->orderBy('sort_order'))
            ->when($sort === 'newest', fn ($q) => $q->orderByDesc('created_at'))
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 24), 60))
            ->withQueryString();

        return ProductResource::collection($products);
    }

    public function product(Product $product): JsonResource
    {
        abort_unless($product->status?->value === 'published', 404);

        $product->load(['brand', 'category', 'solutions', 'relatedProducts.brand', 'faqs', 'seo']);

        return new ProductResource($product);
    }

    public function categories(Request $request): AnonymousResourceCollection
    {
        $categories = ProductCategory::query()
            ->whereNull('parent_id')
            // See ContentController: ?in_menu=1 narrows an index to what the
            // mega menu may show, without narrowing the catalogue behind it.
            ->when($request->boolean('in_menu'), fn ($q) => $q->where('show_in_menu', true))
            ->with(['children', 'seo'])
            ->withCount(['products' => fn ($q) => $q->published()])
            ->orderBy('sort_order')
            ->get();

        return ProductCategoryResource::collection($categories);
    }

    public function category(ProductCategory $category): JsonResource
    {
        $category->load(['children', 'seo']);
        $category->loadCount(['products' => fn ($q) => $q->published()]);

        // The solutions this category's hardware is actually deployed in.
        //
        // A category has no solutions of its own — the relation lives on the
        // product — so this is the distinct set across everything published
        // in it. It is the one cross-link a category listing can offer that
        // is not just more of the same hardware: someone looking at switches
        // is usually part-way through a networking project, not shopping.
        $category->setRelation('relatedSolutions', Solution::query()
            ->published()
            ->whereHas('products', fn ($q) => $q
                ->published()
                ->where('product_category_id', $category->id))
            ->orderBy('sort_order')
            ->orderBy('title')
            ->limit(6)
            ->get());

        return new ProductCategoryResource($category);
    }

    /**
     * Brands that have something published, for the catalogue's filter.
     *
     * Restricted to brands with a published product on purpose: a facet that
     * returns nothing is worse than an absent one, because the visitor reads
     * the empty result as "you do not carry this" rather than "that filter
     * was never going to match".
     */
    public function brands(): AnonymousResourceCollection
    {
        $brands = Brand::query()
            ->whereHas('products', fn ($q) => $q->published())
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return BrandResource::collection($brands);
    }
}
